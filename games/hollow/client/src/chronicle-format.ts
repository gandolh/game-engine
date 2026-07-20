/**
 * `chronicle-format.ts` — PURE data-shaping for the live chronicle (chunk
 * hollow-10b): turns a raw `ChronicleEvent` (an open `{tick, ontology,
 * ...body}` record — see `@hollow/sim-core/observe`'s `chronicle.ts`) into
 * a human-readable line, the agent id(s) a click on it should jump the
 * camera to, and a coarse filter category. No DOM, no worker access, no
 * `HOLLOW_PAL` — this module only shapes data; `chronicle-panel.ts` is the
 * DOM layer that consumes it (mirrors `render3d/overlay.ts`'s split between
 * pure helpers and the draw call, and `metrics-data.ts`'s split from
 * `dashboard-panel.ts`).
 *
 * Every ontology from the brief (ONT_FAMILY, ONT_COMMUNITY, ONT_SOCIAL,
 * ONT_STARVATION.ONSET) is handled explicitly; an unrecognized ontology
 * falls back to a plain "Event: <ontology>" line / "other" category / no
 * actors, rather than throwing — a `ChronicleEvent`'s body shape is only as
 * trustworthy as whatever ontology the sim happens to be emitting today.
 */
import { agentName } from "./agent-name";
import { ONT_FAMILY, ONT_COMMUNITY, ONT_SOCIAL, ONT_STARVATION } from "@hollow/sim-core/protocols";
import type { ChronicleEvent } from "@hollow/sim-core/observe";

// ---------------------------------------------------------------------------
// Narrow, defensive field readers — a `ChronicleEvent`'s body fields are
// `unknown` (the type is an open record), so every accessor below type-guards
// rather than casting.
// ---------------------------------------------------------------------------

function num(ev: ChronicleEvent, key: string): number | undefined {
  const v = ev[key];
  return typeof v === "number" ? v : undefined;
}

function str(ev: ChronicleEvent, key: string): string | undefined {
  const v = ev[key];
  return typeof v === "string" ? v : undefined;
}

function bool(ev: ChronicleEvent, key: string): boolean | undefined {
  const v = ev[key];
  return typeof v === "boolean" ? v : undefined;
}

function numArr(ev: ChronicleEvent, key: string): number[] {
  const v = ev[key];
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
}

// ---------------------------------------------------------------------------
// chronicleCategory — coarse filter bucket, per the brief's category list.
// ---------------------------------------------------------------------------

export const CHRONICLE_CATEGORIES = [
  "births",
  "deaths",
  "pairings",
  "community",
  "cooperation",
  "antagonism",
  "famine",
  "other",
] as const;

export type ChronicleCategory = (typeof CHRONICLE_CATEGORIES)[number];

const COMMUNITY_ONTOLOGIES: ReadonlySet<string> = new Set(Object.values(ONT_COMMUNITY));
const COOP_ONTOLOGIES: ReadonlySet<string> = new Set([
  ONT_SOCIAL.GIFT,
  ONT_SOCIAL.SHARE,
  ONT_SOCIAL.HELP,
  ONT_SOCIAL.TEACH,
  ONT_SOCIAL.TRADE,
]);
const ANTAG_ONTOLOGIES: ReadonlySet<string> = new Set([
  ONT_SOCIAL.STEAL,
  ONT_SOCIAL.STEAL_DETECTED,
  ONT_SOCIAL.SABOTAGE,
  ONT_SOCIAL.RUMOR,
  ONT_SOCIAL.ATTACK,
]);

/** Buckets an ontology string into one of `CHRONICLE_CATEGORIES` — pure,
 *  total (every input maps to SOME category; `family.stage-changed` and any
 *  unrecognized ontology fall to `"other"`). */
export function chronicleCategory(ontology: string): ChronicleCategory {
  if (ontology === ONT_FAMILY.BIRTH) return "births";
  if (ontology === ONT_FAMILY.DEATH) return "deaths";
  if (ontology === ONT_FAMILY.BONDED) return "pairings";
  if (COMMUNITY_ONTOLOGIES.has(ontology)) return "community";
  if (COOP_ONTOLOGIES.has(ontology)) return "cooperation";
  if (ANTAG_ONTOLOGIES.has(ontology)) return "antagonism";
  if (ontology === ONT_STARVATION.ONSET) return "famine";
  return "other";
}

// ---------------------------------------------------------------------------
// chronicleEventActors — the agent id(s) a click on this event should jump
// the camera to, primary actor first.
// ---------------------------------------------------------------------------

/** The agent id(s) this event concerns, primary actor first (empty for a
 *  pure-community event with no single agent, or an unrecognized ontology).
 *  Pure — reads only `ev`'s own fields, never touches live sim/render
 *  state (that's `main.ts`'s job once a caller has picked an id off this
 *  list). */
