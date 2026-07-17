# hollow-04 — relationships & emergent communities

status: todo
milestone: M1
depends-on: hollow-03
created: 2026-07-17

## Goal
Turn pairwise relationships into **emergent communities** — the centerpiece research object.
No pre-drawn factions: communities crystallize from accumulated trust/shared activity, become
first-class entities, and then grow, split, merge, and dissolve from behavior.

## Scope
- **Relationship ledger** (on the promoted trust/relationship primitive): each agent tracks a
  pairwise score with others it has interacted with — trust/affinity, updated by cooperative
  and antagonistic interactions (verbs land in hollow-06; here define the update rules + decay
  toward neutral over time/distance).
- **Community entity** (new, `@hollow/sim-core`): an ECS entity with membership set, a shared
  **stockpile**, a **territory** (tiles), and simple **norms** (e.g. a share-rate / a
  cooperation expectation). Communities are data the sim owns, not authored input.
- **Crystallization rule:** when a cluster of mutually-high-trust agents exceeds size + density
  thresholds (a light community-detection pass over the trust graph — keep it cheap and
  deterministic at 30–60 agents), a community forms and those agents become members.
- **Dynamics:**
  - **Grow** — a non-member with high trust to members and shared activity joins.
  - **Leave** — a member whose trust to the group collapses (betrayal / starvation / exclusion)
    defects.
  - **Split** — a community whose internal trust graph cleaves into two dense clusters divides.
  - **Merge** — two communities with high cross-trust and overlapping territory fuse.
  - **Dissolve** — membership falls below the minimum → the community de-crystallizes; its
    stockpile reverts to members/commons.
- **Belonging need coupling:** community membership satisfies the `belonging` need; exclusion /
  dissolution starves it — this is what makes join/leave carry weight.

## Approach
- Run community detection as a periodic (not every-tick) system for cost; document its slot in
  the scheduler and its data dependencies (must read the current trust ledger; must run before
  belonging-need update).
- Keep thresholds in one tunable constants block.
- Emit structured events (`community.formed/joined/left/split/merged/dissolved`) onto the
  message bus / event stream for hollow-07 to export.
- Determinism: any tie-breaking in clustering uses a named `Rng` fork or a stable deterministic
  order (never map/set iteration order that could vary).

## Acceptance / gates
- Headless run over enough ticks shows **at least one community form and at least one dissolve
  or split**, driven by trust dynamics — verified in the exported event stream, not just a unit
  test.
- Different seeds produce different community structures (emergence, not scripted).
- `belonging` need visibly tracks membership (members satisfied, excluded agents starved).
- Deterministic (byte-identical re-run).
- Tests assert real structure (membership sets, a split producing two groups), not "≥1 event
  fired".
