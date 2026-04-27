# Open World

A point-crawl map system for TTRPG sandbox campaigns. Named places connected by paths, queryable via MCP, rendered with two pipelines: an SVG vector renderer and a painted canvas renderer (Procreate brush stamps composited on the fly).

The system uses a Supabase database (the `thoughts` table) as the source of truth, an MCP server for querying and capturing data, and a static HTML map viewer.

## Current Campaign: The Basilisk Campaign

Set in the Blackwater Crossing region of Belerion, Dragon Isles. 14 locations, 14 paths, 15 rumors, 3 completed journeys.

## View the Map

Static-only (no AI features):

```sh
python3 -m http.server 8787
open http://localhost:8787/
```

With the local Node proxy (enables the empty-hex "Generate this hex" button):

```sh
# Put ANTHROPIC_API_KEY=sk-ant-... in .env at repo root, then:
node tools/dev-server.mjs
open http://localhost:8787/
```

The proxy serves the same static site AND exposes `/api/generate-hex`, which calls the Anthropic API server-side so the API key never reaches the browser. On GitHub Pages there is no proxy, so the Generate button stays hidden.

The landing page links into the painted renderer by default. Both renderers are at:

- `viewer/painted.html?map=Basilisk&style=wilderland&grid=hex` — painted canvas (brush stamps)
- `viewer/map.html?map=Basilisk&style=wilderland&grid=hex` — SVG vector

URL params (both pages):

- `map=<campaign>` (required)
- `style=<wilderland|moonletters|dragonisles>` — palette + font; doesn't change how stamps render
- `grid=<square|hex|none>`

Both pages have Style + Renderer + Grid dropdowns; settings round-trip via URL params. The painted page also persists pan/zoom in the URL hash so reload returns to the same view.

## Renderers and Styles

There are **two renderers** and **four styles** — independent axes:

- **SVG renderer** (`viewer/map.html`) — vector linework, procedural ink + roughjs textures.
- **Painted renderer** (`viewer/painted.html`) — Canvas 2D + Procreate brush stamps for terrain art; SVG overlay for rivers, roads, labels, hex grid, hover/click handlers.
- **Styles** — Wilderland, Moon Letters, Dragon Isles. Style controls **link palette + font only**: river/road/label colours change between styles, but stamp art doesn't.

Both renderers support all four styles.

## Rebuild the Map from the Database

The map JSON is rebuilt by querying the Supabase database via MCP tools. Run this in Claude Code (with the `open-world` MCP connected):

> Rebuild the Basilisk Campaign map JSON. Follow the instructions in `docs/rebuild-map.md`.

This will:

1. Query all points, paths, and campaign metadata from the database
2. Parse each thought into the graph JSON schema
3. Preserve existing `x_hint`/`y_hint` positions from the current file
4. Write the updated JSON to `maps/Basilisk/Basilisk.json`

See [rebuild-map.md](docs/rebuild-map.md) for the full prompt and schema reference.

## Correct Map Data

Corrections should update **both** the database (via MCP) and the JSON so they stay in sync.

**Fix a place description or metadata:**

> The description for Thornespire Keep is wrong. Update it to: "..." Save the correction to the database using `capture_thought`, then rebuild the map JSON.

**Add a new location:**

> Add a new point: "Raven's Perch is an abandoned watchtower on a hilltop northeast of Thornespire Keep." Capture it to the database using `capture_thought`, then rebuild the map JSON.

**Add or fix a path:**

> Add a path: "A trail leads from Thornespire Keep to Raven's Perch, about half a day through tough forest terrain." Capture it to the database using `capture_thought`, then rebuild the map JSON.

**Fix a mis-typed thought in the database:**

> Search for "The Old Forest" in the database. It is typed as "observation" but should be "point". Recapture it with the correct content.

**Adjust map layout (positions only):**

Edit `x_hint` and `y_hint` values directly in the campaign JSON file. These are relative coordinates that seed the force layout. No database change needed — positions are a rendering concern, not data.

## Project Structure

```
open-world-map/
  CLAUDE.md                    # Claude Code context
  README.md                    # this file
  index.html                   # redirect into viewer/index.html
  docs/
    Open-World-Map.md          # full spec
    rebuild-map.md             # rebuild prompt and schema reference
    STYLE.md                   # SVG-renderer visual style guide
    Map Effects Style Tuning.md  # painted-renderer rules + conventions
    painted-renderer.md        # painted renderer build spec
    tasks.md                   # running open / completed log
  viewer/
    index.html                 # landing page
    map.html                   # SVG renderer entry point
    painted.html               # painted renderer entry point
    core-data.js               # shared data layer (loading, hex math, panel UX)
    core.js                    # SVG-side rendering plumbing
    core-raster.js             # canvas-side rendering plumbing
    renderers/
      wilderland.js  moonletters.js  dragonisles.js                # SVG style modules
      mapeffects.js                                                # painted style module
    grids/{square,hex}.js      # SVG grid overlays
    style-references/          # source art for the SVG renderers
    mapeffects-inventory.html  # brush-metadata browser
    assets/mapeffects/         # derived runtime assets (gitignored)
  tools/
    build-mapeffects-assets.mjs    # extract brush stamps from .brushset → PNGs
    extract-brush-metadata.py      # classify + size brushes via metadata
  maps/
    Basilisk/
      Basilisk.json            # graph data
      Basilisk-{style}.svg     # exported SVGs
      screenshots/             # reference images
  resources/                   # source brushsets, paper textures (gitignored)
```

## Architecture

- **Database:** Supabase `thoughts` table with embeddings. Every map entity (point, path, rumor, journey, campaign) is a thought with a `thought_type` in metadata.
- **MCP Server:** `open-world-mcp` Edge Function. Tools: `capture_thought`, `search_thoughts`, `list_thoughts`, `thought_stats`.
- **SVG renderer:** D3.js force layout, vector linework, four style modules sharing `core.js`. Christopher Tolkien aesthetic.
- **Painted renderer:** Canvas 2D paints terrain art (mountains, forests, vegetation, settlements) using brush stamps extracted from Procreate `.brushset` files. SVG overlay layers on top for rivers, roads, labels, hex grid, hover/click. Per-style palettes recolour the linework.
- **Build pipeline:** `tools/build-mapeffects-assets.mjs` extracts brush silhouettes from `resources/`, trims to alpha bbox, writes `viewer/assets/mapeffects/symbols/`. `tools/extract-brush-metadata.py` reads the brush plists, classifies into archetypes, computes per-stamp `suggested_height_px`. Both run offline; outputs are gitignored.

## Terminology

The painted renderer uses three related but distinct terms — keep them straight when reading code or docs:

- **stamp** — runtime placement on canvas. Used in renderer code (`drawStamp`, `pickStamp`, `stamp.img`, `stamp.h`, `_stampPositions`) and the inventory page UI. When talking about runtime sizing, placement, or rendering, this is the right word.
- **brush** — the original Procreate source artwork. Refers specifically to the upstream artwork before it became a runtime asset. Surfaces in the metadata field `brush_name` (the artist's name for the stamp) and the source `Brush.archive` plist.
- **symbol** — the on-disk filesystem path (`viewer/assets/mapeffects/symbols/<category>/shape-NN.png`). Mostly a folder-organisation term; rarely surfaces in user-facing text.

Rule of thumb: source = brush, runtime = stamp, file path = symbol.
