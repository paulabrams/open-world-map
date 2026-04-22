# Style Tuning

## Goal

Match the Baynes/Tolkien source art across **every map element** in maps/styles/thirdage.js, maps/styles/wilderland.js, and maps/styles/moonletters.js, and the Dragon Isles world-map source art in maps/styles/dragonisles.js. Target 10/10 visual match where the rendered map looks hand-drawn in the authentic style.

> The Dragon Isles style replaces the earlier hexcrawl style. `maps/styles/hexcrawl.js` should be renamed to `maps/styles/dragonisles.js` and retuned to match `dragon_isles_simple.png` — any hex-crawl-rubric work is superseded.

### Reference images (canonical location: `maps/style-references/`)

- **thirdage.js** → `middle-earth.webp` (primary) + `middle earth draft.jpg` (supporting — shows pencil underdrawing, region-fill shading, and margin construction notes). If `docs/style-references/` also contains a file, treat `maps/style-references/` as authoritative.
- **wilderland.js** → `wilderland.jpg`
- **moonletters.js** → `thrors-map.jpg`
- **dragonisles.js** → `dragon_isles_simple.png` (world-scale map of the Dragon Isles — ornate Celtic-knot frame, sword-and-knotwork compass, sepia-on-parchment with red labels for named regions and prominent settlements)

**Elements in scope — all must match the reference:**

- Mountains and hills
- Forests and individual trees (forests are as important as mountains)
- Rivers, coastlines, lakes, swamps
- Grasslands, plains, deserts, any terrain hatching / stippling
- Borders, roads, trails, paths
- Labels, lettering, runes, cartouches, compass roses, scale bars
- Paper/parchment background, ink weight, line character

**Out of scope (intentional departures from the source style):** point-of-interest markers the campaign has added beyond what Baynes/Tolkien drew — e.g. Thornespire Keep's fortress icon, Blackwater Crossing's town icon, decorative creature/animal glyphs, and similar bespoke additions. Do not try to make these "match" — they're original and that's fine.

**Done** means every in-scope element on the rendered map looks identical to the original hand-drawn style reference — a score of 10/10. Every element cataloged in the source inventory (below) must have a rendered counterpart that matches. Anything less is not done; keep iterating.

## Step 0 — source inventory (do this before iterating)

Before touching any style code, **read each reference image carefully and catalog every distinct visual element it contains.** Write the inventory to `docs/style-references/inventory.md` (one section per reference) so it can be referenced during iterations. Expect to find things you don't think of in the abstract — the category list in the Goal is a starting point, not exhaustive.

For each reference image (middle-earth.webp + middle earth draft.jpg, wilderland.jpg, thrors-map.jpg, dragon_isles_simple.png):

1. **Inventory every element you see.** Don't restrict yourself to obvious categories. Look for: mountains (multiple styles — big peaks, small hills, ridges); forests (dense, sparse, individual tree glyphs, copses); rivers, streams, waterfalls; lakes, inland seas, ponds; fens, swamps, marshes, reed beds; coastlines with stipple; beaches, cliffs; grasslands, plains, downs, steppes; deserts, dunes; roads, trails, paths; bridges, fords, ferries; settlements, towns, keeps, ruins, towers, walls; borders, frontiers; cartouches, compass roses, scale bars, legend boxes; runes, moon-letters, labels, place names; decorative corners, framing lines; paper grain, ink spatter, age marks. **And whatever else is actually in the image that doesn't fit these categories.**
2. For each element, write 1–2 sentences describing its visual style (line weight, stroke character, fill vs outline, density, clustering).
3. Mark each element as **in-scope** (must match) or **out-of-scope** (campaign-added, see Goal section).
4. Cross-reference against the current style module (thirdage.js / wilderland.js / moonletters.js / dragonisles.js): does the code render this element at all? If not, it's a gap.

The inventory is the source of truth for what "10/10" means. A rendered map with missing elements cannot score 10, no matter how good the elements it does have look.

Update the inventory if you spot new elements during iteration — treat it as a living checklist.

## Mandatory loop per iteration — no skipping

**Each iteration is an experiment.** Keep the change only if the score goes strictly up. Otherwise roll it back before the next iteration — no compounding unverified changes.

1. Confirm the working tree is clean (`git status` shows no uncommitted changes from the previous iteration).
2. Make ONE focused code change.
3. --headless --screenshot all four styles.
4. Read the screenshot crop AND the reference crop in the same response (two Read calls back-to-back so both render in context).
5. Write a concrete diff: "Mine has X; reference has Y; gap is Z." Name specific features — apex sharpness, base-to-height ratio, cluster density, fill vs outline, shadow direction.
6. Rate 1-10 based on what I see, not what I hope I did. Err low.
7. **Decide:** score strictly higher than prior iteration → `git commit` the change and merge it into the main branch before the next iteration. Score equal or lower → `git stash` to roll back the change (ties count as rollback; visual noise usually masquerades as a tie). Drop the stash before the next iteration so the tree is clean.
8. Pick the single highest-leverage next change. No bundled changes.

