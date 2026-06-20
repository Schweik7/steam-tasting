/** Export & share helpers for the generated report. */

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
