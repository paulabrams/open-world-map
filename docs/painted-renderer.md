# Painted Renderer — Project Specification

## Goal

Build a new map renderer that produces output visually matching `resources/Dragon isles map painting/dragon isles map layers/Dragon Isles nov 4 2023.png`, but driven by the existing Basilisk campaign data in `maps/Basilisk/Basilisk.json`. The renderer composites raster brush stamps onto an HTML `<canvas>`.

The reference image is a hand-painted Procreate map made by the project owner using illustration brushes from the asset packs under `resources/`. Read it before starting — it is the visual target.

This is **not** a re-skin of the existing SVG renderers (`viewer/renderers/wilderland.js` etc.). It is a new pipeline. The current SVG styles must keep working unchanged.

The new style is called **`painted`** in code and **"Painted"** in UI. Do not use any other brand or product name in filenames, identifiers, comments, commit messages, or UI strings.

## Why a new pipeline (don't re-use SVG)

The reference look depends on four things that fight SVG and suit canvas:

1. Pre-painted brush sprites with internal texture, alpha falloff, irregular edges.
2. Per-stamp z-sort within terrain regions (north-most peaks layer over south-most peaks).
3. Dense packing — a single forest hex contains 40–80 overlapping tree stamps; one mountain range contains tens of mountain stamps.
4. Brush-style strokes with multiply/overlay blending against the paper texture.

Canvas 2D handles all four trivially. Doing the same in SVG means thousands of `<image>` nodes, base64 blobs, and `feBlend` filters. Use canvas.

## Inputs

### Data (already exists)

- `maps/Basilisk/Basilisk.json` — graph schema documented in `CLAUDE.md`. Key fields:
  - `meta.{campaign,world,region,era}`
  - `nodes[].{id, name, point_type, terrain, visible, description, x_hint, y_hint, hex, scale, parent}`
  - `links[].{source, target, name, days, path_type, terrain_difficulty, visible}`
  - `hex_terrain` — dict keyed by 4-digit `"CCRR"` hex address (col,row), values like `forest`, `forested-hills`, `swamp`, `farmland`, `plains`, `mountains`.
- Coordinate system: `x_hint`/`y_hint` are inches relative to Blackwater Crossing (0,0). Positive x = east, positive y = south.
- The painted renderer uses its own scale: **`PAINTED_SCALE = 200`** (1 inch = 200 px). It does **not** share `HINT_SCALE = 100` with the SVG renderers — painted output is sized for stamp readability, not for parity with the vector styles. Stamps need ~60–80 px of mountain width and ~20–30 px of tree silhouette to render their internal texture legibly; the SVG scale is too tight for that.
- Canvas sizing is **bounds-driven, not viewport-driven**. Compute the campaign extent from `min/max(x_hint, y_hint)` across all visible nodes and across all keys in `hex_terrain` (treating each hex as its center plus a 1-hex margin). Add 1.5 inches of padding on every side for the border and cartouche. Multiply by `PAINTED_SCALE` to get the internal canvas resolution. For Basilisk this lands around 2400×3000 px. The DOM `<canvas>` element is rendered at that internal resolution; CSS scales it to fit the viewport via `object-fit: contain`.
- Hex addresses: `"CCRR"` where col 10, row 10 = Blackwater Crossing center. Hex math (pointy-top, odd-q offset): `size = PAINTED_SCALE / 2`, `colStep = size * 2 * 0.75`, `rowStep = size * sqrt(3)`. The hex-to-pixel function lives in `core-raster.js` (a painted-renderer-specific copy parameterized by `PAINTED_SCALE`); the SVG-side hex math in `core.js` / `core-data.js` stays at `HINT_SCALE = 100` and is unchanged.

### Source asset packs (local only — do not commit, do not ship)

The runtime depends on derived sprites + textures extracted from artwork already on disk under `resources/Dragon isles map painting/`. **Both** the source `resources/` directory **and** the runtime asset directory `viewer/assets/painted/` are gitignored. Nothing ever lands in the repo. Each developer runs the asset extractor locally against their own copy of the source materials.