## Anti-patterns I have caught myself doing

- "Read screenshot" → glance at thumbnail → claim it matches. Look at actual pixels.
- Rate 8/10 when honest score is 5-6/10.
- Skip the reference lookup because I "remember what it looks like."
- Change 3 things at once so I can't tell what helped.
- Iterate on composition while single-peak silhouette is still wrong.
- Report "done" without the comparison screenshots embedded.

## Cross-hex rendering principle

**The map should not look hex-stamped.** The reference art composes across hex boundaries — ranges, forests, and coastlines read as continuous features, not as a grid of independent hex cells. This applies especially when two adjacent hexes share the same terrain type: the shared boundary between them should disappear visually, and the two hexes should read as one larger continuous feature. Let art flow across hexes when the reference does:

- **Forests** should read as continuous woodland masses — individual trees drawn in irregular clusters that span hex boundaries, not a grid of per-hex forest stamps. Forest edges should be ragged and organic, determined by where forest terrain ends, not by hex edges.
- **Mountain ranges** should look like connected ranges when adjacent mountain hexes form a run — shared bases, overlapping silhouettes across the hex seam — while still having enough internal cluster structure that the range has rhythm rather than fusing into a featureless strip.
- **Rivers, coastlines, roads** obviously flow through hexes uninterrupted.
- **Swamps, hills, terrain hatching** should blend at hex boundaries so transitions look drawn, not tiled.

The hex grid is a gameplay substrate; the art should feel like a hand-drawn map that happens to overlay a hex grid, not a hex grid with per-cell stamps.

## Mountain-specific conventions

- Horizontal zigzag per hex, not a diagonal meander across hexes.
- Line-drawn with hatching — not solid black triangles — BUT at the small-peak Drúwaith scale in the reference, the peaks are effectively solid dark. Resolve this by keeping the outline/shadow treatment at the right visual density.
- Hatching stays inside the peak — never into the sky.
- Peaks modest size; default smaller not larger.
- Within a run of mountain hexes: peaks from adjacent hexes share bases and overlap across the hex seam (see cross-hex principle) — but each hex should still contribute its own cluster rhythm so the range doesn't fuse into an undifferentiated strip.
- Within a single cluster: peaks overlap tightly with shared bases, taller-than-wide aspect ratio, sharp apexes.

## Per-style conventions

Each style has its own palette, title cartouche, and compass treatment. Getting these wrong is a big score hit even if terrain is perfect — a red-labels thirdage rendered in pure monochrome reads as "wrong style" at a glance.

### thirdage.js (ref: middle-earth.webp + middle earth draft.jpg)

- **Palette:** black line art + red labels/accents on cream/aged paper. Two-color only.
- **Compass rose:** small red eight-point star, top-right, with "N" marker.
- **Title cartouche:** bottom-left, double-ruled rectangular box, serif all-caps title over a scale bar labeled "Miles" with numbered ticks. The Basilisk campaign title should follow this format.
- **Coastlines:** dense black stipple shading in the sea along coasts — distinctive and heavy.
- **Region labels:** red, spaced caps, curving with the territory (e.g. "ARNOR", "MORDOR").
- **Region fill shading:** the draft shows pink/red polygon fills used for political territories. Consider this for region_labels when a territory shading pass is added.

### wilderland.js (ref: wilderland.jpg)

- **Palette:** monochrome black ink on cream paper. **No red. Ever.** If you see red on a wilderland render, something is wrong.
- **Compass rose:** none. Directions are conveyed by edge-label strips: "Western Lands", "Edge of the Wild", "Hobbiton" along the outer frame, not a rosette.
- **Title cartouche:** bottom-right, plain single-ruled box containing the word "WILDERLAND" in serif caps. Equivalent Basilisk cartouche uses the same plain-box treatment.
- **Forest glyphs:** many individual tree drawings — trunk + foliage scribble — densely packed for forest, sparser for copses. Not a tiled tree stamp.
- **Mountains:** vertical crest with fine hatch shading on leeward side; the Misty Mountains motif.
- **No coastal stipple** like thirdage has; wilderland's edges are simpler line work.

### moonletters.js (ref: thrors-map.jpg)

- **Palette:** blue line art + red annotations on cream paper. Blue is the primary ink; red is reserved for moon-letters, the dragon, and a few highlights.
- **Compass rose:** top-right, elaborate, with **Tolkien cardinals** (likely M/P/T/W or similar runic/elvish initials — NOT N/E/S/W). Read the reference carefully to get the exact letters; do not substitute English cardinals.
- **Title cartouche:** bottom-left corner treatment — "Thror's Map" with spider-web / dragon sigil decoration. The Basilisk equivalent needs its own sigil but in the same corner position and decorative style.
- **Runes:** dense block of Tolkien Cirth runes in the lower-middle area. For Basilisk this can be a block of flavor runes relevant to the Blackwater/Vault lore, rendered in the same dwarvish style.
- **Annotations:** hand-drawn brackets and arrows pointing to features, with cursive labels ("Here was Girion lord in Dale", "West lies Mirkwood the Great, there are Spiders", etc.). Basilisk annotations should use the same bracket/arrow + cursive idiom.
- **Rivers:** thin wiggly lines with small fish or wave marks near river mouths.

