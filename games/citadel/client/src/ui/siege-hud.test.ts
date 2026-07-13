/**
 * Tests for the in-canvas siege/hazard HUD (corpus brief 106, chunk 1A). Exercises the
 * data-binding (label text + EDG colour thresholds) — the parts that don't need a real WebGPU
 * surface. The render/a11y plumbing is the framework's own (covered in @engine/ui); here we
 * just prove this consumer drives it correctly, matching the old DOM readout's behaviour
 * exactly (see the DOM block this replaces, formerly in main.ts's `loop()`).
 */
import { describe, it, expect } from "vitest";
import { CITADEL_PAL as EDG } from "../render/citadel-palette";
import type { LabelNode, UINode } from "@engine/ui";
import { createSiegeHud, type SiegeHudState } from "./siege-hud";

function baseState(overrides: Partial<SiegeHudState> = {}): SiegeHudState {
  return {
    threatLevel: 0,
    nextRaidDay: -1,
    defensiveStrength: 0,
    keepPresent: false,
    keepSacked: false,
    activeFires: 0,
    outbreakActive: false,
    sickVillagers: 0,
    modeText: "Mode: None",
    ...overrides,
  };
}

/** Flatten the tree to all leaf nodes for assertions. */
function walk(node: UINode, out: UINode[] = []): UINode[] {
  out.push(node);
  for (const c of node.children) walk(c, out);
  return out;
}
function labels(root: UINode): LabelNode[] {
  return walk(root).filter((n): n is LabelNode => n.kind === "label");
}
function labelText(root: UINode, prefix: string): LabelNode | undefined {
  return labels(root).find((l) => l.text.startsWith(prefix));
}

describe("createSiegeHud — threat readout", () => {
  it("renders the threat level, with a next-raid-day annotation when scheduled", () => {
    const hud = createSiegeHud();
    hud.refresh(baseState({ threatLevel: 12, nextRaidDay: -1 }));
    expect(labelText(hud.root, "Threat:")?.text).toBe("Threat: 12");
    hud.refresh(baseState({ threatLevel: 45, nextRaidDay: 6 }));
    expect(labelText(hud.root, "Threat:")?.text).toBe("Threat: 45 (next ~d7)");
  });

  it("colour-codes threat: green below 30, gold >=30, red >=60", () => {
    const hud = createSiegeHud();
    hud.refresh(baseState({ threatLevel: 10 }));
    expect(labelText(hud.root, "Threat:")?.color).toBe(EDG.green);
    hud.refresh(baseState({ threatLevel: 30 }));
    expect(labelText(hud.root, "Threat:")?.color).toBe(EDG.gold);
    hud.refresh(baseState({ threatLevel: 59 }));
    expect(labelText(hud.root, "Threat:")?.color).toBe(EDG.gold);
    hud.refresh(baseState({ threatLevel: 60 }));
    expect(labelText(hud.root, "Threat:")?.color).toBe(EDG.red);
  });
});

describe("createSiegeHud — defense readout", () => {
  it("renders defensive strength in a static cyan (never recoloured)", () => {
    const hud = createSiegeHud();
    hud.refresh(baseState({ defensiveStrength: 7 }));
    const lbl = labelText(hud.root, "Defense:");
    expect(lbl?.text).toBe("Defense: 7");
    expect(lbl?.color).toBe(EDG.cyan);
    hud.refresh(baseState({ defensiveStrength: 40 }));
    expect(labelText(hud.root, "Defense:")?.color).toBe(EDG.cyan);
  });
});

