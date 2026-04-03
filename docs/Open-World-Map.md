
# Open-World-Map

## Objective

A point-crawl map system for Wåndyr sandbox campaigns. Players and GM share an online map of named places connected by paths — visible via a web viewer, queryable via Slack and MCP. The map grows through play: the GM generates content on demand, rumors drive exploration, and facts emerge at the table. The system replaces hex grids with a point-crawl where points are places, paths are journeys, and the world is built through play rather than before it.

## Why Now

Wandyr needs to be more about journeys. An overland/region map is crucial for that — players need to see where they are, what they know about, what rumors they've heard, and where the paths lead. Without this, sandbox campaigns lack spatial context and exploration feels aimless.

If this ships: every Wandyr campaign has a shared, beautiful, living map that players can access from anywhere.

If it doesn't: the GM continues hand-drawing maps that remote players can't see, and spatial knowledge stays in the GM's head.

---

## Priority Queue

> Items ship top-down. Position is priority — no labels, no estimates. Lower items may not ship if capacity is consumed by higher items.

### 1. ~~Open-World System — Database + MCP + Slack~~ DONE

Supabase database (Open Brain `thoughts` table), MCP server (Edge Function), and Slack integration — all deployed and working.

- Supabase project `open-world` with `thoughts` table, embeddings, and `match_thoughts` search function
- MCP server (`open-world-mcp`) with semantic search, list, stats, and capture tools
- Slack integration (`ingest-thought`) with capture + related-thought search in replies
- Connected to Claude Code and Claude Desktop via MCP

### 2. ~~Seed the Basilisk Campaign~~ DONE

Basilisk Campaign data loaded into Supabase via MCP. 40 thoughts total: 12 points, 8 paths, 15 rumors, 3 journeys, 1 campaign. All queryable via MCP semantic search.

### 3. Build the Map Graph

Extract graph data from the database and produce a structured file the map viewer can consume. This is the translation layer between unstructured thoughts and renderable map data.

- **Source format: YAML.** Human-readable, supports comments, GM can hand-edit. The YAML file is the authored source of truth for graph structure.
- **Runtime format: JSON.** Trivial conversion from YAML. Consumed directly by the web renderer (D3.js). Schema: `{ nodes: [...], edges: [...], meta: {...} }`.
- **Build step:** Query all thoughts for a campaign via MCP, classify by `thought_type`, extract graph structure from metadata (connects, days, terrain, visible), and output YAML. The GM can then adjust positions, add comments, or override auto-extracted values.
- **Layout:** Nodes have no stored coordinates in the database. The build step uses d3-force with weighted edge distances (`days * scale`) to compute initial x,y positions. The GM can override positions in the YAML for fine-tuning.

Example YAML structure:

```yaml
campaign: The Basilisk Campaign
nodes:
  - id: blackwater-crossing
    name: "Blackwater Crossing"
    point_type: heart
    terrain: plains
    visible: true
    # x, y: auto-computed by force layout, or hand-placed
  - id: thornespire-keep
    name: "Thornespire Keep"
    point_type: settlement
    terrain: forest
    visible: true
edges:
  - source: blackwater-crossing
    target: thornespire-keep
    name: "Old Northern Trade Road (north)"
    days: 1
    terrain_difficulty: tough
    path_type: road
    visible: true
```

**Done when:** A YAML graph file exists for the Basilisk Campaign, all 12 points and 8 paths are represented, and the file converts to valid JSON consumable by D3.js.

### 4. Map Viewer

Read-only web viewer hosted online, accessible via sharable URL with shortcode (no auth).

- **Rendering stack: D3.js + SVG.** No off-the-shelf fantasy map renderer accepts graph input — this is a custom rendering problem.
  - **D3.js** — SVG DOM manipulation and force-directed layout with weighted edge distances
  - **SVG path generation** — terrain icons (profile mountains, egg-shaped tree clusters) as procedural SVG paths, not raster assets. Paths use cubic beziers with slight randomization for hand-drawn feel.
  - **SVG filters** — `feTurbulence` for parchment texture background; optional `feDisplacementMap` for organic line wobble
  - **Christopher Tolkien aesthetic** — the specific target: black & white with **red labels** on cream paper. Profile mountains with solid black shadows, egg-shaped trees in clusters, double wave lines for ocean. Mixed perspective: top-down geography, side-view terrain features.
  - **Fonts** — Ringbearer (Tolkien movie style), Aniron, or a clean serif. Red for place names.
