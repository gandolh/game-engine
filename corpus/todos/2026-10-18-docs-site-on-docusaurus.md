# Move the docs site from Starlight to Docusaurus

status: todo
created: 2026-10-18
context: the owner's decision of 2026-10-18 to move every project's docs site to Docusaurus; one spec per repo.

## Why

`docs/` (`@game-engine/docs-site`, served at `/game-engine/docs/`) is an Astro
Starlight site. The owner decided on 2026-10-18 to move every project's docs site
to Docusaurus. This is the game-engine part.

The recipe is written and verified. The `corpus-docs-site` skill
(personal-skills v0.31.0, source in
`~/projects/my-personal-skills/skills/corpus-docs-site/`) now scaffolds
Docusaurus 3.10, and `references/migrating-from-starlight.md` beside it holds
the file, config and content maps plus ten gotchas, each hit during a real
port. **Read that guide first.** Its `references/` folder has React versions of
this site's components: `Hero.tsx` (the splash hero), `Metrics.tsx`,
`Cards.tsx` (`Card`/`CardGrid`) and `Diagram.tsx`. If the installed plugin is
older than v0.31.0, read them from the source path.

## What the site has today (checked 2026-10-18)

- Base `/game-engine/docs/` (`DOCS_BASE ??`), light only (both `Theme*.astro`
  overrides), 26 sidebar links.
- Seven authored pages:
  - `index.mdx`: `template: splash`, a `hero:` with two actions
    (primary/minimal), `Metrics`, cards;
  - `architecture.mdx`: `LayerStack`, `Diagram` (one archify diagram),
    `Metrics`, cards;
  - `patterns.mdx`: two `<Steps>` blocks;
  - `games/{farm,citadel,hollow,mathquest}.mdx`: `Metrics` (imported as
    `../../../components/…`), cards, `<Aside>`, and ten
    `<Badge text variant>` badges in total.
- Starlight components used: `Card`, `CardGrid` (cards carry `icon=` props),
  `Aside` (bare, `type="tip"`, `type="note"`), `Badge` (variants `success`,
  `tip`, `note`) and `Steps`.
- `scripts/sync-corpus.mjs` already **discovers** pages, with a `DENY` set that
  drops working notes, scratch, deprecated pages and `log.md`. Keep that cut.
- `src/styles/theme.css` is small (21 lines): the farm-green accent.
- No TypeDoc or Compodoc, on purpose (see `docs/README.md`).
- Wiring: root `package.json` scripts `docs` (`turbo run docs`) and `docs:dev`
  (`npm run dev -w @game-engine/docs-site`), a `turbo.json` `docs` task whose
  comment says `astro build`, and root `.gitignore` lines for `docs/dist/`,
  `docs/.astro/` and `docs/src/content/docs/wiki/`.

**Built through Docusaurus on 2026-10-18.** All 30 corpus pages built through
the new sync in `markdown.format: 'detect'` mode. That was without the `DENY`
cut; with it there are fewer. In MDX mode the corpus does not compile. There was
one broken-anchor warning: a link to
`citadel-decisions.md#2026-07-10-second-grilling-session-21-26`, whose heading
no longer produces that id. Fix it in the corpus.

## What to do

1. **Baseline.** `npm run docs`, then save
   `(cd docs/dist && find . -name index.html | sort) > /tmp/ge-routes-before.txt`.
2. **Config.** Write `docs/docusaurus.config.ts` from the skill's reference.
   Set baseUrl `process.env.DOCS_BASE ?? '/game-engine/docs/'`,
   `trailingSlash: true`, `routeBasePath: '/'`, `markdown.format: 'detect'`,
   light-only `colorMode`, local search, and the GitHub navbar item. Port the
   sidebar to `docs/sidebars.ts`. Docusaurus reads content from
   `docs/docs/` (the site lives in `docs/`). `README.md`, `getting-started.md`,
   `games.md` and `images/` stay where they are, and the build ignores them.
   Delete `astro.config.mjs`, `src/content.config.ts` and both `Theme*.astro`.
