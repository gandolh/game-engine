/**
 * Unit sprite recipes — villager + raider, authored as 32×32 GREY-RAMP
 * silhouettes at higher detail to match the iso 32-based building art. Drawn
 * with a per-instance tint (FSM-state color for villagers, red×strength for
 * raiders): the shader multiplies texture × tint, so a WHITE body becomes the
 * tint color and the DARK outline stays dark. Units stay upright (small figures
 * read fine billboarded on the iso grid). See quads.ts.
 *
 * ## The multiply-tint contract (do not break)
 * The body ramp must stay NEUTRAL GREY, darkest → lightest:
 *   `#` (black outline) → `S` (slate, deep shade) → `s` (steel, mid-shade)
 *     → `l` (silver, mid) → `v` (white, lit body)
 * Under `texture × tint`: the white `v` body takes the tint at full strength,
 * the darker greys take a proportionally darker tint (so the tint reads as
 * volume), and the `#` outline stays near-black regardless of tint. Adding the
 * 4th interior value (`s` steel, 2× fidelity pass 2026-07-02) deepens the
 * shading ramp WITHOUT tinting the ramp toward any hue — it must remain grey or
 * the multiply would bias every villager's job color. The head/skin gets a
 * WARM neutral kiss (`t` tan on the lit cheek, `w` wood on the shaded jaw) which
 * is small + off the tinted body, so faces read warm without muddying the tint.
 *
 * ## Animation (render-only, deterministic)
 * Villager + raider each get 3 frames — an idle/base pose plus two step poses
 * (`vil/person@1`, `vil/person@2`, `raider@1`, `raider@2`) — cycled on the
 * render clock by `unitFrameAt(clockMs)`, mirroring the mill sails' `millFrameAt`
 * (index.ts). Frames only nudge arms/legs/torso by ±1px (a gentle idle sway +
 * walk shuffle) so figures stop reading as static cutouts; no sim state, no RNG,
 * no wall-clock in the recipe itself (the caller passes `performance.now`). The
 * pedestrian stays single-frame (tiny background crowd; not worth the atlas).
 */
import { Grid } from "./draw";
import type { PixelRecipe } from "../types";

const SIZE = 32;

/**
 * A flattened ground CONTACT SHADOW ellipse centred at the figure's feet — the
 * same anchoring move the buildings got (2026-06-26 grounding pass), softened
 * (2026-07-02) to a FEATHERED SE-biased blob matching the building drop-shadow.
 * Drawn in the darkest ramp chars (`#` core / `S` rim) so that under any
 * per-instance multiply-tint it stays the darkest pixels and reads as shadow,
 * not body. The disc is nudged toward the SE (down-right) and its rim dithers
 * out progressively, echoing the buildings' NW-sun `(x+y)&1` shadow feathering.
 * `footY` is the row the feet stand on; `rx` the ellipse half-width.
 */
function footShadow(g: Grid, cx: number, footY: number, rx: number): void {
  const ry = Math.max(1, Math.round(rx * 0.45));
  // SE bias: shift the ellipse centre a touch down-right (low NW sun) so the
  // shadow pools away from the figure like the building drop-shadows.
  const ox = Math.max(1, Math.round(rx * 0.18));
  const oy = 1;
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      const nx = dx - ox;
      const ny = dy - oy;
      const rr = (nx * nx) / (rx * rx) + (ny * ny) / (ry * ry);
      if (rr > 1) continue;
      // Feathered rim: the outer band dithers out on the same `(x+y)&1` parity
      // the buildings use, and the very outermost band thins further (2-of-3
      // parity) so the edge fades softly instead of ending on a hard disc.
      const px = cx + dx;
      const py = footY + dy;
      if (rr > 0.78) {
        // Sparse outer feather (~1-of-3 kept) — the soft dissolve at the edge.
        if ((px * 2 + py) % 3 !== 0) continue;
        g.set(px, py, "S");
      } else if (rr > 0.5) {
        // Mid rim: 50% dither in the slate rim char.
        if ((px + py) & 1) continue;
        g.set(px, py, "S");
      } else {
        // Solid dark core.
        g.set(px, py, "#");
      }
    }
  }
}

