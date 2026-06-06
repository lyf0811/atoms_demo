# Atoms Demo 项目文档

## 1. 项目概述

Atoms Demo 是一个类 atoms.dev 的 Agent App Builder 演示项目。它的目标是让用户注册/登录后进入工作台，通过左侧 Chat 与本地 Agent 交互，并在右侧查看项目代码、实时预览、发布到市场以及从市场复制项目。

当前版本是一个半真实 MVP：

- 账号和会话使用本地 JSON 文件存储，不使用数据库。
- 工作台支持多用户、多项目。
- 每个项目有独立的代码空间和 Chat 记录。
- 浏览器内嵌真实本地终端，并自动进入 opencode。
- Chat 输入会真实写入 opencode 终端。
- Agent 输出通过 opencode 事件文件和 WebSocket 同步到 Chat 面板。
- Code 面板展示当前项目文件树和文件内容。
- Preview 面板会在当前项目目录下执行 `npm install`、`npm run build`、`npm run dev`，并在 iframe 中预览。
- Market 可以发布项目，也可以把市场项目复制为当前用户的新项目。
- Code 面板支持导出当前项目代码为 zip。

## 2. 技术栈

- Next.js App Router
- React 18
- TypeScript
- Custom Node HTTP server
- WebSocket
- node-pty
- xterm.js
- opencode
- @principal-ai/agent-hooks
- adm-zip
- lucide-react
- 本地 JSON 文件存储

项目不是直接运行 `next dev`，而是通过 `server.mjs` 启动自定义 Node 服务：

```bash
npm run dev
```

等价于：

```bash
node server.mjs
```

## 3. 目录结构

```text
atoms_demo/
  app/
    api/
      auth/                 登录、注册、退出、当前用户
      projects/             用户项目列表、新建、删除
      market/projects/      市场项目发布、应用
      preview/start/        项目预览构建和启动
      workspace/            文件列表、文件读取、代码导出
      runs/                 早期模拟 agent run 接口
      terminal/             早期终端接口
      agent/opencode/       opencode 相关接口
    login/
    register/
    workspace/
    globals.css
    layout.tsx
    page.tsx
  components/
    AuthForm.tsx
    BrowserPtyTerminal.tsx
    BuilderWorkspace.tsx
    PreviewApp.tsx
  lib/
    auth.ts
    workspace.ts
    market.ts
    preview-processes.ts
    terminal-processes.ts
    storage.ts
    types.ts
    agent.ts
    opencode.ts
    terminal.ts
  templates/
    nextjs-base/            新用户/新项目的默认 Next.js + Tailwind 模板
  scripts/
    patch-opencode-agent-monitor.mjs
  data/
    users.json              用户数据，运行时生成
    sessions.json           会话数据，运行时生成
    workspaces/             用户项目代码空间，运行时生成
    market/                 市场项目快照，运行时生成
    opencode-agent-events/  opencode 事件和对话记录，运行时生成
  server.mjs
  next.config.mjs
  package.json
```

`data/` 下大部分内容是运行时数据，默认不提交到 git。

## 4. 启动与常用命令

### 本地开发

```bash
npm install
npm run dev
```

默认访问：

```text
http://localhost:3100
```

### 类型检查

```bash
npm run typecheck
```

### 构建

```bash
npm run build
```

### 生产启动

```bash
npm run start
```

### 云服务器开发态启动

```bash
ALLOWED_DEV_ORIGINS=your.domain.or.ip COOKIE_SECURE=false HOST=0.0.0.0 PORT=3100 npm run dev
```

如果使用公网 IP 访问 Next.js dev server，需要配置 `ALLOWED_DEV_ORIGINS`，否则 Next.js 会拦截 dev 资源。

## 5. 环境变量

| 变量 | 说明 |
| --- | --- |
| `HOST` / `APP_HOST` | Node 服务绑定地址，服务器上通常设为 `0.0.0.0` |
| `PORT` | 主应用端口，默认 `3100` |
| `ALLOWED_DEV_ORIGINS` | Next.js dev 允许的访问源，多个用逗号分隔 |
| `COOKIE_SECURE` | 是否使用 secure cookie，HTTP 测试时可设为 `false` |
| `ATOMS_DATA_DIR` | 覆盖默认运行时数据目录 |
| `ATOMS_WORKSPACE_TEMPLATE_DIR` | 覆盖默认项目模板目录 |
| `ATOMS_ALLOW_REMOTE_WS` | 临时允许远程 WebSocket，演示环境谨慎使用 |
| `OPENCODE_EVENT_BASE_DIR` | opencode 事件基础目录 |
| `OPENCODE_EVENT_DIR` | opencode raw 事件目录 |
| `OPENCODE_HOOK_PORT` | opencode hook 端口，默认跟主服务端口一致 |

## 6. 自定义服务 server.mjs

`server.mjs` 是项目的核心运行入口，它做了这些事：

