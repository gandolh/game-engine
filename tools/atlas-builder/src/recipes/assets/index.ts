// Order is packing-sensitive — do not reorder.
import { type PixelRecipe } from "../types";

import r0 from "./tile/shore";
import r1 from "./tile/wall";
import r2 from "./tile/wall-wood";
import r3 from "./tile/shore-sand";
import r4 from "./tile/ocean";
import r5 from "./tile/foam-a";
import r6 from "./tile/foam-b";
import r7 from "./tile/foam-c";
import r8 from "./tile/grass";
import r9 from "./tile/grass-spring";
import r10 from "./tile/grass-summer";
import r11 from "./tile/grass-autumn";
import r12 from "./tile/grass-winter";
import r13 from "./tile/path";
import r14 from "./tile/bridge-h";
import r15 from "./tile/fence-h";
import r16 from "./structure/market-wall";
import r17 from "./structure/shopkeeper";
import r18 from "./tile/dirt";
import r19 from "./farmer/conservative";
import r20 from "./farmer/conservative/walk-a";
import r21 from "./farmer/conservative/walk-b";
import r22 from "./farmer/aggressive";
import r23 from "./farmer/aggressive/walk-a";
import r24 from "./farmer/aggressive/walk-b";
import r25 from "./farmer/hoarder";
import r26 from "./farmer/hoarder/walk-a";
import r27 from "./farmer/hoarder/walk-b";
import r28 from "./farmer/opportunist";
import r29 from "./farmer/opportunist/walk-a";
import r30 from "./farmer/opportunist/walk-b";
import r31 from "./indicator/meet";
import r32 from "./indicator/follow";
import r33 from "./indicator/intention-plant";
import r34 from "./indicator/intention-water";
import r35 from "./indicator/intention-harvest";
import r36 from "./indicator/intention-sell";
import r37 from "./indicator/intention-buy";
import r38 from "./indicator/intention-travel";
import r39 from "./indicator/intention-sleep";
import r40 from "./indicator/intention-fish";
import r41 from "./indicator/intention-bid";
import r42 from "./indicator/intention-meet";
import r43 from "./indicator/intention-chop";
import r44 from "./indicator/intention-mine";
import r45 from "./indicator/intention-work";
import r46 from "./indicator/intention-idle";
import r47 from "./crop/radish/seed";
import r48 from "./crop/radish/growing";
import r49 from "./crop/radish/mature";
import r50 from "./crop/wheat/seed";
import r51 from "./crop/wheat/growing";
import r52 from "./crop/wheat/mature";
import r53 from "./crop/pumpkin/seed";
import r54 from "./crop/pumpkin/growing";
import r55 from "./crop/pumpkin/mature";
import r56 from "./crop/carrot/seed";
import r57 from "./crop/carrot/growing";
import r58 from "./crop/carrot/mature";
import r59 from "./crop/tomato/seed";
import r60 from "./crop/tomato/growing";
import r61 from "./crop/tomato/mature";
import r62 from "./crop/corn/seed";
import r63 from "./crop/corn/growing";
import r64 from "./crop/corn/mature";
import r65 from "./crop/grape/seed";
import r66 from "./crop/grape/growing";
import r67 from "./crop/grape/mature";
import r68 from "./crop/winter-squash/seed";
import r69 from "./crop/winter-squash/growing";
import r70 from "./crop/winter-squash/mature";
import r71 from "./tile/forge-floor";
import r72 from "./tile/market-floor";
import r73 from "./tile/quarry-floor";
import r74 from "./tile/wood-plank";
import r75 from "./tile/sand";
import r76 from "./tile/stone-floor";
import r77 from "./tile/ice-floor";
import r78 from "./tile/shrine-floor";
import r79 from "./tile/heritage-floor";
import r80 from "./tile/heritage-floor-stones";
import r81 from "./tile/heritage-floor-ruin";
import r82 from "./tile/heritage-floor-statue";
import r83 from "./tile/dock-floor";
import r84 from "./tile/mushroom-floor";
import r85 from "./structure/blacksmith";
import r86 from "./structure/carpenter";
import r87 from "./structure/fountain";
import r88 from "./structure/home";
import r89 from "./structure/tree";
import r90 from "./structure/tree-autumn";
import r91 from "./structure/tree-bare";
import r92 from "./structure/stone";
import r93 from "./structure/auction-podium";
import r94 from "./structure/notice-board";
import r95 from "./structure/mill";
import r96 from "./structure/well";
import r97 from "./structure/shrine";
import r98 from "./structure/heritage-stones";
import r99 from "./structure/heritage-ruin";
import r100 from "./structure/heritage-statue";
import r101 from "./structure/waterfall";
import r102 from "./structure/waterfall-a";
import r103 from "./structure/waterfall-b";
import r104 from "./structure/waterfall-c";
import r105 from "./structure/tent";
import r106 from "./structure/campfire";
import r107 from "./structure/campfire-a";
import r108 from "./structure/campfire-b";
import r109 from "./structure/campfire-c";
import r110 from "./structure/mushroom-marker";
import r111 from "./structure/ice-marker";
import r112 from "./structure/forge-oven";
import r113 from "./structure/forge-fire-a";
import r114 from "./structure/forge-fire-b";
import r115 from "./structure/forge-fire-c";
import r116 from "./structure/anvil";
import r117 from "./structure/quench-tub";
import r118 from "./structure/tool-rack";
import r119 from "./structure/workbench";
import r120 from "./structure/sawhorse";
import r121 from "./structure/log-pile";
import r122 from "./structure/plank-stack";
import r123 from "./decoration/scarecrow";
import r124 from "./decoration/windmill";
import r125 from "./decoration/flower-bed";
import r126 from "./decoration/fence-art";
import r127 from "./debug/player";
import r128 from "./tile/carpentry-floor";
import r129 from "./structure/fishing-spot";
import r130 from "./structure/fishing-spot-b";
import r131 from "./structure/fishing-spot-c";
import r132 from "./tile/coral-fill";
import r133 from "./tile/coral-edge";
import r134 from "./tile/coral-corner";
import r135 from "./tool/fishing-rod";
import r136 from "./fish/minnow";
import r137 from "./fish/bass";
import r138 from "./fish/salmon";
import r139 from "./decoration/barrel";
import r140 from "./decoration/crate";
import r141 from "./decoration/potted-plant";
import r142 from "./decoration/lamp-post";
import r143 from "./decoration/signpost";
import r144 from "./decoration/hay-bale";
import r145 from "./decoration/bush";
import r146 from "./decoration/log-stack";
import r147 from "./decoration/stone-lantern";
import r148 from "./decoration/torii";
import r149 from "./decoration/buoy";
import r150 from "./decoration/fish-basket";
import r151 from "./decoration/anchor";
import r152 from "./decoration/mushroom-cluster";
import r153 from "./decoration/fern";
import r154 from "./decoration/ore-cart";
import r155 from "./decoration/rubble";
import r156 from "./decoration/grain-sack";
import r157 from "./decoration/flour-bag";
import r158 from "./decoration/cattail";
import r159 from "./decoration/cairn";
import r160 from "./structure/forge-house";
import r161 from "./structure/carpenter-workshop";
import r162 from "./structure/grindstone";
import r163 from "./structure/coal-pile";
import r164 from "./structure/ingot-rack";
import r165 from "./structure/lumber-rack";
import r166 from "./structure/sawpit";
import r167 from "./structure/shavings-pile";
import r168 from "./structure/boat";
import r169 from "./tile/coral-reef";
import r170 from "./structure/forge-smoke-a";
import r171 from "./structure/forge-smoke-b";
import r172 from "./structure/forge-smoke-c";
import r173 from "./tile/cliff-face-a";
import r174 from "./tile/cliff-face-b";
import r175 from "./tile/cliff-face-left";
import r176 from "./tile/cliff-face-right";
import r177 from "./decoration/bird-a";
import r178 from "./decoration/bird-b";
import r179 from "./decoration/leaf-a";
import r180 from "./decoration/leaf-autumn";
import r181 from "./structure/weather-station";
import r182 from "./structure/weather-antenna";
import r183 from "./structure/weather-beacon-a";
import r184 from "./structure/weather-beacon-b";
import r185 from "./structure/cottage-conservative";
import r186 from "./structure/cottage-aggressive";
import r187 from "./structure/cottage-hoarder";
import r188 from "./structure/cottage-opportunist";
import r189 from "./structure/cottage-pip";
import r190 from "./tool/can";
import r191 from "./tool/hoe";
import r192 from "./tool/axe";
import r193 from "./tool/pickaxe";
import r194 from "./structure/bush";
import r195 from "./tile/waterfall-fall-a";
import r196 from "./tile/waterfall-fall-b";
import r197 from "./tile/waterfall-fall-c";
import r198 from "./decoration/duck-a";
import r199 from "./decoration/duck-b";
import r200 from "./decoration/whale";

