# 🎮 Game Tasting · 游戏生涯报告

把你的 Steam 游玩历史(游戏 + 时长 + 最后游玩时间)交给大模型,生成一份有洞察、好读、带点人情味的
**玩家游戏生涯报告**:口味聚类、时间考古(回不去的白月光 vs 此刻在玩的)、投入人格,以及"你大概率会喜欢
但还没碰"的精准推荐。填了年龄还会把每款游戏锚定到你当时的人生阶段(高中 / 大学…),让时间考古更走心。

> 🌐 **线上试用:[https://game-tasting.psyventures.cn](https://game-tasting.psyventures.cn)** —— 直接用 Steam 登录即可生成你的游戏生涯报告。

线上体验或自己部署都行。下面按**你是谁**分三种用法。

---

## 👤 我只想生成自己的报告(大多数人看这里)

如果有人已经把带后端的版本部署好了,你要做的只有:

1. 打开站点,点 **「🎮 用 Steam 登录」** —— 授权后自动拉取你的游戏库,**不用申请任何 Key**。
   (需要把 Steam 资料的「游戏详情」隐私临时设为公开,`GetOwnedGames` 才读得到;分析完可改回。)
2. 在「① LLM 接口设置」填一个 OpenAI 兼容的 **API Base / 模型 / Key**(如 DeepSeek、OpenAI、各家中转、本地推理)。
   —— 或者,如果你拿到了**邀请码**,填进 MagicVal 框即可直接用站点方的模型,免填上面的 API。
3. (可选)填年龄、性别,让报告把游玩时间换算成你当时的人生阶段。
4. 点 **「⚡ 生成游戏生涯报告」**,流式查看,随后可复制 / 下载 `.md` `.html` / 分享。

> 你填的 LLM Key 只存在自己浏览器(localStorage);生成时发给站点后端代调 LLM,用完即弃、不持久化。

---

## 🛠️ 我想自己搭一套来运行(部署者看这里)

「Steam 登录」版本需要一个后端(Python/FastAPI),由它托管前端、代理 Steam、代调 LLM。
你只需在后端配置**一个** Steam Web API Key,所有用户共用,访客无需各自申请。

最小步骤:

```bash
git clone https://github.com/Schweik7/steam-tasting && cd steam-tasting
uv sync                         # 后端依赖(uv 自带 Python)
pnpm install && pnpm build      # 构建前端,产出 dist/(后端自动托管)
cp .env.example .env            # 填 STEAM_API_KEY、SESSION_SECRET(墙内再填 PROXY_URL)
uv run uvicorn server.main:app --host 127.0.0.1 --port 8787
```

- Windows / Linux 通用步骤、systemd / 服务常驻、nginx + HTTPS、代理配置 →
  **[`deploy/README.md`](./deploy/README.md)**
- 前端结构与开发 → [`src/README.md`](./src/README.md);后端结构与路由 → [`server/README.md`](./server/README.md)
- 架构与设计取舍(为什么必须有后端、登录与 Key 的关系、提示词、邀请码) → [`DEVELOPMENT.md`](./DEVELOPMENT.md)

> ⚠️ Steam OpenID 登录只做**身份认证**(拿到 SteamID),**不能替代 API Key** —— 读游戏数据仍需一个
> Steam Web API Key。区别只是「部署者出一个 Key」还是「每个用户各自出 Key」。

---

## 📄 我只想导出自己的 Steam 游玩记录(不生成报告)

用仓库里的 `steam_export.py` 即可,走官方 Steam Web API,**纯标准库、无需 pip 安装**,
产出 `games.json` + `games.csv`(含总时长、近 2 周时长、最后游玩日期、平台分布)。

需要 Python 3.8+:

1. **拿一个 Steam Web API Key**(只读、可随时吊销):登录后打开
   <https://steamcommunity.com/dev/apikey>,domain 随便填(如 `localhost`),得到 32 位十六进制 Key。
2. **把「游戏详情」隐私设为公开**(临时即可):个人资料 → 编辑资料 → 隐私设置 → 游戏详情 = 公开。
3. 运行:

   ```bash
   # 用自定义 URL(steamcommunity.com/id/<vanity>)
   python steam_export.py --key YOUR_API_KEY --vanity your_vanity
   # 或直接用 17 位 SteamID64
   python steam_export.py --key YOUR_API_KEY --steamid 7656119XXXXXXXXXX
   ```

导出的文件也能直接拖进 Web 界面的「上传导出文件」入口生成报告(此模式纯前端即可,无需登录)。

### 能拿到 / 拿不到什么

| 数据 | 是否可得 |
|---|---|
| 每款游戏总时长 / 近 2 周时长 | ✅ |
| 最后一次游玩日期 (`rtime_last_played`) | ✅ |
| 平台分布(Win/Mac/Linux/Deck) | ✅ |
| **逐日 / 逐年历史时长**("大一那年玩了多少") | ❌ Steam 不对外提供 |

> 时间维度靠 `last_played` 近似:总时长高但很久没碰 ≈ 早期本命;最近还在玩 ≈ 当前口味。

---

## 🧱 技术栈

- **前端**:React 19 + Vite 6 + TypeScript;`react-markdown` + `remark-gfm` 渲染报告;SheetJS(`xlsx`,懒加载)导出 Excel;设置存浏览器 localStorage。
- **后端**:Python 3.11+ / FastAPI + uvicorn + httpx;`python-dotenv` 读环境;`itsdangerous` 签名 Cookie 会话(无需登录态数据库);SQLModel + SQLite 持久化报告与诗;`uv` 管理依赖。
- **登录与数据**:Steam OpenID 2.0 认证 + Steam Web API(`GetPlayerSummaries` / `GetOwnedGames`)。
- **生成**:OpenAI 兼容的流式接口(SSE),由后端构建提示词并代调,默认 DeepSeek;邀请码路径下诗歌用更强模型。
- **部署**:nginx 反向代理 + systemd 常驻 + Let's Encrypt(详见 [`deploy/README.md`](./deploy/README.md))。

## 📁 项目结构

```
server/         # Python/FastAPI 后端(Steam 登录 + Steam/LLM 代理)  —— 见 server/README.md
src/            # Vite + React 前端                                  —— 见 src/README.md
deploy/         # 部署模板(systemd / nginx)与手册                  —— 见 deploy/README.md
steam_export.py # 备选途径:Steam 数据导出脚本(无第三方依赖)
pyproject.toml  # 后端依赖(uv)
index.html      # Vite 入口
.env.example    # 后端环境变量模板
DEVELOPMENT.md  # 架构与设计文档
```

## 🔒 隐私

- LLM 的 Key 存在浏览器 localStorage;生成报告时发给本应用后端代调 LLM,后端用完即弃、不持久化。
- Steam Web API Key 只在后端环境变量(`.env`,已 gitignore),永不下发浏览器。
- 邀请码的可接受值只存在后端(`INVITE_CODES` 环境变量),前端只拿到「有效 / 无效」结果。
- 登录用户生成的报告与两首诗会按 SteamID 存进后端 SQLite(`data/`,已 gitignore),便于再次登录查看与分享;
  分享链接 `/s/<随机 id>` 任何人可只读查看,不想公开就别分享链接。游戏库本身不落库。
- `games.json` / `games.csv` / `*.report.md` 含个人数据,已在 `.gitignore` 默认忽略。

## 📜 License

MIT
