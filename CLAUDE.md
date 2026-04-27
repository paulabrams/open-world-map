# Open World — Claude Code Context

## What This Is

Point-crawl map system for TTRPG campaigns. Supabase DB (thoughts table) + MCP server + static map viewer with two rendering pipelines (SVG vector + painted canvas).

Current campaign: **The Basilisk Campaign** (Blackwater Crossing region, Belerion, Dragon Isles).

## Renderers and Styles

There are **two renderers** and **four styles** — independent axes:

- **SVG renderer** at `viewer/map.html` (vector linework + procedural ink). Pages: `viewer/core.js` + `viewer/renderers/{wilderland,thirdage,moonletters,dragonisles}.js`.
- **Painted renderer** at `viewer/painted.html` (canvas + brush stamps). Pages: `viewer/renderers/mapeffects.js` + `viewer/core-raster.js`.
- **Styles** (palette + font, NOT how stamps render): Wilderland, Moon Letters, Dragon Isles. Both renderers support all four styles via `?style=` URL param. Switching styles only re-colours linework — stamp art is unchanged.

Both pages have Style + Renderer + Grid dropdowns; settings round-trip via URL params.

## MCP Tools Available

- `capture_thought` — save a thought to the database
- `update_thought` — replace an existing thought by ID (use after a contradiction warning)
- `search_thoughts` — semantic search by meaning
- `list_thoughts` — list / filter
- `thought_stats` — summary counts
- `check_consistency` — find contradictions across the corpus
- `list_campaigns` — discover valid campaign names

**Valid `thought_type` values** (canonical source: `open-world/supabase/functions/_shared/thought-schema.ts`):
`point`, `path`, `rumor`, `journey`, `campaign`, `observation`, `note`, `terrain`, `monster`, `npc`.

Hex terrain is stored as `terrain` thoughts in the DB AND as the `hex_terrain` field in the campaign JSON — keep both in sync when reclassifying a hex.

## Key Files

### Documentation

- `docs/Open-World-Map.md` — full spec
- `docs/rebuild-map.md` — full rebuild prompt and schema reference
- `docs/STYLE.md` — SVG-renderer visual style guide (Tolkien aesthetic)
- `docs/Map Effects Style Tuning.md` — painted-renderer rules and conventions
- `docs/painted-renderer.md` — painted-renderer build spec and architecture
- `docs/tasks.md` — running open/completed log

### Viewer

- `viewer/index.html` — landing page, links into the map
- `viewer/map.html` — SVG renderer entry point
- `viewer/painted.html` — painted (canvas) renderer entry point
- `viewer/core-data.js` — shared data layer (loading, hex math, panel UX, travel-time math, RNG, hex neighbours)
- `viewer/core.js` — SVG-side rendering plumbing (route finding, force layout, label placement)
- `viewer/core-raster.js` — canvas-side rendering plumbing (asset cache, paint context, knockout silhouettes, drawStamp, drawStampAtHeight, polylineToD)
- `viewer/renderers/wilderland.js`, `moonletters.js`, `dragonisles.js` — SVG style modules
- `viewer/renderers/mapeffects.js` — painted style module (the only one for the canvas renderer; per-style palettes live inside it as `STYLE_PALETTES`)
- `viewer/grids/{square,hex}.js` — SVG grid overlay modules
- `viewer/style-references/*` — source art for the SVG renderers
- `viewer/mapeffects-inventory.html` — brush-metadata browser used to triage painted-renderer stamps
- `viewer/assets/mapeffects/` — derived runtime assets for the painted renderer (gitignored; rebuild via `tools/build-mapeffects-assets.mjs`)

### Build tools

- `tools/build-mapeffects-assets.mjs` — extracts brush stamps from Procreate `.brushset` files in `resources/`, trims to alpha bbox, writes manifest + per-category PNGs to `viewer/assets/mapeffects/symbols/`. Re-run after changing `SHAPE_MAX_EDGE` or the brushset list.
- `tools/extract-brush-metadata.py` — reads each brush's `Brush.archive` plist and the trimmed PNG dimensions, classifies into archetypes, runs blob/peak detection, computes `suggested_height_px`. Output: `viewer/assets/mapeffects/brush-metadata.json`. Re-run after changing classification patterns or sizing constants — no asset rebuild needed.

