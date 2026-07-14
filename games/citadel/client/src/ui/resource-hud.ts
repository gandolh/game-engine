/**
 * Citadel resource HUD — the top status bar, rendered IN-CANVAS via `@engine/ui`.
 *
 * This is the pilot consumer of the `@engine/ui` framework (engine-ui chunk 7): the
 * settlement readout (tier · day/season · population · happiness), a full **goods strip**
 * (one icon + count chip per tradeable good, in production-chain order), plus the
 * speed (1×/2×/4×) and pause controls, built as a retained widget tree instead of DOM. It
 * proves the framework end-to-end — render + bitmap text + per-frame data-binding + mouse +
 * keyboard + screen-reader (the a11y mirror) — against a real game client.
 *
 * The tree is built ONCE (`createResourceHud`) and kept across frames; `refresh(state)`
 * mutates label text/colour + button state in place each frame from the latest snapshot,
 * then the host runs `computeLayout` + `renderTree`. The buttons' `onActivate` is wired by
 * the host to the SAME command path the old DOM `btnPause`/`btn1x/2x/4x` handlers drove, so
 * mouse, keyboard (Tab+Enter via the dispatcher) and the a11y mirror all share one path.
 *
 * EDG32-only: every colour is an `EDG.*` constant. Colour thresholds mirror the DOM HUD this
 * replaces (tier: steel/green/cyan/yellow/red; happiness: cyan≥60 / yellow≥40 / red).
 */
import { CITADEL_PAL as EDG } from "../render/citadel-palette";
import { GOOD_ICON_RAMPS } from "./citadel-theme";
import type { GoodType } from "@citadel/sim-core";
import { box, button, icon, label, panel } from "@engine/ui";
import type { ButtonNode, ContainerNode, LabelNode } from "@engine/ui";

/** Tier → readout colour (mirrors the old DOM HUD's `tierColors` map). */
const TIER_COLORS: Record<string, string> = {
  Hamlet: EDG.steel,
  Village: EDG.green,
  Town: EDG.cyan,
  Citadel: EDG.yellow,
  "Fortress-City": EDG.red,
};

/**
 * The tradeable goods, in **production-chain order** (grain → flour → bread; wood → planks;
 * stone → tools), each with a display name, a good icon ([engine/ui/src/icon/icons.ts](../../../../../engine/ui/src/icon/icons.ts),
 * tinted via `GOOD_ICON_RAMPS` in `citadel-theme.ts`), and its EDG32 count-label tint (kept
 * from the pre-icon colour-coded chips — the icon carries shape identity now, but colour still
 * groups a good with its family at a glance). `bread` is rendered specially — it also carries
 * the daily food surplus `(+N)` annotation.
 */
const GOODS: ReadonlyArray<{ good: GoodType; name: string; color: string }> = [
  { good: "grain", name: "Grain", color: EDG.gold },
  { good: "flour", name: "Flour", color: EDG.cream },
  { good: "bread", name: "Bread", color: EDG.tan },
  { good: "wood", name: "Wood", color: EDG.wood },
  { good: "planks", name: "Planks", color: EDG.clay },
  { good: "stone", name: "Stone", color: EDG.steel },
  { good: "tools", name: "Tools", color: EDG.silver },
];

/** Happiness → colour: cyan when content (≥60), yellow when uneasy (≥40), red when unrest. */
function happinessColor(happiness: number): string {
  return happiness >= 60 ? EDG.cyan : happiness >= 40 ? EDG.yellow : EDG.red;
}

/** The live values the HUD displays. Supplied each frame by the host from the snapshot. */
export interface ResourceHudState {
  tier: string;
  day: number;
  season: string;
  population: number;
  popCap: number;
  /** The full stockpile (every `GoodType` → count) — the goods strip reads each good from here. */
  stockpiles: Readonly<Record<string, number>>;
  /** Daily food (bread) surplus, shown as the `(+N)`/`(-N)` annotation on the bread chip. */
  foodSurplus: number;
  happiness: number;
  /** Whether the sim is paused (drives the pause button's label: "Pause" ↔ "Resume"). */
  paused: boolean;
  /** Current sim speed multiplier (1/2/4), drives the active highlight on the speed buttons. */
  speed: number;
  /**
   * Citadel 97/13: whether the local player may drive room control (pause + speed). Solo is
   * always host (true); in an online room only the host peer is true. When false the pause +
   * speed buttons render `disabled` (greyed + non-interactive) instead of a toggle that
   * silently no-ops server-side. The label still reflects the authoritative room paused state.
   */
  isHost: boolean;
}

