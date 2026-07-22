/**
 * MateQuest M1 — the combat screen, a retained `@engine/ui` widget tree built ONCE
 * (`createCombatScreen`) and mutated per frame by `refresh(snapshot, typedValue)` from the
 * latest `CombatSnapshot` — mirrors Citadel's `resource-hud.ts` (`createResourceHud` +
 * per-frame `refresh`) and Farm's `slate-billboard.ts` (the bg-track/fg-fill HP-bar pattern,
 * whose custom fill colour is painted in a SEPARATE `drawBars` pass after `renderTree`, since
 * `ContainerNode` has no per-instance fill colour — only the shared theme `panelBg`).
 *
 * Phase-conditional content (the action menu vs. the problem panel vs. the win/lose banner) is
 * modelled by SWAPPING which built-once subtree is a CHILD of its slot each refresh, not by
 * fading it to `opacity: 0` — `hitTest`/`focusables` don't consult opacity, so a button merely
 * faded out would still be clickable/Tab-reachable. Removing it from `children` makes it truly
 * inert (and the a11y mirror correctly drops/re-adds its DOM entry by node id).
 */
import { box, button, label, panel } from "@engine/ui";
import type { ButtonNode, ContainerNode, LabelNode, UISurface } from "@engine/ui";
import type { CombatAction, CombatSnapshot } from "@mathquest/sim-core";
import { MATE_PAL } from "../render/mate-palette";
import { STRINGS } from "../strings";

const HP_BAR_WIDTH = 200;
const HP_BAR_HEIGHT = 12;

/** Actions the screen's buttons invoke — wired once at creation (mirrors `ResourceHudActions`). */
export interface CombatScreenActions {
  chooseAction(action: CombatAction): void;
  appendDigit(digit: number): void;
  backspace(): void;
  submit(): void;
  restart(): void;
}

interface HpBar {
  readonly track: ContainerNode;
  readonly fill: ContainerNode;
  fillColor: string;
}

function makeHpBar(fillColor: string): HpBar {
  const fill = box({ width: 0, height: HP_BAR_HEIGHT }, []);
  const track = box({ width: HP_BAR_WIDTH, height: HP_BAR_HEIGHT, padding: 0 }, [fill]);
  // `background` stays false on both — the actual fill colours (varying per bar, per HP%) are
  // painted directly in `drawBars`, since `ContainerNode` only carries the shared theme colour.
  return { track, fill, fillColor };
}

function setHpBar(bar: HpBar, hp: number, maxHp: number): boolean {
  const pct = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const width = Math.round(HP_BAR_WIDTH * pct);
  if (bar.fill.layout.width === width) return false;
  bar.fill.layout = { ...bar.fill.layout, width };
  return true;
}

function setText(lbl: LabelNode, text: string): boolean {
  if (lbl.text === text) return false;
  lbl.text = text;
  return true;
}

/** The retained combat screen: its root node plus `refresh()` + the deferred `drawBars()` pass. */
export interface CombatScreen {
  readonly root: ContainerNode;
  /**
   * Re-bind every label/button/bar from the latest snapshot + the host's typed-answer buffer.
   * Call once per frame. Returns `true` when layout-affecting content changed (gates the host's
   * `computeLayout` + a11y-mirror reconcile), mirroring `ResourceHud.refresh`.
   */
  refresh(snapshot: CombatSnapshot, typedValue: string): boolean;
  /**
   * Paint the HP bars' coloured fills. Call AFTER `computeLayout` + `renderTree` (needs
   * up-to-date `rect`s) and BEFORE `surface.end()` — mirrors the slate billboard's `drawIcons`.
   */
  drawBars(surface: UISurface): void;
}

