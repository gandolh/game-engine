/**
 * The smallest viewport the games support (corpus decisions.md → *Minimum supported viewport*).
 * Below it, a game that doesn't play on phones and tablets shows a warning page instead.
 */
export const MIN_WIDTH = 1280;
export const MIN_HEIGHT = 640;

/** Whether a viewport this size gets the game or the warning (screen size only, no touch check). */
export function canPlayHere(playsOnPhones: boolean, width: number, height: number): boolean {
  return playsOnPhones || (width >= MIN_WIDTH && height >= MIN_HEIGHT);
}

/** The owner's wording (2026-11-03). */
export const WARNING = "This game is unavailable for phones or tablets.";
