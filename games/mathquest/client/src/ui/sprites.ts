/**
 * MateQuest M5 slice 3 — combat character sprites (Romanian-folklore creatures + the hero
 * Făt-Frumos), drawn as procedural pixel-art from rects + triangles, the SAME shape-composition
 * idiom the map screen (`ui/map-screen.ts`) uses for its scenery props. No sprite atlas / image
 * blit is involved — MateQuest's Canvas2D `UISurface` is rect + font-atlas only, so combat art is
 * composed the same way the map's pines/cottages/peaks are (and painted in a post-pass like
 * `combat-screen.ts`'s `drawBars`). Every colour is a `MATE_PAL` role (no raw hex — root CLAUDE.md).
 *
 * Convention: each `draw*` takes `(surface, cx, baseY, u)` where `cx` is the sprite's horizontal
 * centre, `baseY` its ground line (feet), and `u` a unit scale (≈2 → a ~45px-tall creature).
 * Enemies are authored FACING LEFT (toward the hero, who stands lower-left of them in the battle
 * scene); the hero is authored FACING RIGHT (toward the enemy).
 */
import type { UISurface } from "@engine/ui";
import type { EnemySprite } from "@mathquest/sim-core";
import { MATE_PAL } from "../render/mate-palette";

/** A vertical isosceles triangle grown UP from `baseY`, stacked as rows of rects (copy of
 * `map-screen.ts`'s `drawTriangle` — kept local so this module has no cross-UI dependency). */
function tri(s: UISurface, cx: number, baseY: number, halfBase: number, height: number, color: string, alpha = 1): void {
  const rows = Math.max(3, Math.round(height / 3));
  const rh = height / rows;
  for (let i = 0; i < rows; i++) {
    const w = halfBase * 2 * (1 - i / rows);
    s.rect(cx - w / 2, baseY - (i + 1) * rh, Math.max(2, w), rh + 1, color, alpha);
  }
}

/** Flat SE-offset ground shadow — the fake-height cue the map props use. */
function shadow(s: UISurface, cx: number, baseY: number, halfW: number): void {
  s.rect(cx - halfW + 3, baseY - 2, halfW * 2, 6, MATE_PAL.ink, 0.28);
  s.rect(cx - halfW * 0.7 + 3, baseY + 1, halfW * 1.4, 3, MATE_PAL.ink, 0.28);
}

// --- the hero: Făt-Frumos, facing RIGHT (sword raised, round shield) ------------------------------
export function drawHero(s: UISurface, cx: number, baseY: number, u: number): void {
  shadow(s, cx, baseY, 8 * u);
  // legs + boots
  s.rect(cx - 4 * u, baseY - 7 * u, 3 * u, 7 * u, MATE_PAL.navy);
  s.rect(cx + 1 * u, baseY - 7 * u, 3 * u, 7 * u, MATE_PAL.navy);
  s.rect(cx - 4.5 * u, baseY - 1.5 * u, 3.5 * u, 1.5 * u, MATE_PAL.black);
  s.rect(cx + 1 * u, baseY - 1.5 * u, 3.5 * u, 1.5 * u, MATE_PAL.black);
  // tunic
  s.rect(cx - 4.5 * u, baseY - 15 * u, 9 * u, 9 * u, MATE_PAL.blue);
  s.rect(cx - 4.5 * u, baseY - 9 * u, 9 * u, 3 * u, MATE_PAL.navy); // shaded hem
  s.rect(cx - 4.5 * u, baseY - 11 * u, 9 * u, 1.5 * u, MATE_PAL.gold); // belt
  // red cape flowing back-left
  s.rect(cx - 7 * u, baseY - 14 * u, 3 * u, 9 * u, MATE_PAL.rust);
  // head + hair (brown), face skin
  s.rect(cx - 3 * u, baseY - 21 * u, 6 * u, 6 * u, MATE_PAL.skin);
  s.rect(cx - 3.5 * u, baseY - 22 * u, 7 * u, 2 * u, MATE_PAL.wood);
  s.rect(cx - 3.5 * u, baseY - 21 * u, 1.5 * u, 4 * u, MATE_PAL.wood);
  s.rect(cx + 1 * u, baseY - 19 * u, 1.2 * u, 1.2 * u, MATE_PAL.black); // eye (facing right)
  // shield on the left arm (round-ish, rust with a boss)
  s.rect(cx - 8 * u, baseY - 14 * u, 4 * u, 7 * u, MATE_PAL.rust);
  s.rect(cx - 7.5 * u, baseY - 13 * u, 3 * u, 5 * u, MATE_PAL.clay);
  s.rect(cx - 6.5 * u, baseY - 11.5 * u, 1.5 * u, 1.5 * u, MATE_PAL.gold);
  // sword arm + blade raised up-right (gold guard, silver blade)
  s.rect(cx + 3.5 * u, baseY - 15 * u, 2 * u, 6 * u, MATE_PAL.skin);
  s.rect(cx + 3 * u, baseY - 17 * u, 5 * u, 1.5 * u, MATE_PAL.gold);
  s.rect(cx + 5 * u, baseY - 28 * u, 1.8 * u, 11 * u, MATE_PAL.silver);
  s.rect(cx + 5 * u, baseY - 28 * u, 1.8 * u, 3 * u, MATE_PAL.white); // blade glint
}

