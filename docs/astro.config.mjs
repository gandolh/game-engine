import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

// Light-only Starlight over the game-engine corpus. The authored pages (index,
// architecture, patterns, games/*) are the showcase; the /wiki/* pages are
// synced from corpus/ (see scripts/sync-corpus.mjs) as browsable depth.
//
// Sub-path base for a Caddy sub-path deploy (e.g. /game-engine-docs/). Left at
// "/" for `astro preview` and local dev; the vps-deploy build sets DOCS_BASE.
const base = process.env.DOCS_BASE ?? '/'

export default defineConfig({
  base,
  integrations: [
    starlight({
      title: 'Game Engine',
      description:
        'Two-and-a-bit games on one shared TypeScript ECS engine — deterministic sim, BDI agents, procedural pixel art.',
      customCss: ['./src/styles/theme.css'],
      components: {
        ThemeProvider: './src/components/ThemeProvider.astro', // light-only
        ThemeSelect: './src/components/ThemeSelect.astro', // remove toggle
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/gandolh/game-engine' },
      ],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Overview', link: '/' },
            { label: 'The engine', link: '/architecture/' },
            { label: 'Patterns & techniques', link: '/patterns/' },
          ],
        },
        {
          label: 'The games',
          items: [
            { label: 'Farm Valley', link: '/games/farm/' },
            { label: 'Citadel', link: '/games/citadel/' },
            { label: 'Hollow (WIP)', link: '/games/hollow/' },
          ],
        },
        {
          label: 'Design corpus',
          collapsed: true,
          items: [
            { label: 'Architecture', link: '/wiki/architecture/' },
            { label: 'Decisions', link: '/wiki/decisions/' },
            { label: 'System ordering', link: '/wiki/system-ordering/' },
            { label: 'World generation', link: '/wiki/world-generation/' },
            { label: 'Economy', link: '/wiki/economy/' },
            { label: 'Performance', link: '/wiki/performance/' },
            { label: 'Engine UI', link: '/wiki/engine-ui/' },
            { label: 'Asset pipeline', link: '/wiki/asset-pipeline/' },
            { label: 'Animation', link: '/wiki/animation/' },
            { label: 'Player & interaction', link: '/wiki/player-and-interaction/' },
            { label: 'Open questions', link: '/wiki/open-questions/' },
          ],
        },
        {
          label: 'Citadel corpus',
          collapsed: true,
          items: [
            { label: 'Citadel overview', link: '/wiki/citadel-overview/' },
            { label: 'Citadel decisions', link: '/wiki/citadel-decisions/' },
            { label: 'Citadel rendering', link: '/wiki/citadel-rendering/' },
          ],
        },
        {
          label: 'Status',
          items: [{ label: 'Where things stand', link: '/wiki/status/' }],
        },
      ],
    }),
  ],
})
