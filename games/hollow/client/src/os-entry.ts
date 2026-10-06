/**
 * Hollow as an ImbatranimOS marketplace app: the module `npm run build:os`
 * emits as `dist/os/hollow.mjs`. The desktop imports it and calls `mount` with
 * a window's content element when the window opens, and `unmount` when it
 * closes. The contract is in the imbatranimOS repository, `marketplace/README.md`.
 *
 * Hollow needs nothing from `system` to run, so the descriptor asks for no
 * capabilities and this module touches none. The page's hash is the
 * desktop's, so a run starts from the authoring screen and there is no Share
 * button (see `MountOptions.pageHash`).
 */
import { mountHollow } from "./mount";

const mounted = new WeakMap<HTMLElement, () => void>();

/** Open Hollow in `container`. The second and third arguments (`system`, `host`) are unused. */
export function mount(container: HTMLElement): void {
  // A second mount into the same element replaces the first rather than
  // stacking two sims on one canvas.
  unmount(container);
  mounted.set(container, mountHollow(container, { pageHash: false }));
}

/** Stop everything `mount` started and leave `container` as it was. Idempotent. */
export function unmount(container: HTMLElement): void {
  mounted.get(container)?.();
  mounted.delete(container);
}
