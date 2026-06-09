import { type PixelRecipe } from "./types";

// ── Farmer action-pose generator ─────────────────────────────────────────────
// Each template is authored in conservative palette chars.
// Substitution maps correct the palette for every other personality.
// Tool chars (m q Q W o s e) are intentionally excluded from any substitution
// so they keep their original colour regardless of personality.

export const ACTION_TEMPLATES: Record<string, readonly string[]> = {
  // Generic bent-over pose (was the single /work; now also the harvest fallback).
  work: [
    "................",
    "................",
    ".....yyyyy......",
    "....yyyyyyy.....",
    "....ywwwwwy.....",
    "....yk.w.ky.....",
    "....yywwwy......",
    "....rrrrr.......",
    "...rrrrrrr......",
    "...rrwwwrr......",
    "....r.rrr.......",
    "....rr..........",
    "...DDD..........",
    "...DDD..........",
    "................",
    "................",
  ],

  // Hoe held at right side, blade angled down toward soil.
  // handle=m (brown), blade=Q (stone dark), no personality chars on tool.
  till: [
    "................",
    "................",
    ".....yyyyy......",
    "....yyyyyyy.....",
    "....ywwwwwy.....",
    "....yk.w.ky.....",
    "....yywwwy......",
    "...rrrrrr.......",
    "..rrrrrrrrm.....",
    "..rrwwwrrmm.....",
    "...r....mm......",
    "...r...mm.......",
    "..DDD.Qm........",
    "..DDD..Q........",
    "................",
    "................",
  ],

  // Watering can held out front, tilted, with a few water droplets.
  // can body=Q (stone dark), spout=q (stone light), drops=s/e (water blues).
  water: [
    "................",
    "................",
    ".....yyyyy......",
    "....yyyyyyy.....",
    "....ywwwwwy.....",
    "....yk.w.ky.....",
    "....yywwwy......",
    "...rrrrrrr......",
    "..rrrrrrrrr.....",
    "..rrwwwrrQQQ....",
    "...r....qQQ.....",
    "..DDD....s.s....",
    "..DDD.....s.....",
    "...........s....",
    "................",
    "................",
  ],

  // Crouched lower, dipping can toward water (refilling at well/fountain).
  // can=Q/q, water surface=s (structure blue light).
  refill: [
    "................",
    "................",
    ".....yyyyy......",
    "....yyyyyyy.....",
    "....ywwwwwy.....",
    "....yk.w.ky.....",
    "....yywwwy......",
    "....rrrrrr......",
    "...rrrrrrrrQQ...",
    "...rrwwwrqqQ....",
    "....r....qQ.....",
    "....rr.....s....",
    "...DDD...sss....",
    "...DDD..sssss...",
    "................",
    "................",
  ],

  // Mid-swing axe raised up to the right.
  // handle=m (brown), blade=q (stone light).
  chop: [
    "................",
    "................",
    ".....yyyyy......",
    "....yyyyyyy.....",
    "....ywwwwwy.....",
    "....yk.w.ky.....",
    "....yywwwy......",
    ".rrrrrrrr..q....",
    "rrrrrrrrrr.qq...",
    ".rrwwwrr...q....",
    "..r.rrmm........",
    "..rr..m.........",
    ".DDD..m.........",
    ".DDD............",
    "................",
    "................",
  ],

  // Mid-swing pickaxe raised up to the right.
  // handle=m (brown), pick head=Q (stone dark).
  mine: [
    "................",
    "................",
    ".....yyyyy......",
    "....yyyyyyy.....",
    "....ywwwwwy.....",
    "....yk.w.ky.....",
    "....yywwwy......",
    ".rrrrrrrr.QQ....",
    "rrrrrrrrrr.Q....",
    ".rrwwwrr..QQ....",
    "..r.rrmm........",
    "..rr..m.........",
    ".DDD..m.........",
    ".DDD............",
    "................",
    "................",
  ],

  // Bent forward, one arm reaching down, a few seed pixels on the soil.
  // seeds=o (gold).
  plant: [
    "................",
    "................",
    ".....yyyyy......",
    "....yyyyyyy.....",
    "....ywwwwwy.....",
    "....yk.w.ky.....",
    "....yywwwy......",
    "...rrrrrr.......",
    "..rrrrrrrrr.....",
    "..rrwwwrrr......",
    "...r....rr......",
    "...rr...ro......",
    "..DDD..o........",
    "..DDD..o........",
    "................",
    "................",
  ],
};

