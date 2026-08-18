/**
 * The "this browser can't run the renderer" screen.
 *
 * Before the WebGL2 migration, an unsupported browser got a **blank canvas**: both 2D
 * clients hard-forced `backend: "webgpu"`, `createRenderer` rethrew, and nothing caught
 * it — so the page sat there empty with an unhandled rejection in the console. Citadel's
 * boot even documented the behaviour without treating it as a bug. This exists so that
 * cannot happen again.
 *
 * Pattern lifted from Hollow, which already did this properly: show a message, and keep
 * everything that is not the renderer running (its sim, chronicle, and dashboard all
 * survive a missing renderer).
 *
 * Colours are parameters, not imports: `@engine/core` is generic and must never import a
 * game's palette. Each caller passes its own palette roles (`EDG.*`, `CITADEL_PAL.*`,
 * `MATE_PAL.*`), which also keeps the per-scope palette guard test satisfied.
 */

export interface UnsupportedNoticeColors {
  /** Body text colour. */
  text: string;
  /** Panel background. */
  background: string;
  /** Panel border. */
  border: string;
}

/**
 * The default message.
 *
 * Deliberately does NOT say "your browser doesn't support WebGL2" as the primary cause:
 * WebGL2 has shipped in every major browser since ~2017, so a machine that fails here is
 * far more likely to have hardware acceleration disabled, or to be a VM / remote session
 * without a usable GPU. Telling someone to upgrade a browser that is already current
 * sends them down the wrong path.
 *
 * It also must not mention WebGPU or `chrome://flags` — that advice is obsolete now and
 * was actively misleading even before (it pointed at a flag for a different API).
 */
export const WEBGL2_UNAVAILABLE_MESSAGE =
  "This game needs WebGL2, which could not be started.\n\n" +
  "WebGL2 ships in every current browser, so the usual cause is that hardware " +
  "acceleration is switched off, or that this is a virtual machine or remote session " +
  "without a usable GPU.\n\n" +
  "Try enabling hardware acceleration in your browser settings, then reload.";

/**
 * Show the notice, centred over `host`. Idempotent — calling it twice does not stack two
 * panels, so a caller may invoke it from more than one failure path without guarding.
 *
 * `pointerEvents` is left off so the notice never swallows input from anything still
 * running underneath it.
 */
export function showUnsupportedNotice(
  host: HTMLElement,
  colors: UnsupportedNoticeColors,
  message: string = WEBGL2_UNAVAILABLE_MESSAGE,
  id = "engine-renderer-unavailable",
): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;

  const box = document.createElement("div");
  box.id = id;
  // whiteSpace: pre-line so the message's paragraph breaks survive without markup.
  box.textContent = message;
  box.style.position = "fixed";
  box.style.top = "50%";
  box.style.left = "50%";
  box.style.transform = "translate(-50%, -50%)";
  box.style.maxWidth = "34rem";
  box.style.padding = "18px 22px";
  box.style.textAlign = "left";
  box.style.whiteSpace = "pre-line";
  box.style.font = "14px/1.6 ui-monospace, monospace";
  box.style.color = colors.text;
  box.style.background = colors.background;
  box.style.border = `1px solid ${colors.border}`;
  box.style.borderRadius = "6px";
  box.style.zIndex = "50";
  box.style.pointerEvents = "none";
  host.appendChild(box);
}
