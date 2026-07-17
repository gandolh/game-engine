# Hollow — BUILD STATE / RESUME (live tracker)

status: in-progress
updated: 2026-07-17

**Read this first to resume the Hollow build.** Design-of-record + all brief specs are in
`corpus/todos/2026-07-17-hollow-00-BUILD-ORDER.md` and `…-hollow-01..13-*.md`. This file is the
live progress tracker + the API handoffs needed to dispatch the next brief.

## How we're building it
- Skill: **plan-split-dispatch**, backlog/wave mode. Controller (opus) plans/verifies/adjudicates;
  executor briefs dispatched to **Sonnet** subagents (per user directive), **except hollow-02**
  which ran on **opus** (it refactors the shipping Farm game).
- **Branch `hollow`** (off `main`). Local only — **nothing pushed**. Per-brief checkpoint commits.
- One brief per wave (M1 is a serial dependency chain: `01→02→03→04→05→06→07`).
- **Verify gate after each wave** (controller runs it, not the subagent): `npm run typecheck`
  (whole workspace) + `npm run test -w @hollow/sim-core` (narrow) + git-tracked check
  (`git status --porcelain` shows new files; `git check-ignore <new src dir>` empty). Commit only
  when green.

## Constraints (carry into every dispatch)
- **Constrained hardware**: small runs; **ALWAYS ask the user before any determinism/EXPORT check**;
  narrowest test scope (single workspace), never the full repo suite mid-wave.
- **Determinism load-bearing**: all randomness via seeded `Rng.fork(label)`; no `Math.random`/
  `Date.now`; verify at DEFAULT and LOW tick scale.
- **Agent-prompt hygiene**: forbid `git reset`/`checkout`/`stash` in subagent prompts; subagents
  don't commit; controller integrates.
- **Verify integration, not just green tests**: reject weak assertions; confirm real behavior.
- Engine names no game; `@hollow/*` imports `@engine/*` only (layering test enforces).
- **Determinism-gate decision (recorded):** the user chose to gate Farm behavior-preservation on
  the 867+216 green unit tests only — the byte-identity `EXPORT=json` diff was **skipped**.
  Residual risk lives in hollow-02's `OfferLedger` swap; fallback = revert
  `games/farm/sim-core/src/systems/encounter-trade/system.ts` to its `Map`/`Set` form, keeping
  `OfferLedger` engine-only. Apply the same "trust tests unless told otherwise" default going
  forward, but still ASK before running any determinism check.

## Progress

| Brief | State | Commit |
|---|---|---|
| planning (BUILD-ORDER + 14 briefs) | ✅ | `edb6284` |
| hollow-01 workspace skeleton | ✅ done, verified | `411a561` |
| hollow-02 engine agent-kernel promotion (+Farm refactor) | ✅ done, verified | `a9d2a5f` |
| hollow-03 needs / economy / scarcity | ✅ done, verified | `1790d59` |
| hollow-04 relationships / emergent communities | ✅ done, verified | `9bbc90f` |
| **hollow-05 lifecycle / pair-bonding / genetics** | ⏸ **partial → stashed** | — |
| hollow-06 social verbs | ⬜ not started | — |
| hollow-07 headless CLI + export → **M1 EXIT-BAR GATE** | ⬜ not started | — |
| M2–M4 (hollow-08..13) | ⬜ specs written, queued | — |

## The stashed partial (hollow-05)
`git stash@{0}` = "hollow-05 WIP (incomplete — mid pair-bonding; re-dispatch fresh)". It touched
`components/entity.ts`, `population.ts`, `protocols/index.ts` and added `family/`, `genome/`,
`lifecycle/`, `protocols/family.ts`, `protocols/lethal.ts` — but stopped mid pair-bonding and is
likely non-compiling.

