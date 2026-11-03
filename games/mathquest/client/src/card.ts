/**
 * DEV only (`?card`): the games portal's card art for MateQuest. Făt-Frumos facing a zmeu on the
 * battle backdrop, drawn by the combat screen's own `drawBattle` and sprites, with no HUD and no
 * sim. The portal's `scripts/cards.ts` captures it once `window.__cardReady` is true.
 */
import { Camera2D, createRenderer } from "@engine/core";
import { UISurface, loadFontAtlas } from "@engine/ui";
import { MATE_PAL } from "./render/mate-palette";
import { drawBattle } from "./ui/combat-screen";

export async function runCard(canvas: HTMLCanvasElement): Promise<void> {
  const camera = new Camera2D({ worldUnitsX: 640, worldUnitsY: 480, centerX: 320, centerY: 240 });
  const renderer = await createRenderer(canvas, camera);
  renderer.clearColor = MATE_PAL.black;
  // The renderer draws nothing until an atlas is registered; the game registers this one too.
  renderer.addAtlas(await loadFontAtlas());
  const surface = new UISurface(renderer);
  let frames = 0;
  const frame = (): void => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.beginFrame();
    surface.begin();
    drawBattle(surface, w, h, 0, h, "dragon", 28);
    surface.end();
    renderer.endFrame();
    frames += 1;
    if (frames === 10) (window as unknown as { __cardReady?: boolean }).__cardReady = true;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