- SVG output for clean scaling and print
- Shows visible points, paths, active journeys, and rumors
- Fog of war: undiscovered points/paths are blank parchment
- Clicking a point shows its player-visible description, facts, and rumors
- **Terrain rendering is scoped for point-crawl, not full terrain generation.** Nodes get small iconic terrain vignettes (3-5 tree shapes for forest, 2-3 mountain peaks for mountains, wavy lines for water) — not dense polygon fills. Paths are SVG cubic beziers with stroke-style variation (solid for roads, dashed for trails, dotted for unknown, wavy for rivers).

**Done when:** Players can open a URL, see their campaign map rendered in the target aesthetic, click points to see details, and see active journeys highlighted.

### 5. On-Demand Content Generation

MCP supports generative queries — asking about an empty point triggers content creation.

- GM asks "what's at Blackwater Ford?" and gets generated content if nothing exists
- Generation is informed by campaign metadata (world, region, era) and surrounding points
- Follows Cairn 2E / OSR conventions for point content
- Generated content is saved to the database automatically

**Done when:** GM can query an empty point and get contextually appropriate content generated and persisted in one interaction.

---

## Key Concepts

**Point-crawl, not hex-crawl.** The map is a network of named places connected by paths. Points exist at two scales: regional points (days of travel apart) and local points (day trips from a regional point). Some landmarks are widely known or visible from a great distance — these are visible on the map from the start, even before players have visited them. The starting area is a Heart (e.g. a tavern) with regional points and paths radiating outward. The map expands organically.

**Points addressed by name, not coordinates.** Travel distance is expressed in **days** on paths. A day of travel is 12 hours. Terrain and path type determine how far a day gets you (road ~24 miles, forest/hills ~16 miles, mountains/jungle ~8-12 miles — per OSR consensus from B/X D&D and AD&D 1e). Paths store the number of days, not miles — players think "how many days to get there." Traveling beyond 12 hours is an ordeal with consequences handled by whatever ruleset is in play, not by Open-World. Edges carry all spatial information — no grid or coordinate system needed.

**Fog of war** is per-point and per-path, independently toggleable. Points, paths, and their visibility are all independent — any combination is valid. A visible path can connect to a hidden point ("there's a trail heading north, you don't know where it leads"). A hidden path between two visible points is a secret route. The GM controls all visibility manually; there are no automatic cascading rules.

**Facts and rumors.** Rumors are top-level campaign entities, not children of points. A rumor may reference points or paths by name but has no formal link to them — connections are inferred by the AI, not enforced by schema. Rumors are player-visible and drive exploration. When a rumor is resolved at the table (e.g. roll d6), the GM marks it resolved and manually applies consequences (creating points, revealing paths, changing descriptions) via MCP tools. Rumors do not carry structured "on_resolve" actions — this keeps the system simple and supports the low-prep ethos.

**Journeys** are "there and back again" — an origin point, a destination point, and a status. The route taken between them is emergent, determined at the table. Named, planned/active/completed, rendered as a highlighted connection on the map. Quests are just rumors that imply a journey.

**Low-prep workflow.** Wandyr is low-prep to no-prep. The primary GM workflow is on-demand generation: the party arrives at a point, the GM asks about it via MCP, content is generated if nothing exists. Querying and generating in one interaction, not requiring upfront population.

---

## Constraint Architecture

### Musts

- The map must be fully generated from the database — no image files, no manual assets. All map elements (points, paths, terrain) live in the DB. The viewer is a pure renderer.
- Points do not store x,y coordinates. The renderer determines layout from graph structure (nodes, edges, day-distances, terrain). SVG output for clean scaling.
- GM-only content (hidden points, GM notes, unrevealed paths) must never be returned in player responses.
- The architecture must use the Open Brain pattern **unmodified** — same `thoughts` table, same embeddings, same metadata extraction. Adapted as **Open-World**: Supabase (Postgres) database, Supabase Edge Functions as hosted MCP server, Slack as player/GM interface. "Open World" as the system name across all components.
- Map entities (points, paths, rumors, journeys, campaigns) are all thoughts with `thought_type` in metadata. Relationships are by name, not foreign keys. A separate build step generates structured graph data for the viewer.
- Each campaign owns its own thoughts. World, region, and era are metadata fields on the campaign thought (e.g. world: "Dragon Isles", region: "Belerion", era: "Year 412") — used to inform content generation, not shared data structures.
- Multiple campaigns supported per Open-World instance.
- Point and path content must follow established point-crawl/hex-crawl conventions from games like Cairn and the broader OSR tradition. Don't reinvent content generation.

