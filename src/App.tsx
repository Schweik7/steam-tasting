import { useEffect, useMemo, useRef, useState } from 'react'
import type { Game, Profile, Settings } from './types'
import { normalizeGames, parseFile } from './lib/parse'
import { streamPoem, streamReport, streamRevise } from './lib/llm'
import { checkInvite, fetchMe, fetchSavedReport, logout, shareLink } from './lib/api'
import { useLocalStorage } from './hooks/useLocalStorage'
import { copyMarkdown, shareReport } from './lib/exporter'
import Steps from './components/Steps'
import StepLLM from './components/StepLLM'
import StepData from './components/StepData'
import StepInfo from './components/StepInfo'
import Results from './components/Results'

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
  highschool: '',
  university: '',
  extra: '',
  magicVal: '',
}

type Busy = null | 'report' | 'revise' | 'modern' | 'classic'

export default function App() {
  const [settings, setSettings] = useLocalStorage<Settings>('gt_settings_v2', DEFAULT_SETTINGS)
  const [step, setStep] = useState(0)
  const [games, setGames] = useState<Game[] | null>(null)
  const [source, setSource] = useState('')
  const [report, setReport] = useState('')
  const [poemModern, setPoemModern] = useState('')
  const [poemClassic, setPoemClassic] = useState('')
  const [shareId, setShareId] = useState('')
  const [reviseText, setReviseText] = useState('')
  const [modernText, setModernText] = useState('')
  const [classicText, setClassicText] = useState('')
  const [status, setStatus] = useState<{ msg: string; kind: 'info' | 'err' | 'ok' }>({
    msg: '',
    kind: 'info',
  })
  const [busy, setBusy] = useState<Busy>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  // Games the user has unchecked (excluded from stats / report / export).
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)
  const [egg, setEgg] = useState(false)
  // Whether the entered invite code is valid — decided by the backend, not here.
  const [inviteValid, setInviteValid] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const reportRef = useRef<HTMLDivElement | null>(null)

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setSettings((s) => ({ ...s, [k]: v }))

  // Backfill DeepSeek defaults when Base/Model are blank, and re-validate any
  // persisted invite code against the backend on load.
  useEffect(() => {
    setSettings((s) => ({
      ...s,
      base: s.base || DEFAULT_SETTINGS.base,
      model: s.model || DEFAULT_SETTINGS.model,
    }))
    if (settings.magicVal) checkInvite(settings.magicVal).then(setInviteValid)
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

  // On load: are we logged in via Steam? If so, pull games + any saved report.
  useEffect(() => {
    fetchMe()
      .then(async (me) => {
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
        const saved = await fetchSavedReport()
        if (saved?.content) {
          setReport(saved.content)
          setPoemModern(saved.poemModern || '')
          setPoemClassic(saved.poemClassic || '')
          setShareId(saved.shareId || '')
          setStep(3) // jump straight to the saved report
          setStatus({ msg: '已载入你上次生成的报告', kind: 'ok' })
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
    setPoemModern('')
    setPoemClassic('')
    setShareId('')
    setStep(0)
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
        loadGames(parseFile(f.name, String(r.result)), f.name)
        setStatus({ msg: '', kind: 'info' })
      } catch (e) {
        setGames(null)
        setStatus({ msg: '解析失败:' + (e as Error).message, kind: 'err' })
      }
    }
    r.readAsText(f)
  }

  function llmReady() {
    return inviteValid || (!!settings.base && !!settings.key && !!settings.model)
  }

  // Generate the report, then write both poems, then capture the share id.
  async function generate() {
    if (!llmReady()) {
      setStep(0)
      setStatus({ msg: '请先填写 API Base / Key / 模型(或输入邀请码)', kind: 'err' })
      return
    }
    if (!selectedGames.length) {
      setStep(1)
      setStatus({ msg: '请先登录或上传数据,并至少勾选一款游戏', kind: 'err' })
      return
    }
    setStep(3)
    setReport('')
    setPoemModern('')
    setPoemClassic('')
    setShareId('')
    setBusy('report')
    abortRef.current = new AbortController()
    try {
      await streamReport(selectedGames, settings, profile, {
        signal: abortRef.current.signal,
        onStatus: (msg) => setStatus({ msg, kind: 'info' }),
        onDelta: (chunk) => {
          setReport((prev) => prev + chunk)
          reportRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
        },
      })
      setStatus({ msg: '报告完成,正在为你写诗…', kind: 'ok' })
      await runPoem('modern', '')
      await runPoem('classic', '')
      if (profile) {
        const saved = await fetchSavedReport()
        if (saved?.shareId) setShareId(saved.shareId)
      }
      setStatus({ msg: '✅ 全部完成', kind: 'ok' })
    } catch (e) {
      reportError(e)
    } finally {
      setBusy(null)
      abortRef.current = null
    }
  }

  // Rewrite the report from the player's feedback; poems are regenerated since
  // they're derived from the report.
  async function revise() {
    const instruction = reviseText.trim()
    if (!instruction || !report || busy) return
    setBusy('revise')
    abortRef.current = new AbortController()
    const prev = report
    setReport('')
    setPoemModern('')
    setPoemClassic('')
    try {
      await streamRevise(prev, instruction, settings, {
        signal: abortRef.current.signal,
        onStatus: (msg) => setStatus({ msg, kind: 'info' }),
        onDelta: (chunk) => setReport((p) => p + chunk),
      })
      setReviseText('')
      setStatus({ msg: '已按你的意见重写,正在重写诗…', kind: 'ok' })
      await runPoem('modern', '')
      await runPoem('classic', '')
      setStatus({ msg: '✅ 完成', kind: 'ok' })
    } catch (e) {
      reportError(e)
    } finally {
      setBusy(null)
      abortRef.current = null
    }
  }

  // Generate / regenerate one poem. Called both automatically and from a panel.
  async function runPoem(kind: 'modern' | 'classic', instruction: string) {
    const setPoem = kind === 'modern' ? setPoemModern : setPoemClassic
    const ownCall = busy === null // invoked directly from a panel button
    if (ownCall) {
      setBusy(kind)
      abortRef.current = new AbortController()
    }
    setPoem('')
    try {
      await streamPoem(kind, report, instruction, settings, {
        signal: abortRef.current?.signal,
        onDelta: (chunk) => setPoem((p) => p + chunk),
      })
      if (kind === 'modern') setModernText('')
      else setClassicText('')
    } catch (e) {
      if (ownCall) reportError(e)
      else throw e
    } finally {
      if (ownCall) {
        setBusy(null)
        abortRef.current = null
      }
    }
  }

  function reportError(e: unknown) {
    const err = e as Error
    if (err.name === 'AbortError') setStatus({ msg: '已停止', kind: 'info' })
    else setStatus({ msg: '出错:' + err.message, kind: 'err' })
  }

  async function onShare() {
    const r = await shareReport(report)
    setStatus({ msg: r === 'shared' ? '已调起分享' : '已复制到剪贴板', kind: 'ok' })
  }
  async function onCopy() {
    await copyMarkdown(report)
    setStatus({ msg: '已复制 Markdown', kind: 'ok' })
  }
  async function onCopyLink() {
    await navigator.clipboard?.writeText(shareLink(shareId))
    setStatus({ msg: '已复制分享链接', kind: 'ok' })
  }

  const canResult = !!report || busy === 'report'

  return (
    <>
      <header>
        <h1>🎮 Game Tasting · 游戏生涯报告</h1>
        <p>用 Steam 登录(或上传导出文件) → 填 LLM 接口 → 一键生成玩家游戏生涯报告</p>
      </header>

      <div className="wrap">
        <Steps step={step} setStep={setStep} canResult={canResult} />

        {step === 0 && (
          <StepLLM
            settings={settings}
            set={set}
            inviteValid={inviteValid}
            setInviteValid={setInviteValid}
            onEgg={() => setEgg(true)}
            onNext={() => setStep(1)}
          />
        )}

        {step === 1 && (
          <StepData
            profile={profile}
            authChecked={authChecked}
            games={games}
            source={source}
            stats={stats}
            selectedGames={selectedGames}
            excluded={excluded}
            gameKey={gameKey}
            toggleGame={toggleGame}
            setExcluded={setExcluded}
            showAll={showAll}
            setShowAll={setShowAll}
            onFile={handleFile}
            onLogout={onLogout}
            onPrev={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <StepInfo
            settings={settings}
            set={set}
            busy={!!busy}
            canGenerate={!!games}
            status={status}
            onPrev={() => setStep(1)}
            onGenerate={generate}
          />
        )}

        {step === 3 && (
          <Results
            report={report}
            poemModern={poemModern}
            poemClassic={poemClassic}
            shareId={shareId}
            reviseText={reviseText}
            setReviseText={setReviseText}
            modernText={modernText}
            setModernText={setModernText}
            classicText={classicText}
            setClassicText={setClassicText}
            busy={busy}
            status={status}
            reportRef={reportRef}
            onCopy={onCopy}
            onShare={onShare}
            onCopyLink={onCopyLink}
            onRevise={revise}
            onPoem={runPoem}
            onAbort={() => abortRef.current?.abort()}
            onBack={() => setStep(2)}
          />
        )}
      </div>

      <footer className="foot">
        <a
          className="gh"
          href="https://github.com/Schweik7/steam-tasting"
          target="_blank"
          rel="noreferrer"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
          Schweik7/steam-tasting
        </a>
      </footer>

      {egg && (
        <div className="egg-mask" onClick={() => setEgg(false)}>
          <div className="egg-box" onClick={(e) => e.stopPropagation()}>
            <div className="egg-emoji">🎁</div>
            <p>谢谢你,我的朋友,愿意尝试这个傻乎乎的网站~</p>
            <button onClick={() => setEgg(false)}>开始吧</button>
          </div>
        </div>
      )}
    </>
  )
}
