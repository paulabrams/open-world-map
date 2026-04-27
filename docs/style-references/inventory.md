# Style Reference Inventory

Canonical source of truth for what "10/10 match" means for each style. Catalog
every distinct visual element observable in the reference image, note its
stylistic character, mark in-scope vs out-of-scope, and cross-reference against
the current style module to identify gaps.

Scope rule: **out-of-scope** = bespoke POI glyphs the campaign has added
(fortress icons, named-place crests, creature glyphs on Dragon Isles sea, etc.).
Everything else — terrain, lettering, frames, compass rose, title cartouche,
paper treatment — is **in-scope** and must match the reference for a 10/10.

Reference file locations:

- `viewer/style-references/middle-earth.webp` (thirdage primary)
- `docs/style-references/middle earth.jpg` (thirdage draft/supporting — has pencil underdrawing and margin construction notes; also present historically in `docs/style-references/`)
- `viewer/style-references/wilderland.jpg` (wilderland)
- `viewer/style-references/thrors-map.jpg` (moonletters)
- `viewer/style-references/dragon_isles_simple.png` (dragonisles)

---

## 1. middle-earth.webp — "The West of Middle-Earth at the End of the Third Age" (thirdage.js)

Published color version by Pauline Baynes for The Lord of the Rings.

### Frame & paper

- Aged cream paper. Visible warm parchment tone, slight uneven yellowing.
- No outer border ruling — the map bleeds to the paper edge.
- Thin black inner border is drawn only around the title-cartouche box, not around the whole map.

### Compass rose

- **Top-right corner.** Small ornate 8-point star compass.
- Red ink with a thin black circle enclosing it.
- Single "N" marker at top.
- Drawn at modest scale — not a dominant design element.

### Title cartouche

