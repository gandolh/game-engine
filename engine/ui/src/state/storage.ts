/**
 * `safeLocalStorage()` — resolve `window.localStorage` without ever throwing.
 *
 * Two things can go wrong, independently of each other: `window` itself may not exist (any
 * non-browser host — Node, a Worker with no DOM, headless tooling), and even where `window`
 * exists, `.localStorage` can throw on ACCESS (not just on `.getItem`/`.setItem`) in strict-privacy
 * browser modes. Both are guarded here so a caller gets a plain `Storage | null` and never needs to
 * know which environment it's running in.
 *
 * Promoted from two identical copies — Farm's `main/panels.ts` and Citadel's `main/hud-panels.ts`
 * (the latter's own comment cited the former as its source) — into the one place both clients
 * already depend on. See corpus decisions.md: "games never import each other" forbids a
 * game -> game edge, not a shared `@engine/ui` helper.
 */
export function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
