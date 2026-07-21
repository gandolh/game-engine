# hollow-15 — Mortality & Care (starvation death · graveyard · disease · medic)

Status: DONE (sim-core, 2026-07-21) — headless-verified; render dispatched separately. Branch `hollow`.
See `wiki/hollow-overview.md` "M6" + `log.md` [2026-07-21] for the as-built result + tuning notes.

## Intent

Give death consequences and a care economy. Four coupled mechanics on top of the
existing sim (all determinism-critical — see gotchas):

1. **Starvation kills in 3 in-game days.** A starvation-death path already exists
   (`family/lifecycle-system.ts`: `foodDepletedTicks >= starvationDeathTicks`), but the
   default threshold is a deliberately-huge 3000 raw ticks. Re-derive the default from
   **days**: `STARVATION_DEATH_DAYS = 3` → `3 * ticksPerDay`. Keep the raw-tick option knob
   for tests/tool.
2. **Corpses persist + a graveyard + a grave-digger.** Death no longer despawns silently —
   it spawns a **corpse entity** at the death tile. A leader-assigned **grave-digger**
   occupation collects the nearest unburied corpse, carries it to the one authored
   **`GRAVEYARD_TILE`** (like the hearth), and buries it (corpse despawned, `buriedCount++`).
3. **Unburied corpses rot and spread disease.** A corpse left unburied past
   `CORPSE_ROT_DELAY_DAYS` (1 day) starts **rotting**; a rotting corpse infects living agents
   within `DISEASE_SPREAD_RADIUS` tiles (per-tick probability). Disease is a per-agent
   component.
4. **Disease: 10%/day mortality, recoverable; a medic speeds recovery.**
   - Each in-game day a diseased agent rolls **`DISEASE_MORTALITY_PROB_PER_DAY = 0.10`** to die
     (cause `"disease"`), **regardless of treatment**.
   - A survivor recovers after **`DISEASE_SELF_RECOVERY_DAYS = 5`** days sick on its own, or
     **`DISEASE_MEDIC_RECOVERY_DAYS = 2`** if a medic has treated it.
   - A leader-assigned **medic** occupation treats up to **`MEDIC_MAX_TREATMENTS_PER_DAY = 3`**
     patients per in-game day (nearest sick untreated first); treating flips a patient's
     recovery target to 2 days.

## Design decisions (locked with the user)

- Starvation timer: **3 in-game days** (`3 * ticksPerDay`), not raw 3000. The one legacy
  `sim-bootstrap.scarcity.test.ts` (starves a population 600 ticks expecting nobody dies) is
  **guarded** by passing it a large `starvationDeathTicks` — it measures onset, not death.
- Disease mortality: **10%/day, recoverable** (self 5 days / medic 2 days).
- Graveyard: **one authored tile** (mirrors `HEARTH_TILE`) + **new job roles** `grave-digger`
  and `medic`, assigned by the existing leader/self aptitude pass, demand-nudged by the
  corpse backlog / sick count.

## Architecture

### World
- `GRAVEYARD_TILE` (`world/grid.ts`): fixed authored tile, offset from center hearth
  (a corner) so the funeral commute is visibly distinct from the dusk hearth convergence.

### Components (new)
- `Corpse { deceasedId, diedTick, gx, gy, buried, rotting, carriedBy }` — its OWN entity kind
  (`{ id, corpse }`, no `agent`/`needs`), so every existing agent system's queries still see
  only the living. Queried via `world.query("corpse")`.
- `Disease { infectedTick, sickDays, treated }` — on a living agent.
- `HollowAgent` gains job state: `carryingCorpseId?`, `medicTreatsToday?`, `medicTreatDay?`
  (day-of-run stamp to reset the daily cap). Optional, same convention as `lastSocialActTick`.
- `JOB_ROLES` gains `"grave-digger"`, `"medic"`.
- `HollowEntity` gains optional `corpse?`, `disease?`.
- `DeathCause` gains `"disease"`.

### Stages (sim-bootstrap scheduler)
Insert two stages around LIFECYCLE:
`… REPRODUCTION → **DISEASE** → LIFECYCLE → **CORPSE** → NEEDS-DECAY → RESOURCE-REGEN`

- **DISEASE** (`HollowDiseaseSystem`): on each in-game-day boundary, per diseased agent
  (asc id): roll 10% mortality → set `beliefs.data.pendingDeathCause = "disease"`; else
  `sickDays++` and recover if `sickDays >= (treated ? 2 : 5)`. Runs *before* LIFECYCLE so a
  disease death this tick flows through the SAME death path (single corpse-spawn site).