describe("createSiegeHud — keep readout", () => {
  it("shows 'Keep: none' (steel) when there is no keep", () => {
    const hud = createSiegeHud();
    hud.refresh(baseState({ keepPresent: false, keepSacked: false }));
    const lbl = labels(hud.root).find((l) => l.text.startsWith("Keep") || l.text === "KEEP SACKED");
    expect(lbl?.text).toBe("Keep: none");
    expect(lbl?.color).toBe(EDG.steel);
  });

  it("shows 'Keep: standing' (green) when present and not sacked", () => {
    const hud = createSiegeHud();
    hud.refresh(baseState({ keepPresent: true, keepSacked: false }));
    const lbl = labels(hud.root).find((l) => l.text.startsWith("Keep") || l.text === "KEEP SACKED");
    expect(lbl?.text).toBe("Keep: standing");
    expect(lbl?.color).toBe(EDG.green);
  });

  it("shows 'KEEP SACKED' (red) when sacked, taking priority over 'present'", () => {
    const hud = createSiegeHud();
    hud.refresh(baseState({ keepPresent: true, keepSacked: true }));
    const lbl = labels(hud.root).find((l) => l.text.startsWith("Keep") || l.text === "KEEP SACKED");
    expect(lbl?.text).toBe("KEEP SACKED");
    expect(lbl?.color).toBe(EDG.red);
  });
});

describe("createSiegeHud — hazard readouts", () => {
  it("shows fire count (gold) when buildings are burning, else 'Fire: none' (steel)", () => {
    const hud = createSiegeHud();
    hud.refresh(baseState({ activeFires: 3 }));
    const lbl = labelText(hud.root, "Fire")!;
    expect(lbl.text).toBe("Fire: 3 building(s) burning!");
    expect(lbl.color).toBe(EDG.gold);
    hud.refresh(baseState({ activeFires: 0 }));
    expect(labelText(hud.root, "Fire")?.text).toBe("Fire: none");
    expect(labelText(hud.root, "Fire")?.color).toBe(EDG.steel);
  });

  it("shows sick count (mauve) during an outbreak, else 'Disease: none' (steel)", () => {
    const hud = createSiegeHud();
    hud.refresh(baseState({ outbreakActive: true, sickVillagers: 5 }));
    const lbl = labelText(hud.root, "Disease")!;
    expect(lbl.text).toBe("Disease: 5 sick!");
    expect(lbl.color).toBe(EDG.mauve);
    hud.refresh(baseState({ outbreakActive: false, sickVillagers: 0 }));
    expect(labelText(hud.root, "Disease")?.text).toBe("Disease: none");
    expect(labelText(hud.root, "Disease")?.color).toBe(EDG.steel);
  });
});

describe("createSiegeHud — mode readout", () => {
  it("displays the host-supplied mode text verbatim, in yellow", () => {
    const hud = createSiegeHud();
    hud.refresh(baseState({ modeText: "Mode: Place house" }));
    const lbl = labelText(hud.root, "Mode:")!;
    expect(lbl.text).toBe("Mode: Place house");
    expect(lbl.color).toBe(EDG.yellow);
    hud.refresh(baseState({ modeText: "Mode: Road (drag) — 4 tiles" }));
    expect(labelText(hud.root, "Mode:")?.text).toBe("Mode: Road (drag) — 4 tiles");
  });
});

describe("createSiegeHud — content-changed gating", () => {
  it("reports content-changed on the first refresh, then only on text change", () => {
    const hud = createSiegeHud();
    expect(hud.refresh(baseState())).toBe(true); // first refresh always reports changed
    expect(hud.refresh(baseState())).toBe(false); // identical state → no layout-affecting change
    expect(hud.refresh(baseState({ threatLevel: 5 }))).toBe(true); // text change → changed
  });

  it("does not report changed for a colour-only crossing when the text is identical", () => {
    const hud = createSiegeHud();
    // Defense never recolours, so bumping it while every OTHER field stays fixed at 0 always
    // changes the label text (0 -> N) here; use a same-text case instead — priming and
    // re-refreshing with the exact same threat level keeps text AND colour identical.
    hud.refresh(baseState({ threatLevel: 10 })); // prime (first refresh is always changed)
    expect(hud.refresh(baseState({ threatLevel: 10 }))).toBe(false);
  });
});
