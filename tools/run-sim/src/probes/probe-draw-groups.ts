/**
 * sweep-05 measurement probe — how badly do sprite draw groups fragment?
 *
 * The spec (`corpus/todos/2026-09-19-sweep-05-…`) is filed UNMEASURED: it proves the *mechanism*
 * statically (`compareSprite` is `(layer, sortY)` and ignores `atlasId`; `LAYER.ACTOR` and
 * `LAYER.BUILDING` are both 50; `FRAME_PREFIX_TO_ATLAS` sends four different sheets onto that
 * layer) but could not say how many groups that actually produces, because nothing counted them.
 *
 * `renderer.ts` now reports `draw.groups` through `?profile`, which is the in-browser answer. This
 * is the headless one, and for THIS number it is the better instrument:
 *
 *  - The group count is a pure CPU function of the sprite queue — sort by `compareSprite`, then
 *    count maximal runs of equal `atlasId`. No GPU is involved, so a software-rendering sandbox
 *    cannot distort it (unlike any ms figure, which SwiftShader inflates).
 *  - It is seed-pinned and reproducible, so the number can be re-derived later and compared.
 *
 * It deliberately mirrors `WebGl2Renderer.endFrame`'s coalescing loop rather than importing it:
 * the renderer lives behind a `.glsl?raw` import that only a bundler resolves, so a Node probe
 * cannot load it. The logic being mirrored is four lines and is asserted against
 * `compareSprite` itself, which IS importable.
 *
 * SCOPE — read before quoting the number. This counts the `buildSprites` snapshot queue only: the
 * dynamic per-tick sprites. The live client also pushes the static layer, ambient scenery,
 * occluder ghosts and indicator quads into the same queue, so the real in-browser group count is
 * HIGHER than what this prints. Treat this as a lower bound, and `?profile`'s `draw.groups` as the
 * whole truth.
 *
 * Run: `npm start -w @tool/run-sim -- --probe-draw-groups`, or via `tsx`. Env: SEED, TICKS_PER_DAY,
 * DAYS.
 */
import { bootstrapSim } from "@farm/sim-core/sim-bootstrap";
import { buildSprites, SnapshotSpriteState } from "@farm/sim-core/snapshot-builder";
import { frameToAtlasId } from "@farm/sim-core/render-systems";
import { readFileSync } from "node:fs";
import { makePathfinder } from "../pathfinder";

/**
 * A copy of `engine/core/src/render/raster2d.ts`'s `compareSprite`. It is NOT importable here —
 * it lives in `raster2d.ts`, which the `@engine/core/render` barrel does not re-export, and the
 * barrel itself reaches WebGL2 modules that import `.glsl?raw` (bundler-only). Two lines is
 * cheaper than a new public export, but a silent copy is exactly the drift this repo keeps
 * finding, so `assertComparatorMatchesSource()` below re-reads the real function and fails if it
 * has changed.
 */
function compareSprite(
  a: { layer: number; y: number; sortY?: number },
  b: { layer: number; y: number; sortY?: number },
): number {
  if (a.layer !== b.layer) return a.layer - b.layer;
  return (a.sortY ?? a.y) - (b.sortY ?? b.y);
}

const COMPARATOR_SOURCE = "engine/core/src/render/raster2d.ts";
const EXPECTED_BODY = [
  "if (a.layer !== b.layer) return a.layer - b.layer;",
  "return (a.sortY ?? a.y) - (b.sortY ?? b.y);",
];

function assertComparatorMatchesSource(repoRoot: string): void {
  const src = readFileSync(`${repoRoot}/${COMPARATOR_SOURCE}`, "utf8");
  for (const line of EXPECTED_BODY) {
    if (!src.includes(line)) {
      throw new Error(
        `probe-draw-groups: its copy of compareSprite no longer matches ${COMPARATOR_SOURCE}.\n` +
          `Missing: ${line}\n` +
          `If the real comparator changed, this probe's numbers are meaningless until the copy is ` +
          `updated — that change is also the whole subject of sweep-05, so do not just silence this.`,
      );
    }
  }
}

interface Counted {
  sprites: number;
  atlases: number;
  groups: number;
  byLayer: Map<number, { sprites: number; atlases: Set<string>; groups: number }>;
  perAtlas: Map<string, number>;
}

/**
 * Mirrors the renderer's coalescing: sort the queue, then walk it counting maximal runs of the
 * same `atlasId`. `groups` is what `drawRange` is called with, once each.
 */
