/**
 * `glyphForAction` — the default (tags-OFF) overlay's action -> glyph
 * mapping (chunk hollow-09c). Deliberately SPARSE: `"idle"`/`"walk"` (the
 * two most common labels — see `HollowAgentSnapshot.action`'s doc, chunk
 * hollow-09a) map to `null` ("draw nothing") so a crowd of agents just
 * milling/walking around stays uncluttered; only the "notable" actions
 * (the nine social verbs, plus `"work"`/`"eat"`) get a small symbol
 * floating above the head. Pure string -> string|null table lookup, no
 * canvas/DOM here — see `overlay.ts` for the actual draw call.
 */

/** Mirrors `HollowAgentSnapshot.action`'s full vocabulary (sim-bootstrap.ts) —
 *  `idle`/`walk` intentionally excluded from the glyph table below (they
 *  render nothing), everything else gets a symbol. */
const ACTION_GLYPHS: Readonly<Record<string, string>> = {
  work: "⚒", // ⚒ hammer and pick
  eat: "\u{1F35E}", // 🍞 bread
  gift: "\u{1F381}", // 🎁 wrapped gift
  share: "\u{1F91D}", // 🤝 handshake
  help: "\u{1F91B}", // 🤛 fist bump (helping hand)
  teach: "\u{1F4D6}", // 📖 open book
  trade: "⚖", // ⚖ scales
  steal: "\u{1F455}", // 👕 (a lifted item, stand-in for pickpocketing)
  sabotage: "\u{1F4A5}", // 💥 collision/damage
  rumor: "\u{1F4AC}", // 💬 speech bubble
  attack: "⚔", // ⚔ crossed swords
};

/**
 * The default (tags-OFF) subtle glyph for `action`, or `null` to draw
 * nothing (idle/walk, or any unrecognized label — defensive fallback, same
 * convention as `humanoid.ts`'s `poseForAction`). Pure.
 */
export function glyphForAction(action: string): string | null {
  return ACTION_GLYPHS[action] ?? null;
}

/**
 * Job-cue letter for `occupation` (chunk hollow-14d — mirrors sim-core's
 * `JOB_ROLES`, `components/occupation.ts`). Deliberately a single plain
 * character (a letter for the original five roles), not a color emoji — the
 * canvas/pixel font this overlay draws with may not render color-emoji
 * glyphs reliably (see this module's header on why `ACTION_GLYPHS` sticks to
 * simple symbols), and a crowd of agents needs the cue to stay legible at a
 * glance. Chunk hollow-15's two care roles keep the same "single character"
 * contract (`.length === 1`) but reach for a symbol closer to the role's
 * tool/purpose (a dig glyph, a cross) rather than an initial letter — see
 * their own inline comments below. `"unassigned"` (every agent starts here
 * until a leader/self-assignment pass runs) and any unrecognized role draw
 * nothing — same "draw nothing rather than a confusing default" convention
 * as `glyphForAction`'s idle/walk.
 */
const OCCUPATION_GLYPHS: Readonly<Record<string, string>> = {
  "food-gatherer": "F",
  "material-gatherer": "M",
  crafter: "C",
  teacher: "T",
  caretaker: "K",
  // chunk hollow-15's two care roles — a pickaxe-ish dig glyph for the
  // grave-digger (a single BMP code point, `.length === 1` like every other
  // cue here) and a plain "+" cross for the medic (unmistakably medical,
  // and a single character too).
  "grave-digger": "⛏",
  medic: "+",
};

/** The job-cue letter for `occupation`, or `null` to draw nothing
 *  (`"unassigned"`, or any unrecognized label). Pure. */
export function glyphForOccupation(occupation: string): string | null {
  return OCCUPATION_GLYPHS[occupation] ?? null;
}