3. **package.json** per the guide: no `"type": "module"`, keep the
   `browserslist`, and add `start`, `dev` (kept for the root `docs:dev`),
   `docs` (`… && docusaurus build --out-dir dist`) and `typecheck`. Drop
   `astro`, `@astrojs/starlight` and `sharp`. Pin every new dependency to an
   exact version, with no `^` or `~` (a locked convention here; the guide's
   template uses ranges).
4. **Landing page.** `index.mdx` moves to `src/pages/index.mdx` with `<Hero>`
   (two actions, variants kept) and no sidebar, as splash had.
5. **Other pages.** The rest move to `docs/docs/` (`games/` included). Make
   these swaps:
   - `Card`/`CardGrid` come from the skill's `Cards.tsx`, and the `icon=`
     props are dropped;
   - `<Aside>` becomes `:::note`, and `<Aside type="tip">` becomes `:::tip`;
   - `<Badge text variant>` keeps its markup through a five-line `Badge.tsx`
     that maps `note`→`badge--secondary`, `tip`→`badge--primary`,
     `success`→`badge--success`, `caution`→`badge--warning`,
     `danger`→`badge--danger`;
   - `<Steps>` becomes a `<div className="doc-steps">` around the ordered
     list, with a few lines of CSS for numbered circles, or a plain ordered
     list if that reads fine;
   - imports become `@site/src/components/X` at any depth.
   Port `LayerStack.astro` to React with a CSS module (literal light colours
   stay). Use the skill's `Metrics.tsx` and `Diagram.tsx`.
   `git mv public/diagrams static/diagrams`, and point `build-diagrams.mjs` at
   it.
6. **Sync.** Start from the skill's `sync-corpus.mjs` (links resolved per
   source page, `docs/wiki/` output, Docusaurus frontmatter) and copy this
   site's `DENY` entries into the reference script's own `DENY` set. `GITHUB_REPO` is this repo's
   GitHub URL. The corpus has no cross-repo links.
7. **Theme.** Port the accent to `src/css/custom.css`. Use the skill's
   reference with the seven `--ifm-color-primary*` shades derived from
   `#3e8948`. Add the `.doc-steps` and badge touches.
8. **Wiring.**
   - root `.gitignore`: `docs/.astro/` → `docs/.docusaurus/`,
     `docs/src/content/docs/wiki/` → `docs/docs/wiki/`;
   - the `turbo.json` `docs` comment: `astro build` → `docusaurus build`
     (inputs and outputs stay valid);
   - `README.md` line 73 ("The Starlight docs site");
   - `corpus/routing.md` line 42 ("Starlight HTML");
   - `docs/README.md` (the Starlight paragraphs and the `src/content/docs/…`
     paths, which become `docs/…`).
9. **Anchor.** Fix the stale `#2026-07-10-second-grilling-session-21-26` link
   in the corpus.

## Acceptance

- `npm run docs` (turbo) exits 0 with `onBrokenLinks: 'throw'` and no
  broken-anchor warning.
- Route parity: the new route list equals `/tmp/ge-routes-before.txt` plus
  `./search/index.html`.
- `grep -c '/game-engine/docs/assets/' docs/dist/index.html` is non-zero, and
  `grep -rl '_astro' docs/dist` finds nothing.
- `npm run typecheck -w @game-engine/docs-site`, plus the repo's
  `npm run typecheck` and `npm run test`, pass.
- Browser check, with `docs/dist` served at `/game-engine/docs/` by a plain
  static server (not `docusaurus serve`):
  - the landing page shows the hero, stat tiles and cards with no sidebar;
  - `/architecture/` (LayerStack + diagram) renders;
  - `/patterns/` shows numbered steps;
  - each game page shows its badges;
  - there is no theme toggle;
  - search returns results.
  Screenshot the landing page and one game page.
- `bash corpus/lint.sh` passes.

## Out of scope

- Deploying. vps-deploy's brief 11 switches the `game-engine` docs stack's
  check from `_astro/` to `assets/`; the owner deploys after that.
- New content, and the deliberate absence of an API reference.
