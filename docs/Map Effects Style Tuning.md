# Map Effects Style Tuning

A consolidated reference of rules, conventions, and decisions for the painted (canvas) renderer. Read this before changing stamp pipeline code or tuning visual output.

## Architecture

There are **two renderers** and **four styles**. They are independent axes.

- **Renderers** (drawing pipeline):
  - **SVG** at `viewer/map.html` — vector renderer (`viewer/core.js` + `viewer/renderers/{wilderland,thirdage,moonletters,dragonisles}.js`).
  - **Painted** at `viewer/painted.html` — canvas renderer using brush stamps (`viewer/renderers/mapeffects.js`).
- **Styles** (link palette + font, NOT how trees / mountains / settlements render):
  - Wilderland (Tolkien convention — blue roads, blue labels)
  - Third Age
  - Moon Letters
  - Dragon Isles

Both renderers support all four styles via `?style=` URL param. Switching styles re-colours linework only — the stamp art is unchanged. Switching renderers navigates between the two pages and preserves the style.

In the painted renderer, per-style palettes live in `STYLE_PALETTES` in [viewer/renderers/mapeffects.js](../viewer/renderers/mapeffects.js). Linework colours are exposed as `COLORS.RIVER`, `COLORS.ROAD`, `COLORS.TRAIL`, `COLORS.LABEL`, `COLORS.LABEL_HIGHLIGHT`. Stamps always use `COLORS.INK` and `COLORS.PAPER` regardless of style.

## Asset pipeline

Source PNGs come from Procreate `.brushset` zips under `resources/mapeffects/`. The build script (`tools/build-mapeffects-assets.mjs`) runs three steps per brush:

1. Read the brush's `Shape.png` from the zip. **Source is L-mode (grayscale, no alpha)**: white = empty canvas, dark = ink. The build derives an alpha mask from inverted luminance.
2. **Trim to the alpha bounding box** so the runtime sees the actual ink, not a 2048×2048 whitespace canvas. *Never add whitespace padding to images.* If a stamp seems too small on screen, fix the metadata target, not the image.
3. **Conditionally downsample** so the long edge ≤ `SHAPE_MAX_EDGE` (currently 512). 512 is calibrated so stamps rendered at typical 14–60 canvas px don't show pixelation. Going lower introduces visible upsampling at common render sizes.

Every brush gets metadata extracted by `tools/extract-brush-metadata.py` into `viewer/assets/mapeffects/brush-metadata.json`:

- `brush_name` — artist's original name from the Brush.archive plist (e.g. "Mountains 12").
- `archetype` — auto-classified from name patterns (mountain, small-hill, volcano, sacred-tree, …).
- `use` — `stamp` / `overlay` / `decoration` / `path` / `pattern`. Random pickers exclude non-stamps by default.
- `tiling_role` — `single` / `primary` / `composed-range` / `overlay-partner` / `mirror-partner`.
- `trimmed_w`, `trimmed_h` — alpha-bbox dimensions of the actual ink.
- `peak_count` (mountains) — number of skyline peaks detected.
- `blob_count`, `blob_median_h` (trees + multi-instance terrain) — connected components.
- `suggested_height_px` — final canvas-px target derived from archetype rules + per-brush analysis.
- `size_factor` — diagnostic, the source→canvas scale used.

Re-running the metadata extractor does NOT require a build. The build is only needed when changing `SHAPE_MAX_EDGE`, the brushset list, or the trim/downsample logic.

## Sizing rules

**The metadata drives sizing.** No hard-coded per-stamp scales in the renderer. Every stamp's render height is read from `suggested_height_px` (or an explicit override in `NODE_ID_STAMP` / `POINT_TYPE_STAMP`).

The two derivation paths:

### Trees — per-brush blob normalisation

Tree brushes vary wildly: a single-tree brush draws ONE big tree at ~140 source-px tall; a clump brush packs 20+ tiny trees at ~30 source-px each. To make a single tree match a tree-inside-clump on canvas, the metadata extractor:

1. Runs connected-components on the trimmed PNG to find ink blobs.
2. Takes the median blob height = "one tree's source-pixel height in this brush."
3. Sets per-brush scale = `TARGET / median_blob_h` (target is ~14 canvas px for tree-clump / conifer / deciduous, 21 for sacred-tree).
4. Whole-stamp `suggested_height_px = trimmed_h × scale`.

Result: a single-tree stamp renders at 14 px, a 5-tree pair-row clump renders at ~30 px, a 20-tree dense clump renders at ~70 px. Each individual tree-internal lands at the same on-canvas size.

**Per-category override**: `TREE_TARGET_BY_CATEGORY` boosts conifer to 18 px (tall, narrow silhouette) vs deciduous 14 px (round, broad) to equalise visual mass.

