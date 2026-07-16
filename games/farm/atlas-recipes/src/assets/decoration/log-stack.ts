import { type PixelRecipe } from "../../types";

// A stacked woodpile seen end-on: five cut logs (three on the bottom row, two
// nested above) each showing a bark ring (bark), a lit wood face and a darker
// pith centre. Replaces the old flat checker with real cylindrical log ends.
const recipe: PixelRecipe =
  {
    name: "decoration/log-stack",
    size: 16,
    pixels: [
      "................",
      "................",
      "................",
      "...MMM...MMM....",
      "..MdddM.MdddM...",
      "..MdmdM.MdmdM...",
      "..MdddM.MdddM...",
      "...MMM...MMM....",
      ".MMM.MMM.MMM....",
      "MdddMMdddMMdddM.",
      "MdmdMMdmdMMdmdM.",
      "MdddMMdddMMdddM.",
      ".MMM.MMM.MMM....",
      "................",
      "................",
      "................",
    ],
  }
;

export default recipe;
