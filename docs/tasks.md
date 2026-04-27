# Tasks

Running log of every item the user has asked for, with status. Newest items toward the top of each section.

## Open

- [ ] **Random hex generation + persistence.** When the user clicks an empty hex (no JSON entry), the panel should offer to generate content. Implementation has three parts:
  1. **Generate**: roll the skeleton client-side from small tables (terrain feature type, encounter, rumor seed) keyed by the hex's terrain. Optional second pass: an "AI flavour" button calls Claude API to expand the skeleton into prose using campaign tone.
  2. **Save locally** ("Download Updated Map JSON" button): generated hexes accumulate in an in-memory copy of `graphData`, mirrored to `localStorage` keyed by campaign so reloads preserve them. A button serialises the full updated graph as a downloadable JSON the user replaces `maps/<campaign>/<campaign>.json` with and commits to git. Single "save the world state" moment that maps to a commit.
  3. **Send to Claude Code** (per-hex "Copy capture_thought block" button): emits an MCP-call snippet (text or clipboard) the user pastes into Claude Code, which writes the new content back to Supabase via `capture_thought`. Re-running `/map` then regenerates the JSON from the DB so the local mirror stays consistent.

  Layer them additively — start with (2) alone for an MVP, add (1) flavour and (3) MCP write later. The empty-hex panel is already the entry point (today it just shows terrain).
