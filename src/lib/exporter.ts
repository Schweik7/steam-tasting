/** Export & share helpers for the generated report. */
import type { Game, Profile } from '../types'

function ts(): string {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export function downloadMarkdown(md: string) {
  triggerDownload(md, `game-tasting-${ts()}.md`, 'text/markdown;charset=utf-8')
}

const REPORT_CSS = `body{max-width:820px;margin:40px auto;padding:0 24px;
  font-family:-apple-system,"Segoe UI",Roboto,"Microsoft YaHei",sans-serif;line-height:1.7;color:#1a1a1a}
h1{font-size:28px;border-bottom:2px solid #eee;padding-bottom:10px}
h2{font-size:21px;margin-top:30px;color:#1b6e9b}
table{border-collapse:collapse;width:100%;margin:14px 0}
th,td{border:1px solid #ddd;padding:8px 11px;text-align:left}
th{background:#f3f6f9}
blockquote{border-left:4px solid #66c0f4;margin:14px 0;padding:8px 16px;background:#f5fbff}
code{background:#f0f0f0;padding:2px 6px;border-radius:4px}
footer{margin-top:40px;color:#999;font-size:13px}`

/** Export a self-contained HTML file from the already-rendered report DOM. */
export function downloadHtml(renderedHtml: string) {
  const doc = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>玩家品味鉴定报告</title><style>${REPORT_CSS}</style></head>
<body>${renderedHtml}
<footer>由 Game Tasting 生成 · ${new Date().toLocaleString()}</footer>
</body></html>`
  triggerDownload(doc, `game-tasting-${ts()}.html`, 'text/html;charset=utf-8')
}

export async function copyMarkdown(md: string): Promise<void> {
  await navigator.clipboard.writeText(md)
}

/** Build a games.json compatible with steam_export.py (so it can be re-uploaded). */
export function downloadGamesJson(games: Game[], profile: Profile | null) {
  const played = games.filter((g) => g.hours > 0)
  const out = {
    exported_at: new Date().toISOString(),
    steamid64: profile?.steamid ?? '',
    source: 'web',
    summary: {
      games_owned: games.length,
      games_played: played.length,
      games_never_played: games.length - played.length,
      total_playtime_hours: Math.round(played.reduce((s, g) => s + g.hours, 0) * 10) / 10,
    },
    games: games.map((g) => ({
      appid: g.appid,
      name: g.name,
      playtime_hours: g.hours,
      playtime_minutes: Math.round(g.hours * 60),
      playtime_2weeks_min: g.w2,
      last_played: g.last_played,
    })),
  }
  triggerDownload(JSON.stringify(out, null, 2), `games-${ts()}.json`, 'application/json;charset=utf-8')
}

function csvCell(v: string | number): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Build a games.csv with the same columns steam_export.py emits. */
export function downloadGamesCsv(games: Game[]) {
  const head = ['name', 'playtime_hours', 'last_played', 'playtime_2weeks_min', 'appid']
  const rows = games.map((g) =>
    [g.name, g.hours, g.last_played, g.w2, g.appid].map(csvCell).join(','),
  )
  // BOM so Excel reads UTF-8 correctly.
  triggerDownload('﻿' + [head.join(','), ...rows].join('\n'), `games-${ts()}.csv`, 'text/csv;charset=utf-8')
}

/** Build a multi-sheet .xlsx (summary + games) via SheetJS (lazy-loaded). */
export async function downloadGamesXlsx(games: Game[], profile: Profile | null) {
  const XLSX = await import('xlsx')
  const played = games.filter((g) => g.hours > 0)
  const totalHours = Math.round(played.reduce((s, g) => s + g.hours, 0) * 10) / 10

  const summary = [
    ['导出时间', new Date().toLocaleString()],
    ['SteamID64', profile?.steamid ?? ''],
    ['玩家', profile?.name ?? ''],
    ['纳入游戏数', games.length],
    ['玩过', played.length],
    ['从未玩', games.length - played.length],
    ['总时长(小时)', totalHours],
  ]

  const rows = games.map((g) => ({
    游戏: g.name,
    '时长(小时)': g.hours,
    最后游玩: g.last_played,
    '近2周(分钟)': g.w2,
    appid: g.appid,
  }))

  const wb = XLSX.utils.book_new()
  const wsSummary = XLSX.utils.aoa_to_sheet(summary)
  wsSummary['!cols'] = [{ wch: 16 }, { wch: 28 }]
  const wsGames = XLSX.utils.json_to_sheet(rows)
  wsGames['!cols'] = [{ wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, wsSummary, '统计')
  XLSX.utils.book_append_sheet(wb, wsGames, '游戏')
  XLSX.writeFile(wb, `games-${ts()}.xlsx`)
}

/** Native share when available (mobile/secure context), else copy fallback. */
export async function shareReport(md: string): Promise<'shared' | 'copied'> {
  const nav = navigator as Navigator & {
    share?: (data: { title?: string; text?: string }) => Promise<void>
  }
  if (nav.share) {
    await nav.share({ title: '我的玩家品味鉴定报告', text: md })
    return 'shared'
  }
  await navigator.clipboard.writeText(md)
  return 'copied'
}