Source layout (read-only, used by the extractor only):

- `resources/Dragon isles map painting/Fantasy Map Builder - Map Effects/`
  - `Brushes/Procreate/*.brushset` — Mountains, Conifer Trees, Deciduous Trees, Lakes, Vegetation, Terrain, Features. Each `.brushset` is a renamed zip; each brush folder inside contains a `Shape.png` (the stamp) and `Grain.png` (texture).
  - `Extra Assets/Seamless - {Marsh,Grassland,Hatching,Rocky Terrain,Cracked Terrain,Hex,Grid}.JPG` — seamless tile patterns.
  - `Extra Assets/Border*.PNG` — decorative borders.
  - `Border Templates/*.png` — finished border frames at multiple page sizes.
  - `Paper Textures/Paper {1..8}.jpg` — large (10–13 MB) paper backgrounds.
- `resources/Dragon isles map painting/History Effects - Mapeffects.co/{Egyptian,Mayan} Effects/Brush Shapes/PNG/*.PNG` — 33 + 33 transparent PNG stamps in usable form (fallback library).
- `resources/Dragon isles map painting/dragon isles map layers/Dragon Isles nov 4 2023.png` — the visual reference target.

License terms on these source packs forbid redistribution. The repo therefore must not contain any derived assets either, even downsampled or re-encoded. Treat the entire pipeline from `resources/` through `viewer/assets/painted/` as a **local build artifact**.

## Architecture

### Files to create

```
tools/build-painted-assets.mjs       # offline asset extractor (Node)
viewer/assets/painted/               # derived runtime assets — gitignored, never committed
  manifest.json
  paper.webp
  patterns/{marsh,grassland,hatching,rocky}.webp
  border.png
  cartouche.png
  symbols/mountains/*.png
  symbols/conifer/*.png
  symbols/deciduous/*.png
  symbols/vegetation/*.png
  symbols/lakes/*.png
  symbols/features/*.png             # towers, ruins, lairs, etc.
  symbols/settlements/*.png          # village/castle/walled-city
viewer/core-data.js                  # extracted from core.js: data + hex math + UX, no rendering
viewer/core-raster.js                # canvas helpers: asset preload, pattern cache, hex-to-pixel, label jitter
viewer/renderers/painted.js          # the painted style module
viewer/painted.html                  # new page hosting the canvas pipeline
```

### `.gitignore` updates

Add (or confirm present):

```
resources/
viewer/assets/painted/
```

The asset extractor must fail loudly with a clear error message if `resources/` is missing or if expected source files aren't found, so a fresh checkout doesn't silently produce a half-empty manifest.

### Files to modify

- `viewer/core.js` — split into `core-data.js` (loading, hex math, panel UX, travel graph, RNG) plus the existing SVG-specific code that stays in `core.js`. Both pages load `core-data.js`; `map.html` additionally loads the SVG `core.js`, `painted.html` loads `core-raster.js`.

### Files to leave alone

- `viewer/map.html`, `viewer/renderers/{wilderland,thirdage,moonletters,dragonisles}.js`, `viewer/grids/*.js` — unchanged. After the refactor they import from `core-data.js` + `core.js` and behave identically.

### Page layout (`viewer/painted.html`)

```
<body>
  <div id="map-container">
    <canvas id="map-canvas"></canvas>          ← all art
    <svg id="map-hotspots"></svg>              ← transparent, click targets only
  </div>
  <div id="detail-panel">…</div>               ← reuse map.html markup + CSS
  <div id="controls">                          ← style + grid selectors (style scoped to raster styles)
  <button id="export-btn">Save PNG</button>
</body>
```

The hotspot SVG sits absolute-positioned over the canvas at the same dimensions. Each visible node gets one transparent `<circle r=…>` with a `data-id` attribute and the existing click → `MapCore.openPanel(node)` flow.

### Style module contract

```js
window.MapStyles.painted = {
  name: "Painted",
  font: "'IM Fell English', 'Cinzel', serif",     // fallback for canvas labels
  css: { /* same shape as wilderland.js */ },
  colors: { INK: "#1a1410", RED: "#9c2a1f", PAPER: "#f1e4c4", … },
  filterNodes(nodes) { return nodes.filter(isOverlandNode); },
  async render(paintCtx) { /* sequential layer passes — see Rendering Pipeline */ }
};
```

