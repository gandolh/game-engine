# The four games

Each game is a `sim-core` package plus a browser client, built on the shared engine. None of them imports another.

| Game | Sim runs in | Locally | Online | Design page |
|---|---|---|---|---|
| Farm Valley | A Node WebSocket server | `npm run dev`, port 5173 | <https://gandolh.ro/farm-valley/> | [overview.md](../corpus/wiki/overview.md) |
| Citadel | A Web Worker (a server exists for the deprecated multiplayer) | `npm run citadel`, port 5174 | <https://gandolh.ro/citadel/> | [citadel-overview.md](../corpus/wiki/citadel-overview.md) |
| Hollow | A Web Worker | `npm run hollow`, port 5175 | <https://gandolh.ro/hollow/> | [hollow-overview.md](../corpus/wiki/hollow-overview.md) |
| MateQuest | A Web Worker | `npm run mathquest`, port 5176 | not deployed | [mathquest-overview.md](../corpus/wiki/mathquest-overview.md) |

The online builds come from a separate deploy setup and can be older than `main`.

## Farm Valley

You mostly watch. A 240×240 archipelago of rectangular islands, generated from a seed and joined by bridges along a spanning tree plus a few loops. 21 farmers work it for 100 in-game days: four named farmers, sixteen clones of their personalities on their own farm islands, and Pip.

| Farmer | Personality | Style |
|---|---|---|
| Cora | conservative | Plays it safe. Low risk, steady radish income. |
| Atticus | aggressive | Goes big on diverse crops, accepts losses. |
| Hannah | hoarder | Keeps a fat gold reserve, plants when sure. |
| Otto | opportunist | Adapts to weather and prices on the fly. |
| Pip | you | A real farmer entity whose intentions come from the keyboard. |

Each AI farmer is a [BDI agent](https://en.wikipedia.org/wiki/Belief%E2%80%93desire%E2%80%93intention_software_model) (belief, desire, intention). It perceives the world, deliberates and acts within a daily budget of action points. Every option, farming, fishing, foraging or mining, is scored in one unit, gold per action point, so work off the farm competes fairly with crops.

- **Weather and seasons.** A season and day clock drives forecasts. Rain and drought change yields, and a day/night tint washes over the world from dawn to dusk.
- **Market.** Farmers buy seeds and sell 8 crops, radish to grape, at prices that follow supply. A peer-to-peer market wall holds offers in escrow.
- **Mid-game shock.** A blight strikes one random farmer around day 50, wiping their planted crops and reshuffling the standings.
- **Farmers panel.** Shows every farmer's gold, crops, state and remaining action points. Click a farmer to follow them.
- **Pip.** An inspect card, a hotbar you drag from, and a HUD, all drawn with the shared `@engine/ui` toolkit. Pip moves freely; actions still cost action points and need the right tool and an adjacent tile.

More: [the docs site's Farm Valley page](https://gandolh.ro/game-engine/docs/games/farm/), [economy.md](../corpus/wiki/economy.md), [player-and-interaction.md](../corpus/wiki/player-and-interaction.md).

## Citadel

A settlement builder in isometric pixel art. You place homes, farms, a mill and bakery, services and roads, and then read how the town is doing by watching it. The founding dialog offers two rulesets: cozy, where fires burn out, the sick recover and raiders take a little and leave, and challenge, where fire razes, plague kills and a raid can sack your keep. The buildings are 3D meshes written in code and rasterized into the sprite atlas at boot.

Multiplayer exists in the tree but is deprecated; [citadel-mp-deprecated.md](../corpus/wiki/citadel-mp-deprecated.md) lists what is broken. More: [the docs site's Citadel page](https://gandolh.ro/game-engine/docs/games/citadel/), [citadel-decisions.md](../corpus/wiki/citadel-decisions.md).

## Hollow

A town that runs across generations. You choose the founders' archetypes, tune their genes and set a seed, and then watch needs, relationships, births, jobs, leaders and votes, grudges and deaths play out. It is the only game with a 3D layer, drawn by the engine's WebGL2 3D renderer.

It doubles as a research tool. The page has a live chronicle you can filter by event type, metric charts (population, births and deaths, communities, trust and wealth), buttons that apply shocks such as famine, plague or fire, and exports of the metrics, the events and the family tree. An optional hook lets a language model influence some decisions; it is off by default and changes nothing when off.

Hollow also builds as an app for ImbatranimOS; see [games/hollow/os-app](../games/hollow/os-app/README.md). More: [the docs site's Hollow page](https://gandolh.ro/game-engine/docs/games/hollow/).

## MateQuest

A math roguelike for the Romanian primary curriculum, grades I to IV, themed on Romanian folklore. Each turn you pick Attack, Heal or Shield, and the action only lands if you solve the problem it brings. Runs branch across a map, wrong answers miss and show the working, lifelines (a hint, 50-50, skip) come as loot, and mastery per topic carries over between runs. Today it covers arithmetic and comparison; division, fractions, units and geometry are not built.

The UI defaults to Romanian, with an English switch. It is not deployed; run it with `npm run mathquest`. Its docs-site page is written ([source](src/content/docs/games/mathquest.mdx)) but not on the deployed site yet.
