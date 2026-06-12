/**
 * action-swing.test.ts — guards the per-action two-frame work swing (brief 85
 * phase 2). Every farmer/Pip action pose `farmer/<p>/<action>` must have a
 * companion `-b` strike frame, and the two must differ (else the swing would
 * read as a freeze). The head/torso stay identical to the base pose; only the
 * tool/arm region moves, all at rows ≥7 (clear of the hat overlay).
 */
import { describe, it, expect } from "vitest";
import { RECIPES } from "./index";
import { ACTION_TEMPLATES, ACTION_TEMPLATES_B, PERSONALITY_SUBS } from "./templates";

const grid = (name: string): string | undefined =>
  RECIPES.find((r) => r.name === name)?.pixels.join("\n");

describe("farmer action swing frames", () => {
  it("the -b set mirrors the base action set", () => {
    expect(Object.keys(ACTION_TEMPLATES_B).sort()).toEqual(Object.keys(ACTION_TEMPLATES).sort());
  });

  it("every personality+action has a distinct -b strike frame", () => {
    for (const action of Object.keys(ACTION_TEMPLATES_B)) {
      for (const personality of Object.keys(PERSONALITY_SUBS)) {
        const base = grid(`farmer/${personality}/${action}`);
        const b = grid(`farmer/${personality}/${action}-b`);
        expect(base, `missing base farmer/${personality}/${action}`).toBeDefined();
        expect(b, `missing swing farmer/${personality}/${action}-b`).toBeDefined();
        expect(b, `farmer/${personality}/${action}-b must differ from its base`).not.toBe(base);
      }
    }
  });

  it("the swing frame keeps the head identical to the base (only the tool moves)", () => {
    for (const action of Object.keys(ACTION_TEMPLATES_B)) {
      for (const personality of Object.keys(PERSONALITY_SUBS)) {
        const base = grid(`farmer/${personality}/${action}`)!.split("\n");
        const b = grid(`farmer/${personality}/${action}-b`)!.split("\n");
        for (let y = 0; y <= 6; y++) {
          expect(b[y], `${personality}/${action}-b head row ${y} drifted from base`).toBe(base[y]);
        }
      }
    }
  });

  it("all -b frames are 16×16", () => {
    for (const template of Object.values(ACTION_TEMPLATES_B)) {
      expect(template).toHaveLength(16);
      for (const row of template) expect(row).toHaveLength(16);
    }
  });
});
