// AggressionSystem — the AI initiation side of street fights. Each tick it looks for
// a co-located rival (same region, my directional trust toward them < RIVAL_CUTOFF)
// and, governors permitting, begins a CHASE (sets farmer.chaseTarget). ChaseSystem
// then pursues + issues the CHALLENGE on contact. This is RIVALRY-DRIVEN ONLY: an AI
// never mugs strangers or friends (the spoils-of-a-grudge rule). Pip is excluded
// (player-driven). Retaliation is automatic: a witness whose trust dropped below the
// cutoff (via CombatSystem.applyWitnessPenalties) becomes a rival here next tick.
//
// Runs in the DELIBERATE band, before ChaseSystem (MOVE). Determinism: farmers scanned
// in stable world order; a farmer targets the lowest-id eligible rival.

import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../../components";
import { RIVAL_CUTOFF } from "../rivalry";
import { deliberateRivalChallenge } from "../../agents/watering/social";
import type { CombatSystem } from "./system";

export class AggressionSystem implements System {
  readonly name = "AggressionSystem";

  constructor(
    private readonly world: World<GameEntity>,
    private readonly combat: CombatSystem,
  ) {}

  run(ctx: SimContext): void {
    // Group farmers by region (stable order) for co-location.
    const byRegion = new Map<string, GameEntity[]>();
    for (const f of this.world.query("farmer", "trust")) {
      if (f.id === undefined || f.player) continue; // AI only; Pip attacks by input
      if (f.farmer?.chaseTarget) continue;           // already pursuing
      const region = f.farmer?.currentRegion;
      if (!region) continue;
      let list = byRegion.get(region);
      if (!list) { list = []; byRegion.set(region, list); }
      list.push(f);
    }

    for (const f of this.world.query("farmer", "trust")) {
      if (f.id === undefined || f.player || f.farmer?.chaseTarget) continue;
      const region = f.farmer?.currentRegion;
      if (!region) continue;
      const peers = byRegion.get(region);
      if (!peers) continue;

      // Lowest-id co-located rival I distrust below the cutoff.
      let targetId: number | undefined;
      for (const p of peers) {
        if (p.id === undefined || p.id === f.id) continue;
        const trust = f.trust?.byId.get(p.id) ?? 0.5;
        if (trust < RIVAL_CUTOFF && (targetId === undefined || p.id < targetId)) {
          targetId = p.id;
        }
      }
      if (targetId === undefined) continue;
      // Governor: respect per-pair cooldown + daily cap before committing.
      if (!this.combat.canFight(f.id, targetId)) continue;
      deliberateRivalChallenge(f, targetId, ctx.tick);
    }
  }
}
