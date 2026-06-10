import { EDG } from "@engine/core";
import { formatSeed } from "../screens";
import { serializeRun, type RunDescriptor } from "@farm/sim-core/run-descriptor";
import type { FinalStandingRow, RunRecap } from "@farm/sim-core/snapshot";

/** Game-over panel parts: the outer panel, the monospace standings text node,
 *  the "Share this run" button (whose handler is (re)bound per run), and the
 *  new recap sections (headline + per-farmer arcs). */
export interface GameOverPanel {
  panel: HTMLElement;
  /** Monospace pre-formatted standings block (kept as-is for back-compat). */
  standings: HTMLElement;
  /** Run headline ("The story of the run: ..."). */
  headline: HTMLElement;
  /** Per-farmer arc sentences container. */
  arcsContainer: HTMLElement;
  shareBtn: HTMLButtonElement;
  shareStatus: HTMLElement;
}

export function createGameOverPanel(parent: HTMLElement): GameOverPanel {
  const panel = document.createElement("div");
  panel.style.cssText = [
    "position: absolute",
    "left: 50%",
    "top: 50%",
    "transform: translate(-50%, -50%)",
    "min-width: 480px",
    "max-width: 640px",
    "padding: 24px 32px",
    "font: 13px/1.5 ui-monospace, monospace",
    `color: ${EDG.cream}`,
    "background: rgba(24, 20, 37, 0.95)", // EDG.black
    `border: 2px solid ${EDG.tan}`,
    "border-radius: 8px",
    "box-shadow: 0 0 60px rgba(228, 166, 114, 0.35)", // EDG.tan
    "z-index: 200",
    "display: none",
    "overflow-y: auto",
    "max-height: 90vh",
  ].join(";");

  // ── Headline ("The story of the run: …") ──────────────────────────────
  const headline = document.createElement("div");
  headline.style.cssText = [
    `color: ${EDG.gold}`,
    "font-weight: 600",
    "margin-bottom: 14px",
    "white-space: normal",
    "word-break: break-word",
  ].join(";");
  panel.appendChild(headline);

  // ── Standings text (monospace pre — kept as-is) ────────────────────────
  const standings = document.createElement("div");
  standings.style.cssText = "white-space: pre";
  panel.appendChild(standings);

  // ── Per-farmer arc sentences ───────────────────────────────────────────
  const arcsSeparator = document.createElement("div");
  arcsSeparator.style.cssText = [
    `border-top: 1px solid ${EDG.steel}`,
    "margin: 14px 0 10px",
    "opacity: 0.5",
  ].join(";");
  panel.appendChild(arcsSeparator);

  const arcsHeader = document.createElement("div");
  arcsHeader.textContent = "  Season arcs";
  arcsHeader.style.cssText = [
    `color: ${EDG.tan}`,
    "font-weight: 600",
    "margin-bottom: 6px",
  ].join(";");
  panel.appendChild(arcsHeader);

  const arcsContainer = document.createElement("div");
  arcsContainer.style.cssText = [
    `color: ${EDG.cream}`,
    "line-height: 1.7",
  ].join(";");
  panel.appendChild(arcsContainer);

  // brief-17: save/replay — "Share this run" control row.
  const shareRow = document.createElement("div");
  shareRow.style.cssText = [
    "display: flex",
    "align-items: center",
    "gap: 12px",
    "margin-top: 18px",
  ].join(";");

  const shareBtn = document.createElement("button");
  shareBtn.type = "button";
  shareBtn.textContent = "Share this run";
  shareBtn.style.cssText = [
    "padding: 8px 18px",
    "font: 13px/1 ui-monospace, monospace",
    "font-weight: 600",
    `color: ${EDG.black}`,
    `background: ${EDG.tan}`,
    `border: 2px solid ${EDG.tan}`,
    "border-radius: 6px",
    "cursor: pointer",
  ].join(";");

  const shareStatus = document.createElement("span");
  shareStatus.style.cssText = `font: 12px/1 ui-monospace, monospace; color: ${EDG.steel}`;

  shareRow.appendChild(shareBtn);
  shareRow.appendChild(shareStatus);
  panel.appendChild(shareRow);

  parent.appendChild(panel);
  return { panel, standings, headline, arcsContainer, shareBtn, shareStatus };
}

export function createSeedBadge(parent: HTMLElement, seed: number): HTMLElement {
  const badge = document.createElement("div");
  badge.textContent = `seed ${formatSeed(seed)}`;
  badge.style.cssText = [
    "position: absolute",
    "right: 12px",
    "bottom: 12px",
    "padding: 4px 10px",
    "font: 12px/1 ui-monospace, monospace",
    `color: ${EDG.tan}`,
    "background: rgba(24, 20, 37, 0.8)", // EDG.black
    "border: 1px solid rgba(228, 166, 114, 0.5)", // EDG.tan
    "border-radius: 5px",
    "z-index: 150",
    "pointer-events: none",
  ].join(";");
  parent.appendChild(badge);
  return badge;
}

