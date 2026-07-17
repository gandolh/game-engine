import type { GameEntity, CropKind } from "../components";
import { CORAL_WEIGHTS, FISH_VALUE, FISH_KINDS, type FishKind } from "../components";
import { CROP_SELL_PRICE, SEED_COST, GROWTH_DAYS } from "../economy";
import { seasonForDay } from "../protocols/weather";
import {
  farmingQualityBonus,
  fishingRarityBonus,
  foragingGoldMultiplier,
  miningRarityBonus,
} from "../systems/skills";
import { applyCoralRarityBonus } from "../systems/act/helpers";
import { AP_COST } from "../systems/economy/ap";
import { FORAGE_ZONES } from "../systems/act/constants";

/**
 * Skill-gated intention valuation (2026-07-16 brief: skill-gated intentions).
 *
 * The single, shared place where the deliberation layer learns how much a
 * non-farm activity is worth AT A FARMER'S CURRENT SKILL TIER, so personalities
 * stop converging on farming-max. Every number here is DERIVED from the same
 * value tables + skill-bonus curves the ACT handlers already pay out with
 * (`FISH_VALUE`/`CORAL_WEIGHTS`, `FORAGE_ZONES`, `CROP_SELL_PRICE`, the
 * `*RarityBonus`/`*Multiplier` curves and `AP_COST`) — no magic payoff constant
 * lives in the agent layer, so a farmer can never act on a stale valuation.
 *
 * Everything is scored in **gold per AP** (the economy model's unit — see
 * corpus/wiki/economy.md), so a skilled non-farm marginal is directly
 * comparable to the crop-loop baseline.
 */

export type NonFarmLine = "fishing" | "foraging" | "mining";

export const NON_FARM_LINES: readonly NonFarmLine[] = ["fishing", "foraging", "mining"];

/**
 * Farming baseline g/AP: the mean crop-loop score `g = (2P - S)/(G+2)` across
 * every crop (economy.md's formula), i.e. what an "average" farm action returns.
 * Derived from the live economy tables so a price re-tune moves it automatically.
 */
const CROP_KINDS = Object.keys(CROP_SELL_PRICE) as CropKind[];
export const FARM_BASELINE_GPA: number =
  CROP_KINDS.reduce(
    (sum, c) => sum + (2 * CROP_SELL_PRICE[c] - SEED_COST[c]) / (GROWTH_DAYS[c] + 2),
    0,
  ) / CROP_KINDS.length;

function fishXp(f: GameEntity): number {
  return f.skills?.fishing ?? 0;
}

function expectedValue(weights: Record<FishKind, number>): number {
  let total = 0;
  let ev = 0;
  for (const k of FISH_KINDS) {
    total += weights[k];
    ev += weights[k] * FISH_VALUE[k];
  }
  return total > 0 ? ev / total : 0;
}

/**
 * Coral-fishing marginal g/AP at the farmer's fishing tier. Coral is the
 * chase-worthy fishing line (deadline-free, high-value coral-trout/lobster); a
 * higher fishing tier shifts the catch toward lobster via the SAME
 * `applyCoralRarityBonus` the handler uses.
 */
export function fishingMarginalValue(f: GameEntity): number {
  const weights = applyCoralRarityBonus(CORAL_WEIGHTS, fishingRarityBonus(fishXp(f)));
  return expectedValue(weights) / AP_COST["fish-coral"];
}

const FORAGE_REWARD_MEAN =
  Object.values(FORAGE_ZONES).reduce((s, z) => s + z.reward, 0) /
  Math.max(1, Object.values(FORAGE_ZONES).length);

const FORAGE_SEASONS = new Set(Object.values(FORAGE_ZONES).map((z) => z.season));

/**
 * Foraging marginal g/AP. Two channels feed the SAME foraging tier:
 * - a season-independent LOCAL base (gathering owned forest bushes → foraging xp
 *   + seeds), modelled as a support fraction of the farm baseline that rises
 *   with the tier, so a forage-leaner builds skill year-round; and
 * - a seasonal GOLD spike in autumn/winter, when the forage zones pay direct
 *   gold (`FORAGE_ZONES` reward × the gold multiplier) — the in-season upside
 *   that makes the leaning worth extra, but throttled by travel + one-per-cycle
 *   so it never runs away with the wealth ordering.
 */