/**
 * Paint a standing villager into `g` with a small per-frame pose offset.
 * `swayX` shifts the upper body (idle lean), `stepL`/`stepR` extend one leg
 * forward (walk shuffle) — all ±1px, purely cosmetic frame-to-frame nudges.
 */
function drawVillager(g: Grid, swayX: number, stepL: number, stepR: number): void {
  const cx = 16;
  footShadow(g, cx, 30, 7); // ground anchor (drawn first; body paints over)
  const hx = cx + swayX; // head/torso lean for the idle sway
  // Head (6 wide): 4-value grey ramp + a warm skin kiss so the face reads warm
  // without tinting the body ramp. lit `v` → mid `l` → shade `S` → outline `#`.
  g.fillRect(hx - 3, 4, 6, 6, "l");
  g.vLine(hx - 3, 4, 6, "v"); // lit highlight edge
  g.vLine(hx, 4, 6, "s");     // steel mid-shade band (4th ramp value)
  g.vLine(hx + 1, 4, 6, "S");
  g.vLine(hx + 2, 4, 6, "#"); // shaded right edge
  g.set(hx - 2, 5, "t");      // warm lit cheek (tan)
  g.set(hx - 1, 6, "t");
  g.set(hx + 1, 8, "w");      // warm shaded jaw (wood)
  g.set(hx - 1, 7, "#");      // eye
  g.set(hx + 1, 7, "#");
  // Torso / tunic (10 tall): four vertical value bands → reads round when tinted.
  g.fillRect(hx - 4, 11, 8, 10, "l");   // mid base
  g.vLine(hx - 4, 11, 10, "v");          // lit left highlight
  g.vLine(hx - 3, 11, 10, "v");
  g.vLine(hx + 1, 11, 10, "s");          // steel mid-shade band (4th value)
  g.vLine(hx + 2, 11, 10, "S");          // shaded
  g.vLine(hx + 3, 11, 10, "#");          // shaded-right edge
  g.hLine(hx - 4, 16, 8, "S"); // belt
  // Cluster dither on the lit/mid seam (one column) so the tunic rounds softly.
  for (let y = 11; y < 21; y++) if ((hx - 2 + y) & 1) g.set(hx - 2, y, "v");
  // Arms (lit left / shaded right).
  g.fillRect(hx - 6, 12, 2, 7, "l"); g.vLine(hx - 6, 12, 7, "v");
  g.fillRect(hx + 4, 12, 2, 7, "S"); g.vLine(hx + 5, 12, 7, "#");
  // Legs + feet — each leg gets a small forward step offset for the walk cycle.
  g.fillRect(cx - 3 + stepL, 21, 2, 8, "l"); g.vLine(cx - 3 + stepL, 21, 8, "v");
  g.fillRect(cx + 1 + stepR, 21, 2, 8, "S"); g.vLine(cx + 2 + stepR, 21, 8, "#");
  g.hLine(cx - 4 + stepL, 29, 3, "#");
  g.hLine(cx + 1 + stepR, 29, 3, "#");
}

/**
 * Paint a bulkier horned raider hefting an axe into `g` with a per-frame pose
 * offset (same idle-sway / walk-shuffle scheme as the villager).
 */
