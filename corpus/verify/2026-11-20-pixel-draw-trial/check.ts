/**
 * Brief 13's checks over the trial's four recipes. Run from the repo root:
 *
 *   node_modules/.bin/tsx corpus/verify/2026-11-20-pixel-draw-trial/check.ts
 *
 * Writes `check-results.md` beside this file. Each recipe gets the palette guard (the cook's `checkSwatches`, every
 * opaque character on the game's palette) and brief 11's recipe checks: lone pixels and clear corners on the frame,
 * then the floor-row and height rules with the recipe swapped into its game's set in place of today's frame of the
 * same name, under the game's allowlist.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ATLAS_GAMES, checkSwatches, type AtlasRecipe } from "@tool/atlas-builder";
import { checkRecipes, formatFinding, isAllowed } from "@tool/atlas-builder/src/recipe-checks";

const HERE = dirname(fileURLToPath(import.meta.url));

const TRIAL = [
  { subject: "strigoi", method: "agent", game: "mathquest", file: "recipes/strigoi-agent.ts" },
  { subject: "strigoi", method: "pixel-draw", game: "mathquest", file: "recipes/strigoi-pixel-draw.ts" },
  { subject: "apple icon", method: "agent", game: "farm", file: "recipes/apple-agent.ts" },
  { subject: "apple icon", method: "pixel-draw", game: "farm", file: "recipes/apple-pixel-draw.ts" },
];

const lines = [
  "# Brief 13: check results",
  "",
  "Written by [check.ts](check.ts). It names the methods, so open it only after both picks on the blind sheet are in.",
  "",
  "| Subject | Method | Recipe | Size | Palette guard | Lone pixels | Corners | Floor row and height in its set |",
  "|---|---|---|---|---|---|---|---|",
];
const details: string[] = [];
for (const t of TRIAL) {
  const config = ATLAS_GAMES.find((g) => g.id === t.game);
  if (config === undefined) throw new Error(`no game ${t.game}`);
  const recipe = ((await import(join(HERE, t.file))) as { default: AtlasRecipe }).default;

  let palette = "pass";
  try {
    checkSwatches({ ...config, recipes: [recipe] });
  } catch (e) {
    palette = "FAIL";
    details.push(`- ${t.file}: ${(e as Error).message.replaceAll("\n", " ")}`);
  }

  const own = checkRecipes([recipe], config.swatches);
  const swapped = [...config.recipes.filter((r) => r.name !== recipe.name), recipe];
  const inSet = checkRecipes(swapped, config.swatches).filter(
    (f) => f.frame === recipe.name && (f.rule === "floor-row" || f.rule === "height"),
  );
  const allow = config.recipeCheckAllowlist ?? [];
  const count = (rule: string): string => {
    const found = own.filter((f) => f.rule === rule);
    return found.length === 0 ? "none" : `${found.length}`;
  };
  const setNote =
    inSet.length === 0
      ? "none"
      : inSet.every((f) => isAllowed(f, allow))
        ? `${inSet.length}, all on the game's allowlist`
        : `${inSet.filter((f) => !isAllowed(f, allow)).length} not allowlisted`;
  for (const f of [...own, ...inSet]) details.push(`- ${t.file}: ${formatFinding(f)}`);

  const w = recipe.width ?? recipe.size;
  const h = recipe.height ?? recipe.size;
  lines.push(
    `| ${t.subject} | ${t.method} | [${t.file}](${t.file}) | ${w}x${h} | ${palette} | ${count("lone-pixel")} | ` +
      `${count("corners")} | ${setNote} |`,
  );
}
lines.push(
  "",
  "## Findings",
  "",
  "Every finding, allowlisted or not. Today's game frame of the same name is swapped out for the set rules.",
  "",
  ...(details.length === 0 ? ["None."] : details),
  "",
);
writeFileSync(join(HERE, "check-results.md"), lines.join("\n"));
console.log(lines.join("\n"));
