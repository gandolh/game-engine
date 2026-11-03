import { describe, it, expect, vi } from "vitest";
import { loadPatchedImage } from "./patched-image";
import type { PatchedImageIo } from "./patched-image";

const manifest = {
  version: 1,
  width: 64,
  height: 32,
  patchSize: 32,
  patches: [
    { file: "patch-0-0.png", x: 0, y: 0, w: 32, h: 32 },
    { file: "patch-1-0.png", x: 32, y: 0, w: 32, h: 32 },
  ],
};

function fakeIo(): { io: PatchedImageIo; fetched: string[]; closed: number[] } {
  const fetched: string[] = [];
  const closed: number[] = [];
  let n = 0;
  const io: PatchedImageIo = {
    fetch: (url) => {
      fetched.push(url);
      const body = url.endsWith(".json") ? manifest : {};
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body), blob: () => Promise.resolve(new Blob()) } as Response);
    },
    decode: () => {
      const id = n++;
      return Promise.resolve({ close: () => closed.push(id) } as unknown as ImageBitmap);
    },
  };
  return { io, fetched, closed };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("loadPatchedImage", () => {
  it("reads the manifest, then fetches a patch file only when it is first asked for", async () => {
    const { io, fetched } = fakeIo();
    const image = await loadPatchedImage("/painted/patches.json", "/game/", io);
    expect(image.manifest.patches).toHaveLength(2);
    expect(fetched).toEqual(["/game/painted/patches.json"]);
    expect(image.produce(1, { originX: 32, originY: 0, width: 32, height: 32 })).toBeNull();
    expect(image.produce(1, { originX: 32, originY: 0, width: 32, height: 32 })).toBeNull(); // no second fetch
    await flush();
    expect(fetched).toEqual(["/game/painted/patches.json", "/game/painted/patch-1-0.png"]);
    expect(image.produce(1, { originX: 32, originY: 0, width: 32, height: 32 })).not.toBeNull();
  });

  it("closes a released patch, including one released while it was still loading", async () => {
    const { io, closed } = fakeIo();
    const image = await loadPatchedImage("/painted/patches.json", "/", io);
    image.produce(0, { originX: 0, originY: 0, width: 32, height: 32 });
    await flush();
    image.release?.(0);
    expect(closed).toEqual([0]);
    image.produce(1, { originX: 32, originY: 0, width: 32, height: 32 });
    image.release?.(1); // in flight
    await flush();
    expect(closed).toEqual([0, 1]);
    expect(image.produce(1, { originX: 32, originY: 0, width: 32, height: 32 })).toBeNull(); // fetched again
  });

  it("names a bad manifest", async () => {
    const io: PatchedImageIo = {
      fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ version: 9 }) } as Response),
      decode: vi.fn(),
    };
    await expect(loadPatchedImage("/x/patches.json", "/", io)).rejects.toThrow(/patches.json: unknown version 9/);
  });
});
