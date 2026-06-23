# 部署手册(自托管)

「Steam 登录」版本需要后端。整体架构很简单:

```
浏览器 ──HTTPS──> 反向代理(nginx) ──> uvicorn 127.0.0.1:8787
                                          后端同时托管前端 dist/ 与 /api
```

后端是纯脚本(Python + 已构建好的前端静态文件),**没有编译产物**,Windows 与 Linux 跑的是同一套代码。
下面把**两个平台通用的步骤**和**各自特有的步骤**分开列出。

> ⚠️ 大陆网络访问 Steam(`steamcommunity.com` / `api.steampowered.com`)可能受阻。
> 若登录 / 拉数据失败,在 `.env` 里配 `PROXY_URL` 指向一个可用代理(如 `http://127.0.0.1:7890`)。
> LLM 接口若也被墙,同样走这个 `PROXY_URL`。

---

## 一、通用:准备运行环境

无论 Windows 还是 Linux,都需要两样东西:

- **[uv](https://docs.astral.sh/uv/)** —— 管理 Python 后端(自带 Python,无需系统 venv)。
- **[Node.js](https://nodejs.org/) 18+ 与 pnpm** —— 构建前端静态文件。

各平台安装方式见下方「平台特有步骤」。装好后验证:

```bash
uv --version
node -v && pnpm -v
```

## 二、通用:拉代码 → 构建 → 配置

```bash
git clone https://github.com/Schweik7/steam-tasting
cd steam-tasting

uv sync                       # 安装后端依赖
pnpm install && pnpm build    # 产出 dist/,后端会自动托管

cp .env.example .env          # Windows PowerShell 用: copy .env.example .env
```

编辑 `.env`,至少填:

| 变量 | 说明 |
|---|---|
| `STEAM_API_KEY` | 开发者在 <https://steamcommunity.com/dev/apikey> 申请的一个 Key(用户无需各自申请) |
| `SESSION_SECRET` | 用于签名会话 cookie 的长随机串,见下方生成命令 |
| `PUBLIC_URL` | 本后端对外可达的根地址,如 `https://your-domain.example.com`;OpenID 回调依赖它,必须与浏览器实际访问地址一致 |
| `PROXY_URL` | 仅在服务器连不上 Steam / LLM 时填 |
| `LLM_API_BASE` / `LLM_API_KEY` / `LLM_MODEL` | 选填:配置后,持邀请码的用户可直接用开发者的 LLM(详见根 `DEVELOPMENT.md`) |

生成 `SESSION_SECRET`:

```bash
uv run python -c "import secrets; print(secrets.token_hex(32))"
```

## 三、通用:本地起后端验证

```bash
uv run uvicorn server.main:app --host 127.0.0.1 --port 8787
# 另开一个终端:
curl http://127.0.0.1:8787/api/health        # 期望 {"ok":true}
```

确认健康检查通过后,再按所在平台把它做成长期运行的服务。

---

## 平台特有步骤

### Linux(Ubuntu/Debian 为例)

安装环境:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs nginx git
npm i -g pnpm
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
```

用 **systemd** 常驻后端(模板见 `deploy/steam-tasting.service`):

```bash
# 模板假设项目位于 /opt/steam-tasting;如放别处,改 WorkingDirectory 与 uv 路径
cp deploy/steam-tasting.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now steam-tasting
systemctl status steam-tasting            # 应为 active (running)
```

用 **nginx** 做反向代理 + TLS(模板见 `deploy/nginx.conf`,把 `YOUR_DOMAIN` 全部替换为你的域名):

```bash
cp deploy/nginx.conf /etc/nginx/conf.d/steam-tasting.conf
# 先只跑 80 端口,跑通 ACME 验证目录,再签证书
```

签 Let's Encrypt 证书(推荐 [acme.sh](https://github.com/acmesh-official/acme.sh),也可用 certbot):

```bash
D=your-domain.example.com
~/.acme.sh/acme.sh --issue -d $D -w /var/www/html --server letsencrypt --keylength ec-256
mkdir -p /etc/nginx/ssl/$D
~/.acme.sh/acme.sh --install-cert -d $D --ecc \
  --key-file       /etc/nginx/ssl/$D/key.pem \
  --fullchain-file /etc/nginx/ssl/$D/fullchain.pem \
  --reloadcmd      "systemctl reload nginx"
nginx -t && systemctl reload nginx        # acme.sh 会自动续期
```

记得在防火墙 / 安全组放行 **80**、**443**。

### Windows

安装环境:

```powershell
winget install OpenJS.NodeJS.LTS
winget install astral-sh.uv      # 或: powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
npm i -g pnpm
```

常驻后端,三选一:

- **简单**:直接在窗口里跑 `uv run uvicorn server.main:app --host 127.0.0.1 --port 8787`(关窗即停)。
- **任务计划程序**:创建「登录时 / 开机时」触发的任务,操作填上面的 `uv run …` 命令,起始位置设为项目目录。
- **作为服务**:用 [NSSM](https://nssm.cc/) 把同一条命令注册成 Windows 服务,实现开机自启与崩溃重启。

反向代理 + TLS:同样建议在前面放一层 nginx(Windows 版)或 IIS / Caddy,转发到 `127.0.0.1:8787`,
证书可用 [win-acme](https://www.win-acme.com/) 签发。仅内网测试也可不加代理,直接访问 `http://本机:8787`。

---

## 更新部署(通用)

```bash
git pull
uv sync && pnpm install && pnpm build
# Linux: systemctl restart steam-tasting
# Windows: 重启你用来常驻后端的服务 / 任务 / 窗口
```

---

## 域名 + HTTPS 上线前清单

1. DNS 的 A 记录指向服务器公网 IP(大陆服务器域名需已备案)。
2. `.env` 的 `PUBLIC_URL` 改为 `https://你的域名`,重启后端。
3. nginx `server_name`、证书路径填好你的域名,先用 80 端口跑通 ACME,再签证书切到 443。
4. 浏览器走一遍 Steam 登录,确认能跳回 `https://你的域名/...` 并读到游戏库。
