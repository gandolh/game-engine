// Barrel for all per-asset recipe files.
// Order is packing-sensitive — do not reorder.
// Each file lives at assets/<name>.ts and default-exports a PixelRecipe.
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

export const BASE_RECIPES: readonly PixelRecipe[] = [
  r0, // tile/shore
  r1, // tile/wall
  r2, // tile/wall-wood
  r3, // tile/shore-sand
  r4, // tile/ocean
  r5, // tile/foam-a
  r6, // tile/foam-b
  r7, // tile/foam-c
  r8, // tile/grass
  r9, // tile/grass-spring
  r10, // tile/grass-summer
  r11, // tile/grass-autumn
  r12, // tile/grass-winter
  r13, // tile/path
  r14, // tile/bridge-h
  r15, // tile/fence-h
  r16, // structure/market-wall
  r17, // structure/shopkeeper
  r18, // tile/dirt
  r19, // farmer/conservative
  r20, // farmer/conservative/walk-a
  r21, // farmer/conservative/walk-b
  r22, // farmer/aggressive
  r23, // farmer/aggressive/walk-a
  r24, // farmer/aggressive/walk-b
  r25, // farmer/hoarder
  r26, // farmer/hoarder/walk-a
  r27, // farmer/hoarder/walk-b
  r28, // farmer/opportunist
  r29, // farmer/opportunist/walk-a
  r30, // farmer/opportunist/walk-b
  r31, // indicator/meet
  r32, // indicator/follow
  r33, // indicator/intention-plant
  r34, // indicator/intention-water
  r35, // indicator/intention-harvest
  r36, // indicator/intention-sell
  r37, // indicator/intention-buy
  r38, // indicator/intention-travel
  r39, // indicator/intention-sleep
  r40, // indicator/intention-fish
  r41, // indicator/intention-bid
  r42, // indicator/intention-meet
  r43, // indicator/intention-chop
  r44, // indicator/intention-mine
  r45, // indicator/intention-work
  r46, // indicator/intention-idle
  r47, // crop/radish/seed
  r48, // crop/radish/growing
  r49, // crop/radish/mature
  r50, // crop/wheat/seed
  r51, // crop/wheat/growing
  r52, // crop/wheat/mature
  r53, // crop/pumpkin/seed
  r54, // crop/pumpkin/growing
  r55, // crop/pumpkin/mature
  r56, // crop/carrot/seed
  r57, // crop/carrot/growing
  r58, // crop/carrot/mature
  r59, // crop/tomato/seed
  r60, // crop/tomato/growing
  r61, // crop/tomato/mature
  r62, // crop/corn/seed
  r63, // crop/corn/growing
  r64, // crop/corn/mature
  r65, // crop/grape/seed
  r66, // crop/grape/growing
  r67, // crop/grape/mature
  r68, // crop/winter-squash/seed
  r69, // crop/winter-squash/growing
  r70, // crop/winter-squash/mature
  r71, // tile/forge-floor
  r72, // tile/market-floor
  r73, // tile/quarry-floor
  r74, // tile/wood-plank
  r75, // tile/sand
  r76, // tile/stone-floor
  r77, // tile/ice-floor
  r78, // tile/shrine-floor
  r79, // tile/heritage-floor
  r80, // tile/heritage-floor-stones
  r81, // tile/heritage-floor-ruin
  r82, // tile/heritage-floor-statue
  r83, // tile/dock-floor
  r84, // tile/mushroom-floor
  r85, // structure/blacksmith
  r86, // structure/carpenter
  r87, // structure/fountain
  r88, // structure/home
  r89, // structure/tree
  r90, // structure/tree-autumn
  r91, // structure/tree-bare
  r92, // structure/stone
  r93, // structure/auction-podium
  r94, // structure/notice-board
  r95, // structure/mill
  r96, // structure/well
  r97, // structure/shrine
  r98, // structure/heritage-stones
  r99, // structure/heritage-ruin
  r100, // structure/heritage-statue
  r101, // structure/waterfall
  r102, // structure/waterfall-a
  r103, // structure/waterfall-b
  r104, // structure/waterfall-c
  r105, // structure/tent
  r106, // structure/campfire
  r107, // structure/campfire-a
  r108, // structure/campfire-b
  r109, // structure/campfire-c
  r110, // structure/mushroom-marker
  r111, // structure/ice-marker
  r112, // structure/forge-oven
  r113, // structure/forge-fire-a
  r114, // structure/forge-fire-b
  r115, // structure/forge-fire-c
  r116, // structure/anvil
  r117, // structure/quench-tub
  r118, // structure/tool-rack
  r119, // structure/workbench
  r120, // structure/sawhorse
  r121, // structure/log-pile
  r122, // structure/plank-stack
  r123, // decoration/scarecrow
  r124, // decoration/windmill
  r125, // decoration/flower-bed
  r126, // decoration/fence-art
  r127, // debug/player
  r128, // tile/carpentry-floor
  r129, // structure/fishing-spot
  r130, // structure/fishing-spot-b
  r131, // structure/fishing-spot-c
  r132, // tile/coral-fill
  r133, // tile/coral-edge
  r134, // tile/coral-corner
  r135, // tool/fishing-rod
  r136, // fish/minnow
  r137, // fish/bass
  r138, // fish/salmon
  r139, // decoration/barrel
  r140, // decoration/crate
  r141, // decoration/potted-plant
  r142, // decoration/lamp-post
  r143, // decoration/signpost
  r144, // decoration/hay-bale
  r145, // decoration/bush
  r146, // decoration/log-stack
  r147, // decoration/stone-lantern
  r148, // decoration/torii
  r149, // decoration/buoy
  r150, // decoration/fish-basket
  r151, // decoration/anchor
  r152, // decoration/mushroom-cluster
  r153, // decoration/fern
  r154, // decoration/ore-cart
  r155, // decoration/rubble
  r156, // decoration/grain-sack
  r157, // decoration/flour-bag
  r158, // decoration/cattail
  r159, // decoration/cairn
  r160, // structure/forge-house
  r161, // structure/carpenter-workshop
  r162, // structure/grindstone
  r163, // structure/coal-pile
  r164, // structure/ingot-rack
  r165, // structure/lumber-rack
  r166, // structure/sawpit
  r167, // structure/shavings-pile
  r168, // structure/boat
  r169, // tile/coral-reef
  r170, // structure/forge-smoke-a
  r171, // structure/forge-smoke-b
  r172, // structure/forge-smoke-c
  r173, // tile/cliff-face-a
  r174, // tile/cliff-face-b
  r175, // tile/cliff-face-left
  r176, // tile/cliff-face-right
];

