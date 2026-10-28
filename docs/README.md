# Game Engine docs

Start with the [main README](../README.md). This folder is two things: the guides and images the README links to, and the workspace that builds the docs site.

| File | What it covers |
|---|---|
| [getting-started.md](getting-started.md) | Prerequisites, running each game, ports and env vars, tests and gates, the headless sims, where the code lives |
| [games.md](games.md) | The four games in more detail, where each runs and where each is deployed |
| [images/](images/shots.md) | The screenshots and GIF used in the README, and how each was made |

Going deeper:

- Docs site: `/game-engine/docs/`, built from this folder. Start with [the engine](docs/architecture.mdx) and [patterns and techniques](docs/patterns.mdx).
- Design wiki: [corpus/](../corpus/index.md), with the decisions, the status and the work queue.

## The docs site (`@game-engine/docs-site`)

A light-themed [Docusaurus](https://docusaurus.io/) site that introduces the shared ECS engine and the four games built on it (Farm Valley, Citadel, Hollow and MateQuest). `README.md`, `getting-started.md`, `games.md` and `images/` sit beside the site files; the site build does not read them.

### The contract

The site is narrative only, with one source-of-truth rule:

- **Authored showcase**: the landing page (`src/pages/index.mdx`, a page with no sidebar) and the hand-written architecture, patterns and techniques, and per-game pages (`docs/*.mdx`, `docs/games/*.mdx`). Edit these directly. Components live in `src/components/` and are imported as `@site/src/components/X`.
- **Synced corpus depth** (`docs/wiki/*`): generated from `corpus/` by [`scripts/sync-corpus.mjs`](scripts/sync-corpus.mjs) on every build. Never edit these; they are overwritten. Edit the source in [`corpus/`](../corpus/) instead.

The sync is a curated subset. A `DENY` set in the sync script drops working notes, scratch and deprecated pages (and `log.md`), so only durable design pages become browsable. Change the cut by editing that one set.

There is no generated API reference (no TypeDoc or Compodoc) on purpose. The engine packages are used only inside this monorepo, so generated API docs would be noise. The site tells the design story, not the type surface.

Diagram sources live in [`diagrams/`](diagrams/) as archify JSON; [`scripts/build-diagrams.mjs`](scripts/build-diagrams.mjs) renders them to `static/diagrams/` when archify is installed and otherwise checks that the committed HTML is there.

### Commands

Run from `docs/` (or use the root `npm run docs`, which runs the turbo `docs` task):

```bash
npm run sync-corpus   # render corpus/ into docs/wiki/ (runs before start and docs)
npm run dev           # local dev server (= npm run start; prestart syncs first)
npm run docs          # sync + docusaurus build → dist/
npm run typecheck     # tsc over the config, sidebars and components
```

The site is light-theme only by design (`themeConfig.colorMode`, no toggle), and the accent is EDG32 farm green ([src/css/custom.css](src/css/custom.css)). The base path `/game-engine/docs/` is set in [docusaurus.config.ts](docusaurus.config.ts); `DOCS_BASE` overrides it. Hashed assets land under `<base>assets/`. Search is local (`@easyops-cn/docusaurus-search-local`), built into `dist/` with the site. All generated output (`dist/`, `.docusaurus/`, `docs/wiki/`) is gitignored.

To preview `dist/` the way the server serves it, mount it at the base path with any plain static server; `docusaurus serve` mangles hashed font URLs when `trailingSlash` is on:

```bash
mkdir -p /tmp/serve/game-engine && ln -sfn "$PWD/dist" /tmp/serve/game-engine/docs
python3 -m http.server 3418 --directory /tmp/serve   # http://localhost:3418/game-engine/docs/
```
