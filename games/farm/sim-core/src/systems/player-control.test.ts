import { ZERO_CROPS } from "../economy";
import { describe, it, expect } from "vitest";
import { World, createRng } from "@engine/core";
import type { GameEntity } from "../components";
import { zeroFish } from "../components";
import { PlayerControlSystem } from "./player-control";
import { ActSystem } from "./act";
import { getRegion } from "../world/regions";
import { PORTS } from "../world/ports";
import { PLAYER_SPEED } from "./player-control";

const SLOT = { can: 0, hoe: 1, axe: 2, pickaxe: 3, rod: 4, radish: 5, wheat: 6, pumpkin: 7 } as const;

const PIP = getRegion("farm-pip").center;

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
    player: {
      isPlayer: true,
      facing: "down",
      pendingMoveX: null,
      pendingMoveY: null,
      pendingAction: false,
      selectedSlot: 0,
      pendingActionTile: null,
    },
  });
  return {
    world,
    pip,
    control: new PlayerControlSystem(world),
    act: new ActSystem(world, createRng(1)),
  };
}

function tick(world: World<GameEntity>, control: PlayerControlSystem, act: ActSystem, t = 0): void {
  control.run({ tick: t });
  act.run({ tick: t });
}

describe("PlayerControlSystem — movement", () => {
  it("moves Pip sub-tile immediately on the first held tick (no latency)", () => {
    const { world, pip, control, act } = setup();
    pip.player!.pendingMoveX = "right";
    tick(world, control, act);

    expect(pip.transform!.x).toBeCloseTo(PIP.x + PLAYER_SPEED);
    expect(pip.transform!.y).toBeCloseTo(PIP.y);
    expect(pip.player!.facing).toBe("right");
    expect(pip.farmer!.movedThisTick).toBe(true);
    expect(pip.player!.pendingMoveX).toBe("right");
  });

  it("reaches ~1 tile after PLAYER_STEP_TICKS held ticks (speed parity)", () => {
    const { world, pip, control, act } = setup();
    pip.player!.pendingMoveX = "right";
    for (let t = 0; t < 3; t++) tick(world, control, act, t);

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

    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]! - positions[i - 1]!).toBeCloseTo(PLAYER_SPEED, 5);
    }
  });

  it("moves diagonally when both axes are held (axis-independent, not normalized)", () => {
    const { world, pip, control, act } = setup();
    pip.player!.pendingMoveX = "right";
    pip.player!.pendingMoveY = "down";
    tick(world, control, act);
    expect(pip.transform!.x).toBeCloseTo(PIP.x + PLAYER_SPEED);
    expect(pip.transform!.y).toBeCloseTo(PIP.y + PLAYER_SPEED);
    expect(pip.farmer!.movedThisTick).toBe(true);
    expect(pip.player!.facing).toBe("right");
  });

  it("wall-slides: moving into a blocked X axis slides along Y instead", () => {
    const { world, pip, control, act } = setup();

    const bx = PIP.x + 1,
      by = PIP.y;
    world.spawn({
      transform: { x: bx, y: by, prevX: bx, prevY: by, rotation: 0 },
      tileFeature: { kind: "tree", tileX: bx, tileY: by, regionId: "farm-pip", ownerId: pip.id! },
    });
    pip.player!.pendingMoveX = "right";
    pip.player!.pendingMoveY = "down";
    tick(world, control, act);

    expect(pip.transform!.x).toBeLessThanOrEqual(PIP.x + 0.2 + 0.001);
    expect(pip.transform!.y).toBeCloseTo(PIP.y + PLAYER_SPEED);
  });

  it("Pip can stop mid-tile and rest at a fractional position", () => {
    const { world, pip, control, act } = setup();
    pip.player!.pendingMoveX = "right";
    tick(world, control, act, 0);
    tick(world, control, act, 1);
    const midX = pip.transform!.x;

    expect(midX).not.toBe(Math.round(midX));
    pip.player!.pendingMoveX = null;
    tick(world, control, act, 2);

    expect(pip.transform!.x).toBeCloseTo(midX);
    expect(pip.farmer!.renderPos).toBeUndefined();
    expect(pip.farmer!.movedThisTick).toBe(false);
  });

  it("REGRESSION: rapid left→right reversal never teleports Pip backward", () => {
    const { world, pip, control, act } = setup();
    const positions: number[] = [pip.transform!.x];

    pip.player!.pendingMoveX = "left";
    tick(world, control, act, 0);
    positions.push(pip.transform!.x);
    tick(world, control, act, 1);
    positions.push(pip.transform!.x);

    pip.player!.pendingMoveX = "right";
    tick(world, control, act, 2);
    positions.push(pip.transform!.x);
    tick(world, control, act, 3);
    positions.push(pip.transform!.x);

    for (let i = 1; i < positions.length; i++) {
      const delta = positions[i]! - positions[i - 1]!;

      expect(delta).toBeGreaterThanOrEqual(-(PLAYER_SPEED + 1e-9));
    }
  });

  it("press-stop-press the opposite way does not teleport backward", () => {
    const { world, pip, control, act } = setup();
    pip.player!.pendingMoveX = "left";
    tick(world, control, act, 0);
    const afterLeftX = pip.transform!.x;

    expect(afterLeftX).toBeLessThan(PIP.x);

    pip.player!.pendingMoveX = null;
    tick(world, control, act, 1);

    expect(pip.transform!.x).toBeCloseTo(afterLeftX);

    pip.player!.pendingMoveX = "right";
    tick(world, control, act, 2);

    expect(pip.transform!.x).toBeCloseTo(afterLeftX + PLAYER_SPEED);
  });

  it("does not move into a tile blocked by a tree feature", () => {
    const { world, pip, control, act } = setup();

    const tx = PIP.x + 1,
      ty = PIP.y;
    world.spawn({
      transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
      tileFeature: { kind: "tree", tileX: tx, tileY: ty, regionId: "farm-pip", ownerId: pip.id! },
    });
    pip.player!.pendingMoveX = "right";

    for (let t = 0; t < 6; t++) tick(world, control, act, t);

    expect(pip.transform!.x).toBeLessThanOrEqual(PIP.x + 0.2 + 0.001);
    expect(pip.player!.facing).toBe("right");
  });

  it("does not move onto a non-walkable tile", () => {
    const { world, pip, control, act } = setup();

    const farmRegion = getRegion("farm-pip");
    pip.transform!.x = farmRegion.center.x;
    pip.transform!.y = farmRegion.bounds.minY + 0.4;
    pip.player!.pendingMoveY = "up";
    for (let t = 0; t < 6; t++) tick(world, control, act, t);

    expect(pip.transform!.y).toBeGreaterThanOrEqual(farmRegion.bounds.minY - 0.2 - 0.001);
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
    const tx = PIP.x + 1,
      ty = PIP.y;
    const plot = [...world.query("plot")].find((p) => p.plot.tileX === tx && p.plot.tileY === ty);
    expect(plot).toBeDefined();
    expect(plot!.plot.ownerId).toBe(pip.id);
    expect(plot!.plot.state.kind).toBe("empty");
  });

  it("plants the selected seed on an empty owned plot Pip faces", () => {
    const { world, pip, control, act } = setup();
    const tx = PIP.x + 1,
      ty = PIP.y;
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
    expect(pip.inventory!.seeds.radish).toBe(2);
  });

  it("waters a planted, unwatered plot Pip faces", () => {
    const { world, pip, control, act } = setup();
    const tx = PIP.x + 1,
      ty = PIP.y;
    world.spawn({
      transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
      plot: {
        ownerId: pip.id!,
        regionId: "farm-pip",
        tileX: tx,
        tileY: ty,
        state: {
          kind: "planted",
          crop: "radish",
          daysGrowing: 0,
          readyAtDay: 2,
          weatherSum: 0,
          daysSinceWater: 1,
          wateredToday: false,
        },
      },
    });
    pip.player!.selectedSlot = SLOT.can;
    pip.player!.facing = "right";
    pip.player!.pendingAction = true;
    tick(world, control, act);
    const plot = [...world.query("plot")].find((p) => p.plot.tileX === tx && p.plot.tileY === ty)!;
    const state = plot.plot.state as Extract<typeof plot.plot.state, { kind: "planted" }>;
    expect(state.wateredToday).toBe(true);
    expect(pip.inventory!.wateringCan!.charges).toBe(9);
  });

  it("chops a tree Pip faces, awarding wood", () => {
    const { world, pip, control, act } = setup();
    const tx = PIP.x + 1,
      ty = PIP.y;
    world.spawn({
      transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
      tileFeature: { kind: "tree", tileX: tx, tileY: ty, regionId: "farm-pip", ownerId: pip.id! },
    });
    pip.player!.selectedSlot = SLOT.axe;
    pip.player!.facing = "right";
    pip.player!.pendingAction = true;
    tick(world, control, act);
    expect(pip.resources!.wood).toBeGreaterThan(0);
    const stillThere = [...world.query("tileFeature")].some(
      (f) => f.tileFeature.tileX === tx && f.tileFeature.tileY === ty,
    );
    expect(stillThere).toBe(false);
  });

  it("does nothing tilling off Pip's own farm (in the village)", () => {
    const { world, pip, control, act } = setup();
    pip.player!.selectedSlot = SLOT.hoe;

    pip.transform!.x = 19;
    pip.transform!.y = 19;
    pip.farmer!.currentRegion = "village";
    pip.player!.facing = "right";
    pip.player!.pendingAction = true;
    const before = [...world.query("plot")].length;
    tick(world, control, act);
    expect([...world.query("plot")].length).toBe(before);
    expect(pip.player!.pendingAction).toBe(false);
  });

  it("the selected slot decides the action: the hoe won't chop a tree", () => {
    const { world, pip, control, act } = setup();
    const tx = PIP.x + 1,
      ty = PIP.y;
    world.spawn({
      transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
      tileFeature: { kind: "tree", tileX: tx, tileY: ty, regionId: "farm-pip", ownerId: pip.id! },
    });
    pip.player!.selectedSlot = SLOT.hoe;
    pip.player!.facing = "right";
    pip.player!.pendingAction = true;
    tick(world, control, act);

    expect(pip.resources!.wood).toBe(0);
    const stillThere = [...world.query("tileFeature")].some(
      (f) => f.tileFeature.tileX === tx && f.tileFeature.tileY === ty,
    );
    expect(stillThere).toBe(true);
  });

  it("won't plant a seed the player doesn't have", () => {
    const { world, pip, control, act } = setup();
    const tx = PIP.x + 1,
      ty = PIP.y;
    world.spawn({
      transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
      plot: { ownerId: pip.id!, regionId: "farm-pip", tileX: tx, tileY: ty, state: { kind: "empty" } },
    });
    pip.player!.selectedSlot = SLOT.wheat;
    pip.player!.facing = "right";
    pip.player!.pendingAction = true;
    tick(world, control, act);
    const plot = [...world.query("plot")].find((p) => p.plot.tileX === tx && p.plot.tileY === ty)!;
    expect(plot.plot.state.kind).toBe("empty");
  });
});

