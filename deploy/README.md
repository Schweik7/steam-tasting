# 部署手册(自托管 · 阿里云 39.99.245.245)

两个阶段:**① 纯 IP + HTTP** 先跑通 → 确认无误后 **② 切域名 `game-tasting.vrventures.cn`(可选上 HTTPS)**。

架构:`nginx :80` 反向代理 → `uvicorn 127.0.0.1:8787`(后端同时托管前端 `dist/`)。

> ⚠️ 大陆服务器访问 Steam(`steamcommunity.com` / `api.steampowered.com`)可能被墙。
> 若登录/拉数据失败,在 `.env` 配 `PROXY_URL` 指向服务器上可用的代理。DeepSeek 在国内,报告生成不受影响。

---

## 一、前置(服务器上,Ubuntu/Debian 为例)

```bash
# Node + pnpm(构建前端)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs nginx git
npm i -g pnpm

# uv(管理 Python 后端)
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="/root/.local/bin:$PATH"
```

## 二、拉代码 + 构建

```bash
git clone https://github.com/Schweik7/steam-tasting /opt/steam-tasting
cd /opt/steam-tasting
uv sync                      # 后端依赖
pnpm install && pnpm build   # 产出 dist/(后端会自动托管)
```

## 三、配置 .env

```bash
cd /opt/steam-tasting
cp .env.example .env
# 编辑 .env,至少填:
#   STEAM_API_KEY=...                      # 开发者的 Steam Web API Key
#   SESSION_SECRET=...                     # python -c "import secrets;print(secrets.token_hex(32))"
#   PUBLIC_URL=http://39.99.245.245        # 阶段①:纯 IP
#   PROXY_URL=                             # 服务器连不上 Steam 时再填
```

## 四、起后端(systemd)

```bash
cp deploy/steam-tasting.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now steam-tasting
systemctl status steam-tasting           # 应为 active (running)
curl -s localhost:8787/api/health         # {"ok":true}
```

## 五、起 nginx

```bash
cp deploy/nginx.conf /etc/nginx/conf.d/steam-tasting.conf
nginx -t && systemctl reload nginx
```

阿里云安全组放行 **80** 端口。然后浏览器打开 `http://39.99.245.245` 验证。
> Steam 开发者后台注册 API Key 的 domain 仅作记录;OpenID 的信任域由 `PUBLIC_URL` 决定,
> 阶段① 用户会被带到 Steam 再跳回 `http://39.99.245.245/...`,所以 `PUBLIC_URL` 必须与此一致。

## 更新部署

```bash
cd /opt/steam-tasting && git pull
uv sync && pnpm install && pnpm build
systemctl restart steam-tasting
```

---

## 阶段②:切到域名 game-tasting.vrventures.cn

1. DNS:`game-tasting.vrventures.cn` A 记录 → `39.99.245.245`(大陆服务器域名需已备案)。
2. 改 `.env`:`PUBLIC_URL=http://game-tasting.vrventures.cn`,`systemctl restart steam-tasting`。
3. 改 nginx `server_name` 为该域名,`nginx -t && systemctl reload nginx`。
4. (可选)上 HTTPS:

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d game-tasting.vrventures.cn
# 成功后把 .env 的 PUBLIC_URL 改成 https://game-tasting.vrventures.cn 并重启后端
```
