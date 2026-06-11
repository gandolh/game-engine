import { ZERO_CROPS } from "../economy";
import { describe, it, expect } from "vitest";
import { World, createRng } from "@engine/core";
import type { GameEntity } from "../components";
import { zeroFish } from "../components";
import { PlayerControlSystem } from "./player-control";
import { ActSystem } from "./act";
import { getRegion } from "../world/regions";
import { PLAYER_SPEED } from "./player-control";

// Hotbar slot indices (see HOTBAR_SLOTS): 0 Can · 1 Hoe · 2 Axe · 3 Pickaxe ·
// 4 Rod · 5 Radish · 6 Wheat · 7 Pumpkin. The action key uses the selected slot.
const SLOT = { can: 0, hoe: 1, axe: 2, pickaxe: 3, rod: 4, radish: 5, wheat: 6, pumpkin: 7 } as const;

const PIP = getRegion("farm-pip").center; // { x: 33, y: 19 } — bare farm ground

/** Spawn Pip at its farm center with a starter kit, plus the systems under test. */
function setup(): {
  world: World<GameEntity>;
  pip: GameEntity;
  control: PlayerControlSystem;
  act: ActSystem;
} {
  const world = new World<GameEntity>();
  const pip = world.spawn({
    transform: { x: PIP.x, y: PIP.y, prevX: PIP.x, prevY: PIP.y, rotation: 0 },
    sprite: { atlasId: "main", frame: "farmer/pip", layer: 100, tintRgba: 0xffffffff },
    fsm: { current: "WAIT_DAY", enteredTick: 0 },
    beliefs: { data: { currentDay: 0 }, revision: 0 },
    intentions: { queue: [] },
    personality: { kind: "pip" },
    farmer: { name: "Pip", currentRegion: "farm-pip", homeRegion: "farm-pip" },
    inventory: {
      gold: 60,
      crops: { ...ZERO_CROPS },
      seeds: { ...ZERO_CROPS, radish: 3 },
      tools: [
        { kind: "hoe", tier: "wooden", durability: 100 },
        { kind: "axe", tier: "wooden", durability: 100 },
        { kind: "pickaxe", tier: "wooden", durability: 100 },
      ],
      wateringCan: { charges: 10, maxCharges: 10 },
    },
    resources: { wood: 0, stone: 0, ironOre: 0, geodes: 0 },
    player: { isPlayer: true, facing: "down", pendingMoveX: null, pendingMoveY: null, pendingAction: false, selectedSlot: 0, pendingActionTile: null },
  });
  return {
    world,
    pip,
    control: new PlayerControlSystem(world),
    act: new ActSystem(world, createRng(1)),
  };
}

/** Run control then act, once. */
function tick(
  world: World<GameEntity>,
  control: PlayerControlSystem,
  act: ActSystem,
  t = 0,
): void {
  control.run({ tick: t } as never);
  act.run({ tick: t } as never);
}

