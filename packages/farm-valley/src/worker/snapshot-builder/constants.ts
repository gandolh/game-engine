/**
 * snapshot-builder/constants.ts — shared constants for snapshot building.
 */

/**
 * Drama threshold for "skip to highlight" (Part B). An event is a highlight
 * when its drama score meets or exceeds this value. Matches the feed panel's
 * emphasis threshold (≥ 0.7 → gold star in EventFeedPanel). Centralised here
 * (snapshot-builder is the worker-side authority) and re-exported so sim-worker
 * and the unit-test helper can import it without duplicating the constant.
 */
export const HIGHLIGHT_THRESHOLD = 0.7;

/**
 * How many ticks a bubble stays visible after an intention CHANGE.
 * On-change-only legibility rule: we show the bubble for a brief window (like
 * the meet bubble's 10 ticks) so the map isn't a wall of persistent icons.
 * After the window expires, the bubble disappears until the next intention
 * change. This gives scan-level legibility without ambient clutter.
 */
export const BUBBLE_SHOW_TICKS = 10;

/**
 * Maps an intention.kind string to its indicator glyph frame name.
 * Only AI-farmer intention kinds are listed; player (Pip) never gets a bubble.
 *
 * Intention kinds observed in the codebase (agents/*.ts):
 *   plant, water, harvest, sell, buy, travel, sleep, idle,
 *   fish, bid, meet, refill, chop, mine, work
 * Any unmapped kind silently returns null (no bubble).
 */
export const INTENTION_KIND_TO_GLYPH: Readonly<Record<string, string>> = {
  "plant":   "indicator/intention-plant",
  "water":   "indicator/intention-water",
  "harvest": "indicator/intention-harvest",
  "sell":    "indicator/intention-sell",
  "buy":     "indicator/intention-buy",
  "travel":  "indicator/intention-travel",
  "sleep":   "indicator/intention-sleep",
  "fish":    "indicator/intention-fish",
  "bid":     "indicator/intention-bid",
  "meet":    "indicator/intention-meet",
  "refill":  "indicator/intention-water",
  "chop":    "indicator/intention-chop",
  "mine":    "indicator/intention-mine",
  "work":    "indicator/intention-work",
  "idle":    "indicator/intention-idle",
};

// Friendly hover name + blurb for the decorative props (sprite-only entities
// with no identifying component — keyed off their `sprite.frame`). Keeping it a
// frame→label map means a new `decoration/*` prop just needs one entry here to
// become hover-able.
export const DECORATION_LABELS: Record<string, { label: string; description: string }> = {
  "decoration/barrel": { label: "Barrel", description: "A storage barrel — just scenery." },
  "decoration/crate": { label: "Crate", description: "A wooden crate — just scenery." },
  "decoration/potted-plant": { label: "Potted Plant", description: "A potted plant — just scenery." },
  "decoration/lamp-post": { label: "Lamp Post", description: "Lights the village at night — just scenery." },
  "decoration/signpost": { label: "Signpost", description: "A village signpost — just scenery." },
  "decoration/hay-bale": { label: "Hay Bale", description: "A bale of hay — just scenery." },
  "decoration/bush": { label: "Bush", description: "A leafy bush — just scenery." },
  "decoration/log-stack": { label: "Log Stack", description: "Stacked logs — just scenery." },
  // brief 51 — heritage-site landmark islets. Decorative only; the hover names
  // them so spectators read the world's "history". No gameplay behavior.
  "structure/heritage-stones": { label: "Standing Stones", description: "An ancient dolmen ring — a relic of an older age. Just a landmark." },
  "structure/heritage-ruin": { label: "Ruined Tower", description: "The crumbling remains of an old watchtower. Just a landmark." },
  "structure/heritage-statue": { label: "Weathered Statue", description: "A worn monument to someone long forgotten. Just a landmark." },
};

/** How many feed lines to ship in the snapshot (panel shows ~30). */
export const EVENT_SNAPSHOT_CAP = 30;

/**
 * Build per-farmer wealth time series from the run-history rows. Groups rows
 * by farmerId and attaches the farmer's display name and personality (resolved
 * from the ECS world) so the chart panel needs no second lookup.
 *
 * Capped at MAX_WEALTH_ROWS rows total (100 days × 5 farmers = 500 max, within
 * the brief's stated bound) — early-exit guard to keep serialisation cheap.
 */
export const MAX_WEALTH_ROWS = 500;
