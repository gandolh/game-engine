/**
 * RESEARCH PROTOTYPE (spec 2026-10-27-mathquest-immediate-mode-research, built 2026-10-28): the
 * combat screen rebuilt on the immediate-mode layer in `./imgui/immediate.ts`. `main.ts` uses it
 * only under the `?imgui` URL flag; the default is the retained `./combat-screen.ts`.
 *
 * It implements the same `CombatScreen` interface, lays out the same tree (same kinds, order,
 * layout props, texts and states — `combat-screen-immediate.test.ts` diffs the two trees for every
 * phase), and draws the same scene. The difference is where the screen's state lives: `refresh`
 * re-describes the whole screen from the snapshot each frame, so there is no node variable, no
 * `setText`, no subtree swapping and no `firstRefresh` here. Button actions fire one frame after the
 * activation (the IMGUI click contract), from inside `refresh`.
 *
 * The scene/HP-bar/quiz-accent passes were already immediate in the retained screen (custom draws
 * over the laid-out rects); they are repeated here reading rects by key, using the retained file's
 * exported helpers.
 */
import type { ContainerNode, UISurface } from "@engine/ui";
import type { CombatSnapshot, LifelineCharges } from "@mathquest/sim-core";
import { LIFELINE_KINDS } from "@mathquest/sim-core";
import { MATE_PAL } from "../render/mate-palette";
import type { Strings } from "../strings";
import {
  CHOICE_SLOTS,
  HP_BAR_HEIGHT,
  HP_BAR_WIDTH,
  TILE_COLORS,
  TOPIC_ACCENT,
  drawCloud,
  drawPlatform,
  drawTileFrame,
  hpColor,
  type CombatScreen,
  type CombatScreenActions,
} from "./combat-screen";
import { createImmediateUi } from "./imgui/immediate";
import { ENEMY_SPRITE_DRAW, drawHero } from "./sprites";

