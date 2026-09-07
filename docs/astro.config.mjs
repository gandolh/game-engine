import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

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
const base = process.env.DOCS_BASE ?? '/game-engine/docs/'

export default defineConfig({
  base,
  integrations: [
    starlight({
      title: 'Game Engine',
      description:
        'Four games on one shared TypeScript ECS engine — deterministic sim, BDI agents, procedural pixel art.',
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
            { label: 'Glossary', link: '/wiki/glossary/' },
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