- 准备并挂载 Next.js app。
- 创建 HTTP server。
- 挂载浏览器 PTY WebSocket：`/api/pty`。
- 挂载 Agent event WebSocket：`/api/agent-events`。
- 监听 opencode agent event 文件。
- 提供 `/opencode-hook` HTTP endpoint。
- 自动为 terminal 设置用户和项目环境变量。
- 在 terminal 中进入当前用户项目空间并启动 opencode。

### WebSocket 安全

WebSocket 请求会尝试识别登录 cookie。远程访问时需要已经登录，否则会被拒绝。

### Terminal 工作目录

每个用户项目的 terminal cwd 是：

```text
data/workspaces/<userId>/projects/<projectId>
```

启动 terminal 后，服务会设置：

```text
ATOMS_USER_ID
ATOMS_PROJECT_ID
ATOMS_WORKSPACE_DIR
OPENCODE_EVENT_BASE_DIR
OPENCODE_EVENT_DIR
OPENCODE_HOOK_PORT
```

然后启动：

```bash
opencode <当前项目目录>
```

## 7. 认证模块

认证逻辑在 `lib/auth.ts` 和 `app/api/auth/*` 中。

### 数据文件

```text
data/users.json
data/sessions.json
```

### 接口

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/auth/register` | POST | 注册用户，写入 users.json，并自动登录 |
| `/api/auth/login` | POST | 登录，写入 HTTP-only cookie |
| `/api/auth/logout` | POST | 删除会话 cookie |
| `/api/auth/me` | GET | 获取当前用户 |

### 密码安全

密码不会明文保存。当前使用 Node crypto 做 hash 存储，适合 demo；如果正式上线，建议迁移到 bcrypt/argon2。

## 8. 用户项目系统

项目逻辑主要在 `lib/workspace.ts`。

每个用户可以拥有多个项目：

```text
data/workspaces/<userId>/
  projects.json
  projects/
    default/
    <projectId>/