### Must-Nots

- No authentication system — no logins, no accounts, no user management. Shortcode-only access for the viewer; token-based role access for MCP.
- No UI beyond the map viewer. No web app, no admin dashboard, no settings pages.
- No combat tracker, character sheets, inventory, session scheduling, session logs, dice rolling, or chat/messaging beyond Slack integration.
- No world-level map. Open-World operates at the campaign/regional level.
- The map must not look like a network diagram, flowchart, or spreadsheet. It must feel like an illustrated fantasy map.

### Preferences

- ~~Prefer off-the-shelf map/graph renderer if one can produce the target aesthetic. Fall back to custom-built only if needed.~~ **Resolved:** No off-the-shelf option exists. Custom renderer: D3.js + rough.js + SVG filters.
- Prefer the Tolkien Hobbit map aesthetic: ink on parchment, hand-lettered labels, mountains as side-view ridgelines, trees as simple clusters, rivers as flowing ink lines. Mostly monochrome. Undiscovered areas are blank parchment. Labels and names are the primary content.
- Prefer generating content that fits the campaign's world/region/era context over generic fantasy content.
- If geography needs to be reused across campaigns, prefer copying/regenerating over shared data structures.

### Escalation Triggers

- If the data model can't represent a core concept from the Basilisk Campaign (existing points, paths, rumors, journeys), stop and redesign before proceeding.
- ~~If no off-the-shelf renderer can achieve the Tolkien aesthetic, stop and discuss whether to build custom or adjust the aesthetic target.~~ **Resolved:** No off-the-shelf renderer accepts graph input. Building custom with D3.js + rough.js + SVG filters.
- If the MCP tool interface feels clunky or unnatural in Slack conversation (e.g. players can't query intuitively), stop and redesign the tool surface.

---

## Failure Modes

**Ugly map.** The map is functional but looks like a network diagram or a tech demo. Players don't engage with it because it doesn't feel like a fantasy map. This is the highest risk — the Tolkien aesthetic is the emotional core of the project.

**Data model too rigid.** The schema can't handle emergent play — rumors that become facts, points that spawn other points, journeys that change mid-travel. The system forces the GM into upfront planning instead of supporting low-prep play.

**MCP interaction is clunky.** The GM has to memorize tool names, use precise syntax, or navigate a complex API to do simple things. The Slack experience for players is confusing. Natural language should work — "what's near the tavern?" not "list_points --campaign basilisk --filter adjacent --origin laughing-basilisk".

**Over-engineered.** The system is technically impressive but too complex to set up, maintain, or explain to players. A home game tool should feel like a home game tool, not enterprise software.

**Content generation is generic.** Generated points feel like random fantasy generators — no connection to the campaign's world, region, era, or existing points. The lich's tomb could be in any setting. Content should feel like it belongs in this specific campaign.

---

## Out of Scope

> Each item here should be promotable to its own spec. This prevents scope creep.

### Combat and Mechanics

No combat tracker, initiative, dice rolling, or game mechanics. Wandyr already has oracles and tables for this.

### Character Management

No character sheets, inventory, XP, or player state. Characters exist in the game, not in Open-World.

### Session Management

No session scheduling, session logs, or play-by-play recording. Open-World is the map, not the campaign journal.

### World-Level Map

No multi-region overview or world atlas. Each campaign is a regional sandbox. A world map could be a future spec.

### Player Notes

Players writing annotations on points (stretch goal from ideation). Could be a future spec once the core is stable.

---

## Risks and Open Questions

### Tolkien Aesthetic Rendering

**Decision made:** Custom renderer using D3.js + SVG. No off-the-shelf fantasy map generator accepts graph input.

**Aesthetic target: Christopher Tolkien's Middle-earth map.** Black & white with red labels on cream paper. Profile mountains with solid black shadows, egg-shaped tree clusters, double wave ocean lines. Mixed perspective (top-down geography, side-view terrain features). This is the most analyzed style in procedural cartography.

**Scoped for point-crawl:** A point-crawl does not need dense terrain polygon fills. It needs: cream/parchment background, red labels (Ringbearer or clean serif font), simple iconic terrain symbols near nodes (3-5 trees, 2-3 mountain peaks), hand-drawn curved paths (SVG cubic beziers with slight randomization), and minimal coastline if relevant. This is a much tighter scope than full procedural terrain generation.

The remaining risk is execution: composing SVG terrain icons, path rendering, label placement, and parchment background into something that feels like a Tolkien map rather than a tech demo. This requires visual iteration, not additional technology choices.

**Key references for rendering technique:**
- **Here Dragons Abound** (heredragonsabound.blogspot.com) — the primary technical reference. SVG-native procedural fantasy map blog with deep dives on Tolkien-style rendering: egg-shaped tree generation (axis elongation), profile mountain rendering (solid black shadows), Poisson-disc sampling (Bridson's algorithm) for tree placement, red label typography. The "Lord of the Rings Map Style" post (October 2018) is the direct reference.
- **Red Blob Games mapgen4** — hand-drawn map generation with source code. Key insight: Tolkien maps use top-down perspective for rivers/coastlines but side-view for mountains/trees.
- **Azgaar's Fantasy Map Generator** (github.com/Azgaar/Fantasy-Map-Generator) — open-source SVG fantasy map in D3.js. Study for SVG structure, label placement algorithms, terrain rendering patterns.
- **Dyson Logos** (dysonlogos.blog) — TTRPG dungeon cartography reference. Useful for specific SVG primitives: cross-hatching (parallel lines at non-90° angles), stippling, 3-weight stroke hierarchy (thick borders, medium features, thin details). Not a regional map reference — Dyson's archive is primarily dungeons.
- **Cairn 2e / Into the Odd** — the point-crawl structural reference. Clean dots-and-lines with distance numbers on edges, minimal terrain vignettes. The achievable compositional target (Tolkien aesthetic applied to Cairn-style graph layout).

### Spatial Layout from Graph Data

**Decision made:** d3-force with weighted edge distances for initial layout, manual coordinate overrides in YAML for fine-tuning. Hybrid approach: auto-layout for drafting, manual refinement for publication.

Remaining risk: force-directed layouts balance competing forces, so distances are approximate, not exact. A 2-day path and a 5-day path will have roughly proportional lengths, but not pixel-perfect. Cola.js is the fallback if stricter edge-length constraints are needed. The bigger concern is making auto-layout results feel "geographic" (mountains to the north, river flowing southeast) rather than arbitrary — this may require directional hints in the YAML or manual adjustment for most campaigns.

### Content Generation Context

On-demand generation needs enough context to produce content that fits the campaign. The campaign's world, region, era, and surrounding points provide this — but how much context is enough? Too little produces generic output; too much is expensive and slow. The existing Wandyr worldbuilding (`project-context/Wandyr/`) and Cairn 2E generation patterns (`project-context/Cairn 2E - Region Generation Reference.md`) should inform the generation approach.

### Basilisk Campaign as Test Case

The Basilisk Campaign (Blackwater Crossing region) is the first real test of the data model. Existing assets at `project-context/Basilisk/`: hand-drawn map, map prompt spec, locations (Blackwater Crossing, Thornespire Keep, Old Forest, Serpent's Teeth Crags, Vault of First Light, etc.), rumors, and campaign logs. If the data model can't faithfully represent this existing campaign, it's wrong.

---

## Comms

### I Intend To

{Written when the spec moves to `20-intended/`.}

### I Shipped

{Written when the spec moves to `60-shipped/`.}

### GTM Announcement

N/A — home project.

### Tenant Announcement

N/A — home project.

---

## Review

### Pre-Implementation

**Before starting implementation:** Answer the question "Is this the correct spec?" and write the answers below this paragraph. Review the spec. Argue for and against this spec being correct. If the spec is correct, explain why. If the spec is not correct, explain why and suggest changes. If there are minor issues such as typos, fix them. Do not implement any large-scale changes or new features at this time.

#### Arguments that this spec is correct

1. **Priority sequencing is right.** Database + MCP + Slack first, viewer second, generation third. This validates the data model against real campaign data (Basilisk Campaign) before investing in the hardest part (rendering). If the data model is wrong, you find out cheap.

2. **The point-crawl model matches how the game actually plays.** The evolution from hex-crawl to point-crawl was driven by actual gameplay needs — Wandyr is about named places and journeys between them, not grid navigation. Cairn's own approach is essentially a point-crawl. The model fits the genre.

3. **Facts/rumors mechanic is well-designed for emergent play.** Rumors as top-level campaign entities, resolved freeform by the GM at the table — this is simple, flexible, and doesn't force pre-planning. The AI infers connections rather than requiring explicit foreign keys. Resolution is a two-step manual process (mark resolved, then apply consequences via MCP tools). No structured "on_resolve" actions — consistent with the low-prep ethos.

4. **The Open World architecture is proven.** Following an existing, working pattern (Supabase + Edge Functions + Slack) de-risks the infrastructure. The adaptation is straightforward — different tables, same architecture.

5. **Constraint Architecture is specific.** The escalation triggers are concrete and actionable. "If the data model can't represent the Basilisk Campaign, stop" is a real gate, not a platitude.

6. **Failure modes are grounded.** "Ugly map" as the #1 failure mode is correct — the aesthetic is the emotional core. The others (rigid data model, clunky MCP, over-engineering, generic generation) are all realistic ways this could go wrong even if technically correct.

7. **The data model is deliberately simple.** Five tables, no join tables, no cascade rules, no shared data layers. No stored coordinates — the renderer owns layout. Rumors and journeys are lightweight. This matches the low-prep ethos.

8. **Visibility model is clean.** Points, paths, and their visibility are fully independent with no cascading rules. Any combination is valid (visible path to hidden destination, secret path between known points). Simple, flexible, matches how exploration actually works.

9. **Travel in days is intuitive.** Replacing Watches with days removes jargon. A day is 12 hours. Path distances in fractional days (0.5, 1, 2.5) are immediately understandable. Miles-per-day by terrain follows established OSR consensus.

#### Arguments that this spec is incorrect or incomplete

1. **No mention of how the Basilisk Campaign data gets ingested.** The Done-when for item 1 says "Basilisk Campaign data is loaded and queryable" but the spec doesn't describe the ingestion process. Is it manual entry via MCP? A bulk import script? The GM feeding session notes to the AI and having it extract points? This should be clarified as a sub-task within item 1.

2. **The Key Concepts section is non-standard.** The spec template doesn't include it. The content is valuable and well-placed — it serves as a glossary for the rest of the spec. Acceptable deviation for this project.

3. **The `prompt kit` files still reference "Open World" naming.** The spec says to follow the Open World pattern and adapt as Open-World. The actual prompt kit files in `dev/prompt kit/` may have already been partially renamed (the user did a find/replace earlier). Verify file names match references before starting implementation.

4. **Terrain type on points vs. paths.** Points have `terrain_type` and paths have `terrain_difficulty`. These are related but separate concepts — a point is "in the mountains" while a path "through the mountains" has perilous difficulty. The relationship is clear in context but not explicitly stated. An executor might wonder whether terrain_difficulty on a path should be derived from endpoint terrain_types or set independently.

#### Status

All issues are minor. #1 is a missing sub-task. #3 is a file-naming consistency check. #4 is an implicit convention that could be made explicit. The spec is ready for implementation.

### Post-Implementation

**After finishing implementation:** Answer the question "Is this the correct implementation?" and write the answers below this paragraph. Review the implemented code vs the spec. Argue for and against this implementation being correct. If the implementation is correct, explain why. If the implementation is not correct, explain why and what a correct implementation would look like. If there are tightly-scoped bugs then fix them. Do not implement any large-scale changes or new features at this time.

---

## Agent Technical Context

> Humans: stop reading here. Everything below is optimized for Claude Code.

### Architecture

Use the Open Brain pattern **unmodified** — same `thoughts` table with id, content, embedding, metadata (jsonb), created_at, updated_at. Follow the setup guide at `prompt-kit-open-world/Build Your Own Brain Steps - Full.md`.

- **Supabase project:** `open-world`
- **Edge Functions:** `open-world-mcp` (MCP server), `ingest-thought` (Slack integration — unchanged from Open Brain)
- **Slack app:** "Open World"
- **Database:** single `thoughts` table (Open Brain schema, unmodified)

### Data Model

The `thoughts` table is the single source of truth. Every map entity is a thought with a `thought_type` in metadata. Some thoughts are nodes in the graph, some are edges, some are neither.

**Nodes** (points on the map):

- `thought_type`: "point"
- metadata: `{point_type: "heart|settlement|waypoint|curiosity|lair|dungeon", scale: "regional|local", parent: "name of parent point", terrain: "forest|mountains|plains|...", visible: true|false, campaign: "The Basilisk Campaign"}`
- content: the description ("Blackwater Crossing — a walled town at the bridge over the Blackwater River")

**Edges** (paths between points):

- `thought_type`: "path"
- metadata: `{connects: ["Point A name", "Point B name"], days: 2, terrain_difficulty: "easy|tough|perilous", path_type: "road|trail|wilderness", visible: true|false, campaign: "The Basilisk Campaign"}`
- content: the description ("Old Northern Trade Road — a well-traveled road through the Old Wood")

**Rumors:**

- `thought_type`: "rumor"
- metadata: `{resolved: false, resolved_as_fact: null, campaign: "The Basilisk Campaign"}`
- content: the rumor text ("They say there's a lich beneath Thornspire Keep")

**Journeys:**

- `thought_type`: "journey"
- metadata: `{origin: "Point A name", destination: "Point B name", status: "planned|active|completed", campaign: "The Basilisk Campaign"}`
- content: the journey name/description ("The Road to Thornspire")

**Campaigns:**

- `thought_type`: "campaign"
- metadata: `{shortcode: "bsk1", world: "Dragon Isles", region: "Belerion", era: "Year 412", gm_token: "...", player_token: "..."}`
- content: the campaign name and description

All relationships are by name in metadata, not foreign keys. Semantic search works across all thought types. The AI infers connections from content and metadata.

### Build Step

A separate process reads all thoughts for a campaign via MCP (`list_thoughts` filtered by type), classifies them, extracts graph structure from metadata, and outputs a YAML file. The YAML is the authored source of truth; it converts trivially to JSON for the renderer.

**Pipeline:** MCP query → extract nodes/edges → d3-force layout (weighted by `days`) → YAML with computed x,y → GM hand-adjusts if needed → convert to JSON → renderer consumes.

The build step can run on demand ("rebuild the map") or on a schedule. It produces the graph with: nodes (points with positions), edges (paths with day-distances and terrain), and overlays (rumors, journeys, fog of war).

### Graph File Formats

**Why YAML (source) + JSON (runtime):**

- YAML is human-friendly for a GM to read, edit, and annotate with comments. JSON is not (no comments, verbose).
- JSON is natively consumed by D3.js and all JS renderers. Zero parsing overhead.
- The conversion is trivial (js-yaml or any YAML parser).
- Custom schema (`{ nodes: [...], edges: [...] }`) gives maximum flexibility without fighting format assumptions.

**Formats evaluated and rejected:**

| Format | Why not |
| --- | --- |
| GraphML | XML verbosity, painful to hand-edit, no native JS consumption |
| DOT/Graphviz | Locks into network-diagram aesthetics, no custom rendering |
| GeoJSON | Requires real coordinates, overkill for abstract graph topology |
| GEXF | Verbose XML, only sigma.js has native support |

### Rendering Stack

**D3.js + SVG, Christopher Tolkien aesthetic scoped for point-crawl.**

No off-the-shelf fantasy map renderer accepts graph input. Custom rendering required, but the scope is narrow for a point-crawl — five elements, not full terrain generation:

| Element | Technique |
| --- | --- |
| Cream/parchment background | SVG `feTurbulence` filter on `<rect>`, or radial gradient from `#f4e8d1` to `#d4c4a0` |
| Red serif labels | Ringbearer or clean serif font, `fill: #8b2500` (dark red-brown, not bright red) |
| Mountain/tree symbols near nodes | Procedural SVG paths — profile mountains (inverted-V with solid black shadow side), egg-shaped trees (circle with elongated y-axis). 2-5 per node as terrain flavor. Reference: Here Dragons Abound blog. |
| Hand-drawn curved paths | SVG cubic beziers (`C` command) with slight endpoint randomization. Stroke style varies: solid for roads, dashed for trails, dotted for unknown, wavy for rivers. |
| Coastline (if relevant) | Heavy black line with double wave decorative lines offshore. |

**Color palette:**

- Background: `#f4e8d1` (cream parchment)
- Primary ink: `#2a1f14` (warm near-black, not pure `#000000`)
- Labels: `#8b2500` (dark red-brown — the Tolkien red)
- Water: `#2a1f14` (black, same as ink — Tolkien maps don't use blue)
- Secondary detail: `#5a4a3a` (lighter brown for minor lines)

**Layout:** d3-force for initial auto-layout from edge weights (`forceLink().distance(d => d.days * scale)`), with optional hand-placed coordinates in the YAML for fine-tuning.

**D3.js input format:** `{ nodes: [...], links: [...] }`. Nodes have `id` (string), custom properties preserved. Links have `source`/`target` (string IDs matching node `id`), custom properties preserved. After simulation, D3 mutates `x`, `y`, `vx`, `vy` onto node objects and replaces `source`/`target` strings with object references. Use `forceLink().id(d => d.id)` for string ID lookup.

**Rendering pipeline (layer order):**

1. Background (cream parchment + texture filter)
2. Coastlines (if any)
3. Paths/edges (SVG bezier paths with stroke-style variation)
4. Terrain symbols (mountains, trees near nodes)
5. Nodes (small circles or icons by point_type)
6. Labels (red serif text)
7. Distance markers (day numbers on mid-edge)
8. Fog of war overlay (omit hidden elements, or parchment-colored cover)
9. Journey highlights (active journeys as emphasized path segments)

**Alternatives considered and rejected:** Cytoscape.js (canvas, not SVG), sigma.js (WebGL overkill), vis.js (canvas), rough.js (double-stroke jitter is wrong aesthetic — Tolkien maps are precise ink, not sketchy). Cola.js remains a fallback if d3-force distance proportionality is too imprecise.

### Travel Reference

A day of travel is 12 hours. Distance per day by terrain (OSR consensus):

| Terrain | Miles/Day | Examples |
| --- | --- | --- |
| Road | ~24 | Trade roads, highways |
| Clear/Plains | ~24 | Open grasslands, farmland |
| Forest/Hills/Swamp/Desert | ~16 | Moderate terrain |
| Mountains/Jungle | 8-12 | Difficult terrain |

Encumbrance, weather, and party composition can reduce these further — handled by the game rules, not by Open-World.

### MCP Tools

**GM tools (read/write):**

- `create_campaign` — returns shortcode, gm_token, player_token
- `create_point` / `update_point` / `delete_point`
- `create_path` / `update_path` / `delete_path`
- `add_rumor` / `resolve_rumor`
- `create_journey` / `update_journey`
- `set_visibility` — toggle fog of war on points/paths
- `query_map` — full read access, including GM notes and hidden content

**Player tools (read-only):**

- `query_map` — filtered to visible points/paths, player descriptions, unresolved rumors
- `get_journey` — view active/completed journeys

### Rumor Resolution Workflow

Resolving a rumor is a two-step process, both done by the GM via MCP:

1. `resolve_rumor` — marks the rumor as resolved (true or false)
2. GM manually applies consequences using other tools — `create_point`, `update_point`, `set_visibility`, `create_path`, etc.

No automated side effects. The GM decides what happens.

### Key References

All paths relative to project root (`/Users/paul/git/open-world/`).

- Open World setup guide: `prompt-kit-open-world/Build Your Own Brain Steps - Full.md`
- Cairn 2E generation tables: `project-context/Cairn 2E - Region Generation Reference.md`
- Cairn 2E Warden's Guide PDF: `project-context/Cairn 2E/Cairn_2E_Wardens_Guide.pdf`
- Basilisk Campaign (symlink): `project-context/Basilisk/`
  - Campaign map sketch: `project-context/Basilisk/Campaign Map/Basilick Campaign region map.png`
  - Campaign map spec: `project-context/Basilisk/Campaign Map/Basilisk Campaign map prompt.md`
  - Locations: `project-context/Basilisk/Locations/` (Blackwater Crossing, Thornespire Keep, Old Forest, Serpent's Teeth Crags, Vault of First Light, etc.)
  - Rumors: `project-context/Basilisk/Rumors/`
  - Campaign logs: `project-context/Basilisk/Campaign Log/`
- Wåndyr TTRPG system (symlink): `project-context/Wandyr/`
  - Rule PDFs: `project-context/Wandyr/docs/`
  - Dev notes: `project-context/Wandyr/dev/`

<!-- markdownlint-disable MD013 MD024 -->