/** Callbacks into the host's command path — the SAME ones the old DOM handlers invoked. */
export interface ResourceHudActions {
  /** Toggle pause/resume (mirrors the old `btn-pause` click). */
  togglePause(): void;
  /** Pick a sim speed, resuming if paused (mirrors the old `btn-1x/2x/4x` clicks). */
  setSpeed(n: number): void;
}

/** The retained HUD: its root node (laid out + rendered by the host) plus refresh(). */
export interface ResourceHud {
  /** The widget tree root — pass to `computeLayout` / `renderTree` / `mirror.update`. */
  readonly root: ContainerNode;
  /**
   * Re-bind all labels + button states from the latest snapshot. Call once per frame.
   *
   * Returns `true` when LAYOUT-AFFECTING content changed this call (any label text or button
   * label changed), so the host can gate the expensive `computeLayout` + a11y-mirror reconcile
   * behind it. Hover/active state changes (which don't affect layout) do NOT mark it changed.
   * The first call always returns `true` (initial layout). `renderTree`/`surface` must still
   * run every frame regardless — only the layout/a11y work is gated.
   */
  refresh(state: ResourceHudState): boolean;
}

/**
 * Build the retained resource-HUD widget tree and wire the speed/pause buttons to `actions`.
 * The tree is created once; `refresh` mutates it per frame (no re-allocation).
 */
