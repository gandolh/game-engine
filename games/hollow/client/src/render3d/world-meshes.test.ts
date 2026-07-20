import { describe, it, expect } from "vitest";
import { boundsOf } from "@engine/core/render3d";
import { buildGroundMesh, buildTerritoryTileMesh } from "./world-meshes";
import { groundHeightAt } from "./terrain";

describe("buildGroundMesh", () => {
  it("builds a (size+1)^2-vertex, size*size*2-triangle heightfield", () => {
    const size = 8;
    const mesh = buildGroundMesh(size);
    expect(mesh.positions).toHaveLength((size + 1) * (size + 1));
    expect(mesh.tris).toHaveLength(size * size * 2);
  });

  it("every vertex's z matches groundHeightAt(gx, gy)", () => {
    const size = 6;
    const mesh = buildGroundMesh(size);
    const cols = size + 1;
    for (let gy = 0; gy <= size; gy++) {
      for (let gx = 0; gx <= size; gx++) {
        const p = mesh.positions[gy * cols + gx]!;
        expect(p[0]).toBe(gx);
        expect(p[1]).toBe(gy);
        expect(p[2]).toBe(groundHeightAt(gx, gy));
      }
    }
  });

  it("uses a single material (\"grass\") for every triangle", () => {
    const mesh = buildGroundMesh(4);
    const materials = new Set(mesh.tris.map((t) => t.material));
    expect([...materials]).toEqual(["grass"]);
  });

  it("is deterministic", () => {
    expect(buildGroundMesh(5)).toEqual(buildGroundMesh(5));
  });
});

describe("buildTerritoryTileMesh", () => {
  it("is a unit 1x1 quad at the local origin", () => {
    const mesh = buildTerritoryTileMesh();
    const b = boundsOf(mesh);
    expect(b.min).toEqual([0, 0, 0]);
    expect(b.max).toEqual([1, 1, 0]);
  });

  it("uses the given material key", () => {
    const mesh = buildTerritoryTileMesh("territoryTile");
    expect(mesh.tris.every((t) => t.material === "territoryTile")).toBe(true);
  });
});
