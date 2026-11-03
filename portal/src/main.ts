import "./style.css";
import { EDG } from "@engine/core/render";
import { GAMES } from "./games";
import type { Game } from "./games";
import { routeOf, playPath } from "./route";
import { canPlayHere, WARNING } from "./fit";
import { pixelHeading } from "./pixel-text";

const BASE = import.meta.env.BASE_URL;
const app = document.getElementById("app");

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: Node[]): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
}

/** A heading in the engine's pixel font, with its text kept in the DOM for readers and search. */
function heading(tag: "h1" | "h2", text: string, scale: number, color: string): HTMLElement {
  return el(tag, {}, el("span", { className: "sr-only", textContent: text }), pixelHeading(text, scale, color));
}

function bar(...rest: Node[]): HTMLElement {
  return el("header", { className: "bar" }, ...rest);
}

function gridPage(): Node[] {
  document.title = "Games";
  const cards = GAMES.map((g) =>
    el(
      "a",
      { className: "card", href: playPath(BASE, g) },
      el("img", { src: `${BASE}${g.card}`, alt: "", width: 640, height: 480, loading: "lazy" }),
      el(
        "div",
        { className: "body" },
        heading("h2", g.title, 2, EDG.cream),
        el("p", { textContent: g.pitch }),
        ...(g.playsOnPhones ? [] : [el("span", { className: "tag", textContent: "Computer only" })]),
      ),
    ),
  );
  return [
    bar(heading("h1", "Games", 3, EDG.gold)),
    el("p", { className: "intro", textContent: "Four games on one TypeScript engine. Pick one to play it here." }),
    el("main", { className: "grid" }, ...cards),
  ];
}

function backLink(): HTMLElement {
  return el("a", { className: "back", href: BASE, textContent: "← All games" });
}

function warningPage(game: Game): Node[] {
  document.title = `${game.title} — Games`;
  return [
    bar(backLink()),
    el(
      "main",
      { className: "notice" },
      heading("h1", game.title, 3, EDG.cream),
      el("p", { textContent: WARNING }),
      el("p", {}, el("a", { href: BASE, textContent: "Back to all games" })),
    ),
  ];
}

function playPage(game: Game): Node[] {
  document.title = `${game.title} — Games`;
  const frame = el("iframe", { src: game.path, title: game.title });
  frame.allow = "fullscreen; autoplay; gamepad";
  frame.allowFullscreen = true;
  // Keys go to the game from the start, as when it is opened on its own.
  frame.addEventListener("load", () => frame.focus());
  const full = el("button", { type: "button", textContent: "Fullscreen" });
  full.addEventListener("click", () => {
    void frame.requestFullscreen().then(() => frame.focus());
  });
  return [
    bar(backLink(), heading("h1", game.title, 2, EDG.cream), el("span", { className: "spacer" }), full),
    el("main", {}, el("div", { className: "frame-wrap" }, frame), el("section", { className: "about" }, el("p", { textContent: game.description }))),
  ];
}

function missingPage(): Node[] {
  document.title = "Not found — Games";
  return [
    bar(backLink()),
    el("main", { className: "notice" }, heading("h1", "Not found", 3, EDG.cream), el("p", {}, el("a", { href: BASE, textContent: "See all games" }))),
  ];
}

function render(): void {
  if (!app) return;
  const route = routeOf(location.pathname, BASE);
  if (route.kind === "grid") app.replaceChildren(...gridPage());
  else if (route.kind === "missing") app.replaceChildren(...missingPage());
  else {
    const { game } = route;
    let fits = canPlayHere(game.playsOnPhones, innerWidth, innerHeight);
    app.replaceChildren(...(fits ? playPage(game) : warningPage(game)));
    // Re-render only when the answer flips, so a resize never reloads a running game.
    addEventListener("resize", () => {
      const now = canPlayHere(game.playsOnPhones, innerWidth, innerHeight);
      if (now === fits) return;
      fits = now;
      app.replaceChildren(...(fits ? playPage(game) : warningPage(game)));
    });
  }
}

render();
