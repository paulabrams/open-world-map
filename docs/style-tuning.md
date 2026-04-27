# Style Tuning

## Goal

Match the Baynes/Tolkien source art across **every map element** in viewer/renderers/thirdage.js, viewer/renderers/wilderland.js, and viewer/renderers/moonletters.js, and the Dragon Isles world-map source art in viewer/renderers/dragonisles.js. Target 10/10 visual match where the rendered map looks hand-drawn in the authentic style.

> The Dragon Isles style replaces the earlier hexcrawl style. `viewer/renderers/hexcrawl.js` should be renamed to `viewer/renderers/dragonisles.js` and retuned to match `dragon_isles_simple.png` — any hex-crawl-rubric work is superseded.

### Reference images (canonical location: `viewer/style-references/`)

- **thirdage.js** → `middle-earth.webp` (primary) + `middle earth draft.jpg` (supporting — shows pencil underdrawing, region-fill shading, and margin construction notes). If `docs/style-references/` also contains a file, treat `viewer/style-references/` as authoritative.
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

## Scope boundary — IRON-CLAD: style from reference, content from graph JSON

**The reference images are a STYLE guide, not a CONTENT guide.** This distinction is not negotiable.

- **What you match from the reference:** the *visual style* — line character, palette, stroke weight, hatching patterns, cartouche shape, compass style, how mountains are drawn, how forests are drawn, how rivers are drawn, label typography, paper tone, frame ornament (where in scope).
- **What you do NOT match from the reference:** the *content* — which hexes have mountains, where rivers flow, where settlements are, which place names appear, where forests are. None of that comes from the reference image. All of it comes from `maps/{campaign}/{campaign}.json` (e.g. `maps/Basilisk/Basilisk.json`).

**If the reference shows a mountain range along its left edge but the graph JSON has no mountain hexes along the left edge of the Basilisk map, you DO NOT draw mountains there.** The job is to render the graph data *authentically to both its structure and to the source art's style*, not to recreate the reference's geography. A mountain that appears in the render without a corresponding mountain hex in the JSON is a hallucination and must be removed.

Before adding any map element (mountain, forest, river, road, settlement, ship, decorative flourish inside the map body), ask:

1. Is this element's presence driven by the graph JSON? (hex_terrain, nodes, river_path, road_path, region_labels, off_map_arrows, etc.)
2. Or is it driven by what I see in the reference?

If the answer is (2), do not add it. The reference informs *how* to render elements the JSON specifies; it does not add elements.

**Out-of-scope content categories (never render, even if the reference has them):**

- Mountains, hills, ridges not present in `hex_terrain` as mountains/hills/crags.
- Rivers, streams, lakes that are not in `river_path` or its data equivalents.
- Roads, trails, paths not in `road_path` or the `links` array.
- Settlements, towns, keeps, ruins, towers not in `nodes`.
- Place names / region names / sea names not in `nodes`, `region_labels`, `off_map_arrows`, or `river_name`.
- Forests, swamps, etc. not in `hex_terrain`.
- Decorative content inside the map body (ships, sea serpents, creatures) unless the campaign data specifies them. Frame/corner decorations are a separate in-scope-or-not question handled per-style.

If in doubt, **open the campaign JSON** (`maps/Basilisk/Basilisk.json` for the Basilisk campaign) and grep/inspect it for the element you're about to render. If the data isn't there, the element isn't either.

This rule overrides any per-style convention. If a per-style convention says "render sea serpents" but the campaign JSON has no sea serpent data, the serpents don't appear. Style conventions describe *how* to draw campaign-data-driven elements, not which elements exist.

## Element priority ranking

When picking the "single highest-leverage next change" (and when deciding which inventory gaps to close first), work through the in-scope element categories in this order of importance:

1. **Mountains**
2. **Forests**
3. **Rivers**
4. **Roads**
5. **Farms**
6. **Houses** (settlement icons — taverns, towns, keeps, ruins, towers)
7. **Labels**

