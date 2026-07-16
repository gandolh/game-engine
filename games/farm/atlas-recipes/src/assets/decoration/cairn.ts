import { type PixelRecipe } from "../../types";

// A balanced cairn: three rounded stones stacked, each NW-lit (silver cap top-left,
// steel/slate body, navy->ink shadow lower-right) so the pile reads as stacked
// volumes instead of the old checker noise. A thin ink seam separates each stone.
const recipe: PixelRecipe =
  {
    name: "decoration/cairn",
    size: 16,
    pixels: [
      "................",
      "................",
      "......qQs.......",
      ".....qQQSVs.....",
      ".....QSSSVN.....",
      "......SVVN......",
      "....qQQQSSSs....",
      "...qQQQSSSSVs...",
      "...QQSSSSSVVN...",
      "...QSSSVVVVNN...",
      "..qQQQQSSSSSVs..",
      "..qQQSSSSSVVVN..",
      "..QQSSSSSVVVNN..",
      "..sSSSVVVNNNNN..",
      "...NNVNNNNNN....",
      "................",
    ],
  }
;

export default recipe;
