import { useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchShare, type ShareData } from './lib/api'

/** Read-only public view of a shared report at /s/<id>. */
export default function Share({ id }: { id: string }) {
  const [data, setData] = useState<ShareData | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading')

  useEffect(() => {
    fetchShare(id).then((d) => {
      if (d) {
        setData(d)
        setState('ok')
      } else {
        setState('missing')
      }
    })
  }, [id])

  return (
    <>
      <header>
        <h1>🎮 Game Tasting · 游戏生涯报告</h1>
        {data?.name && (
          <p className="profile-share">
            {data.avatar && <img src={data.avatar} alt="" className="avatar" />}
            <span>{data.name} 的游戏生涯</span>
          </p>
        )}
      </header>

      <div className="wrap">
        {state === 'loading' && <div className="status info">加载中…</div>}
        {state === 'missing' && (
          <div className="card">
            <p>没有找到这份报告,链接可能已失效。</p>
            <a href="/">← 去生成你自己的</a>
          </div>
        )}

        {state === 'ok' && data && (
          <>
            <article className="report">
              <Markdown remarkPlugins={[remarkGfm]}>{data.content}</Markdown>
            </article>
            {(data.poemModern || data.poemClassic) && (
              <div className="poemgrid">
                {data.poemModern && (
                  <section className="card poem-card">
                    <h2>🪶 现代诗</h2>
                    <div className="poem">{data.poemModern}</div>
                  </section>
                )}
                {data.poemClassic && (
                  <section className="card poem-card">
                    <h2>📜 古体诗</h2>
                    <div className="poem">{data.poemClassic}</div>
                  </section>
                )}
              </div>
            )}
            <div className="navrow">
              <span />
              <a className="btnlink" href="/">
                ✨ 生成我自己的游戏生涯报告 →
              </a>
            </div>
          </>
        )}
      </div>

      <footer className="foot">
        <a
          className="gh"
          href="https://github.com/Schweik7/steam-tasting"
          target="_blank"
          rel="noreferrer"
        >
          Schweik7/steam-tasting
        </a>
      </footer>
    </>
  )
}
