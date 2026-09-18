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
    community: {
      id: 3, memberCount: 6, shareRate: 0.4, cooperationExpectation: 0.5,
      admissionPolicy: 0.5, leaderId: 9, leaderName: "Bramble", isLeader: false, standing: 0.62,
    },
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

describe("governance is visible in the client (audit-63)", () => {
  // hollow-12 (governance) and hollow-15 (mortality/care) were sim-core + chronicle only: the
  // snapshot shipped `leaderId` and a full `standing` Record every tick with NO reader anywhere in
  // the client, and the inspect payload carried two of the three norms. So two of Hollow's six
  // milestones were readable only by exporting CSV and opening it elsewhere — in the app whose
  // stated purpose is observing them.
  function textOf(detail: InspectDetail): string {
    const panel = renderInspectPanel(detail, { onClose: vi.fn(), onToggleFollow: vi.fn(), isFollowing: false });
    return panel.textContent ?? "";
  }

  it("shows the community's leader by name", () => {
    expect(textOf(makeDetail())).toContain("Bramble");
    expect(textOf(makeDetail())).toContain("leader");
  });

  it("says 'this agent' rather than a name when the inspected agent IS the leader", () => {
    const d = makeDetail();
    const detail = {
      ...d,
      community: { ...d.community!, leaderId: d.id, leaderName: "Someone", isLeader: true },
    };
    const text = textOf(detail);
    expect(text).toContain("this agent");
    expect(text).not.toContain("Someone");
  });

  it("handles a community with no leader yet", () => {
    const d = makeDetail();
    const detail = {
      ...d,
      community: { ...d.community!, leaderId: null, leaderName: null, isLeader: false },
    };
    expect(textOf(detail)).toContain("none yet");
  });

  it("shows this agent's own standing — the quantity leadership is argmax over", () => {
    expect(textOf(makeDetail())).toContain("standing");
    expect(textOf(makeDetail())).toContain("0.62");
  });

  it("shows ALL THREE votable norms, not two", () => {
    const text = textOf(makeDetail());
    for (const label of ["share rate", "cooperation", "admission"]) {
      expect(text, `norm "${label}" missing from the panel`).toContain(label);
    }
  });

  it("renders nothing community-shaped for an unaffiliated agent", () => {
    const detail = { ...makeDetail(), community: null };
    const text = textOf(detail);
    expect(text).not.toContain("standing");
    expect(text).not.toContain("admission");
  });
});
