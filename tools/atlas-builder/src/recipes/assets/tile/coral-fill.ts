import { type PixelRecipe } from "../../types";

// FILL: full-bleed interior seabed; all edges solid so neighbours join seamlessly.
const recipe: PixelRecipe =
  {
    name: "tile/coral-fill",
    size: 16,
    pixels: [
      "SSSSSSSSSSSSSSSS",
      "SsSSSVSSSSVSSSsS",
      "SSSSSSSsSSSSSSSS",
      "SSVSSSSSSSSVSSQS",
      "SsSSSSQSSSSSSSSS",
      "SSSSSSSSSSsSSSSS",
      "SSSVSSSSSSSSSVSS",
      "SSSSSSoSSSSSSSSS",
      "SSsSSSSSSSQSSSsS",
      "SSSSSVSSSSSSSSSS",
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
