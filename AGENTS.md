# Atoms Demo

Agent app builder demo built with Next.js and a custom Node server. No database is used; runtime state lives in `data/*.json` and ignored runtime folders.

## Commands

- `npm run dev` starts the app via `node server.mjs`, not `next dev`.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run build` runs `next build`.
- `npm run lint` runs `next lint`, though no custom ESLint config is currently included.

No test framework is configured.

## Architecture

- `server.mjs`: custom Node HTTP server wrapping Next.js. It also hosts WebSocket servers for PTY terminals (`/api/pty`) and agent event streaming (`/api/agent-events`), plus a file watcher for OpenCode event files and a `/opencode-hook` HTTP endpoint.
- `app/`: Next.js App Router. Root page redirects to `/workspace` when authenticated or `/login` otherwise.
- `components/`: UI components such as `BuilderWorkspace`, `PreviewApp`, `BrowserPtyTerminal`, and `AuthForm`.
- `lib/`: service modules for auth, JSON storage, agent runs, terminal sessions, OpenCode process handling, and shared types.
- `data/`: runtime JSON files and generated OpenCode events. These are ignored by git except `data/.gitkeep`.
- `.opencode/`: OpenCode agent monitor plugin. `scripts/patch-opencode-agent-monitor.mjs` keeps the plugin patch idempotent.

## Key Notes

- `next.config.mjs` sets `distDir: ".next-app"` instead of the default `.next`.
- `tsconfig.json` has `allowJs: false`; `server.mjs` and scripts are plain JavaScript outside TypeScript compilation.
- Path alias: `@/*` maps to `./*`.
- `node-pty` is a native addon and may need C++ build tools during installation.
- WebSocket endpoints (`/api/pty`, `/api/agent-events`) reject non-localhost connections.
- The PTY shell is `powershell.exe` on Windows, otherwise `$SHELL` or `bash`.
