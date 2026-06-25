import { useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { adminGetUser, adminListUsers, shareLink, type AdminDetail, type AdminUser } from './lib/api'

/**
 * Admin console at /<ADMIN_PATH>. The path segment is taken from the URL and
 * sent to /api/<path>/*; if it isn't the real admin path the backend 404s and
 * we show "not found". No login — the obscure URL is the only gate.
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
    setSel(await adminGetUser(path, steamid))
    setLoadingDetail(false)
  }

  if (state === 'loading') return <div className="wrap status info">加载中…</div>
  if (state === 'denied')
    return (
      <div className="wrap">
        <div className="card">页面不存在。</div>
      </div>
    )

  return (
    <>
      <header>
        <h1>🛠️ 后台管理</h1>
        <p>共 {users?.length ?? 0} 位用户 · 路径 /{path}</p>
      </header>

      <div className="wrap admin">
        <section className="card admin-list">
          <h2>用户列表</h2>
          <div className="ulist">
            {users?.map((u) => (
              <button
                key={u.steamid}
                className={'uitem' + (sel?.steamid === u.steamid ? ' sel' : '')}
                onClick={() => open(u.steamid)}
              >
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
                  <span className="hint udate">
                    {new Date(u.updatedAt).toLocaleDateString()}
                  </span>
                </span>
              </button>
            ))}
            {users?.length === 0 && <p className="hint">还没有任何用户生成报告。</p>}
          </div>
        </section>

        <section className="card admin-detail">
          {loadingDetail && <div className="status info">加载详情…</div>}
          {!loadingDetail && !sel && <p className="hint">← 点击左侧用户查看详情</p>}
          {!loadingDetail && sel && (
            <>
              <div className="profile">
                {sel.avatar && <img src={sel.avatar} alt="" className="avatar" />}
                <div className="profile-meta">
                  <b>{sel.name || '(未知)'}</b>
                  <span className="hint">SteamID {sel.steamid}</span>
                  <a className="hint" href={shareLink(sel.shareId)} target="_blank" rel="noreferrer">
                    分享页 /s/{sel.shareId}
                  </a>
                </div>
              </div>

              <details open>
                <summary>游戏库({sel.games.length})</summary>
                {sel.gamesError && (
                  <p className="status err">读取游戏库失败:{sel.gamesError}</p>
                )}
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
                    {sel.games.slice(0, 60).map((g, i) => (
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

              <details open>
                <summary>报告</summary>
                {sel.report ? (
                  <article className="report">
                    <Markdown remarkPlugins={[remarkGfm]}>{sel.report}</Markdown>
                  </article>
                ) : (
                  <p className="hint">无报告</p>
                )}
              </details>

              {(sel.poemModern || sel.poemClassic) && (
                <div className="poemgrid">
                  {sel.poemModern && (
                    <div className="card poem-card">
                      <h2>🪶 现代诗</h2>
                      <div className="poem">{sel.poemModern}</div>
                    </div>
                  )}
                  {sel.poemClassic && (
                    <div className="card poem-card">
                      <h2>📜 古体诗</h2>
                      <div className="poem">{sel.poemClassic}</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  )
}
