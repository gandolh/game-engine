
import { describe, it, expect } from "vitest";
import { RECIPES } from "./index";
import { ACTION_TEMPLATES, PERSONALITY_SUBS, applyPersonalitySubs } from "./templates";

const AI_PERSONALITIES = ["conservative", "aggressive", "hoarder", "opportunist"] as const;

function poseGrid(personality: string, action: string): string {
  const name = `farmer/${personality}/${action}`;
  const recipe = RECIPES.find((r) => r.name === name);
  if (!recipe) throw new Error(`missing recipe ${name}`);
  return recipe.pixels.join("\n");
}

describe("farmer action poses are visually distinct per personality", () => {
  for (const action of ["work", "till"] as const) {
    it(`the four AI ${action} frames are pairwise distinct`, () => {
      for (let i = 0; i < AI_PERSONALITIES.length; i++) {
        for (let j = i + 1; j < AI_PERSONALITIES.length; j++) {
          const a = AI_PERSONALITIES[i]!;
          const b = AI_PERSONALITIES[j]!;
          expect(
            poseGrid(a, action),
            `${a} and ${b} ${action} frames must differ`,
          ).not.toBe(poseGrid(b, action));
        }
      }
    });
  }

  it("every personality differs from every other in BOTH work and till", () => {
    for (let i = 0; i < AI_PERSONALITIES.length; i++) {
      for (let j = i + 1; j < AI_PERSONALITIES.length; j++) {
        const a = AI_PERSONALITIES[i]!;
        const b = AI_PERSONALITIES[j]!;
        const differsInWork = poseGrid(a, "work") !== poseGrid(b, "work");
        const differsInTill = poseGrid(a, "till") !== poseGrid(b, "till");
        expect(differsInWork && differsInTill, `${a} vs ${b}`).toBe(true);
      }
    }
  });

  it("the hat never overwrites tool pixels in any action pose", () => {
    for (const [action, template] of Object.entries(ACTION_TEMPLATES)) {
      for (const [p, subs] of Object.entries(PERSONALITY_SUBS)) {
        const subsOnly = applyPersonalitySubs(template, subs);
        const generated = poseGrid(p, action).split("\n");
        for (let y = 4; y < subsOnly.length; y++) {
          expect(
            generated[y],
            `${p}/${action} body row ${y} altered by the hat overlay`,
          ).toBe(subsOnly[y]);
        }
      }
    }
  });
});