describe("PlayerControlSystem — click-to-act (pendingActionTile)", () => {
  it("(a) plants at the CLICKED tile when pendingActionTile is Chebyshev-≤1 from Pip", () => {
    const { world, pip, control, act } = setup();

    const tx = PIP.x,
      ty = PIP.y + 1;
    world.spawn({
      transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
      plot: { ownerId: pip.id!, regionId: "farm-pip", tileX: tx, tileY: ty, state: { kind: "empty" } },
    });
    pip.player!.selectedSlot = SLOT.radish;
    pip.player!.facing = "right";
    pip.player!.pendingAction = true;
    pip.player!.pendingActionTile = { x: tx, y: ty };

    tick(world, control, act);

    const plot = [...world.query("plot")].find((p) => p.plot.tileX === tx && p.plot.tileY === ty)!;
    expect(plot.plot.state.kind).toBe("planted");
    expect(pip.inventory!.seeds.radish).toBe(2);

    expect(pip.player!.pendingActionTile).toBeNull();
  });

  it("(b) out-of-reach click (Chebyshev≥2) queues NO intent and clears pendingActionTile", () => {
    const { world, pip, control, act } = setup();

    const tx = PIP.x + 3,
      ty = PIP.y;
    world.spawn({
      transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
      plot: { ownerId: pip.id!, regionId: "farm-pip", tileX: tx, tileY: ty, state: { kind: "empty" } },
    });
    pip.player!.selectedSlot = SLOT.radish;
    pip.player!.facing = "down";
    pip.player!.pendingAction = true;
    pip.player!.pendingActionTile = { x: tx, y: ty };

    tick(world, control, act);

    const plot = [...world.query("plot")].find((p) => p.plot.tileX === tx && p.plot.tileY === ty)!;
    expect(plot.plot.state.kind).toBe("empty");

    expect(pip.inventory!.seeds.radish).toBe(3);

    expect(pip.player!.pendingActionTile).toBeNull();
  });

  it("(c) REGRESSION: pendingAction with pendingActionTile=null uses the faced tile (E-key path)", () => {
    const { world, pip, control, act } = setup();

    const tx = PIP.x + 1,
      ty = PIP.y;
    world.spawn({
      transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
      plot: { ownerId: pip.id!, regionId: "farm-pip", tileX: tx, tileY: ty, state: { kind: "empty" } },
    });
    pip.player!.selectedSlot = SLOT.radish;
    pip.player!.facing = "right";
    pip.player!.pendingAction = true;
    pip.player!.pendingActionTile = null;

    tick(world, control, act);

    const plot = [...world.query("plot")].find((p) => p.plot.tileX === tx && p.plot.tileY === ty)!;
    expect(plot.plot.state.kind).toBe("planted");
    expect(pip.inventory!.seeds.radish).toBe(2);
  });
});