export function createResourceHud(actions: ResourceHudActions): ResourceHud {
  // --- Readout labels. Each is created once and re-textured per frame in refresh().
  const tierLbl = label("Hamlet", { color: TIER_COLORS["Hamlet"] ?? EDG.silver });
  const dayLbl = label("Day 1 (spring)");
  const popLbl = label("Pop 0/0");
  const happyLbl = label("Happy: 40", { color: happinessColor(40) });

  // --- One chip per good (icon + count label), built once in production-chain order; the
  //     label is re-textured per frame in refresh(). Bread is flagged so refresh() appends its
  //     food-surplus annotation. The icon is static (identity never changes), so only the
  //     count label needs a per-frame handle.
  const goodChips = GOODS.map((g) => {
    const textNode = label(`${g.name} 0`, { color: g.color });
    const chip = box({ direction: "row", gap: 3, align: "center" }, [
      icon(g.good, GOOD_ICON_RAMPS[g.good]),
      textNode,
    ]);
    return { good: g.good, name: g.name, isBread: g.good === "bread", node: textNode, chip };
  });

  // --- Speed/pause controls as real buttons (exercise click + keyboard + a11y).
  const pauseBtn = button("Pause", { onActivate: () => actions.togglePause() });
  const speed1Btn = button("1x", { onActivate: () => actions.setSpeed(1) });
  const speed2Btn = button("2x", { onActivate: () => actions.setSpeed(2) });
  const speed4Btn = button("4x", { onActivate: () => actions.setSpeed(4) });

  // Readout group: a labelled row so the a11y mirror exposes it as a named region.
  // The leading label becomes the region's aria-label and isn't announced twice.
  const readout = box({ direction: "row", gap: 10, align: "center" }, [
    label("Settlement"),
    tierLbl,
    dayLbl,
    popLbl,
    happyLbl,
  ]);

  // Goods strip: a named region (leading label → aria-label) listing every good's live count.
  const resources = box({ direction: "row", gap: 10, align: "center" }, [
    label("Goods"),
    ...goodChips.map((c) => c.chip),
  ]);

  const controls = box({ direction: "row", gap: 6, align: "center" }, [
    pauseBtn,
    speed1Btn,
    speed2Btn,
    speed4Btn,
  ]);

  const root = panel({ direction: "row", gap: 16, align: "center" }, [readout, resources, controls]);

  // `changed` accumulates whether any LAYOUT-AFFECTING property (label text / button label)
  // changed this refresh. Colour changes don't move anything, so they don't set it.
  let changed = false;
  // First refresh must always report changed so the host runs the initial layout.
  let firstRefresh = true;

  function setText(lbl: LabelNode, text: string): void {
    if (lbl.text !== text) {
      lbl.text = text;
      changed = true;
    }
  }
  function setColor(lbl: LabelNode, color: string): void {
    if (lbl.color !== color) lbl.color = color;
  }

  /**
   * Speed buttons reflect the active multiplier with the "active" state (so the current
   * speed reads as pressed). The pause button shows hover/normal as the dispatcher drives
   * it — its meaning is carried by the label flip, not a forced state — so we never stomp
   * the dispatcher's hover/active on it. We only force the speed buttons that AREN'T the
   * current speed back to "normal" (and don't fight a live hover by leaving the matched one
   * "active").
   */
  function refresh(state: ResourceHudState): boolean {
    changed = false;

    setText(tierLbl, state.tier);
    setColor(tierLbl, TIER_COLORS[state.tier] ?? EDG.silver);
    setText(dayLbl, `Day ${state.day} (${state.season})`);
    setText(popLbl, `Pop ${state.population}/${state.popCap}`);
    setText(happyLbl, `Happy: ${state.happiness}`);
    setColor(happyLbl, happinessColor(state.happiness));

    const sign = state.foodSurplus >= 0 ? "+" : "";
    for (const chip of goodChips) {
      const count = state.stockpiles[chip.good] ?? 0;
      setText(
        chip.node,
        chip.isBread ? `${chip.name} ${count} (${sign}${state.foodSurplus})` : `${chip.name} ${count}`,
      );
    }

    // The pause label always mirrors the authoritative room state (Pause ↔ Resume), even for a
    // non-host peer — the greyed styling, not the label, carries "you can't touch this".
    if (setPauseLabel(pauseBtn, state.paused)) changed = true;

    // Citadel 97/13: room control (pause + speed) is host-only. A non-host peer sees all four
    // controls `disabled` — the engine maps that to the theme's muted slate/steel AND the input
    // dispatcher suppresses activation, so it reads as greyed-out, not a lying toggle.
    if (!state.isHost) {
      if (setDisabled(pauseBtn, true)) changed = true;
      if (setDisabled(speed1Btn, true)) changed = true;
      if (setDisabled(speed2Btn, true)) changed = true;
      if (setDisabled(speed4Btn, true)) changed = true;
    } else {
      // Host (or regained host via migration): clear any stale `disabled`, then apply the
      // active-speed highlight. setSpeedActive/setDisabled only flip interaction state (never
      // the label), so they don't affect layout — except the disabled→enabled flip, which we
      // fold into `changed` so the a11y mirror reconciles the buttons' enabled state.
      if (setDisabled(pauseBtn, false)) changed = true;
      if (setDisabled(speed1Btn, false)) changed = true;
      if (setDisabled(speed2Btn, false)) changed = true;
      if (setDisabled(speed4Btn, false)) changed = true;
      setSpeedActive(speed1Btn, state.speed === 1);
      setSpeedActive(speed2Btn, state.speed === 2);
      setSpeedActive(speed4Btn, state.speed === 4);
    }

    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  return { root, refresh };
}

/**
 * Flip the pause button's label without disturbing its interaction state.
 * Returns `true` when the label actually changed (a layout-affecting change).
 */
function setPauseLabel(btn: ButtonNode, paused: boolean): boolean {
  const label = paused ? "Resume" : "Pause";
  if (btn.label === label) return false;
  btn.label = label;
  return true;
}

/**
 * Mark a speed button as the active speed (pressed look) or release it. We don't override a
 * live "hover"/"active" the dispatcher set this frame for the matched button, but we do pin
 * the selected one to "active" when it's at rest, and snap the unselected ones to "normal"
 * unless the pointer is currently over them.
 */
function setSpeedActive(btn: ButtonNode, isActive: boolean): void {
  if (isActive) {
    // Selected speed reads as pressed unless the user is mid-interaction with it.
    if (btn.state === "normal") btn.state = "active";
  } else {
    // Not the selected speed: drop a stale "active" left over from a previous selection,
    // but leave hover/active that the dispatcher set for a live pointer interaction.
    if (btn.state === "active") btn.state = "normal";
  }
}

/**
 * Citadel 97/13: toggle a control's `disabled` state (host-only room control). Returns `true`
 * only when the disabled/enabled flip actually changed the state, so the caller can fold that
 * into `changed` (the a11y mirror then reconciles the button's enabled attribute). Enabling
 * drops back to `normal` (letting the dispatcher re-drive hover/active + the speed highlight
 * re-apply); it never stomps a live hover/active, since those are only reachable while enabled.
 */
function setDisabled(btn: ButtonNode, disabled: boolean): boolean {
  if (disabled) {
    if (btn.state === "disabled") return false;
    btn.state = "disabled";
    return true;
  }
  if (btn.state === "disabled") {
    btn.state = "normal";
    return true;
  }
  return false;
}
