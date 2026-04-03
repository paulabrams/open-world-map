# Map Visual Style Guide

Target aesthetic: **Christopher Tolkien's Middle-earth maps** — black ink on cream parchment, red labels, mixed perspective (top-down geography, side-view terrain features).

Reference: *Here Dragons Abound* blog, specifically the "Lord of the Rings Map Style" post (October 2018). Compositional reference: Cairn 2e / Into the Odd point-crawl maps (dots-and-lines with distance numbers on edges, minimal terrain vignettes).

## Palette

| Role | Hex | Notes |
|---|---|---|
| Ink (primary) | `#2a1f14` | Warm near-black. Never pure `#000000`. |
| Ink (light) | `#5a4a3a` | Secondary labels, day counts, subtle elements. |
| Label red | `#8b2500` | Dark red-brown, not bright red. Place names, headings. |
| Parchment | `#f4e8d1` | Cream base. Center of radial gradient. |
| Parchment (dark) | `#d4c4a0` | Edge of radial gradient. |
| Water | `#2a1f14` | Same as ink — Tolkien maps don't use blue. |

Body background is the ink color (`#2a1f14`) so the parchment appears as a floating surface.

## Typography

- **Font stack:** `"Palatino Linotype", "Book Antiqua", Palatino, serif`
- **Place labels:** Red (`#8b2500`), 13px, with parchment stroke halo (`stroke-width: 3`, `paint-order: stroke`) for legibility over terrain.
- **Heart / fortress labels:** Bold.
- **Local-scale labels:** Ink light (`#5a4a3a`), 10px, not red.
- **Day labels on paths:** Ink light, 9px, on a parchment pill (rounded rect, `opacity: 0.85`).
- **Title bar:** Ink light, 11px, italic, `opacity: 0.7`, fixed bottom-left.

## Background

Parchment texture built from SVG filters:

1. `feTurbulence` — fractalNoise, baseFrequency `0.035`, 4 octaves, stitched.
2. `feColorMatrix` — tints noise to parchment tones.
3. `feBlend` — multiplies texture onto the base gradient.

Base fill is a radial gradient from parchment center to parchment-dark edges.

## Node Icons

All icons rendered in ink color, no fills other than ink or "none". Size varies by scale: regional nodes use `s = 5`, local-scale nodes use `s = 3`.

| Point Type | Shape |
|---|---|
| heart | Filled circle (r=7) inside stroked circle (r=9, stroke 1.5) |
| fortress | Filled square with 3 crenellation blocks on top |
| tavern | Small filled square (6×6) |
| settlement | Filled circle |
| wilderness | Stroked circle (no fill) |
| dungeon | Filled diamond (rotated square) |
| sanctuary | Stroked circle with small filled circle at center |
| tower | Narrow filled rectangle with wider crenellation cap |
| ruin | Stroked dashed square (`stroke-dasharray: 2 2`) |
| waypoint | Stroked triangle (no fill) |
| lair | Filled triangle |

## Path Rendering

All paths are ink-colored SVG quadratic beziers with slight curvature (seeded random perpendicular offset), `stroke-linecap: round`.

| Path Type | Stroke |
|---|---|
| road | Solid, width 2.5 |
| trail | Dashed (`8 4`), width 1.5 |
| wilderness | Dotted (`3 5`), width 1 |
| river | Solid, width 2, `opacity: 0.7`, wavy (8-segment multi-curve) |

## Terrain Symbols

Small iconic vignettes placed near nodes, opposite the direction of connected paths (so they don't overlap links). Seeded RNG for deterministic placement.

- **Mountains:** 2–4 profile peaks. Left half filled (shadow), right half outline only. Slight random skew and size variation.
- **Forest:** 3–6 egg-shaped tree blobs (ink fill, `opacity: 0.8`) with short trunk lines. Elongated top via axis scaling.
- **Swamp:** 3 wavy horizontal lines (`opacity: 0.5`) with 3 reed stalks (lines topped with small filled circles).
- **Plains:** 2–4 grass tufts — 3-blade curved strokes (`opacity: 0.4`).

## Compass Rose

Placed upper-right of the node bounds. Four cardinal arrows: north filled, south/east/west outlined. "N" label in bold serif. Entire group at `opacity: 0.5`.

## Interaction

- Pan and zoom via D3 zoom (scale 0.3–4×, grab/grabbing cursor).
- Click a node to open a detail panel (parchment background, ink border, positioned top-right).
- Click background to dismiss panel.

## Rendering Order (bottom to top)

1. Parchment background + texture filter
2. Links (paths/roads)
3. Terrain symbols
4. Node icons
5. Place name labels
6. Day labels on paths
7. Compass rose

## Anti-Patterns

- **No blue for water.** Rivers and coastlines use the same ink color as everything else.
- **No pure black.** Always use the warm ink color `#2a1f14`.
- **No sketchy/rough.js double-stroke jitter.** Tolkien maps are precise ink, not sketchy. Slight curvature and size variation via seeded RNG only.
- **No dense terrain fills.** Point-crawl nodes get small vignettes (a few symbols), not polygon-filled regions.
- **No bright or saturated colors.** Only ink, parchment, and dark red.
