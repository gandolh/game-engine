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
