# hollow-06 — social verbs (cooperative + antagonistic)

status: todo
milestone: M1
depends-on: hollow-03, hollow-04, hollow-05
created: 2026-07-17

## Goal
Give agents the observable "moves" and, crucially, the **BDI deliberation to choose among them
under need pressure**. This is the substance the whole study observes: which agents cooperate,
which sabotage, and why. (Governance/collective verbs are M4.)

## Scope
### Cooperative verbs
- **trade/barter** — via the promoted Contract-Net kernel (reuse, don't rebuild).
- **gift** — transfer goods with no return, raising the recipient's trust toward the giver.
- **share** — contribute to a community stockpile (satisfies norms; raises standing).
- **help-labor** — spend effort boosting another agent's/community's production.
- **teach** — raise another agent's skill *level* toward the teacher's, gated by the learner's
  aptitude cap (ties to hollow-05 genetics).

### Antagonistic verbs
- **steal** — take goods from a target; large trust hit if detected (detection probability via
  `Rng` fork), may trigger retaliation.
- **sabotage** — damage a target's resource/production/stockpile.
- **betray** — renege on an agreed trade/help commitment.
- **rumor** — lower a target's reputation with third parties (propagates through the trust
  graph, decaying with distance).
- **exclude** — a community collectively pushes a member out (feeds hollow-04 leave/dissolve
  and hollow-05 belonging starvation).
- **attack** — physical aggression; a resolved lethal attack emits the violence-death signal
  consumed by hollow-05.

### Deliberation (the important half)
- Extend the promoted deliberate-registry: each personality kind maps its genome `behavior[]`
  weights + current need/belief state into a **prioritized intention queue** over these verbs.
  E.g. high need + low trust + high greed/aggression → steal/sabotage becomes attractive; high
  loyalty + surplus → share/help/gift. Compose reusable `deliberate*` helpers (Farm's
  `agents/watering` pattern) rather than a monolith.
- All verbs flow through the message bus + inbox lifecycle (perceive folds outcomes into
  beliefs; relationship ledger updates from outcomes).

## Approach
- Verb *effects* are ACT-stage handlers (reuse the promoted FSM ACT dispatch); verb *choice* is
  deliberation. Keep them separate.
- Every stochastic element (detection, rumor spread) via named `Rng` forks.
- Emit structured events for every consummated verb for hollow-07 export.
- Tune so neither pure-cooperation nor pure-sabotage dominates trivially — the interesting
  result is seed/persona-dependent divergence.

## Acceptance / gates
- Headless run shows **both cooperation and sabotage occurring**, with rates that diverge across
  seeds and persona mixes (a greedy/aggressive seed town sabotages more than a loyal one) —
  verified in exported event/metric data, not just unit tests.
- Cause→effect verified: sabotage lowers target production; rumor lowers third-party trust;
  teach raises learner skill up to aptitude cap; steal detection triggers trust collapse.
- Deliberation demonstrably reads genome weights (test: flipping an agent's aggression gene
  changes its verb distribution).
- Deterministic (byte-identical re-run).
- Reject weak assertions — this is exactly where "green tests, inert feature" has bitten the
  project before. Confirm effects in a real run.
