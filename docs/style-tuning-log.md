# Style Tuning Log

Persistent, append-only record of every style-tuning experiment — wins AND rollbacks. See [style-tuning.md](style-tuning.md) for the process.

## Scoreboard

Current score per style, out of 10. Update after every iteration.

| Style        | Score | Last iteration | Notes                                    |
|--------------|-------|----------------|------------------------------------------|
| thirdage     | 8     | 7              | red cartouche title + scale bar landed   |
| wilderland   | 9.5   | wl-11          | cartouche subtitle overlap fixed         |
| moonletters  | —     | —              | not yet rated                            |
| dragonisles  | 7.5   | 5              | frame + banner + compass landed; scope q |

## Patterns

Heuristics distilled from the takeaway column, updated every 10 iterations. These are the rules that survived contact with the reference.

Distilled after first 10 iterations (7 dragonisles+thirdage, 10 wilderland):

- **Mountains**: Outline + dense leeward hatching reads better than solid fill at small scale. Hatch count should scale with peak height (~p.h/2.5) — sparser hatching looks cartoonish. Taller-than-wide aspect is mandatory.
- **Forests**: Default density (1.0) is always too sparse vs hand-drawn references. Bump to 1.6–1.8 for Mirkwood-style packing. The `density` option on `renderForestEdgeTrees` is the lever.
- **Rivers & coastlines**: Not yet explored in this iteration batch.
- **Labels, cartouches, compasses**:
  - Labels render too faint at default 0.5 opacity — always bump to ≥0.85 for edge/frame labels.
  - Data for off-map / neighbor labels lives on `ctx.offMapArrows` (top-level), NOT `meta.off_map_arrows`. Read the actual ctx construction, don't assume nesting.
  - Stacked/triplet labels match hand-drawn references better than single centered labels for edge strips.
  - **Never simplify a cartouche based on a thumbnail-level reading**: references are almost always MORE ornate than they look at a glance. Crop to ≥100% resolution before deciding to strip decoration.
  - Greek-key meander can be drawn as a repeated squared-spiral SVG path, rotated 90° via SVG transform for vertical strips.
- **Palette**: Swapping INK → LABEL_RED for a single element (e.g. the title) is a one-line change with large visual impact — do this early.
- **Cross-style**:
  - Use PIL (not `sips`) for reference cropping — `sips --cropOffset` behaved unexpectedly on the reference images, causing at least one false "element is absent" conclusion.
  - Match errors in `Edit` tool with unicode escapes (`—`, `…`) in the source vs literal characters in the old_string — fall back to Python replace when Edit can't match.
  - Every iteration must include the reference image read in the same response as the render, not just recall.

## Iterations

Append one row per iteration. Do not delete rows, even for rolled-back experiments — a logged rollback prevents the same dead end from being re-tried.

