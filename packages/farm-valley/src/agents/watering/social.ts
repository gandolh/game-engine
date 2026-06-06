import type { GameEntity } from "../../components";
import { recordReason, DECORATION_RECIPE, MAX_DECORATION_BOOST } from "../../components";
import type { DecorationKind, FarmDecoration } from "../../components";
import { isWithinReach } from "../../systems/proximity";
import { TAVERN_GATHER_TILE, TAVERN_VISIT_PERIOD, FESTIVAL_PODIUM_TILE } from "./shared";

/**
 * Queue a craft-decoration intent if the farmer has enough wood and hasn't
 * capped their farm's decoration boost yet. Picks the best decoration the
 * farmer can currently afford in wood.
 */
export function deliberateDecoration(
  farmer: GameEntity,
  existingDecorations: FarmDecoration[],
  priority: number,
): void {
  if (!farmer.intentions || !farmer.resources || !farmer.farmer?.homeRegion) return;

  // Check current total boost for this farmer.
  let totalBoost = 0;
  for (const d of existingDecorations) {
    if (d.ownerId === farmer.id) totalBoost += DECORATION_RECIPE[d.kind]?.yieldBoost ?? 0;
  }
  if (totalBoost >= MAX_DECORATION_BOOST) return;

  const wood = farmer.resources.wood;
  if (wood <= 0) return;

  // Pick the best affordable decoration (highest yieldBoost per wood).
  const affordable = (Object.entries(DECORATION_RECIPE) as [DecorationKind, { woodCost: number; yieldBoost: number }][])
    .filter(([, r]) => wood >= r.woodCost)
    .sort((a, b) => b[1].yieldBoost / b[1].woodCost - a[1].yieldBoost / a[1].woodCost);

  if (affordable.length === 0) return;
  const best = affordable[0];
  if (!best) return;
  const [kind] = best;

  // Must be at carpentry to craft. If not there, travel first.
  const inCarpentry = farmer.farmer.currentRegion === "carpentry";
  if (!inCarpentry) {
    farmer.intentions.queue.push({
      kind: "travel",
      data: { targetRegionId: "carpentry" },
      priority: priority + 1,
    });
  }
  farmer.intentions.queue.push({
    kind: "craft-decoration",
    data: { kind },
    priority,
  });
  recordReason(farmer, `craft ${kind} decoration (wood: ${wood})`);
}

/**
 * Queue a visit to the village on the very first day if the farmer hasn't been
 * yet. This gets everyone walking on day 1 — they'll read market offers and
 * be in position to sell anything that matures on day 2.
 */
export function deliberateEarlyVillageVisit(farmer: GameEntity, priority: number): void {
  if (!farmer.intentions || !farmer.farmer) return;
  const day = (farmer.beliefs?.data.currentDay as number | undefined) ?? 0;
  // Only on day 0-1 and only when not already in/heading to village.
  if (day > 1) return;
  if (farmer.farmer.currentRegion === "village") return;
  // Don't add if travel to village already queued.
  if (farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetRegionId === "village")) return;

  farmer.intentions.queue.push({
    kind: "travel",
    data: { targetRegionId: "village" },
    priority,
  });
  farmer.intentions.queue.push({
    kind: "read-offers",
    data: {},
    priority: priority + 1,
  });
  recordReason(farmer, "early village visit: scout market");
}

/**
 * brief 44 — hire a day-helper at the tavern (in the village). A gold sink +
 * catch-up mechanic: when the farmer is AP-starved (ran low today) AND gold-rich
 * (comfortable surplus over reserve + the hire cost), it pays for an AP boost
 * tomorrow. Uses the excursion pattern: commit a WINNING village-travel leg so
 * the trip actually lands. Gated so it stays a "spare gold/AP" sink, never a
 * survival need.
 *
 * `travelPriority` — winning village-travel priority on the commit day.
 */
