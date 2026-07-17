/**
 * Community lifecycle ontology — chunk hollow-04's structured events for
 * community.formed/joined/left/split/merged/dissolved, mirroring
 * `protocols/starvation.ts`'s `ONT_*` + body-shape pattern. Emitted by
 * `community/crystallize-system.ts` with enough body (community id(s),
 * agent id(s), tick) to feed hollow-07's metrics export later — this chunk
 * only emits them, it does not consume them.
 */
export const ONT_COMMUNITY = {
  FORMED: "community.formed",
  JOINED: "community.joined",
  LEFT: "community.left",
  SPLIT: "community.split",
  MERGED: "community.merged",
  DISSOLVED: "community.dissolved",
} as const;

export type CommunityOntology = (typeof ONT_COMMUNITY)[keyof typeof ONT_COMMUNITY];

/** A brand-new community crystallized from an unaffiliated high-trust cluster. */
export interface CommunityFormedBody {
  communityId: number;
  memberIds: number[];
  tick: number;
}

/** A high-trust non-member joined an existing community (GROW). */
export interface CommunityJoinedBody {
  communityId: number;
  agentId: number;
  tick: number;
}

/** A member whose trust to the group collapsed defected (LEAVE). */
export interface CommunityLeftBody {
  communityId: number;
  agentId: number;
  tick: number;
}

/** A community's internal trust graph cleaved into two dense clusters.
 *  `originalId` keeps the lower-member-id half; `newId` is the freshly
 *  formed community for the other half. `strandedAgentIds` lists any
 *  members whose sub-cluster didn't clear the split thresholds — they're
 *  released to the unaffiliated pool (and may be picked up by a later FORM
 *  pass), not silently dropped from either half. */
export interface CommunitySplitBody {
  originalId: number;
  newId: number;
  keptMemberIds: number[];
  newMemberIds: number[];
  strandedAgentIds: number[];
  tick: number;
}

/** Two high-cross-trust, overlapping communities fused. `keptId` is the
 *  lower id (survives); `absorbedId` is dissolved into it. */
export interface CommunityMergedBody {
  keptId: number;
  absorbedId: number;
  memberIds: number[];
  tick: number;
}

/** A community's membership fell below the minimum and it de-crystallized.
 *  `memberIds` are the FORMER members at the moment of dissolution (their
 *  stockpile share, if any, has already been reverted to their personal
 *  inventories — see crystallize-system.ts). */
export interface CommunityDissolvedBody {
  communityId: number;
  memberIds: number[];
  tick: number;
}