describe("PlayerControlSystem — movement", () => {
  it("moves Pip sub-tile immediately on the first held tick (no latency)", () => {
    const { world, pip, control, act } = setup();
    pip.player!.pendingMoveX = "right";
    tick(world, control, act);
    // Continuous movement: transform.x advances by PLAYER_SPEED each tick the key
    // is held, so after tick 1 Pip has moved exactly PLAYER_SPEED tiles east.
    expect(pip.transform!.x).toBeCloseTo(PIP.x + PLAYER_SPEED);
    expect(pip.transform!.y).toBeCloseTo(PIP.y);
    expect(pip.player!.facing).toBe("right");
    expect(pip.farmer!.movedThisTick).toBe(true);
    expect(pip.player!.pendingMoveX).toBe("right");
  });

  it("reaches ~1 tile after PLAYER_STEP_TICKS held ticks (speed parity)", () => {
    // Speed parity: PLAYER_SPEED = 1/PLAYER_STEP_TICKS tiles/tick → 1 tile
    // after PLAYER_STEP_TICKS ticks, matching the old step-per-3-ticks cadence.
    const { world, pip, control, act } = setup();
    pip.player!.pendingMoveX = "right";
    for (let t = 0; t < 3; t++) tick(world, control, act, t);
    // After 3 ticks Pip has moved 3×PLAYER_SPEED = 1.0 tile.
    expect(pip.transform!.x).toBeCloseTo(PIP.x + 1.0, 5);
  });

  it("continuous: position advances smoothly every tick (sub-tile positions)", () => {
    const { world, pip, control, act } = setup();
    pip.player!.pendingMoveX = "right";
    const positions: number[] = [];
    for (let t = 0; t < 6; t++) {
      tick(world, control, act, t);
      positions.push(pip.transform!.x);
    }
    // Each tick must advance by exactly PLAYER_SPEED (monotonically increasing).
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]! - positions[i - 1]!).toBeCloseTo(PLAYER_SPEED, 5);
    }
  });

  it("moves diagonally when both axes are held (axis-independent, not normalized)", () => {
    // Design choice: diagonal movement is AXIS-INDEPENDENT (no SQRT2 normalization),
    // so each axis advances by PLAYER_SPEED independently. This keeps velocity math
    // simple and deterministic — no Math.sqrt in sim code.
    const { world, pip, control, act } = setup();
    pip.player!.pendingMoveX = "right";
    pip.player!.pendingMoveY = "down";
    tick(world, control, act);
    expect(pip.transform!.x).toBeCloseTo(PIP.x + PLAYER_SPEED);
    expect(pip.transform!.y).toBeCloseTo(PIP.y + PLAYER_SPEED);
    expect(pip.farmer!.movedThisTick).toBe(true);
    expect(pip.player!.facing).toBe("right"); // horizontal wins for the sprite
  });

  it("wall-slides: moving into a blocked X axis slides along Y instead", () => {
    const { world, pip, control, act } = setup();
    // Put Pip right against the right edge of its farm so moving right will be
    // blocked after a few ticks; hold down+right to verify Y still advances.
    // Simpler test: move right toward a tree while also holding down.
    // Block the tile one full tile east of the starting position.
    // We need to position Pip close enough to the tree to trigger the collision.
    // Start Pip 0.6 tiles west of the tile boundary — so the next tick would
    // push the AABB past the tree. Place Pip at PIP.x + 0.7 (AABB half-width=0.3,
    // right edge = x + 0.3; next tick right edge = x + 0.3 + PLAYER_SPEED ≈
    // PIP.x + 0.7 + 0.3 + 0.333 ≈ PIP.x + 1.33 which crosses PIP.x+1 boundary).
    pip.transform!.x = PIP.x + 0.7;
    const bx = PIP.x + 1, by = PIP.y;
    world.spawn({
      transform: { x: bx, y: by, prevX: bx, prevY: by, rotation: 0 },
      tileFeature: { kind: "tree", tileX: bx, tileY: by, regionId: "farm-pip", ownerId: pip.id! },
    });
    pip.player!.pendingMoveX = "right";
    pip.player!.pendingMoveY = "down";
    tick(world, control, act);
    // X should be clamped (right edge at bx - 0.3 = PIP.x + 0.7),
    // but Y should still advance by PLAYER_SPEED (wall-slide).
    expect(pip.transform!.x).toBeLessThanOrEqual(bx - 0.3 + 0.001);
    expect(pip.transform!.y).toBeCloseTo(PIP.y + PLAYER_SPEED);
  });

  it("Pip can stop mid-tile and rest at a fractional position", () => {
    const { world, pip, control, act } = setup();
    pip.player!.pendingMoveX = "right";
    tick(world, control, act, 0);
    tick(world, control, act, 1); // now at PIP.x + 2*PLAYER_SPEED (sub-tile)
    const midX = pip.transform!.x;
    // midX is a non-integer fraction
    expect(midX).not.toBe(Math.round(midX));
    pip.player!.pendingMoveX = null; // release — stop mid-tile
    tick(world, control, act, 2);
    // Position stays exactly where Pip stopped (no snap).
    expect(pip.transform!.x).toBeCloseTo(midX);
    expect(pip.farmer!.renderPos).toBeUndefined();
    expect(pip.farmer!.movedThisTick).toBe(false);
  });

  it("REGRESSION: rapid left→right reversal never teleports Pip backward", () => {
    // Brief 61 regression: Pip's position must never move backward by more than
    // PLAYER_SPEED in a single tick, even during rapid direction changes.
    // Under the old tile-commit system, mid-glide reversals could produce a
    // renderPos jump of ~0.67 tiles backward. With continuous movement this is
    // impossible: each tick, position changes by at most PLAYER_SPEED per axis.
    const { world, pip, control, act } = setup();
    const positions: number[] = [pip.transform!.x];

    // Move left for 2 ticks, then immediately reverse to right for 2 ticks.
    pip.player!.pendingMoveX = "left";
    tick(world, control, act, 0);
    positions.push(pip.transform!.x);
    tick(world, control, act, 1);
    positions.push(pip.transform!.x);

    pip.player!.pendingMoveX = "right"; // reverse mid-step
    tick(world, control, act, 2);
    positions.push(pip.transform!.x);
    tick(world, control, act, 3);
    positions.push(pip.transform!.x);

    // Verify no single tick produces a backward jump larger than PLAYER_SPEED.
    for (let i = 1; i < positions.length; i++) {
      const delta = positions[i]! - positions[i - 1]!;
      // The worst backward jump allowed is PLAYER_SPEED (one tick of movement).
      expect(delta).toBeGreaterThanOrEqual(-(PLAYER_SPEED + 1e-9));
    }
  });

  it("press-stop-press the opposite way does not teleport backward", () => {
    // Stopping no longer snaps to a tile — Pip rests at whatever sub-tile position it occupied.
    // Regression property: no backward jump larger than one tick of velocity.
    const { world, pip, control, act } = setup();
    pip.player!.pendingMoveX = "left";
    tick(world, control, act, 0);
    const afterLeftX = pip.transform!.x;
    // After moving left, x < PIP.x.
    expect(afterLeftX).toBeLessThan(PIP.x);

    pip.player!.pendingMoveX = null; // release
    tick(world, control, act, 1);
    // Pip stays exactly where it stopped — no snap.
    expect(pip.transform!.x).toBeCloseTo(afterLeftX);

    pip.player!.pendingMoveX = "right"; // press opposite way
    tick(world, control, act, 2);
    // Pip moves right by PLAYER_SPEED — clean, no backward jump.
    expect(pip.transform!.x).toBeCloseTo(afterLeftX + PLAYER_SPEED);
  });

  it("does not move into a tile blocked by a tree feature", () => {
    const { world, pip, control, act } = setup();
    // Place tree far enough right that Pip can't cross it even with continuous
    // sub-tile movement. Start Pip 0.1 tiles west of the tile boundary.
    pip.transform!.x = PIP.x + 0.4;
    const tx = PIP.x + 1, ty = PIP.y;
    world.spawn({
      transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
      tileFeature: { kind: "tree", tileX: tx, tileY: ty, regionId: "farm-pip", ownerId: pip.id! },
    });
    pip.player!.pendingMoveX = "right";
    // Run enough ticks that Pip would cross the boundary without collision.
    for (let t = 0; t < 6; t++) tick(world, control, act, t);
    // AABB half-width = 0.3 → right edge must stay below tx (= PIP.x+1).
    // x + 0.3 < PIP.x + 1 → x < PIP.x + 0.7
    expect(pip.transform!.x).toBeLessThanOrEqual(PIP.x + 0.7 + 0.001);
    expect(pip.player!.facing).toBe("right"); // still turned to face it
  });

  it("does not move onto a non-walkable tile", () => {
    const { world, pip, control, act } = setup();
    // Push Pip close to the farm's NW edge, then try to walk up off the island.
    // The NW boundary: farm-pip minY is known from FARM_PIP_BOUNDS. The ocean
    // tile above the top row of the farm is non-walkable. Place Pip near the
    // top edge so it hits the collision within a few ticks.
    const farmRegion = getRegion("farm-pip");
    pip.transform!.x = farmRegion.center.x;
    pip.transform!.y = farmRegion.bounds.minY + 0.4;
    pip.player!.pendingMoveY = "up"; // ocean above minY
    for (let t = 0; t < 6; t++) tick(world, control, act, t);
    // Pip must not have crossed above minY (AABB half-height 0.3 → y ≥ minY + 0.3 - ε).
    expect(pip.transform!.y).toBeGreaterThanOrEqual(farmRegion.bounds.minY - 0.001);
    expect(pip.player!.facing).toBe("up");
  });
});

