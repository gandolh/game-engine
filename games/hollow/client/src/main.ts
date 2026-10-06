/**
 * Hollow's standalone page (`index.html`, `npm run hollow`). Mounts the app
 * into `#app` with the page's hash as Hollow's own, so a shared run in the URL
 * replays and Share writes one. Everything else is in `mount.ts`; the
 * marketplace module (`os-entry.ts`) mounts the same app without the hash.
 */
import "./page.css";
import { mountHollow } from "./mount";

const app = document.getElementById("app");
if (!(app instanceof HTMLElement)) {
  throw new Error("hollow: #app container missing from index.html");
}
mountHollow(app, { pageHash: true });