### Data

- `maps/{campaign}/{campaign}.json` — graph data per campaign (e.g. `maps/Basilisk/Basilisk.json`)
- `maps/{campaign}/{campaign}-{style}.svg` — exported SVGs per campaign
- `maps/{campaign}/screenshots/*.png` — reference screenshots
- `index.html` (repo root) — redirects to `viewer/index.html`

## View the Map

```sh
python3 -m http.server 8787
```

Then open one of:

- `http://localhost:8787/` — landing page → click "Open Map"
- `http://localhost:8787/viewer/painted.html?map=Basilisk&style=wilderland&grid=hex` — painted renderer (default)
- `http://localhost:8787/viewer/map.html?map=Basilisk&style=wilderland&grid=hex` — SVG renderer

URL params (both pages): `?map=<campaign>&style=<style>&grid=<square|hex|none>`.

The painted page also persists pan/zoom in the URL hash so reload returns to the same view.

## Rebuild the Map JSON

Use `/map Basilisk` or follow `docs/rebuild-map.md`. Short version:

1. `list_thoughts` type "point" (limit 50) + type "path" (limit 50) + type "campaign"
2. Also `search_thoughts` for any places that may be mis-typed (Old Forest is "observation", Serpent's Teeth is "path" — both should be "point")
3. Parse each thought into the graph schema (see rebuild-map.md for field mappings)
4. Read existing JSON and preserve `x_hint`/`y_hint` values
5. Write updated JSON to `maps/{campaign}/{campaign}.json`

## Correct Map Data

Always update **both** the database AND the JSON to keep them in sync:

1. **Fix content:** `capture_thought` with corrected text, then rebuild the JSON
2. **Add location/path:** `capture_thought` with new content, then rebuild the JSON
3. **Fix layout only:** Edit `x_hint`/`y_hint` directly in the JSON (no DB change needed)

## Graph JSON Schema

```
{ meta: { campaign, world, region, era },
  nodes: [{ id, name, point_type, terrain, visible, description, x_hint, y_hint, hex }],
  links: [{ source, target, name, days, path_type, terrain_difficulty, visible }],
  hex_terrain: { "CCRR": "<terrain>" },
  river_path: ["CCRR", ...],
  road_path: [{ name, hexes: [...], path_type, terrain_difficulty, days }],
  off_map_arrows: [{ direction: "N|NE|E|SE|S|SW|W|NW", label }] }
```

- `point_type`: heart, fortress, tavern, settlement, wilderness, dungeon, sanctuary, tower, ruin, waypoint, lair
- `terrain`: plains, forest, mountains, swamp, hills, forested-hills, farmland, etc.
- `path_type`: road, trail, wilderness, river
- `terrain_difficulty`: easy, tough, perilous
- `x_hint`/`y_hint`: position in inches relative to Blackwater Crossing (0,0). Positive x = east, positive y = south.
- `hex`: 4-digit `"CCRR"` (column, row), Blackwater Crossing = `"1010"`.

## Terminology (painted renderer)

- **stamp** — runtime placement on canvas. Used in renderer code (`drawStamp`, `_stampPositions`) and inventory UI.
- **brush** — original Procreate source artwork. Surfaces in metadata field `brush_name` and the `Brush.archive` plist.
- **symbol** — on-disk filesystem path (`viewer/assets/mapeffects/symbols/<category>/shape-NN.png`).

Rule of thumb: source = brush, runtime = stamp, file path = symbol.

## Known DB Issues

- "The Old Forest" is stored as type `observation` instead of `point`
- "Serpent's Teeth Crags" is stored as type `path` instead of `point`

Both are found via `search_thoughts` but missed by `list_thoughts(type="point")`.