This ranking reflects what most defines the map's character. A wilderland render with poor mountains and perfect labels is a lower-scoring map than one with good mountains and rough labels. Use this ordering as a tiebreaker when several gaps are visible: fix the higher-priority category first.

Element categories not on this list (frames, cartouches, compass roses, coastlines, stipple, scale bars, sea decorations, off-map arrows, etc.) are still in-scope where the per-style conventions say they are — but they rank below the seven above. Active focus directives override this ranking for their duration.

## Step 0 — source inventory (do this before iterating)

Before touching any style code, **read each reference image carefully and catalog every distinct visual element it contains.** Write the inventory to `docs/style-references/inventory.md` (one section per reference) so it can be referenced during iterations. Expect to find things you don't think of in the abstract — the category list in the Goal is a starting point, not exhaustive.

For each reference image (middle-earth.webp + middle earth draft.jpg, wilderland.jpg, thrors-map.jpg, dragon_isles_simple.png):

1. **Inventory every element you see.** Don't restrict yourself to obvious categories. Look for: mountains (multiple styles — big peaks, small hills, ridges); forests (dense, sparse, individual tree glyphs, copses); rivers, streams, waterfalls; lakes, inland seas, ponds; fens, swamps, marshes, reed beds; coastlines with stipple; beaches, cliffs; grasslands, plains, downs, steppes; deserts, dunes; roads, trails, paths; bridges, fords, ferries; settlements, towns, keeps, ruins, towers, walls; borders, frontiers; cartouches, compass roses, scale bars, legend boxes; runes, moon-letters, labels, place names; decorative corners, framing lines; paper grain, ink spatter, age marks. **And whatever else is actually in the image that doesn't fit these categories.**
2. For each element, write 1–2 sentences describing its visual style (line weight, stroke character, fill vs outline, density, clustering).
3. Mark each element as **in-scope** (must match) or **out-of-scope** (campaign-added, see Goal section).
4. Cross-reference against the current style module (thirdage.js / wilderland.js / moonletters.js / dragonisles.js): does the code render this element at all? If not, it's a gap.

The inventory is the source of truth for what "10/10" means. A rendered map with missing elements cannot score 10, no matter how good the elements it does have look.

Update the inventory if you spot new elements during iteration — treat it as a living checklist.

### Inventory audit and self-score (mandatory before Step 0.5)

**A first-pass inventory is always incomplete.** Real example: on wilderland.jpg, a first pass missed the compass rose in the top-left corner entirely. The agent described wilderland as having "no compass rose, just edge labels" — wrong. Compass rose was right there. This kind of miss is the norm, not the exception.

Before moving on, do an audit pass on each reference:

1. **Corner and edge sweep.** Look specifically at each of the four corners and the four edge strips. Name what's in each. Corners almost always have decorative elements (compass rose, cartouche, sigil, signature) and they're the easiest things to miss because the eye goes to the map body first.
2. **Blank-space sweep.** For each large blank area (seas, plains, sky), list what's actually in it. Usually there are small decorative elements — ships, monsters, wave marks, radial compass rays — that don't register on a first pass.
3. **Label tier sweep.** Confirm you've distinguished label tiers (region / settlement / feature / annotation), each with its own typography. It's easy to collapse "labels" into one bucket.
4. **Cross-reference sweep.** Compare what you inventoried for this reference against the other three. If thirdage has a scale bar and wilderland doesn't — is that really the case, or did you miss wilderland's? Differences between references are where missed elements hide.
5. **Self-score the inventory's completeness.** Rate your inventory for this reference 1–10 on how thorough it feels. **Err low.** If you rate it above 7/10 you're probably overconfident — go do another sweep. A first inventory at 4–6/10 is healthy; one at 9/10 on the first try is almost certainly wrong.

Write the completeness self-score next to each reference's inventory section. If the score is below 6/10, do another pass before proceeding to Step 0.5. The inventory blocks everything downstream — it's worth the extra half-hour.

## Step 0.5 — baseline scoring (do this once, after Step 0, before iterating)

