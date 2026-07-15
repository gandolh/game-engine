/**
 * Barrel for the Citadel client's main/ module directory (brief 114 split of the former
 * 1,949-line main.ts — the largest source file in the repo, and the one violating the
 * repo's module-directory convention: "large units = a directory of focused modules behind
 * a barrel", per the Farm client's `games/farm/client/src/main/` precedent).
 *
 * Importing this module runs the ENTIRE original boot sequence as a side effect, in the same
 * relative order main.ts used to: DOM refs + toast/audio/occupancy-badge wiring, then every
 * canvas/window input listener (capture-phase HUD forwarding, world pan/placement, follow-cam,
 * coverage-toggle, settings-escape), then the save/load button wiring, then boot.ts's dev-hook
 * install + the async boot() (or ?showcase) kickoff. src/main.ts (the Vite entry) just imports
 * this directory and the stylesheet — see that file for the "thin entry" half of the split.
 *
 * Public surface: intentionally empty. Every other module under main.ts's old scope resolved
 * downward into this directory; nothing outside src/main.ts or its own tests currently needs to
 * import FROM here. A future dependent should import the specific submodule it needs
 * (e.g. `./main/sim-client` for `client`/`useServer`, `./main/build-controls` for placement
 * mode state) rather than growing this barrel into a second god-module.
 */
import "./hud-wiring";
import "./input";
import "./save-load";
import "./boot";
