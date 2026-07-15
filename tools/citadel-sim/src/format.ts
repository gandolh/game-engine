/**
 * Console output formatting for the Citadel headless runner — mirrors
 * tools/run-sim/src/format.ts's role (pure/side-effecting print helpers
 * consumed by the tick loop), scoped to what this tool actually prints.
 */
import type { RenderSnapshot } from "@citadel/sim-core";

/** Regex of event substrings worth echoing during the main scenario loop (grow/starve/siege/sack). */
export const MAIN_NOTABLE_EVENT_PATTERN =
  /Raid|REPELLED|SACKED|DAMAGE|sacked outer|spotted|fire|burned|disease|outbreak|villager.*died|risen from|Hamlet|Village|Town|Citadel|Fortress/i;

/** Print the per-day economy/siege/hazard summary line used by the main scenario loop. */
export function printMainDayLine(
  snap: RenderSnapshot,
  maxDays: number,
  scenario: string,
  isSiege: boolean,
): void {
  const connected = snap.buildings.filter((b) => b.connected).length;
  const workers = snap.villagers.length;
  const decreesStr = snap.activeDecrees.length > 0 ? ` [${snap.activeDecrees.join(",")}]` : "";
  const traderStr = snap.traderPresent ? " [TRADER]" : "";
  const siegeStr = isSiege
    ? ` | threat=${snap.threatLevel} defense=${snap.defensiveStrength} raiders=${snap.raiders.length} keepSacked=${snap.keepSacked}`
    : "";
  const refinStr = scenario === "siege"
    ? ` stone=${snap.stockpiles.stone ?? 0} planks=${snap.stockpiles.planks ?? 0} tools=${snap.stockpiles.tools ?? 0}`
    : "";
  const hazardStr = (snap.activeFires > 0 || snap.outbreakActive)
    ? ` | fires=${snap.activeFires} sick=${snap.sickVillagers}${snap.outbreakActive ? " [OUTBREAK]" : ""}`
    : "";
  console.log(
    `  Day ${String(snap.day + 1).padStart(2)}/${maxDays} [${snap.season.padEnd(6)}] ` +
      `[${snap.tier}] ` +
      `pop ${snap.population}/${snap.popCap}  ` +
      `grain=${String(snap.stockpiles.grain ?? 0).padStart(3)} ` +
      `flour=${String(snap.stockpiles.flour ?? 0).padStart(3)} ` +
      `bread=${String(snap.stockpiles.bread ?? 0).padStart(3)}  ` +
      `workers=${workers} ` +
      `(connected ${connected}/${snap.buildings.length}, surplus ${snap.foodSurplus}) ` +
      `happy=${snap.happiness} faith=${(snap.faithCoverage * 100).toFixed(0)}% ` +
      `safe=${(snap.safetyCoverage * 100).toFixed(0)}% goods=${(snap.goodsCoverage * 100).toFixed(0)}%` +
      decreesStr + traderStr + siegeStr + refinStr + hazardStr +
      (snap.gameOver ? " *** GAME OVER ***" : ""),
  );
}

/** Print the subset of `events` matching `pattern`, prefixed like the sim's other event echoes. */
export function printNotableEvents(events: readonly string[], pattern: RegExp): void {
  for (const ev of events) {
    if (pattern.test(ev)) {
      console.log(`    >> ${ev}`);
    }
  }
}

/** Print the end-of-run summary block (done/final/siege/refining/recent-events). */
export function printFinalSummary(
  final: RenderSnapshot,
  maxDays: number,
  scenario: string,
  isSiege: boolean,
): void {
  console.log(`\nDone. Simulated up to ${maxDays} days.`);
  console.log(
    `Final: pop ${final.population}/${final.popCap}, bread ${final.stockpiles.bread ?? 0}, ` +
      `gameOver=${final.gameOver}, keepSacked=${final.keepSacked}`,
  );
  if (isSiege) {
    console.log(
      `Siege: ${final.keepPresent ? "keep present" : "no keep"}, ` +
        `threat=${final.threatLevel}, defense=${final.defensiveStrength}, ` +
        `keepSacked=${final.keepSacked}`,
    );
    if (scenario === "siege") {
      console.log(
        `Refining: stone=${final.stockpiles.stone ?? 0} planks=${final.stockpiles.planks ?? 0} tools=${final.stockpiles.tools ?? 0}`,
      );
    }
  }
  if (final.recentEvents.length > 0) {
    console.log("Recent events:");
    for (const e of final.recentEvents.slice(-10)) console.log(`  - ${e}`);
  }
}

/**
 * `sack` is the only fixture that drives the SHARP raid resolution end to end, and it
 * rotted for ten days precisely because nothing ever said so out loud: it kept printing
 * a cheerful economy summary while asserting nothing. Give it a verdict and a non-zero
 * exit, so a future regression is a FAILURE and not a paragraph nobody reads.
 */
export const SACK_VERDICT_PASS =
  "SACK: PASS — the sharp raid path reached the `sacked` band: keep sacked, game over.";

export function formatSackFailure(final: RenderSnapshot): string {
  return (
    "SACK: FAIL — the keep was NOT sacked.\n" +
      `  keepPresent=${final.keepPresent} keepSacked=${final.keepSacked} gameOver=${final.gameOver} ` +
      `threat=${final.threatLevel} defense=${final.defensiveStrength} tier=${final.tier}\n` +
      "  This fixture is the ONLY end-to-end check of the sharp (cozyThreats:false) raid\n" +
      "  resolution. If it is not sacking, the sharp path is unproven — do not sign off\n" +
      "  Challenge mode or any raid work on top of it. Check, in order: (1) is\n" +
      "  cozyThreats:false actually reaching bootstrapSim? (2) did the settlement reach\n" +
      "  Town so the TIER_LOCKed keep could be placed? (3) did a raider ever arrive?"
  );
}
