import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, unmount } from "./os-entry";
import { mountHollow } from "./mount";

/**
 * The marketplace contract (imbatranimOS `marketplace/README.md`): `unmount`
 * must stop everything `mount` started. A desktop window is closed and
 * reopened in the same page, so anything left running is left running once
 * per reopen — a sim worker still ticking, a frame loop still drawing into a
 * detached canvas.
 *
 * jsdom has no Worker and no WebGL2. The Worker is faked so its `terminate`
 * can be counted; WebGL2 is simply absent, so the scene takes its
 * renderer-unavailable path, which is a real path and leaves the overlay frame
 * loop as the one loop to stop. The GL-context release is `HollowApp.dispose`'s
 * and is checked in a real browser (see the corpus log for the walk).
 */

class FakeWorker {
  static instances: FakeWorker[] = [];
  readonly posted: unknown[] = [];
  readonly terminate = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(message: unknown): void {
    this.posted.push(message);
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}

/** Pending frame callbacks by handle, so a test can see what is still scheduled. */
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;

beforeEach(() => {
  FakeWorker.instances = [];
  frames.clear();
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const handle = nextFrame++;
    frames.set(handle, cb);
    return handle;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
    frames.delete(handle);
  });
  // jsdom logs "not implemented" for canvas contexts; the absence is the point.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
});

function start(container: HTMLElement): void {
  const button = container.querySelector<HTMLButtonElement>(".hollow-setup-start-btn");
  expect(button).not.toBeNull();
  button!.click();
}

describe("Hollow's marketplace mount/unmount", () => {
  it("builds everything inside the container and touches nothing outside it", () => {
    const container = document.createElement("div");
    mount(container);

    expect(container.children).toHaveLength(1);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toBe("hollow-root");
    // The stylesheet travels inside the root. Vitest does not process CSS, so
    // its text is empty here; the built module carries it.
    expect(root.querySelector("style")).not.toBeNull();
    expect(root.querySelector("canvas.hollow-scene")).not.toBeNull();
    expect(document.body.getAttribute("style")).toBeNull();

    unmount(container);
  });

  it("stops the worker and every frame loop, and empties the container", () => {
    const container = document.createElement("div");
    mount(container);
    start(container);

    const [worker] = FakeWorker.instances;
    expect(worker?.posted[0]).toMatchObject({ type: "init" });
    expect(frames.size).toBeGreaterThan(0);

    unmount(container);

    expect(worker?.terminate).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    expect(container.childNodes).toHaveLength(0);
  });

  it("unmounts cleanly from the authoring screen, before any run has started", () => {
    const container = document.createElement("div");
    mount(container);
    unmount(container);

    expect(FakeWorker.instances[0]?.terminate).toHaveBeenCalledTimes(1);
    expect(container.childNodes).toHaveLength(0);
  });

  it("is idempotent, and a second mount into the same element replaces the first", () => {
    const container = document.createElement("div");
    mount(container);
    mount(container);

    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[0]?.terminate).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll(".hollow-root")).toHaveLength(1);

    unmount(container);
    unmount(container);
    expect(FakeWorker.instances[1]?.terminate).toHaveBeenCalledTimes(1);
  });

  it("mounts again after an unmount, as a window closed and reopened does", () => {
    const container = document.createElement("div");
    mount(container);
    start(container);
    unmount(container);

    mount(container);
    start(container);
    expect(FakeWorker.instances).toHaveLength(2);
    expect(container.querySelectorAll(".hollow-root")).toHaveLength(1);
    unmount(container);
    expect(frames.size).toBe(0);
  });

  it("shows no Share button inside the desktop, where the page hash is not Hollow's", () => {
    const inDesktop = document.createElement("div");
    mount(inDesktop);
    start(inDesktop);
    expect(inDesktop.querySelector(".hollow-share-button")).toBeNull();
    unmount(inDesktop);

    const page = document.createElement("div");
    const stop = mountHollow(page, { pageHash: true });
    start(page);
    expect(page.querySelector(".hollow-share-button")).not.toBeNull();
    stop();
  });
});