### dragonisles.js (ref: dragon_isles_simple.png)

This is a **world-scale map** (the whole Dragon Isles), not a regional hex crawl. The Basilisk campaign sits inside Belerion, one of the named regions on this map. Scale, density, and framing are very different from the three Tolkien-lineage styles.

- **Palette:** black/sepia line art on parchment with **red accents** for named regions, prominent settlements, and sails/banners on ships. Two-color. Unlike thirdage's bright vermilion, the red here leans more toward a dried-blood / oxide red; match the reference crop for exact hue.
- **Frame:** ornate **Celtic interlace border** running around all four edges — knotwork bands with corner medallions. This is a defining visual and must be present; a dragon-isles render without the knotwork frame is fundamentally wrong.
- **Compass rose:** top-left corner, elaborate — a sword-and-dagger motif inside a circular knotwork medallion. Not a simple star; it reads as a piece of heraldry. No N/E/S/W letters.
- **Title cartouche:** top-right, scroll-banner style with serifed all-caps: "LEGENDS of the DRAGON ISLES". The Basilisk subtitle, if used, sits below the main title in smaller italic caps.
- **Region labels:** red, large, spaced small-caps, curving with territory shape: SEPULCHRE, BELERION, HRIVLYGGDOR, ULFSKEPTYR, ALGLÖNDER, KITANIA, ROCHIR PLAINS, HARADJIA, DÖRRAZUM, SURUINEN, plus sea names (THE DRAGON SEA, THE TRACKLESS SEA). These names are canonical and appear in the Basilisk off-map arrows.
- **Settlement labels:** two tiers — *major cities* in red italic-caps (Aelenthar, Nan-Avathar, Ashenrise, Dorthonia, Madrigal, Aquila, Akkar); *minor settlements* in small black italic (Kyrgar, Torretta, Danketar, Highpört, etc.). Each has a tiny red castle/town glyph next to the label.
- **Mountains:** Baynes-style zigzag peaks with heavy hatched shading — very similar to thirdage, but at world-map zoom level so individual peaks are smaller and ranges span long sweeps.
- **Forests:** dense clusters of individual tree drawings, wilderland-like in character but tighter and smaller at this zoom.
- **Seas:** mostly empty parchment with thin rule marks indicating water, populated by small decorative elements — ships with red sails, sea serpents, a tentacled monster in the lower-left, compass-rose ray lines radiating across open water.
- **Ships & creatures:** hand-drawn ship sprites (some with red sails), sea serpents, kraken — these are part of the style's character and should be preserved, not removed. For the Basilisk campaign, these are analogous to the "out-of-scope" POI markers elsewhere, but on dragonisles the decorative sea-life is part of the *style* and should be maintained.
- **Compass-rose ray lines:** faint radial lines fanning from the compass rose across the open-sea areas — a distinctive Celtic-map device. Easy to miss; include them.

Because dragonisles is a world map and Basilisk is a regional map, the dragonisles style rendering of the Basilisk data should either (a) zoom out to show where Belerion/Blackwater Crossing sits inside the Dragon Isles and name neighboring regions that currently appear as off-map arrows, or (b) render the Basilisk region with dragon-isles styling but at world-map density conventions. Confirm which with the user before iterating heavily.

#### Moon-letter behavior (moonletters.js only)

Moon-letters are the defining feature of this style. They are **mirrored/inverted red Cirth glyphs** that, in lore, appear only when the correct moon's light falls on the map. Rendering requirements:

- Render moon-letter glyphs in red, horizontally mirrored (or the appropriate Cirth moon-letter form), distinct from the ordinary blue runes.
- Provide a reveal mechanism: a visibility toggle keyed to moon phase (or a URL param like `?moon=waxing-crescent`) that shows/hides moon-letter text. Default state hides them (they're secret).
- When hidden, moon-letters should be completely invisible — no faint outline, no placeholder. The lore is that without the right moon you literally cannot see them.
- Place moon-letters at map locations tied to the Basilisk campaign's secrets (Vault of First Light, Tunnels Beneath Blackwater, etc.) — the content is campaign-specific, the typography is Thror's-Map-specific.
- The ordinary (non-moon) Cirth rune block stays blue and is always visible.

## Reporting template per turn

"Iter N: changed X. Observed: [specific feature diff]. Score: Y/10 (prior: Z/10). Kept | Rolled back.
Gap to 10: [highest-leverage miss].
Audit: I [did | did not] look at the reference screenshot. I [did | did not] look at the actual pixels.
Next change: [one thing]."
