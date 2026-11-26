# usage: python3 perkind-patch.py <repo root> before|after
# Patches a checkout for one bench run, to be reverted after it (never committed to the source): each frame
# records its pushed draws, GL draws and drawn instances per kind (static, corpse, nodes, agents) into the
# profile's timers as tmp.push.*, tmp.gl.*, tmp.inst.*. "before" is the tree at 6096ffc, "after" brief 31's.
import sys
root, mode = sys.argv[1], sys.argv[2]
r = root + "/engine/core/src/render3d/webgl2/renderer3d.ts"
s = open(r).read()
s = s.replace("  readonly lastDrawStats = { drawCalls: 0, instances: 0 };",
              "  readonly lastDrawStats = { drawCalls: 0, instances: 0 };\n  readonly tmpKept = new Map<DrawCall3d, number>();", 1)
s = s.replace("    let drawCalls = 0;\n    let instances = 0;\n",
              "    let drawCalls = 0;\n    let instances = 0;\n    this.tmpKept.clear();\n", 1)
s = s.replace("      if (kept === 0) continue;\n", "      this.tmpKept.set(draw, kept);\n      if (kept === 0) continue;\n", 1)
assert "tmpKept.set" in s and "tmpKept.clear" in s
open(r, "w").write(s)
a = root + "/games/hollow/client/src/render3d/app.ts"
s = open(a).read()
if mode == "before":
    static = "d.mesh === groundMesh || d.mesh === territoryTileMesh || d.mesh === hearthMesh || d.mesh === graveyardMesh || [...homeMeshByMemberCount.values()].includes(d.mesh)"
else:
    static = "d.mesh === staticMeshes.fixedDraw?.mesh || d.mesh === staticMeshes.changingDraw?.mesh"
snippet = """
        {
          const kindOf = (d: DrawCall3d): string =>
            %s ? "static" : d.mesh === corpseMesh ? "corpse" : d.mesh === foodNodeMesh || d.mesh === materialNodeMesh ? "nodes" : "agents";
          const tally: Record<string, number> = {};
          for (const k of ["static", "corpse", "nodes", "agents"]) {
            tally["push." + k] = 0;
            tally["gl." + k] = 0;
            tally["inst." + k] = 0;
          }
          for (const d of draws) {
            const k = kindOf(d);
            const kept = renderer.tmpKept.get(d) ?? 0;
            tally["push." + k] = (tally["push." + k] ?? 0) + 1;
            if (kept > 0) tally["gl." + k] = (tally["gl." + k] ?? 0) + 1;
            tally["inst." + k] = (tally["inst." + k] ?? 0) + kept;
          }
          for (const [key, v] of Object.entries(tally)) profiler.add("tmp." + key, v);
        }
""" % static
anchor = "          draws,\n        });\n"
assert s.count(anchor) == 1
s = s.replace(anchor, anchor + snippet, 1)
open(a, "w").write(s)
print("patched", root, mode)