// Per-personality char substitution maps.
// Each entry maps source chars to destination chars.
// Applied character-by-character to every pixel in the template.
export const PERSONALITY_SUBS: Record<string, Record<string, string>> = {
  conservative: {},
  aggressive:   { y: "k", D: "k" },
  hoarder:      { y: "D", r: "y" },
  opportunist:  { y: "s", r: "S", D: "k" },
  // Pip — the player-controlled farmer. Gold hair (y→o) + green tunic (r→G) so
  // they read as visually distinct from all four AI farmers at a glance.
  pip:          { y: "o", r: "G" },
};

export function applyPersonalitySubs(
  pixels: readonly string[],
  subs: Record<string, string>,
): readonly string[] {
  if (Object.keys(subs).length === 0) return pixels;
  return pixels.map((row) =>
    row
      .split("")
      .map((ch) => subs[ch] ?? ch)
      .join(""),
  );
}

// ── Per-personality HAT SILHOUETTE overlay ────────────────────────────────────
// The four AI farmers' WORK/action poses previously shared one silhouette and
// differed only by a weak head-colour swap — effectively pixel-identical during
// the core farming loop. To make each farmer read at a glance in ANY pose, we
// stamp a distinct hat SHAPE onto the HEAD region of every farmer frame.
//
// Each hat is a sparse 16-wide overlay covering ONLY the top head rows (0–3).
// A `.` means "leave the underlying pixel untouched"; any other char is stamped
// over it. The head/hair block sits at rows 2–6 and faces/eyes start at row 4,
// so confining the hat to rows 0–3 keeps it on the head and well clear of the
// tool pixels (`m q Q W o s e`), which only ever appear at the arms/sides on
// rows 7+ in the action poses. (Verified per pose — no hat row overlaps a tool.)
//
// All chars below are valid EDG32 palette chars (see palette.ts):
//   w=cream, r=red/rust, D=wood-dark, s=structure-blue-lt, o=gold, k=near-black.
//
// Shapes:
//   conservative — plain flat hat (cream band across the crown).
//   aggressive   — spiked / pointed hat (jagged near-black spikes above a band).
//   hoarder      — wide-brim hat (a band whose brim extends 1px each side).
//   opportunist  — cap with a feather/peak (blue cap + an asymmetric gold feather).
//   pip (player) — its own gold crown, distinct from all four AI farmers.
// Each hat band is chosen to CONTRAST with that personality's (substituted)
// hair colour so the shape reads even on the head, not only via the overhang:
//   conservative hair=y → cream `w` band
//   aggressive   hair=k → red  `r` spikes
//   hoarder      hair=D → gold `o` wide brim
//   opportunist  hair=s → red  `r` cap + gold `o` feather
//   pip          hair=o → red  `r` crown
export const PERSONALITY_HATS: Record<string, readonly string[]> = {
  // Flat brimmed cream band hugging the crown.
  conservative: [
    "................",
    "................",
    ".....wwwww......",
    "....w.....w.....",
  ],
  // Jagged red spikes poking above a red band (reads against the black head).
  aggressive: [
    "................",
    ".....r.r.r......",
    ".....rrrrr......",
    "....r.....r.....",
  ],
  // Wide brim: gold band on row 2, brim overhanging 1px each side on row 3.
  hoarder: [
    "................",
    "................",
    ".....ooooo......",
    "...ooooooooo....",
  ],
  // Cap with a forward-right feather/peak (asymmetric gold pixel above a red cap).
  opportunist: [
    "..........o.....",
    ".........ro.....",
    ".....rrrrr......",
    "....r.....r.....",
  ],
  // Pip's own rounded red crown — clearly distinct from the AI hats above.
  pip: [
    "................",
    "......rrr.......",
    ".....rrrrr......",
    "....r.....r.....",
  ],
};

// Stamp a personality's hat onto a (already personality-substituted) pose.
// Only non-`.` overlay chars overwrite the underlying pixel; everything else is
// preserved. The overlay only ever touches rows 0–3, so it never disturbs the
// body, face, legs, or any action-pose tool pixels (all at rows 7+).
export function applyPersonalityHat(
  pixels: readonly string[],
  personality: string,
): readonly string[] {
  const hat = PERSONALITY_HATS[personality];
  if (!hat) return pixels;
  return pixels.map((row, y) => {
    const overlay = hat[y];
    if (!overlay) return row;
    let out = "";
    for (let x = 0; x < row.length; x++) {
      const stamp = overlay.charAt(x);
      out += stamp !== "" && stamp !== "." ? stamp : row.charAt(x);
    }
    return out;
  });
}