describe("PlayerControlSystem — hotbar action", () => {
  it("tills bare farm ground in front of Pip with the hoe (creates an empty plot)", () => {
    const { world, pip, control, act } = setup();
    pip.player!.selectedSlot = SLOT.hoe;
    pip.player!.facing = "right";
    pip.player!.pendingAction = true;
    tick(world, control, act);
    const tx = PIP.x + 1, ty = PIP.y;
    const plot = [...world.query("plot")].find(
      (p) => p.plot.tileX === tx && p.plot.tileY === ty,
    );
    expect(plot).toBeDefined();
    expect(plot!.plot.ownerId).toBe(pip.id);
    expect(plot!.plot.state.kind).toBe("empty");
  });

  it("plants the selected seed on an empty owned plot Pip faces", () => {
    const { world, pip, control, act } = setup();
    const tx = PIP.x + 1, ty = PIP.y;
    world.spawn({
      transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
      plot: { ownerId: pip.id!, regionId: "farm-pip", tileX: tx, tileY: ty, state: { kind: "empty" } },
    });
    pip.player!.selectedSlot = SLOT.radish;
    pip.player!.facing = "right";
    pip.player!.pendingAction = true;
    tick(world, control, act);
    const plot = [...world.query("plot")].find((p) => p.plot.tileX === tx && p.plot.tileY === ty)!;
    expect(plot.plot.state.kind).toBe("planted");
    expect(pip.inventory!.seeds.radish).toBe(2); // one seed consumed
  });

  it("waters a planted, unwatered plot Pip faces", () => {
    const { world, pip, control, act } = setup();
    const tx = PIP.x + 1, ty = PIP.y;
    world.spawn({
      transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
      plot: {
        ownerId: pip.id!, regionId: "farm-pip", tileX: tx, tileY: ty,
        state: { kind: "planted", crop: "radish", daysGrowing: 0, readyAtDay: 2, weatherSum: 0, daysSinceWater: 1, wateredToday: false },
      },
    });
    pip.player!.selectedSlot = SLOT.can;
    pip.player!.facing = "right";
    pip.player!.pendingAction = true;
    tick(world, control, act);
    const plot = [...world.query("plot")].find((p) => p.plot.tileX === tx && p.plot.tileY === ty)!;
    const state = plot.plot.state as Extract<typeof plot.plot.state, { kind: "planted" }>;
    expect(state.wateredToday).toBe(true);
    expect(pip.inventory!.wateringCan!.charges).toBe(9); // one charge used
  });

  it("chops a tree Pip faces, awarding wood", () => {
    const { world, pip, control, act } = setup();
    const tx = PIP.x + 1, ty = PIP.y;
    world.spawn({
      transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
      tileFeature: { kind: "tree", tileX: tx, tileY: ty, regionId: "farm-pip", ownerId: pip.id! },
    });
    pip.player!.selectedSlot = SLOT.axe;
    pip.player!.facing = "right";
    pip.player!.pendingAction = true;
    tick(world, control, act);
    expect(pip.resources!.wood).toBeGreaterThan(0);
    const stillThere = [...world.query("tileFeature")].some((f) => f.tileFeature.tileX === tx && f.tileFeature.tileY === ty);
    expect(stillThere).toBe(false);
  });

  it("does nothing tilling off Pip's own farm (in the village)", () => {
    const { world, pip, control, act } = setup();
    pip.player!.selectedSlot = SLOT.hoe;
    // Stand in the village (not Pip's farm) so bare ground won't till.
    pip.transform!.x = 19; pip.transform!.y = 19;
    pip.farmer!.currentRegion = "village";
    pip.player!.facing = "right";
    pip.player!.pendingAction = true;
    const before = [...world.query("plot")].length;
    tick(world, control, act);
    expect([...world.query("plot")].length).toBe(before);
    expect(pip.player!.pendingAction).toBe(false); // consumed regardless
  });

  it("the selected slot decides the action: the hoe won't chop a tree", () => {
    const { world, pip, control, act } = setup();
    const tx = PIP.x + 1, ty = PIP.y;
    world.spawn({
      transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
      tileFeature: { kind: "tree", tileX: tx, tileY: ty, regionId: "farm-pip", ownerId: pip.id! },
    });
    pip.player!.selectedSlot = SLOT.hoe; // wrong tool for a tree
    pip.player!.facing = "right";
    pip.player!.pendingAction = true;
    tick(world, control, act);
    // Tree still standing; no wood awarded.
    expect(pip.resources!.wood).toBe(0);
    const stillThere = [...world.query("tileFeature")].some(
      (f) => f.tileFeature.tileX === tx && f.tileFeature.tileY === ty,
    );
    expect(stillThere).toBe(true);
  });

  it("won't plant a seed the player doesn't have", () => {
    const { world, pip, control, act } = setup();
    const tx = PIP.x + 1, ty = PIP.y;
    world.spawn({
      transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
      plot: { ownerId: pip.id!, regionId: "farm-pip", tileX: tx, tileY: ty, state: { kind: "empty" } },
    });
    pip.player!.selectedSlot = SLOT.wheat; // seeds.wheat === 0
    pip.player!.facing = "right";
    pip.player!.pendingAction = true;
    tick(world, control, act);
    const plot = [...world.query("plot")].find((p) => p.plot.tileX === tx && p.plot.tileY === ty)!;
    expect(plot.plot.state.kind).toBe("empty"); // nothing planted
  });
});