// --- enemies (all facing LEFT) -------------------------------------------------------------------

/** Zmeu family (baby/servant/elder) — a green dragon in side view: horizontal body on 4 legs, a
 * small folded wing, a tail, and a neck rising up-left to a horned, fire-nostrilled head. */
function drawDragon(s: UISurface, cx: number, baseY: number, u: number): void {
  shadow(s, cx, baseY, 11 * u);
  // tail (low, tapering right)
  s.rect(cx + 6 * u, baseY - 4.5 * u, 5 * u, 2.5 * u, MATE_PAL.greenDark);
  s.rect(cx + 10 * u, baseY - 4 * u, 3 * u, 2 * u, MATE_PAL.greenDark);
  tri(s, cx + 13 * u, baseY - 4 * u, 1.5 * u, 3 * u, MATE_PAL.green); // tail barb
  // horizontal body + belly shade
  s.rect(cx - 6 * u, baseY - 11 * u, 13 * u, 7 * u, MATE_PAL.greenMid);
  s.rect(cx - 6 * u, baseY - 6 * u, 13 * u, 2.5 * u, MATE_PAL.greenDark);
  // legs
  s.rect(cx - 4 * u, baseY - 4 * u, 3 * u, 4 * u, MATE_PAL.greenDark);
  s.rect(cx + 2 * u, baseY - 4 * u, 3 * u, 4 * u, MATE_PAL.greenDark);
  // small folded wing on the back (two nested triangles, not tree-sized)
  tri(s, cx + 1 * u, baseY - 11 * u, 4 * u, 7 * u, MATE_PAL.greenDark);
  tri(s, cx + 1 * u, baseY - 11 * u, 2.5 * u, 5 * u, MATE_PAL.green);
  // small back ridges
  s.rect(cx - 3 * u, baseY - 12 * u, 1.2 * u, 1.5 * u, MATE_PAL.green);
  s.rect(cx - 1 * u, baseY - 12 * u, 1.2 * u, 1.5 * u, MATE_PAL.green);
  // neck up-left + head
  s.rect(cx - 7 * u, baseY - 17 * u, 3.5 * u, 7 * u, MATE_PAL.greenMid); // neck
  s.rect(cx - 12 * u, baseY - 19 * u, 6 * u, 5 * u, MATE_PAL.greenMid); // head
  s.rect(cx - 14 * u, baseY - 17.5 * u, 3 * u, 3 * u, MATE_PAL.green); // snout
  s.rect(cx - 14 * u, baseY - 15.5 * u, 2 * u, 1 * u, MATE_PAL.orange); // fiery nostril
  tri(s, cx - 8 * u, baseY - 19 * u, 1.5 * u, 3.5 * u, MATE_PAL.cream); // horn
  s.rect(cx - 9.5 * u, baseY - 18 * u, 1.8 * u, 1.8 * u, MATE_PAL.red); // eye
}

/** Balaur — Romania's many-headed dragon: a squat teal body from which THREE distinct necks fan up,
 * each ending in a snouted, red-eyed head (snouts to the left). Bigger than the plain dragon. */
