import { type PixelRecipe } from "../../types";

// Brief 87 restyle — Stardew cottage vocabulary applied to the forge-house while keeping its
// industrial identity. 32×48 (unchanged), 2 tiles wide, bottom-anchored.
// Chimney stack at cols 10-13 (same pixel position as before) so FORGE_CHIMNEY_PX stays valid.
// Shingled gable roof in stone palette (S structure-blue / s structure-light / Q stone-dark)
// with chimney brickwork (r rust / Q stone-dark / s light) breaking through the apex.
// Warm log-plank walls (d / D / h lit-left / H right) matching the cottage trim vocabulary.
// Left side: large arched forge window (lllllll frame / fire glow oyyoq interior) instead of the
// cottage's pair of small windows — forge identity preserved. Door centred in the lower half.
// Right 8 cols transparent (the sprite footprint is 24 px wide on the left tile pair).
// EDG32 only. Generated row-validated (every row is 32 wide).
const recipe: PixelRecipe = {
    name: "structure/forge-house",
    size: 32,
    width: 32,
    height: 48,
    pixels: [
      "..........rrrr..................",
      "..........rkkr..................",
      "..........rkkr..................",
      "..........rrrr..................",
      ".........SrQQs..................",
      ".........srQQsQ.................",
      "........sSrQQssQ................",
      ".......sSSrQQsSSQ...............",
      "......sSSsrQQsSsSQ..............",
      ".....sSSsSrQQssSSsQ.............",
      "....sSSsSSrQQsSSsSSQ............",
      "...sSSsSSsrQQsSsSSsSQ...........",
      "..sSSsSSsSrQQssSSsSSsQ..........",
      ".sSSsSSsSSrQQsSSsSSsSSQ.........",
      "kkkkkkkkkkkkkkkkkkkkkkkk........",
      "DhddddddddddddddddddddHD........",
      "DhddddddddddddddddddddHD........",
      "DhDDDDDDDDDDDDDDDDDDDDHD........",
      "DhddllllllllddddddddddHD........",
      "DhddlqqqqqqlddddddddddHD........",
      "DhddlqoyyoqlddddddddddHD........",
      "DhDDlqqqqqqlDDDDDDDDDDHD........",
      "DhddlqoyyoqlddddddddddHD........",
      "DhddlqqqqqqlddddddddddHD........",
      "DhddllllllllddddddddddHD........",
      "DhddddddddddddddddddddHD........",
      "DhddddddddddddddddddddHD........",
      "DhDDDDDDDDDDDDDDDDDDDDHD........",
      "DhddddddddddddddddddddHD........",
      "DhddddddddddddddddddddHD........",
      "DhddddddddddddddddddddHD........",
      "DhDDDDDDDDDDDDDDDDDDDDHD........",
      "DhdddddddDqqqqDdddddddHD........",
      "DhdddddddDqqqqDdddddddHD........",
      "DhdddddddDqqqqDdddddddHD........",
      "DhdddddddDddddDdddddddHD........",
      "DhdddddddDddodDdddddddHD........",
      "DhdddddddDddddDdddddddHD........",
      "DhdddddddDddddDdddddddHD........",
      "DhdddddddDddddDdddddddHD........",
      "DhdddddddDddddDdddddddHD........",
      "DhdddddddDddddDdddddddHD........",
      "DhdddddddDddddDdddddddHD........",
      "DDDDDDDDDDDDDDDDDDDDDDDD........",
      "WWWWWWWWWWWWWWWWWWWWWWWW........",
      "WWWWWWWWWWWWWWWWWWWWWWWW........",
      "kkkkkkkkkkkkkkkkkkkkkkkk........",
      "................................",
    ],
};

export default recipe;
