import { type PixelRecipe } from "../../types";

// Bespoke island-centerpiece BIG TREE — 48×64 (3×4 tiles), bottom-anchored, horizontally
// centered. Thick buttressed trunk (m/M trunk, D/d wood, k outline) widening at the base,
// branching up into a large layered canopy. SUMMER: full lush green with ≥3 leaf tones
// (t under-shade, l/G dark, g/L light) and a crisp 1px k outline. The blossom / autumn /
// bare seasonal variants reuse this EXACT trunk+canopy silhouette so a season swap reads
// as the same tree changing, not a different sprite.
const recipe: PixelRecipe = {
  name: "structure/big-tree",
  size: 48,
  width: 48,
  height: 64,
  pixels: [
    "................................................", // 0
    "....................kkkkk.......................", // 1
    "................kkkkkGGGGGkkk...................", // 2
    ".............kkkGGGGGGGGGGGGGkk.................", // 3
    "...........kkGGGGgGGGGGGGGGGGGGkk...............", // 4
    ".........kkGGGggGGGGGGGGGGGGGGGGGkk.............", // 5
    "........kGGGgggGGGGGGGGGlGGGGGGGGGGk............", // 6
    ".......kGGGgggGGGGGGGGGGGlGGGGGGGGGGkk..........", // 7
    "......kGGGGggGGGGGGGGGGGGGGGGGGGGGGGGGk.........", // 8
    ".....kGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGk........", // 9
    "....kGGGGGGGGGGGlGGGGGGGGGGGGGGGGGGGGGGGk.......", // 10
    "...kGGGGGGGGGGGGlGGGGGGGGGGGGGGGGGGGGGGGGk......", // 11
    "...kGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGk......", // 12
    "..kGGGggGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGk.....", // 13
    "..kGGgggGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGk.....", // 14
    "..kGGgggGGGGGGGGGGGGGlGGGGGGGGGGGGGGGGGGGGk.....", // 15
    ".kGGGGGGGGGGGGGGGGGGGGlGGGGGGGGGGGGGGGGGGGGk....", // 16
    ".kGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGk....", // 17
    ".kGGGGGGGGlGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGk....", // 18
    ".kGGGGGGGGlGGGGGGGGGGGGGGGGGGGGGGGGggGGGGGGk....", // 19
    ".kGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGgggGGGGGGk....", // 20
    "..kGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGgggGGGGGk.....", // 21
    "..kGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGk.....", // 22
    "...kGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGk......", // 23
    "...kkGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGkk......", // 24
    "....kkGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGkk.......", // 25
    ".....kktGGGGGGGGGGGGGGGGGGGGGGGGGGGGtkk.........", // 26
    "......kktGGGGGGttGGGGGGGGGGGttGGGGtkk...........", // 27
    ".......kkttGGGGttGGGGGGGGGGGttGGttkk............", // 28
    ".........kkttGGttGGGGmMGGGGttttkk...............", // 29
    "...........kkttttGGGGmMGGGttkk..................", // 30
    "..............kkkttGGmMGttkkk...................", // 31
    "..................kkkmMkkk......................", // 32
    ".....................mMD........................", // 33
    "....................dmMD........................", // 34
    "....................dmMDd.......................", // 35
    "...................DdmMDd.......................", // 36
    "...................DdmMMd.......................", // 37
    "...................DdmMMd.......................", // 38
    "..................DddmMMdd......................", // 39
    "..................DddmMMdd......................", // 40
    "..................DddmMMdd......................", // 41
    ".................DdddmMMddd.....................", // 42
    ".................DdddmMMddd.....................", // 43
    ".................DddmmMMMddd....................", // 44
    "................DdddmmMMMddd....................", // 45
    "................DddmmMMMMddd....................", // 46
    "...............DdddmmMMMMdddd...................", // 47
    "...............DddmmMMMMMdddd...................", // 48
    "..............DdddmmMMMMMdddd...................", // 49
    "..............DddmmMMMMMMdddd...................", // 50
    ".............DdddmmMMMMMMddddd..................", // 51
    ".............DddmmMMMMMMMddddd..................", // 52
    "............DdddmmMMMMMMMdddddd.................", // 53
    "...........DddmmMMMMMMMMMddddddd................", // 54
    "..........DdddmmMMMMMMMMMddddddd................", // 55
    ".........DddmmmMMMMMMMMMMMdddddddd..............", // 56
    "........DddmmmMMMMMMMMMMMMMddddddd..............", // 57
    ".......kkkkkkkkkkkkkkkkkkkkkkkkkkk..............", // 58
    "......kGGGGGGGGGGGGGGGGGGGGGGGGGGGk.............", // 59
    ".....kGGGGGGGGGGGGGGGGGGGGGGGGGGGGGk............", // 60
    "....kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk...........", // 61
    "................................................", // 62
    "................................................", // 63
  ],
};

export default recipe;