function drawRaider(g: Grid, swayX: number, stepL: number, stepR: number): void {
  const cx = 16;
  footShadow(g, cx, 30, 9); // wider anchor for the bulkier raider
  const hx = cx + swayX;
  // Horned helmet (4-value grey ramp: lit `v` → mid `l` → steel `s` → shade `S`/`#`).
  g.fillRect(hx - 4, 4, 8, 6, "l");
  g.vLine(hx - 4, 4, 6, "v");
  g.vLine(hx + 1, 4, 6, "s"); // steel mid-shade band (4th ramp value)
  g.vLine(hx + 2, 4, 6, "S");
  g.vLine(hx + 3, 4, 6, "#");
  g.set(hx - 6, 2, "l"); g.set(hx - 5, 3, "l"); // left horn
  g.set(hx + 5, 2, "l"); g.set(hx + 4, 3, "l"); // right horn
  g.hLine(hx - 3, 8, 6, "#"); // visor
  g.set(hx - 2, 6, "t");      // warm skin glimpsed under the visor brow
  // Broad torso: four value bands so the bulk reads round when tinted.
  g.fillRect(hx - 6, 11, 12, 10, "l");
  g.vLine(hx - 6, 11, 10, "v"); g.vLine(hx - 5, 11, 10, "v");
  g.vLine(hx + 3, 11, 10, "s"); // steel mid-shade band (4th value)
  g.vLine(hx + 4, 11, 10, "S"); g.vLine(hx + 5, 11, 10, "#");
  g.hLine(hx - 6, 17, 12, "#"); // belt
  // Cluster dither on the lit/mid seam so the broad chest rounds softly.
  for (let y = 11; y < 21; y++) if ((hx - 3 + y) & 1) g.set(hx - 3, y, "v");
  // Legs + feet (lit/shaded) — per-leg walk step offset.
  g.fillRect(cx - 4 + stepL, 21, 3, 8, "l"); g.vLine(cx - 4 + stepL, 21, 8, "v");
  g.fillRect(cx + 1 + stepR, 21, 3, 8, "S"); g.vLine(cx + 3 + stepR, 21, 8, "#");
  g.hLine(cx - 5 + stepL, 29, 4, "#");
  g.hLine(cx + 1 + stepR, 29, 4, "#");
  // Axe: haft down the right, blade up top (rides with the sway).
  g.vLine(hx + 8, 6, 16, "#");
  g.fillRect(hx + 6, 6, 4, 5, "l");
  g.set(hx + 6, 6, "v");
}

/**
 * Draw a ROLE-defining accessory onto a villager `g` (art-05), riding the same
 * `swayX` the body leans by so it animates with the figure. Accessories add
 * opaque pixels OUTSIDE the base body mask (a held tool / hat / robe) so the role
 * reads by SILHOUETTE before the job tint even applies. Tool/skin chars use their
 * OWN warm/neutral EDG colours (NOT the grey body ramp) so the multiply-tint that
 * colours the tunic never biases them — exactly the contract the head skin-kiss
 * already follows. `cx=16` is the figure centre; the body head sits ~rows 4–10,
 * torso ~11–21, so accessories anchor off those.
 */
function drawRoleAccessory(g: Grid, role: string, swayX: number): void {
  const hx = 16 + swayX;
  switch (role) {
    case "farmer": {
      // Straw HAT: a wide tan brim over the head + a hoe shaft held at the side.
      g.hLine(hx - 5, 4, 10, "O"); g.hLine(hx - 4, 3, 8, "y"); // brim (gold) + crown (yellow)
      g.set(hx - 5, 4, "w"); g.set(hx + 4, 4, "w");            // brim shadow tips
      g.vLine(hx + 7, 10, 14, "w"); g.hLine(hx + 6, 10, 3, "s"); // hoe haft + head
      break;
    }
    case "woodcutter": case "sawyer": {
      // AXE over the shoulder: a haft up the right + a steel head.
      g.vLine(hx + 7, 6, 16, "w"); g.fillRect(hx + 5, 5, 3, 4, "l"); g.set(hx + 5, 5, "v");
      break;
    }
    case "smith": {
      // Leather APRON (dark band over the torso) + a raised HAMMER.
      for (let y = 13; y < 21; y++) g.hLine(hx - 3, y, 6, "%"); // apron (bark, off the tint)
      g.vLine(hx + 7, 4, 10, "w"); g.fillRect(hx + 6, 3, 3, 3, "s"); // hammer haft + head
      break;
    }
    case "priest": case "healer": {
      // Hooded ROBE: a peaked hood over the head + a robe hem widening the base.
      g.set(hx - 1, 2, "v"); g.set(hx, 2, "v"); g.hLine(hx - 2, 3, 5, "l"); // hood peak
      g.hLine(hx - 5, 27, 11, "v"); g.hLine(hx - 4, 28, 9, "l");            // wide robe hem
      break;
    }
    case "watchman": case "soldier": {
      // SPEAR up the right side + a small crest on the helm.
      g.vLine(hx + 7, 2, 22, "w"); g.set(hx + 7, 2, "l"); g.set(hx + 7, 3, "s"); // shaft + tip
      g.set(hx - 1, 2, "e"); g.set(hx, 2, "e");  // red helm crest
      break;
    }
    case "trader": {
      // Shoulder PACK: a bulky bundle on the back (left) + a shoulder strap.
      g.fillRect(hx - 8, 12, 4, 7, "w"); g.hLine(hx - 8, 12, 4, "t"); // pack (wood/tan)
      g.set(hx - 4, 13, "%"); g.set(hx + 2, 12, "%");                  // strap
      break;
    }
    default: break; // no accessory → plain body (miller/quarryman/miner/idle)
  }
}

