/**
 * HarborSystem — brief 46: harbor, shipping and contracts.
 *
 * Responsibilities:
 *  1. Every HARBOR_POST_CADENCE days, post HARBOR_BATCH_SIZE new time-boxed
 *     contracts to the harbor board (seeded, deterministic via `rng.fork("harbor")`).
 *  2. Each tick, check all open committed contracts: if the deadline has
 *     passed → fire CONTRACT_MISSED (penalty) or CONTRACT_EXPIRED (for
 *     uncommitted open ones). Also check if a farmer can deliver (has the
 *     goods at the harbor) → fire CONTRACT_DELIVERED (payout + rep).
 *  3. Broadcast CONTRACT_POSTED, CONTRACT_DELIVERED, CONTRACT_MISSED so
 *     EventFeedSystem can narrate them.
 *
 * Placement (sim-bootstrap): runs in the same snoop band as FestivalSystem,
 * BEFORE EventFeedSystem (so RESULT/DELIVERED broadcasts are snooped by
 * the feed this tick) and BEFORE PerceiveSystem (so beliefs are fresh).
 *
 * Determinism: contract generation is a pure function of day + forked rng.
 * NEVER Math.random / Date.now. Contract ids use day + slot index, so they
 * are stable across replays.
 */

import type { SimContext, System, World, MessageBus, Rng } from "@engine/core";
import type { GameEntity } from "../components";
import { ONT_SIMULATION, PERFORMATIVE } from "../protocols";
import {
  ONT_HARBOR,
  type HarborContract,
  type ContractPostedBody,
  type ContractDeliveredBody,
  type ContractMissedBody,
  type ContractExpiredBody,
} from "../protocols/harbor";
import {
  HARBOR_POST_CADENCE,
  HARBOR_BATCH_SIZE,
  CONTRACT_REWARD_MULT,
  CONTRACT_REP_REWARD,
  CONTRACT_DEADLINE_DAYS,
  HARBOR_REP_MISS_PENALTY,
  HARBOR_REP_THRESHOLD,
} from "../economy";
import { CROP_SELL_PRICE, deductCrops } from "../economy";
import type { CropKind, CropQuality } from "../components";

// ── Eligible crops for contracts: the main 8 crops ───────────────────────────
// Sorted by sell price so higher-value crops appear more often in gold contracts.
const CONTRACT_CROPS: readonly CropKind[] = [
  "radish", "wheat", "carrot", "tomato", "corn",
  "pumpkin", "grape", "winter-squash",
];

const CONTRACT_CROPS_HIGH: readonly CropKind[] = [
  "tomato", "corn", "pumpkin", "grape", "winter-squash",
];

// ── Quality distribution by tier ─────────────────────────────────────────────
const TIER_MIN_QUALITY: Record<"normal" | "silver" | "gold", CropQuality> = {
  normal: "normal",
  silver: "normal",  // silver contracts: any quality acceptable
  gold:   "silver",  // gold contracts: need at least silver
};

// ── Quantity ranges by tier ──────────────────────────────────────────────────
const TIER_QTY: Record<"normal" | "silver" | "gold", [number, number]> = {
  normal: [4,  8],
  silver: [6,  12],
  gold:   [8,  16],
};

/**
 * Pure, deterministic contract generation. Given a day and a forked Rng,
 * produce `count` contracts for a batch posted on `day`. Exported for unit
 * testing.
 */
