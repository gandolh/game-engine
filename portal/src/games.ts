/**
 * The games the portal lists: the four games of this repo, nothing from elsewhere. Each plays
 * from its own deployed path, framed by the portal (corpus portal.md).
 */
export interface Game {
  /** URL segment of its play page under the portal: `/games/<id>/`. */
  readonly id: string;
  readonly title: string;
  /** One line under the card's title. */
  readonly pitch: string;
  /** A short paragraph under the game on its play page. */
  readonly description: string;
  /** The game's own deployed path, framed by the play page. */
  readonly path: string;
  /**
   * Whether it is playable on a phone or tablet. Every game here needs a 1280×640 viewport
   * (corpus decisions.md → *Minimum supported viewport*), so none is yet; a game that is opens
   * on any screen.
   */
  readonly playsOnPhones: boolean;
  /** The card's 4:3 art, under `public/cards/`. */
  readonly card: string;
}

export const GAMES: readonly Game[] = [
  {
    id: "farm-valley",
    title: "Farm Valley",
    pitch: "Plant, trade and outwit twenty rival farmers over a hundred days.",
    description:
      "Play as Pip on an archipelago of farms. Twenty farmers with their own personalities plant, " +
      "fish, mine, trade and bid at auction over a hundred in-game days, and the richest one wins.",
    path: "/farm-valley/",
    playsOnPhones: false,
    card: "cards/farm-valley.png",
  },
  {
    id: "citadel",
    title: "Citadel",
    pitch: "Grow a cozy medieval town, road by road.",
    description:
      "Lay roads, raise houses, mills and markets, and keep your villagers fed, housed and happy. " +
      "Cozy mode has no losing; Challenge brings raids, fire and disease.",
    path: "/citadel/",
    playsOnPhones: false,
    card: "cards/citadel.png",
  },
  {
    id: "hollow",
    title: "Hollow",
    pitch: "Watch a village live, love, govern and die for generations.",
    description:
      "A social simulation you watch rather than steer: villagers meet needs, form families and " +
      "communities, choose leaders and sanctions, and age through the generations, with a " +
      "chronicle and charts beside the town.",
    path: "/hollow/",
    playsOnPhones: false,
    card: "cards/hollow.png",
  },
  {
    id: "mathquest",
    title: "MateQuest",
    pitch: "Solve the sum to strike: a math roguelike for grades I to IV.",
    description:
      "A roguelike from Romanian folklore where every attack is a math problem from the primary " +
      "curriculum. Pick a path across the map, answer to fight, and level up the topics you know. " +
      "In Romanian, with English available.",
    path: "/mathquest/",
    playsOnPhones: false,
    card: "cards/mathquest.png",
  },
];

export function gameById(id: string): Game | undefined {
  return GAMES.find((g) => g.id === id);
}
