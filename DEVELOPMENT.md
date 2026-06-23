# 开发者说明 · Steam Tasting

面向贡献者与自托管者的技术文档:架构、数据流、本地开发、部署与安全。
用户向使用说明见 [`README.md`](./README.md)。

---

## 1. 这个项目是什么

把 Steam 玩家的游玩历史(游戏 / 时长 / 最后游玩时间)交给任意 OpenAI 兼容的 LLM,
生成一份「玩家游戏生涯报告」。

获取游玩数据有**两种途径**,前端对两者一视同仁(归一化成同一份 `Game[]`):

1. **Steam 登录(推荐)** —— 用户点「用 Steam 登录」,经 Steam OpenID 认证后,
   后端用**开发者的一个 Steam Web API Key** 自动拉取该用户的游戏库。用户零门槛。
2. **上传文件(备选)** —— 用户自己跑 [`steam_export.py`](./steam_export.py),
   拖入生成的 `games.json` / `games.csv`。解析、勾选、导出都在前端完成,
   但**生成报告仍需后端** `/api/report`(LLM 调用在后端)。

> 报告生成由**后端**完成:浏览器把游戏数据 + LLM 设置发给 `/api/report`,后端构建
> 提示词、代调 LLM 并把 SSE 流式转发回来。后端职责 = Steam 认证 + Steam 数据代理 + LLM 代理。
>
> 另有 **MagicVal 邀请码**:用户填入邀请码(`INVITE_CODES` 环境变量,默认 `2016–2026`)即用
> 后端预置的 LLM(`LLM_API_*`),无需自带 API(见 §3「MagicVal」)。
>
> 登录用户的报告 + 两首诗按 SteamID **持久化**(SQLite),再次登录直接看到;每份报告有一个
> 公开分享链接 `/s/<id>`(见 §3「持久化与分享」)。

---

## 2. 关于「OpenID 登录是否免去 API Key」——重要

**不免。** 这是两个不同的东西,常被混淆:

| | Steam OpenID 登录 | Steam Web API Key |
|---|---|---|
| 作用 | 身份认证,登录后只得到用户的 **SteamID64** | 读取游戏数据(`GetOwnedGames` 等) |
| 能拿游戏数据吗 | ❌ 不能 | ✅ 必须用它 |

所以集成 OpenID 后**仍然需要一个 Steam Web API Key**。区别在于**谁来出 key**:

- 旧模式:每个用户各自申请 key、跑脚本。门槛高。
- 现在:**开发者申请一个 key,放在后端环境变量里**,所有用户用 Steam 登录即可,
  终端用户什么都不用申请。这才是集成 OpenID 的意义。

### 为什么必须有后端(纯静态托管不够)

1. **CORS** —— Steam Web API 不带跨域响应头,浏览器无法直接 `fetch`,必须服务端转发。
2. **密钥保密** —— API Key 不能进前端代码,否则会被任何人提取盗用。
3. **OpenID 回调** —— 登录断言需要一个服务端回调地址来验证。

所以**登录功能只在自托管(Python 后端)下可用**;若只把 `dist/` 丢到纯静态托管上,
就只剩「上传文件」途径。

---

## 3. 架构与数据流

```
浏览器 (React/Vite SPA)
  │
  │  ① /api/auth/steam/login        ──▶  302 跳转到 Steam OpenID
  │  ② 用户在 Steam 授权             ──▶  Steam 302 回 /api/auth/steam/return
  │  ③ 后端验证断言 → 写签名 Cookie  ──▶  302 回站点首页
  │  ④ GET /api/me  (带 Cookie)
  │        └─ 后端用 server-side key 调 GetPlayerSummaries + GetOwnedGames
  │           返回 { profile, games(已归一化), gamesPrivate }
  │
  └─ ⑤ 浏览器把 games + LLM 设置(或 MagicVal)POST 给 /api/report
         └─ 后端用 prompt.py 构建提示词,代调 LLM /chat/completions
            (流式,经 PROXY_URL)→ 原样转发 SSE 给浏览器 → 渲染报告
```

技术栈:前端 React 19 + Vite + TS(`src/`);后端 FastAPI + httpx,uv 管理(`server/`);
生产由 nginx 反代 → uvicorn,uvicorn 直接托管前端 `dist/`(单一源,无 CORS)。

### OpenID 2.0 登录流程(`server/steam.py`)

