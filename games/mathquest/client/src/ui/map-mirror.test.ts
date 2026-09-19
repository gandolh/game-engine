/**
 * audit-52 — the spatial map's accessibility mirror.
 *
 * MateQuest is a children's educational game whose UI is entirely in-canvas, so the DOM mirror IS
 * the screen reader — there is no fallback markup behind it. When M3.1 replaced the flexbox map
 * with the custom-drawn spatial map, the map's mirror was dropped, leaving the roguelike's ONE
 * strategic decision reachable only by sighted pointer or by memorising the `1`..`9` bindings.
 *
 * These assert what the mirror SAYS, not merely that it exists. A mirror listing nine unlabelled
 * buttons passes an automated check and helps nobody.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRng } from "@engine/core";
import { generateMap } from "@mathquest/sim-core";
import type { RunView } from "@mathquest/sim-core";
import { getStrings } from "../strings";
import { createMapMirror, type MapMirror } from "./map-mirror";

function makeRun(overrides: Partial<RunView> = {}): RunView {
  const map = generateMap(createRng(7));
  const firstRow = map.nodes.filter((n) => n.row === 0).map((n) => n.id);
  return {
    map,
    currentId: null,
    reachableIds: firstRow,
    visitedIds: [],
    warriorHp: 30,
    warriorMaxHp: 40,
    level: 2,
    xp: 5,
    xpToNext: 20,
    stats: { atk: 0, maxHp: 0, block: 0, heal: 0 },
    inventory: [],
    lifelines: { fifty: 1, skip: 1, hint: 1 },
    mastery: {},
    ...overrides,
  } as RunView;
}

describe("map mirror", () => {
  let mount: HTMLElement;
  let mirror: MapMirror;
  let chosen: number[];

  beforeEach(() => {
    document.body.innerHTML = "";
    mount = document.createElement("div");
    document.body.appendChild(mount);
    chosen = [];
    mirror = createMapMirror(mount, (id) => chosen.push(id));
  });

  const buttons = (): HTMLButtonElement[] => [...mount.querySelectorAll("button")];

  it("exists in map mode, as a labelled landmark region", () => {
    const run = makeRun();
    mirror.update(run, getStrings("ro"), run.reachableIds);

    const region = mount.querySelector("[role='region']");
    expect(region).not.toBeNull();
    expect(region?.getAttribute("aria-label")).toBe(getStrings("ro").mapMirrorLabel);
  });

  it("lists EXACTLY the reachable nodes — no more, no fewer", () => {
    const run = makeRun();
    mirror.update(run, getStrings("ro"), run.reachableIds);

    expect(buttons()).toHaveLength(run.reachableIds.length);
    expect(run.reachableIds.length).toBeGreaterThan(0);
    // Not every node on the map — only the ones that are actually a choice right now.
    expect(buttons().length).toBeLessThan(run.map.nodes.length);
  });

  it("says what each node IS — kind, difficulty and zone, not just a number", () => {
    const run = makeRun();
    const strings = getStrings("ro");
    mirror.update(run, strings, run.reachableIds);

    const byId = new Map(run.map.nodes.map((n) => [n.id, n]));
    buttons().forEach((btn, i) => {
      const node = byId.get(run.reachableIds[i]!)!;
      const text = btn.textContent ?? "";
      if (node.type === "rest") {
        expect(text).toContain(strings.legendLabel.rest);
      } else {
        expect(text, `node ${String(node.id)}`).toContain(strings.legendLabel[node.type]);
        expect(text, `node ${String(node.id)} grade`).toContain(strings.gradeLabel[node.grade]);
      }
      expect(text, "zone").toContain(strings.zoneName[node.zone]);
      // The 1-based index a player would press.
      expect(text).toContain(String(i + 1));
    });
  });

  it("does NOT use the glyph-prefixed nodeLabel, which reads as symbol names", () => {
    const run = makeRun();
    mirror.update(run, getStrings("ro"), run.reachableIds);
    const all = mount.textContent ?? "";
    for (const glyph of ["†", "★", "♥", "♠"]) {
      expect(all, `glyph ${glyph} leaked into the spoken label`).not.toContain(glyph);
    }
  });

  it("carries the run's own state — level, HP and progress", () => {
    const run = makeRun({ level: 3, warriorHp: 12, warriorMaxHp: 44, visitedIds: [1, 2, 3] });
    mirror.update(run, getStrings("ro"), run.reachableIds);
    const text = mount.textContent ?? "";
    for (const n of ["3", "12", "44"]) expect(text).toContain(n);
  });

  it("tells the player HOW to act — the visual affordance is unavailable to them", () => {
    const run = makeRun();
    const strings = getStrings("ro");
    mirror.update(run, strings, run.reachableIds);
    expect(mount.textContent ?? "").toContain(strings.mapMirrorInstructions(run.reachableIds.length));
  });

  it("activating a mirror button chooses the SAME node a canvas click would", () => {
    const run = makeRun();
    mirror.update(run, getStrings("ro"), run.reachableIds);

    buttons()[1]?.click();
    expect(chosen).toEqual([run.reachableIds[1]]);
  });

  it("numbers the buttons in the SAME order the 1..9 keys use", () => {
    // The order comes from `mapScreen.reachableOrder`, which is what the key handler indexes into.
    // A mirror that numbered them differently would actively mislead, so the order is passed IN
    // rather than re-derived.
    const run = makeRun();
    const order = [...run.reachableIds].reverse();
    mirror.update(run, getStrings("ro"), order);

    buttons()[0]?.click();
    expect(chosen).toEqual([order[0]]);
  });

  it("updates when the hero moves on", () => {
    const run = makeRun();
    mirror.update(run, getStrings("ro"), run.reachableIds);
    const before = buttons().map((b) => b.textContent);

    const nextIds = run.map.nodes.filter((n) => n.row === 1).map((n) => n.id);
    const moved = makeRun({ reachableIds: nextIds, visitedIds: [run.reachableIds[0]!] });
    mirror.update(moved, getStrings("ro"), nextIds);

    expect(buttons()).toHaveLength(nextIds.length);
    expect(buttons().map((b) => b.textContent)).not.toEqual(before);
  });

  it("clear() empties it, so a stale node list never lingers out of map mode", () => {
    const run = makeRun();
    mirror.update(run, getStrings("ro"), run.reachableIds);
    expect(buttons().length).toBeGreaterThan(0);

    mirror.clear();

    expect(buttons()).toHaveLength(0);
    expect((mount.textContent ?? "").trim()).toBe("");
  });

  it("is visually hidden but NOT removed from the accessibility tree", () => {
    const run = makeRun();
    mirror.update(run, getStrings("ro"), run.reachableIds);
    const region = mount.querySelector("[role='region']") as HTMLElement;

    expect(region.style.position).toBe("absolute");
    expect(region.style.clipPath).toBe("inset(50%)");
    // display:none / visibility:hidden would ALSO remove it from AT and the tab order.
    expect(region.style.display).not.toBe("none");
    expect(region.style.visibility).not.toBe("hidden");
  });

  it("its buttons are focusable", () => {
    const run = makeRun();
    mirror.update(run, getStrings("ro"), run.reachableIds);
    const btn = buttons()[0]!;
    btn.focus();
    expect(document.activeElement).toBe(btn);
  });

  it("re-rendering an unchanged model does not churn the DOM", () => {
    // aria-live announces changes; rebuilding identical nodes every frame would make a screen
    // reader chatter continuously.
    const run = makeRun();
    mirror.update(run, getStrings("ro"), run.reachableIds);
    const first = buttons()[0]!;
    mirror.update(run, getStrings("ro"), run.reachableIds);
    expect(buttons()[0]).toBe(first);
  });

  it("destroy() removes everything it added", () => {
    const run = makeRun();
    mirror.update(run, getStrings("ro"), run.reachableIds);
    mirror.destroy();
    expect(mount.children).toHaveLength(0);
  });
});

describe("map mirror — BOTH locales, Romanian first", () => {
  for (const locale of ["ro", "en"] as const) {
    it(`speaks ${locale}`, () => {
      document.body.innerHTML = "";
      const mount = document.createElement("div");
      document.body.appendChild(mount);
      const mirror = createMapMirror(mount, vi.fn());
      const run = makeRun();
      const strings = getStrings(locale);

      mirror.update(run, strings, run.reachableIds);

      expect(mount.textContent ?? "").toContain(strings.mapMirrorLabel);
      expect(mount.textContent ?? "").toContain(strings.mapMirrorInstructions(run.reachableIds.length));
      const byId = new Map(run.map.nodes.map((n) => [n.id, n]));
      const first = byId.get(run.reachableIds[0]!)!;
      expect(mount.textContent ?? "").toContain(strings.zoneName[first.zone]);
    });
  }

  it("the two locales genuinely differ (not an untranslated fallback)", () => {
    const build = (loc: "ro" | "en"): string => {
      const mount = document.createElement("div");
      const m = createMapMirror(mount, vi.fn());
      const run = makeRun();
      m.update(run, getStrings(loc), run.reachableIds);
      return mount.textContent ?? "";
    };
    expect(build("ro")).not.toBe(build("en"));
  });
});
