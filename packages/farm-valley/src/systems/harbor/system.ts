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
import type { GameEntity } from "../../components";
import { ONT_SIMULATION, PERFORMATIVE } from "../../protocols";
import {
  ONT_HARBOR,
  type HarborContract,
  type ContractPostedBody,
  type ContractDeliveredBody,
  type ContractMissedBody,
  type ContractExpiredBody,
} from "../../protocols/harbor";
import {
  HARBOR_POST_CADENCE,
  HARBOR_BATCH_SIZE,
  HARBOR_REP_MISS_PENALTY,
} from "../../economy";
import { deductCrops } from "../../economy";
import { generateContracts, canFulfillContract } from "./contracts";

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
