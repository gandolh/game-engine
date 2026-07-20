import { describe, it, expect } from "vitest";
import { HOLLOW_PAL } from "../render/hollow-palette";
import { communityColorRole, COMMUNITY_COLOR_ROLES } from "./community-color";

describe("communityColorRole", () => {
  it("is deterministic for a given id", () => {
    expect(communityColorRole(3)).toBe(communityColorRole(3));
    expect(communityColorRole(0)).toBe(communityColorRole(0));
  });

  it("always returns a valid HOLLOW_PAL role name", () => {
    for (let id = 0; id < 20; id++) {
      const role = communityColorRole(id);
      expect(Object.prototype.hasOwnProperty.call(HOLLOW_PAL, role)).toBe(true);
    }
  });

  it("cycles through the fixed role list in order, wrapping", () => {
    const n = COMMUNITY_COLOR_ROLES.length;
    for (let id = 0; id < n; id++) {
      expect(communityColorRole(id)).toBe(COMMUNITY_COLOR_ROLES[id]);
    }
    // Wraps: id `n` reuses slot 0's role.
    expect(communityColorRole(n)).toBe(COMMUNITY_COLOR_ROLES[0]);
    expect(communityColorRole(n + 2)).toBe(COMMUNITY_COLOR_ROLES[2]);
  });

  it("assigns distinct roles to distinct ids within one cycle", () => {
    const n = COMMUNITY_COLOR_ROLES.length;
    const roles = new Set(Array.from({ length: n }, (_, id) => communityColorRole(id)));
    expect(roles.size).toBe(n);
  });
});