Before any code change, **score each style's current render against its reference** and write the scores into the scoreboard at the top of `docs/style-tuning-log.md`. This is the baseline that every subsequent "score strictly higher" comparison depends on — if the baseline is wrong, the whole experiment discipline breaks.

For each style:

1. `--headless --screenshot` the style against the Basilisk campaign.
2. Read the screenshot and the reference side by side.
3. Score 1–10. Write the score to the scoreboard with a one-line justification.

**Strong prior: if the user is asking you to iterate on style tuning, the current scores are almost certainly low — probably 2–5 out of 10 across the board.** A high-scoring style would not be the subject of an iterative tuning loop. Err low. When in doubt between two scores, pick the lower one.

Why this matters:

- **A generous baseline poisons the experiment rule.** If you score wilderland 7/10 when the honest score is 4/10, every real improvement will look like a regression ("went from 7 to 5 — roll back") and the loop will stall or churn for no reason.
- **You will be tempted to be generous** because the map already "looks OK" to you or because you feel the existing code deserves credit. Resist. The reference, not the code, is the judge.
- **Missing elements cap the score.** If the inventory lists 20 in-scope elements for a style and the code renders 12, the honest score cannot be higher than about 6/10 no matter how good those 12 elements look. A render with missing elements cannot score 10 (see Step 0).
- **The user already told you the score is low** by asking you to iterate. A baseline of 8/10 contradicts the premise of the job.

Do not start iterating until every targeted style has a baseline score written to the log.

## Mandatory loop per iteration — no skipping

**Each iteration is an experiment.** Keep the change only if the score goes strictly up. Otherwise roll it back before the next iteration — no compounding unverified changes.

### Which style to work on this iteration

**Iterate on the lowest-scoring style first.** Focus gives depth; most style fixes need 3–5 consecutive iterations on the same module to settle, so don't rotate prematurely.

At the start of each iteration:

1. Look up the current score for each of the four styles (maintain a running scoreboard at the top of the iteration log, e.g. `thirdage 7 | wilderland 6 | moonletters 5 | dragonisles 3`).
2. Pick the **lowest-scoring style** as this iteration's target.
3. Keep working on that style until its score **ties the second-lowest** — then the two become the new joint lowest, and you switch to whichever of the two has the bigger concrete gap (the one where you can name a specific, addressable miss).
4. If two styles are tied for lowest, pick the one that hasn't been iterated on more recently (avoid thrashing one while the other starves).
5. A change to shared code (`viewer/core.js`) counts against *all four* styles — see the scoring rule below.
6. **If the user has scoped the loop to a specific style** (e.g. `/loop run on wilderland`), that override beats the rotation rule — but you MUST explicitly log "user-scoped to {style}; rotation paused" in the iteration's target line so it's clear the lowest-scoring rule is being bypassed intentionally.

### Scoring rules — integers only, no padding

**All scores are integers 1–10.** No 7.5, no 9.25, no 9.75. Half-points and decimals are score-padding dressed as precision — they let you claim "progress" on every iteration by shaving a tenth. They are banned.

"Strictly higher" in the experiment-decision rule means **+1 or more** against the last integer score. A change that feels like an improvement but can't move the honest integer score by a full point is not a keeper — stash it and pick a higher-leverage change.

Corollary: if you find yourself debating between two adjacent integers (is this an 8 or a 9?), pick the lower one. This is the same "err low" rule applied at every iteration, not just baseline.

### Inventory-gap score cap

**At any score of 8 or higher, enumerate every in-scope inventory item and mark each as rendered / partial / missing.** Write the list into the iteration's log row as a "Coverage" note. If any in-scope item is missing or partial, the score is capped at **7/10** until those items are addressed. A render missing significant elements cannot score 8+ no matter how good the elements it *does* have look — this was already stated in Step 0 and is enforced here.

This prevents score inflation: it's much easier to polish existing elements up to "feels like 9" than to render the missing ones. The cap forces work to the gaps instead.

### User score overrides

**The user's score is authoritative and overrides your self-scoring.** If `docs/style-tuning-log.md` contains a User Feedback entry like `wilderland: 3 — too much score inflation, rivers and in-town routing missing`, you MUST:

1. Reset the scoreboard for that style to the user's score.
2. Log the override as an iteration row (target style, change = "user score override", score = old → user-score, outcome = "User Override", takeaway = the user's reason verbatim).
3. From the next iteration, treat the user's score as the new baseline for "strictly higher."
4. Do NOT argue with or average against the user's score. They've seen something you haven't.

User overrides are the primary corrective for the "err low" failure mode — when you drift into inflation, the user pulls you back.

### User focus directives

The User Feedback section may also contain **focus directives** — entries that tell you which element category to work on (e.g. "work on mountains" or "fix BC river routing"). Directives are organized as a **priority queue** with two statuses: `Active` (exactly one at a time per style) and `Queued` (zero or more waiting behind Active).

**Queue semantics — strict order, no fallback to default while queue is non-empty:**

1. At the start of each iteration, read the Focus directives table for the target style. Identify the **Active** directive.
2. Every change this iteration must address the Active directive's category. Other gaps are deferred even if they look higher-leverage.
3. State the Active directive in each iteration's target line: `Target this iteration: wilderland (current score 3/10). Focus: mountains (Active, user directive 2026-04-22).`
4. When the Active directive's stop condition is met (e.g. mountains ≥ 7 per Turing-test standard, or user rescinds), do NOT revert to the default "highest-leverage" rule. Instead:
   - Edit the Focus directives table: mark the completed directive as `Done` with the iteration id that closed it, and promote the next `Queued` directive in date order to `Active`.
   - Log an iteration row announcing the handoff (change = "promote {next-category} directive to Active", outcome = "Queue advance").
   - The next iteration works on the newly-Active directive.
5. Only when the queue is empty does the default "highest-leverage next change" rule resume — and even then, notify the user in the log row that the queue has drained so they can add more directives if they want.
6. If you genuinely cannot find a meaningful change to try in the Active category — you've exhausted it before the stop condition is met — say so explicitly in the log and pause for the user to rescind, redirect, or lower the bar. Do NOT silently switch to a different category or promote a Queued entry ahead of schedule.

Focus directives are how the user steers the loop when they see a specific weakness the agent isn't prioritizing. The queue lets them schedule several weaknesses in order without having to babysit the handoffs.

### User-reported specific corrections / regressions

The User Feedback section may also contain a **Specific corrections / regressions** table — pointed items the user has observed as wrong or regressed (e.g. "river regressed from double-line to single-line"). These are not score overrides or focus directives; they're targeted bug reports. Any open entry **blocks score advancement** for the affected style regardless of other progress. Before declaring the style improved in a new iteration, check for open entries in the scope you're iterating on:

1. At the top of each iteration, scan the Specific corrections table for any open entry matching your target style.
2. If an open entry exists, that entry takes priority over both your "highest-leverage" default AND the active focus directive (unless the two happen to align — e.g. a river regression paired with a "work on rivers" directive).
3. Fix the specific correction in the next iteration. When the user confirms the fix, they will close the entry (or tell you to).
4. Do not mark a correction closed yourself. Only the user closes them.

Open corrections are the user's way of saying "this is broken right now, don't keep building on a broken foundation."

### Iteration naming

**All iterations use a two-letter style prefix + zero-padded number:** `ti-NN` (thirdage), `wl-NN` (wilderland), `ml-NN` (moonletters), `di-NN` (dragonisles). No bare integers, no `wl-pre` suffixes. A rolled-back attempt still gets the next sequential number — it's a logged iteration even if it was stashed. The log, the scoreboard's "Last iteration" column, and commit messages all use this naming.

### Loop steps

1. Confirm the working tree is clean (`git status` shows no uncommitted changes from the previous iteration).
2. Pick the target style per the rule above. State it: `Target this iteration: {style} (current score {N}/10).`
3. **BEFORE** the code change, capture a "before" screenshot of the current render (see Verification Protocol below). This is the baseline for the comparison.
4. Make ONE focused code change (normally in the target style's module; if in `viewer/core.js`, flag it explicitly — scoring rule below).
5. Capture an "after" screenshot of the render per the Verification Protocol.
6. **Execute the full Verification Protocol** (next section) — NO exceptions, NO shortcuts. If any step is skipped, the iteration is void and must be redone. The protocol's output is the input to scoring.
7. Rate 1-10 based on what the **Verification Protocol** surfaced, not what you think the code should produce. Err low.
8. **Decide:**
   - **Style-module change:** target style's score strictly higher than prior → `git commit` the change and merge it into the main branch. Equal or lower → `git stash` to roll back (ties count as rollback).
   - **core.js change:** target style must strictly improve AND no other style may regress. If any style drops, roll back. This is how we prevent shared-code fixes from silently breaking other styles.
   - Drop the stash before the next iteration so the tree is clean.
9. **Append to `docs/style-tuning-log.md`** — one row per iteration, kept OR rolled back. Template:
   `| N | target-style | brief change description | score before → after | Kept / Rolled | one-sentence takeaway |`
   Include the screenshot file paths (before + after + reference) in the takeaway so the user can spot-check. The takeaway is the critical part: what did you *learn* from this experiment? Rolled-back rows must be logged too — that's what prevents the next iteration (or next session) from re-trying a failed experiment.
10. Update the running scoreboard at the top of `style-tuning-log.md` with the new score(s). This is the input to step 2 of the next iteration.
11. Every 10 iterations, distill the takeaways into the **Patterns** section at the top of `style-tuning-log.md` — heuristics like "hatching density ≤ 0.6 for all styles; thirdage peaks need base-to-height ratio near 1:2; wilderland trees lose character below 3 foliage scribbles per trunk." This is what turns the loop from grinding into learning.
12. Pick the single highest-leverage next change for the *next* iteration's target style. No bundled changes.

## Verification Protocol — IRON-CLAD, NO EXCEPTIONS

**This is the single most-violated rule in the spec.** The agent will try to skip it by visually inspecting the code, reasoning about what the SVG should look like, or recalling the reference image from context. All three are failure modes that lead to false scoring and user overrides. The protocol below is mechanical and checkable — deviation is an iteration-voiding error.

### Required artifacts per iteration

Every iteration MUST produce three image files, all referenced by path in the iteration's log row:

1. `tmp/screenshots/{iter-id}-before.png` — the render before this iteration's change (e.g. `tmp/screenshots/wl-30-before.png`).
2. `tmp/screenshots/{iter-id}-after.png` — the render after this iteration's change.
3. A reference-image path — the source art file for the target style (e.g. `viewer/style-references/wilderland.jpg`), usually cropped to the element being worked on and saved as `tmp/screenshots/{iter-id}-ref-crop.png`.

If focused on a specific element (e.g. mountains), crop all three images to that element's region so the comparison is apples-to-apples. Use PIL for cropping (sips has surfaced as unreliable — see Patterns).

### Required tool calls per iteration, in order

These are the exact tool calls. Do not substitute, do not reorder, do not skip.

1. Start a headless render: `python3 -m http.server 8787` (or confirm it's running).
2. Capture the before image with Playwright/Puppeteer to `tmp/screenshots/{iter-id}-before.png`.
3. Make the code change.
4. Capture the after image the same way, to `tmp/screenshots/{iter-id}-after.png`.
5. Crop the reference image to the region being compared (PIL).
6. **Read all three images into context in a single assistant turn:**
   - Read `tmp/screenshots/{iter-id}-before.png`
   - Read `tmp/screenshots/{iter-id}-after.png`
   - Read the reference crop image
   All three Read calls must appear in the same assistant turn. "I'll check the reference later" is a protocol violation.
7. Only AFTER all three images are in context, write the verification observations.

### Required observation output (must appear in the iteration's log row takeaway)

After the three Reads, you MUST produce this block — copy the template literally, fill in the bracketed parts:

```
Verification (iter {iter-id}):
- before image: tmp/screenshots/{iter-id}-before.png — [describe what you see, two features minimum]
- after image:  tmp/screenshots/{iter-id}-after.png  — [describe what you see, two features minimum]
- reference:    {reference path} — [describe what you see at the same features]
- Concrete pixel-level diff between after and reference: [named feature] — mine: [observation], reference: [observation], gap: [measurable]
- Change from before to after: [what visibly changed; must be describable in a single sentence]
- Could an independent reader looking at these three images reach the same score I did? [yes + why / no + what I'm inferring]
```

If any bracketed section says "I think" or "probably" or "should be" without citing a specific pixel-level observation, the verification is incomplete and the iteration is void.

### What voids an iteration (must be redone)

- Writing observations before reading all three images in the same turn.
- Describing the reference from memory instead of reading the file in the current turn.
- Skipping the before image and comparing only after vs reference (can't tell if the change did anything).
- Claiming "the SVG code now does X, so the render must look like X" without capturing the actual screenshot.
- Saying "visually inspected" without the three image Reads being present in the transcript for that iteration.
- Deferring the reference read to "next iteration."

If you catch yourself about to do any of these, stop and redo. A voided iteration does NOT count toward the score; do not log it as a kept change.

### Why this is written this way

The agent has historically skipped verification by reasoning about the code instead of looking at the render. When pushed, it admits the skip and acknowledges the self-score was wrong. This protocol removes the ability to skip: the iteration cannot progress to scoring without the three image Reads in the current turn, and the log must name all three file paths for user spot-check. "I looked at it" is not evidence; the file paths in the log are evidence.

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

## Town-interior water routing

When a river or stream passes through a settlement node (a heart, fortress, or any other populated point), it should visibly enter, traverse, and exit the town footprint — not be drawn as a through-line that ignores the town interior. This applies to all four styles; the exact line weight and ink follow each style's palette, but the routing convention is universal.

**Specific case — Blackwater Crossing:** the Blackwater River enters BC at the town's **northern edge**, runs **south** through the town, then bends **east** and exits at the town's **east edge**. The river should be visible inside the town footprint along that L-shaped path, with the road/bridge crossings drawn where the river intersects the Old Northern Trade Road. A render where the river appears to skip over or around BC is wrong.

General rule: for any settlement node that shares a hex with a river path, the river must be routed through the node's footprint with a coherent entry and exit trajectory. Entry and exit points should match the river's direction in adjacent hexes (the river doesn't teleport). If the campaign data specifies a directional flow inside a node (as BC does), honor it.

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
- **Compass rose:** yes — top-left corner. Don't miss it on inventory (a first pass is easy to mis-describe as "no compass rose" because the edge-label strips dominate). Render it in the same ink weight as the rest of the wilderland line work.
- **Edge-label strips:** in addition to the compass, directional labels run along the outer frame: "Western Lands", "Edge of the Wild", "Hobbiton." These are supplementary to the compass, not a replacement for it.
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
- **Frame:** ~~ornate Celtic interlace border running around all four edges~~ **OUT OF SCOPE per user directive 2026-04-23.** Do NOT iterate on the Celtic knot border, the corner interlace bands, or any other external frame decoration. Any existing frame code can remain if it's harmless, or be removed if it simplifies the render — but no iteration effort goes here. The user's priority is the **map body**, not the external decoration.
- **Compass rose:** top-left corner, elaborate — a sword-and-dagger motif inside a circular knotwork medallion. Not a simple star; it reads as a piece of heraldry. No N/E/S/W letters.
- **Title cartouche:** top-right, scroll-banner style with serifed all-caps: "LEGENDS of the DRAGON ISLES". The Basilisk subtitle, if used, sits below the main title in smaller italic caps.
- **Region labels:** red, large, spaced small-caps, curving with territory shape: SEPULCHRE, BELERION, HRIVLYGGDOR, ULFSKEPTYR, ALGLÖNDER, KITANIA, ROCHIR PLAINS, HARADJIA, DÖRRAZUM, SURUINEN, plus sea names (THE DRAGON SEA, THE TRACKLESS SEA). These names are canonical and appear in the Basilisk off-map arrows.
- **Settlement labels:** two tiers — *major cities* in red italic-caps (Aelenthar, Nan-Avathar, Ashenrise, Dorthonia, Madrigal, Aquila, Akkar); *minor settlements* in small black italic (Kyrgar, Torretta, Danketar, Highpört, etc.). Each has a tiny red castle/town glyph next to the label.
- **Mountains:** Baynes-style zigzag peaks with heavy hatched shading — very similar to thirdage, but at world-map zoom level so individual peaks are smaller and ranges span long sweeps.
- **Forests:** dense clusters of individual tree drawings, wilderland-like in character but tighter and smaller at this zoom.
- **Seas:** mostly empty parchment with thin rule marks indicating water, populated by small decorative elements — ships with red sails, sea serpents, a tentacled monster in the lower-left, compass-rose ray lines radiating across open water.
- **Ships & creatures:** hand-drawn ship sprites (some with red sails), sea serpents, kraken — these are part of the style's character and should be preserved, not removed. For the Basilisk campaign, these are analogous to the "out-of-scope" POI markers elsewhere, but on dragonisles the decorative sea-life is part of the *style* and should be maintained
- **Compass-rose ray lines:** faint radial lines fanning from the compass rose across the open-sea areas — a distinctive Celtic-map device. Easy to miss; include them.

Because dragonisles is a world map and Basilisk is a regional map, the dragonisles style rendering of the Basilisk data should either (a) zoom out to show where Belerion/Blackwater Crossing sits inside the Dragon Isles and name neighboring regions that currently appear as off-map arrows, or (b) render the Basilisk region with dragon-isles styling but at world-map density conventions. Confirm which with the user before iterating heavily.

**User scope directive (2026-04-23):** on dragonisles, focus iteration on the **map body** — terrain (mountains, forests, rivers, coastlines), settlements, place names, sea decorations, region labels. **External/frame elements are deprioritized.** That means the Celtic border is out of scope (above), and any work on the corner compass medallion or scroll cartouche should be secondary to map-body fixes. When picking the "single highest-leverage next change," restrict the candidate set to map-body elements until the user changes this directive.

#### Moon-letter behavior (moonletters.js only)

Moon-letters are the defining feature of this style. They are **mirrored/inverted red Cirth glyphs** that, in lore, appear only when the correct moon's light falls on the map. Rendering requirements:

- Render moon-letter glyphs in red, horizontally mirrored (or the appropriate Cirth moon-letter form), distinct from the ordinary blue runes.
- Provide a reveal mechanism: a visibility toggle keyed to moon phase (or a URL param like `?moon=waxing-crescent`) that shows/hides moon-letter text. Default state hides them (they're secret).
- When hidden, moon-letters should be completely invisible — no faint outline, no placeholder. The lore is that without the right moon you literally cannot see them.
- Place moon-letters at map locations tied to the Basilisk campaign's secrets (Vault of First Light, Tunnels Beneath Blackwater, etc.) — the content is campaign-specific, the typography is Thror's-Map-specific.
- The ordinary (non-moon) Cirth rune block stays blue and is always visible.

## Reporting template per turn

```
Iter {iter-id} ({target-style}, prior score {Z}/10)
Active directives: [score overrides | open corrections | focus directives — or "none"]
Change: [what you did, one sentence]

Verification (from Verification Protocol):
- before image: tmp/screenshots/{iter-id}-before.png — [two features you see]
- after image:  tmp/screenshots/{iter-id}-after.png  — [two features you see]
- reference:    {reference-path} — [same two features, described]
- Concrete pixel-level diff (after vs reference): [named feature] mine [observation], reference [observation], gap [measurable]
- Change visible in before→after: [one sentence]
- Independent reader would reach my score: [yes + why / no + what I'm inferring]

Score: {Y}/10 (integer). Decision: Kept | Rolled back | Voided (verification incomplete).
Gap to 10: [highest-leverage miss, one sentence].
Next change: [one thing, to be executed in the next iteration — not this one].
```

**The verification block is mandatory.** A report without it is a protocol violation and the iteration is voided. No score advancement, no commit — redo with the images in context.
