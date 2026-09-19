/**
 * Pins the two production `localStorage` keys behind `@engine/ui`'s promoted panel-prefs store
 * (sweep-09) to the game modules that actually pass them.
 *
 * Why this file exists, and why it is HERE rather than next to the store: the behavioural half of
 * the guard lives in `engine/ui/src/state/panel-prefs.production.test.ts`, which builds Farm's and
 * Citadel's real configurations and asserts a pre-promotion saved layout still restores. But those
 * key strings are a *copy* of what the games pass. If a game's key changed and the copy did not,
 * that test would keep passing while testing a configuration nothing ships — the same "guard that
 * cannot fail" shape as audit-44/45/51. So something has to pin the two spellings together, and it
 * cannot be that file: `@engine/ui` is browser-scoped and deliberately carries no Node types, so it
 * cannot read the filesystem.
 *
 * It lands in `@engine/core` because that is already where every repo-wide disk-scanning guard
 * lives — `layering.test.ts`, `render/palette.test.ts`, `conventions.test.ts`, `build-target.test.ts`
 * — all of which read game sources as TEXT. Reading text is not importing: the engine still imports
 * no game, which `layering.test.ts` itself enforces.
 *
 * Changing either key is a player-visible data migration, not a refactor. Every saved panel layout
 * is stored under it, so a silent rename loses every player's layout with no error anywhere.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
// HERE = <repo>/engine/core/src/ — three levels up is the repo root.
const REPO_ROOT = join(HERE, "..", "..", "..");

/**
 * Each entry must stay in step with the same-named constant in
 * `engine/ui/src/state/panel-prefs.production.test.ts`.
 */
const PINNED: ReadonlyArray<{ game: string; file: string; key: string }> = [
  { game: "Farm", file: "games/farm/client/src/main/panels.ts", key: "farm.ui.panels.v1" },
  { game: "Citadel", file: "games/citadel/client/src/main/hud-panels.ts", key: "citadel.ui.panels.v1" },
];

const UI_BEHAVIOUR_TEST = "engine/ui/src/state/panel-prefs.production.test.ts";

describe("panel-prefs production storage keys", () => {
  for (const { game, file, key } of PINNED) {
    it(`${game} still stores its panel layout under "${key}"`, () => {
      const abs = join(REPO_ROOT, file);
      expect(
        statSync(abs, { throwIfNoEntry: false })?.isFile() === true,
        `${file} does not exist. If that module moved, update this guard's path — do not delete ` +
          `the assertion; it is what stops a storage-key rename from silently discarding every ` +
          `player's saved panel layout.`,
      ).toBe(true);

      const src = readFileSync(abs, "utf8");
      expect(
        src.includes(`"${key}"`),
        `${file} no longer contains the literal "${key}".\n` +
          `Changing a panel-prefs storage key is a player-visible data migration: every saved ` +
          `layout lives under the old key and silently reads as "nothing saved" under a new one.\n` +
          `If the rename is deliberate, update this guard AND the matching constant in ` +
          `${UI_BEHAVIOUR_TEST}, and say in the commit what happens to existing layouts.`,
      ).toBe(true);
    });
  }

  it("the @engine/ui behavioural half still exists and names both keys", () => {
    // Without this, deleting the behavioural test would leave the keys pinned to nothing and the
    // production configurations untested, with both halves still green.
    const abs = join(REPO_ROOT, UI_BEHAVIOUR_TEST);
    expect(
      statSync(abs, { throwIfNoEntry: false })?.isFile() === true,
      `${UI_BEHAVIOUR_TEST} is missing. This guard only pins key SPELLINGS; that file is what ` +
        `proves a pre-promotion saved layout still restores. Losing it silently drops the ` +
        `behavioural coverage.`,
    ).toBe(true);

    const src = readFileSync(abs, "utf8");
    for (const { key } of PINNED) {
      expect(
        src.includes(`"${key}"`),
        `${UI_BEHAVIOUR_TEST} no longer references "${key}", so the two halves have drifted.`,
      ).toBe(true);
    }
  });
});
