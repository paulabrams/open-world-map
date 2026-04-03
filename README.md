# Open World

A point-crawl map system for TTRPG sandbox campaigns. Named places connected by paths, queryable via MCP, rendered as an SVG map with a Christopher Tolkien aesthetic.

The system uses a Supabase database (the `thoughts` table) as the source of truth, an MCP server for querying and capturing data, and a static HTML/SVG map viewer.

## Current Campaign: The Basilisk Campaign

Set in the Blackwater Crossing region of Belerion, Dragon Isles. 14 locations, 14 paths, 15 rumors, 3 completed journeys.

## View the Map

```sh
cd maps
python3 -m http.server 8787
open http://localhost:8787/viewer.html
```

The viewer is a standalone HTML file that reads a campaign JSON and renders the point-crawl graph as SVG. Zoom/pan with mouse. Click a node to see its description and connections.

Specify a map with the `?map=` param: `viewer.html?map=Basilisk.json`

## Rebuild the Map from the Database

The map JSON is rebuilt by querying the Supabase database via MCP tools. Run this in Claude Code (with the `open-world` MCP connected):

> Rebuild the Basilisk Campaign map JSON. Follow the instructions in `docs/rebuild-map.md`.

This will:

1. Query all points, paths, and campaign metadata from the database
2. Parse each thought into the graph JSON schema
3. Preserve existing `x_hint`/`y_hint` positions from the current file
4. Write the updated JSON to `maps/Basilisk.json`

See [rebuild-map.md](docs/rebuild-map.md) for the full prompt and schema reference.

## Correct Map Data

Corrections should update **both** the database (via MCP) and the JSON so they stay in sync.

**Fix a place description or metadata:**

> The description for Thornespire Keep is wrong. Update it to: "..." Save the correction to the database using `capture_thought`, then rebuild the map JSON.

**Add a new location:**

> Add a new point: "Raven's Perch is an abandoned watchtower on a hilltop northeast of Thornespire Keep." Capture it to the database using `capture_thought`, then rebuild the map JSON.

**Add or fix a path:**

> Add a path: "A trail leads from Thornespire Keep to Raven's Perch, about half a day through tough forest terrain." Capture it to the database using `capture_thought`, then rebuild the map JSON.

**Fix a mis-typed thought in the database:**

> Search for "The Old Forest" in the database. It is typed as "observation" but should be "point". Recapture it with the correct content.

**Adjust map layout (positions only):**

Edit `x_hint` and `y_hint` values directly in the campaign JSON file. These are relative coordinates that seed the force layout. No database change needed -- positions are a rendering concern, not data.

## Project Structure

```
open-world-map/
  CLAUDE.md                    # Claude Code context
  README.md                    # This file
  docs/
    Open-World-Map.md          # Full spec
    rebuild-map.md             # Rebuild prompt and schema reference
  maps/
    viewer.html                # Map viewer (standalone HTML + D3.js)
    Basilisk.json     # Graph data (nodes + links)
```

## Architecture

- **Database:** Supabase `thoughts` table with embeddings. Every map entity (point, path, rumor, journey, campaign) is a thought with a `thought_type` in metadata.
- **MCP Server:** `open-world-mcp` Edge Function. Tools: `capture_thought`, `search_thoughts`, `list_thoughts`, `thought_stats`.
- **Map Viewer:** Static HTML file. Loads JSON, runs D3.js force layout, renders SVG. Christopher Tolkien aesthetic: cream parchment, black ink, red serif labels, profile mountain/tree symbols.
- **Build Step:** Claude Code prompt that queries the DB via MCP and outputs the graph JSON. No build tooling required.
