# hollow-09 — Hollow cozy town scene (3D view)

status: todo
milestone: M2
depends-on: hollow-08 (engine 3D renderer), M1 sim (snapshot stream)
created: 2026-07-17

## Goal
Assemble the living, cozy 3D town in `@hollow/client` on top of the engine renderer: the world,
the gene-driven agents, legibility cues, camera, and day/night — all reading from the Worker
snapshot stream, render-only, sim byte-untouched.

## Scope
### World & environment
- Ground plane for the 64² town with **gentle terrain relief**; community **territories shown as
  a soft ground-tint** in the community's color.
- **Households as house meshes** built from primitives; a home appears/grows as a family forms
  and grows, clusters by community. Distinct enough to read "who lives where".
- **Readable resource nodes** (field / well / workshop / forage) as distinct primitive meshes.
- Composed from the engine primitive→mesh module; all palette-role colored.

### Agents (gene-driven, animated)
- Low-poly humanoid mesh assembled from primitives, parameterized by **appearance genes**:
  height, build, **skin tone + hair tone** (Hollow palette roles) — so children visibly
  resemble parents and lineages read at a glance.
- **Life stage** scales the mesh (children smaller; elders posture).
- **Walk cycle** while moving (drive from snapshot position deltas + an interp/jitter buffer;
  Citadel's `entity-interp` render-delay approach is the reference) + **distinct action poses**:
  work / eat / talk / gift / fight / court / carry-child, driven by the agent's current
  action in the snapshot.

### Legibility (subtle diegetic + toggle)
- Default: a small **floating action glyph** over active agents (farm/handshake/anger/heart…),
  posture/animation, territory tint, kid scale. Cozy, uncluttered.
- **`[T]` toggles tag mode**: name + a compact need/stress bar over heads. Off by default.
- **Click an agent (ray-pick)** → an inspect panel: BDI state, genome (behavior/aptitude/
  appearance), needs, relationships, kin, community history. (This is the "minimal click-inspect"
  from the M1 observability decision — keep it a panel, not a full overlay suite.)

### Camera & atmosphere
- **Free orbit + pan + zoom perspective god-cam** (engine controller); a "follow agent" mode
  that tracks a selected agent.
- **Day/night warm wash** tied to the sim clock (golden dawn/dusk, gentle lamplit night —
  Citadel's cozy atmosphere direction); windows glow warm at night.

## Approach / notes
- Snapshot must carry what render needs (position, stage, action, appearance genes, community
  id/color, household id). Extend the Hollow snapshot builder accordingly — additive, render-only.
- Animation/day-night use the render clock (wall-clock), never the sim path → no determinism
  impact (mirror Citadel/Farm render-only rule).
- Keep the agent mesh + pose set small and instanced; 30–60 agents must stay smooth on modest
  hardware.

## Acceptance / gates
- The town renders in a real browser (system Chrome, `--enable-unsafe-webgpu`): agents walk,
  strike action poses, children resemble parents, communities read by territory tint, homes grow
  with families, day/night cycles. Screenshot-verified.
- `[T]` tag toggle + click-inspect work.
- Determinism unaffected: a `CHECK_DETERMINISM` sim run stays byte-identical with the client
  attached vs headless (render reads snapshots, never feeds the sim).
- `npm run hollow` launches client + Worker sim together.
- Palette guard green for `games/hollow/` (all mesh/tint colors are Hollow palette roles).
