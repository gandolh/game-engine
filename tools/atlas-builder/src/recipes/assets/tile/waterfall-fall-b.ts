import { type PixelRecipe } from "../../types";

// Cascade flow frame B — bright streak one row down from A (every-3 rows from row 1). See -a.
const recipe: PixelRecipe = {
  name: "tile/waterfall-fall-b",
  size: 16,
  pixels: [
    ".QqkQ.vVVv.QkqQ.", // 0
    ".QqkQ.viiv.QkqQ.", // 1  bright
    ".QqkQ.vVVv.QkqQ.", // 2
    ".QqkQ.vVVv.QkqQ.", // 3
    ".QqkQ.viiv.QkqQ.", // 4  bright
    ".QqkQ.vVVv.QkqQ.", // 5
    ".QqkQ.vVVv.QkqQ.", // 6
    ".QqkQ.viiv.QkqQ.", // 7  bright
    ".QqkQ.vVVv.QkqQ.", // 8
    ".QqkQ.vVVv.QkqQ.", // 9
    ".QqkQ.viiv.QkqQ.", // 10 bright
    ".QqkQ.vVVv.QkqQ.", // 11
    ".QqkQ.vVVv.QkqQ.", // 12
    ".QqkQ.viiv.QkqQ.", // 13 bright
    ".QqkQ.vVVv.QkqQ.", // 14
    ".QqkQ.vVVv.QkqQ.", // 15
  ],
};

export default recipe;
