/**
 * Citadel "inspect a building" panel — a floating in-canvas card rendered via `@engine/ui`.
 *
 * Chunk 2 of the inspect feature. When the player left-clicks a building footprint (in idle
 * mode), the host selects it and opens this retained panel; it describes the building from the
 * pure data in `building-info.ts` (Chunk 1) plus the LIVE snapshot fields (level / connected /
 * workers / output buffer). Clicking empty ground, the ✕ button, or Esc closes it.
 *
 * Mirrors the `resource-hud.ts` consumer pattern: the tree is built ONCE (`createInspectPanel`)
 * and kept across frames; `refresh(state)` re-textures the labels in place from the latest
 * snapshot and returns whether LAYOUT-AFFECTING content changed (so the host can gate
 * `computeLayout` + the a11y-mirror reconcile behind it). The host lays it out at a floating
 * screen position and `renderTree`s it as a SECOND UI root alongside the HUD.
 *
 * Chunk 3 will add an Upgrade button + a cost row: the panel is structured with a dedicated,
 * initially-empty `footer` box at the bottom (after the detail rows) so a button + cost label
 * drop in without reshuffling the tree. Do NOT add the button here.
 *
 * EDG32-only: every colour is an `EDG.*` constant. No DOM, no `any`, deterministic.
 */
import { CITADEL_PAL as EDG } from "../render/citadel-palette";
import { box, button, label, panel } from "@engine/ui";
import type { ButtonNode, ContainerNode, LabelNode } from "@engine/ui";
import type { BarterOffer, Season, SettlementTier } from "@citadel/sim-core";
import { BUILDING_MAX_LEVEL, upgradeCost, tierAtLeast, tierNameRequiredForLevel } from "@citadel/sim-core";
import {
  BUILDING_DESCRIPTIONS,
  getGoodsFlow,
  getServiceRadius,
  getServiceRect,
  getWorkerSlots,
  isProductionThrottled,
  isServiceBuilding,
  productionRatePerDay,
} from "./building-info";

/**
 * The live, per-frame view of the selected building the panel renders. The host fills this
 * from the matched `BuildingSnapshot` (re-found each frame by footprint origin) plus the
 * snapshot-level `season`. `null`-ish absence is handled by the host (it just doesn't refresh
 * / render the panel when nothing is selected).
 */
export interface InspectPanelState {
  /** Building type key (e.g. "bakery", "chapel", "tradingpost"). */
  type: string;
  /** Current upgrade level (1..3). */
  level: number;
  /** Whether the building is connected to the road network. */
  connected: boolean;
  /** Villagers currently assigned/working here (live). */
  workerCount: number;
  /** Local output buffer (drives the buffer-full throttle note). */
  outputBuffer: number;
  /** Current season (drives seasonal farm yield). Snapshot `season` is a plain string. */
  season: string;
  /**
   * The owner's current global stockpiles (from the snapshot). Drives the Upgrade button's
   * affordability gate + the cost label's warning colour. Keyed by good name
   * (grain/flour/bread/wood/stone/planks/tools); a missing key is treated as 0.
   */
  stockpiles: Readonly<Record<string, number>>;
  /**
   * The owner's settlement tier reached (the snapshot's `peakTier`). The sim gates an upgrade
   * on `unlockTier(owner)` = max(tier, peakTier), which equals peakTier (peakTier never demotes
   * below tier), so the panel reads peakTier to mirror the sim's gate exactly: L2 needs Village,
   * L3 needs Town. Drives the tier-locked Upgrade-button disable + "Needs X" annotation.
   */
  peakTier: SettlementTier;
  /**
   * Phase G (cozy pivot #8, trading-post trade menu): whether the player owns a staffed,
   * road-connected trading post right now (the snapshot's `traderPresent`). Gates the trade-offer
   * affordance in the footer — only meaningful when `type === "tradingpost"`; the panel ignores it
   * for every other building type.
   */
  traderPresent: boolean;
  /**
   * The deterministic ≤3-offer menu (snapshot's `traderOffers`), e.g. `{give:"wood", giveQty:5,
   * receive:"tools", receiveQty:1}`. Only rendered when `type === "tradingpost" && traderPresent`.
   */
  traderOffers: readonly BarterOffer[];
}

