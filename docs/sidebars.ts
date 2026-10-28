import type { SidebarsConfig } from '@docusaurus/plugin-content-docs'

// Ported from the Starlight sidebar (same groups, labels and order). Doc items
// are checked at build time: an entry for a page that does not exist fails the
// build instead of rendering a dead link. Doc ids are paths under docs/ without
// the extension (docs/wiki/status.md → 'wiki/status'). The synced corpus pages
// not listed here are still built and reachable by link and search, as before.
const sidebars: SidebarsConfig = {
  docs: [
    {
      type: 'category',
      label: 'Start here',
      collapsible: false,
      items: [
        // The landing is src/pages/index.mdx, a page (no sidebar, like splash).
        { type: 'link', label: 'Overview', href: '/' },
        { type: 'doc', id: 'architecture', label: 'The engine' },
        { type: 'doc', id: 'patterns', label: 'Patterns & techniques' },
      ],
    },
    {
      type: 'category',
      label: 'The games',
      collapsible: false,
      items: [
        { type: 'doc', id: 'games/farm', label: 'Farm Valley' },
        { type: 'doc', id: 'games/citadel', label: 'Citadel' },
        { type: 'doc', id: 'games/hollow', label: 'Hollow' },
        { type: 'doc', id: 'games/mathquest', label: 'MateQuest' },
      ],
    },
    {
      type: 'category',
      label: 'Design corpus',
      collapsed: true,
      items: [
        { type: 'doc', id: 'wiki/architecture', label: 'Architecture' },
        { type: 'doc', id: 'wiki/decisions', label: 'Decisions' },
        { type: 'doc', id: 'wiki/glossary', label: 'Glossary' },
        { type: 'doc', id: 'wiki/system-ordering', label: 'System ordering' },
        { type: 'doc', id: 'wiki/world-generation', label: 'World generation' },
        { type: 'doc', id: 'wiki/economy', label: 'Economy' },
        { type: 'doc', id: 'wiki/performance', label: 'Performance' },
        { type: 'doc', id: 'wiki/engine-ui', label: 'Engine UI' },
        { type: 'doc', id: 'wiki/asset-pipeline', label: 'Asset pipeline' },
        { type: 'doc', id: 'wiki/animation', label: 'Animation' },
        { type: 'doc', id: 'wiki/player-and-interaction', label: 'Player & interaction' },
        { type: 'doc', id: 'wiki/open-questions', label: 'Open questions' },
      ],
    },
    {
      type: 'category',
      label: 'Per-game corpus',
      collapsed: true,
      items: [
        { type: 'doc', id: 'wiki/overview', label: 'Farm overview' },
        { type: 'doc', id: 'wiki/citadel-overview', label: 'Citadel overview' },
        { type: 'doc', id: 'wiki/citadel-decisions', label: 'Citadel decisions' },
        { type: 'doc', id: 'wiki/citadel-rendering', label: 'Citadel rendering' },
        { type: 'doc', id: 'wiki/hollow-overview', label: 'Hollow overview' },
        { type: 'doc', id: 'wiki/mathquest-overview', label: 'MateQuest overview' },
      ],
    },
    {
      type: 'category',
      label: 'Status',
      collapsible: false,
      items: [{ type: 'doc', id: 'wiki/status', label: 'Where things stand' }],
    },
  ],
}

export default sidebars