1. `build_login_url(realm, return_to)` 构造跳转 URL,`identity`/`claimed_id` 用
   `identifier_select`(让用户自己选账号)。
2. Steam 回调到 `return_to`,带一堆 `openid.*` 参数。
3. `verify_assertion(client, query)` 把这些参数原样回传给 Steam,并把 `openid.mode`
   改成 `check_authentication`;Steam 回 `is_valid:true` 才算数(防伪造)。
4. 从 `openid.claimed_id`(形如 `…/openid/id/7656119…`)正则提取 17 位 SteamID64。

### 会话

用 Starlette `SessionMiddleware`,会话存在**签名 Cookie**(`itsdangerous`
时间戳签名,7 天过期)里,payload 为 `{ steamid }`,密钥来自 `SESSION_SECRET`。

### 出网代理(`PROXY_URL`)

Steam 的 `api.steampowered.com` / `steamcommunity.com` 在部分网络被墙。后端用
单个 `httpx.AsyncClient(proxy=PROXY_URL)`(见 `server/main.py` 的 lifespan)。
本地开发时把 `.env` 的 `PROXY_URL` 指向你的 Clash/V2Ray(如 `http://127.0.0.1:7890`);
正常服务器部署留空即可。

### 提示词与报告生成(`server/prompt.py` + `/api/report`)

提示词(System + User)放在**后端** `prompt.py`:报告质量是核心价值,会反复打磨;
放后端可不重新构建前端就迭代,系统提示词也不暴露给用户。`/api/report` 接收
`{ games, base, model, key, topn, temp, lang, style, blind }`,构建提示词后**代用户
调用其填写的 LLM**(因此不受浏览器跨域限制,也可经 `PROXY_URL`),把上游的 OpenAI
风格 SSE **原样转发**给前端流式渲染。`games` 缺省时回退用会话里的 SteamID 现取。
`age` / `gender` 也随请求传入,`prompt.py` 据出生年把每款游戏的游玩年份换算成
人生阶段(高中 / 大学…),让「时间考古」更有代入感。

### MagicVal(免 key 邀请码)

校验逻辑全在后端:可接受的码值来自 `INVITE_CODES` 环境变量(逗号分隔,默认 `2016–2026`),
存在 `config.MAGIC_VALUES`(`config.magic_ok()`),**不下发浏览器**。前端把用户输入 POST 给
`POST /api/invite`,只拿回 `{valid}` 布尔值,据此决定是否放行生成、显示「有效」提示并弹出彩蛋。
生成时 `/api/report` 再用同一个 `magic_ok()` 复核 `magicVal`:命中则改用后端预置的
`LLM_API_BASE` / `LLM_API_KEY` / `LLM_MODEL`,用户无需自带 API;两首诗则用更强的
`LLM_MODEL_PRO`(默认 `deepseek-v4-pro`)。**注意**:该路径消耗的是开发者自己的 LLM 额度;
清空 `LLM_API_KEY` 即可关闭。

### 持久化与分享(`server/db.py`)

SQLModel + SQLite(默认 `data/steam-tasting.db`,可用 `DATABASE_URL` 覆盖)。每个登录用户
按 **SteamID** 存一行 `Report`:报告 Markdown、现代诗、古体诗、公开 `share_id`、时间戳。
- `/api/report`、`/api/report/revise`、`/api/poem` 在流式完成时把组装好的文本写库
  (`_stream_llm` 的 `on_complete` 回调);重新生成报告会清空旧诗。
- 再次登录:前端调 `GET /api/report/saved` 拿回报告与诗,直接跳到结果页。
- 分享:`GET /api/share/<share_id>` 公开只读返回该报告 + 诗 + 昵称头像;前端路由 `/s/<id>`
  (`src/Share.tsx`)渲染。`share_id` 为 `secrets.token_urlsafe`,不可猜。

### 报告优化与诗歌(`/api/report/revise` + `/api/poem`)

- **重写**:玩家在报告面板填 ≤140 字意见,`/api/report/revise` 带上「旧报告 + 意见」让模型
  重写整篇,流式返回并持久化(相当于"继续对话")。
- **两首诗**:报告生成后自动各写一首现代诗、古体诗(`POEM_SYSTEM`,独立的一次对话,
  输入是报告全文)。每个面板也可单独填 ≤140 字意见重写。

### 数据归一化

