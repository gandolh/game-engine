/**
 * Citadel build bar — the placement toolbar, rendered IN-CANVAS via `@engine/ui`
 * (replacing the DOM `#build-bar`). Part of the "all GUI in-game" DOM-overlay removal.
 *
 * Each button shows its `@engine/ui` icon ([engine/ui/src/icon/icons.ts](../../../../../engine/ui/src/icon/icons.ts))
 * centered, tinted by the shared `BUILD_ICON_RAMP` (`citadel-theme.ts`) — restoring the
 * compact icon-grid look the old emoji build bar had. The item's `label` string is kept and
 * still backs the button's accessible name + the hover-info text (see `hoverInfoFor`); it's
 * just not painted, since `button({ icon })` draws the icon INSTEAD of the label visually.
 *
 * The bar is a retained `@engine/ui` tree built ONCE; `refresh(state)` re-binds each button's
 * interaction state per frame (active = the selected tool; disabled = tier-locked or, in the
 * solo cozy economy, unaffordable) without re-allocating. Each button's `onActivate` calls
 * back into the host's existing placement-mode setters via `BuildBarActions` — the SAME code
 * the old DOM click handlers drove — so mouse, keyboard (Tab+Enter) and the a11y mirror share
 * one path. `hoverInfoFor(node)` returns the cost/tier text for a hovered button so the host
 * can show it (preserving the build-cost-on-hover affordance). Render/input only — no sim.
 */
import { box, panel, button, label } from "@engine/ui";
import type { ButtonNode, ContainerNode, LabelNode, UINode } from "@engine/ui";
import { TIER_LOCK, tierAtLeast, buildCost } from "@citadel/sim-core";
import type { SettlementTier } from "@citadel/sim-core";
import { BUILD_ICON_RAMP } from "./citadel-theme";

/** A standalone tool mode (vs. placing a building type). Mirrors `PlacementMode` minus "place". */
export type BuildTool = "road" | "wall" | "demolish" | "upgrade" | "none";

/** One toolbar entry: either places a building `type`, or selects a `tool` mode. */
type Item =
  | { readonly kind: "build"; readonly label: string; readonly type: string }
  | { readonly kind: "tool"; readonly label: string; readonly tool: BuildTool };

/** Concise constructors for the GROUPS table. */
const buildItem = (label: string, type: string): Item => ({ kind: "build", label, type });
const toolItem = (label: string, tool: BuildTool): Item => ({ kind: "tool", label, tool });

/**
 * The icon name for a toolbar entry. Every `build` item's `type` string is already one of
 * `@engine/ui`'s icon names (building types were named to match); every `tool` maps 1:1
 * EXCEPT `"none"`, which has no "none" icon and instead shows the `cancel` glyph (an X) —
 * it's the "leave placement mode" action, same as the button's own "Cancel" label.
 */
function iconNameFor(item: Item): string {
  if (isBuild(item)) return item.type;
  return item.tool === "none" ? "cancel" : item.tool;
}

/** The toolbar layout — category groups (mirrors the old DOM `#build-bar`). `label` backs the
 *  button's accessible name + hover text; the button itself renders `iconNameFor(item)`. */
const GROUPS: ReadonlyArray<{ readonly label: string; readonly items: ReadonlyArray<Item> }> = [
  { label: "Housing", items: [buildItem("House", "house"), buildItem("Store", "storehouse"), buildItem("Well", "well")] },
  { label: "Food", items: [buildItem("Farm", "farm"), buildItem("Mill", "mill"), buildItem("Bakery", "bakery"), buildItem("Wood", "woodcutter")] },
  { label: "Refine", items: [buildItem("Saw", "sawmill"), buildItem("Quarry", "quarry"), buildItem("Mine", "mine"), buildItem("Smith", "smith")] },
  { label: "Service", items: [
    buildItem("Hall", "town-hall"), buildItem("Chapel", "chapel"), buildItem("Market", "market"),
    buildItem("Watch", "watchpost"), buildItem("Trade", "tradingpost"), buildItem("Healer", "healer"),
    buildItem("Square", "public-square"),
  ] },
  { label: "Defense", items: [
    toolItem("Wall", "wall"), buildItem("Gate", "gate"), buildItem("Tower", "tower"), buildItem("Garrison", "garrison"), buildItem("Keep", "keep"),
  ] },
  { label: "Tools", items: [toolItem("Road", "road"), toolItem("Upgrade", "upgrade"), toolItem("Demolish", "demolish"), toolItem("Cancel", "none")] },
];

/** The live placement state the bar reflects (supplied each frame by the host). */
export interface BuildBarState {
  /** Current placement mode — drives which button reads as active. */
  readonly mode: "none" | "place" | "demolish" | "road" | "wall" | "upgrade";
  /** Selected building type (meaningful when `mode === "place"`). */
  readonly selectedType: string;
  /** Tier the owner has reached — gates tier-locked build buttons (mirrors the sim). */
  readonly peakTier: SettlementTier;
  /** Whether the solo build-cost economy is on (gates affordability disabling). */
  readonly chargeBuildCost: boolean;
  /** Live stockpile — affordability is checked against this. */
  readonly stockpiles: Readonly<Record<string, number>>;
}

/** Callbacks into the host's placement-mode setters (the SAME ones the DOM clicks drove). */
export interface BuildBarActions {
  /** Enter "place" mode for a building type. */
  selectBuild(type: string): void;
  /** Enter a standalone tool mode (road/wall/demolish/upgrade) or clear ("none"). */
  setTool(tool: BuildTool): void;
}

