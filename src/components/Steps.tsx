export const STEPS = ['① LLM 接口', '② 游玩数据', '③ 你的信息', '④ 生涯报告']

/** The clickable step indicator across the top of the wizard. */
export default function Steps({
  step,
  setStep,
  canResult,
}: {
  step: number
  setStep: (i: number) => void
  canResult: boolean
}) {
  return (
    <nav className="steps">
      {STEPS.map((label, i) => (
        <button
          key={i}
          className={'stepchip' + (i === step ? ' on' : '') + (i < step ? ' done' : '')}
          onClick={() => {
            if (i === 3 && !canResult) return
            setStep(i)
          }}
          disabled={i === 3 && !canResult}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