/** Callbacks into the host's command path — the SAME one the old DOM `#btn-upgrade` drove. */
export interface InspectPanelActions {
  /** Close the panel (mirrors Esc / click-away). Wired to the ✕ button. */
  close(): void;
  /**
   * Upgrade the SELECTED building. The host issues the existing
   * `{ type: "upgradeBuilding", payload: { x, y } }` command, targeting the selected footprint
   * origin — the same path the old DOM `#btn-upgrade` tool used. Wired to the Upgrade button.
   */
  upgrade(): void;
  /**
   * Execute a trade offer. The host issues `{ type: "trade", payload: offer }` — content
   * (give/giveQty/receive/receiveQty), NOT the button's position — the sole economic-intent
   * lever (cozy decision #8). Brief 97/21: `traderOffers` re-rolls daily, so sending a position
   * would let a click race the re-roll and trade the wrong offer; the sim resolves this one by
   * content against its live menu instead. Wired to each trade-offer button, which reads the
   * CURRENT offer at click time (see `liveOffers` in createInspectPanel).
   */
  trade(offer: BarterOffer): void;
}

/** The retained inspect panel: its root node (laid out + rendered by the host) plus refresh(). */
export interface InspectPanel {
  /** The widget tree root — pass to `computeLayout` / `renderTree` / `mirror.update`. */
  readonly root: ContainerNode;
  /**
   * Re-bind every label from `state`. Call once per frame while the panel is open.
   *
   * Returns `true` when LAYOUT-AFFECTING content changed (any label text changed or a row was
   * shown/hidden), so the host can gate `computeLayout` + the a11y reconcile behind it. The
   * first call always returns `true` (initial layout). `renderTree` must still run every frame.
   */
  refresh(state: InspectPanelState): boolean;
  /**
   * Mark a closed→open transition so the NEXT `refresh` returns `true` even if the content is
   * byte-identical to the last time the panel was open. The host calls this when it (re)opens
   * the panel on a building, guaranteeing a layout + a11y-mirror reconcile pass on every open
   * (the floating position + hidden DOM are re-applied), not just on the panel's first lifetime
   * refresh. Without it, reopening the SAME building with no state change would skip layout and
   * paint with stale node coords / leave the mirror unpopulated.
   */
  markOpened(): void;
}

/**
 * Build the retained inspect-panel widget tree and wire the ✕ button to `actions.close`.
 * The tree is created once; `refresh` mutates it per frame (no re-allocation).
 *
 * Tree shape (top→bottom):
 *   panel(column)
 *     ├ header box(row): [titleLbl …spacer… closeBtn ✕]
 *     ├ descLbl                     (one-line description)
 *     ├ rateLbl                     (production rate / "—" for services)
 *     ├ throttleLbl                 ("slowed" note; emptied + hidden when fine)
 *     ├ detailsBox(column): scope/flow/workers/level/connected rows
 *     ├ tradeBox(column): "Trade:" heading + up to 3 offer buttons — Phase G. Only populated
 *     │   (non-empty children) when `type === "tradingpost" && traderPresent`; empty (and so
 *     │   zero-height) otherwise, so it's invisible for every other building and when the post
 *     │   isn't staffed/connected.
 *     └ footer box(row): [Upgrade button] [cost label] — Chunk 3.
 */