export function deliberateHireHelp(
  farmer: GameEntity,
  reserve: number,
  priority: number,
  travelPriority?: number,
): void {
  if (!farmer.intentions || !farmer.inventory || !farmer.farmer || !farmer.ap) return;
  const day = (farmer.beliefs?.data.currentDay as number | undefined) ?? 0;
  if (day === 0) return; // settle in first

  // Already hired today? (the act gates this too, but skip the trip.)
  if (farmer.farmer.helperHiredDay === day) return;

  // AP-starved: today's AP ceiling is mostly spent (ran the budget low). This is
  // a pure read of the current AP fraction — deterministic.
  const apFraction = farmer.ap.max > 0 ? farmer.ap.current / farmer.ap.max : 1;
  if (apFraction > 0.4) return; // still has plenty of AP — no need to hire

  // Gold-rich: comfortable surplus over the reserve AND the hire cost (so it's a
  // spare-gold sink, never a survival drain).
  const HIRE_COST = 25; // mirror HIRE_HELP_GOLD_COST in act.ts
  if (farmer.inventory.gold - HIRE_COST < reserve) return;

  if (farmer.intentions.queue.some(i => i.kind === "hire-help")) return;

  // OPPORTUNISTIC: only hire when the farmer is ALREADY in the village (it came
  // to sell / buy). We deliberately do NOT make a special cross-map trip just to
  // hire — that would derail the farm loop and turn a luxury sink into a net
  // productivity LOSS (an early build hijacked a leader's whole run). "While I'm
  // here, grab a hand for tomorrow" is the intended, non-disruptive shape.
  if (farmer.farmer.currentRegion !== "village") return;
  // travelPriority is intentionally unused now (kept for call-site symmetry).
  void travelPriority;

  farmer.intentions.queue.push({
    kind: "hire-help",
    data: {},
    priority,
  });
  recordReason(farmer, `hire day-helper at tavern (AP ${farmer.ap.current}/${farmer.ap.max}, gold ${farmer.inventory.gold})`);
}

/**
 * brief 44 — evening gathering beat (pure flavor; makes the hub look populated).
 *
 * Fires in the EVENING phase for a farmer who is ALREADY in the village (e.g. it
 * came in to sell / read the market) and has no pressing chores queued: it adds
 * a cheap in-village hop to the tavern tile before the night. Because the farmer
 * is already on the village island, the hop is short and lands within the
 * evening window — so the tavern genuinely fills up, rather than a farmer trying
 * (and failing) to walk a whole cross-map trip from its farm at dusk.
 *
 * Gated to the village so it never drags a farmer away from its farm at night
 * (which would cost the unrested AP penalty). Low priority + AP-free travel, so
 * it never competes with real work; deterministic (phase + region + position).
 */
export function deliberateTavernGather(farmer: GameEntity, priority: number): void {
  if (!farmer.intentions || !farmer.farmer || !farmer.beliefs || !farmer.inventory) return;
  const phase = farmer.beliefs.data.phase as string | undefined;
  // Gather during the MORNING or WORK window (plenty of day left to socialise
  // then get home before night — never the evening, which would risk stranding
  // the farmer away at nightfall for the unrested penalty).
  if (phase !== "morning" && phase !== "work") return;
  const day = (farmer.beliefs.data.currentDay as number | undefined) ?? 0;
  if (day === 0) return; // settle in first

  // Periodic gathering beat: every TAVERN_VISIT_PERIOD days a farmer makes a trip
  // to the tavern so the hub reads as populated. "Pure flavor" — AP-free travel.
  // Modelled on the periodic-market-visit excursion (a deterministic, day-gated
  // trip) rather than an idle-only hook, because the agent loop almost never
  // leaves a farmer idle in the village (it's always already en route somewhere),
  // so an idle hook would never fire. Staggered across farmers (by entity id) so
  // they arrive on different days and the tavern fills gradually over the week.
  const offset = ((farmer.id ?? 0) % TAVERN_VISIT_PERIOD);
  if (day % TAVERN_VISIT_PERIOD !== offset) return;

  // Keep it a LUXURY that never competes with real work: only when the farmer has
  // a comfortable AP cushion (won't starve farm work) and no plot is wilting.
  if ((farmer.ap?.current ?? 0) < 40) return;
  const sense = farmer.beliefs.data.plotWater as import("../../systems/plot-sense").PlotWaterSense | undefined;
  if (sense && sense.maxDrySoFar >= 2) return;

  // Already at the tavern tile, or a gathering hop already queued? Don't re-queue.
  if (isWithinReach(farmer.transform, TAVERN_GATHER_TILE.x, TAVERN_GATHER_TILE.y)) return;
  if (farmer.intentions.queue.some((i) => i.kind === "travel" && i.data.targetTile && i.data.tavernGather)) return;

  // Winning priority so the short in-village hop actually executes (travel is
  // AP-free; the next arrival re-deliberation routes the farmer onward / home).
  farmer.intentions.queue.push({
    kind: "travel",
    data: { targetTile: { x: TAVERN_GATHER_TILE.x, y: TAVERN_GATHER_TILE.y }, tavernGather: true },
    priority,
  });
  recordReason(farmer, "visit the tavern (gathering beat)");
}

/**
 * brief 45 — festival-day gathering beat. On a festival day a farmer with a
 * comfortable AP cushion (and no plot wilting) makes the excursion to the village
 * podium (the festival stage) — the spectator sees the farmers convene for the
 * harvest contest, exactly like the brief-44 tavern gather but anchored to the
 * calendar landmark instead of a periodic timer.
 *
 * The contest itself is resolved by FestivalSystem from inventory (every farmer
 * holding the contest crop is judged) — so this helper is the visible "they all
 * showed up" beat, plus a `decisionTrace` reason that surfaces festival planning.
 * Travel is AP-free; low priority so it never competes with real farm work.
 * Deterministic: gated purely on the festival-today belief + phase + AP + position.
 */