## ▶ NEXT ACTION (resume here)
1. **Drop the stash** (`git stash drop stash@{0}`) — re-dispatch hollow-05 FRESH, don't salvage the
   partial (it was too incomplete to trust). *(Only inspect/pop it if you specifically want to
   reuse a piece — verify the stash message matches first.)*
2. Confirm clean tree + green baseline: `npm run typecheck` and `npm run test -w @hollow/sim-core`
   (should be 54/54 at the hollow-04 checkpoint).
3. Re-dispatch **hollow-05** on Sonnet using the spec in `…-hollow-05-lifecycle-pairbond-genetics.md`
   + the handoffs below. Then continue `06 → 07 → M1 exit-bar gate`.
4. **M1 exit-bar gate** (after 07, before any M2/3D work): a headless seed run over ≥5 generations
   must show — communities forming + ≥1 dissolving; seed-dependent cooperation-vs-sabotage
   divergence; ≥3-gen lineages with heritable trait drift; scarcity-stable population;
   deterministic. This is the go/no-go for M2.

---

## HANDOFF SURFACES (from completed briefs 01–04) — feed these to the hollow-05 dispatch

### Sim shape (`@hollow/sim-core`)
- `bootstrapHollowSim(opts: HollowSimOptions)` → `{ world, bus, scheduler, rng, tick(), getSnapshot(), resources: ResourceWorld, communities: CommunityRegistry }`. Scheduler: `.stage(name).add(system)`.
- Current scheduler order: **PERCEIVE → DELIBERATE → ACT → TRUST-ACCRUAL → COMMUNITY → BELONGING → NEEDS-DECAY → RESOURCE-REGEN** (each stage has an inline data-dep rationale in `sim-bootstrap.ts`).
- `HollowSimOptions` (all optional past seed/ticksPerDay): `seed`, `ticksPerDay`, `population`, `foodNodeCount`, `materialNodeCount`, `foodNodeMaxStock`, `foodNodeRegenPerTick`, `materialNodeMaxStock`, `materialNodeRegenPerTick`, `trustProximityDelta`, `trustSharedNodeDelta`, `trustDecayRate`, `communityCheckIntervalTicks`, `communityMinSize`, `communityMinMembers`, `communityMinDensity`, `communityTrustThreshold`, `communityJoinTrustThreshold`, `communityLeaveTrustThreshold`, `communityMergeCrossTrustThreshold`, `communityMergeTerritoryRadius`, `belongingMemberReplenishPerTick`, `belongingNonMemberDecayPerTick`.
- `HollowSnapshot`: `{ tick, aliveCount, agents: HollowAgentSnapshot[], resourceNodes[], communities: HollowCommunitySnapshot[] }`. `HollowAgentSnapshot{ id, kind, gx, gy, needs:Record<string,number>, inventory:Record<string,number>, starving, communityId }`. `HollowCommunitySnapshot{ id, members, territory, stockpile, norms }`. **Extend additively** for age/stage/genome/householdId.
- Subpath exports: `.`, `/sim-bootstrap`, `/components`, `/world`, `/economy`, `/protocols`, `/agents`, `/systems`, `/population`, `/community`.

### Entity + components (`@hollow/sim-core/components`)
- `HollowEntity{ id?, fsm?:FsmState<"PERCEIVE"|"ACT">, beliefs?, desires?, intentions?, personality?{kind}, inbox?, agent?:HollowAgent, needs?:Needs, inventory?:Inventory, ownership?:Ownership, relationships?:RelationshipLedger, communityId?:number|null }`.
- `HollowAgent{ gx, gy, moveTarget:MoveTarget|null }`. `Inventory{ goods:Record<string,number> }` (+`addGoods`/`takeGoods`). `Ownership{ ownerId }` (self-pointing seam only). `personality.kind` = `"villager"` (only registered deliberator kind; lives on the ENGINE `Personality` component — required by `createDeliberateSystem`).
- Needs kinds present: `food, rest, wealth, belonging` (belonging is now driven by community membership).

