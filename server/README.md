# 后端(FastAPI)

Python + FastAPI,用 [uv](https://docs.astral.sh/uv/) 管理。承担静态站点托管不了的几件事:

1. 代理 Steam Web API(它没有 CORS,浏览器调不了)并保管唯一的 `STEAM_API_KEY`;
2. 处理 Steam OpenID 登录的服务端回调与校验;
3. 代调 LLM 生成报告与两首诗(提示词在服务端构建,见 `prompt.py`),顺便规避浏览器跨域;
4. 按 SteamID 持久化报告 + 诗(SQLite),并提供公开分享。

会话用 Starlette 的签名 cookie(`SessionMiddleware`);持久化用 SQLModel + SQLite。

## 目录

```
main.py     # FastAPI 应用与全部路由;_resolve_llm / _stream_llm 复用的 LLM 管道
config.py   # 读 .env(python-dotenv);邀请码校验 magic_ok()(值来自 INVITE_CODES)
steam.py    # OpenID 登录 URL / 校验断言 / GetPlayerSummaries / GetOwnedGames
prompt.py   # 报告 System Prompt + 用户消息(年龄→人生阶段)+ 两首诗的 POEM_SYSTEM
db.py       # SQLModel + SQLite:按 SteamID 存报告/诗,share_id 用于分享
README.md
```

## 路由一览

| 方法 | 路径 | 作用 |
|---|---|---|
| GET  | `/api/health` | 健康检查 `{"ok":true}` |
| GET  | `/api/auth/steam/login` | 跳转 Steam 开始 OpenID 登录 |
| GET  | `/api/auth/steam/return` | Steam 回调,校验后写入会话 |
| GET  | `/api/me` | 当前用户资料 + 游戏库(未登录 401) |
| POST | `/api/logout` | 清除会话 |
| POST | `/api/invite` | 校验邀请码 `{code}` → `{valid}`(可接受值仅存于后端) |
| POST | `/api/report` | 构建提示词、代调 LLM,流式回传报告(SSE);登录则持久化 |
| POST | `/api/report/revise` | 旧报告 + ≤140 字意见 → 重写整篇,流式 + 持久化 |
| POST | `/api/poem` | 据报告写诗 `{kind,instruction?}`,邀请码下用 `LLM_MODEL_PRO` |
| GET  | `/api/report/saved` | 当前用户已存的报告 + 两首诗(未登录 401) |
| GET  | `/api/share/{id}` | 公开只读返回某 `share_id` 的报告 + 诗 + 昵称头像 |

## 配置(`.env`)

复制根目录 `.env.example` 为 `.env`。各变量说明见 [`../deploy/README.md`](../deploy/README.md) 的配置表。

## 开发运行

```bash
uv sync
uv run uvicorn server.main:app --host 127.0.0.1 --port 8787 --reload
curl http://127.0.0.1:8787/api/health
```

> 生产环境用同一条 uvicorn 命令(去掉 `--reload`),并在前面放反向代理。
> 完整自托管步骤(systemd / Windows 常驻、nginx + HTTPS、代理)见 [`../deploy/README.md`](../deploy/README.md)。
