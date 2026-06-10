import { type PixelRecipe } from "../../types";

// CORNER: fades water across TOP-LEFT; computeCoral rotates to face the open corner.
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
