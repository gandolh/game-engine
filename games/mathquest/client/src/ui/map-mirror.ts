/**
 * MateQuest — the spatial map's DOM accessibility mirror (audit-52).
 *
 * ## Why this exists at all
 *
 * When M3.1 replaced the flexbox map with the custom-drawn spatial map, the screen stopped being a
 * retained `@engine/ui` widget tree — and its accessibility mirror went with it. `main.ts` records
 * the gap ("a full DOM mirror for the spatial map is a known follow-up"), and every OTHER MateQuest
 * screen (combat, level-up, loot, run-won, run-lost) still mirrors.
 *
 * That matters more here than it would elsewhere. MateQuest is a children's educational game whose
 * UI is **entirely in-canvas**, so the DOM mirror *is* the screen reader — there is no fallback
 * markup behind it. And node choice is the roguelike's **only strategic decision**, which was
 * reachable solely by sighted pointer or by memorising the undocumented `1`..`9`/Enter bindings.
 * The regression arrived via a visual polish pass, which is the shape worth noticing, not just the
 * instance.
 *
 * ## Why it is not a widget mirror
 *
 * The map is not a widget tree, so this cannot fold into `computeLayout`/`createA11yMirror`. It is
 * produced from the map's OWN model — `RunView.reachableIds`, each node's type/grade/zone, and the
 * run's progress — and re-synced whenever that model changes. `@engine/ui`'s `a11y/mirror.ts` is
 * deliberately untouched: bending the shared widget mirror around one game's custom screen would
 * need its own brief.
 *
 * `main.ts` keeps `currentWidgetRoot()` returning `null` in map mode. That is correct and separate:
 * it stops a stray widget hit-test firing, and has nothing to do with this mirror.
 *
 * ## What it says, and why that is the hard part
 *
 * A mirror that lists N unlabelled buttons passes an automated check and helps nobody. A sighted
 * player reads four things off the drawing — what KIND of place each node is, how HARD it is, which
 * ZONE it sits in, and where they are in the run — so each button carries all four, and a status
 * line carries the run state. The labels come from `legendLabel`/`gradeLabel` rather than
 * `nodeLabel`, whose glyph prefixes (†, ★, ♥, ♠) a screen reader announces as symbol names.
 *
 * Both locales, like every other MateQuest string: the `Strings` object is passed in, never
 * hardcoded, and Romanian remains the default.
 */
import type { Grade, NodeType, RunView } from "@mathquest/sim-core";
import type { Strings } from "../strings";

/** The visually-hidden, AT-visible style — mirrors `@engine/ui`'s `SR_ONLY` exactly.
 *  NOT `display:none`/`visibility:hidden`: both would remove the subtree from the accessibility
 *  tree and the tab order, which is the opposite of the point. No colours, so the palette guard is
 *  satisfied — this is pure geometry/overflow. */
const SR_ONLY: Record<string, string> = {
  position: "absolute",
  width: "1px",
  height: "1px",
  margin: "-1px",
  padding: "0",
  border: "0",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
};

export interface MapMirror {
  /**
   * Re-sync the mirror. Cheap to call every frame — it no-ops unless the model changed.
   *
   * `order` MUST be `mapScreen.reachableOrder(run)`, the same sequence the `1`..`9` key bindings
   * index into. Taking it as a parameter rather than re-deriving it from `run.reachableIds` is the
   * point: a mirror whose spoken "path 2 of 3" selected a different node than pressing `2` would
   * be worse than no mirror at all, and re-deriving the order would make that drift possible.
   */
  update(run: RunView, strings: Strings, order: readonly number[]): void;
  /** Empty the mirror (leaving map mode), so a stale node list never lingers. */
  clear(): void;
  /** Remove everything this mirror added. */
  destroy(): void;
}

/** A node as the mirror needs it — resolved from the map model, not from any drawn geometry. */
interface MirrorNode {
  readonly id: number;
  readonly type: NodeType;
  readonly grade: Grade;
  readonly zoneIndex: number;
}

function resolve(run: RunView, order: readonly number[]): MirrorNode[] {
  const byId = new Map(run.map.nodes.map((n) => [n.id, n]));
  const out: MirrorNode[] = [];
  for (const id of order) {
    const n = byId.get(id);
    if (n === undefined) continue;
    out.push({ id: n.id, type: n.type, grade: n.grade, zoneIndex: n.zone });
  }
  return out;
}

/**
 * Create the map mirror under `mount`.
 *
 * `onChoose` receives a node id and must do exactly what a canvas click on that node does — the
 * mirror is a parallel ACCESS PATH to the same action, never a second implementation of it.
 */
export function createMapMirror(
  mount: HTMLElement,
  onChoose: (nodeId: number) => void,
): MapMirror {
  const doc = mount.ownerDocument;
  const region = doc.createElement("section");
  for (const [k, v] of Object.entries(SR_ONLY)) {
    (region.style as unknown as Record<string, string>)[k] = v;
  }
  // A landmark, so a screen reader can jump straight here rather than walking the page.
  region.setAttribute("role", "region");

  const heading = doc.createElement("h2");
  const status = doc.createElement("p");
  const instructions = doc.createElement("p");
  const list = doc.createElement("ul");
  // The list is the live surface: announce additions/changes without stealing focus.
  list.setAttribute("aria-live", "polite");
  region.append(heading, status, instructions, list);
  mount.appendChild(region);

  /** What the DOM currently reflects — so `update` can skip identical frames. */
  let renderedKey = "";

  function update(run: RunView, strings: Strings, order: readonly number[]): void {
    const nodes = resolve(run, order);
    const key = [
      strings.mapMirrorLabel,
      run.level, run.warriorHp, run.warriorMaxHp, run.visitedIds.length,
      ...nodes.map((n) => `${String(n.id)}:${n.type}:${String(n.grade)}:${String(n.zoneIndex)}`),
    ].join("|");
    if (key === renderedKey) return;
    renderedKey = key;

    region.setAttribute("aria-label", strings.mapMirrorLabel);
    heading.textContent = strings.mapMirrorLabel;
    status.textContent = strings.mapMirrorStatus(
      run.level,
      run.warriorHp,
      run.warriorMaxHp,
      run.visitedIds.length,
    );
    instructions.textContent = strings.mapMirrorInstructions(nodes.length);

    list.textContent = "";
    if (nodes.length === 0) {
      const li = doc.createElement("li");
      li.textContent = strings.mapMirrorNone;
      list.appendChild(li);
      return;
    }

    nodes.forEach((n, i) => {
      const li = doc.createElement("li");
      const btn = doc.createElement("button");
      btn.type = "button";
      // The SAME 1-based index the `1`..`9` key bindings use, so the spoken label and the keyboard
      // shortcut agree — a mirror that numbered them differently would be actively misleading.
      btn.textContent = strings.mapMirrorNode(
        i + 1,
        nodes.length,
        strings.zoneName[n.zoneIndex] ?? "",
        n.type,
        n.grade,
      );
      btn.addEventListener("click", () => { onChoose(n.id); });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function clear(): void {
    if (renderedKey === "") return;
    renderedKey = "";
    heading.textContent = "";
    status.textContent = "";
    instructions.textContent = "";
    list.textContent = "";
    region.removeAttribute("aria-label");
  }

  function destroy(): void {
    region.remove();
  }

  return { update, clear, destroy };
}