```

### 功能

- 列出用户项目
- 新建项目
- 删除项目
- 切换项目
- 每个项目独立 code/chat/preview
- 注册用户时自动创建 default project
- 新项目自动复制 `templates/nextjs-base`

### 删除项目

删除项目会先：

1. 停止该项目 terminal/opencode PTY。
2. 停止该项目 preview 进程。
3. 释放 preview 端口 `3000`。
4. 从 `projects.json` 移除项目。
5. 后台重试删除目录，避免 Windows 文件锁导致 UI 删除失败。

## 9. Chat 与 opencode 集成

### 前端

主要组件：

```text
components/BuilderWorkspace.tsx
components/BrowserPtyTerminal.tsx
```

Builder 左侧 Chat 输入会通过浏览器事件发送到 terminal：

```ts
window.dispatchEvent(new CustomEvent("atoms-terminal-input", { detail: { data: `${message}\r` } }))
```

`BrowserPtyTerminal` 接收到后通过 WebSocket 写入 PTY。

### Chat 可输入状态

Chat 不是 terminal 一连接就允许输入。

流程是：

1. terminal connecting
2. opencode starting
3. opencode connected
4. 等待 5 秒 warmup
5. Chat input 解锁

loading 效果显示在输入框内部。

### Agent 输出

Agent 输出有两条来源：

- opencode terminal stdout 中解析到的 JSON/text。
- opencode agent event 文件 watcher 读取的事件。

服务端会把输出归档到：

```text
data/opencode-agent-events/conversations/<userId>/<projectId>/*.json
```

因此切换用户或项目后，Chat 会加载对应的记录。

## 10. Code 面板

Code 面板功能位于 `BuilderWorkspace`，数据来自：

| 接口 | 说明 |
| --- | --- |
| `/api/workspace/files?projectId=...` | 获取当前项目文件树 |
| `/api/workspace/read?projectId=...&path=...` | 读取单个文件 |
| `/api/workspace/export?projectId=...` | 导出当前项目代码 zip |

文件树会跳过：

- 隐藏文件/目录
- `node_modules`
- 超过最大深度的目录

导出 zip 使用 `adm-zip`，导出范围和 Code 面板展示范围保持一致。

## 11. Preview 面板

Preview 启动接口：

```text
POST /api/preview/start
```

请求体：

```json
{
  "path": "app/page.tsx",
  "restart": false,
  "projectId": "default"
}
```

服务端会：

1. 找到当前文件最近的 `package.json` 目录。
2. 必要时执行 `npm install`。
3. 执行 `npm run build`。
4. 执行 `npm run dev`。
5. 监听 ready 日志。
6. iframe 指向 `http://<当前 host>:3000`。

Preview 端口固定为：

```text
3000
```

每次启动 preview 前会尝试释放 `3000`，避免历史进程占用。

## 12. Market 市场

Market 逻辑主要在：

```text
lib/market.ts
app/api/market/projects/route.ts
app/api/market/projects/[id]/apply/route.ts
```

### 发布项目

从 Code/Preview 面板点击“发布至市场”，输入：

- 项目名称
- 项目介绍

服务会复制：

- 当前项目 code
- 当前项目 chat

到：

```text
data/market/projects/<marketProjectId>/
  code/
  chat/messages.json
```

市场索引：

```text
data/market/projects.json
```

### 应用市场项目

当前只支持：

- 新建项目并应用

也就是为当前用户创建一个新项目，然后复制市场项目的 code/chat。

已移除“覆盖当前项目”能力，避免误删当前项目内容。

## 13. 项目模板

默认模板目录：

```text
templates/nextjs-base
```

用于：

- 用户注册后的默认项目
- 新建项目

模板内包含：

- Next.js
- TypeScript
- Tailwind CSS
- 基础 App Router 页面

如果要替换模板，可以设置：

```bash
ATOMS_WORKSPACE_TEMPLATE_DIR=/absolute/path/to/template
```

## 14. 主要 API 清单

### Auth

| 方法 | 路径 |
| --- | --- |
| POST | `/api/auth/register` |
| POST | `/api/auth/login` |
| POST | `/api/auth/logout` |
| GET | `/api/auth/me` |

### Projects

| 方法 | 路径 |
| --- | --- |
| GET | `/api/projects` |
| POST | `/api/projects` |
| DELETE | `/api/projects/:id` |

### Workspace

| 方法 | 路径 |
| --- | --- |
| GET | `/api/workspace/files` |
| GET | `/api/workspace/read` |
| GET | `/api/workspace/export` |

### Preview

| 方法 | 路径 |
| --- | --- |
| POST | `/api/preview/start` |

### Market

| 方法 | 路径 |
| --- | --- |
| GET | `/api/market/projects` |
| POST | `/api/market/projects` |
| POST | `/api/market/projects/:id/apply` |

### Agent / Terminal

| 类型 | 路径 |
| --- | --- |
| WebSocket | `/api/pty` |
| WebSocket | `/api/agent-events` |
| HTTP | `/opencode-hook` |
| GET/POST | `/api/agent/opencode` |

## 15. 运行时数据说明

常见运行时文件：

```text
data/users.json
data/sessions.json
data/runs.json
data/workspaces/
data/market/
data/opencode-agent-events/
```

这些数据适合本地 demo，不适合正式生产。

正式上线建议替换为：

- PostgreSQL / MySQL / SQLite
- Redis session
- 对象存储保存项目包和市场快照
- 沙箱隔离 preview 执行
- CI/CD 或 Vercel/Cloudflare Deploy

## 16. 部署注意事项

### 云服务器端口

主应用端口默认：

```text
3100
```

Preview 项目端口默认：

```text
3000
```

服务器安全组需要按需放开端口。

### Cookie

如果使用 HTTP 测试：

```bash
COOKIE_SECURE=false
```

正式生产建议使用 HTTPS，不要关闭 secure cookie。

### WebSocket

浏览器 terminal 和 agent events 都依赖 WebSocket。

如果通过 Nginx 反代，需要支持 Upgrade：

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

### opencode

服务器需要安装并配置 opencode，且启动进程的 PATH 能找到 `opencode` 命令。

可以用：

```bash
opencode --version
```

确认是否可用。

## 17. 常见问题

### 1. 服务器上 Next.js dev 资源被拦截

报错类似：

```text
Blocked cross-origin request to Next.js dev resource
```

启动时加：

```bash
ALLOWED_DEV_ORIGINS=your.ip.or.domain HOST=0.0.0.0 PORT=3100 npm run dev
```

### 2. Terminal websocket error

检查：

- 是否已登录
- WebSocket 是否被代理阻断
- 服务器是否允许远程 WebSocket
- cookie 是否能正常发送

### 3. Preview 启动失败

检查：

- 当前项目是否有 `package.json`
- `npm install` 是否成功
- `npm run build` 是否成功
- `3000` 端口是否被其它进程占用

项目会尝试自动释放 `3000`，但如果系统权限不足，需要手动关闭占用进程。

### 4. 删除项目失败

项目删除前会主动停止 terminal/preview，并在后台重试清理目录。Windows 文件锁可能导致目录稍后才被完全删除，但 UI 项目列表会先更新。

### 5. Chat 不能输入

Chat 输入需要等待：

1. terminal 连接
2. opencode 启动
3. connected 后 5 秒 warmup

期间输入框内会显示 loading。

## 18. 后续可优化方向

- 用数据库替换本地 JSON。
- 用真实用户权限系统替换 demo session。
- 为 preview 引入容器或沙箱隔离。
- 将 market 项目存到对象存储。
- 加入真实部署 provider。
- 加入任务队列管理 build/preview。
- 增加项目版本管理。
- 增加更完整的审计日志。
- 增加 Playwright E2E 测试。
- 增加 UI 组件测试。

