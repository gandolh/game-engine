# Recipe and PNG round trip

status: closed 2026-11-26. Built 2026-11-23 as brief 23 ([23](../../briefs/done/23-recipes-to-png-and-back.md)); promoted, by the owner's call to
build light optimizations without waiting for a trigger. Its trigger was to promote it when someone wants to edit art in a pixel editor such as Aseprite or
LibreSprite, for example a commissioned artist.
created: 2026-11-20
context: the 60 fps plan, [frame-budget.md](../../wiki/frame-budget.md).

Recipes are text, which suits agents and diffs, but no pixel editor opens them. Studios that keep a
text or data source still let artists work in their editor, through an export and an import.

If it is promoted:

- `recipe-export` writes a recipe as an indexed PNG whose palette is the game's swatch table, so the
  editor offers only legal colours;
- `recipe-import` reads the PNG back, refuses off-palette colours and writes the recipe file. Brief
  13's `grid.txt` importer is the same tool with another input format.

The recipe stays the source, so the palette guard and brief 11's checks keep working. The editor
becomes one more way to write it.