function drawBalaur(s: UISurface, cx: number, baseY: number, u: number): void {
  shadow(s, cx, baseY, 12 * u);
  // squat body + belly + tail
  s.rect(cx - 5 * u, baseY - 9 * u, 12 * u, 7 * u, MATE_PAL.teal);
  s.rect(cx - 5 * u, baseY - 4.5 * u, 12 * u, 2.5 * u, MATE_PAL.greenDark);
  s.rect(cx + 7 * u, baseY - 6 * u, 5 * u, 2.5 * u, MATE_PAL.teal);
  // legs
  s.rect(cx - 2 * u, baseY - 3 * u, 3 * u, 3 * u, MATE_PAL.greenDark);
  s.rect(cx + 3 * u, baseY - 3 * u, 3 * u, 3 * u, MATE_PAL.greenDark);
  // a head at (hx, headTopY): neck already drawn separately. Snout left, eye right.
  const head = (hx: number, hy: number): void => {
    s.rect(hx, hy, 5 * u, 4 * u, MATE_PAL.teal);
    s.rect(hx - 2 * u, hy + 1 * u, 2.5 * u, 2.5 * u, MATE_PAL.cyan); // snout (left)
    s.rect(hx + 3 * u, hy + 1 * u, 1.6 * u, 1.6 * u, MATE_PAL.red); // eye (right)
  };
  // neck A — up-left
  s.rect(cx - 4 * u, baseY - 16 * u, 2.5 * u, 8 * u, MATE_PAL.teal);
  head(cx - 8 * u, baseY - 20 * u);
  // neck B — straight up (tallest)
  s.rect(cx - 0.5 * u, baseY - 18 * u, 2.5 * u, 10 * u, MATE_PAL.teal);
  head(cx - 2 * u, baseY - 23 * u);
  // neck C — up-right (shortest)
  s.rect(cx + 3 * u, baseY - 15 * u, 2.5 * u, 8 * u, MATE_PAL.teal);
  head(cx + 2 * u, baseY - 19 * u);
}

/** Strigoi — a pale, floating undead in a tattered shroud, hollow glowing eyes. */
function drawStrigoi(s: UISurface, cx: number, baseY: number, u: number): void {
  shadow(s, cx, baseY, 6 * u);
  // wispy tattered lower body (no legs — it hovers)
  for (let i = -3; i <= 3; i++) {
    const h = (2 + ((i + 3) % 3)) * u;
    s.rect(cx + i * 2 * u, baseY - h, 1.8 * u, h, MATE_PAL.slate, 0.9);
  }
  // shroud body
  s.rect(cx - 6 * u, baseY - 15 * u, 12 * u, 9 * u, MATE_PAL.silver);
  s.rect(cx - 6 * u, baseY - 9 * u, 12 * u, 3 * u, MATE_PAL.slate); // shade
  // hunched shoulders + hood
  s.rect(cx - 5 * u, baseY - 21 * u, 10 * u, 7 * u, MATE_PAL.steel);
  tri(s, cx, baseY - 21 * u, 5 * u, 4 * u, MATE_PAL.steel); // hood peak
  // face cavity
  s.rect(cx - 3 * u, baseY - 19 * u, 6 * u, 4 * u, MATE_PAL.ink);
  s.rect(cx - 2.5 * u, baseY - 18 * u, 1.6 * u, 1.6 * u, MATE_PAL.yellow); // eye
  s.rect(cx + 0.5 * u, baseY - 18 * u, 1.6 * u, 1.6 * u, MATE_PAL.yellow); // eye
  // bony claw reaching left
  s.rect(cx - 8 * u, baseY - 12 * u, 3 * u, 1.5 * u, MATE_PAL.silver);
}

/** Vârcolac — a grey upright werewolf, fanged, clawed, ears + snout to the left. */
function drawVarcolac(s: UISurface, cx: number, baseY: number, u: number): void {
  shadow(s, cx, baseY, 8 * u);
  // digitigrade legs
  s.rect(cx - 4 * u, baseY - 6 * u, 3 * u, 6 * u, MATE_PAL.slate);
  s.rect(cx + 1 * u, baseY - 6 * u, 3 * u, 6 * u, MATE_PAL.slate);
  s.rect(cx - 5 * u, baseY - 1.5 * u, 2.5 * u, 1.5 * u, MATE_PAL.ink); // clawed foot
  s.rect(cx + 2.5 * u, baseY - 1.5 * u, 2.5 * u, 1.5 * u, MATE_PAL.ink);
  // torso (broad chest)
  s.rect(cx - 5 * u, baseY - 15 * u, 10 * u, 10 * u, MATE_PAL.steel);
  s.rect(cx - 5 * u, baseY - 15 * u, 10 * u, 3 * u, MATE_PAL.silver); // lit shoulders
  s.rect(cx - 3 * u, baseY - 12 * u, 6 * u, 5 * u, MATE_PAL.slate); // chest fur shade
  // arm + claw reaching left
  s.rect(cx - 8 * u, baseY - 13 * u, 3 * u, 6 * u, MATE_PAL.slate);
  s.rect(cx - 9 * u, baseY - 8 * u, 2 * u, 1.5 * u, MATE_PAL.white); // claws
  // head (wolf, facing left): snout + ears
  s.rect(cx - 6 * u, baseY - 21 * u, 7 * u, 6 * u, MATE_PAL.steel);
  s.rect(cx - 9 * u, baseY - 19 * u, 3 * u, 3 * u, MATE_PAL.slate); // snout
  s.rect(cx - 9 * u, baseY - 16.5 * u, 2.5 * u, 1 * u, MATE_PAL.white); // fangs
  tri(s, cx - 5 * u, baseY - 21 * u, 1.5 * u, 3 * u, MATE_PAL.steel); // ear
  tri(s, cx - 1 * u, baseY - 21 * u, 1.5 * u, 3 * u, MATE_PAL.steel); // ear
  s.rect(cx - 6 * u, baseY - 19 * u, 1.6 * u, 1.6 * u, MATE_PAL.gold); // eye
}

