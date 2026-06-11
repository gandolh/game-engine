import { type PixelRecipe } from "../../types";

// Deep-water whale silhouette (32×16), head-left with a tail fluke right. Body in the deep-ocean
// shades (V/v) so it blends into open water; the render loop draws it faint + slowly fading so it
// reads as a shape down in the deep. decoration/ prefix → props sheet (collision-safe rebuild).
const recipe: PixelRecipe = {
  name: "decoration/whale",
  size: 32,
  width: 32,
  height: 16,
  pixels: [
    "................................", // 0
    "................................", // 1
    "................................", // 2
    "....VVVVVVVVVV..................", // 3
    "..VVVVVVVVVVVVVV................", // 4
    ".VVVVVVVVVVVVVVVVV.........VV...", // 5
    ".VVVVVVVVVVVVVVVVVVV.....VVVVV..", // 6
    "VVVVVVVVVVVVVVVVVVVVVVVVVVVVVV..", // 7
    "VVVVVVVVVVVVVVVVVVVVVVVVVVVVVV..", // 8
    ".VVVVVVVVVVVVVVVVVVV.....VVVVV..", // 9
    ".VVVVVVVVVVVVVVVVV.........VV...", // 10
    "..vvvvvvvvvvvvvv................", // 11
    "....vvvvvvvvvv..................", // 12
    "................................", // 13
    "................................", // 14
    "................................", // 15
  ],
};

export default recipe;
