# Brief 13: check results

Written by [check.ts](check.ts). It names the methods, so open it only after both picks on the blind sheet are in.

| Subject | Method | Recipe | Size | Palette guard | Lone pixels | Corners | Floor row and height in its set |
|---|---|---|---|---|---|---|---|
| strigoi | agent | [recipes/strigoi-agent.ts](recipes/strigoi-agent.ts) | 32x32 | pass | none | none | none |
| strigoi | pixel-draw | [recipes/strigoi-pixel-draw.ts](recipes/strigoi-pixel-draw.ts) | 32x32 | pass | none | none | none |
| apple icon | agent | [recipes/apple-agent.ts](recipes/apple-agent.ts) | 16x16 | pass | none | none | 2, all on the game's allowlist |
| apple icon | pixel-draw | [recipes/apple-pixel-draw.ts](recipes/apple-pixel-draw.ts) | 16x16 | pass | none | none | 2, all on the game's allowlist |

## Findings

Every finding, allowlisted or not. Today's game frame of the same name is swapped out for the set rules.

- recipes/apple-agent.ts: fruit/apple: floor-row at (0, 14): stands 1 px above its frame's bottom; its set stands 7 px above
- recipes/apple-agent.ts: fruit/apple: height at (0, 1): is 14 px tall; its set is 7 px
- recipes/apple-pixel-draw.ts: fruit/apple: floor-row at (0, 14): stands 1 px above its frame's bottom; its set stands 7 px above
- recipes/apple-pixel-draw.ts: fruit/apple: height at (0, 1): is 14 px tall; its set is 7 px