describe("PlayerControlSystem — fishing", () => {
  // Derive a fishing-isle edge tile (seed-generated positions, brief 93) whose
  // LEFT neighbour is open ocean and RIGHT neighbour is land: facing "left" =
  // water (fishes), facing "right" = land (won't fish).
  function isleWaterEdge(): { x: number; y: number } {
    const b = getRegion("fishing-isle").bounds;
    const midY = Math.floor((b.minY + b.maxY) / 2);
    return { x: b.minX, y: midY }; // left edge tile; b.minX-1 is ocean, b.minX+1 is land
  }

  function standOnIsle(pip: GameEntity): void {
    pip.inventory!.tools!.push({ kind: "fishing-rod", tier: "wooden", durability: Infinity });
    pip.inventory!.fish = zeroFish();
    const edge = isleWaterEdge();
    pip.transform!.x = edge.x;
    pip.transform!.y = edge.y;
    pip.farmer!.currentRegion = "fishing-isle";
    pip.player!.selectedSlot = SLOT.rod;
    pip.player!.facing = "left";
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
    pip.player!.facing = "right";
    const goldBefore = pip.inventory!.gold;
    pip.player!.pendingAction = true;
    tick(world, control, act);
    expect(pip.inventory!.gold).toBe(goldBefore);
    expect(pip.player!.pendingAction).toBe(false);
  });

  it("won't fish off the isle even facing water", () => {
    const { world, pip, control, act } = setup();
    pip.inventory!.tools!.push({ kind: "fishing-rod", tier: "wooden", durability: Infinity });

    pip.player!.selectedSlot = SLOT.rod;
    pip.player!.facing = "left";
    const goldBefore = pip.inventory!.gold;
    pip.player!.pendingAction = true;
    tick(world, control, act);
    expect(pip.inventory!.gold).toBe(goldBefore);
  });
});

