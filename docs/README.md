# @game-engine/docs-site

A light-themed [Starlight](https://starlight.astro.build/) documentation site for
this monorepo — an **introduction and showcase** for the shared ECS engine and
the games built on it (Farm Valley, Citadel, and the WIP Hollow).

## The contract

This is a **narrative-only** site with a single source-of-truth rule:

- **Authored showcase** (`src/content/docs/*.mdx`) — the hand-written intro,
  architecture, patterns/techniques, and per-game pages. Edit these directly.
- **Synced corpus depth** (`src/content/docs/wiki/*`) — **generated** from
  `corpus/` by [`scripts/sync-corpus.mjs`](scripts/sync-corpus.mjs) on every
  build. **Never edit these** — they are overwritten. Edit the source in
  [`corpus/`](../corpus/) instead.

The sync is a **curated subset**: a `DENY` set in the sync script drops
working-notes / scratch / deprecated pages (and `log.md`) so only durable design
pages become browsable depth. Change the cut by editing that one set.

> There is intentionally **no generated API reference** (no TypeDoc/Compodoc):
> the engine packages are consumed only inside this monorepo, so auto-generated
> API docs would be noise. The site is the *design* story, not the type surface.

## Commands

Run from `docs/` (or via the root `npm run docs` / turbo `docs` task):

```bash
npm run sync-corpus   # render corpus/ → src/content/docs/wiki/ (runs before dev/docs)
npm run dev           # local dev server (predev syncs first)
npm run docs          # sync + astro build → dist/
npm run preview       # serve the built dist/
```

Light-theme-only by design: the theme toggle is removed and the palette accent
is EDG32 farm green. All generated artifacts (`dist/`, `.astro/`,
`src/content/docs/wiki/`) are gitignored.