function countGroups(sprites: { atlasId: string; layer: number; y: number; sortY?: number }[]): Counted {
  const sorted = [...sprites].sort((a, b) => compareSprite(a as never, b as never));

  let groups = 0;
  let prevAtlas: string | null = null;
  let prevLayer: number | null = null;
  const byLayer = new Map<number, { sprites: number; atlases: Set<string>; groups: number }>();
  const perAtlas = new Map<string, number>();

  for (const s of sorted) {
    let bucket = byLayer.get(s.layer);
    if (bucket === undefined) {
      bucket = { sprites: 0, atlases: new Set(), groups: 0 };
      byLayer.set(s.layer, bucket);
    }
    bucket.sprites += 1;
    bucket.atlases.add(s.atlasId);
    perAtlas.set(s.atlasId, (perAtlas.get(s.atlasId) ?? 0) + 1);

    // A new group starts whenever the atlas changes. The renderer's loop breaks its run on
    // `sp.atlasId !== currentAtlas` only — it does not break on layer — so this matches it.
    // Layer is tracked separately, for attribution.
    if (s.atlasId !== prevAtlas) {
      groups += 1;
      bucket.groups += 1;
    } else if (s.layer !== prevLayer) {
      bucket.groups += 1; // same run spanning a layer boundary: attribute a group to this layer too
    }
    prevAtlas = s.atlasId;
    prevLayer = s.layer;
  }

  return {
    sprites: sorted.length,
    atlases: new Set(sorted.map((s) => s.atlasId)).size,
    groups,
    byLayer,
    perAtlas,
  };
}

async function main(): Promise<void> {
  assertComparatorMatchesSource(new URL("../../../..", import.meta.url).pathname);

  const seed = Number(process.env.SEED ?? 0xc0ffee);
  const ticksPerDay = Number(process.env.TICKS_PER_DAY ?? 1200);
  const days = Number(process.env.DAYS ?? 3);

  const { world, scheduler } = bootstrapSim({
    seed,
    ticksPerDay,
    maxDays: days + 1,
    pathfinder: await makePathfinder(),
  });

  const spriteState = new SnapshotSpriteState();
  const totalTicks = ticksPerDay * days;

  console.log(
    `sweep-05 draw-group probe — seed 0x${seed.toString(16)}, ${days} day(s) @ ${ticksPerDay} ticks/day\n` +
      `counting maximal same-atlas runs after sorting by compareSprite (layer, sortY)\n`,
  );

  const samples: Counted[] = [];
  for (let t = 0; t < totalTicks; t += 1) {
    scheduler.tick({ tick: t });
    // Sample once per in-game day, at the same phase each time.
    if (t > 0 && t % ticksPerDay === 0) {
      const day = Math.floor(t / ticksPerDay);
      // `SnapshotSprite` carries `frame`, not `atlasId` — the client derives the atlas with
      // `frameToAtlasId` (games/farm/sim-core/src/render-systems/frames.ts) when it pushes the
      // snapshot into the renderer. Do the same here, or every sprite looks like one atlas.
      const sprites = buildSprites(world, t, day, spriteState).map((sp) => ({
        atlasId: frameToAtlasId(sp.frame),
        layer: sp.layer,
        y: sp.y,
        ...(sp.z !== undefined ? { sortY: sp.y - sp.z } : {}),
      }));
      const counted = countGroups(sprites);
      samples.push(counted);
      console.log(
        `day ${String(day).padStart(2)} — sprites ${String(counted.sprites).padStart(4)}  ` +
          `atlases ${counted.atlases}  groups ${String(counted.groups).padStart(4)}  ` +
          `groups/atlas ${(counted.groups / counted.atlases).toFixed(1)}x  ` +
          `groups/sprite ${(counted.groups / counted.sprites).toFixed(3)}`,
      );
    }
  }

  const last = samples[samples.length - 1];
  if (last === undefined) {
    console.log("no samples — increase DAYS");
    return;
  }

  console.log(`\n── final sample breakdown (day ${days}) ──`);
  console.log(`sprites in queue : ${last.sprites}`);
  console.log(`distinct atlases : ${last.atlases}  <- the theoretical floor for groups`);
  console.log(`draw groups      : ${last.groups}`);
  console.log(`fragmentation    : ${(last.groups / last.atlases).toFixed(1)}x the floor`);
  console.log(`GL calls/frame   : ${last.groups * 29} at 29/group (was ${last.groups * 43} at 43)`);

  console.log(`\nper atlas:`);
  for (const [atlas, n] of [...last.perAtlas.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${atlas.padEnd(12)} ${String(n).padStart(4)} sprites`);
  }

  // NOTE on the per-layer numbers: `groups` here is APPROXIMATE attribution. The total above only
  // increments on an atlas change (matching the renderer); a run that spans a layer boundary is
  // attributed to both layers, so these sum to slightly more than the total. They are for finding
  // WHICH layer fragments, not for arithmetic.
  console.log(`\nper layer (approximate attribution — see comment in source):`);
  for (const [layer, b] of [...last.byLayer.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(
      `  layer ${String(layer).padStart(3)}  sprites ${String(b.sprites).padStart(4)}  ` +
        `atlases ${b.atlases.size}  groups ${String(b.groups).padStart(4)}  ` +
        `[${[...b.atlases].sort().join(", ")}]`,
    );
  }
}

void main();