export function generateContracts(
  day: number,
  count: number,
  rng: Rng,
  farmerReputations: number[],
): HarborContract[] {
  const contracts: HarborContract[] = [];
  // Determine which tiers are achievable by at least some farmer.
  const maxRep = farmerReputations.length > 0
    ? Math.max(...farmerReputations)
    : 0;

  const availableTiers: Array<"normal" | "silver" | "gold"> = ["normal"];
  if (maxRep >= HARBOR_REP_THRESHOLD.silver) availableTiers.push("silver");
  if (maxRep >= HARBOR_REP_THRESHOLD.gold)   availableTiers.push("gold");

  for (let slot = 0; slot < count; slot++) {
    const tier = rng.pick(availableTiers);
    const crops = tier === "gold" ? CONTRACT_CROPS_HIGH : CONTRACT_CROPS;
    const crop = rng.pick(crops);
    const [minQty, maxQty] = TIER_QTY[tier];
    const quantity = rng.int(minQty, maxQty + 1);
    const baseSell = CROP_SELL_PRICE[crop];
    const reward = Math.round(baseSell * CONTRACT_REWARD_MULT[tier] * quantity);
    const reputationReward = CONTRACT_REP_REWARD[tier];
    const deadlineDay = day + CONTRACT_DEADLINE_DAYS[tier];
    const minReputation = HARBOR_REP_THRESHOLD[tier];
    const minQuality = TIER_MIN_QUALITY[tier];

    contracts.push({
      id: `contract-${day}-${slot}`,
      goods: { crop, minQuality, quantity },
      reward,
      reputationReward,
      postedDay: day,
      deadlineDay,
      minReputation,
      tier,
    });
  }
  return contracts;
}

/**
 * Pure, deterministic contract resolution rank. Checks if a farmer has the
 * goods to fulfill a contract. Returns true if the farmer's inventory has
 * enough of the required crop at or above the required quality.
 */
export function canFulfillContract(
  inv: GameEntity["inventory"],
  contract: HarborContract,
): boolean {
  if (!inv) return false;
  const { crop, minQuality, quantity } = contract.goods;
  const total = inv.crops[crop] ?? 0;
  if (total < quantity) return false;

  // Quality check: count units at or above the minimum quality tier.
  const quality = inv.cropQuality?.[crop];
  if (!quality) {
    // No quality breakdown → all Normal. If minQuality is normal, OK.
    return minQuality === "normal";
  }
  // Count units that meet the quality floor.
  let qualifying = 0;
  if (minQuality === "normal") qualifying = quality.normal + quality.silver + quality.gold;
  else if (minQuality === "silver") qualifying = quality.silver + quality.gold;
  else qualifying = quality.gold;  // minQuality === "gold"
  return qualifying >= quantity;
}

export class HarborSystem implements System {
  readonly name = "HarborSystem";

  private lastDayProcessed = -1;
  private readonly harborRng: Rng;

  constructor(
    private readonly world: World<GameEntity>,
    private readonly bus: MessageBus,
    rng: Rng,
  ) {
    this.harborRng = rng.fork("harbor");
  }

  run(ctx: SimContext): void {
    const board = this.findBoard();
    if (!board || !board.inbox || !board.harborBoard) return;

    // ── Detect DAY_START ──────────────────────────────────────────────────────
    let newDay: number | null = null;
    for (const msg of board.inbox.messages) {
      if (msg.ontology === ONT_SIMULATION.DAY_START) {
        const day = (msg.body as { day: number }).day;
        if (newDay === null || day > newDay) newDay = day;
      }
    }

    if (newDay !== null && newDay !== this.lastDayProcessed) {
      this.lastDayProcessed = newDay;

      // 1. Check committed contracts whose deadline passed (yesterday).
      this.resolveExpiredContracts(newDay, ctx.tick, board);

      // 2. Post new contracts on cadence days.
      if (newDay > 0 && newDay % HARBOR_POST_CADENCE === 0) {
        this.postContracts(newDay, ctx.tick, board);
      }
    }

    // ── Every tick: attempt delivery for committed farmers at the harbor ──────
    this.attemptDeliveries(ctx.tick, board);
  }

  // ── Contract posting ─────────────────────────────────────────────────────────

  private postContracts(day: number, tick: number, board: GameEntity): void {
    if (!board.harborBoard) return;

    // Collect farmer reputations to gate tier availability.
    const reps: number[] = [];
    for (const f of this.world.query("farmer")) {
      reps.push(f.farmer.harborReputation ?? 0);
    }

    const contracts = generateContracts(day, HARBOR_BATCH_SIZE, this.harborRng, reps);
    for (const contract of contracts) {
      board.harborBoard.openContracts.push(contract);
      const body: ContractPostedBody = { contract };
      this.bus.send(
        {
          performative: PERFORMATIVE.INFORM,
          ontology: ONT_HARBOR.CONTRACT_POSTED,
          sender: "world",
          recipient: "broadcast",
          body: body as unknown as Record<string, unknown>,
        },
        tick,
      );
    }
  }