/**
 * Per-frame pose parameters — a gentle idle sway + a 2-beat walk shuffle.
 * Frame 0 is the neutral/base pose (referenced as the un-suffixed frame name).
 */
interface UnitPose { swayX: number; stepL: number; stepR: number }
const UNIT_POSES: readonly UnitPose[] = [
  { swayX: 0, stepL: 0, stepR: 0 },   // 0 — idle / mid-stride
  { swayX: 1, stepL: 1, stepR: 0 },   // 1 — lean right, left foot forward
  { swayX: -1, stepL: 0, stepR: 1 },  // 2 — lean left, right foot forward
];

/** Number of animation frames each of the two main figures carries. */
export const UNIT_FRAME_COUNT = UNIT_POSES.length;

/** Base (un-suffixed) frame names for the tinted figures, referenced from quads.ts. */
export const FRAME_VILLAGER = "vil/person";
export const FRAME_RAIDER = "raider";
/** Frame name for the small ambient-crowd commoner (clothing-tinted billboard). */
export const FRAME_PEDESTRIAN = "vil/pedestrian";

/** Frame name for villager pose `i` (0 → the base `vil/person`). */
export function villagerFrameName(i: number): string {
  return i === 0 ? FRAME_VILLAGER : `${FRAME_VILLAGER}@${i}`;
}
/** Frame name for raider pose `i` (0 → the base `raider`). */
export function raiderFrameName(i: number): string {
  return i === 0 ? FRAME_RAIDER : `${FRAME_RAIDER}@${i}`;
}

/**
 * Villager JOBS that carry a role-defining silhouette accessory (art-05). A job
 * NOT in this set draws the plain body (miller/quarryman/miner/idle read by tint
 * alone — they have no strong iconographic prop). Kept small so the atlas only
 * grows for roles that actually gain a silhouette. `sawyer`→axe, `healer`→robe
 * reuse the woodcutter/priest accessory.
 */
export const ROLE_ACCESSORY_JOBS: readonly string[] = [
  "farmer", "woodcutter", "sawyer", "smith", "priest", "healer", "watchman", "soldier", "trader",
];

/** Frame-name prefix for a role villager: `vil/<role>` (+ `@i` for pose i>0). */
export function villagerRoleFrameName(role: string, i: number): string {
  const base = `vil/${role}`;
  return i === 0 ? base : `${base}@${i}`;
}

/**
 * Resolve the frame-name family for a villager of `job`: a role-accessory family
 * (`vil/<job>`) when the job has one, else the plain `vil/person` family. Returns
 * a `(poseIndex) => frameName` fn for `unitFrameAt`. quads.ts calls this so it
 * never requests an unbaked frame (only ROLE_ACCESSORY_JOBS have role recipes).
 */
export function villagerNameForJob(job: string): (i: number) => string {
  if (ROLE_ACCESSORY_JOBS.includes(job)) return (i) => villagerRoleFrameName(job, i);
  return villagerFrameName;
}

function villagerFrames(): PixelRecipe[] {
  const plain = UNIT_POSES.map((p, i) => {
    const g = new Grid(SIZE, SIZE);
    drawVillager(g, p.swayX, p.stepL, p.stepR);
    return g.toRecipe(villagerFrameName(i));
  });
  // Role frames: the same body + walk cycle, plus each role's accessory.
  const roleFrames = ROLE_ACCESSORY_JOBS.flatMap((role) =>
    UNIT_POSES.map((p, i) => {
      const g = new Grid(SIZE, SIZE);
      drawVillager(g, p.swayX, p.stepL, p.stepR);
      drawRoleAccessory(g, role, p.swayX);
      return g.toRecipe(villagerRoleFrameName(role, i));
    }),
  );
  return [...plain, ...roleFrames];
}

