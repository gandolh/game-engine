import { ZERO_CROPS } from "../economy";
import { describe, it, expect } from "vitest";
import { World } from "@engine/core";
import type { GameEntity } from "../components";
import { zeroFish } from "../components";
import { PlayerControlSystem } from "./player-control";
import { ActSystem } from "./act";
import { getRegion } from "../world/regions";

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
    player: { isPlayer: true, facing: "down", pendingMoveX: null, pendingMoveY: null, pendingAction: false, selectedSlot: 0, stepCooldown: 0, glideFromX: PIP.x, glideFromY: PIP.y },
  });
  return {
    world,
    pip,
    control: new PlayerControlSystem(world),
    act: new ActSystem(world),
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
  it("steps one walkable tile and sets facing on the first held tick", () => {
    const { world, pip, control, act } = setup();
    pip.player!.pendingMoveX = "right";
    tick(world, control, act);
    expect(pip.transform!.x).toBe(PIP.x + 1);
    expect(pip.transform!.y).toBe(PIP.y);
    expect(pip.player!.facing).toBe("right");
    expect(pip.farmer!.movedThisTick).toBe(true);
    // The held axis stays set while the key is down (not a one-shot pulse); the
    // sim paces the next step via stepCooldown.
    expect(pip.player!.pendingMoveX).toBe("right");
  });

  it("paces held movement: steps every PLAYER_STEP_TICKS ticks, trailing-gliding between", () => {
    const { world, pip, control, act } = setup();
    pip.player!.pendingMoveX = "right"; // held
    // Tick 1: immediate commit (cooldown 0 → step → reset). transform is already
    // on the destination tile; renderPos starts on the tile we LEFT (trailing).
    tick(world, control, act, 0);
    expect(pip.transform!.x).toBe(PIP.x + 1);
    expect(pip.farmer!.renderPos!.x).toBe(PIP.x); // trails at the origin tile
    // In-between ticks ease renderPos UP toward the committed transform tile
    // (never past it) — transform does not advance.
    tick(world, control, act, 1);
    expect(pip.transform!.x).toBe(PIP.x + 1); // not committed yet
    expect(pip.farmer!.renderPos!.x).toBeGreaterThan(PIP.x); // gliding in
    expect(pip.farmer!.renderPos!.x).toBeLessThan(PIP.x + 1); // but trailing transform
    tick(world, control, act, 2);
    expect(pip.transform!.x).toBe(PIP.x + 1); // still gliding
    // Tick 4: cooldown elapsed → next commit.
    tick(world, control, act, 3);
    expect(pip.transform!.x).toBe(PIP.x + 2);
  });

  it("moves diagonally when both axes are held", () => {
    const { world, pip, control, act } = setup();
    pip.player!.pendingMoveX = "right";
    pip.player!.pendingMoveY = "down";
    tick(world, control, act);
    expect(pip.transform!.x).toBe(PIP.x + 1);
    expect(pip.transform!.y).toBe(PIP.y + 1);
    expect(pip.farmer!.movedThisTick).toBe(true);
    expect(pip.player!.facing).toBe("right"); // horizontal wins for the sprite
  });

  it("wall-slides: a blocked diagonal falls back to the open axis", () => {
    const { world, pip, control, act } = setup();
    // Block the down tile (a tree directly below) but leave the right tile open.
    const bx = PIP.x, by = PIP.y + 1;
    world.spawn({
      transform: { x: bx, y: by, prevX: bx, prevY: by, rotation: 0 },
      tileFeature: { kind: "tree", tileX: bx, tileY: by, regionId: "farm-pip", ownerId: pip.id! },
    });
    pip.player!.pendingMoveX = "right";
    pip.player!.pendingMoveY = "down"; // SE diagonal blocked on the S orthogonal
    tick(world, control, act);
    // Corner-cut forbidden, so it slides horizontally instead of going diagonal.
    expect(pip.transform!.x).toBe(PIP.x + 1);
    expect(pip.transform!.y).toBe(PIP.y);
  });

  it("clears renderPos and resets cadence on key release", () => {
    const { world, pip, control, act } = setup();
    pip.player!.pendingMoveX = "right";
    tick(world, control, act, 0);
    pip.player!.pendingMoveX = null; // release
    tick(world, control, act, 1);
    expect(pip.farmer!.renderPos).toBeUndefined();
    expect(pip.player!.stepCooldown).toBe(0); // next press steps immediately
  });

  it("press-stop-press the opposite way does not yank the visual backward", () => {
    // Regression for the press-A-then-D shake: the trailing glide must never
    // leave renderPos ahead of transform, so a release/flip never snaps back.
    const { world, pip, control, act } = setup();
    pip.player!.pendingMoveX = "left";
    tick(world, control, act, 0); // commit left; renderPos at the origin (trailing)
    const afterLeftX = pip.transform!.x;
    // renderPos must be at or behind (>=) the committed tile, never ahead (<).
    expect(pip.farmer!.renderPos!.x).toBeGreaterThanOrEqual(afterLeftX);
    pip.player!.pendingMoveX = null; // release
    tick(world, control, act, 1);
    expect(pip.farmer!.renderPos).toBeUndefined(); // snaps cleanly to transform
    pip.player!.pendingMoveX = "right"; // now press the opposite way
    tick(world, control, act, 2);
    expect(pip.transform!.x).toBe(afterLeftX + 1); // clean step back right
  });

  it("does not step onto a tree/stone but still turns to face it", () => {
    const { world, pip, control, act } = setup();
    const tx = PIP.x + 1, ty = PIP.y;
    world.spawn({
      transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
      tileFeature: { kind: "tree", tileX: tx, tileY: ty, regionId: "farm-pip", ownerId: pip.id! },
    });
    pip.player!.pendingMoveX = "right";
    tick(world, control, act);
    expect(pip.transform!.x).toBe(PIP.x); // blocked by the tree
    expect(pip.transform!.y).toBe(PIP.y);
    expect(pip.player!.facing).toBe("right"); // still turned to face it
    expect(pip.farmer!.movedThisTick).toBe(false);
  });

  it("does not step onto a non-walkable tile but still turns to face it", () => {
    const { world, pip, control, act } = setup();
    // Push Pip to the farm's NW corner, then try to walk up off the island.
    pip.transform!.x = 28;
    pip.transform!.y = 14;
    pip.player!.pendingMoveY = "up"; // (28,13) is ocean/void — not walkable
    tick(world, control, act);
    expect(pip.transform!.x).toBe(28);
    expect(pip.transform!.y).toBe(14);
    expect(pip.player!.facing).toBe("up");
    expect(pip.farmer!.movedThisTick).toBe(false);
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

describe("PlayerControlSystem — fishing", () => {
  // Fishing-isle west edge tile (40,71); its west neighbour (39,71) is ocean.
  const ISLE_EDGE = { x: 40, y: 71 };

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
