# Game Engine docs

Start with the [main README](../README.md). This folder is two things: the guides and images the README links to, and the workspace that builds the docs site.

| File | What it covers |
|---|---|
| [getting-started.md](getting-started.md) | Prerequisites, running each game, ports and env vars, tests and gates, the headless sims, where the code lives |
| [games.md](games.md) | The four games in more detail, where each runs and where each is deployed |
| [images/](images/shots.md) | The screenshots and GIF used in the README, and how each was made |

Going deeper:

- Docs site: <https://gandolh.ro/game-engine/docs/>, built from this folder. Start with [the engine](https://gandolh.ro/game-engine/docs/architecture/) and [patterns and techniques](https://gandolh.ro/game-engine/docs/patterns/).
- Design wiki: [corpus/](../corpus/index.md), with the decisions, the status and the work queue.

## The docs site (`@game-engine/docs-site`)

A light-themed [Starlight](https://starlight.astro.build/) site that introduces the shared ECS engine and the four games built on it (Farm Valley, Citadel, Hollow and MateQuest). `README.md`, `getting-started.md`, `games.md` and `images/` sit beside the site files; the site build does not read them.

### The contract

The site is narrative only, with one source-of-truth rule:

- **Authored showcase** (`src/content/docs/*.mdx`): the hand-written intro, architecture, patterns and techniques, and per-game pages. Edit these directly.
- **Synced corpus depth** (`src/content/docs/wiki/*`): generated from `corpus/` by [`scripts/sync-corpus.mjs`](scripts/sync-corpus.mjs) on every build. Never edit these; they are overwritten. Edit the source in [`corpus/`](../corpus/) instead.

The sync is a curated subset. A `DENY` set in the sync script drops working notes, scratch and deprecated pages (and `log.md`), so only durable design pages become browsable. Change the cut by editing that one set.

There is no generated API reference (no TypeDoc or Compodoc) on purpose. The engine packages are used only inside this monorepo, so generated API docs would be noise. The site tells the design story, not the type surface.

Diagram sources live in [`diagrams/`](diagrams/) as archify JSON; [`scripts/build-diagrams.mjs`](scripts/build-diagrams.mjs) renders them to `public/diagrams/` when archify is installed and otherwise checks that the committed HTML is there.

### Commands

Run from `docs/` (or use the root `npm run docs`, which runs the turbo `docs` task):

```bash
npm run sync-corpus   # render corpus/ into src/content/docs/wiki/ (runs before dev and docs)
npm run dev           # local dev server (predev syncs first)
npm run docs          # sync + astro build → dist/
npm run preview       # serve the built dist/
```

The site is light-theme only by design: the theme toggle is removed, and the accent is EDG32 farm green. The base path `/game-engine/docs/` is set in [astro.config.mjs](astro.config.mjs); `DOCS_BASE` overrides it. All generated output (`dist/`, `.astro/`, `src/content/docs/wiki/`) is gitignored.
