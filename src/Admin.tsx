import { useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { adminGetUser, adminListUsers, shareLink, type AdminDetail, type AdminUser } from './lib/api'

/**
 * Admin console at /<ADMIN_PATH>. Two full-width views: a user LIST (landing)
 * and a per-user DETAIL reached by clicking a row. The path segment is taken
 * from the URL and sent to /api/<path>/*; if it isn't the real admin path the
 * backend 404s and we show "not found". No login — the obscure URL is the gate.
 */
export default function Admin({ path }: { path: string }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading')
  const [sel, setSel] = useState<AdminDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    adminListUsers(path).then((list) => {
      if (list === null) {
        setState('denied')
      } else {
        setUsers(list)
        setState('ok')
      }
    })
  }, [path])

  async function open(steamid: string) {
    setLoadingDetail(true)
    setSel(null)
    setSel(await adminGetUser(path, steamid))
    setLoadingDetail(false)
    window.scrollTo({ top: 0 })
  }

  function back() {
    setSel(null)
    setLoadingDetail(false)
  }

  if (state === 'loading') return <div className="wrap status info">加载中…</div>
  if (state === 'denied')
    return (
      <div className="wrap">
        <div className="card">页面不存在。</div>
      </div>
    )

  // --- detail view (full width) ---
  if (loadingDetail || sel) {
    return (
      <>
        <header>
          <h1>🛠️ 用户详情</h1>
        </header>
        <div className="wrap">
          <button className="ghost" onClick={back}>
            ← 返回用户列表
          </button>
          {loadingDetail && <div className="status info" style={{ marginTop: 12 }}>加载详情…</div>}
          {!loadingDetail && sel && <Detail d={sel} />}
        </div>
      </>
    )
  }

  // --- list view (landing) ---
  return (
    <>
      <header>
        <h1>🛠️ 后台管理</h1>
        <p>共 {users?.length ?? 0} 位用户 · 路径 /{path}</p>
      </header>

      <div className="wrap">
        <div className="ulist">
          {users?.map((u) => (
            <button key={u.steamid} className="uitem" onClick={() => open(u.steamid)}>
              {u.avatar ? (
                <img src={u.avatar} alt="" className="uavatar" />
              ) : (
                <span className="uavatar uavatar-ph">🎮</span>
              )}
              <span className="uinfo">
                <b className="uname">{u.name || '(未知)'}</b>
                <span className="hint usteam">{u.steamid}</span>
              </span>
              <span className="umeta">
                <span className="ubadges">
                  <span title="报告">{u.hasReport ? '📄' : '·'}</span>
                  <span title="诗">{u.hasPoems ? '🪶' : '·'}</span>
                </span>
                <span className="hint udate">{new Date(u.updatedAt).toLocaleDateString()}</span>
              </span>
              <span className="uarrow">›</span>
            </button>
          ))}
          {users?.length === 0 && (
            <div className="card hint">还没有任何用户生成报告。</div>
          )}
        </div>
      </div>
    </>
  )
}

/** Full-width detail: profile, games, report, poems. */
function Detail({ d }: { d: AdminDetail }) {
  return (
    <>
      <section className="card">
        <div className="profile">
          {d.avatar && <img src={d.avatar} alt="" className="avatar" />}
          <div className="profile-meta">
            <b>{d.name || '(未知)'}</b>
            <span className="hint">SteamID {d.steamid}</span>
            <a className="hint" href={shareLink(d.shareId)} target="_blank" rel="noreferrer">
              分享页 /s/{d.shareId}
            </a>
          </div>
        </div>

        <details>
          <summary>游戏库({d.games.length})</summary>
          {d.gamesError && <p className="status err">读取游戏库失败:{d.gamesError}</p>}
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
              {d.games.slice(0, 80).map((g, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{g.name}</td>
                  <td>{g.hours}</td>
                  <td>{g.last_played || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      {d.report ? (
        <article className="report">
          <Markdown remarkPlugins={[remarkGfm]}>{d.report}</Markdown>
        </article>
      ) : (
        <div className="card hint">无报告</div>
      )}

      {(d.poemModern || d.poemClassic) && (
        <div className="poemgrid">
          {d.poemModern && (
            <div className="card poem-card">
              <h2>🪶 现代诗</h2>
              <div className="poem">{d.poemModern}</div>
            </div>
          )}
          {d.poemClassic && (
            <div className="card poem-card">
              <h2>📜 古体诗</h2>
              <div className="poem">{d.poemClassic}</div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
