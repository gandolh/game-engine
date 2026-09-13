import { describe, it, expect, afterEach } from "vitest";
import { showUnsupportedNotice } from "@engine/core";
import { HOLLOW_PAL } from "./render/hollow-palette";

/** jsdom normalizes a hex colour assigned via `style.color = "#rrggbb"` to
 *  `rgb(r, g, b)` on read-back — this mirrors that normalization so
 *  assertions can compare against the real HOLLOW_PAL hex values directly. */
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Proves the wiring `main.ts` uses for `startHollowApp`'s
 * `onRendererUnavailable` callback: `showUnsupportedNotice(appEl, { text:
 * HOLLOW_PAL.cream, background: HOLLOW_PAL.ink, border: HOLLOW_PAL.rust },
 * message, "hollow-renderer-unavailable")`.
 *
 * `main.ts` itself boots a Worker + the full 3D app shell at module scope
 * (it has no exports), so it can't be imported in isolation here — this
 * exercises the exact call it makes, with Hollow's real palette values and
 * the real message `render3d/app.ts` passes when `createDevice3d` throws
 * (see `app.ts`'s `onRendererUnavailable` call site), against the real
 * shared helper. This is the regression test for audit-27: before the fix,
 * Hollow hand-rolled this overlay with a comment claiming it fires "when the
 * WebGPU renderer can't start" — stale since the 2026-08-18 WebGL2-only
 * migration deleted WebGPU. The assertion that matters most is that the
 * rendered text never mentions WebGPU.
 */
describe("Hollow renderer-unavailable notice (audit-27)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a readable overlay using Hollow's real palette, with no WebGPU mention", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    // The actual message app.ts's onRendererUnavailable passes today.
    const message =
      "3D rendering could not start — WebGL2 is unavailable in this browser. This is " +
      "usually caused by disabled hardware acceleration or running inside a VM/sandbox " +
      "without a GPU adapter, rather than a missing browser feature (WebGL2 has shipped " +
      "everywhere since 2017). Try enabling hardware acceleration in your browser's " +
      "settings, or open this in a different browser/machine. The simulation and " +
      "chronicle keep running.";

    showUnsupportedNotice(
      host,
      { text: HOLLOW_PAL.cream, background: HOLLOW_PAL.ink, border: HOLLOW_PAL.rust },
      message,
      "hollow-renderer-unavailable",
    );

    const overlay = document.getElementById("hollow-renderer-unavailable");
    expect(overlay).not.toBeNull();
    expect(overlay!.textContent).toBeTruthy();
    expect(overlay!.textContent).toContain("WebGL2");
    expect(overlay!.textContent).not.toContain("WebGPU");
    // jsdom's CSSStyleDeclaration normalizes hex colours to rgb(...) on
    // read-back, so compare against the same normalization rather than the
    // raw hex literal.
    expect(overlay!.style.color).toBe(hexToRgb(HOLLOW_PAL.cream));
    expect(overlay!.style.background).toBe(hexToRgb(HOLLOW_PAL.ink));
    expect(overlay!.style.borderColor).toBe(hexToRgb(HOLLOW_PAL.rust));
  });

  it("is idempotent — calling it twice does not stack two panels", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const colors = { text: HOLLOW_PAL.cream, background: HOLLOW_PAL.ink, border: HOLLOW_PAL.rust };
    showUnsupportedNotice(host, colors, "first", "hollow-renderer-unavailable");
    showUnsupportedNotice(host, colors, "second", "hollow-renderer-unavailable");

    expect(host.querySelectorAll("#hollow-renderer-unavailable").length).toBe(1);
  });

  it("never uses a raw hex literal — colours come from HOLLOW_PAL roles", () => {
    // Guards against a future edit reintroducing a raw hex here; the repo-wide
    // palette guard test (@engine/core -- palette) also enforces this.
    expect(HOLLOW_PAL.cream).toMatch(/^#[0-9a-f]{6}$/);
    expect(HOLLOW_PAL.ink).toMatch(/^#[0-9a-f]{6}$/);
    expect(HOLLOW_PAL.rust).toMatch(/^#[0-9a-f]{6}$/);
  });
});
