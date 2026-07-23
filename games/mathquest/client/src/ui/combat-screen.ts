/**
 * MateQuest — the combat screen, a retained `@engine/ui` widget tree built ONCE
 * (`createCombatScreen`) and mutated per frame by `refresh(snapshot, typedValue)` from the
 * latest `CombatSnapshot` — mirrors Citadel's `resource-hud.ts` (`createResourceHud` +
 * per-frame `refresh`) and Farm's `slate-billboard.ts` (the bg-track/fg-fill HP-bar pattern,
 * whose custom fill colour is painted in a SEPARATE `drawBars` pass after `renderTree`, since
 * `ContainerNode` has no per-instance fill colour — only the shared theme `panelBg`).
 *
 * Phase-conditional content (the action menu vs. the problem panel vs. the teach card vs. the
 * win/lose banner) is modelled by SWAPPING which built-once subtree is a CHILD of its slot each
 * refresh, not by fading it to `opacity: 0` — `hitTest`/`focusables` don't consult opacity, so a
 * button merely faded out would still be clickable/Tab-reachable. Removing it from `children`
 * makes it truly inert (and the a11y mirror correctly drops/re-adds its DOM entry by node id).
 *
 * ## Pokémon-style battle layout (2026-07-23)
 * The tree is laid out to FILL the viewport (`computeLayout(root, 0, 0, theme, {width,height})`
 * in `main.ts`, root `align:"stretch"`) as a top-down battle scene, like the classic Pokémon
 * fight framing in the reference the user gave:
 *   - the ENEMY HP window pins to the TOP-LEFT, its creature sprite stands upper-RIGHT;
 *   - the HERO (Făt-Frumos) HP window pins mid-RIGHT just above the command box, his sprite
 *     stands lower-LEFT — the two diagonally opposed, facing each other;
 *   - a full-width dark COMMAND BOX sits along the bottom holding the turn/result message line
 *     plus the phase content (action menu / problem panel / teach card / banner).
 * A grow spacer (`midGrow`) between the enemy row and the hero row opens the sky region the
 * sprites + platforms are painted into. The scene BACKGROUND (sky, ground, platforms) and the
 * two sprites are drawn in `drawScene` — a post-pass called BEFORE `renderTree` so the HP
 * windows + command box paint OVER it — exactly the map screen's "custom-drawn scenery, chrome
 * on top" idiom (`ui/map-screen.ts`), rect-only + `MATE_PAL` (no WebGPU/shaders, no raw hex).
 * The HP-bar coloured fills are still a `drawBars` pass AFTER `renderTree` (they read the laid-out
 * bar rects). So the per-frame order in `main.ts` is: computeLayout → begin → drawScene →
 * renderTree → drawBars → end.
 *
 * M2 additions (corpus/todos/2026-07-22-mathquest-M2-problem-generators.md, Part B):
 *  - the problem panel's input area swaps between the numeric keypad (`problem.kind==="typed"`)
 *    and a row of choice buttons (`problem.kind==="choice"`) — both built once, never rebuilt;
 *  - a teach card (phase `"teach"`) shows the worked step + the fizzle cue + a Continue button;
 *  - the single M1 `last` cue is split into TWO always-separate lines, `lastPlayer`/`lastEnemy`
 *    (the M1 known-minor fold-in — the player's own result no longer gets overwritten).
 *
 * M3 (corpus/todos/2026-07-22-mathquest-M3-map-and-runs.md, Part B) REMOVES the M2 grade
 * selector — difficulty now comes from which map node the player chose (`ui/map-screen.ts`), not
 * a manual picker mid-fight — and shows the fight's fixed grade as a READ-ONLY label instead.
 *
 * M4b (corpus/todos/2026-07-23-mathquest-M4b-lifelines.md) adds a lifeline bar (3 buttons, built
 * ONCE like the keypad) under the problem panel, a hint line inside the problem panel, and
 * disables the matching choice buttons from `problem.disabledChoices` — see `refresh`'s doc.
 *
 * M5 slice 2 (corpus/todos/2026-07-23-mathquest-M5-i18n-toggle.md): `createCombatScreen` now takes
 * a resolved `Strings` bundle as its 2nd argument, used ONCE at construction for every fixed label
 * (button text, the hero name, the teach-card title, …). A locale toggle REBUILDS this screen
 * (`main.ts` calls `createCombatScreen` again with the new `Strings`) rather than re-binding these
 * labels in place — see `strings.ts`'s module doc for the rationale.
 */