- [ ] **Thornespire Keep hill-bleed (RAISED 3 TIMES).** The hill silhouette must be hidden by the keep, not visible through the keep's interior gaps. Fixes attempted so far: (1) compound z-order back→front, (2) knockout-at-full-opacity, (3) blur+threshold dilation of the alpha mask. If still visible after the dilation fix, escalate by either (a) replacing the hill with a fully-filled SVG path drawn behind the keep stamp, or (b) dropping the hill stamp entirely and relying on the keep's anchor point to imply elevation. **DO NOT consider this resolved until the user confirms the hill no longer shows through the keep.**
- [ ] **Click + shift-click distance/direction route feature** (parity with SVG renderer's `_setupRouteInteraction`). Single-click sets a route start hex; shift-click sets the end hex and renders the Dijkstra route through travel-graph + days label at midpoint. Helpers needed in painted page: `_buildTravelGraph`, `_dijkstra`, `_hexLinePath`, `_findRoute`, `_renderRouteStart`, `_renderRoute`, plus shift-state tracking. The path-rendering can use the SVG path-layer that's already wired up.
- [ ] **Re-anchor forest label-bbox to actual SVG-text bounds.** Forest layer's `precomputeLabelBoxes()` measures with canvas `ctx.measureText` — close to the SVG `<text>` width but not exact. Fix: after labels render, walk `<text>` elements with `getBBox()` and feed those into the avoidance check on the next render. (Currently good enough; tighten if labels ever clip into trees.)
- [ ] **Doc refresh — `Map Effects Style Tuning.md`** is missing the recent additions: mountain bbox no-overlap, marsh no-overlap, region-based farm tiling, `dx`/`dy` on single overrides, knockout-at-full-opacity fix, SVG path/label layers, hex hover card with terrain, knockout dilation/threshold for hollow line-art stamps.
- [ ] **Sub-hex addressing — formal scheme.** Currently using raw pixel `dx`/`dy` offsets in `NODE_ID_STAMP`. No formal sub-hex coords. If you want addressing like `"0905-W"` → renderer computes the offset, that's an additive change to the JSON schema + override resolver.

## Completed

- [x] Roads → SVG twin-bank with paper fill.
- [x] Labels → SVG `<text>` with paper halo via `paint-order: stroke fill`.
- [x] Arrow keys pan one hex (smooth tween, 200 ms).
- [x] Hex hover card now shows terrain type in addition to hex address.
- [x] Pjörk Choppe Hille `dx` corrected from `-55` (overshot hex W corner at `-50`) to `-30` (~60% from centre to W corner, stays inside hex).
- [x] Map background changed to white (`#ffffff` for `COLORS.PAPER` and page-level CSS).
- [x] Mountain candidate count restored (4–6 interior, 3–4 edge) + bbox-overlap shrink dropped from 0.42 → 0.32 so peaks pack denser without superimposing.
- [x] Mountain peaks never superimpose: bbox tracking with strict overlap rejection.
- [x] Marsh elements never superimpose in swamp hexes: bbox tracking, Poisson radius bumped 22 → 60.
- [x] Mud Wallow uses a small lake/pool stamp (`lakes/shape-01.png`) instead of a sanctuary fallback.
- [x] Crag Cairn → Burial Mound (`viking/shape-21.png`).
- [x] Knockout silhouettes paint at full opacity so foreground stamps actually mask hill/background ink behind them (Thornespire keep-on-hill bug).
- [x] Compound stamps paint in array order (back→front) so authored z-order is honoured.
- [x] Index page: single "Open Map →" link replaces five style-specific links; "Map Effects" stripped from visible text.
- [x] Pjörk Choppe Hille → Cliff 1 (`terrain/shape-47.png`); Kobold Crevasse → Crevasse 1 (`terrain/shape-28.png`).
- [x] Settlement-layer ruins use the explicit "Ruin" stamp (`features/shape-15.png`) — was Standing Stones.
- [x] Farms — full rewrite: region-aware brush choice (one tile-stamp per farm region; changes when crossing a road or river), 50% fewer fields, 80% fewer farmhouses, no fields/houses on road or river, farmhouse height halved, axis-aligned grid (no rotation).
- [x] Farmhouses use `viking/shape-07.png` (Farmhouse) — was incorrectly using `viking/shape-17.png` (Shield Wall — Battlefield).
- [x] Settlement `point_type` uses `viking/shape-32.png` (Village) — same Shield-Wall fix.
- [x] Trees increased ~25% (clumps 2–3 → 2–4, tree-line 4–6 → 5–8, periphery 3–4 → 4–5).
- [x] Off-map connector text (top/left/right/bottom edge labels from `off_map_arrows`).
- [x] Click anywhere in a hex opens its detail panel (visible node if any; synthetic hex-info otherwise).
- [x] Compass rose decoupled from `SHAPE_MAX_EDGE` — now uses `drawStampAtHeight` with a fixed 220 px target.
- [x] Source PNG `SHAPE_MAX_EDGE` bumped 256 → 1024 to fix pixelation at zoom.
- [x] Mountain edge falloff — interior mountain hexes pack peaks; edge hexes scatter foothills + edge-hills along outward-facing edges into surrounding terrain.
- [x] Forest layer: regional dominant species (north = conifer, south = deciduous), three-pass placement (clumps + tree line + periphery), avoidance of settlements / rivers / roads / labels.
- [x] River — full Wilderland port: 3-frequency meander with sin envelope, variable widths with pool widenings, twin parallel banks, water-tint fill (now SVG twin-bank with paper-fill knockout).
- [x] Per-style link palettes (Wilderland → blue roads + blue labels; Third Age, Moon Letters, Dragon Isles each have their own palette). Stamps unchanged across styles.
- [x] Renderer + Style + Grid dropdowns on both `painted.html` and `map.html`; settings preserved across navigation.
- [x] Hex grid + square grid overlays on canvas, hex hover with cell highlight + address label.
- [x] Description-matched per-place overrides for Tower of Stargazer (Wizard Tower), Raven's Perch (Tower Ruins), Bandit Camp (Pointed Rock), Northern/Southern Warding Stones (single Standing Stone), Serpent's Pass (Pointed Rock), The Swamp (marsh), Mountain Watch Inn (Wood Tower), Fae Glade (Sacred Tree), Mistwood Glen (Sacred Tree With Standing Stones), Kalla Cave (Cave 1), Vault of First Light (Cave 4).
- [x] Volcano/caldera removed from random mountain picks (Serpent's Teeth Crags are jagged peaks, not volcanic).
- [x] Sacred Tree archetype +50% target height; Mistwood Glen height 30 → 45.
- [x] Single hill stamps shrunk ~30% (`small-hill` MOUNTAIN_SCALE 0.16 → 0.11).
- [x] Tree sizing per-brush blob normalisation: every tree-internal lands at the same on-canvas size whether single or in a clump. Conifer +28% boost over deciduous to match visual mass.
- [x] Mountain sizing per-archetype shared scale on `trimmed_h` (single hill matches one hill in a multi-hill ridge).
- [x] Composed-range auto-detection (peak count for hills, blob count for trees / dunes / marsh / farm / etc.).
- [x] Stamps trimmed to alpha bbox at build time; metadata-driven sizing replaces whitespace padding.
- [x] Inventory page: cross-category sections (sea, ominous, decorations, paths, etc.), inline archetype labels (no forced row breaks), fixed 3.3× normalised zoom (no zoom selector).
- [x] Inventory shows brush_name (artist's original) prominently; archetype + use + tiling-role chips per card; tiling-partner pointers.
- [x] `tools/extract-brush-metadata.py` builds rich metadata: name, archetype, use, tiling_role, file_kb, trimmed dimensions, blob/peak counts, suggested_height_px, size_factor.
- [x] Asset pipeline: trimmed PNGs at `SHAPE_MAX_EDGE = 1024`, derived assets gitignored, neutral filenames (no source-brand strings in committed code).
- [x] Initial spec `docs/painted-renderer.md` (renamed from `docs/mapeffects-renderer.md`).
- [x] Project memory `docs/Map Effects Style Tuning.md` capturing all rules.