export function createCombatScreen(actions: CombatScreenActions): CombatScreen {
  // --- Enemy area -----------------------------------------------------------------------------
  const enemyNameLbl = label("", { color: MATE_PAL.cream, scale: 2 });
  const enemyHpBar = makeHpBar(MATE_PAL.red);
  const enemyHpLbl = label("", { color: MATE_PAL.cream });
  const enemyIntentLbl = label("", { color: MATE_PAL.gold });
  const enemyArea = box({ direction: "column", gap: 4 }, [
    enemyNameLbl,
    box({ direction: "row", gap: 8, align: "center" }, [enemyHpBar.track, enemyHpLbl]),
    enemyIntentLbl,
  ]);

  // --- Warrior area ----------------------------------------------------------------------------
  const warriorNameLbl = label("Warrior", { color: MATE_PAL.cream, scale: 2 });
  const warriorHpBar = makeHpBar(MATE_PAL.green);
  const warriorHpLbl = label("", { color: MATE_PAL.cream });
  const warriorBlockLbl = label("", { color: MATE_PAL.skyBlue });
  const warriorArea = box({ direction: "column", gap: 4 }, [
    warriorNameLbl,
    box({ direction: "row", gap: 8, align: "center" }, [warriorHpBar.track, warriorHpLbl]),
    warriorBlockLbl,
  ]);

  // --- Result cue + turn counter -----------------------------------------------------------------
  const cueLbl = label("", { color: MATE_PAL.yellow });
  const turnLbl = label("", { color: MATE_PAL.steel });

  // --- Action menu (await_action) -----------------------------------------------------------------
  const attackBtn = button(STRINGS.actionLabel.attack, { onActivate: () => actions.chooseAction("attack") });
  const healBtn = button(STRINGS.actionLabel.heal, { onActivate: () => actions.chooseAction("heal") });
  const shieldBtn = button(STRINGS.actionLabel.shield, { onActivate: () => actions.chooseAction("shield") });
  const actionMenu = box({ direction: "row", gap: 8 }, [attackBtn, healBtn, shieldBtn]);

  // --- Problem panel (await_answer): prompt + typed buffer + numeric keypad ----------------------
  const promptLbl = label("", { color: MATE_PAL.white, scale: 2 });
  const typedLbl = label(STRINGS.typedPlaceholder, { color: MATE_PAL.cyan, scale: 2 });

  function digitBtn(d: number): ButtonNode {
    return button(String(d), { onActivate: () => actions.appendDigit(d) });
  }
  const backspaceBtn = button(STRINGS.backspace, { onActivate: () => actions.backspace() });
  const enterBtn = button(STRINGS.submit, { onActivate: () => actions.submit() });
  const digitBtns = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(digitBtn);
  const keypad = box({ direction: "column", gap: 4 }, [
    box({ direction: "row", gap: 4 }, [digitBtns[0]!, digitBtns[1]!, digitBtns[2]!]),
    box({ direction: "row", gap: 4 }, [digitBtns[3]!, digitBtns[4]!, digitBtns[5]!]),
    box({ direction: "row", gap: 4 }, [digitBtns[6]!, digitBtns[7]!, digitBtns[8]!]),
    box({ direction: "row", gap: 4 }, [backspaceBtn, digitBtns[9]!, enterBtn]),
  ]);
  const problemPanel = panel({ direction: "column", gap: 8 }, [promptLbl, typedLbl, keypad]);

  // --- dynamicArea: swaps between actionMenu / problemPanel / nothing (won/lost) ------------------
  const dynamicArea = box({ direction: "column", gap: 8 }, []);

  // --- Banner (won/lost) --------------------------------------------------------------------------
  const bannerLbl = label("", { color: MATE_PAL.gold, scale: 3 });
  const restartBtn = button(STRINGS.restart, { onActivate: () => actions.restart() });
  const bannerBox = panel({ direction: "column", gap: 12, align: "center" }, [bannerLbl, restartBtn]);
  const bannerArea = box({ direction: "column", gap: 0 }, []);

  const titleLbl = label(STRINGS.title, { color: MATE_PAL.gold });
  const root = box({ direction: "column", gap: 12, padding: 16 }, [
    titleLbl,
    enemyArea,
    warriorArea,
    turnLbl,
    cueLbl,
    dynamicArea,
    bannerArea,
  ]);

  let changed = false;
  let firstRefresh = true;

  function refresh(snapshot: CombatSnapshot, typedValue: string): boolean {
    changed = false;

    if (setText(enemyNameLbl, snapshot.enemy.name)) changed = true;
    if (setHpBar(enemyHpBar, snapshot.enemy.hp, snapshot.enemy.maxHp)) changed = true;
    if (setText(enemyHpLbl, `${snapshot.enemy.hp}/${snapshot.enemy.maxHp}`)) changed = true;
    const intentText =
      snapshot.phase === "await_action" ? `${STRINGS.enemyIntentPrefix} ${snapshot.enemy.intent}` : "";
    if (setText(enemyIntentLbl, intentText)) changed = true;

    if (setHpBar(warriorHpBar, snapshot.warrior.hp, snapshot.warrior.maxHp)) changed = true;
    if (setText(warriorHpLbl, `${snapshot.warrior.hp}/${snapshot.warrior.maxHp}`)) changed = true;
    const blockText = snapshot.warrior.block > 0 ? `${STRINGS.warriorBlockPrefix} ${snapshot.warrior.block}` : "";
    if (setText(warriorBlockLbl, blockText)) changed = true;

    if (setText(turnLbl, STRINGS.turnLabel(snapshot.turn))) changed = true;
    if (setText(cueLbl, STRINGS.resultCue(snapshot.last, snapshot.enemy.name))) changed = true;

    if (snapshot.phase === "await_answer") {
      if (setText(promptLbl, snapshot.prompt ?? "")) changed = true;
      const shown = typedValue.length > 0 ? typedValue : STRINGS.typedPlaceholder;
      if (setText(typedLbl, shown)) changed = true;
    }

    // Swap dynamicArea's content by PHASE (removing the inactive subtree from the tree entirely —
    // see the module doc on why opacity alone would leave hidden buttons hittable/focusable).
    const nextDynamicChildren =
      snapshot.phase === "await_action" ? [actionMenu] : snapshot.phase === "await_answer" ? [problemPanel] : [];
    if (
      dynamicArea.children.length !== nextDynamicChildren.length ||
      dynamicArea.children.some((c, i) => c !== nextDynamicChildren[i])
    ) {
      dynamicArea.children = nextDynamicChildren;
      changed = true;
    }

    const isOver = snapshot.phase === "won" || snapshot.phase === "lost";
    if (isOver) setText(bannerLbl, snapshot.phase === "won" ? STRINGS.won : STRINGS.lost);
    const nextBannerChildren = isOver ? [bannerBox] : [];
    if (
      bannerArea.children.length !== nextBannerChildren.length ||
      bannerArea.children.some((c, i) => c !== nextBannerChildren[i])
    ) {
      bannerArea.children = nextBannerChildren;
      changed = true;
    }

    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  function drawBars(surface: UISurface): void {
    const drawOne = (bar: HpBar): void => {
      const { x, y, width, height } = bar.track.rect;
      surface.rect(x, y, width, height, MATE_PAL.navy);
      const { width: fw } = bar.fill.rect;
      if (fw > 0) surface.rect(x, y, fw, height, bar.fillColor);
    };
    drawOne(enemyHpBar);
    drawOne(warriorHpBar);
  }

  return { root, refresh, drawBars };
}