import { box, button, label, panel } from "@engine/ui";
import type { ButtonNode, ButtonState, ContainerNode, LabelNode, Rect, UINode, UISurface } from "@engine/ui";
import type { CombatAction, CombatSnapshot, LifelineCharges, LifelineKind, MathTopic } from "@mathquest/sim-core";
import { LIFELINE_KINDS } from "@mathquest/sim-core";
import { MATE_PAL } from "../render/mate-palette";
import type { Strings } from "../strings";
import { ENEMY_SPRITE_DRAW, drawHero } from "./sprites";

const HP_BAR_WIDTH = 200;
const HP_BAR_HEIGHT = 12;
/** Comparison always generates exactly 3 choices (`<`, `>`, `=`) — see the M2 brief. */
const CHOICE_SLOTS = 3;

/** Triviador/Conquiztador-style quiz theming for the problem window: each math TOPIC gets a
 * category colour (paints the question banner's header strip + the topic chip), and each answer
 * TILE gets a distinct colour frame (the quiz-show A/B/C/D-tile identity cue). All `MATE_PAL`. */
const TOPIC_ACCENT: Record<MathTopic, string> = {
  addition: MATE_PAL.green,
  subtraction: MATE_PAL.skyBlue,
  multiplication: MATE_PAL.gold,
  comparison: MATE_PAL.hotPink,
};
const TILE_COLORS: readonly string[] = [MATE_PAL.skyBlue, MATE_PAL.gold, MATE_PAL.green];

