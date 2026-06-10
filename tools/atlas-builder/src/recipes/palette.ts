// Palette: Endesga-32 (EDG32) by Endesga — https://lospec.com/palette-list/endesga-32
// Every swatch below is one of the 32 EDG32 colors. The mapping is curated (not
// raw nearest-RGB) so grass stays green, the ocean stays blue with depth, and
// sand/wheat stay distinct (EDG32 has no teal, so a naive map muddied the grass).
export const SWATCH: Record<string, [number, number, number, number]> = {
  ".": [0, 0, 0, 0],
  G: [62, 137, 72, 255],    // grass dark        #3e8948
  g: [99, 199, 77, 255],    // grass light       #63c74d
  D: [115, 62, 57, 255],    // wood dark         #733e39
  d: [184, 111, 80, 255],   // wood light        #b86f50
  S: [90, 105, 136, 255],   // structure blue    #5a6988
  s: [139, 155, 180, 255],  // structure blue lt #8b9bb4
  k: [24, 20, 37, 255],     // near-black        #181425
  w: [234, 212, 170, 255],  // cream / white     #ead4aa
  r: [190, 74, 47, 255],    // red / rust        #be4a2f
  l: [38, 92, 66, 255],     // leaf dark         #265c42
  L: [99, 199, 77, 255],    // leaf light        #63c74d
  W: [228, 166, 114, 255],  // tan / wheat       #e4a672
  m: [115, 62, 57, 255],    // trunk dark        #733e39
  M: [62, 39, 49, 255],     // trunk darker      #3e2731
  T: [234, 212, 170, 255],  // sand              #ead4aa
  c: [38, 92, 66, 255],     // grass base dark   #265c42
  C: [62, 137, 72, 255],    // grass base light  #3e8948
  q: [192, 203, 220, 255],  // stone light       #c0cbdc
  Q: [139, 155, 180, 255],  // stone dark        #8b9bb4
  o: [254, 174, 52, 255],   // gold              #feae34
  p: [215, 118, 67, 255],   // pumpkin           #d77643
  y: [254, 231, 97, 255],   // yellow            #fee761
  // Ocean shades for the out-of-region filler so the world reads as islands in
  // an ocean rather than a void beyond/between regions.
  v: [18, 78, 137, 255],    // ocean             #124e89
  V: [58, 68, 102, 255],    // ocean deep        #3a4466
  e: [0, 153, 219, 255],    // ocean foam        #0099db
  // brief 45 — seasonal tile / foliage swatches (all EDG32).
  n: [255, 255, 255, 255],  // snow white        #ffffff
  a: [254, 174, 52, 255],   // autumn gold       #feae34 (= gold `o`)
  A: [215, 118, 67, 255],   // autumn orange     #d77643 (= pumpkin `p`)
  b: [228, 166, 114, 255],  // autumn tan        #e4a672 (= wheat `W`)
  // 2026-06-10 art pass — the EDG32 colors the original curated map never used.
  // They exist for hue-shifted shading (shadows lean cool/purple, highlights
  // lean warm), selective outlines, and the missing crop/flower hues.
  t: [25, 60, 62, 255],     // foliage deep shade #193c3e (canopy under-shadow)
  N: [38, 43, 68, 255],     // cool shadow navy   #262b44 (selective outline; softer than `k`)
  f: [247, 118, 34, 255],   // flame orange       #f77622 (fire mid, carrot, autumn leaves)
  R: [228, 59, 68, 255],    // bright red         #e43b44 (tomato, toadstool, salmon back)
  x: [162, 38, 51, 255],    // deep red shade     #a22633 (shadow side of any red)
  U: [181, 80, 136, 255],   // grape / bloom      #b55088 (grapes, radish, flowers)
  u: [104, 56, 108, 255],   // deep purple shade  #68386c (grape shadow, dusk accents)
  P: [246, 117, 122, 255],  // petal pink         #f6757a (blossoms, salmon flank)
  i: [44, 232, 245, 255],   // water sparkle cyan #2ce8f5 (waterfall/fountain glints)
  h: [232, 183, 150, 255],  // warm highlight     #e8b796 (lit wood/burlap/sand ridge)
  H: [194, 133, 105, 255],  // rope / wicker tan  #c28569 (mid wood, pebbles, dirt clods)
};

export function colorOf(ch: string): [number, number, number, number] {
  const c = SWATCH[ch];
  if (!c) throw new Error(`Unknown swatch char: ${ch}`);
  return c;
}
