import type { Settings } from '../types'

/** Step ③: optional age / gender / schools / free-text to sharpen the report. */
export default function StepInfo({
  settings,
  set,
  busy,
  canGenerate,
  status,
  onPrev,
  onGenerate,
}: {
  settings: Settings
  set: <K extends keyof Settings>(k: K, v: Settings[K]) => void
  busy: boolean
  canGenerate: boolean
  status: { msg: string; kind: 'info' | 'err' | 'ok' }
  onPrev: () => void
  onGenerate: () => void
}) {
  return (
    <section className="card">
      <h2>③ 你的信息(全部选填)</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        填得越多,报告越精准、越走心。年龄用来把每款游戏的游玩时间换算成你当时的人生阶段
        (高中 / 大学…);学校与补充信息会一并交给 AI 参考。
      </p>
      <div className="row">
        <div>
          <label>年龄</label>
          <input
            type="number"
            min={6}
            max={100}
            value={settings.age || ''}
            placeholder="如 24"
            onChange={(e) => set('age', +e.target.value)}
          />
        </div>
        <div>
          <label>性别</label>
          <select value={settings.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="">不填</option>
            <option value="男">男</option>
            <option value="女">女</option>
            <option value="其他">其他</option>
          </select>
        </div>
      </div>
      <div className="row">
        <div>
          <label>就读中学(选填)</label>
          <input
            value={settings.highschool}
            onChange={(e) => set('highschool', e.target.value)}
            placeholder="如 ××中学"
          />
        </div>
        <div>
          <label>就读大学(选填)</label>
          <input
            value={settings.university}
            onChange={(e) => set('university', e.target.value)}
            placeholder="如 ××大学(没上过可留空)"
          />
        </div>
      </div>
      <label>补充信息(选填,越多越精准)</label>
      <textarea
        className="ta"
        rows={4}
        value={settings.extra}
        onChange={(e) => set('extra', e.target.value)}
        placeholder="例如:某款游戏是和谁一起玩的、某段时间在做什么、最难忘的一局、对某游戏的特殊情感…"
      />

      <div className="navrow">
        <button className="ghost" onClick={onPrev}>
          ← 上一步
        </button>
        <button onClick={onGenerate} disabled={busy || !canGenerate}>
          ⚡ 生成游戏生涯报告
        </button>
      </div>
      {status.msg && <div className={'status ' + status.kind}>{status.msg}</div>}
    </section>
  )
}