export function chronicleEventActors(ev: ChronicleEvent): number[] {
  const o = ev.ontology;
  switch (o) {
    case ONT_FAMILY.BONDED: {
      const a = num(ev, "partnerAId");
      const b = num(ev, "partnerBId");
      return [a, b].filter((x): x is number => x !== undefined);
    }
    case ONT_FAMILY.BIRTH: {
      const child = num(ev, "childId");
      const pa = num(ev, "parentAId");
      const pb = num(ev, "parentBId");
      return [child, pa, pb].filter((x): x is number => x !== undefined);
    }
    case ONT_FAMILY.DEATH:
    case ONT_FAMILY.STAGE_CHANGED:
    case ONT_STARVATION.ONSET: {
      const id = num(ev, "agentId");
      return id !== undefined ? [id] : [];
    }
    case ONT_COMMUNITY.FORMED:
    case ONT_COMMUNITY.MERGED:
    case ONT_COMMUNITY.DISSOLVED:
      return numArr(ev, "memberIds");
    case ONT_COMMUNITY.JOINED:
    case ONT_COMMUNITY.LEFT: {
      const id = num(ev, "agentId");
      return id !== undefined ? [id] : [];
    }
    case ONT_COMMUNITY.SPLIT:
      return [...numArr(ev, "keptMemberIds"), ...numArr(ev, "newMemberIds"), ...numArr(ev, "strandedAgentIds")];
    case ONT_SOCIAL.SHARE: {
      const actor = num(ev, "actorId");
      return actor !== undefined ? [actor] : [];
    }
    case ONT_SOCIAL.GIFT:
    case ONT_SOCIAL.HELP:
    case ONT_SOCIAL.TEACH:
    case ONT_SOCIAL.TRADE:
    case ONT_SOCIAL.STEAL:
    case ONT_SOCIAL.STEAL_DETECTED:
    case ONT_SOCIAL.SABOTAGE:
    case ONT_SOCIAL.RUMOR:
    case ONT_SOCIAL.ATTACK: {
      const actor = num(ev, "actorId");
      const target = num(ev, "targetId");
      return [actor, target].filter((x): x is number => x !== undefined);
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// formatChronicleEvent — the human-readable line.
// ---------------------------------------------------------------------------

export interface ChronicleFormatOptions {
  /** Same `ticksPerDay` the worker/sim were booted with — the year prefix
   *  is `floor(tick / ticksPerDay)`, matching every other "year" derivation
   *  in this client (e.g. `day-night.ts`'s header). */
  readonly ticksPerDay: number;
}

function agentOrFallback(id: number | undefined): string {
  return id !== undefined ? agentName(id) : "someone";
}

function causeLabel(cause: string | undefined): string {
  if (cause === "oldAge") return "old age";
  if (cause === "starvation") return "starvation";
  if (cause === "violence") return "violence";
  return "unknown cause";
}

/** "a"/"an" — only the three life stages (`child`/`adult`/`elder`) are ever
 *  passed in, but this stays a general vowel check rather than a lookup
 *  table so it doesn't silently go stale if a stage name changes. */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

function bodyLine(ev: ChronicleEvent): string {
  const o = ev.ontology;
  switch (o) {
    case ONT_FAMILY.BONDED: {
      const a = num(ev, "partnerAId");
      const b = num(ev, "partnerBId");
      return `${agentOrFallback(a)} and ${agentOrFallback(b)} bond`;
    }
    case ONT_FAMILY.BIRTH: {
      const child = num(ev, "childId");
      const pa = num(ev, "parentAId");
      const pb = num(ev, "parentBId");
      return `${agentOrFallback(pa)} and ${agentOrFallback(pb)} welcome ${agentOrFallback(child)}`;
    }
    case ONT_FAMILY.DEATH: {
      const id = num(ev, "agentId");
      const cause = str(ev, "cause");
      return `${agentOrFallback(id)} dies (${causeLabel(cause)})`;
    }
    case ONT_FAMILY.STAGE_CHANGED: {
      const id = num(ev, "agentId");
      const stage = str(ev, "stage") ?? "adult";
      return `${agentOrFallback(id)} grows into ${article(stage)} ${stage}`;
    }
    case ONT_COMMUNITY.FORMED: {
      const id = num(ev, "communityId");
      const members = numArr(ev, "memberIds");
      return `Community #${id ?? "?"} forms (${members.length} members)`;
    }
    case ONT_COMMUNITY.JOINED: {
      const id = num(ev, "communityId");
      const agentId = num(ev, "agentId");
      return `${agentOrFallback(agentId)} joins community #${id ?? "?"}`;
    }
    case ONT_COMMUNITY.LEFT: {
      const id = num(ev, "communityId");
      const agentId = num(ev, "agentId");
      return `${agentOrFallback(agentId)} leaves community #${id ?? "?"}`;
    }
    case ONT_COMMUNITY.SPLIT: {
      const originalId = num(ev, "originalId");
      const newId = num(ev, "newId");
      return `Community #${originalId ?? "?"} splits into #${originalId ?? "?"} and #${newId ?? "?"}`;
    }
    case ONT_COMMUNITY.MERGED: {
      const keptId = num(ev, "keptId");
      const absorbedId = num(ev, "absorbedId");
      return `Community #${absorbedId ?? "?"} merges into #${keptId ?? "?"}`;
    }
    case ONT_COMMUNITY.DISSOLVED: {
      const id = num(ev, "communityId");
      return `Community #${id ?? "?"} dissolves`;
    }
    case ONT_SOCIAL.GIFT: {
      const actor = num(ev, "actorId");
      const target = num(ev, "targetId");
      const good = str(ev, "good") ?? "goods";
      return `${agentOrFallback(actor)} gifts ${good} to ${agentOrFallback(target)}`;
    }
    case ONT_SOCIAL.SHARE: {
      const actor = num(ev, "actorId");
      const communityId = num(ev, "communityId");
      const good = str(ev, "good") ?? "goods";
      return `${agentOrFallback(actor)} shares ${good} with community #${communityId ?? "?"}`;
    }
    case ONT_SOCIAL.HELP: {
      const actor = num(ev, "actorId");
      const target = num(ev, "targetId");
      return `${agentOrFallback(actor)} helps ${agentOrFallback(target)}`;
    }
    case ONT_SOCIAL.TEACH: {
      const actor = num(ev, "actorId");
      const target = num(ev, "targetId");
      const skill = str(ev, "skill") ?? "a skill";
      return `${agentOrFallback(actor)} teaches ${agentOrFallback(target)} ${skill}`;
    }
    case ONT_SOCIAL.TRADE: {
      const actor = num(ev, "actorId");
      const target = num(ev, "targetId");
      const accepted = bool(ev, "accepted");
      return `${agentOrFallback(actor)} trades with ${agentOrFallback(target)}${accepted === false ? " (declined)" : ""}`;
    }
    case ONT_SOCIAL.STEAL: {
      const actor = num(ev, "actorId");
      const target = num(ev, "targetId");
      const detected = bool(ev, "detected");
      return `${agentOrFallback(actor)} steals from ${agentOrFallback(target)}${detected ? " (caught)" : ""}`;
    }
    case ONT_SOCIAL.STEAL_DETECTED: {
      const actor = num(ev, "actorId");
      const target = num(ev, "targetId");
      return `${agentOrFallback(target)} catches ${agentOrFallback(actor)} stealing`;
    }
    case ONT_SOCIAL.SABOTAGE: {
      const actor = num(ev, "actorId");
      const target = num(ev, "targetId");
      const detected = bool(ev, "detected");
      return `${agentOrFallback(actor)} sabotages ${agentOrFallback(target)}${detected ? " (caught)" : ""}`;
    }
    case ONT_SOCIAL.RUMOR: {
      const actor = num(ev, "actorId");
      const target = num(ev, "targetId");
      return `${agentOrFallback(actor)} spreads a rumor about ${agentOrFallback(target)}`;
    }
    case ONT_SOCIAL.ATTACK: {
      const actor = num(ev, "actorId");
      const target = num(ev, "targetId");
      const lethal = bool(ev, "lethal");
      return `${agentOrFallback(actor)} attacks ${agentOrFallback(target)}${lethal ? " (fatal)" : ""}`;
    }
    case ONT_STARVATION.ONSET: {
      const id = num(ev, "agentId");
      return `${agentOrFallback(id)} begins starving`;
    }
    default:
      return `Event: ${o}`;
  }
}

/** One chronicle line for `ev`, e.g. `"Y12  Bram gifts food to Ada"` — a
 *  `"Y<year>  "` prefix (year = `floor(tick / ticksPerDay)`) followed by an
 *  ontology-specific, agent-named body line. Pure/total: every ontology this
 *  client's chronicle can receive is handled; anything else falls back to a
 *  plain `"Event: <ontology>"` body rather than throwing. */
export function formatChronicleEvent(ev: ChronicleEvent, opts: ChronicleFormatOptions): string {
  const year = opts.ticksPerDay > 0 ? Math.floor(ev.tick / opts.ticksPerDay) : 0;
  return `Y${year}  ${bodyLine(ev)}`;
}
