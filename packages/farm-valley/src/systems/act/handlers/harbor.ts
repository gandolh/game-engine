/**
 * Harbor action handlers: commit-contract, deliver-contract.
 * brief 46 — harbor shipping & contracts.
 */
import type { Intention, MessageBus, World } from "@engine/core";
import type { GameEntity } from "../../../components";
import { ONT_HARBOR } from "../../../protocols/harbor";
import type { ActingFarmer } from "../types";

/**
 * brief 46 — commit to an open harbor contract. The farmer must be at the
 * harbor AND the contract must be open AND not already committed by someone
 * else AND the farmer's reputation must meet the minimum. Marks the contract
 * as committed on the board and sets the farmer's committedContract field.
 */
export function handleCommitContract(
  farmer: ActingFarmer,
  intent: Intention,
  bus: MessageBus | undefined,
  world: World<GameEntity>,
  tick: number,
): void {
  if (!bus || farmer.id === undefined) return;
  if (farmer.farmer?.currentRegion !== "harbor") return;
  // Already have a committed contract.
  if (farmer.farmer.committedContract !== undefined) return;

  const contractId = intent.data.contractId as string;
  const board = findHarborBoard(world);
  if (!board?.harborBoard) return;

  const contract = board.harborBoard.openContracts.find((c) => c.id === contractId);
  if (!contract) return;
  if (board.harborBoard.committed.has(contractId)) return; // already taken
  // Reputation gate.
  const rep = farmer.farmer.harborReputation ?? 0;
  if (rep < contract.minReputation) return;

  // Commit.
  board.harborBoard.committed.set(contractId, farmer.id);
  farmer.farmer.committedContract = contract;

  bus.send(
    {
      performative: "inform",
      ontology: ONT_HARBOR.CONTRACT_COMMITTED,
      sender: farmer.id,
      recipient: "broadcast",
      body: {
        contractId,
        farmerId: farmer.id,
        farmerName: farmer.farmer.name,
      } as Record<string, unknown>,
    },
    tick,
  );
}

/**
 * brief 46 — deliver a committed contract. The farmer must be at the harbor,
 * have a committed contract, and have the goods. HarborSystem resolves the
 * payout on the same tick (it runs after ActSystem reads deliveries). Here
 * we just queue the intent; the actual resolution is in HarborSystem which
 * fires each tick. Nothing is done in act.ts except consuming the AP.
 * (The real delivery logic is in HarborSystem.attemptDeliveries which fires
 * every tick when the farmer is at the harbor with sufficient goods.)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function handleDeliverContract(_farmer: ActingFarmer, _intent: Intention): void {
  // Delivery is handled automatically by HarborSystem every tick when the
  // farmer is at the harbor with sufficient goods. This intent just pays AP
  // and signals the farmer is consciously heading to deliver.
}

export function findHarborBoard(world: World<GameEntity>): GameEntity | undefined {
  for (const e of world.query("harborBoard")) return e;
  return undefined;
}
