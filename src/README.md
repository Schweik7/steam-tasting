# 前端(Web 界面)

Vite + React 19 + TypeScript。单页应用,四步向导(每步一页):① LLM 接口 → ② 游玩数据
(Steam 登录 / 上传 + 勾选 + 导出)→ ③ 你的信息 → ④ 生涯报告(报告 + 现代诗 + 古体诗,
均可填 ≤140 字意见重写,并给出公开分享链接)。

> 前端**不直接**接触 Steam Web API,也不直接调 LLM —— 这些都经后端(`server/`)代理。
> 浏览器里只存用户自填的 LLM 配置(localStorage),邀请码校验、报告/诗的持久化都在后端。

## 目录

```
main.tsx              # 入口;/s/<id> 路由到 Share(只读分享页),其余渲染 App
App.tsx               # 编排:状态 + 生成/重写/写诗逻辑,装配各步骤组件
Share.tsx             # 公开只读分享页(读 /api/share/<id>)
types.ts
styles.css            # 仅 @import ./styles/* 各分片
styles/               # 拆分后的样式:base / data / report / wizard / panels
components/
  Steps.tsx           # 顶部步骤指示器
  StepLLM.tsx         # ① LLM 接口 + 邀请码
  StepData.tsx        # ② 登录 / 上传 / 勾选 / 导出
  StepInfo.tsx        # ③ 年龄/性别/学校/补充
  Results.tsx         # ④ 报告面板 + 分享条 + 两个诗面板
  PoemPanel.tsx       # 单首诗 + 重写框
lib/
  api.ts              # 后端 API 客户端(/api/me、/api/report(/revise)、/api/poem、
                      #   /api/invite、/api/report/saved、/api/share、分享链接)
  parse.ts            # 上传文件的 JSON/CSV 解析与归一化
  llm.ts              # 通用 SSE 流式封装 + streamReport/streamRevise/streamPoem
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