// Convenience: apply colour subs then stamp the hat, the canonical farmer-frame
// transform. Used by the recipe generator for every farmer frame so the hat is
// applied UNIFORMLY across idle, walk, all facings, and all action poses.
export function applyFarmerLook(
  pixels: readonly string[],
  personality: string,
  subs: Record<string, string>,
): readonly string[] {
  return applyPersonalityHat(applyPersonalitySubs(pixels, subs), personality);
}

// ── Directional facing frames (3-way: down / up / side) ──────────────────────
// The existing `farmer/<p>` (+ /walk-a /walk-b) frames are the DOWN (front)
// facing. Here we author UP (back) and SIDE (profile, right-facing) variants for
// idle + 2 walk frames, then generate them for every personality via the same
// substitution maps. The renderer picks the facing from movement direction and
// mirrors the side frame horizontally for leftward movement (flipX).
//
// Frame names produced (per personality P):
//   farmer/P/up,   farmer/P/up/walk-a,   farmer/P/up/walk-b
//   farmer/P/side, farmer/P/side/walk-a, farmer/P/side/walk-b
// Authored in conservative chars (head/hair=y, face=w, eyes=k, shirt=r, legs=D).

export const FACING_TEMPLATES: Record<string, readonly string[]> = {
  // UP — back of head: no face/eyes, just the hair block + back of shirt/legs.
  up: [
    "................",
    "................",
    ".....yyyyy......",
    "....yyyyyyy.....",
    "....yyyyyyy.....",
    "....yyyyyyy.....",
    "....yyyyyy......",
    "....rrrrr.......",
    "...rrrrrrr......",
    "...rrrrrrr......",
    "....r...r.......",
    "....r...r.......",
    "...DDD.DDD......",
    "...DDD.DDD......",
    "................",
    "................",
  ],
  "up/walk-a": [
    "................",
    "................",
    ".....yyyyy......",
    "....yyyyyyy.....",
    "....yyyyyyy.....",
    "....yyyyyyy.....",
    "....yyyyyy......",
    "....rrrrr.......",
    "...rrrrrrr......",
    "...rrrrrrr......",
    "....r...r.......",
    "....r...r.......",
    "..DDD...DDD.....",
    "..DDD...DDD.....",
    "................",
    "................",
  ],
  "up/walk-b": [
    "................",
    "................",
    ".....yyyyy......",
    "....yyyyyyy.....",
    "....yyyyyyy.....",
    "....yyyyyyy.....",
    "....yyyyyy......",
    "....rrrrr.......",
    "...rrrrrrr......",
    "...rrrrrrr......",
    "....r...r.......",
    "....r...r.......",
    "....DDD.DDD.....",
    "....DDD.DDD.....",
    "................",
    "................",
  ],
  // SIDE — right-facing profile. One eye (k), face (w) toward +x, hair behind.
  // The renderer mirrors this (flipX) for leftward movement.
  side: [
    "................",
    "................",
    ".....yyyyy......",
    "....yyyyyyyy....",
    "....ywwwwwy.....",
    "....ywwwwk.y....",
    "....yywwww......",
    "....rrrrr.......",
    "...rrrrrrr......",
    "...rrrrrrw......",
    "....r..rr.......",
    "....r...r.......",
    "....DDDD........",
    "....DDDD........",
    "................",
    "................",
  ],
  "side/walk-a": [
    "................",
    "................",
    ".....yyyyy......",
    "....yyyyyyyy....",
    "....ywwwwwy.....",
    "....ywwwwk.y....",
    "....yywwww......",
    "....rrrrr.......",
    "...rrrrrrr......",
    "...rrrrrrw......",
    "....r..rr.......",
    "...rr...r.......",
    "..DDD....DD.....",
    "..DD......D.....",
    "................",
    "................",
  ],
  "side/walk-b": [
    "................",
    "................",
    ".....yyyyy......",
    "....yyyyyyyy....",
    "....ywwwwwy.....",
    "....ywwwwk.y....",
    "....yywwww......",
    "....rrrrr.......",
    "...rrrrrrr......",
    "...rrrrrrw......",
    "....r..rr.......",
    "....rr..r.......",
    ".....DDDD.......",
    ".....DD.DD......",
    "................",
    "................",
  ],
};

