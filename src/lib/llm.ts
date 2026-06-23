import type { Settings, Game, Profile } from '../types'
import { poemUrl, reportUrl, reviseUrl } from './api'

export interface StreamHandlers {
  onDelta: (chunk: string) => void
  onStatus?: (msg: string) => void
  signal?: AbortSignal
}

/** LLM config fields the backend needs to pick / call the model. */
function llmFields(s: Settings) {
  return { base: s.base, model: s.model, key: s.key, temp: s.temp, magicVal: s.magicVal }
}

/**
 * POST a JSON body and parse the OpenAI-style SSE the backend streams back.
 * The prompt is built server-side; here we only reassemble the text deltas.
 */
async function streamSSE(url: string, body: unknown, h: StreamHandlers): Promise<void> {
  const resp = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    signal: h.signal,
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const b = await resp.json().catch(() => ({}))
    throw new Error(b.message || `生成失败 (HTTP ${resp.status})`)
  }
  if (!resp.body) throw new Error('无响应流')

  const reader = resp.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') return
      try {
        const j = JSON.parse(data)
        const delta: string =
          j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? ''
        if (delta) h.onDelta(delta)
      } catch {
        /* ignore keep-alive / partial lines */
      }
    }
  }
}

/** Generate the game-career report from the (selected) games. */
export function streamReport(
  games: Game[],
  s: Settings,
  profile: Profile | null,
  h: StreamHandlers,
): Promise<void> {
  h.onStatus?.('连接后端生成报告 …')
  return streamSSE(
    reportUrl(),
    {
      ...llmFields(s),
      topn: s.topn,
      lang: s.lang,
      style: s.style,
      blind: s.blind,
      age: s.age,
      gender: s.gender,
      highschool: s.highschool,
      university: s.university,
      extra: s.extra,
      playerName: profile?.name ?? '',
      playerAvatar: profile?.avatar ?? '',
      games,
    },
    h,
  )
}

/** Rewrite the report given the player's ≤140-char feedback. */
export function streamRevise(
  current: string,
  instruction: string,
  s: Settings,
  h: StreamHandlers,
): Promise<void> {
  h.onStatus?.('根据你的意见重写 …')
  return streamSSE(reviseUrl(), { ...llmFields(s), current, instruction }, h)
}

/** Write a poem (modern | classic) from the report, optionally with feedback. */
export function streamPoem(
  kind: 'modern' | 'classic',
  report: string,
  instruction: string,
  s: Settings,
  h: StreamHandlers,
): Promise<void> {
  return streamSSE(poemUrl(), { ...llmFields(s), kind, report, instruction }, h)
}
