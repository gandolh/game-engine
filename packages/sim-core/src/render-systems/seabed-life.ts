// Decorative static seabed life — render-only, scatter computed once at module load (seeded off
// WORLD_GEN_SEED → stable per world). Sits on open-water seabed tiles alongside SET_PIECES; these
// are the non-moving dwellers (starfish, crab, sand-dollar, anemone). Animated water life (kelp,
// jellyfish, turtles, bubble columns) lives render-side in farm-valley/render/water-decor.ts.
import { createRng } from "@engine/core";
import { WORLD_WIDTH, WORLD_HEIGHT, isWalkable, WORLD_GEN_SEED } from "../world/regions";
import { CORAL } from "./geometry";
import { SET_PIECES } from "./set-pieces";
import { CORAL_REEFS } from "../world/coral";

/** Semi-transparent so water shows through — seabed accent, same idiom as SET_PIECES. */
export const SEABED_LIFE_ALPHA = 0.5;

export interface SeabedLifeTile {
  tx: number;
  ty: number;
  frame: string;
  rotation: number;
}

const LIFE_FRAMES = [
  "decoration/seabed-starfish",
  "decoration/seabed-crab",
  "decoration/seabed-sand-dollar",
  "decoration/seabed-anemone",
] as const;

const TARGET_COUNT = 70;
/** Chebyshev min-distance between seabed creatures (looser than SET_PIECES so the ocean feels populated). */
export const MIN_SPACING = 2;
const MAX_ATTEMPTS = 8000;
const QUARTER_TURN = Math.PI / 2;

const key = (x: number, y: number): number => y * WORLD_WIDTH + x;

function computeSeabedLife(): readonly SeabedLifeTile[] {
  const forbidden = new Set<number>();
  for (const c of CORAL) forbidden.add(key(c.tx, c.ty));
  for (const reef of CORAL_REEFS) {
    forbidden.add(key(reef.dock.x, reef.dock.y));
    forbidden.add(key(reef.reef.x, reef.reef.y));
    for (const l of reef.lane) forbidden.add(key(l.x, l.y));
  }
  // Never stack on a baked set-piece prop (keeps the two seeded seabed layers from overlapping).
  for (const p of SET_PIECES) forbidden.add(key(p.tx, p.ty));

  const eligible = (tx: number, ty: number): boolean => {
    if (tx < 0 || ty < 0 || tx >= WORLD_WIDTH || ty >= WORLD_HEIGHT) return false;
    if (forbidden.has(key(tx, ty))) return false;
    if (isWalkable(tx, ty)) return false;
    // Must be open water (no adjacent land) so a creature never overlaps a shore/bridge edge.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (isWalkable(tx + dx, ty + dy)) return false;
      }
    }
    return true;
  };

  // Distinct fork from "set-pieces" so adding/removing this layer never shifts the SET_PIECES stream.
  const rng = createRng(WORLD_GEN_SEED).fork("seabed-life");
  const placed: SeabedLifeTile[] = [];
  const placedKeys = new Set<number>();

  const farEnough = (tx: number, ty: number): boolean => {
    for (const p of placed) {
      const cheby = Math.max(Math.abs(p.tx - tx), Math.abs(p.ty - ty));
      if (cheby < MIN_SPACING) return false;
    }
    return true;
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS && placed.length < TARGET_COUNT; attempt++) {
    // Draw all four rng fields every iteration to keep the stream aligned regardless of acceptance.
    const tx = rng.int(0, WORLD_WIDTH);
    const ty = rng.int(0, WORLD_HEIGHT);
    const frame = rng.pick(LIFE_FRAMES);
    const rotation = rng.int(0, 4) * QUARTER_TURN;
    if (placedKeys.has(key(tx, ty))) continue;
    if (!eligible(tx, ty)) continue;
    if (!farEnough(tx, ty)) continue;
    placed.push({ tx, ty, frame, rotation });
    placedKeys.add(key(tx, ty));
  }

  return placed;
}

export const SEABED_LIFE: readonly SeabedLifeTile[] = computeSeabedLife();