`paintCtx` shape (built by `core-raster.js`):
```js
{
  canvas, ctx2d,
  WIDTH, HEIGHT,                       // internal canvas resolution (bounds-driven)
  dpr,                                 // backing-store density (1 in v1)
  origin: { x, y },                    // pixel coords of the (0,0) graph point inside the canvas
  bounds: { xMinIn, xMaxIn, yMinIn, yMaxIn },  // graph extent in inches
  nodes, links, hexTerrain, riverPath, riverSpine, hexes,
  colors, font,
  assets: AssetCache,                  // see core-raster.js
  rng: mulberry32(seedFromString(campaign)),
  hexToXY(hex), xyToHex(x,y),          // painted-renderer math, parameterised by PAINTED_SCALE
  PAINTED_SCALE,                       // 200 px / inch
}
```

### Asset cache (`core-raster.js`)

```js
const AssetCache = {
  async preload(manifestUrl) { /* fetch manifest, load every PNG/WEBP, cache HTMLImageElement */ },
  pick(category, rng) { /* weighted random stamp from a category */ },
  pattern(name, ctx2d) { /* memoized createPattern */ },
  paper, border, cartouche               // singletons
};
```

The renderer awaits `AssetCache.preload()` before its first paint. If the manifest is missing, the page must surface an actionable error to the user ("Run `node tools/build-painted-assets.mjs` to generate runtime assets.") rather than silently rendering a blank canvas. Manifest format:

```json
{
  "paper": "paper.webp",
  "border": "border.png",
  "patterns": { "marsh": "patterns/marsh.webp", … },
  "categories": {
    "mountains": [
      { "src": "symbols/mountains/peak-01.png", "weight": 1.0, "anchor": [0.5, 0.9] },
      …
    ],
    "conifer":   [ … ],
    "deciduous": [ … ],
    "settlements/village": [ … ],
    "settlements/castle":  [ … ],
    "settlements/walled-city": [ … ],
    "features/tower":      [ … ],
    "features/ruin":       [ … ],
    "features/lair":       [ … ],
    "features/sanctuary":  [ … ]
  }
}
```

`anchor` is the stamp's pin point as a fraction of its bbox — usually `[0.5, 0.9]` so the bottom-center of a mountain/tree sits on the placement coordinate. The asset extractor writes sensible defaults; tune by hand in the manifest if needed. **Output filenames must be opaque** (e.g. `peak-01.png`, not preserve any source brand or product name from the originals).

## Rendering pipeline

The `render()` function paints the canvas in this exact order. Every layer is called sequentially.

1. **Paper** — `drawImage(assets.paper, 0, 0, WIDTH, HEIGHT)` scaled to fit. Optional `globalAlpha = 0.95` for slightly muted background.
2. **Sea fill** — flat color (`#dfd4b0` with subtle noise) over hexes whose terrain is water OR over the area outside any defined land hex. Land/sea boundary is implicit: hexes present in `hex_terrain` are land. Hexes with no entry are sea.
3. **Coastline** — find the boundary edges between land hexes and sea hexes. Trace them as polylines. Apply a perpendicular wobble (seeded, ±2 px, smoothed via cubic spline). Stroke at 3 px black, then re-stroke at 1 px with a 1.5 px outward offset to read as a doubled ink line. Reference image: see the Algönder/Belerion coastline.
4. **Sub-region pattern fills** (optional) — for swamp hexes, fill the hex polygon with `assets.pattern("marsh")` at low opacity; for `farmland` hexes, light `grassland` pattern. Mountains/forests get NO base pattern — their stamps do the work.
**Stamp sizing rule (applies to layers 5, 6, 7, 10, 12).** Brushset `Shape.png` files have **no meaningful natural size** — they're brush stamps that the artist scales freely in Procreate, and their alpha-trimmed bounding boxes are arbitrary. The runtime never trusts source dimensions. Every stamp is rescaled at **build time** to the category-uniform target height defined in *Stamp size normalization* under the Asset extractor section. The renderer then drops stamps in at the manifest's recorded size and only applies fine ±15% size jitter for variety. If a stamp ever appears the wrong size on screen, the fix is in the build, not in the renderer.