后端 `get_owned_games` 输出的字段刻意与 `steam_export.py` 一致
(`playtime_hours` / `last_played` / `playtime_2weeks_min` / `appid`),
因此前端 `src/lib/parse.ts` 的 `normGame` 能同时吃「API 数据」和「上传文件」。

---

## 4. 目录结构

```
server/                  # Python/FastAPI 后端(uv 管理)
  main.py                #   FastAPI 应用:路由 + SessionMiddleware + 托管 dist
  steam.py               #   OpenID 验证 + Steam Web API 调用(httpx)
  prompt.py              #   System / User 提示词构建 + 人生阶段换算
  config.py              #   load_dotenv 读取环境变量 + 启动校验 + magic_ok()
pyproject.toml           # 后端依赖(uv);uv.lock 为锁定版本
src/                     # 前端(Vite + React + TS)
  App.tsx                #   主界面:登录态 / 游戏勾选 / 导出 / 生成 / 彩蛋
  lib/api.ts             #   后端 API 客户端(/api/me、登录、登出、report URL)
  lib/parse.ts           #   解析/归一化(normGame / normalizeGames / parseFile)
  lib/llm.ts             #   调 /api/report 并解析流式 SSE
  lib/exporter.ts        #   报告复制/下载/分享 + 导出 games.json/csv/xlsx
  hooks/useLocalStorage.ts #  设置持久化(含空值回填默认)
  types.ts  styles.css  vite-env.d.ts
deploy/                  # 部署资产:systemd unit、nginx 配置、运维手册
steam_export.py          # 备选途径:本地导出脚本(纯标准库)
.env.example             # 后端环境变量模板
vite.config.ts           # 开发期 /api 代理
```

---

## 5. 本地开发