describe("PlayerControlSystem — click-to-act (pendingActionTile)", () => {
  it("(a) plants at the CLICKED tile when pendingActionTile is Chebyshev-≤1 from Pip", () => {
    const { world, pip, control, act } = setup();
    // Plant on the tile directly below Pip (dy=1 → Chebyshev 1). Pip is facing right
    // to ensure the action does NOT use the faced tile.
    const tx = PIP.x, ty = PIP.y + 1;
    world.spawn({
      transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
      plot: { ownerId: pip.id!, regionId: "farm-pip", tileX: tx, tileY: ty, state: { kind: "empty" } },
    });
    pip.player!.selectedSlot = SLOT.radish;
    pip.player!.facing = "right"; // faced tile is PIP.x+1, NOT the clicked tile
    pip.player!.pendingAction = true;
    pip.player!.pendingActionTile = { x: tx, y: ty }; // below Pip, Chebyshev=1

    tick(world, control, act);

    // The action should have fired on the CLICKED tile (below), not the faced tile (right).
    const plot = [...world.query("plot")].find((p) => p.plot.tileX === tx && p.plot.tileY === ty)!;
    expect(plot.plot.state.kind).toBe("planted");
    expect(pip.inventory!.seeds.radish).toBe(2); // one seed consumed
    // pendingActionTile must be cleared
    expect(pip.player!.pendingActionTile).toBeNull();
  });

  it("(b) out-of-reach click (Chebyshev≥2) queues NO intent and clears pendingActionTile", () => {
    const { world, pip, control, act } = setup();
    // Place a plot 3 tiles away — clearly out of reach.
    const tx = PIP.x + 3, ty = PIP.y;
    world.spawn({
      transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
      plot: { ownerId: pip.id!, regionId: "farm-pip", tileX: tx, tileY: ty, state: { kind: "empty" } },
    });
    pip.player!.selectedSlot = SLOT.radish;
    pip.player!.facing = "down";
    pip.player!.pendingAction = true;
    pip.player!.pendingActionTile = { x: tx, y: ty }; // Chebyshev=3

    tick(world, control, act);

    // Plot must remain empty (no intent queued).
    const plot = [...world.query("plot")].find((p) => p.plot.tileX === tx && p.plot.tileY === ty)!;
    expect(plot.plot.state.kind).toBe("empty");
    // Seeds unchanged
    expect(pip.inventory!.seeds.radish).toBe(3);
    // pendingActionTile must still be cleared
    expect(pip.player!.pendingActionTile).toBeNull();
  });

  it("(c) REGRESSION: pendingAction with pendingActionTile=null uses the faced tile (E-key path)", () => {
    const { world, pip, control, act } = setup();
    // Plant on the tile Pip is facing (right).
    const tx = PIP.x + 1, ty = PIP.y;
    world.spawn({
      transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
      plot: { ownerId: pip.id!, regionId: "farm-pip", tileX: tx, tileY: ty, state: { kind: "empty" } },
    });
    pip.player!.selectedSlot = SLOT.radish;
    pip.player!.facing = "right";
    pip.player!.pendingAction = true;
    pip.player!.pendingActionTile = null; // explicit null → E-key path

    tick(world, control, act);

    const plot = [...world.query("plot")].find((p) => p.plot.tileX === tx && p.plot.tileY === ty)!;
    expect(plot.plot.state.kind).toBe("planted");
    expect(pip.inventory!.seeds.radish).toBe(2);
  });
});

