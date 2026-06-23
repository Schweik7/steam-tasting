# 🎮 Game Tasting · Steam 玩家品味鉴定

把你的 Steam 游玩历史(游戏 + 时长 + 最后游玩时间)导出成结构化数据,交给任意 OpenAI 兼容的 LLM,
生成一份有洞察、好读、带点人情味的**玩家品味鉴定报告**:口味聚类、时间考古(白月光 vs 当下在玩)、
投入人格、以及"你大概率会喜欢但还没碰"的精准推荐。

> LLM 的 Key 存在浏览器 localStorage;生成报告时由后端构建提示词并代调你填写的 LLM(用完即弃,不持久化)。

获取游玩数据有两种途径:

- **🎮 用 Steam 登录(推荐)**:部署带后端的版本后,用户点「用 Steam 登录」即可自动拉取自己的游戏库,
  **无需自己申请任何 Key**。开发者只需在后端配置**一个** Steam Web API Key。需自托管 Python/FastAPI 后端,见
  [`DEVELOPMENT.md`](./DEVELOPMENT.md)。
- **📄 上传导出文件**:用下面的 `steam_export.py` 自己导出 `games.json` / `games.csv` 再拖入。纯静态即可用。

> ⚠️ 注意:Steam OpenID 登录只做**身份认证**(拿到 SteamID),**不能替代 API Key** —— 读取游戏数据仍需
> 一个 Steam Web API Key。区别只是「开发者出一个 key」还是「每个用户各自出 key」。详见 `DEVELOPMENT.md` 第 2 节。

---

## ✨ 功能

- **数据导出**(`steam_export.py`):走官方 Steam Web API(`GetOwnedGames`),纯标准库、无需 pip 安装。
  导出 `games.json` + `games.csv`,含总时长、近 2 周时长、**最后游玩日期**、平台分布。
- **Web 分析界面**(Vite + React + TS):填 API Base / Key / 模型 → 拖入数据 → 取时长前 N 名 → **流式**生成报告。
- **导出 / 分享**:复制 Markdown、下载 `.md`、导出自包含 `.html`、调用系统分享。
- **可定制**:语言(中/英)、点评风格(专业幽默 / 温和鼓励 / 毒舌犀利)、Top N、temperature、盲点推荐开关。
- **报告模板**:见 [`game_tasting_template.md`](./game_tasting_template.md),含给 AI 的高质量 System Prompt。

---

## 🔧 一、导出你的 Steam 数据

需要:Python 3.8+。

1. **拿一个 Steam Web API Key**(只读、可随时吊销):登录后打开
   <https://steamcommunity.com/dev/apikey>,domain 随便填(如 `localhost`),得到 32 位十六进制 key。
2. **把"游戏详情"隐私设为公开**(临时即可):个人资料 → 编辑资料 → 隐私设置 → 游戏详情 = 公开。
   `GetOwnedGames` 受此设置限制,私密则返回空。分析完可改回。
3. 运行:

   ```bash
   # 用自定义 URL(steamcommunity.com/id/<vanity>)
   python steam_export.py --key YOUR_API_KEY --vanity tensorneverflow
   # 或直接用 17 位 SteamID64
   python steam_export.py --key YOUR_API_KEY --steamid 7656119XXXXXXXXXX
   ```

   产出当前目录的 `games.json` 与 `games.csv`。

### 能拿到什么 / 拿不到什么

| 数据 | 是否可得 |
|---|---|
| 每款游戏总时长 / 近 2 周时长 | ✅ |
| 最后一次游玩日期 (`rtime_last_played`) | ✅ |
| 平台分布(Win/Mac/Linux/Deck) | ✅ |
| **逐日 / 逐年历史时长**("大一那年玩了多少") | ❌ Steam 不对外提供 |

> 时间维度靠 `last_played` 近似:总时长高但很久没碰 ≈ 早期本命;最近还在玩 ≈ 当前口味。
> 报告会重点利用这一点区分"回不去的白月光"和"现在的菜"。

---

## 🖥️ 二、启动 Web 分析界面

只想用「上传文件」模式:需要 Node 18+ 与 pnpm。

```bash
pnpm install
pnpm dev      # 打开 http://localhost:5173
# 或构建静态站点
pnpm build && pnpm preview
```

想用「Steam 登录」模式:还需启动 Python/FastAPI 后端(uv 管理),完整步骤见
[`DEVELOPMENT.md`](./DEVELOPMENT.md):

```bash
uv sync
cp .env.example .env       # 填 STEAM_API_KEY、SESSION_SECRET(墙内再填 PROXY_URL)
uv run uvicorn server.main:app --port 8787 --reload   # 另开一个终端跑 pnpm dev
```

界面里:

1. 填 **API Base**(OpenAI 兼容,如 `https://api.openai.com/v1`、各家中转、本地推理)、**模型名**、**API Key**。
2. **用 Steam 登录**(自动拉取游戏库),或拖入 `games.json` / `games.csv`。
3. 点「⚡ 生成品味鉴定报告」,流式查看,随后可复制 / 下载 / 分享。

> 生成报告由**后端**构建提示词并代调你填写的 LLM(因此不受浏览器跨域限制)。
> 若 LLM 接口被墙,给后端 `.env` 配 `PROXY_URL` 即可。

---

## 📁 项目结构

```
server/                    # Python/FastAPI 后端(Steam 登录 + Steam/LLM 代理)
  main.py  steam.py  prompt.py  config.py
pyproject.toml             # 后端依赖(uv)
steam_export.py            # 备选途径:Steam 数据导出脚本(无第三方依赖)
game_tasting_template.md   # 报告模板 + System Prompt
legacy-standalone.html     # 早期单文件版(无需构建,留作备份)
index.html                 # Vite 入口
src/
  App.tsx                  # 主界面 + 登录态
  lib/api.ts               # 后端 API 客户端
  lib/parse.ts             # JSON/CSV 解析与归一化
  lib/llm.ts               # 调 /api/report 并解析流式 SSE
  lib/exporter.ts          # 复制 / 下载 / 分享
  hooks/useLocalStorage.ts
  types.ts  styles.css
.env.example               # 后端环境变量模板
```

> 自托管「Steam 登录」版本的完整步骤(环境变量、部署、安全)见 [`DEVELOPMENT.md`](./DEVELOPMENT.md)。

---

## 🔒 隐私

- LLM 的 Key 存在浏览器 localStorage;生成报告时发给本应用后端代调 LLM,后端用完即弃、不持久化。
- Steam Web API Key 只在后端环境变量(`.env`,已 gitignore),永不下发浏览器。
- `games.json` / `games.csv` / `*.report.md` 含个人数据,已在 `.gitignore` 中默认忽略,不会被提交。

## 📜 License

MIT
