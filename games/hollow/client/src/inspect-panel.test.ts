import { describe, it, expect, vi } from "vitest";
import { renderInspectPanel } from "./inspect-panel";
import type { InspectDetail } from "./inspect-detail";

function makeDetail(overrides: Partial<InspectDetail> = {}): InspectDetail {
  return {
    id: 42,
    name: "Bramwick",
    alive: true,
    stage: "adult",
    ageTicks: 500,
    communityId: 3,
    householdId: 7,
    genome: {
      behavior: { sociability: 0.62, risk: 0.3 },
      aptitude: { food: 0.7, material: 0.4 },
      appearance: { height: 1.02, build: 0.98, skinTone: "skin", hairTone: "hairBrown" },
    },
    needs: { food: 45, rest: 80, wealth: 60, safety: 100, belonging: 70 },
    starving: false,
    bdi: { action: "work", intentionKind: "harvest", starving: false, foodDepletedTicks: 0, violentDeath: false },
    relationships: [{ peerId: 5, peerName: "Corley", score: 0.81 }],
    kin: {
      parents: [{ id: 1, name: "Delford" }],
      children: [],
      partner: { id: 9, name: "Ivowick" },
    },
    community: { id: 3, memberCount: 6, shareRate: 0.4, cooperationExpectation: 0.5 },
    deathCause: null,
    deathTick: null,
    ...overrides,
  };
}

describe("renderInspectPanel", () => {
  it("contains the agent's name", () => {
    const panel = renderInspectPanel(makeDetail(), { onClose: vi.fn(), onToggleFollow: vi.fn(), isFollowing: false });
    expect(panel.textContent).toContain("Bramwick");
  });

  it("contains the life stage", () => {
    const panel = renderInspectPanel(makeDetail(), { onClose: vi.fn(), onToggleFollow: vi.fn(), isFollowing: false });
    expect(panel.textContent).toContain("adult");
  });

  it("contains a genome value", () => {
    const panel = renderInspectPanel(makeDetail(), { onClose: vi.fn(), onToggleFollow: vi.fn(), isFollowing: false });
    expect(panel.textContent).toContain("sociability");
    expect(panel.textContent).toContain("0.62");
  });

  it("contains a need value", () => {
    const panel = renderInspectPanel(makeDetail(), { onClose: vi.fn(), onToggleFollow: vi.fn(), isFollowing: false });
    expect(panel.textContent).toContain("food");
    expect(panel.textContent).toContain("45");
  });

  it("contains a relationship entry", () => {
    const panel = renderInspectPanel(makeDetail(), { onClose: vi.fn(), onToggleFollow: vi.fn(), isFollowing: false });
    expect(panel.textContent).toContain("Corley");
    expect(panel.textContent).toContain("0.81");
  });

  it("contains a kin entry", () => {
    const panel = renderInspectPanel(makeDetail(), { onClose: vi.fn(), onToggleFollow: vi.fn(), isFollowing: false });
    expect(panel.textContent).toContain("Ivowick");
    expect(panel.textContent).toContain("Delford");
  });

  it("wires the close button to onClose", () => {
    const onClose = vi.fn();
    const panel = renderInspectPanel(makeDetail(), { onClose, onToggleFollow: vi.fn(), isFollowing: false });
    const btn = panel.querySelector(".hollow-inspect-close") as HTMLButtonElement;
    btn.click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("wires the follow button to onToggleFollow and reflects isFollowing", () => {
    const onToggleFollow = vi.fn();
    const panel = renderInspectPanel(makeDetail(), { onClose: vi.fn(), onToggleFollow, isFollowing: true });
    const btn = panel.querySelector(".hollow-inspect-follow") as HTMLButtonElement;
    expect(btn.textContent).toContain("Following");
    btn.click();
    expect(onToggleFollow).toHaveBeenCalledOnce();
  });

  it("renders a reduced (deceased) panel without needs/bdi sections", () => {
    const dead = makeDetail({
      alive: false,
      stage: "deceased",
      needs: null,
      bdi: null,
      starving: false,
      deathCause: "starvation",
      deathTick: 1234,
      communityId: null,
      householdId: null,
      relationships: [],
      kin: { parents: [], children: [], partner: null },
      community: null,
    });
    const panel = renderInspectPanel(dead, { onClose: vi.fn(), onToggleFollow: vi.fn(), isFollowing: false });
    expect(panel.textContent).toContain("deceased");
    expect(panel.textContent).toContain("starvation");
    expect(panel.querySelector(".hollow-inspect-empty")).not.toBeNull();
  });
});