- **LIFECYCLE** (modified): `evaluateDeath` priority `starvation > disease > violence > oldAge`;
  reads `pendingDeathCause`. `handleDeath` now **spawns a corpse** at the death tile (after
  inheritance/cleanup) instead of a silent despawn, and **releases any corpse the deceased was
  carrying** (`carriedBy = null`).
- **CORPSE** (`HollowCorpseSystem`, after LIFECYCLE): per corpse (asc id): if carried, follow
  the carrier's tile (drop if carrier gone); mark `rotting` past the rot delay; a rotting,
  un-carried corpse infects uninfected living agents in radius (per-(corpse,agent) draw, asc
  id → deterministic).

Care acts (`collect_corpse` / `bury_corpse` / `treat`) execute in the **ACT** stage via a new
sibling `HollowCareActSystem` (mirrors how `HollowSocialActSystem` sits beside `HollowActSystem`;
`HollowActSystem`'s `default` case already whitelists foreign intention kinds through).

### Deliberation (villager.ts)
Survival ladder (food/rest) unchanged and still wins first. In the WORK/COMMUTE branch, before
the generic node-work fallback, branch on `occupation.role`:
- `grave-digger`: carrying → goto `GRAVEYARD_TILE` → (arrived) `bury_corpse`; else nearest
  unburied+un-carried corpse → goto → (on it) `collect_corpse`.
- `medic`: capacity left today → nearest sick+untreated patient → goto → (adjacent) `treat`;
  no patient / capacity spent → fall through to normal work.
`HollowDeliberationContext` gains `corpses` + `sick` indexes (built once per tick in
`HollowDeliberateSystem.run`, same O(n) pattern as the neighbor index); `GRAVEYARD_TILE`
imported directly like `HEARTH_TILE`.

### Jobs (assignment-system + constants)
Add `grave-digger` (fit ~ loyalty) and `medic` (fit ~ curiosity+sociability) to
`ASSIGNABLE_JOB_ROLES`. Extend the demand nudge with a town-wide **corpse backlog** term
(→ grave-digger) and **sick count** term (→ medic), bounded by the existing
`JOBS_DEMAND_BIAS_WEIGHT` so a genuine backlog can flip a near-fit agent without overriding a
strong aptitude mismatch.

### Determinism (LOAD-BEARING — see memory gotcha)
- New forks appended **after `shockRng`**, created **unconditionally**:
  `diseaseSpreadRng = rng.fork("disease-spread")`, `diseaseMortalityRng = rng.fork("disease-mortality")`.
  Everything scheduled before is byte-unchanged.
- All new rolls in ascending-id order; ties broken by fixed order + strict `>`, never a coin flip.
- Job/deliberation logic is rng-free (pure arithmetic over deterministic state).

### Options / snapshot / observe
- New `HollowSimOptions` knobs (each defaulting to its constant): `starvationDeathDays` (or keep
  `starvationDeathTicks`), `corpseRotDelayDays`, `diseaseSpreadRadius`, `diseaseInfectProbPerTick`,
  `diseaseMortalityProbPerDay`, `diseaseSelfRecoveryDays`, `diseaseMedicRecoveryDays`,
  `medicMaxTreatmentsPerDay`, `jobs*` demand weights. Probability knobs let tests force branches
  (same pattern as `stealDetectionProb`/`attackLethalityProb`).
- Snapshot: `corpses: [{id,gx,gy,buried,rotting,carriedBy}]`, `graveyard: {gx,gy}`, per-agent
  `diseased: boolean`, running `buriedCount`. Occupation already surfaced (now incl. the 2 roles).
- `observe/`: disease/corpse counts in metrics; INFECTED / BURIED / disease-death chronicle events
  (new `ONT_MORTALITY`).

### Render (client, Chrome-gated image)
Corpse mesh (lying/mound) + graveyard headstone cluster at `GRAVEYARD_TILE`; a disease tint on
sick agents; job-cue badges for grave-digger (shovel) + medic (cross). Mesh-gen/placement is
unit-testable; the live 3D image stays human-Chrome-gated (no WebGPU adapter in sandbox).

## Verification (headless-first)
sim-core tests: (1) starvation death at 3 days; (2) death spawns a corpse (agent despawned,
`diedCount++`); (3) unburied corpse rots past delay + infects a nearby agent (force prob=1);
(4) diseased daily 10% mortality (force 1 → dies; force 0 → recovers at 5 days; treated → 2);
(5) grave-digger collects+buries (corpse gone, `buriedCount++`); (6) medic treats ≤3/day, 4th
waits, treated recovers in 2 days; (7) determinism — short 3-seed snapshot-sequence diff (NOT
full CHECK_DETERMINISM — ask before any heavy run, per resource limits). Guard the legacy
scarcity test. Whole-workspace typecheck. Then a small headless run to confirm population is
still bounded (starvation is now lethal at 3 days) and emergence survives.
