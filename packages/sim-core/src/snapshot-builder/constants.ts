
export const HIGHLIGHT_THRESHOLD = 0.7;

export const BUBBLE_SHOW_TICKS = 10;

export const INTENTION_KIND_TO_GLYPH: Readonly<Record<string, string>> = {
  "plant":   "indicator/intention-plant",
  "water":   "indicator/intention-water",
  "harvest": "indicator/intention-harvest",
  "sell":    "indicator/intention-sell",
  "buy":     "indicator/intention-buy",
  "travel":  "indicator/intention-travel",
  "sleep":   "indicator/intention-sleep",
  "fish":    "indicator/intention-fish",
  "bid":     "indicator/intention-bid",
  "meet":    "indicator/intention-meet",
  "refill":  "indicator/intention-water",
  "chop":    "indicator/intention-chop",
  "mine":    "indicator/intention-mine",
  "work":    "indicator/intention-work",
  "idle":    "indicator/intention-idle",

  "challenge": "indicator/intention-hostile",
};

export const DECORATION_LABELS: Record<string, { label: string; description: string }> = {
  "decoration/barrel": { label: "Barrel", description: "A storage barrel — just scenery." },
  "decoration/crate": { label: "Crate", description: "A wooden crate — just scenery." },
  "decoration/potted-plant": { label: "Potted Plant", description: "A potted plant — just scenery." },
  "decoration/lamp-post": { label: "Lamp Post", description: "Lights the village at night — just scenery." },
  "decoration/signpost": { label: "Signpost", description: "A village signpost — just scenery." },
  "decoration/hay-bale": { label: "Hay Bale", description: "A bale of hay — just scenery." },
  "decoration/bush": { label: "Bush", description: "A leafy bush — just scenery." },
  "decoration/log-stack": { label: "Log Stack", description: "Stacked logs — just scenery." },
  "decoration/stone-lantern": { label: "Stone Lantern", description: "A carved shrine lantern, its flame ever-lit — just scenery." },
  "decoration/torii": { label: "Shrine Gate", description: "A weathered red gate marking the sacred ground — just scenery." },
  "decoration/buoy": { label: "Buoy", description: "A floating harbor marker bobbing in the swell — just scenery." },
  "decoration/fish-basket": { label: "Fish Basket", description: "A woven creel of the day's catch — just scenery." },
  "decoration/anchor": { label: "Anchor", description: "A rusted iron anchor resting on the pier — just scenery." },
  "decoration/mushroom-cluster": { label: "Mushrooms", description: "A ring of red-capped toadstools — just scenery." },
  "decoration/fern": { label: "Fern", description: "A spray of leafy forest fronds — just scenery." },
  "decoration/ore-cart": { label: "Ore Cart", description: "A minecart heaped with raw stone — just scenery." },
  "decoration/rubble": { label: "Rubble", description: "A loose pile of broken quarry stone — just scenery." },
  "decoration/grain-sack": { label: "Grain Sack", description: "A plump sack of grain for the mill — just scenery." },
  "decoration/flour-bag": { label: "Flour Bag", description: "A stout bag of milled flour — just scenery." },
  "decoration/cattail": { label: "Cattails", description: "Water-edge reeds swaying by the pond — just scenery." },
  "decoration/cairn": { label: "Cairn", description: "A stacked-stone marker beside the old relics — just scenery." },
  "structure/heritage-stones": { label: "Standing Stones", description: "An ancient dolmen ring — a relic of an older age. Just a landmark." },
  "structure/heritage-ruin": { label: "Ruined Tower", description: "The crumbling remains of an old watchtower. Just a landmark." },
  "structure/heritage-statue": { label: "Weathered Statue", description: "A worn monument to someone long forgotten. Just a landmark." },
  "structure/waterfall": { label: "Waterfall", description: "Water tumbles down a mossy cliff into the sea — a scenic landmark." },

  "structure/tent": { label: "Campsite Tent", description: "A traveller's tent. Sleep here when caught far from home and you wake fully rested." },
  "structure/campfire": { label: "Campfire", description: "A crackling campfire warms the campsite — sleep here to wake rested." },
};

export const EVENT_SNAPSHOT_CAP = 30;

export const MAX_WEALTH_ROWS = 500;
