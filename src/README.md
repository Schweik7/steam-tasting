# 前端(Web 界面)

Vite + React 19 + TypeScript。单页应用,负责:Steam 登录入口、上传 / 勾选游玩数据、
导出(JSON / CSV / Excel)、调后端 `/api/report` 流式渲染报告。

> 前端**不直接**接触 Steam Web API,也不直接调 LLM —— 这些都经后端(`server/`)代理。
> 浏览器里只存用户自填的 LLM 配置(localStorage),邀请码的校验也交给后端。

## 目录

```
main.tsx              # 入口
App.tsx               # 主界面 + 登录态 + 生成流程
types.ts  styles.css
lib/
  api.ts              # 后端 API 客户端(/api/me、/api/report、/api/invite…)
  parse.ts            # 上传文件的 JSON/CSV 解析与归一化
  llm.ts              # POST /api/report 并解析流式 SSE
  exporter.ts         # 复制 / 下载 .md/.html / 导出 JSON/CSV/Excel(xlsx 懒加载)
hooks/
  useLocalStorage.ts  # 设置持久化(会与默认值合并)
```

## 开发

```bash
pnpm install
pnpm dev        # http://localhost:5173;/api 由 vite.config.ts 代理到后端 8787
```

- 后端默认地址 `http://localhost:8787`,通过 vite 的 `/api` 代理转发(见 `vite.config.ts`)。
- 若后端在别的源,设环境变量 `VITE_API_BASE=https://后端地址`(该源需开启 CORS + 凭据)。

## 构建(部署用)

```bash
pnpm build      # 产出 ../dist/
pnpm preview    # 本地预览构建结果
```

生产环境**不单独部署前端**:`pnpm build` 产出的 `dist/` 由后端 uvicorn 直接托管(同源,免 CORS)。
整体部署见 [`../deploy/README.md`](../deploy/README.md)。