export function deliberateFestivalGather(farmer: GameEntity, priority: number): void {
  if (!farmer.intentions || !farmer.farmer || !farmer.beliefs) return;
  const festival = farmer.beliefs.data.festivalToday as
    | { name: string; contestCrop: string } | null | undefined;
  if (!festival) return; // not a festival day

  const phase = farmer.beliefs.data.phase as string | undefined;
  // Gather in the MORNING / WORK window (plenty of day to get home before night).
  if (phase !== "morning" && phase !== "work") return;

  // Keep it a LUXURY that never starves farm work (mirror the tavern gather gate).
  if ((farmer.ap?.current ?? 0) < 40) return;
  const sense = farmer.beliefs.data.plotWater as import("../../systems/plot-sense").PlotWaterSense | undefined;
  if (sense && sense.maxDrySoFar >= 2) return;

  // Already at the podium, or a festival hop already queued? Don't re-queue.
  if (isWithinReach(farmer.transform, FESTIVAL_PODIUM_TILE.x, FESTIVAL_PODIUM_TILE.y)) return;
  if (farmer.intentions.queue.some((i) => i.kind === "travel" && i.data.festivalGather)) return;

  // Hold the contest crop: if the farmer would otherwise sell it today, surface
  // the intent to keep it for judging (the contest reads end-of-day inventory).
  const held = farmer.inventory?.crops[festival.contestCrop as import("../../components").CropKind] ?? 0;

  farmer.intentions.queue.push({
    kind: "travel",
    data: { targetTile: { x: FESTIVAL_PODIUM_TILE.x, y: FESTIVAL_PODIUM_TILE.y }, festivalGather: true },
    priority,
  });
  recordReason(
    farmer,
    held > 0
      ? `${festival.name}: enter ${festival.contestCrop} (holding ${held})`
      : `${festival.name}: gather at the podium`,
  );
}

/**
 * brief 44 — commission a decoration build at the CARPENTER (a real order the
 * CarpenterSystem validates + delivers over a build-time), using brief 42's
 * working excursion pattern. Fires on a quiet invest day when the farmer holds
 * enough WOOD for a decoration it can still benefit from (boost not maxed), and
 * commits a WINNING carpentry-travel leg so the trip actually wins queue[0] —
 * otherwise the order is queued but the farmer never reaches the carpenter and
 * the feature reads as dormant (the brief-42 lesson).
 *
 * `travelPriority` — winning carpentry-travel priority on the commit day
 * (undefined falls back to the non-committal `priority + 1`).
 */
export function deliberateCommissionBuild(
  farmer: GameEntity,
  existingDecorations: FarmDecoration[],
  priority: number,
  travelPriority?: number,
): void {
  if (!farmer.intentions || !farmer.resources || !farmer.farmer?.homeRegion) return;

  // Boost already maxed? Nothing worth commissioning.
  let totalBoost = 0;
  for (const d of existingDecorations) {
    if (d.ownerId === farmer.id) totalBoost += DECORATION_RECIPE[d.kind]?.yieldBoost ?? 0;
  }
  if (totalBoost >= MAX_DECORATION_BOOST) return;

  const wood = farmer.resources.wood;
  if (wood <= 0) return;

  // Pick the best decoration affordable in wood (highest yieldBoost per wood).
  const affordable = (Object.entries(DECORATION_RECIPE) as [DecorationKind, { woodCost: number; yieldBoost: number }][])
    .filter(([, r]) => wood >= r.woodCost)
    .sort((a, b) => b[1].yieldBoost / b[1].woodCost - a[1].yieldBoost / a[1].woodCost);
  if (affordable.length === 0) return;
  const best = affordable[0];
  if (!best) return;
  const [kind] = best;

  // Don't double-queue a commission.
  if (farmer.intentions.queue.some(i => i.kind === "commission-build")) return;

  const inCarpentry = farmer.farmer.currentRegion === "carpentry";
  if (!inCarpentry) {
    const wanted = travelPriority ?? priority + 1;
    const existing = farmer.intentions.queue.find(i => i.kind === "travel" && i.data.targetRegionId === "carpentry");
    if (existing) {
      // Upgrade a shadowing carpentry trip so the commission trip wins queue[0]
      // (same fix as the pen/greenhouse builds).
      if (wanted < existing.priority) existing.priority = wanted;
    } else {
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetRegionId: "carpentry" },
        priority: wanted,
      });
    }
  }
  farmer.intentions.queue.push({
    kind: "commission-build",
    data: { kind },
    priority,
  });
  recordReason(farmer, `commission ${kind} at carpenter (wood: ${wood})`);
}