/** Actions the screen's buttons invoke — wired once at creation (mirrors `ResourceHudActions`). */
export interface CombatScreenActions {
  chooseAction(action: CombatAction): void;
  appendDigit(digit: number): void;
  backspace(): void;
  submit(): void;
  /** Submits `{kind:"choice", index}` for the pending choice problem. */
  submitChoice(index: number): void;
  /** Posts `acknowledge-teach` — advances past the teach card into the enemy's (deferred) turn. */
  acknowledgeTeach(): void;
  /** M4b: posts `use-lifeline` with the given kind. */
  useLifeline(kind: LifelineKind): void;
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

/** HP-bar fill colour by fraction remaining — the classic green→amber→red battle cue. */
function hpColor(hp: number, maxHp: number): string {
  const pct = maxHp > 0 ? hp / maxHp : 0;
  return pct > 0.5 ? MATE_PAL.green : pct > 0.2 ? MATE_PAL.gold : MATE_PAL.red;
}

function setText(lbl: LabelNode, text: string): boolean {
  if (lbl.text === text) return false;
  lbl.text = text;
  return true;
}

/** M4b: rebind a button's `state` only when it actually changed (mirrors `setText`). */
function setState(btn: ButtonNode, state: ButtonState): boolean {
  if (btn.state === state) return false;
  btn.state = state;
  return true;
}

function sameChildren(container: ContainerNode, next: readonly UINode[]): boolean {
  return container.children.length === next.length && container.children.every((c, i) => c === next[i]);
}

/** The retained combat screen: its root node plus `refresh()` + the deferred draw passes. */
export interface CombatScreen {
  readonly root: ContainerNode;
  /**
   * Re-bind every label/button/bar from the latest snapshot + the host's typed-answer buffer.
   * Call once per frame. Returns `true` when layout-affecting content changed (gates the host's
   * `computeLayout` + a11y-mirror reconcile), mirroring `ResourceHud.refresh`.
   */
  refresh(snapshot: CombatSnapshot, typedValue: string, lifelines: LifelineCharges): boolean;
  /**
   * Paint the battle scene BACKGROUND + the two combatant sprites (sky, ground, the two grass
   * platforms, the enemy creature upper-right, Făt-Frumos lower-left). Screen-space (needs the
   * live viewport) and reads the laid-out `midGrow`/dialog rects, so call it AFTER `computeLayout`
   * and BEFORE `renderTree` (so the HP windows + command box paint over it). Purely cosmetic —
   * reads `snapshot.enemy.sprite`, draws nothing sim-affecting.
   */
  drawScene(surface: UISurface, snapshot: CombatSnapshot, viewW: number, viewH: number): void;
  /**
   * Paint the HP bars' coloured fills. Call AFTER `computeLayout` + `renderTree` (needs
   * up-to-date `rect`s) and BEFORE `surface.end()` — mirrors the slate billboard's `drawIcons`.
   */
  drawBars(surface: UISurface): void;
  /**
   * Paint the Triviador-style quiz accents that a plain widget can't express: the topic-coloured
   * header strip over the question banner, and the A/B/C colour frames (with a drop shadow, and a
   * red "eliminated" cross on a 50-50'd tile) around the choice buttons. Reads the laid-out banner
   * + choice-button rects, so call it AFTER `renderTree` (paints over the tiles' own chrome),
   * BEFORE `surface.end()`. No-op outside `await_answer`. Purely cosmetic.
   */
  drawFx(surface: UISurface, snapshot: CombatSnapshot): void;
}

export function createCombatScreen(actions: CombatScreenActions, strings: Strings): CombatScreen {
  // --- Grade (M3: READ-ONLY — difficulty now comes from the map node the player chose; the M2
  // manual selector is gone) ---------------------------------------------------------------------
  const gradeLbl = label("", { color: MATE_PAL.gold });

  // --- Enemy area (pins TOP-LEFT as a Pokémon HP window) --------------------------------------
  const enemyNameLbl = label("", { color: MATE_PAL.cream, scale: 2 });
  // M5 folklore theming: the zone-flavored epithet under the enemy's name (`EnemyView.title`) —
  // a muted line, always rebound alongside the name (build-once, like every other label here).
  const enemyTitleLbl = label("", { color: MATE_PAL.steel });
  const enemyHpBar = makeHpBar(MATE_PAL.red);
  const enemyHpLbl = label("", { color: MATE_PAL.cream });
  const enemyIntentLbl = label("", { color: MATE_PAL.gold });
  const enemyBox = panel({ direction: "column", gap: 4 }, [
    enemyNameLbl,
    enemyTitleLbl,
    box({ direction: "row", gap: 8, align: "center" }, [enemyHpBar.track, enemyHpLbl]),
    enemyIntentLbl,
  ]);
  const enemyRow = box({ direction: "row", padding: { top: 12, left: 16, right: 16, bottom: 0 } }, [
    enemyBox,
    box({ grow: 1 }, []),
  ]);

  // --- Warrior area (pins mid-RIGHT above the command box) --------------------------------------
  // M5 folklore theming: the hero's proper name (strings.heroName, "Făt-Frumos") — fixes the old
  // hardcoded EN "Warrior" literal. Fixed text (never rebound per refresh), like `titleLbl` below.
  const warriorNameLbl = label(strings.heroName, { color: MATE_PAL.cream, scale: 2 });
  const warriorHpBar = makeHpBar(MATE_PAL.green);
  const warriorHpLbl = label("", { color: MATE_PAL.cream });
  const warriorBlockLbl = label("", { color: MATE_PAL.skyBlue });
  const warriorBox = panel({ direction: "column", gap: 4 }, [
    warriorNameLbl,
    box({ direction: "row", gap: 8, align: "center" }, [warriorHpBar.track, warriorHpLbl]),
    warriorBlockLbl,
  ]);
  const warriorRow = box({ direction: "row", padding: { top: 0, left: 16, right: 16, bottom: 6 } }, [
    box({ grow: 1 }, []),
    warriorBox,
  ]);

  // The open sky/ground region the sprites + platforms are painted into (grows to fill the gap
  // between the enemy row and the hero row).
  const midGrow = box({ grow: 1 }, []);

  // --- Result cues (M2: two SEPARATE lines — the player's own result never overwritten) + turn --
  const playerCueLbl = label("", { color: MATE_PAL.yellow });
  const enemyCueLbl = label("", { color: MATE_PAL.salmon });
  const turnLbl = label("", { color: MATE_PAL.steel });

  // --- Action menu (await_action) -----------------------------------------------------------------
  const attackBtn = button(strings.actionLabel.attack, { onActivate: () => actions.chooseAction("attack") });
  const healBtn = button(strings.actionLabel.heal, { onActivate: () => actions.chooseAction("heal") });
  const shieldBtn = button(strings.actionLabel.shield, { onActivate: () => actions.chooseAction("shield") });
  const actionMenu = box({ direction: "row", gap: 8 }, [attackBtn, healBtn, shieldBtn]);

  // --- Problem panel (await_answer): a Triviador-style quiz card — a category chip, a big framed
  // question banner, then EITHER a big numeric answer display + keypad OR big colour-framed choice
  // tiles (the coloured frames are painted in `drawFx`, since a widget button has no per-instance
  // colour). ------------------------------------------------------------------------------------
  const topicChip = label("", { color: MATE_PAL.cream });
  const promptLbl = label("", { color: MATE_PAL.white, scale: 3 });
  // The framed question banner. A colour header strip (by topic) is painted over its top edge in
  // `drawFx`; its rect is read there, so keep the reference.
  const promptBanner = panel({ direction: "column", align: "center", padding: { top: 14, left: 20, right: 20, bottom: 12 } }, [promptLbl]);

  const typedLbl = label(strings.typedPlaceholder, { color: MATE_PAL.cyan, scale: 3 });
  const answerDisplay = panel({ direction: "row", align: "center", padding: { top: 6, left: 24, right: 24, bottom: 6 } }, [typedLbl]);

  function digitBtn(d: number): ButtonNode {
    return button(String(d), { onActivate: () => actions.appendDigit(d), scale: 2 });
  }
  const backspaceBtn = button(strings.backspace, { onActivate: () => actions.backspace(), scale: 2 });
  const enterBtn = button(strings.submit, { onActivate: () => actions.submit(), scale: 2 });
  const digitBtns = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(digitBtn);
  const keypad = box({ direction: "column", gap: 6, align: "center" }, [
    box({ direction: "row", gap: 6 }, [digitBtns[0]!, digitBtns[1]!, digitBtns[2]!]),
    box({ direction: "row", gap: 6 }, [digitBtns[3]!, digitBtns[4]!, digitBtns[5]!]),
    box({ direction: "row", gap: 6 }, [digitBtns[6]!, digitBtns[7]!, digitBtns[8]!]),
    box({ direction: "row", gap: 6 }, [backspaceBtn, digitBtns[9]!, enterBtn]),
  ]);
  const typedGroup = box({ direction: "column", gap: 10, align: "center" }, [answerDisplay, keypad]);

  // Choice buttons: built ONCE (fixed count — comparison always emits exactly 3 relations); their
  // `label` text is rebound each refresh from `problem.choices[i]`. Big quiz tiles (scale 3), their
  // A/B/C colour frames painted in `drawFx`.
  const choiceBtns: ButtonNode[] = Array.from({ length: CHOICE_SLOTS }, (_, i) =>
    button("", { onActivate: () => actions.submitChoice(i), scale: 3 }),
  );
  const choiceRow = box({ direction: "row", gap: 16, align: "center" }, choiceBtns);

  // --- Hint line (M4b): visible only once `snapshot.hint !== null`, removed otherwise (mirrors
  // the module doc's "removed from children, not just blanked" rule for inert content). ----------
  const hintLbl = label("", { color: MATE_PAL.gold, maxWidth: 420 });
  const hintArea = box({ direction: "column", gap: 0, align: "center" }, []);

  const inputArea = box({ direction: "column", gap: 4, align: "center" }, []);
  const problemPanel = box({ direction: "column", gap: 10, align: "center" }, [topicChip, promptBanner, inputArea, hintArea]);

  // --- Lifeline bar (M4b): built ONCE (fixed 3 kinds), mutated per refresh — mirrors the keypad's
  // build-once-mutate-label/state convention. ------------------------------------------------------
  const lifelineBtns: Record<LifelineKind, ButtonNode> = {
    hint: button("", { onActivate: () => actions.useLifeline("hint") }),
    fifty: button("", { onActivate: () => actions.useLifeline("fifty") }),
    skip: button("", { onActivate: () => actions.useLifeline("skip") }),
  };
  const lifelineBar = box(
    { direction: "row", gap: 8 },
    LIFELINE_KINDS.map((kind) => lifelineBtns[kind]),
  );

  // --- Teach card (phase "teach"): worked step + the fizzle cue + Continue -----------------------
  const teachTitleLbl = label(strings.teachTitle, { color: MATE_PAL.gold });
  const teachFizzleLbl = label("", { color: MATE_PAL.yellow });
  const teachTextLbl = label("", { color: MATE_PAL.cream, maxWidth: 320 });
  const continueBtn = button(strings.continueLabel, { onActivate: () => actions.acknowledgeTeach() });
  const teachCard = box({ direction: "column", gap: 8 }, [teachTitleLbl, teachFizzleLbl, teachTextLbl, continueBtn]);

  // --- answerArea (M4b): the problem panel PLUS the lifeline bar underneath it — shown together
  // in `"await_answer"`. -----------------------------------------------------------------------
  const answerArea = box({ direction: "column", gap: 10, align: "center" }, [problemPanel, lifelineBar]);

  // --- dynamicArea: swaps between actionMenu / answerArea / teachCard / nothing (won/lost) --------
  const dynamicArea = box({ direction: "column", gap: 8 }, []);

  // --- Banner (won/lost) --------------------------------------------------------------------------
  const bannerLbl = label("", { color: MATE_PAL.gold, scale: 3 });
  const restartBtn = button(strings.restart, { onActivate: () => actions.restart() });
  const bannerBox = box({ direction: "column", gap: 12, align: "center" }, [bannerLbl, restartBtn]);
  const bannerArea = box({ direction: "column", gap: 0 }, []);

  // The bottom command box: turn/result message line + phase content, full width (root stretches),
  // its content centred like a quiz-show panel.
  const messageLine = box({ direction: "row", gap: 16, align: "center" }, [turnLbl, playerCueLbl, enemyCueLbl]);
  const commandBox = panel({ direction: "column", gap: 8, padding: 14, align: "center" }, [messageLine, dynamicArea, bannerArea]);

  const titleLbl = label(strings.title, { color: MATE_PAL.gold });
  const topBar = box({ direction: "row", align: "center", padding: { top: 8, left: 16, right: 16, bottom: 4 } }, [
    titleLbl,
    box({ grow: 1 }, []),
    gradeLbl,
  ]);
  const root = box({ direction: "column", align: "stretch", gap: 0, padding: 0 }, [
    topBar,
    enemyRow,
    midGrow,
    warriorRow,
    commandBox,
  ]);

  let changed = false;
  let firstRefresh = true;

  function refresh(snapshot: CombatSnapshot, typedValue: string, lifelines: LifelineCharges): boolean {
    changed = false;

    if (setText(enemyNameLbl, snapshot.enemy.name)) changed = true;
    if (setText(enemyTitleLbl, snapshot.enemy.title)) changed = true;
    if (setHpBar(enemyHpBar, snapshot.enemy.hp, snapshot.enemy.maxHp)) changed = true;
    enemyHpBar.fillColor = hpColor(snapshot.enemy.hp, snapshot.enemy.maxHp);
    if (setText(enemyHpLbl, `${snapshot.enemy.hp}/${snapshot.enemy.maxHp}`)) changed = true;
    const intentText =
      snapshot.phase === "await_action" ? `${strings.enemyIntentPrefix} ${snapshot.enemy.intent}` : "";
    if (setText(enemyIntentLbl, intentText)) changed = true;

    if (setHpBar(warriorHpBar, snapshot.warrior.hp, snapshot.warrior.maxHp)) changed = true;
    warriorHpBar.fillColor = hpColor(snapshot.warrior.hp, snapshot.warrior.maxHp);
    if (setText(warriorHpLbl, `${snapshot.warrior.hp}/${snapshot.warrior.maxHp}`)) changed = true;
    const blockText = snapshot.warrior.block > 0 ? `${strings.warriorBlockPrefix} ${snapshot.warrior.block}` : "";
    if (setText(warriorBlockLbl, blockText)) changed = true;

    if (setText(turnLbl, strings.turnLabel(snapshot.turn))) changed = true;
    if (setText(playerCueLbl, strings.playerResultCue(snapshot.lastPlayer))) changed = true;
    if (setText(enemyCueLbl, strings.enemyResultCue(snapshot.lastEnemy, snapshot.enemy.name))) changed = true;

    // Grade (M3: read-only — set by the map node this fight came from, not a mid-fight picker).
    if (setText(gradeLbl, strings.gradeReadout(snapshot.grade))) changed = true;

    if (snapshot.phase === "await_answer" && snapshot.problem !== null) {
      const problem = snapshot.problem;
      if (setText(promptLbl, problem.prompt)) changed = true;
      // Triviador-style category chip, coloured by topic (the header strip is painted in drawFx).
      if (setText(topicChip, strings.topicName[problem.topic])) changed = true;
      topicChip.color = TOPIC_ACCENT[problem.topic];

      if (problem.kind === "typed") {
        if (!sameChildren(inputArea, [typedGroup])) {
          inputArea.children = [typedGroup];
          changed = true;
        }
        const shown = typedValue.length > 0 ? typedValue : strings.typedPlaceholder;
        if (setText(typedLbl, shown)) changed = true;
      } else {
        if (!sameChildren(inputArea, [choiceRow])) {
          inputArea.children = [choiceRow];
          changed = true;
        }
        for (let i = 0; i < CHOICE_SLOTS; i++) {
          const nextLabel = problem.choices[i] ?? "";
          if (choiceBtns[i]!.label !== nextLabel) {
            choiceBtns[i]!.label = nextLabel;
            changed = true;
          }
          // M4b: a "fifty" lifeline disables one wrong choice — @engine/ui's "disabled" state is
          // already inert + Tab-skipped + a11y-reflected, so no extra guard is needed here (but
          // `main.ts`'s `submitChoice` is ALSO hardened against a disabled index, belt-and-braces).
          const nextState: ButtonState = problem.disabledChoices.includes(i) ? "disabled" : "normal";
          if (setState(choiceBtns[i]!, nextState)) changed = true;
        }
      }

      // M4b: the hint line, shown only once a hint has been used on THIS problem.
      const nextHintChildren: UINode[] = snapshot.hint !== null ? [hintLbl] : [];
      if (!sameChildren(hintArea, nextHintChildren)) {
        hintArea.children = nextHintChildren;
        changed = true;
      }
      if (snapshot.hint !== null) {
        if (setText(hintLbl, `${strings.hintPrefix} ${snapshot.hint}`)) changed = true;
      }
    } else if (hintArea.children.length > 0) {
      // Left await_answer entirely (e.g. a killing skip) — drop any lingering hint line.
      hintArea.children = [];
      changed = true;
    }

    // M4b: the lifeline bar — disabled when out of charges, when "fifty" targets a typed problem,
    // or when hint/fifty was already applied to the CURRENT problem (idempotent-per-problem, so a
    // second press can't waste a charge the sim would refuse anyway).
    {
      const problem = snapshot.problem;
      const fiftyAlreadyUsed = problem !== null && problem.kind === "choice" && problem.disabledChoices.length > 0;
      const hintAlreadyUsed = snapshot.hint !== null;
      const fiftyAppliesToTyped = problem !== null && problem.kind === "typed";
      for (const kind of LIFELINE_KINDS) {
        const btn = lifelineBtns[kind];
        const nextLabel = strings.lifelineLabel(kind, lifelines[kind]);
        if (btn.label !== nextLabel) {
          btn.label = nextLabel;
          changed = true;
        }
        const outOfCharges = lifelines[kind] <= 0;
        const alreadyUsed = (kind === "hint" && hintAlreadyUsed) || (kind === "fifty" && fiftyAlreadyUsed);
        const disabled = outOfCharges || alreadyUsed || (kind === "fifty" && fiftyAppliesToTyped);
        if (setState(btn, disabled ? "disabled" : "normal")) changed = true;
      }
    }

    if (snapshot.phase === "teach") {
      if (setText(teachTextLbl, snapshot.teach ?? "")) changed = true;
      if (setText(teachFizzleLbl, strings.playerResultCue(snapshot.lastPlayer))) changed = true;
    }

    // Swap dynamicArea's content by PHASE (removing the inactive subtree from the tree entirely —
    // see the module doc on why opacity alone would leave hidden buttons hittable/focusable).
    const nextDynamicChildren: ContainerNode[] =
      snapshot.phase === "await_action"
        ? [actionMenu]
        : snapshot.phase === "await_answer"
          ? [answerArea]
          : snapshot.phase === "teach"
            ? [teachCard]
            : [];
    if (!sameChildren(dynamicArea, nextDynamicChildren)) {
      dynamicArea.children = nextDynamicChildren;
      changed = true;
    }

    const isOver = snapshot.phase === "won" || snapshot.phase === "lost";
    if (isOver) setText(bannerLbl, snapshot.phase === "won" ? strings.won : strings.lost);
    const nextBannerChildren: ContainerNode[] = isOver ? [bannerBox] : [];
    if (!sameChildren(bannerArea, nextBannerChildren)) {
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

  function drawScene(surface: UISurface, snapshot: CombatSnapshot, viewW: number, viewH: number): void {
    // The play region is the band between the top HUD strip and the top of the command box; the
    // sprites stand on two grass platforms within it (enemy upper-right, hero lower-left).
    const skyTop = topBar.rect.height > 0 ? topBar.rect.y + topBar.rect.height : 40;
    const groundTop = commandBox.rect.height > 0 ? commandBox.rect.y : viewH * 0.7;
    const playH = Math.max(80, groundTop - skyTop);
    const horizonY = skyTop + playH * 0.6;

    // --- sky ---------------------------------------------------------------------------------
    surface.rect(0, 0, viewW, viewH, MATE_PAL.skyBlue);
    surface.rect(0, skyTop, viewW, playH * 0.6, MATE_PAL.skyBlue);
    // a faint haze toward the horizon + a few soft cloud puffs
    surface.rect(0, skyTop + playH * 0.44, viewW, playH * 0.16, MATE_PAL.silver, 0.1);
    drawCloud(surface, viewW * 0.2, skyTop + playH * 0.16, playH * 0.05);
    drawCloud(surface, viewW * 0.78, skyTop + playH * 0.1, playH * 0.045);
    drawCloud(surface, viewW * 0.52, skyTop + playH * 0.26, playH * 0.04);

    // --- ground ------------------------------------------------------------------------------
    surface.rect(0, horizonY, viewW, groundTop - horizonY, MATE_PAL.greenMid);
    surface.rect(0, horizonY, viewW, Math.max(2, playH * 0.02), MATE_PAL.green); // lit horizon rim
    surface.rect(0, groundTop - Math.max(3, playH * 0.06), viewW, Math.max(3, playH * 0.06), MATE_PAL.greenDark);

    // --- platforms + sprites -----------------------------------------------------------------
    const enemyCx = viewW * 0.7;
    const enemyCy = skyTop + playH * 0.44;
    const heroCx = viewW * 0.28;
    const heroCy = groundTop - playH * 0.12;
    const platRx = Math.min(viewW * 0.15, 150);

    drawPlatform(surface, enemyCx, enemyCy, platRx * 0.9, platRx * 0.28);
    drawPlatform(surface, heroCx, heroCy, platRx, platRx * 0.3);

    // Bigger, tougher enemies loom larger: scale the base unit by playH, nudged up by maxHp
    // (combat 24 → base, boss 32 → a touch larger).
    const enemyU = Math.max(2.4, (playH * 0.4) / 22) * (1 + (snapshot.enemy.maxHp - 24) / 90);
    const heroU = Math.max(2.4, (playH * 0.34) / 28);
    ENEMY_SPRITE_DRAW[snapshot.enemy.sprite](surface, enemyCx, enemyCy + platRx * 0.14, enemyU);
    drawHero(surface, heroCx, heroCy + platRx * 0.16, heroU);

    // A subtle dark strip behind the top HUD so the title/grade stay legible over the sky.
    surface.rect(0, 0, viewW, skyTop, MATE_PAL.ink, 0.5);
  }

  function drawFx(surface: UISurface, snapshot: CombatSnapshot): void {
    if (snapshot.phase !== "await_answer" || snapshot.problem === null) return;
    const problem = snapshot.problem;
    const accent = TOPIC_ACCENT[problem.topic];
    // Category header strip along the top of the question banner (inside its border).
    const br = promptBanner.rect;
    if (br.width > 0) surface.rect(br.x + 1, br.y + 1, br.width - 2, 5, accent);
    // A/B/C colour frames around the choice tiles (a plain button carries no per-instance colour).
    if (problem.kind === "choice") {
      for (let i = 0; i < CHOICE_SLOTS; i++) {
        const btn = choiceBtns[i]!;
        if (btn.label.length === 0 || btn.rect.width === 0) continue;
        const eliminated = problem.disabledChoices.includes(i);
        drawTileFrame(surface, btn.rect, eliminated ? MATE_PAL.crimson : TILE_COLORS[i % TILE_COLORS.length]!, eliminated);
      }
    }
  }

  return { root, refresh, drawScene, drawBars, drawFx };
}

/** A quiz-tile frame: a drop shadow + a thick coloured ring hugging the button's rect. A 50-50'd
 * ("eliminated") tile also gets a dim overlay + a red bar so it reads as struck out. */
function drawTileFrame(surface: UISurface, rect: Rect, color: string, eliminated: boolean): void {
  const { x, y, width: w, height: h } = rect;
  const t = 3; // ring thickness (drawn OUTSIDE the button so it never covers the label)
  surface.rect(x - t + 3, y - t + 4, w + 2 * t, h + 2 * t, MATE_PAL.ink, 0.3); // drop shadow
  surface.rect(x - t, y - t, w + 2 * t, t, color); // top
  surface.rect(x - t, y + h, w + 2 * t, t, color); // bottom
  surface.rect(x - t, y - t, t, h + 2 * t, color); // left
  surface.rect(x + w, y - t, t, h + 2 * t, color); // right
  if (eliminated) {
    surface.rect(x, y, w, h, MATE_PAL.ink, 0.5); // dim the struck-out tile
    surface.rect(x, y + h / 2 - 2, w, 4, MATE_PAL.crimson, 0.9); // strike bar
  }
}

/** A flat elliptical grass platform (stacked rows), with a shadow skirt + a lit top rim — the
 * ground the combatants stand on, matching the map screen's rect-only prop idiom. */
function drawPlatform(surface: UISurface, cx: number, cy: number, rx: number, ry: number): void {
  ellipse(surface, cx, cy + ry * 0.18, rx * 0.98, ry * 0.9, MATE_PAL.ink, 0.22); // shadow skirt
  ellipse(surface, cx, cy, rx, ry, MATE_PAL.greenDark);
  ellipse(surface, cx, cy - ry * 0.25, rx * 0.94, ry * 0.6, MATE_PAL.green); // lit top
}

/** Fill an axis-aligned ellipse as stacked horizontal rows (rect-only; no canvas arc). */
function ellipse(surface: UISurface, cx: number, cy: number, rx: number, ry: number, color: string, alpha = 1): void {
  const rows = Math.max(4, Math.round(ry * 2));
  const rh = (ry * 2) / rows;
  for (let i = 0; i < rows; i++) {
    const yy = cy - ry + i * rh;
    const t = (yy + rh / 2 - cy) / ry; // -1..1 at the row centre
    const w = 2 * rx * Math.sqrt(Math.max(0, 1 - t * t));
    if (w > 1) surface.rect(cx - w / 2, yy, w, rh + 1, color, alpha);
  }
}

/** A small soft cloud puff (a few overlapping pale rects). */
function drawCloud(surface: UISurface, cx: number, cy: number, r: number): void {
  surface.rect(cx - r * 2, cy - r * 0.5, r * 4, r, MATE_PAL.white, 0.5);
  surface.rect(cx - r * 1.2, cy - r, r * 2.4, r * 1.6, MATE_PAL.white, 0.5);
  surface.rect(cx + r * 0.4, cy - r * 1.2, r * 1.6, r * 1.4, MATE_PAL.white, 0.45);
}
