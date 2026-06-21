# New Map

<!-- markdownlint-disable MD013 MD022 MD024 MD026 MD032 MD036 MD049 -->

## Objective

Let a GM create a brand-new campaign map from the viewer when running against the local dev server. The GM enters a campaign/region name, a world name, and a biome, and picks a size (small / medium / large). The system scaffolds a fresh `maps/<campaign>/<campaign>.json`, seeds a small playable starting area — an origin settlement plus the six adjacent hexes, each with terrain and a point of interest — captures a `campaign` record (and the seeded points) to Supabase, and opens the new map. Size sets only the origin hex coordinate (small `1010`, medium `2020`, large `5050`), which determines how much room the world has to grow outward before running out of coordinate space; it does **not** pre-fill an explorable region.

Beyond the explored flower, the seeder also scatters a few *distant landmarks* — prominent features a party would see from afar but hasn't visited: mountain ranges / hills (terrain in unexplored hexes, which render through the fog), the occasional town/fortress/tower silhouette, and rivers extended up- and down-stream from any flower hex that has one. These hexes stay unexplored (fog) — only the landmark itself shows. This gives a new map a horizon to head toward without revealing content. The feature is invisible in production (GitHub Pages) — it only appears when `/api/health` confirms a local backend.

## Why Now

Today the only way to start a campaign is to hand-author a JSON file and a DB record. That friction means the system effectively serves one campaign (Basilisk). Making map creation a first-class, in-viewer action turns this from a single-campaign artifact into a reusable point-crawl tool — the GM names a region, gets a seeded starting flower in seconds, and immediately explores outward with the existing Explore/Generate pipeline. If it doesn't ship, every new map remains a manual, error-prone file-and-DB chore only the developer can do.

---

## Priority Queue

> Items ship top-down. Position is priority — no labels, no estimates.

### Backend: create-map endpoint

A `POST /api/create-map` endpoint that, given `{campaign, world, biome, size}`, creates `maps/<campaign>/` and writes a valid `<campaign>.json` containing meta, an origin settlement node, and the six adjacent flower hexes — each with a terrain and one POI. Content is authored by the existing `/api/generate-hex` AI pipeline when `aiEnabled`, and by a procedural generator (seeded by `biome`) when AI is unavailable. Reuses `safeWriteJsonAtomic` and the subhex/`x_hint` math. Refuses to overwrite an existing campaign directory.

**Done when:** `curl -X POST /api/create-map` with a fresh name produces a directory and a JSON file that loads cleanly in `painted.html?map=<name>` showing exactly 7 hexes — a visible origin settlement at the origin hex plus 6 adjacent hexes each carrying terrain and one POI — and nothing beyond the flower. Re-posting the same name returns 409 instead of clobbering. Works with the AI backend off (procedural content) and on (AI content).

### Backend: capture campaign + points to Supabase

After the JSON is written, capture a `campaign` thought to the open-world MCP (mirroring the best-effort `captureToMcp` pattern in `apiGenerateHex`), plus the origin node and the 6 flower POIs as `point` thoughts, and the 7 flower hex terrains as `terrain` thoughts (CLAUDE.md: hex terrain lives in the DB as `terrain` thoughts *and* in `hex_terrain` — keep both in sync). Distant-landmark terrain/structures are unexplored flavor and are **not** captured to the DB until the party explores them. Failures here are logged but do not fail the request — the JSON is already on disk.

**Done when:** creating a map produces a `campaign` thought discoverable via `list_campaigns`, seeded POIs findable via `search_thoughts`, and the flower terrains present as `terrain` thoughts; an MCP outage still leaves a working local JSON map.

### Frontend: "New Map" entry point

A "New Map" control on the landing page (`viewer/index.html`) that appears **only** when `/api/health` reports a reachable local backend. It opens a small modal collecting name, world, biome, and size (small/medium/large), POSTs to `/api/create-map`, shows progress while the area is seeded, and on success navigates to `painted.html?map=<name>`.

**Done when:** on GitHub Pages the control is absent; against the dev server it is present, validates the name, creates the map, and lands the GM on the new playable map. The size control communicates that it sets growing-room (not initial extent), so the GM isn't surprised that all sizes open to the same 7-hex flower. Name collisions and backend errors surface a readable message rather than failing silently.

### Distant landmarks + river continuation

> Lowest priority — an enhancement; the map is fully usable without it. Cut first if capacity runs out.

