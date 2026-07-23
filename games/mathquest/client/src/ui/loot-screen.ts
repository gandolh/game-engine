/**
 * MateQuest M4a — the loot screen (corpus/todos/2026-07-23-mathquest-M4a-progression-loot.md): a
 * banner ("Pradă!"), 3 item cards (name + a `bonusSummary` line), and a "Sari peste" (skip) button
 * that posts `choose-loot` with `-1`. A retained `@engine/ui` tree built ONCE
 * (`createLootScreen`), mirroring `run-over-screen.ts`'s build-once + per-frame `refresh()` shape.
 */
import { box, button, label, panel } from "@engine/ui";
import type { ButtonNode, ContainerNode, LabelNode } from "@engine/ui";
import type { ItemView } from "@mathquest/sim-core";
import { MATE_PAL } from "../render/mate-palette";
import { STRINGS } from "../strings";

/** `rollLoot` always returns exactly 3 offers — see `run/loot.ts`. Fixed slot count mirrors
 * `combat-screen.ts`'s `CHOICE_SLOTS` convention. */
const OFFER_SLOTS = 3;

/** Actions the screen's buttons invoke — wired once at creation. */
export interface LootScreenActions {
  /** Posts `choose-loot` with the taken offer's index. */
  chooseLoot(index: number): void;
  /** Posts `choose-loot` with `-1` (skip). */
  skipLoot(): void;
}

interface ItemCard {
  readonly card: ContainerNode;
  readonly btn: ButtonNode;
  readonly bonusLbl: LabelNode;
}

/** The retained loot screen: its root node plus `refresh()`. */
export interface LootScreen {
  readonly root: ContainerNode;
  /** Re-bind every item card's name/bonus from the latest `offers`. Call once per frame while
   * `mode === "loot"`. Returns `true` when content changed (mirrors `run-over-screen.ts`'s
   * `refresh`). */
  refresh(offers: readonly ItemView[]): boolean;
}

function makeItemCard(index: number, actions: LootScreenActions): ItemCard {
  const btn = button("", { onActivate: () => actions.chooseLoot(index) });
  const bonusLbl = label("", { color: MATE_PAL.green, maxWidth: 200 });
  const card = panel({ direction: "column", gap: 6, align: "center", padding: 12 }, [btn, bonusLbl]);
  return { card, btn, bonusLbl };
}

export function createLootScreen(actions: LootScreenActions): LootScreen {
  const titleLbl = label(STRINGS.lootTitle, { color: MATE_PAL.gold, scale: 3 });
  const cards: readonly ItemCard[] = Array.from({ length: OFFER_SLOTS }, (_, i) => makeItemCard(i, actions));
  const offerRow = box({ direction: "row", gap: 16 }, cards.map((c) => c.card));
  const skipBtn = button(STRINGS.lootSkip, { onActivate: () => actions.skipLoot() });
  const root = panel({ direction: "column", gap: 16, align: "center", padding: 24 }, [titleLbl, offerRow, skipBtn]);

  let changed = false;
  let firstRefresh = true;

  function refresh(offers: readonly ItemView[]): boolean {
    changed = false;
    for (let i = 0; i < OFFER_SLOTS; i++) {
      const item = offers[i];
      const nextLabel = item?.name ?? "";
      const nextBonus = item !== undefined ? STRINGS.bonusSummary(item.bonus) : "";
      const c = cards[i]!;
      if (c.btn.label !== nextLabel) {
        c.btn.label = nextLabel;
        changed = true;
      }
      if (c.bonusLbl.text !== nextBonus) {
        c.bonusLbl.text = nextBonus;
        changed = true;
      }
    }
    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  return { root, refresh };
}