/** Căpcăun — a hulking brown ogre, one big eye, tusks, a heavy club. */
function drawCapcaun(s: UISurface, cx: number, baseY: number, u: number): void {
  shadow(s, cx, baseY, 11 * u);
  // stumpy legs
  s.rect(cx - 5 * u, baseY - 5 * u, 4 * u, 5 * u, MATE_PAL.woodDark);
  s.rect(cx + 1 * u, baseY - 5 * u, 4 * u, 5 * u, MATE_PAL.woodDark);
  // big hunched body
  s.rect(cx - 7 * u, baseY - 16 * u, 14 * u, 12 * u, MATE_PAL.wood);
  s.rect(cx - 7 * u, baseY - 16 * u, 14 * u, 3 * u, MATE_PAL.clay); // lit top
  s.rect(cx - 7 * u, baseY - 8 * u, 14 * u, 4 * u, MATE_PAL.woodDark); // belly shade
  // head (low, sunk into shoulders), facing left
  s.rect(cx - 6 * u, baseY - 22 * u, 8 * u, 7 * u, MATE_PAL.tan);
  s.rect(cx - 4 * u, baseY - 20 * u, 3 * u, 3 * u, MATE_PAL.gold); // one big eye
  s.rect(cx - 3 * u, baseY - 19 * u, 1.4 * u, 1.4 * u, MATE_PAL.black); // pupil
  s.rect(cx - 6 * u, baseY - 16 * u, 2 * u, 1.5 * u, MATE_PAL.white); // tusk
  s.rect(cx + 0 * u, baseY - 16 * u, 2 * u, 1.5 * u, MATE_PAL.white); // tusk
  // arm + big club to the left
  s.rect(cx - 9 * u, baseY - 14 * u, 3 * u, 8 * u, MATE_PAL.wood);
  s.rect(cx - 13 * u, baseY - 20 * u, 4 * u, 8 * u, MATE_PAL.woodDark); // club head
  s.rect(cx - 12 * u, baseY - 13 * u, 2 * u, 8 * u, MATE_PAL.woodDark); // club shaft
}

/** Muma Pădurii — the hunched forest hag: pointed hat, green face, robe, gnarled staff. */
function drawMuma(s: UISurface, cx: number, baseY: number, u: number): void {
  shadow(s, cx, baseY, 8 * u);
  // long robe (triangular)
  tri(s, cx, baseY, 8 * u, 16 * u, MATE_PAL.plum);
  s.rect(cx - 6 * u, baseY - 4 * u, 12 * u, 4 * u, MATE_PAL.bark); // hem shade
  // hunched back / shoulders
  s.rect(cx - 5 * u, baseY - 17 * u, 9 * u, 6 * u, MATE_PAL.mauve);
  // green hag face (facing left)
  s.rect(cx - 5 * u, baseY - 22 * u, 6 * u, 6 * u, MATE_PAL.greenMid);
  s.rect(cx - 7 * u, baseY - 20 * u, 2.5 * u, 2 * u, MATE_PAL.greenMid); // hooked nose
  s.rect(cx - 4 * u, baseY - 20 * u, 1.6 * u, 1.6 * u, MATE_PAL.yellow); // eye
  // pointy witch hat
  s.rect(cx - 6 * u, baseY - 23 * u, 8 * u, 1.5 * u, MATE_PAL.ink); // brim
  tri(s, cx - 2 * u, baseY - 23 * u, 4 * u, 9 * u, MATE_PAL.ink);
  // gnarled staff to the left with a glowing tip
  s.rect(cx - 9 * u, baseY - 20 * u, 1.5 * u, 20 * u, MATE_PAL.woodDark);
  s.rect(cx - 10 * u, baseY - 21 * u, 3 * u, 3 * u, MATE_PAL.orange);
  s.rect(cx - 9.5 * u, baseY - 20.5 * u, 1.5 * u, 1.5 * u, MATE_PAL.yellow);
}

/** Registry: `EnemyView.sprite` → its draw fn. */
export const ENEMY_SPRITE_DRAW: Record<EnemySprite, (s: UISurface, cx: number, baseY: number, u: number) => void> = {
  dragon: drawDragon,
  balaur: drawBalaur,
  strigoi: drawStrigoi,
  varcolac: drawVarcolac,
  capcaun: drawCapcaun,
  muma: drawMuma,
};