After seeding the flower, scan a ring or two beyond it and probabilistically place *distant landmarks* that read as a horizon:
- **Terrain landmarks** (mountains, hills, forested-hills): set the hex's `hex_terrain` and add it to `hex_unexplored`. Renders through fog with no renderer change (terrain is not gated by exploration; only nodes/POIs are).
- **Structure landmarks** (town / fortress / tower): place a node flagged `landmark: true` and exempt landmark nodes from the unexplored-node filter at `painted.html:891` so the stamp shows while the hex stays fogged (no label, no panel detail). **(Decision A — see Risks.)**
- **River seeding + continuation**: a flower starts with no river, so the seeder must first decide whether this map *has* a river — biome-driven (e.g. a `river`/`coast`/`swamp` biome routes a river through the origin hex; arid biomes usually don't). If a river is seeded through the flower, extend `river_path` a few hexes up- and down-stream into the fog (river rendering already spans unexplored hexes). If no river is seeded, skip continuation. The river hex(es) inside the flower stay explored; the extensions are fog.

**Done when:** a freshly created map shows, beyond the 7 explored hexes, a handful of fogged hexes carrying a visible mountain range and/or a distant structure silhouette and/or a river trailing off the flower — and clicking those fogged hexes still shows the generic "Unexplored" panel (no leaked POI detail). With this item cut, the map is still valid and playable (flower only).

---

## Constraint Architecture

### Musts

- The "New Map" affordance is gated on a live `/api/health` check (`r.ok`), exactly like the server-only controls in `painted.html` and `rumors.html`. No local backend → no entry point.
- Campaign name is validated to `^[A-Za-z0-9_-]+$` (the regex `apiGenerateHex` already enforces) and used verbatim as the directory name and the `?map=` value.
- Creating a map must never overwrite or merge into an existing `maps/<name>/` directory (return 409).
- The generated JSON must satisfy the schema in CLAUDE.md / `docs/rebuild-map.md` and load through `MapData.loadData` without the malformed-JSON recovery path firing.
- Seeded **explored** content is **exactly** the origin hex + its 6 adjacent hexes (`hexNeighbors(origin)`) — 7 hexes total, all explored, each with terrain. The origin hex's node is the campaign home base (`point_type: heart`, named after the campaign); each of the 6 neighbor hexes gets exactly one POI. (≤7 nodes total: 1 heart + ≤6 neighbor POIs.)
- Flower **terrain** is always assigned by the biome-weighted procedural step, even when AI is enabled; AI authors only the POI for each hex (the AI pipeline takes the hex's terrain as input). This keeps terrain coherent with the chosen biome regardless of backend.
- Any hexes seeded **beyond** the flower (distant landmarks) must stay in `hex_unexplored` and must not carry an explored POI — only a terrain value and/or a `landmark:true` node. Clicking them shows the generic Unexplored panel.
- Distant landmarks are restricted to the prominence whitelist (locked): terrain ∈ {`mountains`, `hills`, `forested-hills`}; structure `point_type` ∈ {`fortress`, `tower`, `settlement`, `heart`}. No other terrain or point_type is eligible as a distant landmark.
- Structure landmarks render via Decision A: a `landmark:true` node exempted from the unexplored-node filter (`painted.html:891`), with its label suppressed and its hex panel kept generic-Unexplored.
- Size maps to origin hex deterministically: small→`1010`, medium→`2020`, large→`5050`. All three are even-column, matching the `BC_COL = 10` parity the renderers and `hexNeighbors` assume — keep it that way so the flower offsets stay correct.
- Map creation must succeed with the AI backend **off**: a procedural generator (seeded by the chosen `biome`) produces terrain and generic POIs.
- Keep DB and JSON in sync (CLAUDE.md rule): capture the campaign and seeded points to Supabase.
- `meta` carries `campaign`, `world`, and `biome` from the form. (`biome` is a new meta field; it also drives terrain selection.)

### Must-Nots

- Must not expose map creation in production / on GitHub Pages.
- **Must not fabricate a surrounding region of hexes to make small/medium/large look different.** Identical-looking sizes at creation is the intended behavior — size is growing-room, not initial extent. The distant landmarks are a fixed flavor scatter, not size-scaled; don't grow them with size to differentiate.
- Must not reveal distant-landmark hexes (must stay fogged) or attach a real explored POI/label/description to them — a landmark is a silhouette, not a visited place.
- Must not place so many landmarks that the fog fills with clutter — a *handful*, not a populated region (see Preferences for the cap).
- Must not write outside the repo's `maps/` tree (respect the `REPO`-prefix path guard).
- Must not block the HTTP response on the MCP capture — DB writes are best-effort, after the file write succeeds.
- Must not silently truncate, default, or "fix" an invalid campaign name — reject it and tell the user.
- Must not invent schema fields beyond the two this spec adds — `meta.biome` and `node.landmark` (boolean); reuse `meta`, `nodes`, `links`, `hex_terrain`, etc. as otherwise defined.

### Preferences

- Reuse `/api/generate-hex` for the flower content when AI is available, so seeded content matches the look and tone of explored content; the procedural generator is the fallback, not the default.
- The procedural generator should produce biome-coherent terrain (e.g. a "desert" biome favors `plains`/`hills`/`mountains`, a "coast" biome favors water-adjacent terrains) rather than uniform-random.
- Distant landmarks: cap at roughly 2–4 per map, scanned within ~2 rings beyond the flower, biased toward prominent terrain (mountains/hills) over structures. River continuation ~2–4 hexes each direction. Tunable — keep them sparse so the fog still reads as unknown.
- Prefer one endpoint call that scaffolds the whole flower over chatty per-hex client calls, so a dropped connection can't leave a half-created map.
- Keep the create modal lightweight (name, world, biome, size) — don't expand it into a full meta editor.

### Escalation Triggers

- If AI seeding partially fails (some flower hexes return no POI): ship the map with terrain on every hex and POIs where they succeeded, and log which hexes came up empty — do not fail the whole creation, and do not silently leave a hex with no terrain.
- If the chosen origin's flower would push any hex to a col/row ≤ 0 or a non-4-digit code, stop and ask rather than clamping. (Note: `1010`'s flower spans `0909`–`1111`, so all three defaults are safe — this guards future size options.)
- If `biome` is a value the generator doesn't recognize, fall back to a neutral terrain mix and log it rather than erroring.
- If a distant-landmark scan rolls a hex that collides with the flower or an already-placed landmark, skip it rather than overwriting — landmarks are best-effort flavor, not a guaranteed count.

---

## Failure Modes

Things that would be "technically correct but wrong":

- **A new map that opens to an empty void.** Valid JSON that loads, but no origin settlement and bare flower hexes with no POIs — the GM stares at blank terrain. The point of seeding is an immediately *playable* starting area.
- **An eager implementer "fixes" the identical-size problem.** Seeing that small/medium/large open to the same 7 hexes, the implementer adds a size-scaled fog region or extra hexes to make sizes feel different. That directly violates the design — size is headroom only. (This reverses an earlier draft of this very spec, hence the explicit Must-Not.)
- **Procedural content that ignores the biome.** The no-AI path generates a snowy tundra flower for a "desert" map. The biome field must actually steer terrain, or it's decorative.
- **Silent production exposure.** The control leaks onto GitHub Pages because the gate checks a build flag or URL instead of an actual `/api/health` round-trip, letting a public visitor POST to a non-existent endpoint and see an error.
- **DB drift on day one.** JSON written but no `campaign` thought captured, so `list_campaigns` doesn't know the map exists and the first map already violates DB-is-source-of-truth.
- **Clobbering Basilisk.** A name collision overwrites a real campaign's JSON and DB records instead of returning 409.
- **A slow create with no feedback.** Seeding 7 hexes through the AI takes seconds; if the UI just hangs the GM assumes it broke and double-submits, racing the directory creation.
- **Off-anchor origin mis-frames the view.** A `5050` origin sits far from the `(0,0)` Basilisk anchor; if the renderer centers on `(0,0)` instead of the data bounds, a large map opens looking empty/off-screen.
- **Landmark leaks its hex.** A distant fortress is placed but its hex is accidentally explored (or the landmark node carries a full description that the panel surfaces), so the GM reads detail about a place the party has never been — defeating the "horizon, not content" intent.
- **Fog clutter.** The landmark scan is too generous and the surrounding fog fills with silhouettes, making the new map look pre-populated rather than mostly-unknown.

---

## Out of Scope

> Each promotable to its own spec.

### Map deletion / rename
Removing or renaming a campaign (directory + DB records) is a separate, riskier operation.

### Campaign picker / multi-map landing UX
A landing page that lists all `maps/*` campaigns dynamically (today `index.html` hardcodes the cards). This spec adds one create entry point; auto-discovery is its own change.

### Full pre-filled / explorable regions
Seeding an *explorable* region beyond the flower (revealed hexes with POIs, biome maps, coastlines). Explicitly cut: explored content stays the 7-hex flower; the world grows via Explore. (Distant *unexplored* landmarks — §"Distant landmarks" — are in scope and are not this.)

### Full meta editor
Editing `meta` (world/biome/era) after creation, or collecting more than name/world/biome up front.

---

## Risks and Open Questions

### Size has no visible effect at creation — is that confusing?
By design, small/medium/large all open to the same 7-hex flower; they differ only in how far the world can grow before coordinates run out. A GM may not understand why "large" looks identical to "small." **Mitigation:** the modal labels size as growing-room (e.g. "how much room the world has to expand"), not initial map size. Confirm the wording lands; this is the subtlest part of the UX.

### Procedural generator quality.
The no-AI path must produce terrain + generic POIs that are coherent and not obviously placeholder. How rich the procedural POIs need to be (a name? a one-line description? a `point_type`?) is the main judgment call. **Proposed:** procedural POIs get a `point_type`, a generic name from a biome-themed list, and a short description — enough to render and be replaced later. Confirm the bar.

### Biome → terrain mapping is undefined.
`meta.biome` is new and must map to the existing `terrain` vocabulary (`plains`, `forest`, `mountains`, `swamp`, `hills`, `forested-hills`, `farmland`, …). The set of biomes the modal offers and each one's terrain weighting needs defining. **Proposed:** start with a small fixed biome list (e.g. temperate, forest, desert, coast, mountains, swamp) each mapping to a weighted terrain set. Confirm the list.

### Off-anchor origin framing.
For `2020`/`5050` the origin node's `x_hint`/`y_hint` are `hexCenterInches(origin)`, **not** `(0,0)` — the coordinate system is anchored at Basilisk `1010`. Need to verify the painted renderer frames on data bounds (`landBounds`) so a non-BC origin still centers correctly.

### Structure-landmark rendering: A vs B. — RESOLVED: A.
Mountains/hills (terrain) and rivers render through fog with **no renderer change**. Towns/fortresses/towers are *nodes*, which `painted.html:891` hides for unexplored hexes. **Decision (locked): A** — add a `landmark:true` node flag and exempt such nodes from that filter, rendering the stamp while the hex stays fogged (no label/panel). Rejected B (mark the hex explored) because it leaks POI detail, violating horizon-not-content. Implementer note: A touches the `:891` filter and must keep the label layer + click panel generic for landmark hexes.

### How "prominent" maps to seeding. — RESOLVED.
Prominence whitelist (locked): terrain landmarks = `mountains`, `hills`, `forested-hills`; structure landmarks = `fortress`, `tower`, `settlement`, `heart`. Everything else (caves, ruins, taverns, dungeons, lairs, waypoints, sanctuaries, swamp/plains/farmland terrain) is **not** eligible as a distant landmark.

### Concurrency / double-submit.
A multi-second create invites double-clicks. Need a disabled-while-pending state; the directory-existence 409 covers the worst case server-side.

---

## Comms

> Personal TTRPG tool — GTM/Tenant slots are n/a (per spec-eng home-project guidance). The two team slots are written at their lifecycle transitions.

### I Intend To
_(written at `20-intended/`)_

### I Shipped
_(written at `60-shipped/`)_

### GTM Announcement
_n/a_

### Tenant Announcement
_n/a_

---

## Review

### Pre-Implementation

**Before starting implementation:** Answer "Is this the correct spec?" below. Argue for and against. Fix typos; do not implement features yet.

**Verdict (2026-06-18): Correct, after fixes applied below.** The spec is internally consistent and self-contained; one contradiction and three gaps were found and fixed in-place.

**For (why it's the right spec):**
- The constraint architecture pins the genuinely contentious decisions (flower-only seeding, size = headroom, identical-looking sizes intended, Decision A, the prominence whitelist) — exactly the "technically correct but wrong" traps that would otherwise sink it.
- It's grounded in verified code behavior: the fog filter strips only nodes (not terrain/rivers), so the landmark feature is mostly free and the spec says so with line references.
- Scope is honestly tiered: the landmark item is explicitly cut-first, so the MVP (flower + DB + UI) can ship alone.

**Against (residual risks, accepted):**
- The "size has no visible effect" UX is inherently confusing; mitigated by modal wording but not eliminated. Accepted — it's the user's deliberate design.
- The procedural generator's content quality is unproven; bar is set in Risks but only validated at implementation.

**Issues found and fixed:**
1. **Contradiction (fixed):** Must-Nots forbade new schema fields beyond `meta.biome`, but the landmark feature adds `node.landmark`. Amended the Must-Not to permit both.
2. **Gap — orphaned river continuation (fixed):** the flower had no mechanism to *have* a river, so "extend the river" could never fire. Added biome-driven river *seeding* through the origin as the precondition.
3. **Gap — DB terrain sync (fixed):** CLAUDE.md requires hex terrain to live in the DB as `terrain` thoughts, but the capture step only saved campaign + point thoughts. Added flower-terrain capture; explicitly excluded unexplored landmark terrain.
4. **Ambiguity — who picks flower terrain (fixed):** clarified terrain is always biome-procedural (even with AI on); AI authors only the POI, since the generate-hex pipeline takes terrain as input.

**Remaining open (non-blocking, in Risks):** procedural POI richness bar; the biome list + terrain weightings; off-anchor origin framing verification. These are tunable at implementation and don't change the spec's shape.

### Post-Implementation

**After finishing implementation:** Answer "Is this the correct implementation?" below. Review code vs spec, argue for and against, fix tightly-scoped bugs only.

---

## Agent Technical Context

> Humans: stop reading here.

### Current architecture

- **Server detection** (the gate): `viewer/painted.html:791-802` and `viewer/rumors.html:299-305` both `fetch("/api/health", {cache:"no-store"})`; `r.ok` ⇒ `serverAvailable`, `j.aiEnabled` ⇒ AI features. Replicate this exact pattern on `viewer/index.html`, which currently has **no** server detection. `/api/health` returns `{ ok, aiEnabled, backend, model }` (`apiHealth` in `tools/dev-server.mjs`).
- **Routing**: `tools/dev-server.mjs:516-526` — string-prefix `if (url.startsWith("/api/...") && req.method === "POST")` dispatch. Add `if (url.startsWith("/api/create-map") && req.method === "POST") return apiCreateMap(req, res);`.
- **Path safety**: `serveStatic`/`serveFile` enforce `filePath.startsWith(REPO)` (`:99`). New writes must stay under `maps/`.
- **Persistence helpers to reuse**:
  - `safeWriteJsonAtomic(file, data)` (`:474`) — atomic JSON write.
  - `appendNodeToCampaign(campaign, hex, parsed)` (`:435`) — reads/creates the campaign JSON, assigns a random subhex via `pickSubhex()` (`:427`), computes `x_hint`/`y_hint` from `SUBHEX_OFFSET_INCHES` + `hexCenterInches(hex)` (`:406-426`), node id `hex-<hex>-<subhex>`. Reusable for seeding flower POIs.
  - `captureToMcp({campaign, hex, parsed})` (`:212`) — best-effort `claude -p` MCP capture. Mirror for the `campaign` thought and each seeded point.
  - `apiGenerateHex` (`:250`) — the AI pipeline (system+user prompt → `runClaudeCli`/`runAnthropicApi` → parse JSON → persist → MCP). Factor its generate-one-location core so `apiCreateMap` can call it per flower hex without duplicating prompt logic. The seam: a function taking `{campaign, hex, terrain, biome, ...}` and returning a parsed `{name, point_type, terrain, description}` object.
- **Schema**: `meta{campaign,world,region,era}` (add `biome`), `nodes[]`, `links[]`, `hex_terrain{CCRR:terrain}`, `hex_unexplored`, `hex_encounters`, `hex_rumors`, `river_path`, `road_path`, `off_map_arrows`. Canonical example: `maps/Basilisk/Basilisk.json`. Empty baseline: `MINIMAL_GRAPH()` in `core-data.js:480`. Note: **no** `hex_unexplored` entries are created at map creation — the flower is fully explored and there is no surround.
- **Hex math**: `hexNeighbors(hex)` (`core-data.js:383`) gives the 6 flower neighbors; offset table depends on `(col % 2) !== (BC_COL % 2)` with `BC_COL = 10`. Origins 1010/2020/5050 are even-column ⇒ same parity as BC ⇒ neighbor offsets `[[0,-1],[1,-1],[1,0],[0,1],[-1,0],[-1,-1]]`. `hexCenterInches` (server, `:416`) converts hex→position. Origin node's `x_hint`/`y_hint` = `hexCenterInches(origin)` — `(0,0)` only when origin is `1010`. The painted renderer frames on data bounds via `landBounds` (`painted.html:811`); verify a non-BC origin centers correctly.
- **Loading**: `MapData.loadData(campaign)` fetches `../maps/<campaign>/<campaign>.json` (`core-data.js:436`).
- **Exploration / fog model** (critical for distant landmarks): `hex_unexplored` is an array of `CCRR` strings (`painted.html:1976-1992`, persisted via `/api/toggle-unexplored`). The unexplored filter at `painted.html:890-891` (`.filter(n => !n.hex || !isHexUnexplored(n.hex))`) strips **only nodes/POIs** from unexplored hexes. **Base terrain is NOT gated** — terrain stamps render regardless of exploration, so a `mountains` hex in `hex_unexplored` shows its range through the fog with no code change. Encounters are also hidden for unexplored hexes (`:1158`). The Unexplored panel is generic terrain-only (`:2030-2048`).
- **River/road rendering is NOT gated by exploration**: drawn from `river_path` / `road_path` arrays (`painted.html:1762,1876`; `core-data.js:160,191`). Basilisk's `river_path` spans `0503`→`1613` across the whole map. Extending a new map's river = appending up/down-stream `CCRR` hexes to `river_path`.
- **Structure-landmark hook (Decision A)**: to show a town/fortress node through fog, add a `landmark` flag to the node and change the `:891` filter to `.filter(n => !n.hex || n.landmark || !isHexUnexplored(n.hex))`. Verify the click handler (`:902-906` → `selectHexAndOpenPanel`) and label layer still treat the hex as unexplored (no leaked detail) — likely needs the landmark's label suppressed and the panel kept generic.
- **`terrain` vocabulary** (for biome mapping): `plains`, `forest`, `mountains`, `swamp`, `hills`, `forested-hills`, `farmland`, etc. (CLAUDE.md / `thought-schema.ts`). `point_type` vocabulary: `heart, fortress, tavern, settlement, wilderness, dungeon, sanctuary, tower, ruin, waypoint, lair`.

### Implementation approach

1. **`apiCreateMap(req, res)`** in `dev-server.mjs`:
   - Parse `{campaign, world, biome, size}`. Validate `campaign` against `/^[A-Za-z0-9_-]+$/`; map `size` → origin (`small:1010, medium:2020, large:5050`).
   - Refuse if `maps/<campaign>/` exists → 409.
   - Build a `MINIMAL_GRAPH`-shaped base; set `meta = {campaign, world, biome}` (region/era optional).
   - Origin: assign the origin hex a biome-weighted terrain; create the home node (`point_type: heart`, name = campaign) there.
   - Flower: for each of `hexNeighbors(origin)` — assign a biome-weighted terrain (always procedural), then author one POI: if `aiEnabled`, the factored generate-one-location core (pass the hex's terrain + `biome`); else the procedural POI generator. Write terrain into `hex_terrain` and the node into `nodes`.
   - Optionally seed a river through the origin (biome-driven); record its flower hex(es) in `river_path`.
   - `safeWriteJsonAtomic`.
   - Best-effort MCP: `captureToMcp` a `campaign` thought + each seeded point + each flower hex's `terrain` thought.
   - Respond `{ created:true, campaign, url:"painted.html?map=<campaign>", aiUsed:<bool>, emptyHexes:[...] }`.
2. **Procedural generator** (new helper): given `biome`, return `{terrain, poi}` from a biome→weighted-terrain table and a biome-themed name/description list. Keep it small and data-driven so biomes are easy to extend.
3. **Distant landmarks** (lowest-priority PQ item, after the flower works): after seeding the flower, scan hexes within ~2 rings beyond it (compute rings via repeated `hexNeighbors`). For each candidate, roll against a small probability; on hit, place either a prominent terrain (`mountains`/`hills`/`forested-hills` → `hex_terrain` + push to `hex_unexplored`) or a structure landmark (`fortress`/`tower`/`settlement` node with `landmark:true`, hex also in `hex_unexplored`). Cap at ~2–4 total. Then for each flower hex in `river_path`, extend the river ~2–4 hexes up/down-stream. Capture terrain to `hex_terrain` only (no explored POI). Implements Decision A's renderer hook above.
4. **`viewer/index.html`**: add the `/api/health` check on load; if `serverAvailable`, render a "+ New Map" card → modal (name, world, biome `<select>`, size radio) → POST → progress/disabled-while-pending → redirect to the returned `url`. Surface 409 / error messages inline.

### Rollout

Local-only feature; ships when merged. No flag beyond the `/api/health` gate. Verify on a GitHub Pages preview that the control is absent (no `/api/health` ⇒ fetch throws ⇒ control stays hidden).