function raiderFrames(): PixelRecipe[] {
  return UNIT_POSES.map((p, i) => {
    const g = new Grid(SIZE, SIZE);
    drawRaider(g, p.swayX, p.stepL, p.stepR);
    return g.toRecipe(raiderFrameName(i));
  });
}

/**
 * A small 16×16 commoner for the ambient road crowd. ONE shared base figure: a
 * skin (`k`) head + hands, a WHITE (`v`) tunic body, and dark (`#`/`S`)
 * trousers/boots. Only the tunic is white, so the per-instance clothing tint
 * (texture × tint) recolors the SHIRT strongly while the skin and boots stay
 * roughly fixed — a few dozen pedestrians sharing this sprite read as a diverse
 * crowd just by varying that tint. Half the resolution of the 32px villager, so
 * the figures read as smaller background folk. Single-frame by design (kept off
 * the walk-cycle: dozens on screen, and the atlas budget isn't worth a nudge).
 */
function pedestrian(): PixelRecipe {
  const g = new Grid(16, 16);
  const cx = 8;
  footShadow(g, cx, 15, 4); // small ground anchor for the background commoner
  // Head (4 wide) — skin, with a warm mid + a 1px darker shaded right edge.
  g.fillRect(cx - 2, 2, 4, 4, "k");
  g.set(cx - 2, 2, "t");      // warm lit cheek (tan)
  g.vLine(cx + 1, 2, 4, "K"); // shaded right of face
  g.set(cx - 1, 4, "#"); // eye
  // Tunic / torso (6 tall) — WHITE so the clothing tint colors it, 4-value ramp.
  g.fillRect(cx - 3, 6, 6, 6, "v");
  g.vLine(cx - 3, 6, 6, "l"); // lit left highlight
  g.vLine(cx + 1, 6, 6, "s"); // steel mid-shade band (4th ramp value)
  g.vLine(cx + 2, 6, 6, "S"); // shaded right
  // Arms with skin hands at the cuff.
  g.vLine(cx - 4, 7, 4, "v"); g.set(cx - 4, 10, "k");
  g.vLine(cx + 3, 7, 4, "v"); g.set(cx + 3, 10, "k");
  // Legs + feet — dark trousers, darker boots.
  g.fillRect(cx - 2, 12, 2, 3, "S");
  g.fillRect(cx + 1, 12, 2, 3, "S");
  g.hLine(cx - 2, 14, 2, "#"); // left boot
  g.hLine(cx + 1, 14, 2, "#"); // right boot
  return g.toRecipe("vil/pedestrian");
}

export const UNIT_RECIPES: readonly PixelRecipe[] = [
  ...villagerFrames(),
  ...raiderFrames(),
  pedestrian(),
];

/**
 * Resolve a figure's animated pose frame for a render-clock value `clockMs`.
 * Cycles through the `UNIT_FRAME_COUNT` idle-sway / walk-shuffle poses at
 * ~`periodMs` per full loop. Render-only (the caller passes performance.now) —
 * never the sim; mirrors `millFrameAt` (index.ts). `nameFor` maps a pose index
 * to that figure's frame name (`villagerFrameName` / `raiderFrameName`), so the
 * caller picks the right family:
 *   unitFrameAt(now, villagerFrameName)  → a villager frame
 *   unitFrameAt(now, raiderFrameName)    → a raider frame
 * A per-instance `phaseMs` offset (e.g. derived from the entity id) staggers the
 * crowd so they don't all step in lockstep.
 */
export function unitFrameAt(
  clockMs: number,
  nameFor: (i: number) => string,
  periodMs = 900,
  phaseMs = 0,
): string {
  const t = clockMs + phaseMs;
  const phase = (((t % periodMs) + periodMs) % periodMs) / periodMs; // 0..1
  const i = Math.floor(phase * UNIT_FRAME_COUNT) % UNIT_FRAME_COUNT;
  return nameFor(i);
}
