# Atoms Next.js Template

This project is the default OpenCode workspace template for Atoms. Treat these instructions as the source of truth for all future agent work inside projects created from this template.

## Tech Stack

- Next.js App Router.
- React 18.
- TypeScript.
- Tailwind CSS v4 utilities through `app/globals.css` and `postcss.config.mjs`.
- No database or backend service is included by default.

## Commands

- `npm run dev` starts the preview server with `next dev -H 0.0.0.0`.
- `npm run build` builds the app with `next build`.
- `npm run start` starts the production server with `next start -H 0.0.0.0`.
- `npm run typecheck` runs `tsc --noEmit`.

## Implementation Rules

- Keep all future work centered on this stack unless the user explicitly asks to migrate.
- Prefer editing `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, or components imported by the root page.
- Any visual or product change must be visible immediately at the root preview URL `/`.
- Do not implement requested features only behind a new route such as `/weather`, `/dashboard`, or another suffix route unless the user explicitly asks for multiple pages.
- If a new route is truly necessary, the root page must still show the new experience directly, link to it prominently, or redirect to it so the user can see the change without manually adding a URL suffix.
- Keep the app runnable after each change. Run `npm run typecheck` when TypeScript or component code changes.
- Use the existing App Router conventions and TypeScript types instead of introducing a different framework or routing style.