export function createInspectPanel(actions: InspectPanelActions): InspectPanel {
  const titleLbl = label("Building", { color: EDG.gold });
  const closeBtn = button("✕", { onActivate: () => actions.close() });
  // A grow:1 spacer pushes the ✕ to the right edge of the header row.
  const headerSpacer = box({ grow: 1 });
  const header = box({ direction: "row", align: "center", gap: 8 }, [
    titleLbl,
    headerSpacer,
    closeBtn,
  ]);

  const descLbl = label("", { muted: true });
  const rateLbl = label("");
  const throttleLbl = label("", { color: EDG.gold });

  // Detail rows. Each is a labelled column line; emptied + hidden when not applicable.
  const scopeLbl = label("");
  const flowLbl = label("");
  const workersLbl = label("");
  const levelLbl = label("");
  const connectedLbl = label("");
  const details = box({ direction: "column", gap: 3 }, [
    scopeLbl,
    flowLbl,
    workersLbl,
    levelLbl,
    connectedLbl,
  ]);

  // Trade offers (Phase G, cozy decision #8): a "Trade:" heading + up to 3 pre-created offer
  // buttons. Fixed pool (never re-allocated) — refresh() rebinds each button's label/onActivate
  // to the live `traderOffers[i]` and toggles which are IN THE TREE (tradeBox.children), so the
  // box is genuinely empty (zero height) when not a staffed/connected tradingpost, matching how
  // `renderTree`/`computeLayout`/the a11y mirror already tolerate a container's children array
  // changing length between frames (see build-bar.ts / the mirror's add-remove-reorder reconcile).
  const tradeHeadingLbl = label("Trade:", { muted: true });
  const MAX_TRADE_OFFERS = 3;
  /**
   * The offer content bound to each button slot as of the LAST refresh — read at click time
   * (not captured at button-creation time), since a fixed button pool is reused across frames
   * as `traderOffers` re-rolls daily. `refreshTradeOffers` keeps this current every frame.
   */
  let liveOffers: readonly BarterOffer[] = [];
  const tradeOfferBtns: ButtonNode[] = Array.from({ length: MAX_TRADE_OFFERS }, (_, i) =>
    button("", {
      onActivate: () => {
        const offer = liveOffers[i];
        if (offer !== undefined) actions.trade(offer);
      },
    }),
  );
  const tradeBox = box({ direction: "column", gap: 3 });

  // Footer: an Upgrade button + a cost label. The button issues the existing upgrade command
  // (via actions.upgrade); refresh() drives its `state` (enabled only when affordable + below
  // max) and the cost label's text + colour.
  const upgradeBtn = button("Upgrade", { onActivate: () => actions.upgrade() });
  const costLbl = label("", { color: EDG.silver });
  const footer = box({ direction: "row", gap: 8, align: "center" }, [upgradeBtn, costLbl]);

  const root = panel({ direction: "column", gap: 6, width: 240 }, [
    header,
    descLbl,
    rateLbl,
    throttleLbl,
    details,
    tradeBox,
    footer,
  ]);

  let changed = false;
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

  function setDisabled(disabled: boolean): void {
    if (disabled) {
      if (upgradeBtn.state !== "disabled") {
        upgradeBtn.state = "disabled";
        changed = true;
      }
    } else if (upgradeBtn.state === "disabled") {
      // Re-enable: clear the stale disabled state (dispatcher drives hover/active from here).
      upgradeBtn.state = "normal";
      changed = true;
    }
  }

  /**
   * Re-texture the Upgrade button + cost label for the next level. Precedence (mirrors the sim's
   * upgrade gate in sim-bootstrap.ts — max-level → tier → affordability):
   *  - At max level (3): "Max level", button disabled, no cost.
   *  - Below max, tier-locked (next level needs a higher tier than `peakTier`): cost +
   *    "(Needs Village/Town)" in a warning colour, button disabled.
   *  - Below max, reached the tier but unaffordable: cost + "(can't afford)", button disabled.
   *  - Below max, reached the tier and affordable: "Cost: …", silver, button enabled.
   * Button `state` is only flipped to/from "disabled" — when enabled we don't stomp a live
   * hover/active the dispatcher set (we only release a stale "disabled").
   */
  function refreshFooter(
    type: string,
    level: number,
    stockpiles: Readonly<Record<string, number>>,
    peakTier: SettlementTier,
  ): void {
    if (level >= BUILDING_MAX_LEVEL) {
      setText(costLbl, "Max level");
      setColor(costLbl, EDG.silver);
      setDisabled(true);
      return;
    }

    const nextLevel = level + 1;
    const cost = upgradeCost(type, nextLevel);
    const costStr = Object.entries(cost)
      .map(([good, qty]) => `${qty} ${good}`)
      .join(", ");

    // Tier gate first (a higher-tier requirement outranks affordability): L2 needs Village,
    // L3 needs Town. tierNameRequiredForLevel is the sim's own def (no hardcoded names here).
    const reqTier = tierNameRequiredForLevel(nextLevel as 2 | 3);
    if (!tierAtLeast(peakTier, reqTier)) {
      setText(costLbl, `Cost: ${costStr} (Needs ${reqTier})`);
      setColor(costLbl, EDG.red);
      setDisabled(true);
      return;
    }

    const affordable = Object.entries(cost).every(
      ([good, qty]) => (stockpiles[good] ?? 0) >= qty,
    );
    setText(costLbl, affordable ? `Cost: ${costStr}` : `Cost: ${costStr} (can't afford)`);
    setColor(costLbl, affordable ? EDG.silver : EDG.red);
    setDisabled(!affordable);
  }

  /**
   * Rebuild `tradeBox.children` for the current frame: the "Trade:" heading + one button per
   * live offer (0..3), only when this is a staffed/connected trading post. Mutates the array
   * directly (not `setText`) since a row is added/removed, not re-textured — so this ALSO flips
   * `changed` on any add/remove/relabel, which is what the tree-shape doc above promises.
   */
  function refreshTradeOffers(
    type: string,
    traderPresent: boolean,
    offers: readonly BarterOffer[],
  ): void {
    const show = type === "tradingpost" && traderPresent;
    liveOffers = offers;
    const nextChildren: (LabelNode | ButtonNode)[] = [];
    if (show) {
      nextChildren.push(tradeHeadingLbl);
      offers.slice(0, MAX_TRADE_OFFERS).forEach((offer, i) => {
        const btn = tradeOfferBtns[i]!;
        const text = `${offer.giveQty} ${offer.give} → ${offer.receiveQty} ${offer.receive}`;
        if (btn.label !== text) {
          btn.label = text;
          changed = true;
        }
        nextChildren.push(btn);
      });
    }
    const before = tradeBox.children;
    const sameLength = before.length === nextChildren.length;
    const sameNodes = sameLength && before.every((n, i) => n === nextChildren[i]);
    if (!sameNodes) {
      tradeBox.children = nextChildren;
      changed = true;
    }
  }

  function refresh(state: InspectPanelState): boolean {
    changed = false;
    const {
      type, level, connected, workerCount, outputBuffer, season, stockpiles, peakTier,
      traderPresent, traderOffers,
    } = state;

    // --- Name + description.
    setText(titleLbl, titleCase(type));
    setText(descLbl, BUILDING_DESCRIPTIONS[type] ?? "");

    // --- Production rate (undefined for services/infrastructure → an em dash).
    const rate = productionRatePerDay(type, level, season as Season);
    setText(rateLbl, rate !== undefined ? `Rate: ${rate}` : "Rate: —");

    // --- Throttle note (cozy pivot: "slowed", never "stopped").
    const throttled = isProductionThrottled(type, level, { workerCount, connected, outputBuffer });
    setText(throttleLbl, throttled ? throttleReason(type, workerCount, connected) : "");

    // --- Scope / details.
    setText(scopeLbl, scopeLine(type));
    setText(flowLbl, flowLine(type));
    setText(workersLbl, workersLine(type, workerCount));
    setText(levelLbl, `Level ${level}`);
    setText(connectedLbl, `Connected: ${connected ? "yes" : "no"}`);

    // --- Trade offers (Phase G): the tiny 2-3-choice menu, tradingpost-only, staffed+connected.
    refreshTradeOffers(type, traderPresent, traderOffers);

    // --- Upgrade footer: cost for the NEXT level + a tier/affordability-gated button.
    refreshFooter(type, level, stockpiles, peakTier);

    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  /** Force the next refresh to report changed (closed→open transition). See InspectPanel. */
  function markOpened(): void {
    firstRefresh = true;
  }

  return { root, refresh, markOpened };
}

// ---------------------------------------------------------------------------
// Line builders (pure; tested directly via the panel's labels)
// ---------------------------------------------------------------------------

/** Title-case a type key for the header ("trading-post"/"town-hall" stay readable). */
function titleCase(type: string): string {
  return type
    .split(/[-_]/)
    .map((w) => (w.length === 0 ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * Coverage/scope line. Service buildings with a radius show the catchment radius; the well's
 * rectangle shows its w×h. `tradingpost` is NOT a coverage service — it's a worker building
 * for caravan trade, so we say that instead of inventing a bogus radius. Non-service buildings
 * with no coverage return "" (the row stays empty).
 */
function scopeLine(type: string): string {
  if (type === "tradingpost") return "Scope: trade access (caravans)";
  if (isServiceBuilding(type)) {
    const radius = getServiceRadius(type);
    if (radius !== undefined) return `Coverage radius: ${radius} tiles`;
    const rect = getServiceRect(type);
    if (rect !== undefined) return `Coverage area: ${rect.w}×${rect.h} tiles`;
  }
  return "";
}

/**
 * Inputs→outputs flow line for goods buildings. Shows "Flour → Bread" for converters and
 * "Produces Grain" for raw producers. Empty for buildings with no goods flow.
 */
function flowLine(type: string): string {
  const flow = getGoodsFlow(type);
  if (flow === undefined || flow.outputGood === undefined) return "";
  if (flow.inputGood !== undefined) {
    return `Flow: ${titleCase(flow.inputGood)} → ${titleCase(flow.outputGood)}`;
  }
  return `Produces: ${titleCase(flow.outputGood)}`;
}

/**
 * Workers line: "Workers: 1/1" for staffed buildings; empty for buildings with no worker slots
 * (houses, walls, wells, storehouses, roads).
 */
function workersLine(type: string, workerCount: number): string {
  const slots = getWorkerSlots(type);
  if (slots === 0) return "";
  return `Workers: ${workerCount}/${slots}`;
}

/**
 * The slowed-note text. Names the most actionable cause so the player knows the fix; defaults
 * to a generic "slowed" when it's a full output buffer. Never says "stopped" (cozy pivot).
 */
function throttleReason(type: string, workerCount: number, connected: boolean): string {
  if (getWorkerSlots(type) > 0 && workerCount === 0) return "Slowed — needs a worker";
  if (!connected) return "Slowed — not on a road";
  return "Slowed — output buffer full";
}
