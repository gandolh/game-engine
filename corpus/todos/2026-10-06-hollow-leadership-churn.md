# Hollow's leaders turn over at the governance pass's own timescale

status: open — a finding, not yet a spec
created: 2026-10-06
context: measured while building [hollow-17](closed/2026-09-19-hollow-17-rationalizer-attachment-point.md).

## What was measured

Four reference seeds (7, 11, 23, 42), 1500 ticks, seam off:

| seed | communities | community-passes | leader changes | leader survives a pass |
|---|---|---|---|---|
| 7  | 33 | ~83 | 37 | ~55% |
| 11 | 25 | ~80 | 47 | ~41% |
| 23 | 29 | ~79 | 31 | ~61% |
| 42 | 15 | ~54 | 28 | ~48% |

About half of all communities last under two 50-tick passes. Leadership is recomputed every pass
from standing, and the trust-held term moves every tick, so a contested leadership flips often.

## Why it matters

[hollow-overview.md](../wiki/hollow-overview.md) and the governance header describe a "contestable
emergent leader". At these rates a leader rarely holds office for long enough to matter, and
anything keyed to a leader (hollow-17's vote site, any future leader-driven decision) inherits the
churn. Whether that is the intended dynamic is a design question.

## Before a spec

Decide whether leadership *should* be this volatile. If not, the candidates are hysteresis (a
challenger must beat the incumbent's standing by a margin), smoothing the trust-held term, or a
minimum tenure. Any of them changes the world for every run, so it needs the usual multi-seed
`EXPORT=json` comparison, and it would make hollow-17's site worth re-measuring.
