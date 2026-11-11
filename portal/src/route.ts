import { gameById } from "./games";
import type { Game } from "./games";

export type Route =
  { readonly kind: "grid" } | { readonly kind: "play"; readonly game: Game } | { readonly kind: "missing" };

/**
 * Which page a path is, relative to the portal's base: the base itself is the grid, `<id>/` (or
 * `<id>`) is that game's play page, anything else is missing.
 */
export function routeOf(pathname: string, base: string): Route {
  const root = base.endsWith("/") ? base : `${base}/`;
  if (pathname === root || pathname === root.slice(0, -1) || pathname === `${root}index.html`) return { kind: "grid" };
  if (!pathname.startsWith(root)) return { kind: "missing" };
  const rest = pathname.slice(root.length).replace(/\/$/, "");
  if (rest === "") return { kind: "grid" };
  if (rest.includes("/")) return { kind: "missing" };
  const game = gameById(rest);
  return game ? { kind: "play", game } : { kind: "missing" };
}

/** The play page's path for a game. */
export function playPath(base: string, game: Game): string {
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}${game.id}/`;
}
