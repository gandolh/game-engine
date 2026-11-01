# Move the docs site from Starlight to Docusaurus

status: closed 2026-10-28 — migrated; route parity holds; vps-deploy flip is an owner step
created: 2026-10-18
context: the owner's decision of 2026-10-18 to move every project's docs site to Docusaurus; one spec per repo.
refreshed: 2026-10-23 (skill v0.31.1, route baseline kept in the repo, vps-deploy's generator switch). The owner asked for it again that day; it is the last docs site still on Starlight.

## Why

`docs/` (`@game-engine/docs-site`, served at `/game-engine/docs/`) is an Astro
Starlight site. The owner decided on 2026-10-18 to move every project's docs site
to Docusaurus. This is the game-engine part.

The recipe is written and verified. The `corpus-docs-site` skill
(personal-skills v0.31.1, source in
`my-personal-skills/skills/corpus-docs-site`) now scaffolds
Docusaurus 3.10, and `references/migrating-from-starlight.md` beside it holds
the file, config and content maps plus ten gotchas, each hit during a real
port. **Read that guide first.** Its `references/` folder has React versions of
this site's components: `Hero.tsx` (the splash hero), `Metrics.tsx`,
`Cards.tsx` (`Card`/`CardGrid`) and `Diagram.tsx`. If the installed plugin is
older than v0.31.1, read them from the source path.

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
   `(cd docs/dist && find . -name index.html | sort) > corpus/verify/2026-10-18-docs-site-routes/before.txt`
   (in the repo, not `/tmp`, which a WSL restart wipes).
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
- Route parity: the new route list equals
  `corpus/verify/2026-10-18-docs-site-routes/before.txt` plus
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

- Deploying. vps-deploy's brief 11 is done: each `DocsStack` takes
  `generator: "starlight" | "docusaurus"`. Once this lands, the `game-engine`
  stack in `vps-deploy/app.ts` gets `generator: "docusaurus"`. It is the
  last Starlight site, so `DEFAULT_GENERATOR` can then become `"docusaurus"`.
  That edit and the deploy are owner steps in vps-deploy.
- New content, and the deliberate absence of an API reference.

## Outcome (2026-10-28)

Migrated with the `corpus-docs-site` recipe (personal-skills v0.31.1), on the pins the estate's
other Docusaurus sites use: `@docusaurus/*` 3.10.2, search-local 0.55.3, React 19.2.8, TypeScript
6.0.3 (the root's), all exact.

- **Baseline** taken first: [before.txt](../../verify/2026-10-18-docs-site-routes/before.txt), 27
  routes, built by the Starlight site at `495ad13` (it already held the new `citadel-controls` page).
- **Layout**: config + sidebars in `docs/`, the six authored pages in `docs/docs/` (`games/`
  included), the landing in `src/pages/index.mdx` with `<Hero>` and no sidebar, the diagram moved
  with `git mv` to `static/diagrams/` (byte-identical after `build-diagrams` re-rendered it).
  Astro config, content config, both `Theme*.astro`, and the three `.astro` components are gone.
- **Components**: the skill's `Hero`, `Cards`, `Metrics` (accent `#3e8948`) and `Diagram`; a
  five-line `Badge.tsx` (note/tip/success/caution/danger → Infima classes); `LayerStack.tsx` with a
  CSS module (literal light colours kept). `<Aside>` became `:::note`/`:::tip`/`:::caution`, titles
  kept as `[Title]`; `<Steps>` became `<div className="doc-steps">` with numbered circles on a guide
  line in `custom.css`; card `icon=` props dropped.
- **Sync**: the skill's script with this site's `DENY` (the same eleven slugs, `log` included) and
  `GITHUB_REPO` set. 20 corpus pages synced, no "link leaves the repo" warning.
- **Theme**: the seven `--ifm-color-primary*` shades from `#3e8948` (10/15/30% lightness), light
  only, no toggle.
- **Wiring**: `.gitignore` (`docs/.docusaurus/`, `docs/docs/wiki/`), the `turbo.json` comment,
  README lines 50 and 73, `routing.md` line 42, `docs/README.md` (rewritten for Docusaurus, with
  the static-server preview recipe), and `docs/games.md`'s four links to the old `src/content/docs/`
  paths, which the spec did not list.
- **Anchor**: `citadel-decisions.md` linked `#2026-07-10-second-grilling-session-21-26`; the
  heading's slug drops the en dash and `#`, so the id is `…-session-2126`. Fixed in the corpus. That
  link was broken on GitHub too, which uses the same slugger.

**Acceptance, checked:**

- `npm run docs` (turbo) exits 0 with `onBrokenLinks: 'throw'`; a second build through the
  workspace script printed no warning of any kind (no broken anchor). 21 s through turbo at load
  average 20.
- Route parity: [after.txt](../../verify/2026-10-18-docs-site-routes/after.txt) is `before.txt` plus
  `./search/index.html`, nothing else.
- `grep -c '/game-engine/docs/assets/' docs/dist/index.html` → 1; `grep -rl '_astro' docs/dist`
  finds nothing.
- `npm run typecheck -w @game-engine/docs-site` is clean. Repo gates: see below.
- Browser (Chromium via Playwright, `dist/` symlinked under `/game-engine/docs/` and served by
  `python3 -m http.server`): the landing has the hero with both actions, 5 stat tiles, 8 cards and
  no sidebar; `/architecture/` has the 4 LayerStack rows and the diagram iframe loads its content;
  `/patterns/` has 2 step lists (7 steps) with the counters; the game pages show 2, 2, 3 and 3
  badges (the ten); no theme toggle; a search for "determinism" returns 9 suggestions; no 4xx/5xx
  or page error on any page visited. Screenshots:
  [landing](../../verify/2026-10-18-docs-site-routes/after-landing.png),
  [MateQuest](../../verify/2026-10-18-docs-site-routes/after-mathquest.png),
  [search](../../verify/2026-10-18-docs-site-routes/after-search.png).
- `bash corpus/lint.sh` passes.

`package-lock.json` changed with the install (+21,229 / −6,657 lines: Astro out, Docusaurus in),
written by npm 11.19.1 like the rest of the file (see the
[lockfile spec](2026-10-09-package-lock-drift-engines-node.md)).

**Owner step (vps-deploy, not done here):** in `vps-deploy/app.ts`, give the `game-engine`
`DocsStack` `generator: "docusaurus"`. It was the last Starlight site, so `DEFAULT_GENERATOR` can
become `"docusaurus"` in the same change. Then deploy. Until then the deploy's base check fails by
name ("a Starlight build"), because it looks for `<base>_astro/`.

Code: `b43d881`. **Repo gates** after the install (`npm run gates`, load average 11 to 25): all 8 passed, including
the root typecheck (which now covers `@game-engine/docs-site`) and the full test run.
