/**
 * Named render layer bands — the single source of truth for the `(layer, y)` sprite sort order.
 *
 * Sprites are drawn over the procedural animated water backdrop and sorted by (layer, y). This
 * module names the previously-scattered magic layer ints so the depth ordering is documented in
 * one place. The numeric values are UNCHANGED from the historical magic ints, so adopting these
 * constants is a pure rename: behaviour (including the deliberate collisions noted below) is
 * preserved exactly.
 *
 * Render-only. No sim/determinism impact.
 *
 * Depth bands (low layer = drawn first = visually behind / deeper):
 *
 *   BELOW_SURFACE  — submerged life, reads "under" the water via low alpha + a cool blue tint
 *                    (the animated water shows through them) rather than a water-surface overpass:
 *                      WHALE      1   faint deep silhouette
 *                      CORAL      2   baked seabed coral (static layer)
 *                      KELP       2   swaying kelp beds
 *                      JELLY      3   drifting jellyfish
 *                      TURTLE     3   near-surface glider
 *                      REEF_FISH  4   colourful shoals
 *
 *   SURFACE        — at the waterline:
 *                      BRIDGE     3   rope-deck bridges (collides with JELLY/TURTLE by design)
 *                      DUCK       6   paddling ducks (landed)
 *
 *   ABOVE_SURFACE  — above the waterline; sort within the band by y:
 *                      ACTOR     50   farmers / Pip / boats (ENTITY_LAYER)
 *                      BUILDING  50   building occluders (collides with ACTOR by design — y-sorted)
 *                      DUCK_FLY  60   ducks in flight
 *                      BIRD      60   flying birds
 *                      MEET      90   meet bubbles
 *                      FOLLOW    91   follow arrow
 *
 * NOTE: collisions (KELP/CORAL at 2; JELLY/TURTLE/BRIDGE at 3; ACTOR/BUILDING at 50; DUCK_FLY/BIRD
 * at 60) are intentional and were present before this rename — colliding layers fall back to the
 * y-sort, which is the desired ordering. Do not "fix" them by reassigning numbers.
 */
export const LAYER = {
  // ── BELOW_SURFACE ──
  WHALE: 1,
  CORAL: 2,
  KELP: 2,
  JELLY: 3,
  TURTLE: 3,
  REEF_FISH: 4,
  // ── SURFACE ──
  BRIDGE: 3,
  DUCK: 6,
  // ── ABOVE_SURFACE ──
  ACTOR: 50,
  BUILDING: 50,
  DUCK_FLY: 60,
  BIRD: 60,
  MEET: 90,
  FOLLOW: 91,
} as const;

export type LayerName = keyof typeof LAYER;