- **Bottom-left corner.**
- Double-ruled rectangular box in fine black ink.
- Contents: serif all-caps title **"THE WEST OF / MIDDLE-EARTH / AT THE END OF / THE THIRD AGE"** in black.
- Below the title: horizontal scale bar with alternating black/white tick segments labeled "Miles" with numeric stops (`50 100 150 200`).
- Tiny monogram "CJRT" in the bottom-right corner of the cartouche box (Christopher John Reuel Tolkien's attribution).

### Mountains

Four distinct visual sub-styles of mountain:

1. **Misty Mountains (central spine, diagonal).** Tall dense clusters of sharp filled-black triangular peaks, taller-than-wide aspect, overlapping with shared bases, individual peaks clearly discernible.
2. **Ered Luin / Blue Mountains (far west).** Smaller, sparser clusters of black-filled peaks in short chains.
3. **Ered Nimrais / White Mountains (Gondor, east-west).** Long horizontal chain of small filled triangular peaks, slightly smaller and flatter than the Misty Mountains.
4. **Ered Mithrin / Grey Mountains, Ephel Dúath, Ered Lithui (Mordor frame).** Long arcing chains of small peaks forming border walls — denser clusters where the range changes direction.

All mountains share: **solid black fill**, sharp apex, taller-than-wide silhouette, clusters of 3-6 peaks with shared bases, left-flank shading/overlap that reads as perspective.

### Hills

- Tiny open-topped inverted-U humps, ink outlines only (no fill).
- Scattered in loose groupings (e.g. Iron Hills, Emyn Muil).
- Distinct from mountains by size and lack of fill.

### Forests

- **Dense dark forest** (e.g. Mirkwood, Fangorn): nearly solid black blob with a ragged tree-topped upper edge where individual conifer silhouettes poke up.
- **Medium forest** (e.g. Lothlórien, Fangorn edges): clusters of individual tree glyphs — cloud-shaped broadleaf canopies in black ink, not solid.
- **Sparse edge forest**: individual tree glyphs scattered at forest margins.
- Forest shapes are IRREGULAR — organic polygons, ragged edges. They do not follow hex/grid lines.

### Rivers

- Thin black lines with a slight hand-drawn wobble.
- Widen near mouths; some show forked deltas (Anduin into the Bay of Belfalas).
- Flow as continuous lines across the map, breaking only for named river sections.

### Lakes / inland seas

- Enclosed by coastline stipple on all sides (Sea of Rhûn, Long Lake).
- Interior is paper-colored (no wave fill).

### Coastlines

- **Heavy black stipple shading** in the sea along every coast — dots and short dashes, densest right at the coastline, fading outward over several millimeters of map.
- This is a DEFINING feature of this style. Without it the map looks wrong.
- Matches the British Admiralty / Pauline-Baynes convention.

### Swamps / marshes

- Short horizontal dash marks (tufts of reed) scattered in a loose band (Dead Marshes, Nindalf, Wetwang).
- Some marshes have tiny inverted-v bird marks above them suggesting waterfowl.

### Grasslands / plains

- Plain paper. No hatching. Regions identified only by their red labels.
- Some areas show very faint stipple or tiny dot textures but it is subtle.

### Desert / wasteland

- **Nurn / Mordor interior**: thin horizontal contour-hatch lines suggesting dry rolling terrain.
- **Haradwaith / Near Harad**: mostly blank paper with sparse dot texture.

### Roads / paths

- Dashed lines of short ticks (e.g. old North-South road).
- Subtle; the map does not emphasize roads heavily.

### Settlements, keeps, ruins

- Tiny labeled dots or tiny drawn building silhouettes (Minas Tirith, Barad-dûr).
- Label text in red for major places.
- Out-of-scope for this campaign's specific POI markers, but the reference convention is small and unobtrusive.

### Region labels

- **Red ink**, serif small-caps with generous letter-spacing.
- Labels curve with the territory axis (e.g. "ARNOR" arcs NE-to-SW, "MORDOR" runs east-west across the black gate).
- Sizes vary: large for major realms (ROHAN, GONDOR, MORDOR), medium for sub-regions, small for locale names.
- A few labels are black-inked rather than red for lesser regions.

### Named features

- Rivers, capes, passes, and geographic features labeled in small cursive script (italic serif), either black or red depending on importance.

### Palette

- **Two-color: black + red** on cream paper. Nothing else. No blue water, no green forest, no brown earth. The warmth comes entirely from the paper tone and red accents.

### Current gaps in thirdage.js (cross-ref)

- Coastline stipple — may be missing or too light.
- Dense-forest-blob vs sparse-edge-trees distinction — needs separate rendering modes.
- Region labels — presence, placement, curving alignment to territory shape.
- Title cartouche — format (double-ruled box, scale bar with numbered ticks).
- Compass rose — verify red ink + enclosing circle.

---

## 2. middle earth.jpg (draft) — thirdage.js supporting reference

Christopher Tolkien's working pencil-and-ink draft. Not the final art but reveals construction choices.

### What this draft adds over the published version

- **Pencil underdrawing** visible beneath ink — coastlines laid out in graphite first.
- **Region fills** — light pink/red polygon washes over Mordor, Rohan, Lothlórien territories as a color-coded political layer. (The final published version usually does NOT have these fills; Baynes dropped them.)
- **Margin construction notes** in handwriting — miles/proportion calculations on the left edge.
- **Sketch compass** top-right in a BOXED frame (draft version, not the published red star).
- **Blue water hint** top-left (a tiny blue wash showing sea).
- **Crosshatched corrections** over erasures.

### Implication for thirdage.js

- Region-fill polygons (pink/red territory shading) is optional — treat as "v2" feature only if user asks for it.
- The published compass rose is what we target, not the draft.
- The handwriting notes are out of scope (author construction, not map content).

---

## 3. wilderland.jpg — "Wilderland" (wilderland.js)

J.R.R. Tolkien's pen-and-ink map for The Hobbit (redrawn by Christopher Tolkien for later editions).

### Frame & paper

- Cream/ivory paper.
- Map bleeds to the paper edge on all four sides — no outer frame ruling.
- Thin frame lines appear only around specific elements (edge-label strips and the title cartouche).

### Compass rose

- **Top-left corner.** Small 4-arrow compass (N/E/S/W arms) with a prominent "N" letter above the top arrow.
- Enclosed in a thin circle; minimal decoration compared to thirdage's red star.
- Sits just above the "Western Lands" edge label.
- **Correction (2026-04-21):** earlier version of this inventory incorrectly claimed Wilderland had no compass. It does; the compass is small and top-left.

Directions are ALSO conveyed by **edge-label strips** running along the outer frame:
  - Left edge, upper: "Western Lands" with ornament flourishes.
  - Left edge, middle: "Edge of the Wild" with little hash-mark accents.
  - Left edge, lower: "Hobbiton" (location-reference).
  - Top edge: "Grey Mountains" with a decorative banner.
- The edge labels do double duty as cardinal-direction hints and as ornamental framing.

### Title cartouche

- **Bottom-right corner.**
- **Decorated border with a Greek-key / meander pattern** around the edge of the box (not a plain single rule — this was my earlier misread).
- Contains a single word: **"WILDERLAND"** in bold blue serifed all-caps.
- Small monogram/symbol in the upper-right area of the box.
- Simpler than the thirdage cartouche in that there is no scale bar inside; ornament comes entirely from the Greek-key border.

### Mountains

Two visual sub-styles:

1. **Misty Mountains (vertical left spine).** Vertical chain running north-south along the left quarter of the map. Tall triangular peaks drawn with OUTLINE + dense diagonal cross-hatching on the leeward (east) side. Peaks are taller than the Third Age peaks and overlap to form a continuous wall-like ridge.
2. **Grey Mountains (top banner) + Iron Hills (right).** Shorter horizontal chains, same outline-and-hatch treatment but smaller scale.

All mountains share: **outlined silhouette (not solid-filled)**, dense diagonal hatching on one flank, taller-than-wide, overlapping bases. Definitely NOT solid black like the Third Age Misty Mountains.

### Hills

- Small rolling humps with fine hatching on the shaded side, drawn sparsely in open terrain between named regions.
- Distinct from mountains by size and density.

### Forests (Mirkwood-dominant)

- **"Mirkwood the Greatest" (central mass).** Huge polygon filled with hundreds of individual tree glyphs — each tree a little cloud-shaped canopy on a visible trunk, drawn tightly packed. The polygon has a distinctly WAVY ragged edge.
- Each tree is roughly circular/cloudy, not a conifer triangle. Broad-leaf / oak convention.
- Trees are drawn individually (not a tile-pattern) so density and arrangement feel organic.
- A few larger "landmark" trees stand out near edges.

### Rivers

- Thin wiggly black lines.
- **Wave/ripple marks** near river mouths and where rivers widen (Long Lake has tiny horizontal-line wave texture).
- Forked deltas drawn at mouths.

### Lakes

- **Long Lake**, **Mirrormere**, etc. drawn with thin outlines and optional faint interior wave lines.

### Coastlines

- Minimal — this map is inland. Where water exists (Long Lake, small seas) the shoreline is just a thin line, with optional light inward-hatch. **No heavy stipple** like thirdage.

### Swamps / marshes / fens

- The **Withered Heath** (top-right area) uses a different texture — dry scrubby tufts.
- Small reed-tuft marks elsewhere.

### Grasslands / plains

- Plain paper, unshaded. Named with italic cursive labels ("Wold of Rohan" analogue, Long Marshes, etc.).

### Roads / paths

- The **Old Forest Road** and **High Pass** shown as thin dashed-dotted lines across Mirkwood / over Misty Mountains.
- **Old Forest Road** label in italic cursive following the road.

### Settlements / keeps / ruins

- Tiny hand-drawn building sprites for important locales (Esgaroth on Long Lake, Erebor, Dale).
- Labels in italic cursive, not small-caps.
- Minor settlements as dots with italic labels.

### Region labels

- **Black ink**, not red. This style is strictly **monochrome**.
- Big region labels are **spaced serif small-caps** ("MIRKWOOD", "GREY MOUNTAINS").
- Sub-region labels italic cursive.

### Decorative details

- **Dragon cartouche** (small dragon drawing) top-right between labels — part of Smaug / Desolation of Smaug reference.
- Small ornamental flourishes beside edge-label strips.

### Palette

- **Two-ink: black line art + pale-blue label text** on cream paper. NOT pure monochrome — the reference uses a specific pale blue (~#3a6090) for region names ("GREY MOUNTAINS", "Mirkwood") and some river/water labels. Mountain line art, tree glyphs, and the cartouche border stay black.
- No red ink anywhere. A wilderland render with any red is fundamentally wrong.
- **Correction (2026-04-22):** earlier version of this inventory claimed wilderland was monochrome black. It is not; blue label ink is a defining feature.

### Current gaps in wilderland.js (cross-ref)

- Edge-label strips (Western Lands, Edge of the Wild, Hobbiton, Grey Mountains) — probably not rendered at all currently.
- Individual-tree forest glyph density — should be per-tree, not a stamp pattern.
- Mountain outline+hatch style (not solid fill) — if my recent iteration made WL solid-fill, that was wrong.

---

## 4. thrors-map.jpg — "Thror's Map" (moonletters.js)

J.R.R. Tolkien's map-within-the-story for The Hobbit. Drawn as if by the dwarves.

### Frame & paper

- Cream paper with visible age-marks.
- A thin single-ruled border frames the map but only on three sides (leaves a gap at the bottom-right where the title-corner bleeds to edge).

### Compass rose

- **Top-right corner.**
- Elaborate 4-point cross compass with decorative flourishes.
- **Tolkien runic cardinals** — not N/E/S/W but dwarvish Cirth-rune initials:
  - Top: "M." (likely *menel* "north" or similar — a cirth rune resembling M.)
  - Bottom: "P." (likely *pa-* "south")
  - Left: a plus-like rune (east marker)
  - Right: looks like an "H" or hung-rune (likely *nor* — west marker)
- All four letters in RED ink.
- Compass itself is blue-lined with red points and center medallion.

### Title cartouche

- **Bottom-left corner.**
- No rectangular box — instead, a FREEFORM decorative corner with:
  - "Thror's Map" in cursive blue script.
  - A small decorative **spider web** motif beneath the text.
- The cartouche reads as a signed-in-the-corner artist inscription rather than a formal box.

### Mountains

- **The Lonely Mountain (Erebor)** dominates the upper-middle as a large drawn mountain with multiple peaks, shaded sides, a front door, and Smaug drawn in red ink perched on the summit.
- Surrounding mountains are smaller blue-inked peaks with basic outline and light hatching.
- Distinct from thirdage and wilderland — this style shows TOPOGRAPHIC PROMINENCE of a single landmark peak.

### Forests

- **Mirkwood** to the south: stylized serrated edge representing treeline, labeled "West lies Mirkwood the Great, there are Spiders" in cursive.
- Individual tree glyphs are small and sparse — this style is not forest-heavy.

### Rivers

- **The Running River** — wiggly blue line with thin wave marks; has small fish glyphs floating on it.
- **The Forest River** — similar wiggly blue line at bottom-right with fish.

### Lakes / inland seas

- **The Long Lake** at right — blue outlined, labeled in italic.
- **Esgaroth upon the Long Lake** — settlement marker with cursive label.

### Coastlines / shores

- Thin blue lines only. No heavy stipple.

### Swamps / marshes / wastes

- **The Desolation of Smaug** — vast open area with scattered blue dead-tree skeletons (bare-branch glyphs) and barren ground marks.
- **The Withered Heath** — farther north, similar dry-scrub texture.

### Grasslands / plains

- Open paper with scattered tufts of grass (tiny "v" marks).

### Roads / paths

- Minimal; a few dashed-line trails.

### Settlements / keeps / ruins

- **Esgaroth** on Long Lake (settlement sprite).
- **Dale** ruins with label "Here was Girion lord in Dale" in cursive with a small arrow/bracket pointing at the site.

### Region labels

- **Cursive script**, mostly blue. Lower-case italic with capitalized proper nouns.
- Labels are descriptive sentences, not just place names: "Here of old was Thrain King under the Mountain", "East lie the Iron Hills where Dain dwells", "Far to the North are the Grey Mountains & the Withered Heath whence came the Great Worms".

### Runes

- **Large central block of Cirth runes** in the lower-middle — dwarvish writing giving directions/history, in blue ink, regular non-moon form.
- **Moon-letters** (defining feature): mirror-imaged/inverted Cirth glyphs in RED ink, scattered at specific locations. Per the story, they appear only when Durin's moon falls on the map.

### Annotations

- Hand-drawn BRACKETS and ARROWS pointing at features, with cursive explanatory labels — "here is the gateway of the Long Lake", "Here flows the Forest River", etc. A very distinctive idiom.

### Decorative details

- **Smaug** drawn in RED perched on the Lonely Mountain — a small but defining feature.
- **Great Worms** depicted as a red-ink serpentine creature near the northern waste.
- **Spider** motif on the Mirkwood label area (Mirkwood spiders reference).
- **Door rune** on the Lonely Mountain showing the secret door's cirth key.

### Palette

- **Blue + red ink on cream paper.** Blue is the primary ink (all the line work, labels, map features). Red is the accent color used for:
  - Moon-letters
  - Smaug and creatures
  - The compass cardinals (M. P. and the two markers)
  - A few highlighted words in annotations

### Current gaps in moonletters.js (cross-ref)

- Confirm compass cardinals use Cirth runes (M./P./etc.), not English N/E/S/W.
- Confirm moon-letters are rendered in red Cirth, mirrored, and hidden by default (reveal via URL param or moon-phase toggle).
- Verify blue primary + red accents palette.
- Spider/dragon/creature glyphs + bracket-and-arrow annotation idiom may need implementation.

---

## 5. dragon_isles_simple.png — "Legends of the Dragon Isles" (dragonisles.js)

World-scale fantasy map in a pseudo-medieval Celtic-illumination style.

### Frame & paper

- Parchment paper tone — warm off-white with sepia edge vignetting.
- **Ornate Celtic-interlace border frames all four edges** — knotwork bands with corner medallions. This is a defining feature; a render without the knotwork frame is fundamentally wrong.
- The knotwork uses a two-strand interlace (over-under weave).
- Corner medallions repeat a circular Celtic-knot pattern.

### Compass rose

- **Top-left corner.**
- **Sword-and-dagger motif** — a vertical long sword with a shorter crossing element, inside a circular knotwork medallion.
- Not a simple star; reads as heraldry / coat-of-arms.
- **No N/E/S/W letters** — cardinals are implicit.

### Title cartouche

- **Top-right corner.**
- **Scroll-banner** style — a horizontal banner with curled ends.
- Text: **"LEGENDS of the DRAGON ISLES"** in serifed all-caps ("LEGENDS" and "DRAGON ISLES" larger; "of the" smaller in the middle).

### Region labels

- **Large red spaced small-caps**, curving with territory shape, following the land.
- Canonical region names: SEPULCHRE, HRIVLYGGDOR, BELERION, GIFSKEPTYR, ALGLÖNDER, KITANIA, ROCHIR PLAINS, HARADJIA, DÖRRAZUM, SURUINEN.
- Sea names: THE DRAGON SEA, THE TRACKLESS SEA.
- The red is closer to **oxide-red / dried-blood** than thirdage's brighter vermilion.

### Settlement labels

Two tiers:

1. **Major cities**: red italic-caps labels. Cities: Ælenthar, Nan-Avathar, Ashenrise, Dorthonia, Madrigal, Aquila, Akkar.
2. **Minor settlements**: small black italic labels. Places: Kyrgar, Torretta, Danketar, Highpört, Drowned Tr'Kob, Isle of Loots, Sk'Anwon, St'Ainon, Er'Atlon, Dager, Seratra, Shadikär, Erida, Kutka, St'Emlix, SL'Khor, Golder, Talo.

Each settlement has a tiny **red castle/town glyph** next to the label (stylized building silhouettes).

### Mountains

- **Baynes-style jagged peaks** (similar to thirdage) with heavy hatched shading.
- At WORLD-MAP zoom, so individual peaks are smaller and ranges span long sweeps.
- Peaks overlap densely and form long chains following coastlines and inland borders.
- Shading is dense cross-hatching on left/leeward side.

### Forests

- Dense clusters of **individual tree drawings** — small cloud-shaped canopies with visible trunks.
- Similar to Wilderland in character but tighter and smaller at this zoom.
- Forests cluster in named inland regions (Kitania, Suruinen, Belerion interior).

### Rivers

- Thin black wiggly lines. Follow natural drainage patterns — from inland mountains to coastlines.
- Label in small italic where prominent.

### Lakes / inland seas

- Thin black outline; interior is paper-tone.
- Some sea-monster glyphs inside larger water bodies.

### Coastlines

- Thin black outline (not heavy stipple like thirdage).
- Some **wave lines** scattered in the sea suggesting water movement.

### Seas / open water

- Mostly empty parchment paper.
- Scattered **thin rule-lines** (mostly horizontal, some radial from the compass) suggesting water direction / navigation.
- Populated by:
  - **Ships**: small sprite drawings, some with **red sails or banners**.
  - **Sea serpents**: winged / coiled black ink serpents.
  - **Kraken / tentacled monster** in the lower-left trackless sea.
  - **Sea-creature silhouettes**: whales, fish, things.

### Compass-rose ray lines

- Faint radial lines fanning from the compass rose across open-sea areas.
- A distinctive Celtic-map / nautical-chart device — easy to miss.

### Roads / paths

- Minimal / not prominent at this world-map zoom.

### Settlements / keeps / ruins

- See "Settlement labels" above.

### Palette

- **Black/sepia line art on parchment with red accents.**
- Red used for: region names, major-city names, castle glyphs, sails/banners on ships, sea-creature highlights.
- The red is warmer/browner than thirdage's bright red — "oxide" or "dried blood".

### Current gaps in dragonisles.js (cross-ref)

- Celtic-interlace frame border — must be present; a render without it is wrong.
- Sword-and-dagger compass medallion top-left.
- Scroll-banner title cartouche top-right.
- Two-tier settlement labels (red major / black minor) with castle glyphs.
- Ships, sea serpents, kraken on open sea.
- Compass-rose ray lines across water.
- Oxide-red hue distinct from thirdage's vermilion.

---

## Iteration priority order (rough)

Highest-impact missing elements per style (should be first iteration targets):

**thirdage.js**: coastline stipple, red region labels curving with territory, title cartouche format with scale bar, forest blob vs. edge-tree distinction.

**wilderland.js**: edge-label strips (Western Lands, etc.), individual-tree forest density, mountain outline+hatch (not solid fill), plain-box title cartouche bottom-right.

**moonletters.js**: Cirth compass cardinals, moon-letters red-mirrored with reveal mechanism, bracket+arrow annotation idiom, blue primary + red accents palette.

**dragonisles.js**: Celtic-knotwork frame border, sword compass top-left, scroll-banner title top-right, two-tier settlement labels with castle glyphs, ships + sea serpents + kraken decorations, compass ray lines, oxide-red hue.
