/**
 * Citadel — browser entry point.
 *
 * Phase 3: chapel, market, watchpost, tradingpost; happiness HUD;
 *          trader panel.
 * Phase 4: quarry/sawmill/smith/mine refiners; wall (drag-paint) + gate;
 *          tower/garrison/keep defenses; threat/defense/keep HUD; raider dots.
 * Phase 5: settlement tier HUD; save/load via command-log replay (localStorage
 *          + downloadable JSON blob).
 *
 * Brief 114: this file used to be ~1,950 lines of DOM wiring, input handling, sim-client
 * plumbing, and the render loop — the largest source file in the repo, and a holdout from
 * the module-directory convention used everywhere else ("large units = a directory of
 * focused modules behind a barrel"; see the Farm client's `games/farm/client/src/main/` for
 * the precedent this follows). That code now lives in `src/main/` (see `main/index.ts` for
 * the module map and boot order) — this file stays the Vite entry point (index.html points
 * at it directly) and is now just the stylesheet import + the main/ barrel.
 */
import "./style.css";
import "./main";
