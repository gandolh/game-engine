/**
 * `renderInspectPanel` — pure DOM-building for the click-to-inspect side
 * panel (chunk hollow-09c). Takes a resolved `InspectDetail` (see
 * `inspect-detail.ts`) and returns a fresh, unattached `HTMLElement` the
 * caller (`main.ts`) appends into the page and replaces on each new
 * selection/`inspectResult`. Kept pure (no module-level DOM writes, no
 * `document.body` reach-around) specifically so it's unit-testable under
 * jsdom without a whole app boot — see `inspect-panel.test.ts`.
 *
 * Palette purity: every color is set via inline `style.color`/`background`
 * from a `HOLLOW_PAL.*` role (CSS can't import the TS palette module — same
 * precedent as `style.css`'s header comment), never a raw hex literal.
 */
import { HOLLOW_PAL } from "./render/hollow-palette";
import type { InspectDetail } from "./inspect-detail";

export interface InspectPanelCallbacks {
  /** Clears the selection + 3D highlight (see `app.ts`'s `setSelectedAgent`). */
  readonly onClose: () => void;
  /** Toggles follow-cam for the inspected agent (see `app.ts`'s `setFollow`). */
  readonly onToggleFollow: () => void;
  /** Whether follow-cam is CURRENTLY active for this agent — drives the
   *  follow button's label/pressed state. */
  readonly isFollowing: boolean;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function section(title: string): HTMLElement {
  const wrap = el("div", "hollow-inspect-section");
  const heading = el("h3", "hollow-inspect-section-title", title);
  heading.style.color = HOLLOW_PAL.gold;
  wrap.appendChild(heading);
  return wrap;
}

function row(label: string, value: string): HTMLElement {
  const r = el("div", "hollow-inspect-row");
  const l = el("span", "hollow-inspect-row-label", `${label}: `);
  l.style.color = HOLLOW_PAL.steel;
  const v = el("span", "hollow-inspect-row-value", value);
  v.style.color = HOLLOW_PAL.cream;
  r.appendChild(l);
  r.appendChild(v);
  return r;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Build the (unattached) inspect panel DOM tree for `detail`. Pure. */
export function renderInspectPanel(detail: InspectDetail, callbacks: InspectPanelCallbacks): HTMLElement {
  const panel = el("div", "hollow-inspect-panel");
  panel.style.position = "absolute";
  panel.style.top = "0";
  panel.style.right = "0";
  panel.style.background = HOLLOW_PAL.ink;
  panel.style.color = HOLLOW_PAL.cream;
  panel.style.borderLeft = `2px solid ${HOLLOW_PAL.navy}`;

  // --- header: name + close ------------------------------------------------
  const header = el("div", "hollow-inspect-header");
  const title = el("h2", "hollow-inspect-name", detail.name);
  title.style.color = HOLLOW_PAL.cream;
  const closeBtn = el("button", "hollow-inspect-close", "×") as HTMLButtonElement;
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close inspect panel");
  closeBtn.style.color = HOLLOW_PAL.cream;
  closeBtn.style.background = HOLLOW_PAL.navy;
  closeBtn.addEventListener("click", () => callbacks.onClose());
  header.appendChild(title);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const statusLine = el(
    "div",
    "hollow-inspect-status",
    detail.alive
      ? `${detail.stage} • age ${detail.ageTicks} ticks${detail.starving ? " • STARVING" : ""}`
      : `deceased${detail.deathCause ? ` (${detail.deathCause})` : ""}${detail.deathTick !== null ? ` at tick ${detail.deathTick}` : ""}`,
  );
  statusLine.style.color = detail.starving ? HOLLOW_PAL.red : HOLLOW_PAL.silver;
  panel.appendChild(statusLine);

  // --- follow-cam toggle -----------------------------------------------------
  const followBtn = el(
    "button",
    "hollow-inspect-follow",
    callbacks.isFollowing ? "Following (F)" : "Follow (F)",
  ) as HTMLButtonElement;
  followBtn.type = "button";
  followBtn.style.color = HOLLOW_PAL.cream;
  followBtn.style.background = callbacks.isFollowing ? HOLLOW_PAL.gold : HOLLOW_PAL.slate;
  followBtn.addEventListener("click", () => callbacks.onToggleFollow());
  panel.appendChild(followBtn);

  // --- identity ---------------------------------------------------------------
  const identity = section("Identity");
  identity.appendChild(row("id", String(detail.id)));
  identity.appendChild(row("community", detail.communityId !== null ? String(detail.communityId) : "none"));
  identity.appendChild(row("household", detail.householdId !== null ? String(detail.householdId) : "none"));
  panel.appendChild(identity);

  // --- genome -------------------------------------------------------------
  const genome = section("Genome");
  genome.appendChild(row("skin", detail.genome.appearance.skinTone));
  genome.appendChild(row("hair", detail.genome.appearance.hairTone));
  genome.appendChild(row("height", fmt(detail.genome.appearance.height)));
  genome.appendChild(row("build", fmt(detail.genome.appearance.build)));
  for (const [gene, value] of Object.entries(detail.genome.behavior)) {
    genome.appendChild(row(gene, fmt(value)));
  }
  for (const [skill, value] of Object.entries(detail.genome.aptitude)) {
    genome.appendChild(row(`${skill} aptitude`, fmt(value)));
  }
  panel.appendChild(genome);

  // --- needs ----------------------------------------------------------------
  if (detail.needs) {
    const needs = section("Needs");
    for (const [kind, value] of Object.entries(detail.needs)) {
      needs.appendChild(row(kind, fmt(value)));
    }
    panel.appendChild(needs);
  }

  // --- BDI --------------------------------------------------------------------
  if (detail.bdi) {
    const bdi = section("Mind");
    bdi.appendChild(row("action", detail.bdi.action));
    bdi.appendChild(row("intention", detail.bdi.intentionKind ?? "none"));
    if (detail.bdi.foodDepletedTicks > 0) {
      bdi.appendChild(row("food-depleted ticks", String(detail.bdi.foodDepletedTicks)));
    }
    panel.appendChild(bdi);
  }

  // --- relationships ------------------------------------------------------
  const relationships = section("Relationships");
  if (detail.relationships.length === 0) {
    const empty = el("div", "hollow-inspect-empty", "No recorded ties yet.");
    empty.style.color = HOLLOW_PAL.steel;
    relationships.appendChild(empty);
  } else {
    for (const rel of detail.relationships) {
      relationships.appendChild(row(rel.peerName, fmt(rel.score)));
    }
  }
  panel.appendChild(relationships);

  // --- kin --------------------------------------------------------------------
  const kin = section("Kin");
  if (detail.kin.partner) kin.appendChild(row("partner", detail.kin.partner.name));
  if (detail.kin.parents.length > 0) {
    kin.appendChild(row("parents", detail.kin.parents.map((p) => p.name).join(", ")));
  }
  if (detail.kin.children.length > 0) {
    kin.appendChild(row("children", detail.kin.children.map((c) => c.name).join(", ")));
  }
  if (!detail.kin.partner && detail.kin.parents.length === 0 && detail.kin.children.length === 0) {
    const empty = el("div", "hollow-inspect-empty", "No recorded kin.");
    empty.style.color = HOLLOW_PAL.steel;
    kin.appendChild(empty);
  }
  panel.appendChild(kin);

  // --- community ------------------------------------------------------------
  if (detail.community) {
    const community = section("Community");
    community.appendChild(row("members", String(detail.community.memberCount)));
    community.appendChild(row("share rate", fmt(detail.community.shareRate)));
    community.appendChild(row("cooperation", fmt(detail.community.cooperationExpectation)));
    panel.appendChild(community);
  }

  return panel;
}
