# 部署手册(自托管 · 阿里云 39.99.245.245)

线上地址:**https://game-tasting.psyventures.cn**(nginx + Let's Encrypt)。

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

## 阶段②:域名 + HTTPS(已上线 game-tasting.psyventures.cn)

1. DNS:`game-tasting.psyventures.cn` A 记录 → `39.99.245.245`(大陆服务器域名需已备案)。
2. `.env`:`PUBLIC_URL=https://game-tasting.psyventures.cn`,`systemctl restart steam-tasting`。
3. nginx `server_name` 设为该域名;先用 80 端口跑通 ACME 验证目录。
4. 用 acme.sh 签证书(本机 certbot 已损坏,统一用 acme.sh):

```bash
D=game-tasting.psyventures.cn
~/.acme.sh/acme.sh --issue -d $D -w /var/www/html --server letsencrypt --keylength ec-256
mkdir -p /etc/nginx/ssl/$D
~/.acme.sh/acme.sh --install-cert -d $D --ecc \
  --key-file /etc/nginx/ssl/$D/key.pem \
  --fullchain-file /etc/nginx/ssl/$D/fullchain.pem \
  --reloadcmd "systemctl reload nginx"
```

5. 把 `deploy/nginx.conf` 的 443 块指向 `/etc/nginx/ssl/$D/`,80 块做 ACME + 跳转 HTTPS,
   `nginx -t && systemctl reload nginx`。acme.sh 会自动续期。
