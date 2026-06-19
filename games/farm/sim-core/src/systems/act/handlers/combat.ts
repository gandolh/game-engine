import type { MessageBus } from "@engine/core";
import type { Intention } from "@engine/core";
import type { ActingFarmer } from "../types";
import { ONT_COMBAT, type CombatContext, type ChallengeBody } from "../../../protocols/combat";

export function handleChallenge(
  farmer: ActingFarmer,
  intent: Intention,
  bus: MessageBus | undefined,
  tick: number,
): void {
  if (!bus) return;
  const peerId = intent.data.peerId;
  if (typeof peerId !== "number" || farmer.id === undefined) return;
  const context: CombatContext = intent.data.context === "ring" ? "ring" : "street";
  const body: ChallengeBody = { challengerId: farmer.id, context };
  bus.send(
    {
      performative: "request",
      ontology: ONT_COMBAT.CHALLENGE,
      sender: farmer.id,
      recipient: peerId,
      body: body as unknown as Record<string, unknown>,
    },
    tick,
  );
}