export const BASE_RECIPES: readonly PixelRecipe[] = [
  r0,
  r1,
  r2,
  r3,
  r4,
  r5,
  r6,
  r7,
  r8,
  r9,
  r10,
  r11,
  r12,
  r13,
  r14,
  r15,
  r16,
  r17,
  r18,
  r19,
  r20,
  r21,
  r22,
  r23,
  r24,
  r25,
  r26,
  r27,
  r28,
  r29,
  r30,
  r31,
  r32,
  r33,
  r34,
  r35,
  r36,
  r37,
  r38,
  r39,
  r40,
  r41,
  r42,
  r43,
  r44,
  r45,
  r46,
  r47,
  r48,
  r49,
  r50,
  r51,
  r52,
  r53,
  r54,
  r55,
  r56,
  r57,
  r58,
  r59,
  r60,
  r61,
  r62,
  r63,
  r64,
  r65,
  r66,
  r67,
  r68,
  r69,
  r70,
  r71,
  r72,
  r73,
  r74,
  r75,
  r76,
  r77,
  r78,
  r79,
  r80,
  r81,
  r82,
  r83,
  r84,
  r85,
  r86,
  r87,
  r88,
  r89,
  r90,
  r91,
  r92,
  r93,
  r94,
  r95,
  r96,
  r97,
  r98,
  r99,
  r100,
  r101,
  r102,
  r103,
  r104,
  r105,
  r106,
  r107,
  r108,
  r109,
  r110,
  r111,
  r112,
  r113,
  r114,
  r115,
  r116,
  r117,
  r118,
  r119,
  r120,
  r121,
  r122,
  r123,
  r124,
  r125,
  r126,
  r127,
  r128,
  r129,
  r130,
  r131,
  r132,
  r133,
  r134,
  r135,
  r136,
  r137,
  r138,
  r139,
  r140,
  r141,
  r142,
  r143,
  r144,
  r145,
  r146,
  r147,
  r148,
  r149,
  r150,
  r151,
  r152,
  r153,
  r154,
  r155,
  r156,
  r157,
  r158,
  r159,
  r160,
  r161,
  r162,
  r163,
  r164,
  r165,
  r166,
  r167,
  r168,
  r169,
  r170,
  r171,
  r172,
  r173,
  r174,
  r175,
  r176,
  r177,
  r178,
  r179,
  r180,
  r181,
  r182,
  r183,
  r184,
  r185,
  r186,
  r187,
  r188,
  r189,
  r190,
  r191,
  r192,
  r193,
  r194,
  r195,
  r196,
  r197,
  r198,
  r199,
  r200,
];

