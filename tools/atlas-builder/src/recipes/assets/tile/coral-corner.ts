import { type PixelRecipe } from "../../types";

// CORNER — an INNER cluster cell that has open water on TWO adjacent sides
// (a convex corner of the patch). Fades to water across the TOP-LEFT quadrant;
// rotated by `computeCoral` so the fade faces the open corner. Keeps the
// patch's rounded corners from looking like a hard staircase of edge tiles.
const recipe: PixelRecipe =
  {
    name: "tile/coral-corner",
    size: 16,
    pixels: [
      "vVvVvVvVvVvVvVvV",
      "vVvVvVvVvVvVvSvV",
      "vVvVvVvVvVvSVSvV",
      "vVvVvVvVvSvSVSSv",
      "vVvVvVvSvSVSSVSV",
      "vVvVvSvSSSSVSSSS",
      "vVvSvSSSSSoSSSSS",
      "vSvSVSSSSSSSSQsS",
      "vVSSSSSSSSSSSSSS",
      "vSSSVSSSsSSSSSVS",
      "SSQSSSSSSSsSSSSS",
      "SSSSSSSSSSSSVSSS",
      "SSSVSSSsSSSSSSQS",
      "SsSSSSSSSSVSSSSS",
      "SSSSQSSSSSSSSSsS",
      "SSSSSSSSSSSSSSSS",
    ],
  }
;

export default recipe;
