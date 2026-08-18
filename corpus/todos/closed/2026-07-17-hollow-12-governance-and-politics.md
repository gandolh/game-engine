# hollow-12 — governance & emergent politics

status: todo
milestone: M4
depends-on: hollow-04 (communities), hollow-06 (social verbs)
created: 2026-07-17

## Goal
Give emergent communities real internal politics: leaders that arise from standing, norms the
members set and change, and collective sanctions against rule-breakers — so communities can
contest leadership, reform norms, and fracture. This is the "governance/collective" verb group
from the design of record.

## Scope
### Standing & leaders
- Each member accrues **standing** within a community (from contributions to the stockpile,
  help given, trust held, tenure). The **highest-standing member is the de-facto leader**;
  leadership is **contestable** — standing shifts, so leaders change without a hardcoded office.
- A leader gets weighted influence over norm-setting and sanction decisions (not dictatorial).

### Norms (votable)
- A community holds a small set of **norms**: share-rate (how much production is expected into
  the stockpile), cooperation expectation, admission policy (who may join). Norms start from
  member-genome aggregate (M1 default) but can now be **changed by a vote** — members support/
  oppose weighted by standing + genome (loyal/cooperative agents favor higher share-rates,
  greedy/individualist agents oppose).
- Norm changes are events (chronicle-worthy) and shift member satisfaction (a norm that clashes
  with your genome lowers your belonging/trust and may drive defection → ties to M1 leave/split).

### Sanctions
- A member who **violates a norm** (hoards below share-rate, sabotages a member, betrays) is
  **collectively sanctioned**: fine from their holdings to the stockpile, a trust penalty from
  members, or **exclusion** (feeds M1 dissolve/leave + belonging starvation). Sanction severity
  scales with the violation + current norms + leader stance.

### Emergent dynamics to verify
- Leadership contests (a rising challenger displaces a leader).
- Norm reform waves (membership composition shifts → norms drift → some defect).
- Factional splits driven by norm disagreement (not just trust collapse).

### Antagonism tuning (bundled here)
- Tune feud escalation + **reconciliation** (repeated cooperation after a betrayal can rebuild
  trust) so antagonism produces arcs, not permanent death spirals.

## Approach / notes
- Governance runs as a periodic community-level system (like the M1 crystallization pass);
  document its scheduler slot + data deps (reads standing/trust/norms; runs before belonging
  update + defection).
- All voting/standing tie-breaks deterministic (named `Rng` fork or stable ordering).
- Keep governance in `@hollow/sim-core` (community politics is game-specific), building on the
  engine relationship/trust primitives.

## Acceptance / gates
- Headless run shows, in the event stream, at least: one leadership change, one norm change by
  vote, one sanction, and one norm-driven split — across seeds, emergent (not scripted).
- A greedy-seeded town and a loyal-seeded town produce visibly different governance (low vs high
  share-rate norms, more vs fewer sanctions).
- Reconciliation works: a post-betrayal pair can recover trust through sustained cooperation
  (test).
- Deterministic (byte-identical re-run).
- Reject weak assertions — verify governance actually moves outcomes in a real run.
