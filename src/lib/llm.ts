import type { Settings, Game } from '../types'
import { reportUrl } from './api'

export interface StreamHandlers {
  onDelta: (chunk: string) => void
  onStatus?: (msg: string) => void
  signal?: AbortSignal
}

/**
 * Ask the backend to generate the report. The prompt is built server-side
 * (server/prompt.py) and the LLM call is proxied through our backend, which
 * streams back the OpenAI-style SSE we parse here.
 */
export async function streamTastingReport(
  games: Game[],
  s: Settings,
  h: StreamHandlers,
): Promise<void> {
  h.onStatus?.('连接后端生成报告 …')

  const resp = await fetch(reportUrl(), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    signal: h.signal,
    body: JSON.stringify({
      base: s.base,
      model: s.model,
      key: s.key,
      topn: s.topn,
      temp: s.temp,
      lang: s.lang,
      style: s.style,
      blind: s.blind,
      age: s.age,
      gender: s.gender,
      games,
    }),
  })

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new Error(body.message || `生成失败 (HTTP ${resp.status})`)
  }
  if (!resp.body) throw new Error('无响应流')

  h.onStatus?.('生成中(流式)…')
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