export const FORAGE_SUPPORT_FLOOR = 0.85;
export function foragingMarginalValue(f: GameEntity): number {
  const bonus = foragingGoldMultiplier(f.skills?.foraging ?? 0) - 1; // 0..0.4
  const localBase = FARM_BASELINE_GPA * (FORAGE_SUPPORT_FLOOR + bonus);
  const day = (f.beliefs?.data.currentDay as number | undefined) ?? 0;
  if (!FORAGE_SEASONS.has(seasonForDay(day))) return localBase;
  const zoneGold = (FORAGE_REWARD_MEAN * foragingGoldMultiplier(f.skills?.foraging ?? 0)) / AP_COST.forage;
  return Math.max(localBase, zoneGold);
}

/**
 * Mining "marginal" g/AP. Mining ore/geodes are NOT a direct gold channel — they
 * feed tool upgrades (faster farm labour) and decoration wood (yield boost), a
 * SUPPORT line. We proxy that indirect worth as a fraction of the farm baseline
 * that rises with the mining tier (better ore odds → better upgrade throughput).
 * Kept just below farming so a mining-leaner specialises its skill sheet without
 * ever topping the wealth board (it earns no direct gold), but high enough that
 * an affinity holder (×AFFINITY_BOOST) actually commits to the line.
 */
export const MINING_SUPPORT_FLOOR = 0.85;
export function miningMarginalValue(f: GameEntity): number {
  return FARM_BASELINE_GPA * (MINING_SUPPORT_FLOOR + miningRarityBonus(f.skills?.mining ?? 0));
}

export function nonFarmMarginalValue(f: GameEntity, line: NonFarmLine): number {
  switch (line) {
    case "fishing":
      return fishingMarginalValue(f);
    case "foraging":
      return foragingMarginalValue(f);
    case "mining":
      return miningMarginalValue(f);
  }
}

/** Farm marginal g/AP at the farmer's farming tier (quality husbandry upside). */
export function farmingMarginalValue(f: GameEntity): number {
  return FARM_BASELINE_GPA * (1 + farmingQualityBonus(f.skills?.farming ?? 0));
}

interface OwnedEndowment {
  stone: number;
  bush: number;
}

/** Count the farmer's OWNED, gatherable resource features (plot-sense already
 *  scopes `beliefs.tileFeatures` to features this farmer owns — farm + the
 *  adjacent quarry/forest whose vein the world assigns to the nearest farm). */
function ownedEndowment(f: GameEntity): OwnedEndowment {
  const feats = (f.beliefs?.data.tileFeatures as Array<{ kind: string }> | undefined) ?? [];
  let stone = 0;
  let bush = 0;
  for (const ft of feats) {
    if (ft.kind === "stone") stone++;
    else if (ft.kind === "bush") bush++;
  }
  return { stone, bush };
}

/** A name-hash tiebreaker (deterministic, seed-independent) — only used to break
 *  ties / seed the low-endowment fishing default with variety. */
function nameBucket(f: GameEntity): NonFarmLine {
  const name = f.farmer?.name ?? "";
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return NON_FARM_LINES[(h >>> 0) % NON_FARM_LINES.length]!;
}

/** How many owned features of a kind make a line worth specialising in. */
export const ENDOWMENT_THRESHOLD = 3;

/**
 * Non-farm affinity — the line a farmer is *positioned* to pursue, driven by
 * their owned-resource endowment (which is geography: whoever the world made the
 * nearest farm to a quarry owns its stone vein; likewise a forest's bushes).
 * A well-stocked stone owner leans mining, a bush owner foraging — so the lean
 * matches a line the farmer can actually WORK (the gather step auto-walks to the
 * owned vein). Farmers with no worthwhile vein fall back to a name-hash bucket
 * (spread across the lines for variety); their commit stays low unless the
 * line's marginal earns it.
 */
