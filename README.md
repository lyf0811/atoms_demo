# Atoms Demo

A semi-real MVP demo of an agent app builder inspired by atoms.dev.

The demo includes:

- Local JSON-backed registration and login.
- HTTP-only cookie sessions.
- A protected builder workspace.
- Agent workflow playback from prompt to plan, code, tests, preview, and fake deploy.
- A safe React preview renderer instead of arbitrary user code execution.
- Follow-up chat that updates the generated code and preview state.

## Run Locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3100`.

On a cloud server, bind to all interfaces explicitly:

```bash
HOST=0.0.0.0 PORT=3100 npm run dev
```

Do not rely on the Linux `HOSTNAME` environment variable; it is usually the machine name, not a bind address.
If your shell or process manager sets `HOST` to the machine name, override it with `HOST=0.0.0.0`.

When using `npm run dev` through a public IP or domain, allow that origin for Next.js dev resources:

```bash
ALLOWED_DEV_ORIGINS=139.224.48.71 COOKIE_SECURE=false HOST=0.0.0.0 PORT=3100 npm run dev
```

For multiple hosts, separate them with commas:

```bash
ALLOWED_DEV_ORIGINS=139.224.48.71,example.com COOKIE_SECURE=false HOST=0.0.0.0 PORT=3100 npm run dev
```

Remote browser terminals use WebSockets. Public WebSocket requests must be authenticated with the login cookie. For an unsafe temporary demo-only bypass, set `ATOMS_ALLOW_REMOTE_WS=true`.

Local user, session, and run data are written under `data/*.json`. Those files are ignored by git.

If you start the server from outside the project directory, runtime data still defaults to this repo's `data/` folder. You can override it with:

```bash
ATOMS_DATA_DIR=/absolute/path/to/data npm run start
```

When testing a production build over plain HTTP, disable secure cookies:

```bash
COOKIE_SECURE=false npm run start
```

Use HTTPS in real production instead of disabling secure cookies.

## Useful Checks

```bash
npm run typecheck
npm run build
```

## Demo Limits

This is intentionally a product demo MVP. It does not run arbitrary generated code, deploy real apps, send emails, reset passwords, or use a database. The local JSON repositories are isolated behind service modules so they can later be replaced with a database, real LLM agent, sandboxed runner, and production deploy provider.
