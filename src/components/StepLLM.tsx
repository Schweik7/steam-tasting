import type { Settings } from '../types'
import { checkInvite } from '../lib/api'

/** Step ①: OpenAI-compatible LLM endpoint + optional invite code. */
export default function StepLLM({
  settings,
  set,
  inviteValid,
  setInviteValid,
  onEgg,
  onNext,
}: {
  settings: Settings
  set: <K extends keyof Settings>(k: K, v: Settings[K]) => void
  inviteValid: boolean
  setInviteValid: (v: boolean) => void
  onEgg: () => void
  onNext: () => void
}) {
  return (
    <section className="card">
      <h2>① LLM 接口设置</h2>
      <div className="row">
        <div>
          <label>API Base(OpenAI 兼容)</label>
          <input
            value={settings.base}
            onChange={(e) => set('base', e.target.value)}
            placeholder="https://api.deepseek.com/v1"
          />
        </div>
        <div>
          <label>模型 Model</label>
          <input
            value={settings.model}
            onChange={(e) => set('model', e.target.value)}
            placeholder="deepseek-v4-flash / deepseek-chat / ..."
          />
        </div>
      </div>
      <label>API Key</label>
      <input
        type="password"
        value={settings.key}
        onChange={(e) => set('key', e.target.value)}
        placeholder="sk-..."
      />
      <p className="hint">
        保存在本机浏览器(localStorage)。生成报告时,这些设置会发给本应用后端,
        由后端构建提示词并代你调用该 LLM 接口(因此不受浏览器跨域限制)。
      </p>

      <label>MagicVal(邀请码,选填)</label>
      <input
        value={settings.magicVal}
        onChange={(e) => {
          const v = e.target.value
          set('magicVal', v)
          checkInvite(v).then((ok) => {
            setInviteValid(ok)
            if (ok) onEgg()
          })
        }}
        placeholder="有邀请码?填它就能免填上面的 API"
      />
      {inviteValid && (
        <p className="hint" style={{ color: 'var(--ok)' }}>
          ✓ 邀请码有效,将使用我们的 API,上面的 API 配置可留空。诗歌会用更强的模型生成。
        </p>
      )}

      <details>
        <summary>高级选项</summary>
        <div className="grid2">
          <div>
            <label>取时长前 N 名</label>
            <input
              type="number"
              min={5}
              max={200}
              value={settings.topn}
              onChange={(e) => set('topn', +e.target.value)}
            />
          </div>
          <div>
            <label>Temperature</label>
            <input
              type="number"
              step={0.1}
              min={0}
              max={2}
              value={settings.temp}
              onChange={(e) => set('temp', +e.target.value)}
            />
          </div>
          <div>
            <label>语言</label>
            <select
              value={settings.lang}
              onChange={(e) => set('lang', e.target.value as Settings['lang'])}
            >
              <option value="中文">中文</option>
              <option value="English">English</option>
            </select>
          </div>
          <div>
            <label>风格</label>
            <select value={settings.style} onChange={(e) => set('style', e.target.value)}>
              <option value="专业且带适度幽默">专业 + 适度幽默</option>
              <option value="温和鼓励为主">温和鼓励</option>
              <option value="毒舌犀利但不刻薄">毒舌犀利</option>
            </select>
          </div>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.blind}
            onChange={(e) => set('blind', e.target.checked)}
          />
          附带"买了从未玩"的盲点列表(节选)用于推荐
        </label>
      </details>

      <div className="navrow">
        <span />
        <button onClick={onNext}>下一步:游玩数据 →</button>
      </div>
    </section>
  )
}
