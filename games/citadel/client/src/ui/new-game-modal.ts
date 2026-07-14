/**
 * Citadel — the new-game mode picker, rendered IN-CANVAS via `@engine/ui` (brief 103 scope 1).
 *
 * Citadel's ruleset is chosen ONCE, at founding: cozy (the default — threats dent happiness and
 * always recover) or challenge (the sharp path: fire razes, disease kills, a raid can sack the
 * keep). Per decision #19 the sim has NO mode enum — the mode is a preset of the flat bootstrap
 * flags the solo worker already takes, so this picker's only job is to hand the host one of two
 * strings and let it call `client.init(..., mode)`.
 *
 * Shape mirrors [settings-modal.ts](settings-modal.ts): a retained `@engine/ui` tree built ONCE
 * (a centred `panel` dialog), the host lays it out at a computed screen centre, renders it, and
 * reconciles an a11y mirror each frame; ONE input dispatcher + ONE a11y mirror wire to `root`.
 * Render/input only — no sim, no determinism impact.
 *
 * It differs from the settings modal in one way that matters: it is **not dismissable**. There is
 * no Close button and the host does NOT wire Escape to it, because until a mode is chosen there is
 * no game — `client.init()` has not been called and the sim has not started. `choose()` fires the
 * host's callback and closes; the modal is then inert for the rest of the session (a mode change
 * means a new game, and every mode flag is persisted in `CitadelSave`, so a load replays under the
 * rules it was saved with).
 */
import { CITADEL_PAL as EDG } from "../render/citadel-palette";
import { panel, box, label, button } from "@engine/ui";
import type { ContainerNode } from "@engine/ui";

/** The two solo rulesets. Matches the `mode` field on the worker's `init` message. */
export type GameMode = "cozy" | "challenge";

/** One mode's pitch: what the button says and what the player is signing up for. */
interface ModeDef {
  readonly mode: GameMode;
  readonly button: string;
  /** A few short lines — `@engine/ui`'s UNSCII pixel font is 8px/glyph (wider than the old
   *  5px bitmap font it replaced), so keep each line well under the dialog width. */
  readonly lines: readonly string[];
}

const MODES: readonly ModeDef[] = [
  {
    mode: "cozy",
    button: "Cozy",
    lines: [
      "A living town is waiting for you.",
      "Setbacks pass: fires burn out, the sick recover,",
      "raiders take a little and leave. Nothing is lost.",
    ],
  },
  {
    mode: "challenge",
    button: "Challenge",
    lines: [
      "An empty valley, and no grace period.",
      "Fire razes what it takes, plague kills, and a raid",
      "can sack your keep. Survive, or be sacked.",
    ],
  },
];

export interface NewGameModalConfig {
  /** Called once, with the chosen ruleset — the host inits the sim with it. */
  readonly onChoose: (mode: GameMode) => void;
}

export class NewGameModal {
  /** The dialog root — the host lays it out (centred), renders it, and wires a dispatcher + mirror. */
  readonly root: ContainerNode;

  private open: boolean;
  private readonly cfg: NewGameModalConfig;

  constructor(cfg: NewGameModalConfig, opts: { readonly openAtStart: boolean }) {
    this.cfg = cfg;
    this.open = opts.openAtStart;

    // One column per mode: the button on top, its pitch beneath it. The buttons are the only
    // interactive nodes in the tree, so Tab order is cozy → challenge.
    const columns = MODES.map((m) =>
      box({ direction: "column", gap: 6, align: "start" }, [
        button(m.button, { onActivate: () => this.choose(m.mode) }),
        ...m.lines.map((line) => label(line, { muted: true })),
      ]),
    );

    this.root = panel({ direction: "column", gap: 14, align: "stretch" }, [
      label("Found your settlement", { color: EDG.gold }),
      label("Choose a ruleset. It holds for the whole game.", { muted: true }),
      box({ direction: "column", gap: 14, align: "stretch" }, columns),
    ]);
  }

  isOpen(): boolean {
    return this.open;
  }

  /** Commit a ruleset: close the picker, then hand the mode to the host (which starts the sim). */
  choose(mode: GameMode): void {
    if (!this.open) return; // a second activation (e.g. a queued key event) must not re-init the sim
    this.open = false;
    this.cfg.onChoose(mode);
  }
}