5. **Mountain stamps** — for each `mountains` and `forested-hills` hex (mountains only for now; forested-hills handled in step 6):
   - Generate 6–12 placement points inside the hex via Poisson-disk sampling (radius ~36 px in painted-scale pixels), seeded by hex address.
   - Sort points by **y descending** (south-first) so northern peaks paint on top.
   - For each point, pick a stamp from `categories.mountains` weighted-randomly. Stamp arrives at its build-normalized height (~110 px); apply ±15% size jitter, horizontal flip 50%, rotation 0 (mountains stay upright).
   - Draw with stamp's `anchor` aligned to the point.
   - **Adjacent mountain hexes share a skyline**: when a stamp's bbox would extend across a hex boundary into another mountain hex, allow it (don't clip). Iterate hexes in y-then-x order and let the natural overlap form ranges.
6. **Forest stamps** — for each `forest` and `forested-hills` hex:
   - Poisson-disk sample 40–80 points (radius ~16 px in painted-scale pixels) inside the hex, seeded.
   - Sort by y descending.
   - Pick from `categories.conifer` or `categories.deciduous` based on a per-hex 50/50 seeded coin flip (so each hex has a dominant tree type, like real biomes). Mix in 10–20% of the other type.
   - Stamp arrives at its build-normalized height (~32 px); apply ±15% size jitter, horizontal flip 50%, rotation 0.
   - For `forested-hills`, draw mountain stamps first (sparse, 2–4 per hex) then trees on top. Mountains and trees coexist at their own normalized sizes — do not rescale either.
7. **Vegetation flecks** — for `plains` and `farmland` hexes, scatter 3–8 tiny vegetation/grass-tuft stamps from `categories.vegetation` at low opacity. Optional but adds life.
8. **Rivers** — links with `path_type === "river"` and the precomputed `riverPath`. Polyline through hex centers (already computed by `core-data.js`). Apply gentle perpendicular wobble (±1 px, smoothed). Stroke 1.2 px solid black.
9. **Roads / trails** —
   - `road`: dotted line, 0.7 px black, 2 px gap (use `setLineDash([0.7, 2.0])` with `lineCap: "round"`). The reference uses dots, not dashes.
   - `trail`: lighter dotted, 0.5 px black, 3 px gap.
10. **Settlement stamps** — for each visible node, look up its `point_type` and place a stamp at `(origin.x + x_hint * PAINTED_SCALE, origin.y + y_hint * PAINTED_SCALE)`. Stamps arrive at their category's build-normalized height; the **size mult** column is the only per-`point_type` deviation from that baseline (use sparingly).

    | `point_type` | category                                      | size mult |
    |--------------|-----------------------------------------------|-----------|
    | `heart`      | `settlements/walled-city`                     | 1.15      |
    | `fortress`   | `settlements/castle`                          | 1.0       |
    | `settlement` | `settlements/village`                         | 1.0       |
    | `tower`      | `features/tower`                              | 1.0       |
    | `ruin`       | `features/ruin`                               | 1.0       |
    | `lair`       | `features/lair`                               | 1.0       |
    | `sanctuary`  | `features/sanctuary`                          | 1.0       |
    | `dungeon`    | `features/ruin` (or skull glyph if available) | 1.0       |
    | `tavern`     | `settlements/village`                         | 0.65      |
    | `waypoint`   | none (label only)                             | —         |
    | `wilderness` | none (label only)                             | —         |

    Stamp anchor is the bottom-center; the label sits below it.