describe("PlayerControlSystem — port hop", () => {
  const PORT = PORTS[0]!;

  function standOnDock(pip: GameEntity): void {
    pip.transform!.x = PORT.dock.x;
    pip.transform!.y = PORT.dock.y;
    pip.farmer!.currentRegion = PORT.isle;
  }

  it("pressing action on a port dock boards the boat", () => {
    const { world, pip, control, act } = setup();
    standOnDock(pip);
    pip.player!.pendingAction = true;
    tick(world, control, act);
    expect(pip.farmer!.aboard).toBe(true);
  });

  it("pressing action again (aboard, on a dock) disembarks", () => {
    const { world, pip, control, act } = setup();
    standOnDock(pip);
    pip.player!.pendingAction = true;
    tick(world, control, act);
    expect(pip.farmer!.aboard).toBe(true);
    pip.player!.pendingAction = true;
    tick(world, control, act, 1);
    expect(pip.farmer!.aboard).toBe(false);
  });

  it("aboard, Pip can step onto a boat lane (ocean) but is blocked from open ocean", () => {
    const { world, pip, control, act } = setup();
    standOnDock(pip);
    pip.player!.pendingAction = true;
    tick(world, control, act);
    expect(pip.farmer!.aboard).toBe(true);

    pip.player!.pendingMoveX = "left";
    tick(world, control, act, 1);
    expect(pip.transform!.x).toBeLessThan(PORT.dock.x);
  });

  it("on foot, Pip cannot step onto an ocean lane tile (only aboard)", () => {
    const { world, pip, control, act } = setup();
    standOnDock(pip);
    pip.player!.pendingMoveX = "left";
    tick(world, control, act);

    expect(Math.round(pip.transform!.x)).toBe(PORT.dock.x);
  });
});

