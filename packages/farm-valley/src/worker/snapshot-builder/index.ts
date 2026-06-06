/**
 * snapshot-builder/index.ts — barrel re-exporting the full public API of the
 * original snapshot-builder.ts so all existing consumers continue to work
 * unchanged.
 */

export { HIGHLIGHT_THRESHOLD, INTENTION_KIND_TO_GLYPH } from "./constants";
export { buildObserverSnapshot, countEntities } from "./observer";
export { buildLeaderboardRows, buildRelationshipsData, buildRivalriesData, buildWealthSeries } from "./panels";
export { buildRenderSnapshot } from "./render";
