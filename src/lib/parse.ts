import type { Game } from '../types'

/** Normalize a game record from any supported shape into our Game type. */
function normGame(g: Record<string, unknown>): Game {
  const num = (v: unknown): number =>
    typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) || 0 : 0
  const minutes =
    g.playtime_minutes != null
      ? num(g.playtime_minutes)
      : g.playtime_forever != null
        ? num(g.playtime_forever)
        : g.playtime_hours != null
          ? num(g.playtime_hours) * 60
          : 0
  const hours =
    g.playtime_hours != null ? num(g.playtime_hours) : Math.round((minutes / 60) * 10) / 10
  const lastPlayed =
    (g.last_played as string) ||
    (g.rtime_last_played
      ? new Date(num(g.rtime_last_played) * 1000).toISOString().slice(0, 10)
      : '')
  return {
    name: (g.name as string) ?? '',
    hours,
    last_played: lastPlayed,
    w2: num(g.playtime_2weeks_min ?? g.playtime_2weeks),
    appid: (g.appid as string | number) ?? '',
  }
}

/** Normalize an already-parsed array of game records (e.g. from /api/me). */
export function normalizeGames(arr: Record<string, unknown>[]): Game[] {
  const games = arr.map(normGame).filter((g) => g.name)
  games.sort((a, b) => b.hours - a.hours)
  return games
}

export function parseJSON(text: string): Game[] {
  const d = JSON.parse(text)
  let arr: Record<string, unknown>[]
  if (Array.isArray(d)) arr = d
  else if (Array.isArray(d.games)) arr = d.games
  else if (d.response && Array.isArray(d.response.games)) arr = d.response.games // raw steam api
  else throw new Error('找不到 games 数组')
  const games = arr.map(normGame).filter((g) => g.name)
  if (!games.length) throw new Error('游戏列表为空(检查隐私设置是否公开)')
  return games
}

/** Split a single CSV line, handling quoted fields and escaped quotes. */
function splitCSV(line: string): string[] {
  const res: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') {
      res.push(cur)
      cur = ''
    } else cur += ch
  }
  res.push(cur)
  return res
}

export function parseCSV(text: string): Game[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) throw new Error('CSV 为空')
  const head = splitCSV(lines[0]).map((h) => h.trim().toLowerCase())
  const idx = (n: string) => head.indexOf(n)
  const out: Game[] = []
  for (let i = 1; i < lines.length; i++) {
    const c = splitCSV(lines[i])
    out.push(
      normGame({
        name: c[idx('name')] ?? c[0],
        playtime_hours: parseFloat(c[idx('playtime_hours')]) || 0,
        last_played: c[idx('last_played')] || '',
        playtime_2weeks_min: parseInt(c[idx('playtime_2weeks_min')]) || 0,
        appid: c[idx('appid')] || '',
      }),
    )
  }
  const games = out.filter((g) => g.name)
  if (!games.length) throw new Error('CSV 无有效数据')
  return games
}

export function parseFile(name: string, text: string): Game[] {
  const games = name.toLowerCase().endsWith('.csv') ? parseCSV(text) : parseJSON(text)
  games.sort((a, b) => b.hours - a.hours)
  return games
}
