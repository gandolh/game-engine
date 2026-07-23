/**
 * MateQuest M4a — the level-up screen (corpus/todos/2026-07-23-mathquest-M4a-progression-loot.md):
 * a banner ("Ai avansat!") plus a row of upgrade-offer cards (label + desc, both display-ready
 * text straight from the sim's `UpgradeOffer` — see `run/progression.ts`'s `describeUpgrade`), one
 * per `chooseLevelUp` index. A retained `@engine/ui` tree built ONCE (`createLevelUpScreen`),
 * mirroring `run-over-screen.ts`'s build-once + per-frame `refresh()` shape.
 *
 * M5 slice 2 (corpus/todos/2026-07-23-mathquest-M5-i18n-toggle.md) adds `createLevelUpScreen`'s
 * `strings` param for this screen's OWN chrome (the banner title) — rebuilt on a locale toggle,
 * like every other widget screen (see `strings.ts`'s module doc). `UpgradeOffer.label`/`.desc`
 * are display-ready RO text straight from `run/progression.ts` (out of this slice's scope — the
 * brief's locked file list localizes generator prompts/teach text + enemy name/title only; upgrade
 * offer text stays RO in both locales until a future slice widens the sim-emitted-text seam).
 */
import { box, button, label, panel } from "@engine/ui";
import type { ButtonNode, ContainerNode, LabelNode } from "@engine/ui";
import type { UpgradeOffer } from "@mathquest/sim-core";
import { MATE_PAL } from "../render/mate-palette";
import type { Strings } from "../strings";

/** The sim always calls `offerUpgrades` with its default `count` (2) — see `sim-bootstrap.ts`'s
 * `proceed()`. Fixed slot count mirrors `combat-screen.ts`'s `CHOICE_SLOTS` convention. */
const OFFER_SLOTS = 2;

/** Actions the screen's offer buttons invoke — wired once at creation. */
export interface LevelUpScreenActions {
  chooseUpgrade(index: number): void;
}

interface OfferCard {
  readonly card: ContainerNode;
  readonly btn: ButtonNode;
  readonly descLbl: LabelNode;
}

/** The retained level-up screen: its root node plus `refresh()`. */
export interface LevelUpScreen {
  readonly root: ContainerNode;
  /** Re-bind every offer card's label/desc from the latest `offers`. Call once per frame while
   * `mode === "level_up"`. Returns `true` when content changed (mirrors `run-over-screen.ts`'s
   * `refresh`). */
  refresh(offers: readonly UpgradeOffer[]): boolean;
}

function makeOfferCard(index: number, actions: LevelUpScreenActions): OfferCard {
  const btn = button("", { onActivate: () => actions.chooseUpgrade(index) });
  const descLbl = label("", { color: MATE_PAL.steel, maxWidth: 220 });
  const card = panel({ direction: "column", gap: 6, align: "center", padding: 12 }, [btn, descLbl]);
  return { card, btn, descLbl };
}

export function createLevelUpScreen(actions: LevelUpScreenActions, strings: Strings): LevelUpScreen {
  const titleLbl = label(strings.levelUpTitle, { color: MATE_PAL.gold, scale: 3 });
  const cards: readonly OfferCard[] = Array.from({ length: OFFER_SLOTS }, (_, i) => makeOfferCard(i, actions));
  const offerRow = box({ direction: "row", gap: 16 }, cards.map((c) => c.card));
  const root = panel({ direction: "column", gap: 16, align: "center", padding: 24 }, [titleLbl, offerRow]);

  let changed = false;
  let firstRefresh = true;

  function refresh(offers: readonly UpgradeOffer[]): boolean {
    changed = false;
    for (let i = 0; i < OFFER_SLOTS; i++) {
      const offer = offers[i];
      const nextLabel = offer?.label ?? "";
      const nextDesc = offer?.desc ?? "";
      const c = cards[i]!;
      if (c.btn.label !== nextLabel) {
        c.btn.label = nextLabel;
        changed = true;
      }
      if (c.descLbl.text !== nextDesc) {
        c.descLbl.text = nextDesc;
        changed = true;
      }
    }
    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  return { root, refresh };
}
