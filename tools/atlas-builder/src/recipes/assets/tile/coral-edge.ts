import { type PixelRecipe } from "../../types";

// EDGE — seabed that fills the BOTTOM of the tile and FADES upward into open
// water along the TOP edge, so a cluster border softly dissolves into the sea.
// Authored top-fade-up; `computeCoral` rotates it to face whichever side is
// open water. Top rows thin out to v/V water; lower rows are solid seabed that
// seams with an adjacent fill below.
const recipe: PixelRecipe =
  {
    name: "tile/coral-edge",
    size: 16,
    pixels: [
      "vVvVvVvVvVvVvVvV",
      "vVvVvVvVvVvVvVvV",
      "VvSVvVvVvVvVvSvV",
      "vSVSvVSVvVSvSVSv",
      "VSSVSvSSVSvSSVSV",
      "SSVSSSSVSSSSVSSS",
      "SSSSSSoSSSSSSSSS",
      "SsSSSSSSSSQSSSsS",
      "SSSSSSSSSSSSSSSS",
      "SSSVSSSsSSSSSVSS",
      "SQSSSSSSSsSSSSSS",
      "SSSSSSSSSSSSVSSS",
      "SSSVSSSsSSSSSSQS",
      "SsSSSSSSSSVSSSSS",
      "SSSSQSSSSSSSSSsS",
      "SSSSSSSSSSSSSSSS",
    ],
  }
;

export default recipe;
