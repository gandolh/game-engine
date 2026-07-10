/**
 * Citadel siege/hazard HUD — the last gameplay DOM readouts, migrated IN-CANVAS via
 * `@engine/ui` (corpus brief 106, chunk 1A).
 *
 * Replaces the old DOM `#hud-threat`/`#hud-defense`/`#hud-keep`/`#hud-fire`/`#hud-disease`
 * spans (Phase 4 siege HUD + Phase 4.5 hazard HUD) plus `#lbl-mode` (the placement-mode
 * readout) — the last row of the old bottom `#hud` bar besides Settings/Save/Load. Read-only:
 * no buttons, so it needs no input dispatcher of its own for ACTIVATION, but the host still
 * gives it a click-consuming dispatcher (mirrors `villager-panel.ts`'s "FIX B") so a stray
 * click on the readout doesn't fall through to world build/pan.
 *
 * Mirrors the `resource-hud.ts` / `villager-panel.ts` consumer pattern: the tree is built ONCE
 * (`createSiegeHud`) and kept across frames; `refresh(state)` re-textures the labels in place
 * from the latest snapshot and returns whether LAYOUT-AFFECTING content changed (text), so the
 * host can gate `computeLayout` + the a11y-mirror reconcile behind it.
 *
 * EDG32-only: every colour is an `EDG.*` constant. Colour thresholds mirror the DOM HUD this
 * replaces exactly:
 *  - threat: red ≥60 / gold ≥30 / green below.
 *  - defense: static cyan (the old CSS never recoloured it at runtime).
 *  - keep: red when sacked, green when standing, steel when there is no keep.
 *  - fire: gold when ≥1 building burning, steel when none.
 *  - disease: mauve during an active outbreak, steel when none.
 *  - mode: static yellow (mirrors the old `#lbl-mode { color: #fee761 }`, i.e. `EDG.yellow`).
 */
import { EDG } from "@engine/core";
import { box, label, panel } from "@engine/ui";
import type { ContainerNode, LabelNode } from "@engine/ui";

/** The live values the HUD displays. Supplied each frame by the host from the snapshot. */
export interface SiegeHudState {
  /** Current threat level (0-100-ish scale, mirrors the old readout). */
  threatLevel: number;
  /** Day index (0-based) of the next scheduled raid, or -1 when none is scheduled. */
  nextRaidDay: number;
  /** Total defensive strength (towers/garrison/walls). */
  defensiveStrength: number;
  /** Whether a keep exists in the settlement. */
  keepPresent: boolean;
  /** Whether the (sole) keep has been sacked. */
  keepSacked: boolean;
  /** Count of buildings currently on fire. */
  activeFires: number;
  /** Whether a disease outbreak is currently active. */
  outbreakActive: boolean;
  /** Count of currently-sick villagers (meaningful when `outbreakActive`). */
  sickVillagers: number;
  /**
   * The precomputed "Mode: …" placement-mode readout (the old `#lbl-mode` text), already
   * formatted by the host's `updateModeLabel`/`modeLabelText` logic — this widget just displays
   * it verbatim so the host's existing mode-string derivation (drag-length suffix, upgrade
   * hint, tier lock) doesn't need to be duplicated here.
   */
  modeText: string;
}

/** The retained siege/hazard HUD: its root node (laid out + rendered by the host) + refresh(). */
export interface SiegeHud {
  /** The widget tree root — pass to `computeLayout` / `renderTree` / `mirror.update`. */
  readonly root: ContainerNode;
  /**
   * Re-bind every label from `state`. Call once per frame.
   *
   * Returns `true` when LAYOUT-AFFECTING content changed this call (any label text changed),
   * so the host can gate the expensive `computeLayout` + a11y-mirror reconcile behind it.
   * Colour-only changes don't set it. The first call always returns `true`.
   */
  refresh(state: SiegeHudState): boolean;
}

/** Threat readout colour: red ≥60 (imminent), gold ≥30 (building), green below. */
function threatColor(threatLevel: number): string {
  return threatLevel >= 60 ? EDG.red : threatLevel >= 30 ? EDG.gold : EDG.green;
}

/**
 * Build the retained siege/hazard HUD widget tree. The tree is created once; `refresh` mutates
 * it per frame (no re-allocation). Read-only — no buttons, no actions.
 *
 * Tree shape: panel(row) of two named regions (leading label → the a11y region's name) plus a
 * bare trailing label (self-descriptive text needs no heading):
 *   ├ box "Status"  [threatLbl, defenseLbl, keepLbl]
 *   ├ box "Hazards" [fireLbl, diseaseLbl]
 *   └ modeLbl
 */
export function createSiegeHud(): SiegeHud {
  const threatLbl = label("Threat: 0", { color: threatColor(0) });
  const defenseLbl = label("Defense: 0", { color: EDG.cyan });
  const keepLbl = label("Keep: none", { color: EDG.steel });
  const fireLbl = label("Fire: none", { color: EDG.steel });
  const diseaseLbl = label("Disease: none", { color: EDG.steel });
  const modeLbl = label("Mode: None", { color: EDG.yellow });

  const statusGroup = box({ direction: "row", gap: 10, align: "center" }, [
    label("Status"),
    threatLbl,
    defenseLbl,
    keepLbl,
  ]);
  const hazardGroup = box({ direction: "row", gap: 10, align: "center" }, [
    label("Hazards"),
    fireLbl,
    diseaseLbl,
  ]);
  // No wrapping region/heading label for the mode readout: its own text is already
  // self-descriptive ("Mode: Place house"), so a leading "Mode" label would just repeat the
  // word (mirrors villager-panel.ts's bare fsmLbl/cargoLbl, which skip a heading for the same
  // reason).
  const root = panel({ direction: "row", gap: 16, align: "center" }, [
    statusGroup,
    hazardGroup,
    modeLbl,
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

  function refresh(state: SiegeHudState): boolean {
    changed = false;

    setText(
      threatLbl,
      `Threat: ${state.threatLevel}` + (state.nextRaidDay >= 0 ? ` (next ~d${state.nextRaidDay + 1})` : ""),
    );
    setColor(threatLbl, threatColor(state.threatLevel));

    setText(defenseLbl, `Defense: ${state.defensiveStrength}`);

    if (state.keepSacked) {
      setText(keepLbl, "KEEP SACKED");
      setColor(keepLbl, EDG.red);
    } else if (state.keepPresent) {
      setText(keepLbl, "Keep: standing");
      setColor(keepLbl, EDG.green);
    } else {
      setText(keepLbl, "Keep: none");
      setColor(keepLbl, EDG.steel);
    }

    if (state.activeFires > 0) {
      setText(fireLbl, `Fire: ${state.activeFires} building(s) burning!`);
      setColor(fireLbl, EDG.gold);
    } else {
      setText(fireLbl, "Fire: none");
      setColor(fireLbl, EDG.steel);
    }

    if (state.outbreakActive) {
      setText(diseaseLbl, `Disease: ${state.sickVillagers} sick!`);
      setColor(diseaseLbl, EDG.mauve);
    } else {
      setText(diseaseLbl, "Disease: none");
      setColor(diseaseLbl, EDG.steel);
    }

    setText(modeLbl, state.modeText);

    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  return { root, refresh };
}