### Engine agent kernel (`@engine/core/agent`, from hollow-02)
- Needs: `Need{value,min,max,decayPerTick}`, `Needs{byKind}`, `makeNeed/decayNeed/replenishNeed/needFraction/needIsDepleted`, `createNeedsDecaySystem(world,{component,needsOf,name?})`.
- Deliberation: `createRegistry<V>(label?)`, `createPersonalityRegistry<E,Ctx>()`, `Deliberator<E,Ctx>`, `createDeliberateSystem(world,{registry,perceiveState,actState,shouldSkip?,makeContext?,name?})`.
- CNP: `PERFORMATIVE{INFORM,REQUEST,PROPOSE,ACCEPT,REJECT,CFP,FAILURE,REFUSE}`, `OfferLedger<T>` (ttl, `add/has/get/remove/expire/beginHandshakeRound/claimHandshake`). *(For hollow-06.)*
- Relationship: `RelationshipLedger{byId:Map<number,number>}`, `relationshipScore(ledger,peer,scale?)`, `applyRelationshipDelta(ledger,peer,delta,scale?)`, `pairKey`, `directedKey`, `UNIT_TRUST_SCALE{min:0,max:1,neutral:0.5}`.
- BDI components in `@engine/core/ecs`; message bus in `@engine/core/sim` (ontology broadcast + `subscribeOntology`); `Rng.fork(label)` in `@engine/core/runtime`.

### Hollow systems/protocols already present
- Deliberator registration: `registerPersonality(kind, fn)` on `personalityRegistry` (`@hollow/sim-core/agents`); context `{ tick, resources: ResourceWorld }`. Registered: `"villager"`.
- Resources (`@hollow/sim-core/world`): plain-data `ResourceWorld` — `getNode(id)`, `nearestNode(kind,gx,gy)` (deterministic lowest-id tie-break), `harvest(id,amount)`, `regenTick()`; `ResourceKind="food"|"material"`; `GRID_SIZE=64`.
- Community (`@hollow/sim-core/community`): `CommunityRegistry` on `.communities` — `form(memberIds,territory,tick,norms?)`, `get/all/addMember/removeMember/setMembers/setTerritory/contribute(id,kind,amt)/dissolve(id)`. Trust accrual constants: `TRUST_PROXIMITY_DELTA=0.02`, `TRUST_SHARED_NODE_DELTA=0.02`, `TRUST_DECAY_TOWARD_NEUTRAL_RATE=0.01`. Systems: `HollowTrustAccrualSystem`, `HollowCommunitySystem`, `HollowBelongingSystem`.
- Starvation signal (`@hollow/sim-core/protocols`): `beliefs.data.starving:boolean` + `beliefs.data.foodDepletedTicks:number`; edge broadcast `ONT_STARVATION.ONSET {agentId,tick}`. **hollow-05 consumes this to perform starvation death (no despawn happens today).**
- Community events: `ONT_COMMUNITY.{FORMED,JOINED,LEFT,SPLIT,MERGED,DISSOLVED}` + typed bodies.

### Palette (client only; sim-core is render-free)
`games/hollow/client/src/render/hollow-palette.ts` exports `HOLLOW_PAL` (32 shared roles + tone roles: skin `skin/skinMid/skinLight/skinDark/skinDeep`, hair `hairBlack/hairBrown/hairBlonde/hairRed/hairGrey`). Store appearance genes in sim-core as the **role-name strings**; the client maps role→color.

### Architecture notes learned during the build
- Engine has **no `FixedStepClock`** — sim-core is pure tick-counting via `Scheduler.tick(ctx)`; the 20 Hz cadence is owned by the client Worker's `setInterval` (Citadel's real pattern). Update BUILD-ORDER decision #11 wording accordingly at M1 closeout.
- ECS despawn mid-loop is safe (pooled query copy) — but iterate/despawn in **ascending id order** for determinism.
