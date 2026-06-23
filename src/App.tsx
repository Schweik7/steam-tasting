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
  downloadGamesCsv,
  downloadGamesJson,
  downloadGamesXlsx,
  downloadHtml,
  downloadMarkdown,
  shareReport,
} from './lib/exporter'

const DEFAULT_SETTINGS: Settings = {
  base: 'https://api.deepseek.com/v1',
  model: 'deepseek-v4-flash',
  key: '',
  topn: 40,
  temp: 0.8,
  lang: '中文',
  style: '专业且带适度幽默',
  blind: true,
  age: 0,
  gender: '',
}

export default function App() {
  const [settings, setSettings] = useLocalStorage<Settings>('gt_settings_v2', DEFAULT_SETTINGS)
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
  // Games the user has unchecked (excluded from stats / report / export):
  // e.g. titles someone else played on the account, or ones they'd rather hide.
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setSettings((s) => ({ ...s, [k]: v }))

  // Ensure Base/Model show the DeepSeek defaults whenever they're empty
  // (e.g. blank values left in localStorage from an earlier visit). Anyone who
  // typed their own value keeps it.
  useEffect(() => {
    setSettings((s) => ({
      ...s,
      base: s.base || DEFAULT_SETTINGS.base,
      model: s.model || DEFAULT_SETTINGS.model,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const gameKey = (g: Game) => String(g.appid || g.name)

  const selectedGames = useMemo(
    () => (games ? games.filter((g) => !excluded.has(gameKey(g))) : []),
    [games, excluded],
  )

  function loadGames(list: Game[], src: string) {
    setGames(list)
    setSource(src)
    setExcluded(new Set())
    setShowAll(false)
  }

  function toggleGame(g: Game) {
    const k = gameKey(g)
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

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
          loadGames(normalizeGames(me.games), 'Steam:' + me.profile.name)
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
    const played = selectedGames.filter((g) => g.hours > 0)
    const total = Math.round(played.reduce((s, g) => s + g.hours, 0))
    return { owned: games.length, selected: selectedGames.length, played: played.length, total }
  }, [games, selectedGames])

  function handleFile(f: File) {
    const r = new FileReader()
    r.onload = () => {
      try {
        const parsed = parseFile(f.name, String(r.result))
        loadGames(parsed, f.name)
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
    if (!selectedGames.length) {
      setStatus({ msg: '请先登录或上传数据,并至少勾选一款游戏', kind: 'err' })
      return
    }
    setReport('')
    setBusy(true)
    abortRef.current = new AbortController()
    try {
      await streamTastingReport(selectedGames, settings, {
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
          msg: '出错:' + err.message,
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
          {stats && games && (
            <div className="parsed">
              <div>
                <span className="pill ok">已载入 {source}</span>
                <span className="pill">共 {stats.owned}</span>
                <span className="pill">已选 {stats.selected}</span>
                <span className="pill">玩过 {stats.played}</span>
                <span className="pill">总时长 {stats.total}h</span>
              </div>

              <div className="toolbar">
                <button className="ghost" onClick={() => setExcluded(new Set())}>
                  全选
                </button>
                <button
                  className="ghost"
                  onClick={() => setExcluded(new Set(games.map(gameKey)))}
                >
                  全不选
                </button>
                <span style={{ flex: 1 }} />
                <button
                  className="ghost"
                  onClick={() => downloadGamesJson(selectedGames, profile)}
                  disabled={!selectedGames.length}
                >
                  ⬇ JSON
                </button>
                <button
                  className="ghost"
                  onClick={() => downloadGamesCsv(selectedGames)}
                  disabled={!selectedGames.length}
                >
                  ⬇ CSV
                </button>
                <button
                  className="ghost"
                  onClick={() => downloadGamesXlsx(selectedGames, profile)}
                  disabled={!selectedGames.length}
                >
                  ⬇ Excel
                </button>
              </div>

              <table className="preview">
                <thead>
                  <tr>
                    <th></th>
                    <th>#</th>
                    <th>游戏</th>
                    <th>时长(h)</th>
                    <th>最后游玩</th>
                  </tr>
                </thead>
                <tbody>
                  {(showAll ? games : games.slice(0, 8)).map((g, i) => {
                    const on = !excluded.has(gameKey(g))
                    return (
                      <tr key={g.appid || i} className={on ? '' : 'off'}>
                        <td>
                          <input type="checkbox" checked={on} onChange={() => toggleGame(g)} />
                        </td>
                        <td>{i + 1}</td>
                        <td>{g.name}</td>
                        <td>{g.hours}</td>
                        <td>{g.last_played || '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {games.length > 8 && (
                <button className="ghost" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? '收起' : `显示全部 ${games.length} 款`}
                </button>
              )}
            </div>
          )}
        </section>

        {/* ③ generate */}
        <section className="card">
          <h2>③ 生成报告</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            (可选)填上年龄和性别,报告会把每款游戏的游玩时间换算成你当时的人生阶段
            (高中 / 大学…),让时间考古更走心。
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
