/** One poem (modern or classic) with its ≤140-char revise box. */
export default function PoemPanel({
  title,
  poem,
  text,
  setText,
  busy,
  disabled,
  onRun,
}: {
  title: string
  poem: string
  text: string
  setText: (v: string) => void
  busy: boolean
  disabled: boolean
  onRun: (instruction: string) => void
}) {
  return (
    <section className="card poem-card">
      <h2>{title}</h2>
      <div className="poem">{poem || (busy ? '吟咏中…' : '（报告生成后自动成诗）')}</div>
      <div className="revise">
        <input
          maxLength={140}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="修改意见(≤140字),如:重点写《极乐迪斯科》"
          onKeyDown={(e) => e.key === 'Enter' && onRun(text.trim())}
        />
        <button onClick={() => onRun(text.trim())} disabled={disabled}>
          {busy ? '重写中…' : poem ? '按意见重写' : '生成'}
        </button>
      </div>
    </section>
  )
}