### Mountains — shared per-archetype scale

Mountain brushes draw internal peaks at consistent source sizes across brushes (the artist's hand stayed at the same scale). So a single shared scale per archetype works for both single-peak and multi-peak stamps:

- `MOUNTAIN_SCALE`: small-hill 0.11, mountain 0.36, volcano 0.34, caldera 0.30, mountain-range 0.36, lake-mountain 0.30.
- For multi-peak stamps detected via skyline analysis, scale is derived from per-peak width instead of trimmed height — so a single hill ends up the same canvas size as one hill in a multi-hill ridge.

`MOUNTAIN_PEAK_WIDTH_TARGET` controls the per-peak canvas width (e.g. small-hill 18 px, mountain 34 px).

### To re-tune sizes

Edit the constants in `tools/extract-brush-metadata.py`:

- `MOUNTAIN_SCALE` — per-archetype mountain heights
- `MOUNTAIN_PEAK_WIDTH_TARGET` — per-peak width for multi-peak mountains
- `TREE_BLOB_TARGET_PX` — per-archetype tree heights
- `TREE_TARGET_BY_CATEGORY` — conifer-vs-deciduous override

Then run `python3 tools/extract-brush-metadata.py` (no build needed).

The renderer also has `CATEGORY_FALLBACK_HEIGHT` in `viewer/core-raster.js` for stamps without metadata — keep it in sync with the global scale.

## Composed-range tiling role

`composed-range` = a stamp the artist drew as a pre-composed scene to be dropped as a unit, not used as random scatter material. Auto-detection:

| Archetype                                        | Trigger                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| `mountain-range`                                 | Brush name contains "Mountain Range"                                     |
| `small-hill`                                     | Skyline shows ≥ 2 peaks                                                  |
| Tree archetypes                                  | ≥ 5 connected blobs                                                      |
| Multi-instance terrain (dune, marsh, farm, etc.) | ≥ 3 blobs (per-archetype threshold in `COMPOSED_RANGE_THRESHOLD`)        |
| Volcano + Smoke pairs                            | Name suffix `\| Smoke` (overlay-partner role)                            |
| Coastline reverses                               | Name suffix `\| Reverse` (mirror-partner role)                           |

**Critical rule**: `pickWhere(category, rng, options)` excludes `composed-range` by default. To pick from composed-range stamps explicitly (e.g. forest interior clumps, mountain ranges), pass `includeRoles: ["composed-range"]` and `excludeRoles: new Set()`.

**Mountain auto-promotion is INTENTIONALLY NOT applied** for ordinary mountain archetypes (mountain, volcano, caldera). A mountain stamp with 2-3 visible peaks is still ONE mountain meant to be scattered randomly, not a composed range. Only `small-hill` gets peak-count auto-promotion because hills naturally come in groups.

## Per-place symbol overrides

`NODE_ID_STAMP` in `viewer/renderers/mapeffects.js` lets you specify a stamp per node id. Always read the node's description in `maps/Basilisk/Basilisk.json` and pick the closest match. Examples:

- Tower of Stargazer (described as "80-ft stone tower with metal dome and spikes") → Wizard Tower stamp.
- Kalla Cave (cave with stream) → Cave 1 stamp, not generic ruin.
- Vault of First Light (dwarven dungeon entrance) → Cave stamp.
- Mistwood Glen (three-oak Kalla'din pocket realm) → Sacred Tree With Standing Stones, +50% size.
- Fae Glade (face-bearing trees) → Sacred Tree.
- Northern/Southern Warding Stones (single rune-stones) → Standing Stone 1 (singular), not Standing Stones (plural).
- Serpent's Pass (jagged peaks) → Pointed Rock 1.
- Bandit Camp (rocky Weathertop-like hill) → Pointed Rock 2.
- Crags ≠ volcanoes — random mountain picks exclude volcano/caldera entirely (`PICK_MOUNTAIN.archetypes = ["mountain"]`).

Volcanoes/calderas only render when an explicit node override points at them. The Basilisk campaign currently has no volcanic locations.

For composite places (e.g. Thornespire Keep on a hill) use the `compound` field — array order is paint order (back→front). The first entry paints first; subsequent entries paint on top of it. Front parts use knockout to mask back parts inside their silhouette.

## Composition / overlap rules

**Default rule: do NOT render shapes on top of other shapes.** The two exceptions:

1. **Connected mountain chains** — mountain hexes that border other mountain hexes pack peaks densely; peaks may overlap each other to form a continuous skyline.
2. **Compound stamps** drawing a single composite feature (e.g. keep on hill). The front parts use `knockout: true` to paper-mask the back stamp's ink inside their silhouette.

For everything else:

- **Forest layer skips placements** within:
  - 28 px of any visible settlement node
  - 12 px of any river/road segment
  - any precomputed label bounding box
  - 22 px of any other already-queued tree (tree-vs-tree spacing)
- **Mountain edge falloff**: a mountain hex bordering non-mountain terrain scatters smaller foothills (50% scale, mountain archetype) and edge-hills along the outward-facing edges so the range tapers naturally into surrounding terrain.

## Knockout (the general overlap-masking solution)

Any stamp drawn over another visible feature should knock out the back ink inside its silhouette. Otherwise the back stamp's lines bleed through transparent gaps in line-art.

API: `R.drawStamp(ctx, stamp, x, y, scale, { knockout: true, knockoutColor: COLORS.PAPER })` (and `R.drawStampAtHeight` accepts the same options).

Implementation: the first time a stamp is drawn with knockout, `core-raster.js` builds a paper-coloured silhouette canvas (`source-in` composite of the stamp's alpha mask filled with the paper colour) and caches it per (stamp, color). At draw time the cached silhouette paints first, then the stamp's ink on top.

**Settlement layer always uses knockout** — both single stamps and compound parts. This prevents the "hill bleeding through the keep" class of bug.

## Forest rules

- **Region-based dominant species**:
  - North of canvas centre → conifer (Old Forest = black pines per the Basilisk lore).
  - South of canvas centre → deciduous (Mistwood Glen forest = three-oak Kalla'din).
  - 92% dominant, 8% minor for occasional variety.
- **Three-pass placement per forest hex**:
  1. **Composed-range clumps** (1–2 per hex, larger if `forest`, fewer if `forested-hills`). Use `pickWhere(cat, rng, { includeRoles: ["composed-range"] })`. Poisson radius 60 to prevent crowding.
  2. **Tree line** — 4–6 single trees in a rough horizontal row at ~78% down the hex (the south "front" edge). Forms the visible tree-line border.
  3. **Periphery** — 3–4 single trees scattered around the hex edge for natural fade.
- All placements y-sorted so northern stamps paint behind southern ones.
- Single trees skip composed-range via the default exclude in `pickWhere`.

## Farmland rules

- Farm fields tile in **3 rows × 4 columns** per farmland hex.
- Row direction aligns to the nearest road/river segment so fields run parallel to those features (matches how real farmland organises around water and roads). Fall back to east-west if nothing's near.
- Each field stamp rotates to match the row direction.
- One farmhouse per ~4 fields, replacing a field slot. Houses use the explicit **Farmhouse** stamp `viking/shape-07.png` (fallback `medieval/shape-03.png` "Farm"), with knockout. Do NOT use `viking/shape-17.png` — that's "Shield Wall - Battlefield" and produces what looks like Viking war camps in the fields. The Map Effects pack has dozens of similarly-misleading names — always verify by reading the `brush_name` field in metadata before assigning a stamp src.
- South-to-north z-sort so houses overlap fields north of them.

## River rules

The river is a port of the Wilderland SVG renderer's `renderRiver()` — that result was deemed "really, really excellent" so the painted renderer matches it. Components:

- **Three-frequency meander**: broad + medium + fine sine waves with random phases per hex hop.
- **Sin envelope**: amplitude is zero at hop endpoints, max at midpoints. Keeps the river inside its hex corridor while bending freely between hex centres.
- **Variable width**: slow undulation + small per-vertex noise + 2–4 "pool" widenings (boost factor 1.3–2.0 over a span of 6–16 spine indices). Smoothed and **tapered to a point** at both ends.
- **Twin parallel banks** at ±2 px from centerline, both stroked at 0.9 px ink with 85% opacity.
- **Water-tint fill** between the banks at 8% opacity for a subtle wash.

## Label rules

- Labels render **below the visual base of the icon**, NOT below the anchor point. The settlement layer stores `bottomOffset = h × (1 − anchor[1])` (compound = max across parts), and the label layer offsets by `bottomOffset + 6`.
- Two-tone palette: red (`COLORS.LABEL_HIGHLIGHT`) for `point_type` in `{heart, fortress, dungeon, lair}`; ink (`COLORS.LABEL`) for everything else.
- Hand-lettered jitter: each character has seeded baseline (±0.5 px) and rotation (±1.5°) jitter so text doesn't look mechanically uniform.
- **Label clear-zones**: `precomputeLabelBoxes()` runs before the forest layer to estimate label bounding boxes; the forest avoidance check skips placements inside those boxes. This mirrors the source art's clean paper background around text.
- Label font sizes: `point_type === "heart"` → 16 px, all others → 13 px. Region labels (when present) → 36 px in tracked caps.

## Inventory page rules

`viewer/mapeffects-inventory.html` is the brush-metadata browser. Conventions:

- **Cross-category sections** (mountains, forests, vegetation, terrain, water, settlements, sea, ominous, decorations, overlays, paths, viking, medieval, etc.). Sections cross category lines so e.g. Sea bundles ship + sea-monster + tentacles + whirlpool together regardless of source brushset.
- **Section fallback**: when an archetype is unclassified, the source brushset name (viking, medieval, extra-egyptian, extra-mayan) is used as the section so unfamiliar packs stay grouped by origin.
- **Inline archetype labels** flow in the same grid as stamp cards — sub-groups don't force a new row when the previous group only filled part of one.
- **Fixed auto-zoom** (3.3×) in Normalized mode so 14-px singles display ~46 px and 38-px mountains display ~125 px, comfortably inspectable while preserving exact relative ratios. No manual zoom selector — the user shouldn't have to dial it.
- **Each card** shows: brush name (artist's original), archetype + use + tiling-role chips, file size, suggested px, size factor, render px (with override indicator), tiling partner pointer (if paired), height + units inputs (user override), tag chips (user-added), source path footer.
- **Per-stamp user metadata** persists in localStorage keyed by `painted-classifications-v1`. Export/import via `classifications.json`. Empty entries auto-prune.

## Things to AVOID

- **Whitespace padding on images** to enforce target sizes. Images are tight to ink; metadata sets canvas size.
- **Hard-coded per-stamp scales in the renderer** that don't reference metadata. Use `R.targetHeightFor(stamp, category)` or the stamp's `suggested_height_px`.
- **`Math.random()` in the renderer.** Always seed via `D.mulberry32(D.seedFromString(...))` so renders are deterministic.
- **Trees over roads / rivers / settlements / labels.** The forest layer's avoidance check covers all four; don't bypass it.
- **Volcano / caldera stamps in random mountain picks.** The Basilisk Crags are jagged, not volcanic. Volcanoes only render via explicit `NODE_ID_STAMP` overrides.
- **Source-brand identifiers in committed code.** Filenames, class names, comments, commit messages, UI strings should use the neutral name `painted` (not the source pack's brand). Documentation in `docs/` may reference the original source for clarity.

## Quick recipe — adding a description-matched override

A node's description says "X is a Y." Steps:

1. Search `viewer/assets/mapeffects/brush-metadata.json` for brush names that match Y (case-insensitive). Several relevant categories:
   - Mountains family → `archetype` ∈ {mountain, small-hill, volcano, caldera, mountain-range}
   - Trees → `archetype` ∈ {tree-clump, conifer-single, deciduous-single, sacred-tree}
   - Buildings → check viking + medieval categories for named structures
   - Terrain features → `archetype` ∈ {dune, mesa, cliff, pointed-rock, rock-formation, crater, crevasse, canyon, floating-island}
   - Caves/lairs → "Cave 1" through "Cave 10" in features
   - Standing stones → "Standing Stone 1" through "Standing Stone 7" (singles) in features
2. Pick the best match. Look at the actual PNG if needed.
3. Add to `NODE_ID_STAMP` in `viewer/renderers/mapeffects.js`:

   ```js
   "node-id": { src: "symbols/category/shape-NN.png", height: 22, anchor: [0.5, 0.85] },
   ```

4. Tune `height` so the stamp matches the typical scale of nearby features. For comparison: mountain peaks ~38 px, walled cities ~60 px, ordinary towers ~26 px, single trees ~14 px.

For composite places (e.g. fortress on hill), use the `compound` field with parts in back→front array order. All parts auto-knockout via the settlement layer.

## Quick recipe — fixing pixelation

If stamps look pixelated:

1. Check `SHAPE_MAX_EDGE` in `tools/build-mapeffects-assets.mjs` — should be 512 for high-quality output.
2. Verify stamps were rebuilt at the new resolution: `sips -g pixelWidth viewer/assets/mapeffects/symbols/mountains/shape-01.png` should show ~300+ px.
3. If a specific stamp is still pixelated, its source ink bbox might genuinely be smaller than 512 — that's OK as long as the render target height is much smaller than the trimmed dimensions (downsampling is sharp; upsampling is fuzzy).
4. The canvas itself uses internal resolution (~2400×3000 for Basilisk) and CSS-scales to fit. Don't reduce the internal resolution to "save memory" — pixelation will return.

## Quick recipe — tuning a category up or down

User says "X is too big/small by N%":

1. Identify the affected archetype.
2. Multiply the corresponding `MOUNTAIN_SCALE[arch]` (mountains) or `TREE_BLOB_TARGET_PX[arch]` (trees) by the inverse of the user's percentage. "20% smaller" → ×0.8. "50% bigger" → ×1.5.
3. Re-run `python3 tools/extract-brush-metadata.py` (no build needed).
4. Refresh the page.

For per-place tuning (one specific node, not a category), edit the `height` field in that node's `NODE_ID_STAMP` entry instead.