export function createImmediateCombatScreen(actions: CombatScreenActions, strings: Strings): CombatScreen {
  const ui = createImmediateUi();
  const hpFill: Record<"enemy" | "warrior", string> = { enemy: MATE_PAL.red, warrior: MATE_PAL.green };

  /** The HP bar: a fixed track box holding a fill box sized to the HP fraction. */
  function hpBar(who: "enemy" | "warrior", hp: number, maxHp: number): void {
    const pct = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    ui.box(`${who}.hpTrack`, { width: HP_BAR_WIDTH, height: HP_BAR_HEIGHT, padding: 0 }, () => {
      ui.box(`${who}.hpFill`, { width: Math.round(HP_BAR_WIDTH * pct), height: HP_BAR_HEIGHT });
    });
    hpFill[who] = hpColor(hp, maxHp);
  }

  function build(s: CombatSnapshot, typedValue: string, lifelines: LifelineCharges): void {
    ui.box("root", { direction: "column", align: "stretch", gap: 0, padding: 0 }, () => {
      ui.box("topBar", { direction: "row", align: "center", padding: { top: 8, left: 16, right: 16, bottom: 4 } }, () => {
        ui.label("title", strings.title, { color: MATE_PAL.gold });
        ui.box("topBar.grow", { grow: 1 });
        ui.label("grade", strings.gradeReadout(s.grade), { color: MATE_PAL.gold });
      });

      ui.box("enemyRow", { direction: "row", padding: { top: 12, left: 16, right: 16, bottom: 0 } }, () => {
        ui.panel("enemyBox", { direction: "column", gap: 4 }, () => {
          ui.label("enemy.name", s.enemy.name, { color: MATE_PAL.cream, scale: 2 });
          ui.label("enemy.title", s.enemy.title, { color: MATE_PAL.steel });
          ui.box("enemy.hpRow", { direction: "row", gap: 8, align: "center" }, () => {
            hpBar("enemy", s.enemy.hp, s.enemy.maxHp);
            ui.label("enemy.hpText", `${s.enemy.hp}/${s.enemy.maxHp}`, { color: MATE_PAL.cream });
          });
          const intent = s.phase === "await_action" ? `${strings.enemyIntentPrefix} ${s.enemy.intent}` : "";
          ui.label("enemy.intent", intent, { color: MATE_PAL.gold });
        });
        ui.box("enemyRow.grow", { grow: 1 });
      });

      ui.box("midGrow", { grow: 1 });

      ui.box("warriorRow", { direction: "row", padding: { top: 0, left: 16, right: 16, bottom: 6 } }, () => {
        ui.box("warriorRow.grow", { grow: 1 });
        ui.panel("warriorBox", { direction: "column", gap: 4 }, () => {
          ui.label("warrior.name", strings.heroName, { color: MATE_PAL.cream, scale: 2 });
          ui.box("warrior.hpRow", { direction: "row", gap: 8, align: "center" }, () => {
            hpBar("warrior", s.warrior.hp, s.warrior.maxHp);
            ui.label("warrior.hpText", `${s.warrior.hp}/${s.warrior.maxHp}`, { color: MATE_PAL.cream });
          });
          const block = s.warrior.block > 0 ? `${strings.warriorBlockPrefix} ${s.warrior.block}` : "";
          ui.label("warrior.block", block, { color: MATE_PAL.skyBlue });
        });
      });

      ui.panel("commandBox", { direction: "column", gap: 8, padding: 14, align: "center" }, () => {
        ui.box("messageLine", { direction: "row", gap: 16, align: "center" }, () => {
          ui.label("turn", strings.turnLabel(s.turn), { color: MATE_PAL.steel });
          ui.label("cue.player", strings.playerResultCue(s.lastPlayer), { color: MATE_PAL.yellow });
          ui.label("cue.enemy", strings.enemyResultCue(s.lastEnemy, s.enemy.name), { color: MATE_PAL.salmon });
        });
        ui.box("dynamicArea", { direction: "column", gap: 8 }, () => {
          if (s.phase === "await_action") actionMenu();
          else if (s.phase === "await_answer") answerArea(s, typedValue, lifelines);
          else if (s.phase === "teach") teachCard(s);
        });
        ui.box("bannerArea", { direction: "column", gap: 0 }, () => {
          if (s.phase !== "won" && s.phase !== "lost") return;
          ui.box("bannerBox", { direction: "column", gap: 12, align: "center" }, () => {
            ui.label("banner", s.phase === "won" ? strings.won : strings.lost, { color: MATE_PAL.gold, scale: 3 });
            if (ui.button("restart", strings.restart)) actions.restart();
          });
        });
      });
    });
  }

  function actionMenu(): void {
    ui.box("actionMenu", { direction: "row", gap: 8 }, () => {
      if (ui.button("act.attack", strings.actionLabel.attack)) actions.chooseAction("attack");
      if (ui.button("act.heal", strings.actionLabel.heal)) actions.chooseAction("heal");
      if (ui.button("act.shield", strings.actionLabel.shield)) actions.chooseAction("shield");
    });
  }

  function answerArea(s: CombatSnapshot, typedValue: string, lifelines: LifelineCharges): void {
    const problem = s.problem;
    ui.box("answerArea", { direction: "column", gap: 10, align: "center" }, () => {
      ui.box("problemPanel", { direction: "row", gap: 28, align: "center" }, () => {
        ui.box("questionColumn", { direction: "column", gap: 10, align: "center" }, () => {
          ui.label("topicChip", problem !== null ? strings.topicName[problem.topic] : "", {
            color: problem !== null ? TOPIC_ACCENT[problem.topic] : MATE_PAL.cream,
          });
          ui.panel("promptBanner", { direction: "column", align: "center", padding: { top: 14, left: 20, right: 20, bottom: 12 } }, () => {
            ui.label("prompt", problem?.prompt ?? "", { color: MATE_PAL.white, scale: 3 });
          });
          ui.box("hintArea", { direction: "column", gap: 0, align: "center" }, () => {
            if (s.hint !== null) ui.label("hint", `${strings.hintPrefix} ${s.hint}`, { color: MATE_PAL.gold, maxWidth: 420 });
          });
          lifelineBar(s, lifelines);
        });
        ui.box("inputArea", { direction: "column", gap: 4, align: "center" }, () => {
          if (problem === null) return;
          if (problem.kind === "typed") typedInput(typedValue);
          else choiceRow(problem.choices, problem.disabledChoices);
        });
      });
    });
  }

  function lifelineBar(s: CombatSnapshot, lifelines: LifelineCharges): void {
    const problem = s.problem;
    const fiftyAlreadyUsed = problem !== null && problem.kind === "choice" && problem.disabledChoices.length > 0;
    const fiftyAppliesToTyped = problem !== null && problem.kind === "typed";
    ui.box("lifelineBar", { direction: "row", gap: 8 }, () => {
      for (const kind of LIFELINE_KINDS) {
        const alreadyUsed = (kind === "hint" && s.hint !== null) || (kind === "fifty" && fiftyAlreadyUsed);
        const disabled = lifelines[kind] <= 0 || alreadyUsed || (kind === "fifty" && fiftyAppliesToTyped);
        if (ui.button(`life.${kind}`, strings.lifelineLabel(kind, lifelines[kind]), { disabled })) actions.useLifeline(kind);
      }
    });
  }

  function typedInput(typedValue: string): void {
    const digit = (d: number): void => {
      if (ui.button(`digit.${d}`, String(d), { scale: 2 })) actions.appendDigit(d);
    };
    ui.box("typedGroup", { direction: "column", gap: 10, align: "center" }, () => {
      ui.panel("answerDisplay", { direction: "row", align: "center", padding: { top: 6, left: 24, right: 24, bottom: 6 } }, () => {
        ui.label("typed", typedValue.length > 0 ? typedValue : strings.typedPlaceholder, { color: MATE_PAL.cyan, scale: 3 });
      });
      ui.box("keypad", { direction: "column", gap: 6, align: "center" }, () => {
        for (const [row, digits] of [[1, 2, 3], [4, 5, 6], [7, 8, 9]].entries()) {
          ui.box(`keypad.row${row}`, { direction: "row", gap: 6 }, () => digits.forEach(digit));
        }
        ui.box("keypad.row3", { direction: "row", gap: 6 }, () => {
          if (ui.button("backspace", strings.backspace, { scale: 2 })) actions.backspace();
          digit(0);
          if (ui.button("submit", strings.submit, { scale: 2 })) actions.submit();
        });
      });
    });
  }

  function choiceRow(choices: readonly string[], disabledChoices: readonly number[]): void {
    ui.box("choiceRow", { direction: "row", gap: 16, align: "center" }, () => {
      for (let i = 0; i < CHOICE_SLOTS; i++) {
        if (ui.button(`choice.${i}`, choices[i] ?? "", { scale: 3, disabled: disabledChoices.includes(i) })) {
          actions.submitChoice(i);
        }
      }
    });
  }

  function teachCard(s: CombatSnapshot): void {
    ui.box("teachCard", { direction: "column", gap: 8 }, () => {
      ui.label("teach.title", strings.teachTitle, { color: MATE_PAL.gold });
      ui.label("teach.text", s.teach ?? "", { color: MATE_PAL.cream, maxWidth: 320 });
      if (ui.button("teach.continue", strings.continueLabel)) actions.acknowledgeTeach();
    });
  }

  // The first frame's root, so `root` is readable before any refresh (it is the same object after).
  let root: ContainerNode = ui.box("root", {}, undefined);
  const rectOf = (key: string): { x: number; y: number; width: number; height: number } =>
    ui.node(key)?.rect ?? { x: 0, y: 0, width: 0, height: 0 };

  return {
    get root() {
      return root;
    },

    refresh(snapshot, typedValue, lifelines) {
      const out = ui.frame(() => build(snapshot, typedValue, lifelines));
      root = out.root;
      return out.changed;
    },

    drawScene(surface: UISurface, snapshot: CombatSnapshot, viewW: number, viewH: number): void {
      const topBar = rectOf("topBar");
      const commandBox = rectOf("commandBox");
      const skyTop = topBar.height > 0 ? topBar.y + topBar.height : 40;
      const groundTop = commandBox.height > 0 ? commandBox.y : viewH * 0.7;
      const playH = Math.max(80, groundTop - skyTop);
      const horizonY = skyTop + playH * 0.6;
      surface.rect(0, 0, viewW, viewH, MATE_PAL.skyBlue);
      surface.rect(0, skyTop, viewW, playH * 0.6, MATE_PAL.skyBlue);
      surface.rect(0, skyTop + playH * 0.44, viewW, playH * 0.16, MATE_PAL.silver, 0.1);
      drawCloud(surface, viewW * 0.2, skyTop + playH * 0.16, playH * 0.05);
      drawCloud(surface, viewW * 0.78, skyTop + playH * 0.1, playH * 0.045);
      drawCloud(surface, viewW * 0.52, skyTop + playH * 0.26, playH * 0.04);
      surface.rect(0, horizonY, viewW, groundTop - horizonY, MATE_PAL.greenMid);
      surface.rect(0, horizonY, viewW, Math.max(2, playH * 0.02), MATE_PAL.green);
      surface.rect(0, groundTop - Math.max(3, playH * 0.06), viewW, Math.max(3, playH * 0.06), MATE_PAL.greenDark);
      const enemyCx = viewW * 0.7;
      const enemyCy = skyTop + playH * 0.44;
      const heroCx = viewW * 0.28;
      const heroCy = groundTop - playH * 0.12;
      const platRx = Math.min(viewW * 0.15, 150);
      drawPlatform(surface, enemyCx, enemyCy, platRx * 0.9, platRx * 0.28);
      drawPlatform(surface, heroCx, heroCy, platRx, platRx * 0.3);
      const enemyU = Math.max(2.4, (playH * 0.4) / 22) * (1 + (snapshot.enemy.maxHp - 24) / 90);
      const heroU = Math.max(2.4, (playH * 0.34) / 28);
      ENEMY_SPRITE_DRAW[snapshot.enemy.sprite](surface, enemyCx, enemyCy + platRx * 0.14, enemyU);
      drawHero(surface, heroCx, heroCy + platRx * 0.16, heroU);
      surface.rect(0, 0, viewW, skyTop, MATE_PAL.ink, 0.5);
    },

    drawBars(surface: UISurface): void {
      for (const who of ["enemy", "warrior"] as const) {
        const { x, y, width, height } = rectOf(`${who}.hpTrack`);
        surface.rect(x, y, width, height, MATE_PAL.navy);
        const fw = rectOf(`${who}.hpFill`).width;
        if (fw > 0) surface.rect(x, y, fw, height, hpFill[who]);
      }
    },

    drawFx(surface: UISurface, snapshot: CombatSnapshot): void {
      if (snapshot.phase !== "await_answer" || snapshot.problem === null) return;
      const problem = snapshot.problem;
      const br = rectOf("promptBanner");
      if (br.width > 0) surface.rect(br.x + 1, br.y + 1, br.width - 2, 5, TOPIC_ACCENT[problem.topic]);
      if (problem.kind !== "choice") return;
      for (let i = 0; i < CHOICE_SLOTS; i++) {
        const btn = ui.node(`choice.${i}`);
        if (btn === undefined || btn.kind !== "button" || btn.label.length === 0 || btn.rect.width === 0) continue;
        const eliminated = problem.disabledChoices.includes(i);
        drawTileFrame(surface, btn.rect, eliminated ? MATE_PAL.crimson : TILE_COLORS[i % TILE_COLORS.length]!, eliminated);
      }
    },
  };
}
