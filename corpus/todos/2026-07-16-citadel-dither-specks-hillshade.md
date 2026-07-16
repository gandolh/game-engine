---
title: "Citadel — unify ditherClusters specks with the hillshade field (fold into next terrain pass)"
created: 2026-07-16
status: open
tags: [citadel, render, terrain, cosmetic, batch]
---

# Citadel: ditherClusters specks vs hillshade — cosmetic unification

Fold-into-next-terrain-pass item (user call 2026-07-16; the hillshade itself was
approved as-is). `ditherClusters` (terrain-dither.ts) still biases its 2–3px
specks by the retired absolute-fBm `elevationField`, while the base fill now
uses the hillshade band (`landformFill`, b389832) — so specks and base fill can
mildly disagree on a slope. Specks are subtle; nothing is broken.

## Scope (when a terrain pass next happens)

- Re-key speck bias off the hillshade `shadeBand`/`landformHeight` sampler so
  specks agree with the slope shading; retire the last `elevationField` use if
  nothing else consumes it.
- Keep existing ditherClusters tests meaningful (re-target, don't weaken).
- Render-only; Apollo palette guard must stay green.

## Acceptance

- Specks and base-fill shading agree on lit vs shadowed slopes (unit-testable on
  a synthetic ridge grid); no sim change; palette guard green.
