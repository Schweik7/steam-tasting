import type { Settings } from '../types'
import { SYSTEM_PROMPT, buildUserMessage } from './prompt'
import type { Game } from '../types'

export interface StreamHandlers {
  onDelta: (chunk: string) => void
  onStatus?: (msg: string) => void
  signal?: AbortSignal
}

/** Call an OpenAI-compatible /chat/completions endpoint with streaming. */
export async function streamTastingReport(
  games: Game[],
  s: Settings,
  h: StreamHandlers,
): Promise<void> {
  const base = s.base.trim().replace(/\/+$/, '')
  const url = base.endsWith('/chat/completions') ? base : base + '/chat/completions'
  h.onStatus?.('连接 ' + url + ' …')

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + s.key.trim(),
    },
    signal: h.signal,
    body: JSON.stringify({
      model: s.model.trim(),
      temperature: s.temp || 0.8,
      stream: true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(games, s) },
      ],
    }),
  })

  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`HTTP ${resp.status} ${body.slice(0, 300)}`)
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
