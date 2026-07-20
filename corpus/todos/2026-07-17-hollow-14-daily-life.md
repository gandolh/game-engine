# hollow-14 — Daily Life (jobs, routine, the hearth)

status: todo
milestone: M5
depends-on: hollow-04 (communities/belonging), hollow-05 (lifecycle/needs/pairbond), hollow-06 (deliberation + social verbs), hollow-12 (leader/standing/norms/feuds)
created: 2026-07-20

## Goal
Reshape Hollow's social texture from "everyone helps everyone, constantly, in public" (hundreds of
cooperative acts/year — the chronicle flood) into a legible **daily life**: each agent has a home, a
**leader-assigned job**, and a **diurnal routine** (commute → work → gather → sleep). Day-to-day
cooperation becomes **rare and private** (household + a few close ties, near home); the town's one
public space is a **central hearth** everyone converges on at **dusk**, where belonging is renewed and
hollow-12's governance/feud drama surfaces. This is a deliberate GAMEPLAY change: it re-rolls emergent
outcomes and re-baselines the sim tests (expected, not a regression). It ABSORBS the previously-planned
"economy-deepening" brief (jobs producing into the shared stockpile *is* that deepening).

## Design of record (settled with the user, 2026-07-20 — do not relitigate)
- **Jobs: leader-assigned, by aptitude + community demand.** A few roles — food-gatherer,
  material-gatherer, crafter, teacher, caretaker — producing into the **community shared stockpile**
  (governed by the existing hollow-12 `shareRate` norm). The standing-based leader (hollow-12a) assigns
  members to roles matching their genome/skills, nudged by community need (short on food → more
  gatherers). **Loners / unaffiliated self-assign by aptitude.** Bootstrap: before any community/leader
  exists, everyone self-assigns by aptitude; once a leader emerges it takes over assignment.
- **Diurnal day, LONGER, with the saga preserved.** A real day-cycle with phases (dawn/commute · work ·
  dusk/gather · night/sleep). The sim-day lengthens so phases have room, and **all tick-based life
  constants are rescaled** (lifespan, aging stages, gestation, birth window, starvation-death,
  needs-decay, density-brake, community/governance intervals, feud decay) so a multi-generation saga
  still plays out. (Note: `ticksPerDay` is TODAY just a label with no sim effect — this brief makes it
  load-bearing for the first time.)
- **Rare, private interaction.** Replace constant public helping with infrequent, small-group,
  private cooperation (household + close ties, near home). Most cross-family mixing waits for the hearth.
- **One central hearth.** A single authored world feature at map center; nightly convergence renews the
  **belonging** need and is the stage for governance (leader visible, norm-setting, sanctions) and feud
  flare/reconciliation. The tension "rarer interaction → trust starves" is resolved by making the
  **hearth the trust engine**: everyone meets everyone nightly there, so trust/communities still form —
  via the gathering rhythm, not constant field-bumping.

## Scope — sim-core chunks (dispatch in this dependency order; verify + commit each)

