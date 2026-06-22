import { useEffect, useMemo, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Game, Profile, Settings } from './types'
import { normalizeGames, parseFile } from './lib/parse'
import { streamTastingReport } from './lib/llm'
import { fetchMe, logout, steamLoginUrl } from './lib/api'
import { useLocalStorage } from './hooks/useLocalStorage'
import {
  copyMarkdown,
  downloadHtml,
  downloadMarkdown,
  shareReport,
} from './lib/exporter'

const DEFAULT_SETTINGS: Settings = {
  base: '',
  model: '',
  key: '',
  topn: 40,
  temp: 0.8,
  lang: '中文',
  style: '专业且带适度幽默',
  blind: true,
}

export default function App() {
  const [settings, setSettings] = useLocalStorage<Settings>('gt_settings', DEFAULT_SETTINGS)
  const [games, setGames] = useState<Game[] | null>(null)
  const [source, setSource] = useState('')
  const [report, setReport] = useState('')
  const [status, setStatus] = useState<{ msg: string; kind: 'info' | 'err' | 'ok' }>({
    msg: '',
    kind: 'info',
  })
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setSettings((s) => ({ ...s, [k]: v }))

  // On load, ask the backend whether we're already logged in via Steam.
  useEffect(() => {
    fetchMe()
      .then((me) => {
        if (!me) return
        setProfile(me.profile)
        if (me.gamesPrivate) {
          setStatus({
            msg: '已登录,但读不到游戏库。请把 Steam 资料的「游戏详情」隐私设为公开后刷新。',
            kind: 'err',
          })
        } else {
          setGames(normalizeGames(me.games))
          setSource('Steam:' + me.profile.name)
        }
      })
      .catch((e: Error) => setStatus({ msg: '后端连接失败:' + e.message, kind: 'err' }))
      .finally(() => setAuthChecked(true))
  }, [])

  async function onLogout() {
    await logout()
    setProfile(null)
    setGames(null)
    setSource('')
    setReport('')
    setStatus({ msg: '已退出登录', kind: 'info' })
  }

  const stats = useMemo(() => {
    if (!games) return null
    const played = games.filter((g) => g.hours > 0)
    const total = Math.round(played.reduce((s, g) => s + g.hours, 0))
    return { owned: games.length, played: played.length, total, top: games.slice(0, 8) }
  }, [games])

  function handleFile(f: File) {
    const r = new FileReader()
    r.onload = () => {
      try {
        const parsed = parseFile(f.name, String(r.result))
        setGames(parsed)
        setSource(f.name)
        setStatus({ msg: '', kind: 'info' })
      } catch (e) {
        setGames(null)
        setStatus({ msg: '解析失败:' + (e as Error).message, kind: 'err' })
      }
    }
    r.readAsText(f)
  }

  async function generate() {
    if (!settings.base || !settings.key || !settings.model) {
      setStatus({ msg: '请先填写 API Base / Key / 模型', kind: 'err' })
      return
    }
    if (!games) {
      setStatus({ msg: '请先上传数据', kind: 'err' })
      return
    }
    setReport('')
    setBusy(true)
    abortRef.current = new AbortController()
    try {
      await streamTastingReport(games, settings, {
        signal: abortRef.current.signal,
        onStatus: (msg) => setStatus({ msg, kind: 'info' }),
        onDelta: (chunk) => {
          setReport((prev) => prev + chunk)
          reportRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
        },
      })
      setStatus({ msg: '✅ 完成', kind: 'ok' })
    } catch (e) {
      const err = e as Error
      if (err.name === 'AbortError') setStatus({ msg: '已停止', kind: 'info' })
      else
        setStatus({
          msg: '出错:' + err.message + '\n(若是 CORS / Failed to fetch,该接口可能不允许浏览器直连)',
          kind: 'err',
        })
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  async function onShare() {
    const r = await shareReport(report)
    setStatus({ msg: r === 'shared' ? '已调起分享' : '已复制到剪贴板', kind: 'ok' })
  }
  async function onCopy() {
    await copyMarkdown(report)
    setStatus({ msg: '已复制 Markdown', kind: 'ok' })
  }

  return (
    <>
      <header>
        <h1>🎮 Game Tasting</h1>
        <p>用 Steam 登录(或上传导出文件) → 填 LLM 接口 → 一键生成玩家品味鉴定报告</p>
      </header>

      <div className="wrap">
        {/* ① LLM settings */}
        <section className="card">
          <h2>① LLM 接口设置</h2>
          <div className="row">
            <div>
              <label>API Base(OpenAI 兼容)</label>
              <input
                value={settings.base}
                onChange={(e) => set('base', e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <div>
              <label>模型 Model</label>
              <input
                value={settings.model}
                onChange={(e) => set('model', e.target.value)}
                placeholder="gpt-4o / deepseek-chat / ..."
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
            仅保存在本机浏览器(localStorage),请求由浏览器直连 API Base,不经任何服务器。
            若遇 CORS 报错,说明该接口不允许浏览器直连,请改用支持 CORS 的中转/代理。
          </p>

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
        </section>

        {/* ② data source: Steam login (primary) or file upload (fallback) */}
        <section className="card">
          <h2>② 获取你的游玩数据</h2>

          {profile ? (
            <div className="profile">
              {profile.avatar && <img src={profile.avatar} alt="" className="avatar" />}
              <div className="profile-meta">
                <b>{profile.name}</b>
                <span className="hint">SteamID {profile.steamid}</span>
              </div>
              <button className="ghost" onClick={onLogout}>
                退出登录
              </button>
            </div>
          ) : (
            <div className="login">
              <a className="steam-login" href={steamLoginUrl()}>
                🎮 用 Steam 登录(自动拉取你的游戏库)
              </a>
              <p className="hint">
                {authChecked
                  ? '点击后跳转 Steam 授权,登录即自动读取你的游戏与时长,无需任何 API Key。需把资料的「游戏详情」隐私设为公开。'
                  : '正在检测登录状态…'}
              </p>
            </div>
          )}

          <details>
            <summary>或:上传 steam_export.py 导出的文件</summary>
          <div
            className={'drop' + (drag ? ' hot' : '')}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])
            }}
          >
            把 <b>games.json</b> 或 <b>games.csv</b> 拖到这里,或<b>点击选择</b>
            <br />
            <span className="hint">由 steam_export.py 生成;也支持纯游戏数组 JSON / 带表头 CSV</span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.csv,.txt"
            hidden
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          </details>
          {stats && (
            <div className="parsed">
              <div>
                <span className="pill ok">已载入 {source}</span>
                <span className="pill">拥有 {stats.owned}</span>
                <span className="pill">玩过 {stats.played}</span>
                <span className="pill">总时长 {stats.total}h</span>
              </div>
              <table className="preview">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>游戏</th>
                    <th>时长(h)</th>
                    <th>最后游玩</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.top.map((g, i) => (
                    <tr key={g.appid || i}>
                      <td>{i + 1}</td>
                      <td>{g.name}</td>
                      <td>{g.hours}</td>
                      <td>{g.last_played || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ③ generate */}
        <section className="card">
          <h2>③ 生成报告</h2>
          <button onClick={generate} disabled={busy || !games}>
            ⚡ 生成品味鉴定报告
          </button>
          {busy && (
            <button className="ghost" onClick={() => abortRef.current?.abort()}>
              停止
            </button>
          )}
          {status.msg && <div className={'status ' + status.kind}>{status.msg}</div>}
        </section>

        {/* report */}
        {report && (
          <>
            <div className="toolbar">
              <button className="ghost" onClick={onCopy}>
                复制 Markdown
              </button>
              <button className="ghost" onClick={() => downloadMarkdown(report)}>
                下载 .md
              </button>
              <button
                className="ghost"
                onClick={() => downloadHtml(reportRef.current?.innerHTML ?? '')}
              >
                导出 .html
              </button>
              <button className="ghost" onClick={onShare}>
                分享
              </button>
            </div>
            <article className="report" ref={reportRef}>
              <Markdown remarkPlugins={[remarkGfm]}>{report}</Markdown>
            </article>
          </>
        )}
      </div>

      <footer className="foot">
        本地运行 · 数据不出本机 · <a href="https://github.com/">Game Tasting</a>
      </footer>
    </>
  )
}