describe("PlayerControlSystem — feature index (brief 25)", () => {
  type Setup = ReturnType<typeof setup>;

  const player = (s: Setup): NonNullable<GameEntity["player"]> => s.pip.player as NonNullable<GameEntity["player"]>;
  const xf = (s: Setup): NonNullable<GameEntity["transform"]> =>
    s.pip.transform as NonNullable<GameEntity["transform"]>;

  function feature(
    { world, pip }: Setup,
    kind: "tree" | "stone" | "bush",
    tx: number,
    ty: number,
  ): ReturnType<typeof world.spawn> {
    return world.spawn({
      transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
      tileFeature: { kind, tileX: tx, tileY: ty, regionId: "farm-pip", ownerId: pip.id ?? 0 },
    });
  }

  function intentOf(s: Setup): string | undefined {
    return s.pip.intentions?.queue[0]?.kind;
  }

  it("slides along a row of features without entering any of them", () => {
    const s = setup();
    for (let dy = 0; dy < 4; dy++) feature(s, "tree", PIP.x + 1, PIP.y + dy);
    player(s).pendingMoveX = "right";
    player(s).pendingMoveY = "down";
    for (let t = 0; t < 8; t++) tick(s.world, s.control, s.act, t);
    expect(xf(s).x).toBeLessThanOrEqual(PIP.x + 0.2 + 0.001);
    expect(xf(s).y).toBeGreaterThan(PIP.y + 0.5);
  });

  it("is blocked by a solid footprint", () => {
    const s = setup();
    s.world.spawn({ solid: { isSolid: true, tileX: PIP.x + 1, tileY: PIP.y } });
    player(s).pendingMoveX = "right";
    for (let t = 0; t < 6; t++) tick(s.world, s.control, s.act, t);
    expect(xf(s).x).toBeLessThanOrEqual(PIP.x + 0.2 + 0.001);
  });

  it("sees a feature added earlier in the same tick, and one removed earlier in the same tick", () => {
    const s = setup();
    player(s).pendingMoveX = "right";
    // Warm the index with an empty tile row, then add a tree "by an earlier system" in the same tick.
    tick(s.world, s.control, s.act, 0);
    xf(s).x = PIP.x;
    const tree = feature(s, "tree", PIP.x + 1, PIP.y);
    for (let t = 1; t < 7; t++) tick(s.world, s.control, s.act, t);
    expect(xf(s).x).toBeLessThanOrEqual(PIP.x + 0.2 + 0.001);

    // The tree is removed right before the next run: Pip walks through at once.
    s.world.despawn(tree);
    s.control.run({ tick: 7 });
    expect(xf(s).x).toBeGreaterThan(PIP.x + 0.2 + 0.001);
  });

  it("sees a solid added and removed between runs", () => {
    const s = setup();
    player(s).pendingMoveX = "right";
    s.control.run({ tick: 0 });
    const solid = s.world.spawn({ solid: { isSolid: true, tileX: PIP.x + 1, tileY: PIP.y } });
    xf(s).x = PIP.x;
    for (let t = 1; t < 6; t++) s.control.run({ tick: t });
    expect(xf(s).x).toBeLessThanOrEqual(PIP.x + 0.2 + 0.001);
    s.world.despawn(solid);
    s.control.run({ tick: 6 });
    expect(xf(s).x).toBeGreaterThan(PIP.x + 0.2 + 0.001);
  });

  it("bushAt: a faced bush queues gather-bush; a tree or empty tile does not", () => {
    const s = setup();
    feature(s, "bush", PIP.x + 1, PIP.y);
    player(s).facing = "right";
    player(s).pendingAction = true;
    s.control.run({ tick: 0 });
    expect(intentOf(s)).toBe("gather-bush");

    const t = setup();
    feature(t, "tree", xf(t).x + 1, PIP.y);
    player(t).facing = "right";
    player(t).pendingAction = true;
    t.control.run({ tick: 0 });
    expect(intentOf(t)).toBeUndefined();

    const u = setup();
    player(u).facing = "right";
    player(u).pendingAction = true;
    u.control.run({ tick: 0 });
    expect(intentOf(u)).toBeUndefined();
  });

  it("two features on one tile: the first in spawn order decides the bush check and the axe intent", () => {
    const bushFirst = setup();
    feature(bushFirst, "bush", PIP.x + 1, PIP.y);
    feature(bushFirst, "tree", PIP.x + 1, PIP.y);
    player(bushFirst).facing = "right";
    player(bushFirst).pendingAction = true;
    bushFirst.control.run({ tick: 0 });
    expect(intentOf(bushFirst)).toBe("gather-bush");

    const treeFirst = setup();
    feature(treeFirst, "tree", PIP.x + 1, PIP.y);
    feature(treeFirst, "bush", PIP.x + 1, PIP.y);
    player(treeFirst).facing = "right";
    player(treeFirst).selectedSlot = SLOT.axe;
    player(treeFirst).pendingAction = true;
    treeFirst.control.run({ tick: 0 });
    expect(intentOf(treeFirst)).toBe("chop-tree");

    // The pickaxe wants stone but the first feature is a tree: no intent, same as the scan.
    const wrongTool = setup();
    feature(wrongTool, "tree", PIP.x + 1, PIP.y);
    feature(wrongTool, "stone", PIP.x + 1, PIP.y);
    player(wrongTool).facing = "right";
    player(wrongTool).selectedSlot = SLOT.pickaxe;
    player(wrongTool).pendingAction = true;
    wrongTool.control.run({ tick: 0 });
    expect(intentOf(wrongTool)).toBeUndefined();
  });

  it("after the first of two stacked features is removed, the second one answers", () => {
    const s = setup();
    const first = feature(s, "bush", PIP.x + 1, PIP.y);
    feature(s, "tree", PIP.x + 1, PIP.y);
    player(s).facing = "right";
    player(s).selectedSlot = SLOT.axe;
    player(s).pendingAction = true;
    s.control.run({ tick: 0 });
    expect(intentOf(s)).toBe("gather-bush");
    (s.pip.intentions as NonNullable<GameEntity["intentions"]>).queue = [];
    s.world.despawn(first);
    player(s).pendingAction = true;
    s.control.run({ tick: 1 });
    expect(intentOf(s)).toBe("chop-tree");
  });
});