| Iter | Target | Change | Score (before → after) | Outcome | Takeaway |
|------|--------|--------|------------------------|---------|----------|
| 1 | dragonisles | Celtic interlace knotwork frame border (replaced plain rect) | 2 → 4 | Kept | Frame is a defining style element; presence jumps the score two points on its own. |
| 2 | dragonisles | Scroll-banner "LEGENDS of the X" title top-right | 4 → 5 | Kept | Banner now present but small; reference banner dominates the corner more. |
| 3 | dragonisles | Sword-and-dagger compass medallion at top-left | 5 → 6 | Kept | Heraldic compass reads correctly; N/E/S/W letters removed per reference. |
| 4 | dragonisles | Compass size 34 → 90 radius | 6 → 7 | Kept | Must match reference's visual weight; "present but tiny" is not enough. |
| 5 | dragonisles | Move compass into frame corner (size 54) | 7 → 7.5 | Kept | Compass shouldn't overlap map content; reference compass IS the corner medallion. |
| 6 | thirdage | Cartouche title INK → LABEL_RED | 7 → 7.5 | Kept | Baynes's red title is a defining convention; one-line color swap is big visual shift. |
| 7 | thirdage | Numbered scale bar "Days 0 4 8 12 16" in cartouche | 7.5 → 8 | Kept | Scale bar with alternating black/white segments present; matches reference's "Miles" convention. |
| wl-pre | wilderland | ATTEMPTED: remove compass based on wrong inventory claim | 5 → n/a | Rolled back | USER CORRECTION: wilderland DOES have a small 4-arrow N-compass at top-left. Inventory was wrong. Takeaway: use PIL for reference crops — sips' cropOffset behaved unexpectedly and I missed the top-left corner. |
| wl-1 | wilderland | Move compass top-right → top-left | 5 → 6 | Kept | Reference position is top-left, not top-right; simple position change fixes a basic style-read error. |
| wl-2 | wilderland | Edge-label opacity 0.5 → 0.85 | 6 → 6.5 | Kept | Labels were present but too faint to read; bumping opacity makes them function as the directional frame labels the reference uses instead of a compass. |
| wl-3 | wilderland | Three stacked left-edge labels (was one centered) | 6.5 → 7 | Kept | Reference's defining left-edge triplet (Western Lands / Edge of the Wild / Hobbiton) now structurally matches. Content is fallback text because off_map_arrows NW/W/SW keys aren't populating into meta; fixing data pipeline is a follow-up. |
| wl-4 | wilderland | Read ctx.offMapArrows (not meta.off_map_arrows) | 7 → 7.5 | Kept | off_map_arrows is exposed on ctx directly, not nested under meta. One-key change routes real campaign-neighbor labels through; left edge now reads "Vales of Belerion / West lie the Forandol Mountains / South to Kyrgar and Ashenrise". |
| wl-5 | wilderland | Top/right/bottom edges use ctx.offMapArrows (N/NE-E-SE/S) | 7.5 → 8 | Kept | All four frame edges now describe real campaign neighbors rather than hardcoded generic labels. Reference is stricter (left-only triplet + top banner), but data-driven accuracy on all four edges is a better functional map. |
| wl-6 | wilderland | ATTEMPTED: simplify cartouche to plain single-ruled box | 8 → 7.5 | Rolled back | USER/INVENTORY ERROR: reference cartouche has a decorated Greek-key (meander) border, NOT a plain rule. Stripped too much ornament. Takeaway: always zoom-crop the reference element IN DETAIL before deciding "simplify"; a half-inspected inventory entry cost a rollback. Inventory has been corrected. |
| wl-7 | wilderland | Greek key meander strip along cartouche top+bottom | 8 → 8.5 | Kept | Squared-spiral meander unit drawn as SVG path, repeated horizontally at top and bottom of the box. Matches reference's decorated border. Side edges still need the meander; bottom strip slightly overlaps the italic subtitle — both are follow-up iterations. |
| wl-8 | wilderland | Extend Greek-key meander to left+right cartouche edges | 8.5 → 9 | Kept | Same unit-builder rotated 90° via SVG transform. Cartouche now has continuous decorated border on all four sides, matching the reference's fully-bordered meander. |
| wl-9 | wilderland | Forest density 1.0 → 1.8 | 9 → 9.25 | Kept | Reference Mirkwood is a dense packed tree blob; default density rendered too sparse. Bumping the density option on renderForestEdgeTrees packs trees tighter. Still could go higher but minDist limits further packing. |
| wl-10 | wilderland | Denser peak hatching (count p.h/4.5→p.h/2.5, opacity 0.7→0.9) | 9.25 → 9.35 | Kept | Reference Misty Mountains have heavy leeward-flank hatching; mine was sparse. Incremental improvement; peaks are small at map zoom so the effect is modest. |
| wl-11 | wilderland | Fix subtitle overlap (boxH 62→78, subtitle y moved up) | 9.35 → 9.5 | Kept | Bottom meander strip from wl-7 was overlapping the italic subtitle line. Taller cartouche + subtitle repositioned between title and bottom meander. Cartouche now reads cleanly. |
