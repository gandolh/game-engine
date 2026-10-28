import type { Config } from '@docusaurus/types'
import type * as Preset from '@docusaurus/preset-classic'

// The deployed base path, baked in rather than injected at deploy time.
//
// vps-deploy ships what this repo already built and VERIFIES this base — it does
// not set it. That is the estate's rule for the case that matters most (Ward's
// UI does the same, see vps-deploy/stacks/ward.ts): a variable the deploy passes
// that changes nothing is a variable that can silently disagree, whereas a value
// baked here and checked there cannot. Build with `npm run docs`; a wrong base
// fails the deploy by name instead of shipping a page whose every asset 404s.
//
// DOCS_BASE still overrides it, for building a copy to serve from somewhere else.
const baseUrl = process.env.DOCS_BASE ?? '/game-engine/docs/'

const config: Config = {
  title: 'Game Engine',
  tagline:
    'Four games on one shared TypeScript ECS engine — deterministic sim, BDI agents, procedural pixel art.',
  url: 'https://example.org', // the origin; only used for absolute URLs (sitemap, og tags)
  baseUrl,
  // Directory-style URLs (/wiki/overview/ → wiki/overview/index.html): what the
  // sub-path static deploy serves, and what the Starlight site used.
  trailingSlash: true,
  // Opt in to the v4 behaviour now (Docusaurus Faster, CSS cascade layers,
  // namespaced storage) so the v4 upgrade is a version bump, not a migration.
  future: { v4: true },
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'warn',
  markdown: {
    // .md (the synced corpus) parses as CommonMark, .mdx (hand-authored) as MDX.
    // 'mdx' for everything breaks on corpus prose: a bare `<` or `{` is JSX.
    format: 'detect',
    hooks: { onBrokenMarkdownLinks: 'throw' },
  },
  i18n: { defaultLocale: 'en', locales: ['en'] },
  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/', // docs-only site: no /docs/ prefix under the base
          sidebarPath: './sidebars.ts',
        },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Preset.Options,
    ],
  ],
  // Local, offline search (Starlight shipped Pagefind; Docusaurus ships nothing).
  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      { hashed: true, docsRouteBasePath: '/', indexBlog: false, indexPages: false },
    ],
  ],
  themeConfig: {
    // Light only: no toggle, and a stored preference is never read.
    colorMode: { defaultMode: 'light', disableSwitch: true, respectPrefersColorScheme: false },
    navbar: {
      title: 'Game Engine',
      items: [{ href: 'https://github.com/gandolh/game-engine', label: 'GitHub', position: 'right' }],
    },
  } satisfies Preset.ThemeConfig,
}

export default config