describe("PlayerControlSystem — fishing", () => {
  // Fishing-isle west edge tile (75,108); its west neighbour (74,108) is ocean,
  // its east neighbour (76,108) is isle land (radial 160×160 layout).
  const ISLE_EDGE = { x: 75, y: 108 };

  /** Stand Pip on the fishing-isle edge with a rod, facing the open water. */
  function standOnIsle(pip: GameEntity): void {
    pip.inventory!.tools!.push({ kind: "fishing-rod", tier: "wooden", durability: Infinity });
    pip.inventory!.fish = zeroFish();
    pip.transform!.x = ISLE_EDGE.x;
    pip.transform!.y = ISLE_EDGE.y;
    pip.farmer!.currentRegion = "fishing-isle";
    pip.player!.selectedSlot = SLOT.rod;
    pip.player!.facing = "left"; // faces (39,71) = ocean
  }

  it("fishes facing open water from the isle, banking gold and a fish", () => {
    const { world, pip, control, act } = setup();
    standOnIsle(pip);
    const goldBefore = pip.inventory!.gold;
    pip.player!.pendingAction = true;
    tick(world, control, act);
    const caught = pip.inventory!.fish!.minnow + pip.inventory!.fish!.bass + pip.inventory!.fish!.salmon;
    expect(caught).toBe(1);
    expect(pip.inventory!.gold).toBeGreaterThan(goldBefore);
    expect(pip.farmer!.busyUntilTick).toBeGreaterThan(0);
  });

  it("won't fish when facing land (not open water)", () => {
    const { world, pip, control, act } = setup();
    standOnIsle(pip);
    pip.player!.facing = "right"; // (41,71) is still isle land, not ocean
    const goldBefore = pip.inventory!.gold;
    pip.player!.pendingAction = true;
    tick(world, control, act);
    expect(pip.inventory!.gold).toBe(goldBefore);
    expect(pip.player!.pendingAction).toBe(false); // consumed regardless
  });

  it("won't fish off the isle even facing water", () => {
    const { world, pip, control, act } = setup();
    pip.inventory!.tools!.push({ kind: "fishing-rod", tier: "wooden", durability: Infinity });
    // On Pip's home farm, not the isle.
    pip.player!.selectedSlot = SLOT.rod;
    pip.player!.facing = "left";
    const goldBefore = pip.inventory!.gold;
    pip.player!.pendingAction = true;
    tick(world, control, act);
    expect(pip.inventory!.gold).toBe(goldBefore);
  });
});
