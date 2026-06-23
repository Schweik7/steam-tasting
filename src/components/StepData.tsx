import { useRef, useState } from 'react'
import type { Game, Profile } from '../types'
import { downloadGamesCsv, downloadGamesJson, downloadGamesXlsx } from '../lib/exporter'
import { steamLoginUrl } from '../lib/api'

interface Stats {
  owned: number
  selected: number
  played: number
  total: number
}

/** Step ②: get the games — Steam login (primary) or file upload (fallback). */
export default function StepData({
  profile,
  authChecked,
  games,
  source,
  stats,
  selectedGames,
  excluded,
  gameKey,
  toggleGame,
  setExcluded,
  showAll,
  setShowAll,
  onFile,
  onLogout,
  onPrev,
  onNext,
}: {
  profile: Profile | null
  authChecked: boolean
  games: Game[] | null
  source: string
  stats: Stats | null
  selectedGames: Game[]
  excluded: Set<string>
  gameKey: (g: Game) => string
  toggleGame: (g: Game) => void
  setExcluded: (s: Set<string>) => void
  showAll: boolean
  setShowAll: (fn: (v: boolean) => boolean) => void
  onFile: (f: File) => void
  onLogout: () => void
  onPrev: () => void
  onNext: () => void
}) {
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
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
            if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0])
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
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
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
            <button className="ghost" onClick={() => setExcluded(new Set(games.map(gameKey)))}>
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

      <div className="navrow">
        <button className="ghost" onClick={onPrev}>
          ← 上一步
        </button>
        <button onClick={onNext}>下一步:你的信息 →</button>
      </div>
    </section>
  )
}
