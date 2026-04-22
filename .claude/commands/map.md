Rebuild the point-crawl map JSON for the **$ARGUMENTS** campaign.

**Step 1: Query the database.**

Use the open-world MCP tools with campaign="$ARGUMENTS":

- `list_thoughts` type "campaign", campaign "$ARGUMENTS" (get campaign metadata)
- `list_thoughts` type "point", campaign "$ARGUMENTS", limit 50
- `list_thoughts` type "path", campaign "$ARGUMENTS", limit 50
- `search_thoughts` query "location OR place OR point", campaign "$ARGUMENTS", limit 50 (catch mis-typed thoughts stored as "observation" etc.)
- `search_thoughts` query "Map positions inches hex coordinates", campaign "$ARGUMENTS" (get the master position/hex list)

**Step 2: Parse each thought into the graph schema.**

For each POINT thought, extract:

- `id`: slugified name (lowercase, hyphens, e.g. "blackwater-crossing")
- `name`: the place name as written
- `point_type`: infer from content — "heart" (starting town), "fortress", "tavern", "settlement", "wilderness", "dungeon", "sanctuary", "tower", "ruin", "waypoint", "lair"
- `terrain`: infer from content — "plains", "forest", "mountains", "swamp"
- `visible`: true (default; GM will set false manually for hidden points)
- `description`: the full thought content
- `x_hint`, `y_hint`: inches from Blackwater Crossing (0,0). Look up from the master position thought. Positive x = east, positive y = south. New nodes with no position get `x_hint: 0, y_hint: 0`.
- `hex`: hex coordinate in CC.RR format (e.g. "10.10"). Look up from the master position thought. If not listed, calculate from x_hint/y_hint using the hex geometry (flat-top, size=50px, BC=col 10 row 10, colStep=75, rowStep=86.6).
- `scale`: "local" if the place is inside another place (e.g. a tavern inside a town), omit otherwise
- `parent`: the parent place ID if scale is local, omit otherwise

For each PATH thought, extract:

- `source` and `target`: slugified IDs of the two connected points
- `name`: the path/road name
- `days`: travel time in days (parse from content — "half a day" = 0.5, "about 2 days" = 2, etc.)
- `path_type`: "road", "trail", "wilderness", or "river" (infer from content)
- `terrain_difficulty`: "easy", "tough", or "perilous" (infer from content)
- `visible`: true (default)

**Step 3: Check for orphans.**

Every node must be reachable via at least one link. Flag orphan nodes but still include them. Skip links that reference non-existent nodes.

**Step 4: Write the JSON.**

Create the campaign directory if it doesn't exist, then write to `maps/$ARGUMENTS/$ARGUMENTS.json`:

```json
{
  "meta": { "campaign": "...", "world": "...", "region": "...", "era": "..." },
  "nodes": [{ "id", "name", "point_type", "terrain", "visible", "description", "x_hint", "y_hint", "hex" }],
  "links": [{ "source", "target", "name", "days", "path_type", "terrain_difficulty", "visible" }]
}
```

**Step 5: Serve the map.**

Start the web server in the background (kill any existing one on port 8787 first):

```sh
lsof -ti:8787 | xargs kill 2>/dev/null; cd maps && python3 -m http.server 8787 &
```

**Step 6: Export SVGs.**

Use Playwright to open each style in the unified viewer (`map.html`), wait for the map to render, extract `document.querySelector('#map').outerHTML`, and write to disk:

- `http://localhost:8787/map.html?map=$ARGUMENTS&style=dragonisles&grid=square` → `maps/$ARGUMENTS/$ARGUMENTS-grid.svg`
- `http://localhost:8787/map.html?map=$ARGUMENTS&style=dragonisles&grid=hex` → `maps/$ARGUMENTS/$ARGUMENTS-hex.svg`
- `http://localhost:8787/map.html?map=$ARGUMENTS&style=moonletters&grid=none` → `maps/$ARGUMENTS/$ARGUMENTS-moonletters.svg`
- `http://localhost:8787/map.html?map=$ARGUMENTS&style=wilderland&grid=none` → `maps/$ARGUMENTS/$ARGUMENTS-wilderland.svg`
- `http://localhost:8787/map.html?map=$ARGUMENTS&style=thirdage&grid=none` → `maps/$ARGUMENTS/$ARGUMENTS-thirdage.svg`

**Step 7: Report.**

Summarize: nodes added/removed/updated, links added/removed/updated, orphans flagged. List the exported SVG files. Then link the user to:

http://localhost:8787/map.html?map=$ARGUMENTS