export function nonFarmAffinity(f: GameEntity): NonFarmLine {
  const { stone, bush } = ownedEndowment(f);
  if (stone >= ENDOWMENT_THRESHOLD && stone >= bush) return "mining";
  if (bush >= ENDOWMENT_THRESHOLD) return "foraging";
  return nameBucket(f);
}

/**
 * How eagerly a personality diversifies away from farming.
 * - `diversify` scales the whole commitment (conservative low, opportunist high).
 * - `chaseBest` (opportunist) evaluates ALL lines and chases the best marginal;
 *   otherwise the farmer only considers its innate affinity line.
 */
export interface NonFarmTemperament {
  diversify: number;
  chaseBest?: boolean;
}

export const TEMPERAMENT: Record<string, NonFarmTemperament> = {
  conservative: { diversify: 0.25 },
  hoarder: { diversify: 0.5 },
  aggressive: { diversify: 0.6 },
  opportunist: { diversify: 1.0, chaseBest: true },
};

/**
 * The chosen non-farm lean for this tick, or null if the farmer should just
 * farm. `commit` in [0,1] is how hard to lean — the driver maps it to activity
 * cadence (period/casts/priority). The value RISES as the farmer's tier in the
 * line rises (skill → payoff → more activity → more skill), which is the
 * behavioural-divergence flywheel this brief is about.
 */
export interface NonFarmFocus {
  line: NonFarmLine;
  commit: number;
  marginal: number;
  ratio: number;
}

/** Marginal-ratio at/above which leaning even begins (before diversify scaling). */
export const LEAN_THRESHOLD = 0.55;
/** Extra pull toward a farmer's innate affinity line. */
export const AFFINITY_BOOST = 1.4;

function commitFor(f: GameEntity, line: NonFarmLine, t: NonFarmTemperament): NonFarmFocus | null {
  const marginal = nonFarmMarginalValue(f, line);
  if (marginal <= 0) return null;
  const baseline = farmingMarginalValue(f);
  const ratio = marginal / baseline;
  const affinity = nonFarmAffinity(f) === line ? AFFINITY_BOOST : 1;
  const raw = (ratio * affinity - LEAN_THRESHOLD) * t.diversify;
  const commit = Math.max(0, Math.min(1, raw));
  if (commit <= 0) return null;
  return { line, commit, marginal, ratio };
}

export function nonFarmFocus(f: GameEntity, t: NonFarmTemperament): NonFarmFocus | null {
  if (t.chaseBest) {
    let best: NonFarmFocus | null = null;
    for (const line of NON_FARM_LINES) {
      const c = commitFor(f, line, t);
      if (c && (!best || c.commit > best.commit)) best = c;
    }
    return best;
  }
  return commitFor(f, nonFarmAffinity(f), t);
}

/**
 * Focus-aware bias for a personality's SINGLE `deliberateResourceGather` call
 * (mining/foraging skill is built from LOCAL owned features — the reliable,
 * travel-free lever). A mining/foraging leaner gathers more per cycle and puts
 * the matching feature kind first, so its action budget accrues the leaned
 * skill. Non-leaners get the caller's base cadence unchanged.
 *
 * Threaded into the ONE existing gather call (never a second call) so the AP
 * accounting the prune relies on is untouched.
 */
export interface GatherBias {
  maxActions: number;
  priority: number;
  preferKind?: "stone" | "bush";
}

export function gatherBias(
  focus: NonFarmFocus | null,
  baseMax: number,
  basePriority: number,
): GatherBias {
  if (focus && (focus.line === "mining" || focus.line === "foraging")) {
    // At least +2 actions when leaning at all, up to +6 at full commit — enough
    // to clear a farm's regenerated features (cap 6) in one cycle so the skill
    // actually accrues day over day.
    const boost = Math.max(2, Math.round(focus.commit * 6));
    return {
      maxActions: baseMax + boost,
      priority: Math.round(basePriority - Math.max(2, focus.commit * 6)),
      preferKind: focus.line === "mining" ? "stone" : "bush",
    };
  }
  return { maxActions: baseMax, priority: basePriority };
}