11. **Rhumb lines** — pick a sea-center (the centroid of all sea hexes, or fall back to a fixed point). Cast 16 rays at 22.5° intervals to the canvas edges. Stroke 0.3 px, opacity 0.25, color `#1a1410`. Mask: rays only render over sea (where the mountain/forest layers wrote nothing — easiest to do by clipping to a sea path computed in step 2).
12. **Sea decorations** — sparse small stamps along sea edges: ships near coastlines, optional sea-monster glyphs in deep water. Pull from `categories.features` if appropriate stamps exist; otherwise skip in v1.
13. **Labels** — render on top of all art:
    - **Region labels** (`meta.region`, plus any `point_type: "region"` nodes if present): wide-tracked caps, ~36–48 px, opacity 0.7, ink color. Optionally arc along a curve if a `regionPath` is provided; skip arcing in v1.
    - **Place labels**: per-node, font from style. Color is **red** (`colors.RED`) for `point_type` in `{heart, fortress, dungeon, lair}`; **black** (`colors.INK`) for everything else. Position: stamp y + stamp height + 4 px (below the stamp). Center-aligned.
    - **Hand-lettered jitter**: render labels character-by-character. For each char: baseline jitter ±0.5 px, rotation jitter ±1.5°, both seeded by `(label + charIndex)`. This is the difference between "looks digital" and "looks hand-drawn".
    - **Scale**: place names ~14 px; region labels ~36 px.
14. **Cartouche** — top-right corner: render a banner shape (use an asset or draw procedurally) containing `meta.world` or `meta.campaign` as title, `meta.era` as subtitle. Approx 220×80 px. Reference: the title cartouche in the upper-right of the visual target.
15. **Compass rose** — top-left corner: optional in v1; if assets has a compass PNG, drop it in. Otherwise skip.
16. **Border** — `drawImage(assets.border, 0, 0, WIDTH, HEIGHT)` last, so the decorative frame sits on top of everything else.

Hotspot SVG layer: after canvas paint, walk `nodes` and append one `<circle cx cy r="14" fill="transparent" data-id={node.id}>` per visible node to `#map-hotspots`. Click handler delegates to existing `MapCore.openPanel`.

## Asset extractor (`tools/build-painted-assets.mjs`)

Node script (run via `node tools/build-painted-assets.mjs`). Dependencies: `yauzl` or `node:fs/promises` + `unzipper`, `sharp`. Add to `package.json` if it doesn't exist, otherwise install ad-hoc.

The script writes only to `viewer/assets/painted/`. Filenames in the output directory must be **generic** (e.g. `peak-01.png`, `tree-conifer-03.png`, `pattern-marsh.webp`) — do not preserve original filenames or any source brand string in any output, manifest entry, comment, or log line.

Steps:

1. **Procreate `.brushset` extraction** — each `.brushset` is a zip. Inside are folders per brush, each containing `Shape.png` (alpha mask) and `Grain.png`. Pull out:
   - Mountains brushset → `viewer/assets/painted/symbols/mountains/`
   - Conifer Trees brushset → `…/symbols/conifer/`
   - Deciduous Trees brushset → `…/symbols/deciduous/`
   - Vegetation brushset → `…/symbols/vegetation/`
   - Lakes brushset → `…/symbols/lakes/`
   - Features brushset → `…/symbols/features/`
   - Generic Brushes brushset → fallback / mixed
   For each brush, prefer `Shape.png` (transparent silhouette) as the runtime stamp. Some brushes ship procedural-only masks; if `Shape.png` is solid black on transparent, that's normal and usable. Convert to PNG-8 with alpha, downsample to ≤512 px on the long edge. Re-name outputs to opaque sequential names (`peak-01.png`, `peak-02.png`, …).