  // ── Deadline resolution ──────────────────────────────────────────────────────

  private resolveExpiredContracts(today: number, tick: number, board: GameEntity): void {
    if (!board.harborBoard) return;
    const hb = board.harborBoard;

    const stillOpen: HarborContract[] = [];
    for (const contract of hb.openContracts) {
      if (contract.deadlineDay >= today) {
        stillOpen.push(contract);
        continue;
      }
      // Deadline has passed.
      const committedFarmerId = hb.committed.get(contract.id);
      if (committedFarmerId !== undefined) {
        // Committed but not delivered → MISS.
        hb.committed.delete(contract.id);
        this.applyMissPenalty(committedFarmerId, contract, tick);
      } else {
        // Open but never taken → EXPIRE (no penalty, just remove).
        const expBody: ContractExpiredBody = { contractId: contract.id, day: today };
        this.bus.send(
          {
            performative: PERFORMATIVE.INFORM,
            ontology: ONT_HARBOR.CONTRACT_EXPIRED,
            sender: "world",
            recipient: "broadcast",
            body: expBody as unknown as Record<string, unknown>,
          },
          tick,
        );
      }
    }
    hb.openContracts = stillOpen;
  }

  private applyMissPenalty(
    farmerId: number,
    contract: HarborContract,
    tick: number,
  ): void {
    for (const f of this.world.query("farmer")) {
      if (f.id !== farmerId) continue;
      f.farmer.harborReputation = Math.max(
        0,
        (f.farmer.harborReputation ?? 0) - HARBOR_REP_MISS_PENALTY,
      );
      if (f.farmer.committedContract?.id === contract.id) {
        f.farmer.committedContract = undefined;
      }
      const body: ContractMissedBody = {
        contractId: contract.id,
        farmerId,
        farmerName: f.farmer.name,
        penaltyReputation: HARBOR_REP_MISS_PENALTY,
      };
      this.bus.send(
        {
          performative: PERFORMATIVE.INFORM,
          ontology: ONT_HARBOR.CONTRACT_MISSED,
          sender: "world",
          recipient: "broadcast",
          body: body as unknown as Record<string, unknown>,
        },
        tick,
      );
      break;
    }
  }

  // ── Delivery check ───────────────────────────────────────────────────────────

  /**
   * Each tick: if a farmer is at the harbor AND has a committed contract AND
   * has the goods in inventory → resolve the delivery immediately.
   */
  private attemptDeliveries(tick: number, board: GameEntity): void {
    if (!board.harborBoard) return;
    const hb = board.harborBoard;

    for (const f of this.world.query("farmer", "inventory")) {
      if (f.id === undefined) continue;
      const contract = f.farmer?.committedContract;
      if (!contract) continue;
      if (f.farmer?.currentRegion !== "harbor") continue;
      if (!canFulfillContract(f.inventory, contract)) continue;

      // Deduct goods from inventory.
      const { crop, quantity, minQuality } = contract.goods;
      deductCrops(f.inventory, crop, quantity, minQuality);

      // Pay out.
      f.inventory.gold += contract.reward;
      f.farmer.harborReputation = (f.farmer.harborReputation ?? 0) + contract.reputationReward;
      f.farmer.committedContract = undefined;

      // Remove from board.
      hb.openContracts = hb.openContracts.filter((c) => c.id !== contract.id);
      hb.committed.delete(contract.id);

      const day = Math.floor(tick / 20); // approximate; real day from beliefs not needed here
      const body: ContractDeliveredBody = {
        contractId: contract.id,
        farmerId: f.id,
        farmerName: f.farmer.name,
        reward: contract.reward,
        reputationReward: contract.reputationReward,
        deliveryDay: day,
      };
      this.bus.send(
        {
          performative: PERFORMATIVE.INFORM,
          ontology: ONT_HARBOR.CONTRACT_DELIVERED,
          sender: "world",
          recipient: "broadcast",
          body: body as unknown as Record<string, unknown>,
        },
        tick,
      );
    }
  }

  // ── Board lookup ─────────────────────────────────────────────────────────────

  private findBoard(): GameEntity | undefined {
    for (const e of this.world.query("harborBoard", "inbox")) return e;
    return undefined;
  }
}
