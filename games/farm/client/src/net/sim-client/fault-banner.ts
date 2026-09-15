import { EDG } from "@engine/core/render";

/**
 * Minimal, self-contained "this run crashed" banner. Deliberately does not
 * touch `main/render-loop.ts` (out of scope for audit-17 — see
 * corpus/wiki/decisions.md, "Farm sim-host tick-fault policy") or any of its
 * canvas UI panels: SimClient owns this directly so a viewer sees *something*
 * on a tick fault instead of a frozen screen, with no dependency on the
 * render loop still running (it may not be, if the fault also froze input).
 *
 * A no-op outside a DOM environment (SSR / headless tests).
 */
export function showFaultBanner(tick: number, message: string): void {
  if (typeof document === "undefined") return;

  const existing = document.getElementById("sim-fault-banner");
  const el = existing ?? document.createElement("div");
  el.id = "sim-fault-banner";
  el.textContent = `Run crashed at tick ${tick}: ${message}`;

  el.style.position = "fixed";
  el.style.left = "0";
  el.style.right = "0";
  el.style.top = "0";
  el.style.zIndex = "9999";
  el.style.padding = "8px 16px";
  el.style.font = "13px monospace";
  el.style.textAlign = "center";
  el.style.background = EDG.crimson;
  el.style.color = EDG.white;
  el.style.borderBottom = `2px solid ${EDG.black}`;
  el.style.pointerEvents = "none";

  if (existing === null) document.body.appendChild(el);
}
