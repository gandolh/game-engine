import { type PixelRecipe } from "../../types";

// A wooden shipping crate: woodDark plank frame around a lit wood face with a
// diagonal corner brace, a highlight plank on the sunlit NW edge and a woodDark
// pool on the SE. Clean carpentry instead of the old random speckle.
const recipe: PixelRecipe =
  {
    name: "decoration/crate",
    size: 16,
    pixels: [
      "................",
      "................",
      "...MMMMMMMMMM...",
      "...MwddddddMM...",
      "...MdwdddddDM...",
      "...MddwddmdDM...",
      "...MdddwmdDDM...",
      "...MddmwdDDDM...",
      "...MdmddwDDDM...",
      "...MmdddwDDDM...",
      "...MddddddDDM...",
      "...MMMMMMMMMM...",
      "................",
      "................",
      "................",
      "................",
    ],
  }
;

export default recipe;
