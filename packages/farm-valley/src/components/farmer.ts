import type { RegionId } from "../world/regions";

export type FarmerFsmState =
  | "WAIT_DAY"
  | "PERCEIVE"
  | "DELIBERATE"
  | "ACT"
  | "FINISH_DAY"
  // brief 27 — night sleep node. A farmer that reached home enters SLEEP for
  // the night phase (rested); one caught away is flagged unrested.
  | "SLEEP";

export interface Farmer {
  name: string;
  currentRegion: RegionId;
  /** brief 27 — the farmer's own farm region; "home" for the sleep check. */
  homeRegion?: RegionId;
  /**
   * When set, the farmer is busy with a physical action until this tick.
   * ActSystem skips execution (but not queue-building) while busy, so the
   * animation plays for a meaningful duration before the next action fires.
   */
  busyUntilTick?: number;
  path?: {
    waypoints: ReadonlyArray<{ x: number; y: number }>;
    nextIndex: number;       // index of the next waypoint to step onto
    ticksUntilStep: number;  // countdown to next tile step
  } | undefined;
  /**
   * RENDER-ONLY sub-tile position, in TILE units. TravelSystem advances this a
   * fraction of a tile each tick while walking a path so the per-tick snapshot
   * shows continuous motion, instead of the transform jumping a full tile once
   * per STEP_TICKS. NEVER read by sim logic (only the snapshot builder reads it);
   * the authoritative position remains the integer `transform`. Cleared on
   * arrival so a stopped farmer renders at its true tile.
   */
  renderPos?: { x: number; y: number } | undefined;
  /**
   * Set true on the tick the farmer stepped to a new tile under direct (non-
   * path) control — i.e. the player's Pip walking via WASD. The render walk-
   * cycle keys off `path` for AI farmers and off this flag for the player, so
   * Pip animates while moving even though it never builds a pathfinder route.
   * Cleared each tick by the controlling system.
   */
  movedThisTick?: boolean;
  /**
   * brief 44 — the sim day on which the farmer last hired a day-helper at the
   * tavern. The helper boost (extra AP, applied at the morning wake) lasts only
   * the day of hire; this gates re-hiring to once per day and lets the AP refill
   * know to add the bonus. Absent = no helper hired.
   */
  helperHiredDay?: number;
  /**
   * brief 45 — number of festival harvest contests this farmer has won. A small
   * standing bump + a recap/observer signal. Absent = never won one.
   */
  festivalWins?: number;
  /**
   * brief 46 — harbor standing / reputation score. Fulfilled contracts raise
   * this; missed committed contracts penalize it. Gates access to higher-tier
   * contracts. Absent = 0 (no reputation).
   */
  harborReputation?: number;
  /**
   * brief 46 — the contract the farmer has currently committed to (if any).
   * Set by the `commit-contract` action; cleared when delivered or missed.
   */
  committedContract?: import('../protocols/harbor').HarborContract | undefined;
  /**
   * brief 48 — true while the farmer is aboard their boat (rowing over water to
   * a coral reef). While aboard, TravelSystem pathfinds on the BOAT grid (water
   * lanes) instead of the land grid; `board-boat` sets it, `return-to-shore`
   * (back at the dock) clears it. Absent/false = on foot. The farmer always
   * boards/disembarks at a dock tile, so a non-aboard farmer is always on land.
   */
  aboard?: boolean;
}

/**
 * Tags the single player-controlled farmer (Pip). Identical components to the AI
 * farmers (so the same crop/harvest/market/render systems treat it as a farmer),
 * but its intentions come from keyboard input via PlayerControlSystem rather than
 * an AI personality, and DeliberateSystem skips it.
 *
 * `facing` is the direction Pip last faced; the context-action key acts on the
 * adjacent tile in that direction. `pendingMoveX`/`pendingMoveY`/`pendingAction`
 * are the buffered input from the most recent main→worker input message.
 */
export interface Player {
  readonly isPlayer: true;
  facing: "up" | "down" | "left" | "right";
  /**
   * The currently HELD move axes (the main thread resends them whenever the held
   * keys change, and sends null on release). Two independent axes so two keys
   * held at once (e.g. W+A) move Pip DIAGONALLY. The sim owns the step cadence:
   * PlayerControlSystem advances Pip one tile every PLAYER_STEP_TICKS ticks while
   * either axis is set, gliding renderPos in between, so Pip (and a camera
   * following Pip) moves continuously instead of jumping a full tile per step.
   */
  pendingMoveX: "left" | "right" | null;
  pendingMoveY: "up" | "down" | null;
  /** True if the context-action key is queued for the next control tick. */
  pendingAction: boolean;
  /**
   * Index of the selected hotbar slot (0-based; see HOTBAR_SLOTS in
   * systems/player-control.ts). The action key uses this slot's tool/seed
   * instead of auto-picking by context. Set by number-key input (1→0, 2→1, …).
   */
  selectedSlot: number;
  /**
   * Sim-owned step cadence counter (ticks until the next one-tile commit while a
   * direction is held). Render-pacing bookkeeping, deterministic — depends only
   * on tick count and held input. Starts at 0 so the first held tick steps
   * immediately (no input latency).
   */
  stepCooldown: number;
  /**
   * The tile Pip left on the most recent step commit, in TILE units. The
   * in-between ticks ease renderPos from here up into the committed transform
   * tile (a TRAILING glide — the visual never leads the authoritative position).
   * Render-pacing only.
   */
  glideFromX: number;
  glideFromY: number;
}