/** A built toolbar button bound to its toolbar entry, for per-frame state + hover info. */
interface BoundButton {
  readonly item: Item;
  readonly node: ButtonNode;
}

/** The retained build bar: its root (laid out + rendered by the host) + per-frame refresh. */
export interface BuildBar {
  readonly root: ContainerNode;
  /**
   * Re-bind every button's interaction state from the latest placement state. Once per frame.
   * Returns `true` when any button's base state (active/disabled/normal) changed, so the host
   * can gate the a11y-mirror reconcile (state changes affect the screen-reader view).
   */
  refresh(state: BuildBarState): boolean;
  /** Cost/tier hover text for a button node (or "" if it's not one of ours). */
  hoverInfoFor(node: UINode | null): string;
}

const isBuild = (i: Item): i is Extract<Item, { kind: "build" }> => i.kind === "build";

/** "4 wood, 2 stone" (or "" when free) — the material cost of a build type. */
function costText(type: string): string {
  return Object.entries(buildCost(type)).map(([g, q]) => `${q} ${g}`).join(", ");
}

function canAfford(type: string, stock: Readonly<Record<string, number>>): boolean {
  for (const [g, q] of Object.entries(buildCost(type))) {
    if ((stock[g] ?? 0) < (q ?? 0)) return false;
  }
  return true;
}

/** Icon buttons per row within a category group — keeps a category with several entries
 *  (e.g. "Service"'s 7) as a compact block instead of one tall column, like a real icon grid. */
const ICONS_PER_ROW = 4;

/** Split `items` into chunks of (up to) `size`, in order — drives the icon-grid row wrapping. */
function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Build the retained build-bar tree and wire each button to `actions`. Built once; `refresh`
 * mutates button states per frame. The bar reads as a row of category groups (a muted heading
 * over an icon grid, wrapped to {@link ICONS_PER_ROW} per row), to be anchored at the
 * bottom-left by the host.
 */
export function createBuildBar(actions: BuildBarActions): BuildBar {
  const bound: BoundButton[] = [];
  const byNodeId = new Map<number, BoundButton>();

  const groupColumns: ContainerNode[] = GROUPS.map((g) => {
    const heading: LabelNode = label(g.label, { muted: true });
    const buttons: ButtonNode[] = g.items.map((item) => {
      const node = button(item.label, {
        icon: { name: iconNameFor(item), ramp: BUILD_ICON_RAMP },
        onActivate: () => {
          if (isBuild(item)) actions.selectBuild(item.type);
          else actions.setTool(item.tool);
        },
      });
      const b: BoundButton = { item, node };
      bound.push(b);
      byNodeId.set(node.id, b);
      return node;
    });
    const rows = chunk(buttons, ICONS_PER_ROW).map((row) =>
      box({ direction: "row", gap: 3, align: "center" }, row),
    );
    return box({ direction: "column", gap: 3, align: "start" }, [heading, ...rows]);
  });

  const root = panel({ direction: "row", gap: 10, align: "start" }, groupColumns);

  function refresh(state: BuildBarState): boolean {
    let changed = false;
    for (const b of bound) {
      const selected = isBuild(b.item)
        ? state.mode === "place" && state.selectedType === b.item.type
        : state.mode === b.item.tool || (b.item.tool === "none" && state.mode === "none");
      const disabled = isBuild(b.item) && isDisabled(b.item.type, state);
      if (applyButtonState(b.node, { selected, disabled })) changed = true;
    }
    return changed;
  }

  function hoverInfoFor(node: UINode | null): string {
    if (node === null) return "";
    const b = byNodeId.get(node.id);
    if (b === undefined) return "";
    if (!isBuild(b.item)) return TOOL_HINTS[b.item.tool];
    const type = b.item.type;
    const req = TIER_LOCK[type];
    const cost = costText(type);
    if (req !== undefined) return `${b.item.label}: requires ${req}${cost !== "" ? ` · ${cost}` : ""}`;
    if (cost === "") return b.item.label;
    return `${b.item.label}: ${cost}`;
  }

  return { root, refresh, hoverInfoFor };
}

const TOOL_HINTS: Record<BuildTool, string> = {
  road: "Road: drag to connect buildings",
  wall: "Wall: drag to fortify",
  demolish: "Demolish: click a building to remove it",
  upgrade: "Upgrade: click a building to level it up",
  none: "Cancel: leave placement mode",
};

/** A build type is disabled when tier-locked or (cozy economy) unaffordable. */
function isDisabled(type: string, state: BuildBarState): boolean {
  const req = TIER_LOCK[type];
  if (req !== undefined && !tierAtLeast(state.peakTier, req)) return true;
  if (state.chargeBuildCost && !canAfford(type, state.stockpiles)) return true;
  return false;
}

/**
 * Set a button's base state (disabled / selected→active / normal) WITHOUT stomping a live
 * hover the input dispatcher set this frame — mirrors the resource-HUD speed-button pattern:
 * disabled always wins; a selected button rests as "active"; an unselected one is snapped back
 * to "normal" only when not mid-hover.
 */
function applyButtonState(btn: ButtonNode, s: { selected: boolean; disabled: boolean }): boolean {
  const before = btn.state;
  if (s.disabled) {
    btn.state = "disabled";
  } else {
    // Recover from a stale disabled state once it's affordable/unlocked again.
    if (btn.state === "disabled") btn.state = "normal";
    if (s.selected) {
      if (btn.state === "normal") btn.state = "active";
    } else if (btn.state === "active") {
      btn.state = "normal";
    }
  }
  return btn.state !== before;
}
