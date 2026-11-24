# Camera edge captures (brief 29)

`shot.mjs` drives headless Chromium over CDP: it drags hard toward a corner, shoots, drags a little back and
shoots again. Usage is in its header; each game needs its own dev server up.

- `farm-corner.png`: the world's top-left corner sits at the screen centre.
- `citadel-corner.png`: the diamond's left tip sits at the screen centre.
- `hollow-corner.png`, `hollow-vertical-corner.png`, `hollow-horizontal-corner.png`: the map corner or edge stops at
  the screen centre, for a diagonal, a vertical-only and a horizontal-only drag.
- `*-back.png`: the short drag back moves the view at once.
