import type { RefObject } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { shareLink } from '../lib/api'
import { downloadHtml, downloadMarkdown } from '../lib/exporter'
import PoemPanel from './PoemPanel'

type Busy = null | 'report' | 'revise' | 'modern' | 'classic'

/** Step ④: the report panel + two poem panels + share bar. */
export default function Results({
  report,
  poemModern,
  poemClassic,
  shareId,
  reviseText,
  setReviseText,
  modernText,
  setModernText,
  classicText,
  setClassicText,
  busy,
  status,
  reportRef,
  onCopy,
  onShare,
  onCopyLink,
  onRevise,
  onPoem,
  onAbort,
  onBack,
}: {
  report: string
  poemModern: string
  poemClassic: string
  shareId: string
  reviseText: string
  setReviseText: (v: string) => void
  modernText: string
  setModernText: (v: string) => void
  classicText: string
  setClassicText: (v: string) => void
  busy: Busy
  status: { msg: string; kind: 'info' | 'err' | 'ok' }
  reportRef: RefObject<HTMLDivElement | null>
  onCopy: () => void
  onShare: () => void
  onCopyLink: () => void
  onRevise: () => void
  onPoem: (kind: 'modern' | 'classic', instruction: string) => void
  onAbort: () => void
  onBack: () => void
}) {
  return (
    <>
      {status.msg && <div className={'status ' + status.kind}>{status.msg}</div>}

      {shareId && (
        <div className="card sharebar">
          <span>🔗 公开分享链接(任何人可看):</span>
          <input readOnly value={shareLink(shareId)} onFocus={(e) => e.target.select()} />
          <button className="ghost" onClick={onCopyLink}>
            复制
          </button>
          <a className="ghost btnlink" href={shareLink(shareId)} target="_blank" rel="noreferrer">
            打开
          </a>
        </div>
      )}

      <section className="card">
        <div className="paneltop">
          <h2>游戏生涯报告</h2>
          <div className="toolbar">
            <button className="ghost" onClick={onCopy} disabled={!report}>
              复制 MD
            </button>
            <button className="ghost" onClick={() => downloadMarkdown(report)} disabled={!report}>
              .md
            </button>
            <button
              className="ghost"
              onClick={() => downloadHtml(reportRef.current?.innerHTML ?? '')}
              disabled={!report}
            >
              .html
            </button>
            <button className="ghost" onClick={onShare} disabled={!report}>
              分享
            </button>
          </div>
        </div>
        <article className="report" ref={reportRef}>
          <Markdown remarkPlugins={[remarkGfm]}>{report || '_生成中…_'}</Markdown>
        </article>
        <div className="revise">
          <input
            maxLength={140}
            value={reviseText}
            onChange={(e) => setReviseText(e.target.value)}
            placeholder="不满意?给点修改意见(≤140字),例如:多写写我大学时玩的那几款"
            onKeyDown={(e) => e.key === 'Enter' && onRevise()}
          />
          <button onClick={onRevise} disabled={!!busy || !reviseText.trim() || !report}>
            {busy === 'revise' ? '重写中…' : '按意见重写'}
          </button>
        </div>
      </section>

      <div className="poemgrid">
        <PoemPanel
          title="🪶 现代诗"
          poem={poemModern}
          text={modernText}
          setText={setModernText}
          busy={busy === 'modern'}
          disabled={!!busy || !report}
          onRun={(ins) => onPoem('modern', ins)}
        />
        <PoemPanel
          title="📜 古体诗"
          poem={poemClassic}
          text={classicText}
          setText={setClassicText}
          busy={busy === 'classic'}
          disabled={!!busy || !report}
          onRun={(ins) => onPoem('classic', ins)}
        />
      </div>

      <div className="navrow">
        <button className="ghost" onClick={onBack}>
          ← 改信息重新生成
        </button>
        {busy && (
          <button className="ghost" onClick={onAbort}>
            停止
          </button>
        )}
      </div>
    </>
  )
}