// ── Pip (player) down-facing base frames ─────────────────────────────────────
// The four AI farmers author their DOWN idle + walk frames explicitly above.
// Pip's are generated from the conservative down templates via the same per-
// personality substitution (pip = gold hair + green tunic). The up/side facing
// and all action poses were already generated for pip in the loops above (pip is
// a PERSONALITY_SUBS key); only these three front-facing frames remained.
export const PIP_DOWN_TEMPLATES: Record<string, readonly string[]> = {
  "": [
    "................",
    "................",
    ".....yyyyy......",
    "....yyyyyyy.....",
    "....ywwwwwy.....",
    "....yk.w.ky.....",
    "....yywwwy......",
    "....rrrrr.......",
    "...rrrrrrr......",
    "...rrwwwrr......",
    "....r...r.......",
    "....r...r.......",
    "...DDD.DDD......",
    "...DDD.DDD......",
    "................",
    "................",
  ],
  "/walk-a": [
    "................",
    "................",
    ".....yyyyy......",
    "....yyyyyyy.....",
    "....ywwwwwy.....",
    "....yk.w.ky.....",
    "....yywwwy......",
    "....rrrrr.......",
    "...rrrrrrr......",
    "...rrwwwrr......",
    "....r...r.......",
    "....r...r.......",
    "..DDD...DDD.....",
    "..DDD...DDD.....",
    "................",
    "................",
  ],
  "/walk-b": [
    "................",
    "................",
    ".....yyyyy......",
    "....yyyyyyy.....",
    "....ywwwwwy.....",
    "....yk.w.ky.....",
    "....yywwwy......",
    "....rrrrr.......",
    "...rrrrrrr......",
    "...rrwwwrr......",
    "....r...r.......",
    "....r...r.......",
    "....DDD.DDD.....",
    "....DDD.DDD.....",
    "................",
    "................",
  ],
};

