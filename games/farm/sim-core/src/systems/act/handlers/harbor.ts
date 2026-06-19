import type { Intention, MessageBus, World } from "@engine/core";
import type { GameEntity } from "../../../components";
import { ONT_HARBOR } from "../../../protocols/harbor";
import type { ActingFarmer } from "../types";

export function handleCommitContract(
  farmer: ActingFarmer,
  intent: Intention,
  bus: MessageBus | undefined,
  world: World<GameEntity>,
  tick: number,
): void {
  if (!bus || farmer.id === undefined) return;
  if (farmer.farmer?.currentRegion !== "harbor") return;
  if (farmer.farmer.committedContract !== undefined) return;

  const contractId = intent.data.contractId as string;
  const board = findHarborBoard(world);
  if (!board?.harborBoard) return;

  const contract = board.harborBoard.openContracts.find((c) => c.id === contractId);
  if (!contract) return;
  if (board.harborBoard.committed.has(contractId)) return;
  const rep = farmer.farmer.harborReputation ?? 0;
  if (rep < contract.minReputation) return;

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

export function handleDeliverContract(_farmer: ActingFarmer, _intent: Intention): void {
}

export function findHarborBoard(world: World<GameEntity>): GameEntity | undefined {
  for (const e of world.query("harborBoard")) return e;
  return undefined;
}
