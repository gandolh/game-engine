import { type PixelRecipe } from "../../types";

// Variant selected by (tx * 3 + ty * 5) % 2; 0 = cliff-face-a, 1 = cliff-face-b.
const recipe: PixelRecipe =
  {
    name: "tile/cliff-face-a",
    size: 16,
    pixels: [
      "kkkkkkkkkkkkkkkk",
      "QqQQqQQqQQqQQqQQ",
      "QQQQQQQQQQQQQQQQ",
      "QQkQQQkQQQkQQQkQ",
      "QQQQQQQQQQQQQQQQ",
      "QqQQqQQqQQqQQqQQ",
      "QQQQQQQQQQQQQQQQ",
      "QQkQQQkQQQkQQQkQ",
      "QQQQQQQQQQQQQQQQ",
      "QqQQqQQqQQqQQqQQ",
      "QQQQQQQQQQQQQQQQ",
      "SSSSSSSSSSSSSSSS",
      "SsSsSsSsSsSsSsSs",
      "VVVVVVVVVVVVVVVk",
      "VVeVVVVeVVVVeVVV",
      "vVVVVvVVVVvVVVVv",
    ],
  }
;

export default recipe;
