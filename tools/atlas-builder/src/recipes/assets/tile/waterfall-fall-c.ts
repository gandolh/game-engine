import { type PixelRecipe } from "../../types";

// Cascade flow frame C — bright streak one row down from B (every-3 rows from row 2). See -a.
const recipe: PixelRecipe = {
  name: "tile/waterfall-fall-c",
  size: 16,
  pixels: [
    ".QqkQ.vVVv.QkqQ.", // 0
    ".QqkQ.vVVv.QkqQ.", // 1
    ".QqkQ.viiv.QkqQ.", // 2  bright
    ".QqkQ.vVVv.QkqQ.", // 3
    ".QqkQ.vVVv.QkqQ.", // 4
    ".QqkQ.viiv.QkqQ.", // 5  bright
    ".QqkQ.vVVv.QkqQ.", // 6
    ".QqkQ.vVVv.QkqQ.", // 7
    ".QqkQ.viiv.QkqQ.", // 8  bright
    ".QqkQ.vVVv.QkqQ.", // 9
    ".QqkQ.vVVv.QkqQ.", // 10
    ".QqkQ.viiv.QkqQ.", // 11 bright
    ".QqkQ.vVVv.QkqQ.", // 12
    ".QqkQ.vVVv.QkqQ.", // 13
    ".QqkQ.viiv.QkqQ.", // 14 bright
    ".QqkQ.vVVv.QkqQ.", // 15
  ],
};

export default recipe;
