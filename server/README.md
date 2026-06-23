# 后端(FastAPI)

Python + FastAPI,用 [uv](https://docs.astral.sh/uv/) 管理。承担静态站点托管不了的三件事:

1. 代理 Steam Web API(它没有 CORS,浏览器调不了)并保管唯一的 `STEAM_API_KEY`;
2. 处理 Steam OpenID 登录的服务端回调与校验;
3. 代调 LLM 生成报告(提示词在服务端构建,见 `prompt.py`),顺便规避浏览器跨域。

会话用 Starlette 的签名 cookie(`SessionMiddleware`),**无数据库**。

## 目录

```
main.py     # FastAPI 应用与全部路由
config.py   # 读 .env(python-dotenv);邀请码校验 magic_ok()
steam.py    # OpenID 登录 URL / 校验断言 / GetPlayerSummaries / GetOwnedGames
prompt.py   # System Prompt + 用户消息构建(含年龄→人生阶段映射)
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
| POST | `/api/report` | 构建提示词、代调 LLM,流式回传报告(SSE) |

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