需要:Python 3.11+ 与 [uv](https://docs.astral.sh/uv/);前端需 Node 18+ 与 pnpm。

```bash
uv sync                     # 创建 .venv 并装后端依赖
pnpm install                # 前端依赖
cp .env.example .env        # 填 STEAM_API_KEY 与 SESSION_SECRET(墙内再填 PROXY_URL)
```

`.env` 关键项(完整说明见 `.env.example`):

| 变量 | 说明 |
|---|---|
| `STEAM_API_KEY` | 开发者的 Steam Web API Key,见 https://steamcommunity.com/dev/apikey |
| `SESSION_SECRET` | 长随机串,签 Cookie 用。`python -c "import secrets; print(secrets.token_hex(32))"` |
| `PORT` | 后端端口,默认 `8787` |
| `PUBLIC_URL` | **浏览器实际访问到的后端基址**,用于拼 OpenID `realm`/`return_to`。开发期填 `http://localhost:5173`(走 Vite 代理) |
| `FRONTEND_URL` | 登录成功后跳回的地址,默认 `/` |
| `PROXY_URL` | 可选出网代理(如 `http://127.0.0.1:7890`),墙内访问 Steam 用;无需则留空 |
| `INVITE_CODES` | 邀请码(逗号分隔),命中即用后端 LLM;默认 `2016–2026`(含连字符写法) |
| `LLM_API_BASE` / `LLM_API_KEY` / `LLM_MODEL` | 邀请码命中时使用的后端预置 LLM;留空则禁用该路径 |
| `LLM_MODEL_PRO` | 邀请码路径下写诗用的更强模型,默认 `deepseek-v4-pro` |
| `DATABASE_URL` | 选填;持久化报告/诗的数据库,默认 `data/steam-tasting.db`(SQLite) |

开两个终端:

```bash
uv run uvicorn server.main:app --port 8787 --reload   # 后端 :8787
pnpm dev                                               # 前端 :5173(已把 /api 代理到 :8787)
```

打开 http://localhost:5173 → 点「用 Steam 登录」。
因为走 Vite 代理,浏览器看到的是**同源**(:5173),Cookie 与 OpenID 回调都正常工作。

> 想换后端端口给前端代理:`VITE_DEV_API=http://localhost:9000 pnpm dev`。

---

## 6. 生产部署(自托管)

后端在检测到 `dist/` 时会**自己托管前端**,因此前后端同源、无 CORS、Cookie 简单。

```bash
pnpm build                  # 产出 dist/(base 默认 '/',匹配后端根路径托管)
# .env 里 PUBLIC_URL 改成你的真实对外地址,例如 https://your-domain
uv run uvicorn server.main:app --host 0.0.0.0 --port 8787
```

要点:

- **`PUBLIC_URL` 必须是真实对外 URL**,且建议 HTTPS;为 `https://` 时 Cookie 自动带 `Secure`。
- 后端通常挂在反向代理(Nginx/Caddy)后面;代理需透传 `X-Forwarded-Proto`,
  并把 `/` 与 `/api` 都转发到 uvicorn。生产建议多 worker:`--workers 2`。
- 在 Steam 注册 API Key 时填写的 domain 仅作记录,OpenID 的信任域由 `realm`(=`PUBLIC_URL`)决定。

---

## 7. API 一览(`/api`)

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 `{ok:true}` |
| GET | `/api/auth/steam/login` | 307 跳转 Steam OpenID |
| GET | `/api/auth/steam/return` | OpenID 回调,验证后写 Cookie 并跳回前端 |
| GET | `/api/me` | 当前用户 `{profile, games, gamesPrivate}`;未登录 401 |
| POST | `/api/logout` | 清除会话 Cookie |
| POST | `/api/invite` | 校验邀请码 `{code}` → `{valid}`(可接受值仅存后端) |
| POST | `/api/report` | 构建提示词并代调 LLM,流式转发 SSE(见下);登录则持久化 |
| POST | `/api/report/revise` | 带「旧报告 + ≤140 字意见」重写整篇,流式 + 持久化 |
| POST | `/api/poem` | 据报告写诗 `{kind:'modern'\|'classic', instruction?}`,邀请码用 pro 模型 |
| GET | `/api/report/saved` | 当前用户已存的报告 + 两首诗;未登录 401 |
| GET | `/api/share/{id}` | 公开只读返回某 `share_id` 的报告 + 诗 + 昵称头像 |

`/api/report` 请求体(JSON):

| 字段 | 说明 |
|---|---|
| `games` | `Game[]`(前端归一化形状);缺省则用会话 SteamID 现取 |
| `base` / `model` / `key` | 用户自带的 LLM 配置;命中 MagicVal 时可省略 |
| `magicVal` | 邀请码,命中则改用后端 `LLM_API_*` |
| `topn` / `temp` / `lang` / `style` / `blind` | 报告参数 |
| `age` / `gender` / `highschool` / `university` / `extra` | 可选;人生阶段换算 + 拼进提示词让报告更精准 |
| `playerName` / `playerAvatar` | 可选;随报告一起存,用于分享页展示 |

`gamesPrivate: true` 表示登录成功但游戏库为空 —— 通常是用户的「游戏详情」隐私非公开。
前端会提示用户改隐私后刷新。

---

## 8. 安全与隐私

- **API Key 只在后端**(环境变量),永不下发到浏览器。`.env` 已被 `.gitignore` 忽略。
- 会话 Cookie 为 `HttpOnly` + `SameSite=Lax`,HTTPS 下 `Secure`;`itsdangerous` 签名防篡改,7 天过期。
- **LLM 的 Key** 存在浏览器 localStorage,生成报告时随请求发给后端,由后端代调 LLM;
  后端**不持久化**它(用完即弃)。生产务必用 HTTPS,使这段传输加密。
- 个人游玩数据(`games.json` / `games.csv` / `*.report.md`)、`.env` 与 `data/`(SQLite)均在 `.gitignore` 中。
- `/api/me` 每次实时向 Steam 拉取,不存游戏库;**只持久化**生成好的报告与两首诗(按 SteamID),
  供再次登录查看与分享。分享链接含随机 `share_id`,知道链接者即可只读查看。

---

## 9. 常见问题

- **登录后报「读不到游戏库」** —— 用户的「游戏详情」隐私不是公开。开发者的 key 也无法越过他人隐私设置。
- **生成报告报错(502 / llm_failed)** —— 后端代调 LLM 失败,`message` 里有上游状态码/原文;
  常见是 API Base / 模型名 / Key 不对,或 LLM 接口被墙(给后端配 `PROXY_URL`)。
- **Steam 连不上(other side closed / 502)** —— 墙内网络;给 `.env` 配 `PROXY_URL` 指向本地代理。
- **登录后跳回却仍是未登录** —— 多半是 `PUBLIC_URL` 与浏览器实际访问的源不一致,导致 Cookie 写在了别的域;核对 `PUBLIC_URL`。
- **改了后端端口** —— 同步更新 `PORT` 与(开发期)`VITE_DEV_API`。