2. **Egyptian/Mayan PNG copy** — pass through the historical PNGs as fallback symbol stamps (they're already transparent). Categorize manually in the manifest under `symbols/features/` or split by visual content. Re-name to opaque sequential names.
3. **Settlement stamps** — settlement-shaped artwork ships inside the Features brushset under names like `Castle`, `Walled City`, `Village`, `Town`. If naming is reliable, route them to `symbols/settlements/{walled-city,castle,village}/`. If not, write them all to `symbols/features/` and mark a manual curation pass at the end of the script (print a TODO list to stderr listing files to triage).
4. **Patterns** — load the seamless terrain JPEGs (Marsh, Grassland, Hatching, Rocky Terrain, Cracked Terrain), downsample to 1024×1024, encode WebP quality 80, write to `viewer/assets/painted/patterns/` with generic names (`marsh.webp`, `grassland.webp`, etc.).
5. **Paper** — load `Paper Textures/Paper 1.jpg` (or whichever paper texture matches the warm cream tone of the visual reference — likely Paper 1 or 2), downsample to 2048×2048, encode WebP quality 75. Single output file `paper.webp`.
6. **Border** — load `Border Templates/8x10 Border Template.png` (closest aspect to our viewport), pass through as PNG (it's already small). Write as `border.png`.
7. **Manifest emission** — write `manifest.json` listing every output asset, with default `weight: 1.0` and default `anchor: [0.5, 0.9]` for symbols, `[0.5, 0.5]` for features that should center on the node.
8. **Idempotency** — script must be safe to re-run. Skip outputs that already exist unless `--force` is passed.

### Stamp size normalization (the most important build-time step)

Source `Shape.png` files have **no meaningful natural size**. They are brush stamps the artist scales freely in Procreate; their alpha-trimmed bounding boxes are arbitrary, and trees often arrive larger than mountains. The runtime cannot fix this — every stamp must be rescaled at build time so categories share a uniform pixel height. This is the single most important step in the build; if it is skipped or wrong, the rendered map will look broken regardless of how good everything else is.

For every stamp passing through the extractor:

1. Trim the PNG to its alpha bbox (drop fully-transparent rows/columns on every side).
2. Look up the **target height** for the stamp's category from the table below.
3. Resample the trimmed image to that target height, preserving aspect ratio (set height; let width follow). Use lanczos or cubic resampling — pixel-doubling will make brushed edges look crunchy.
4. Re-encode as PNG-8 with alpha and write to the output directory.
5. Record the final dimensions and `anchor` in `manifest.json`.

Target heights, in painted-scale pixels (`PAINTED_SCALE = 200`, so 1 inch = 200 px):

| Category                          | Target height (px) | ≈ inches |
|-----------------------------------|--------------------|----------|
| `symbols/mountains`               | 110                | 0.55     |
| `symbols/settlements/walled-city` | 90                 | 0.45     |
| `symbols/settlements/castle`      | 75                 | 0.38     |
| `symbols/settlements/village`     | 50                 | 0.25     |
| `symbols/features/tower`          | 55                 | 0.28     |
| `symbols/features/sanctuary`      | 55                 | 0.28     |
| `symbols/features/ruin`           | 50                 | 0.25     |
| `symbols/features/lair`           | 50                 | 0.25     |
| `symbols/lakes`                   | 60                 | 0.30     |
| `symbols/conifer`                 | 32                 | 0.16     |
| `symbols/deciduous`               | 32                 | 0.16     |
| `symbols/vegetation`              | 14                 | 0.07     |

Sanity check after the build: open any two stamps from different categories side-by-side. Mountains must be visibly taller than settlements; settlements visibly taller than trees; trees visibly taller than vegetation. If they aren't, the normalization step is broken — fix the build before touching the renderer.

These heights are tuned for the visual reference's density (forests with ~50 trees per hex, mountain ranges with ~10 peaks per hex). Adjust them in this spec, not by hard-coding overrides in the renderer.

### Brush extraction risk + fallback

If `.brushset` `Shape.png` files turn out to be unusable (procedural-only, or alpha is too soft to read as a silhouette), the renderer must still ship. Fallback library:

- 33 Egyptian PNG stamps + 33 Mayan PNG stamps from the historical effects pack (already isolated, transparent, runtime-ready).
- Hand-trace 4–6 mountain silhouettes and 4–6 tree silhouettes into small SVGs, rasterize to PNG via the same script. That's a half-day of work and gives a guaranteed minimum stamp library.

The renderer doesn't care which library it gets — it reads from the manifest.

## Implementation phases

Each phase ends with a working browser check. Don't proceed to the next phase until the current one renders correctly at `http://localhost:8787/painted.html?map=Basilisk`.

### Phase 1 — Asset extraction (tools/, no rendering)

- Write `tools/build-painted-assets.mjs`.
- Run it. Verify `viewer/assets/painted/symbols/mountains/` contains at least 6 transparent PNGs and `viewer/assets/painted/manifest.json` is valid JSON.
- Confirm output filenames are all generic (no source brand strings).
- If `.brushset` extraction fails, switch to the fallback library.

**Done when**: manifest exists, every category has ≥3 PNGs, and a quick `<img src="…/mountains/peak-01.png">` sanity check shows a transparent mountain silhouette.

### Phase 2 — Data layer split

- Extract from `viewer/core.js` into a new `viewer/core-data.js`: `loadData`, hex math, `INTERIOR_TERRAINS`, `isOverlandNode`, `mulberry32`, `seedFromString`, panel DOM helpers, travel-graph builder, river-path resolver, terrain constants. Roughly the first ~600 lines plus the panel/UX helpers near the end.
- `viewer/core.js` stays as the SVG-specific renderer plumbing and re-exports/re-uses `core-data.js`.
- Update `viewer/map.html` to load `core-data.js` then `core.js` (in that order). Verify all four existing styles still render unchanged.

**Done when**: `map.html?map=Basilisk` renders Wilderland identical to before. Diff the SVG export against `Basilisk-wilderland.svg` — should be byte-identical or trivially-different (e.g. only timestamp lines).

### Phase 3 — Painted page skeleton

- Create `viewer/painted.html` with `<canvas>`, transparent `<svg>` overlay, panel, controls.
- Create `viewer/core-raster.js` with `AssetCache` and the `paintCtx` factory.
- Create `viewer/renderers/painted.js` exposing the style module contract above. `render()` initially does **only** layers 1, 2, 3 (paper + sea + coastline).
- Wire up the page so `painted.html?map=Basilisk` loads data, preloads assets, paints those three layers, and shows hotspots that open the panel.

**Done when**: visiting the URL shows a parchment-colored canvas with the Basilisk land outline drawn in heavy black ink, and clicking on a node opens the existing detail panel.

### Phase 4 — Terrain stamping

- Add layers 5 (mountains) and 6 (forests). Skip vegetation flecks for now.
- Tune Poisson-disk radii and stamp counts until forest hexes look dense like the reference and mountain hexes form continuous-looking ranges.

**Done when**: Basilisk's central forest band reads as a forest, and any mountain hexes read as mountain ranges, with proper north-over-south occlusion.

### Phase 5 — Settlements and paths

- Add layers 8 (rivers), 9 (roads/trails), 10 (settlement stamps).
- Verify Blackwater Crossing renders as a walled-city stamp at center with the Blackwater River cutting through.

**Done when**: every visible node has a stamp, rivers and roads are drawn, and the layout is recognizable as the Basilisk map.

### Phase 6 — Labels

- Add layer 13 with hand-lettered character jitter.
- Two-tone labels (red for heart/fortress/dungeon/lair, black for everything else).

**Done when**: every node is labeled, important nodes are red, region label "BELERION" is rendered in spaced caps, and labels read as hand-lettered (not uniform).

### Phase 7 — Decorations

- Add layers 4 (sub-region pattern fills), 7 (vegetation flecks), 11 (rhumb lines), 12 (sea decorations), 14 (cartouche), 15 (compass), 16 (border).
- Add export button: canvas → `toBlob('image/png')` → download as `Basilisk-painted.png`.

**Done when**: side-by-side with the visual reference, the Basilisk map reads as the same family of artwork.

### Phase 8 — Polish

- Compare against the reference. Common gaps: not enough density, wrong stamp scale, label baselines too uniform, coastline too smooth.
- Tune by editing the manifest weights, Poisson radii, and jitter constants.
- Save a screenshot to `maps/Basilisk/screenshots/painted.png`.

## Acceptance criteria

The receiving Claude is done when **all** of these hold:

1. `node tools/build-painted-assets.mjs` runs clean against a local `resources/` directory and produces `viewer/assets/painted/` with a valid manifest. Output filenames are generic (no source brand strings anywhere).
2. `.gitignore` excludes both `resources/` and `viewer/assets/painted/`. `git status` after a successful run shows no new tracked files in either path.
3. `viewer/map.html` still renders Wilderland identical to before (no regression from the data-layer split).
4. `viewer/painted.html?map=Basilisk` renders without console errors and shows:
   - Paper background
   - Coastline / land outline
   - Forest hexes filled with tree stamps
   - Mountain hexes filled with mountain stamps
   - Every visible node stamped and labeled
   - Rivers and roads drawn
   - Decorative border
5. Clicking any stamped node opens the existing detail panel with the right `name`, `point_type`, and `description`.
6. The "Save PNG" button downloads a PNG at the canvas's full internal resolution (~2400×3000 for Basilisk, not the smaller viewport-fit display size).
7. A screenshot of the result, saved to `maps/Basilisk/screenshots/painted.png`, is recognizable as the same visual family as `resources/Dragon isles map painting/dragon isles map layers/Dragon Isles nov 4 2023.png` — same palette, same stamp style, same density. The screenshot file is gitignored along with the rest of the painted assets if it would reveal recognizable source artwork. (If unsure, leave it out of the commit.)
8. The result is **deterministic**: rendering twice in a row produces identical pixels (seeded RNG, no `Math.random()`).
9. `git grep -i` for any source brand or product name from the original asset packs returns zero matches in committed code, comments, manifests, or commit messages. Only the gitignored `resources/` directory may contain such strings.

## Constraints & non-goals

- **No source-brand identifiers in committed code.** Style name, file paths, identifiers, comments, commit messages, log output, and UI strings all use neutral terms (`painted`, "Painted").
- **No animations.** Static map.
- **No live edit.** Pan/zoom is fine if cheap; not required for v1.
- **No mobile-specific tuning.** Desktop browser, viewport ≥ 1280×800.
- **No server.** Must run from `python3 -m http.server 8787` like the existing viewer.
- **No SVG export from this style.** PNG only.
- **No new dependencies in the runtime browser bundle.** Canvas 2D + vanilla JS. (Build-time deps in `tools/` are fine.)
- **No re-encoding of original artwork back into `resources/`.** Originals stay untouched.
- **No committed runtime assets.** `viewer/assets/painted/` is built locally and never tracked.

## Hand-lettering gap (known limitation)

The reference image is hand-drawn with per-character variation that no font fully captures. The character-by-character jitter in layer 13 closes ~80% of the gap. The remaining ~20% would require either a handwriting model or per-letter SVG path rendering, both of which are out of scope for v1.

## Determinism

All randomness flows through `mulberry32(seedFromString(seed))` from `core-data.js`. Seeds:

- Mountain stamp positions per hex: `"mtn-" + hexAddress`
- Forest stamp positions per hex: `"forest-" + hexAddress`
- Stamp choice per slot: `seed + "-" + index`
- Label jitter per character: `nodeId + "-" + charIndex`

Never call `Math.random()` in the renderer.

## Out-of-scope for this spec

- Other campaigns. The renderer must be data-driven and work for any map JSON, but acceptance is judged only against Basilisk.
- Localization, theming variants, dark mode.
- Editor UI for placing custom stamps.
- WebGL upgrade. Stay on Canvas 2D.

## Reference checklist for the receiving Claude

Before writing code, the receiving agent should:

1. Read `CLAUDE.md` for project context.
2. Read `viewer/core.js` (skim — it's 4577 lines) to understand the existing data pipeline.
3. Read `viewer/renderers/wilderland.js` for the existing style module shape.
4. Open `resources/Dragon isles map painting/dragon isles map layers/Dragon Isles nov 4 2023.png` as the visual target.
5. Run `cd maps && python3 -m http.server 8787` and visit `http://localhost:8787/map.html?map=Basilisk` to see the current Wilderland output for comparison.
6. List `resources/Dragon isles map painting/Fantasy Map Builder - Map Effects/Brushes/Procreate/` to confirm the source brushset files are present locally.

Then work through the phases in order. Do not skip phases. Use the neutral name `painted` everywhere in code.