export function renderGameOver(
  panel: GameOverPanel,
  rows: FinalStandingRow[],
  finalDay: number,
  run: RunDescriptor,
  recap: RunRecap | null,
): void {
  // ── Headline ─────────────────────────────────────────────────────────────
  // Populate the recap headline if available; otherwise fall back to an empty
  // string (the element stays in the DOM but blank — harmless).
  panel.headline.textContent = recap?.headline ?? "";

  // ── Standings text (unchanged monospace block) ────────────────────────────
  const lines: string[] = [];
  lines.push(`╔══ FARM VALLEY — final standings after ${finalDay} days ══╗`);
  lines.push(`  Run #${(run.seed >>> 0).toString(16)}  (seed ${formatSeed(run.seed)})`);
  lines.push("");

  if (recap !== null) {
    // Enhanced standings: include the rank-delta vs mid-season.
    lines.push("  rank  Δmid  name      personality      gold  unsold  total   crops");
    lines.push("  " + "─".repeat(68));
    recap.standings.forEach((s, i) => {
      const r = rows[i];
      if (r === undefined) return;
      // brief 41 — dynamic crop summary (show non-zero counts only).
      const cropStr = Object.entries(r.crops ?? {})
        .filter(([, qty]) => (qty ?? 0) > 0)
        .map(([k, qty]) => `${k.slice(0, 1)}:${qty}`)
        .join(" ") || "-";
      const delta = s.midRankDelta === 0 ? "  —" :
        s.midRankDelta > 0 ? `▲${s.midRankDelta}`.padStart(3) :
          `▼${Math.abs(s.midRankDelta)}`.padStart(3);
      lines.push(
        `  ${String(i + 1).padEnd(5)} ${delta.padEnd(5)} ${s.name.padEnd(9)} ${s.personality.padEnd(15)} ${String(s.gold).padStart(5)}  ${String(r.unsoldValue).padStart(5)}  ${String(s.totalValue).padStart(5)}   ${cropStr}`,
      );
    });
  } else {
    // Fallback: original standings without delta column.
    lines.push("  rank  name      personality      gold  unsold  total   crops");
    lines.push("  " + "─".repeat(60));
    rows.forEach((r, i) => {
      const cropStr = Object.entries(r.crops ?? {})
        .filter(([, qty]) => (qty ?? 0) > 0)
        .map(([k, qty]) => `${k.slice(0, 1)}:${qty}`)
        .join(" ") || "-";
      lines.push(
        `  ${String(i + 1).padEnd(5)} ${r.name.padEnd(9)} ${r.personality.padEnd(15)} ${String(r.gold).padStart(5)}  ${String(r.unsoldValue).padStart(5)}  ${String(r.totalValue).padStart(5)}   ${cropStr}`,
      );
    });
  }
  lines.push("");
  lines.push(`  winner: ${rows[0]?.name ?? "—"} (${rows[0]?.totalValue ?? 0}g total value)`);
  panel.standings.textContent = lines.join("\n");

  // ── Per-farmer arc sentences ──────────────────────────────────────────────
  panel.arcsContainer.replaceChildren();
  if (recap !== null && recap.arcs.length > 0) {
    for (const arc of recap.arcs) {
      const line = document.createElement("div");
      line.textContent = `  ${arc}`;
      line.style.cssText = `color: ${EDG.cream}; opacity: 0.9;`;
      panel.arcsContainer.appendChild(line);
    }
  }

  // ── Rivalries / alliances (brief 37) ────────────────────────────────────
  if (recap !== null && recap.rivalries !== undefined && recap.rivalries.length > 0) {
    const separator = document.createElement("div");
    separator.style.cssText = `color: ${EDG.steel}; margin-top: 6px; padding-top: 4px; border-top: 1px solid ${EDG.ink};`;
    separator.textContent = "  Notable relationships:";
    panel.arcsContainer.appendChild(separator);
    for (const r of recap.rivalries) {
      const line = document.createElement("div");
      line.textContent = `  ${r}`;
      line.style.cssText = `color: ${EDG.red}; opacity: 0.9;`;
      panel.arcsContainer.appendChild(line);
    }
  }

  // brief-17: save/replay — wire the Share button for this finished run.
  panel.shareBtn.onclick = () => {
    const serialized = serializeRun(run);
    location.hash = "run=" + serialized;
    const url = location.href;
    const clip = navigator.clipboard;
    if (clip && typeof clip.writeText === "function") {
      clip.writeText(url).then(
        () => {
          panel.shareStatus.textContent = "copied URL to clipboard";
        },
        () => {
          panel.shareStatus.textContent = "URL in address bar (copy failed)";
        },
      );
    } else {
      panel.shareStatus.textContent = "URL in address bar";
    }
  };

  panel.panel.style.display = "block";
}