// ── NPC work poses (blacksmith hammer, carpenter saw) ────────────────────────
// The blacksmith and carpenter NPCs cycle between their props playing these
// poses. Authored as standalone frames (not personality-substituted) — the NPCs
// have their own look. Two frames each for a simple up/down or push/pull swing.
//
// Blacksmith: apron (D), hammer with stone head (m handle, Q head).
// Carpenter:  green tunic (G/g), handsaw (q blade, m handle).
export const NPC_POSES: PixelRecipe[] = [
  // Blacksmith idle — standing, hands at sides, no tool. Used while walking
  // between stations and while tending a station that has no swing pose (e.g.
  // the oven), so the NPC always reads as a person, never the building sprite.
  {
    name: "npc/blacksmith/idle",
    size: 16,
    pixels: [
      "................",
      ".....kkkkk......",
      "....kkkkkkk.....",
      "....kwwwwwk.....",
      "....kw.w.kk.....",
      "....kkwwwk......",
      "....DDDDD.......",
      "...DDDDDDD......",
      "...DDwwwDD......",
      "....D...D.......",
      "....D...D.......",
      "...mmm.mmm......",
      "...mmm.mmm......",
      "................",
      "................",
      "................",
    ],
  },
  // Carpenter idle — standing, hands at sides, no tool (see blacksmith idle).
  {
    name: "npc/carpenter/idle",
    size: 16,
    pixels: [
      "................",
      ".....GGGGG......",
      "....GGGGGGG.....",
      "....GwwwwwG.....",
      "....Gw.w.GG.....",
      "....GGwwwG......",
      "....ggggg.......",
      "...ggggggg......",
      "...ggwwwgg......",
      "....g...g.......",
      "....g...g.......",
      "...DDD.DDD......",
      "...DDD.DDD......",
      "................",
      "................",
      "................",
    ],
  },
  // Blacksmith hammer raised.
  {
    name: "npc/blacksmith/hammer-a",
    size: 16,
    pixels: [
      "................",
      ".....kkkkk....Q.",
      "....kkkkkkk..QQ.",
      "....kwwwwwk..m..",
      "....kw.w.kk..m..",
      "....kkwwwk..m...",
      "....DDDDD..m....",
      "...DDDDDDDm.....",
      "...DDwwwDD......",
      "....D...D.......",
      "....D...D.......",
      "...mmm.mmm......",
      "...mmm.mmm......",
      "................",
      "................",
      "................",
    ],
  },
  // Blacksmith hammer struck down on the anvil.
  {
    name: "npc/blacksmith/hammer-b",
    size: 16,
    pixels: [
      "................",
      ".....kkkkk......",
      "....kkkkkkk.....",
      "....kwwwwwk.....",
      "....kw.w.kk.....",
      "....kkwwwk......",
      "....DDDDD.......",
      "...DDDDDDDm.....",
      "...DDwwwDDmm....",
      "....D...Dmm.Q...",
      "....D...D..QQ...",
      "...mmm.mmm......",
      "...mmm.mmm......",
      "................",
      "................",
      "................",
    ],
  },
  // Carpenter saw pushed forward.
  {
    name: "npc/carpenter/saw-a",
    size: 16,
    pixels: [
      "................",
      ".....GGGGG......",
      "....GGGGGGG.....",
      "....GwwwwwG.....",
      "....Gw.w.GG.....",
      "....GGwwwG......",
      "....ggggg.......",
      "...ggggggg.qqqq.",
      "...ggwwwggmqqqq.",
      "....g...g.m.....",
      "....g...g.......",
      "...DDD.DDD......",
      "...DDD.DDD......",
      "................",
      "................",
      "................",
    ],
  },
  // Carpenter saw pulled back.
  {
    name: "npc/carpenter/saw-b",
    size: 16,
    pixels: [
      "................",
      ".....GGGGG......",
      "....GGGGGGG.....",
      "....GwwwwwG.....",
      "....Gw.w.GG.....",
      "....GGwwwG......",
      "....ggggg.......",
      "...ggggggqqqq...",
      "...ggwwwgmqqq...",
      "....g..ggm......",
      "....g...g.......",
      "...DDD.DDD......",
      "...DDD.DDD......",
      "................",
      "................",
      "................",
    ],
  },

  // ── brief 44 — tavern barkeep NPC ────────────────────────────────────────────
  // Barkeep idle — apron-clad figure behind the bar (cream apron `w`, wood-dark
  // `D` body, near-black `k` hair), mirroring the blacksmith/carpenter idle build.
  {
    name: "npc/barkeep/idle",
    size: 16,
    pixels: [
      "................",
      ".....kkkkk......",
      "....kkkkkkk.....",
      "....kwwwwwk.....",
      "....kw.w.kk.....",
      "....kkwwwk......",
      "....rrrrr.......",
      "...rrrrrrr......",
      "...rrwwwrr......",
      "....w...w.......",
      "....w...w.......",
      "...DDD.DDD......",
      "...DDD.DDD......",
      "................",
      "................",
      "................",
    ],
  },
  // Barkeep pouring a drink (mug raised) — pour-a.
  {
    name: "npc/barkeep/pour-a",
    size: 16,
    pixels: [
      "................",
      ".....kkkkk......",
      "....kkkkkkk.....",
      "....kwwwwwk.....",
      "....kw.w.kk.....",
      "....kkwwwk..o...",
      "....rrrrr..oo...",
      "...rrrrrrroo....",
      "...rrwwwrr......",
      "....w...w.......",
      "....w...w.......",
      "...DDD.DDD......",
      "...DDD.DDD......",
      "................",
      "................",
      "................",
    ],
  },
  // Barkeep setting the mug down — pour-b.
  {
    name: "npc/barkeep/pour-b",
    size: 16,
    pixels: [
      "................",
      ".....kkkkk......",
      "....kkkkkkk.....",
      "....kwwwwwk.....",
      "....kw.w.kk.....",
      "....kkwwwk......",
      "....rrrrr.......",
      "...rrrrrrr.o....",
      "...rrwwwrroo....",
      "....w...woo.....",
      "....w...w.......",
      "...DDD.DDD......",
      "...DDD.DDD......",
      "................",
      "................",
      "................",
    ],
  },
  // ── brief 44 — tavern building ───────────────────────────────────────────────
  // Tavern — a timber-and-plaster public house: cream plaster walls (`w`), wood
  // beams (`D`/`M`), a warm gold-lit doorway (`o`), red-rust roof (`r`).
  {
    name: "structure/tavern",
    size: 16,
    pixels: [
      "................",
      "...rrrrrrrrrr...",
      "..rrrrrrrrrrrr..",
      "..MwwwwwwwwwwM..",
      "..MwDwwwwwDwwM..",
      "..MwwwwwwwwwwM..",
      "..MwDwwwwwDwwM..",
      "..MwwwoooowwwM..",
      "..MwwwoooowwwM..",
      "..MMMMooooMMMM..",
      ".....oooo.......",
      ".....oooo.......",
      "....MMMMMM......",
      "................",
      "................",
      "................",
    ],
  },

  // ── brief 42 — livestock pens ────────────────────────────────────────────────
  {
    // Coop — a small wooden hen-house. D=wood-dark, d=wood-light, w=cream roof,
    // y=yellow straw floor, k=dark detail.
    name: "structure/coop",
    size: 16,
    pixels: [
      "................",
      "....wwwwwwww....",
      "...wDDDDDDDDw...",
      "...DddddddddD...",
      "...DddkkdkddD...",
      "...Ddd..d.ddD...",
      "...DdddddddD....",
      "...DyyyyyyDD....",
      "...DyyyyyyyyD...",
      "...DDDDDDDDD....",
      ".....DD..DD.....",
      ".....DD..DD.....",
      "................",
      "................",
      "................",
      "................",
    ],
  },
  {
    // Barn — a larger red+wood barn. r=red, D=wood-dark, d=wood-light, w=cream,
    // W=tan/hay, k=detail.
    name: "structure/barn",
    size: 16,
    pixels: [
      "................",
      "....rrrrrrrr....",
      "...rrrrrrrrrr...",
      "...rDDDDDDDDr...",
      "...rDwwwwwwDr...",
      "...rDwkwwkwDr...",
      "...rDwwwwwwDr...",
      "...rDDDDDDDDr...",
      "...rWWWWWWWrr...",
      "...rrrrrrrrrr...",
      ".....DD..DD.....",
      ".....DD..DD.....",
      ".....DD..DD.....",
      "................",
      "................",
      "................",
    ],
  },

  // ── brief 43 — greenhouse ─────────────────────────────────────────────────────
  {
    // Greenhouse — a compact glasshouse on a single farm tile (16×16, like the
    // pens): pale structure-blue glass panes (s) in a darker frame (S), a green
    // hint of crops under glass (g), a cream sill (w), and a small wooden door
    // (D/d). Single-tile so it spawns + renders cleanly alongside pens/orchards.
    name: "structure/greenhouse",
    size: 16,
    pixels: [
      ".......SS.......",
      "......SssS......",
      ".....SssssS.....",
      "....SssssssS....",
      "...SssggggssS...",
      "..SssgGGggssS...",
      "..SsssgggsssS...",
      "..SssSsssSssS...",
      "..SsssssssssS...",
      "..SssSsssSssS...",
      "..SssssssssssS..",
      "..SwwwwDDwwwwS..",
      "..SwwwwDdwwwwS..",
      "..SwwwwDdwwwwS..",
      "..SSSSSDdSSSSS..",
      "...kkkkkkkkk....",
    ],
  },
  {
    // Greenhouse floor — a tilled bed under glass. Tan/cream soil border (w) with
    // dark furrows (D/d), a hint of glass-blue tint (s) at the corners so it reads
    // as "indoor" vs the open-field dirt plot. 16×16 ground tile.
    name: "tile/greenhouse-floor",
    size: 16,
    pixels: [
      "swwwwwwwwwwwwwws",
      "wDddddddddddddDw",
      "wdDDDDDDDDDDDDdw",
      "wdDddddddddddDdw",
      "wdDdDDDDDDDDdDdw",
      "wdDdDddddddDdDdw",
      "wdDdDdDDDDdDdDdw",
      "wdDdDdDddDdDdDdw",
      "wdDdDdDddDdDdDdw",
      "wdDdDdDDDDdDdDdw",
      "wdDdDddddddDdDdw",
      "wdDdDDDDDDDDdDdw",
      "wdDddddddddddDdw",
      "wdDDDDDDDDDDDDdw",
      "wDddddddddddddDw",
      "swwwwwwwwwwwwwws",
    ],
  },

  // ── brief 42 — orchard / fruit trees ────────────────────────────────────────
  {
    // Fruit tree sapling (just planted, immature). l=leaf-dark, m=trunk.
    name: "structure/fruit-tree-sapling",
    size: 16,
    pixels: [
      "................",
      "................",
      "................",
      "................",
      "................",
      ".......l........",
      "......lll.......",
      ".......l........",
      ".......m........",
      ".......m........",
      "......mmm.......",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
  },
  {
    // Fruit tree growing (half-mature). l/L=leaves, m=trunk.
    name: "structure/fruit-tree-growing",
    size: 16,
    pixels: [
      "................",
      "................",
      "................",
      "......lll.......",
      ".....lLlll......",
      "....lllllll.....",
      ".....lLlll......",
      "......lll.......",
      ".......m........",
      "......mmm.......",
      ".....mmmmm......",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
  },
  {
    // Fruit tree mature — apple (laden with orange fruit). l/L=leaves, o=fruit, m=trunk.
    name: "structure/fruit-tree-mature",
    size: 16,
    pixels: [
      "................",
      "......lll.......",
      ".....lLlll......",
      "....llolooll....",
      "...lllolollll...",
      "....llolooll....",
      ".....lololl.....",
      "......lll.......",
      "......mmm.......",
      ".....mmmmm......",
      "......mmm.......",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
  },

  // ── brief 42 — animal sprites ────────────────────────────────────────────────
  {
    // Chicken — small, side view. y=yellow, w=white feathers, k=dark, o=beak.
    name: "animal/chicken",
    size: 16,
    pixels: [
      "................",
      "................",
      "................",
      "......yyy.......",
      ".....ywwwy......",
      "....ywwwwwy.....",
      "....ywwwkwy.....",
      "....ywwwwwy.....",
      ".....ywwwy......",
      "......oyyy......",
      ".......yy.......",
      ".......yy.......",
      "................",
      "................",
      "................",
      "................",
    ],
  },
  {
    // Cow — blocky, side view. w=white, k=black spots, D=dark hooves.
    name: "animal/cow",
    size: 16,
    pixels: [
      "................",
      "................",
      "....wwwwwwww....",
      "...wwwwkwwwww...",
      "...wwwkkkwwww...",
      "...wwwwwwwwww...",
      "...wwwwwwwwww...",
      "...wwwwkwwwww...",
      "....wwwwwwww....",
      ".....ww..ww.....",
      ".....ww..ww.....",
      ".....DD..DD.....",
      "................",
      "................",
      "................",
      "................",
    ],
  },
  {
    // Sheep — fluffy, side view. q=wool-light, Q=wool-dark, k=face, D=legs.
    name: "animal/sheep",
    size: 16,
    pixels: [
      "................",
      "................",
      "....qqqqqqqq....",
      "...qqQqQqQqqq...",
      "...qqqqqqqqkq...",
      "...qQqQqQqkkq...",
      "...qqqqqqqqkq...",
      "...qqQqQqQqqq...",
      "....qqqqqqqq....",
      ".....qq..qq.....",
      ".....qq..qq.....",
      ".....DD..DD.....",
      "................",
      "................",
      "................",
      "................",
    ],
  },

  // ── brief 42 — product icons ─────────────────────────────────────────────────
  {
    // Egg — oval, cream/white. w=cream, k=outline, T=shadow.
    name: "product/egg",
    size: 16,
    pixels: [
      "................",
      "................",
      "................",
      ".....kkkkk......",
      "....kwwwwwk.....",
      "....kwwwwwk.....",
      "....kwwwwwk.....",
      "....kwwwwwk.....",
      "....kTwwwwk.....",
      ".....kkkkk......",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
  },
  {
    // Milk bottle — white with a blue cap. w=white, s=cap, k=outline.
    name: "product/milk",
    size: 16,
    pixels: [
      "................",
      "................",
      "......kkk.......",
      ".....kssk.......",
      "....kwwwwk......",
      "...kwwwwwwk.....",
      "...kwwwwwwk.....",
      "...kwwwwwwk.....",
      "...kwwwwwwk.....",
      "...kwwwwwwk.....",
      "....kkkkkk......",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
  },
  {
    // Wool ball — fluffy grey ball. q=light, Q=dark, k=outline.
    name: "product/wool",
    size: 16,
    pixels: [
      "................",
      "................",
      "....kkkkkk......",
      "...kqQqQqQk.....",
      "...kQqQqQqk.....",
      "...kqQqQqQk.....",
      "...kQqQqQqk.....",
      "...kqQqQqQk.....",
      "....kkkkkk......",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
  },

  // ── brief 42 — fruit icons ────────────────────────────────────────────────────
  {
    // Apple — round red fruit. r=red, l=stem-leaf, k=outline.
    name: "fruit/apple",
    size: 16,
    pixels: [
      "................",
      "........l.......",
      "......kkkk......",
      ".....krrrrk.....",
      "....krrrrrrk....",
      "....krrrrrrk....",
      "....krrrrrrk....",
      "....krrrrrrk....",
      ".....krrrrk.....",
      "......kkkk......",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
  },
  {
    // Cherry — two red berries on a green stem. r=red, l=green stem, k=outline.
    name: "fruit/cherry",
    size: 16,
    pixels: [
      "................",
      "................",
      "........ll......",
      "......ll.l......",
      ".....l..........",
      "....kk....kk....",
      "...krrk..krrk...",
      "...krrk..krrk...",
      "....kk....kk....",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
  },

  // ── brief 46 — harbor sprites ────────────────────────────────────────────────

  // Dockmaster NPC idle — salty seafarer in a navy coat (S=structure-blue-dark,
  // s=structure-blue-lt) and a dark cap (k/M), cream face/hands (w), wood-dark
  // legs (D). Same 16×16 size + body proportions as npc/blacksmith/idle and
  // npc/barkeep/idle so it reads as the same NPC system.
  {
    name: "npc/dockmaster/idle",
    size: 16,
    pixels: [
      "................",
      ".....MMMMM......",
      "....MMMMMMM.....",
      "....MwwwwwM.....",
      "....Mw.w.MM.....",
      "....MMwwwM......",
      "....SSSSS.......",
      "...SSSSSSS......",
      "...SSwwwSS......",
      "....S...S.......",
      "....S...S.......",
      "...DDD.DDD......",
      "...DDD.DDD......",
      "................",
      "................",
      "................",
    ],
  },

  // Dock / pier — wooden planks over water. Plank-face (d=wood-light) with dark
  // seams (D) and beam supports (M/m) at the edges; ocean (v) peeks between the
  // support posts. Designed for a top-down read: rows of planks running left–right,
  // support beam row at bottom, ocean gaps between posts. EDG32 only.
  {
    name: "structure/dock",
    size: 16,
    pixels: [
      "vvvMMMMMMMMMvvvv",
      "vvvMdddddddMvvvv",
      "vvvMdDdDdDdMvvvv",
      "vvvMdddddddMvvvv",
      "vvvMdDdDdDdMvvvv",
      "vvvMdddddddMvvvv",
      "vvvMdDdDdDdMvvvv",
      "vvvMdddddddMvvvv",
      "vvvMMMMMMMMmvvvv",
      "vvvv.m...m.vvvvv",
      "vvvv.m...m.vvvvv",
      "vvvv.m...m.vvvvv",
      "vvvvvvvvvvvvvvvv",
      "vvvvvvvvvvvvvvvv",
      "vvvvvvvvvvvvvvvv",
      "vvvvvvvvvvvvvvvv",
    ],
  },

  // Cargo ship — a small single-tile merchant vessel viewed from above/side.
  // Hull: wood-dark (D/d) with a darker keel (M). Mast: wood post (m) with a
  // cream sail (w/W). A couple of brown cargo crates (D/d) on deck. Ocean (v)
  // peeks at the waterline edges. EDG32 only.
  {
    name: "structure/cargo-ship",
    size: 16,
    pixels: [
      "vvvvvvvvvvvvvvvv",
      "vvvvvvvvvvvvvvvv",
      "vvvvDDDDDDDDvvvv",
      "vvvDdddddddddvvv",
      "vvDddwwwwwwdddvv",
      "vvDddwwmwwwdddvv",
      "vvDddwwmwwwdddvv",
      "vvDddDDmDDddddvv",
      "vvDdddddmddddvvv",
      "vvvDddddmDDdvvvv",
      "vvvvDdddmddvvvvv",
      "vvvvvDDDMDDvvvvv",
      "vvvvvvvMvvvvvvvv",
      "vvvvvvvvvvvvvvvv",
      "vvvvvvvvvvvvvvvv",
      "vvvvvvvvvvvvvvvv",
    ],
  },
];