### 14a — Day-cycle clock (FOUNDATION; makes `ticksPerDay` load-bearing)
**Key fact (de-risks this chunk): life constants are RAW ticks, independent of `ticksPerDay`** (see
`family/constants.ts`'s header). So making the day longer (a bigger `ticksPerDay`) does NOT change how
many ticks a life or generation takes — **the saga is preserved automatically, and the bistable
population dynamics are UNTOUCHED.** Do NOT rescale the proven population constants (lifespan/aging/
gestation/hazard/density-brake) — the hollow-05 lesson is that retuning them is a bistability trap.
- Add a deterministic, pure day-phase clock: `dayPhase(tick, ticksPerDay)` → `{ phase:
  "commute"|"work"|"gather"|"sleep", dayOfRun, fractionThroughPhase }`, phase boundaries as fixed
  fractions of the day (propose commute 0–.15 · work .15–.7 · gather .7–.9 · sleep .9–1). Pure,
  unit-tested. Nothing consumes it yet in 14a beyond a smoke wiring — 14b/14c are the consumers.
- Make `ticksPerDay` meaningful: set the default to ~200 (a life ~45 days — long enough for legible
  phases). This is a LABEL change in effect (dynamics are raw-tick), so population behavior is
  unchanged; the breakage is only in code/tests that DERIVE day-counts from `ticksPerDay` (e.g. the
  chronicle `Y<year>` prefix, run-sim's day budget). Re-baseline those deliberately.
- **OPTIONAL, only with a stability proof:** a couple of constants read as absurd day-counts at
  tpd=200 (gestation ~1.25 days, child→adult ~1 day). You MAY bump ONLY those toward a few days IF you
  prove population stays bounded + never-extinct across seeds {1,7,33,101,202} — otherwise LEAVE them
  and note as a follow-up. Default: leave them, ship the clock.
- **Determinism:** phase is pure arithmetic on tick. No new `Rng`/`fork`.
- **Acceptance:** `dayPhase` unit-tested; population bounded + never-extinct across seeds over multiple
  generations (should match today, since dynamics constants are unchanged); byte-identical same-seed.

### 14b — Jobs (needs 14a's work phase + hollow-12 leader)
- An `occupation` component (role enum). Aptitude→role scoring; leader assignment pass (demand-adjusted); loner self-assignment fallback. Job work happens in the WORK phase: gatherers path to nearest food/material node and produce into the community stockpile; crafter/teacher/caretaker act at/near home or hearth. Emit chronicle events for role assignment/change.
- **Determinism:** assignment is deterministic (sorted by id, aptitude/demand arithmetic, no RNG). 
- **Acceptance:** roles distribute sensibly by aptitude + shift with demand; production flows into the stockpile; headless test proves a leader reassigns on a shortage; determinism intact.

### 14c — Social re-texture + the hearth (needs 14a's dusk phase)
- Gate the hollow-06 social verbs by phase + relationship: by day, only rare private interactions (household + high-trust close ties); the bulk of cross-family mixing (and belonging renewal) happens at the **hearth** during the GATHER phase. Add the hearth as an authored central world feature; agents path there at dusk. Belonging renews by hearth co-presence (replaces/augments the current membership-coupled belonging). Governance (leader/norms/sanctions) and feud flare/reconciliation surface at the hearth.
- **The trust-engine resolution:** hearth co-presence is the primary trust-accrual channel now — verify communities STILL form under the rarer-interaction regime (this is the make-or-break integration risk).
- **Acceptance:** interaction volume drops sharply vs today (chronicle no longer floods); communities + governance + feuds STILL emerge (via the hearth); loners who skip the hearth show belonging decay; determinism intact.

### 14d — Client rendering pass (WebGPU-Chrome-gated; render-only, no determinism impact)
- Render the hearth structure at map center; show the dawn commute + dusk convergence; job glyphs / work-site cues; day-phase reflected in the existing day/night wash. Reuse the render-only patterns (interp, overlay, `@engine/core/collision` de-overlap at the crowded hearth). Human-Chrome visual gate (sandbox has no WebGPU adapter).

## Determinism & rescale guardrails
- Everything in 14a–14c is sim-core and must stay DETERMINISTIC (pure phase math; stable id-sorted iteration; no `Math.random`/`Date.now`; any `Rng.fork` appended LAST + unconditional). 14d is render-only.
- The rescale WILL break existing tick-timing tests — re-baseline them deliberately, and prove the saga (multi-generation, bounded, never-extinct across seeds) with a small run per the resource limits (ask before any long determinism sweep).
- Edit surface per chunk: 14a–14c `games/hollow/sim-core/` (+ its tests); 14d `games/hollow/client/` (+ engine render only if a generic gap appears). Engine names no game.

## Acceptance / gates (whole brief)
1. A headless run reads as a *daily life*: agents commute to jobs, work by day, converge on the hearth at dusk, return home at night; interaction volume is a fraction of today's.
2. Communities, governance (leader/norms/sanctions), and feuds STILL emerge under the rarer-interaction regime (hearth as trust engine) — the integration risk, proven with a real run, not just unit tests.
3. Population stays bounded + never-extinct across seeds over multiple generations at the new day scale.
4. Byte-identical same-seed determinism at low + default tick scale.
5. (14d) Human confirms in WebGPU Chrome: hearth, commute, dusk convergence, job cues.

## Open defaults (chosen; veto anytime)
- Hearth at fixed map center (authored, not emergent). Day length ~200 ticks (~10× today; tune). Work at existing nodes for gatherers, home/hearth for crafter/teacher/caretaker. Sequenced before hollow-13 (which will later narrate hearth scenes).
