import { type PixelRecipe } from "../../types";

// Clean rock-sided water stream (NO foam pool) — stacks vertically into a tall cascade above the
// foam-bottomed `structure/waterfall` pool tile. a/b/c shift the bright cyan streak down one step
// (every-3 rows) for continuous flow. Rock sides (Q/q/k) match the pool tile so the column reads as
// one rock cleft. Render loop offsets the lower tile's frame so the streak stays continuous across
// the tile seam. On the terrain sheet (tile/ prefix) so a rebuild never touches the buildings sheet.
const recipe: PixelRecipe = {
  name: "tile/waterfall-fall-a",
  size: 16,
  pixels: [
    ".QqkQ.viiv.QkqQ.", // 0  bright
    ".QqkQ.vVVv.QkqQ.", // 1
    ".QqkQ.vVVv.QkqQ.", // 2
    ".QqkQ.viiv.QkqQ.", // 3  bright
    ".QqkQ.vVVv.QkqQ.", // 4
    ".QqkQ.vVVv.QkqQ.", // 5
    ".QqkQ.viiv.QkqQ.", // 6  bright
    ".QqkQ.vVVv.QkqQ.", // 7
    ".QqkQ.vVVv.QkqQ.", // 8
    ".QqkQ.viiv.QkqQ.", // 9  bright
    ".QqkQ.vVVv.QkqQ.", // 10
    ".QqkQ.vVVv.QkqQ.", // 11
    ".QqkQ.viiv.QkqQ.", // 12 bright
    ".QqkQ.vVVv.QkqQ.", // 13
    ".QqkQ.vVVv.QkqQ.", // 14
    ".QqkQ.viiv.QkqQ.", // 15 bright
  ],
};

export default recipe;
