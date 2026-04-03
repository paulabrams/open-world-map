Rebuild the point-crawl map JSON for the **$ARGUMENTS** campaign.

**Step 1: Query the database.**
Use the open-world MCP tools with campaign="$ARGUMENTS":
- `list_thoughts` type "campaign", campaign "$ARGUMENTS" (get campaign metadata)
- `list_thoughts` type "point", campaign "$ARGUMENTS", limit 50
- `list_thoughts` type "path", campaign "$ARGUMENTS", limit 50
- `search_thoughts` query "location OR place OR point", campaign "$ARGUMENTS", limit 50 (catch mis-typed thoughts stored as "observation" etc.)

**Step 2: Parse each thought into the graph schema.**

For each POINT thought, extract:
- `id`: slugified name (lowercase, hyphens, e.g. "blackwater-crossing")
- `name`: the place name as written
- `point_type`: infer from content — "heart" (starting town), "fortress", "tavern", "settlement", "wilderness", "dungeon", "sanctuary", "tower", "ruin", "waypoint", "lair"
- `terrain`: infer from content — "plains", "forest", "mountains", "swamp"
- `visible`: true (default; GM will set false manually for hidden points)
- `description`: the full thought content
- `scale`: "local" if the place is inside another place (e.g. a tavern inside a town), omit otherwise
- `parent`: the parent place ID if scale is local, omit otherwise

For each PATH thought, extract:
- `source` and `target`: slugified IDs of the two connected points
- `name`: the path/road name
- `days`: travel time in days (parse from content — "half a day" = 0.5, "about 2 days" = 2, etc.)
- `path_type`: "road", "trail", "wilderness", or "river" (infer from content)
- `terrain_difficulty`: "easy", "tough", or "perilous" (infer from content)
- `visible`: true (default)

**Step 3: Merge with existing layout.**
If `maps/$ARGUMENTS.json` already exists, preserve `x_hint` and `y_hint` values for existing nodes (these are hand-tuned positions). New nodes get `x_hint: 0, y_hint: 0`.

**Step 4: Check for orphans.**
Every node must be reachable via at least one link. Flag orphan nodes but still include them. Skip links that reference non-existent nodes.

**Step 5: Write the JSON.**
Write to `maps/$ARGUMENTS.json`:

```json
{
  "meta": { "campaign": "...", "world": "...", "region": "...", "era": "..." },
  "nodes": [{ "id", "name", "point_type", "terrain", "visible", "description", "x_hint", "y_hint" }],
  "links": [{ "source", "target", "name", "days", "path_type", "terrain_difficulty", "visible" }]
}
```

**Step 6: Serve the map.**
Start the web server in the background (kill any existing one on port 8787 first):

```sh
lsof -ti:8787 | xargs kill 2>/dev/null; cd maps && python3 -m http.server 8787 &
```

**Step 7: Export SVGs.**
Use Playwright to open each of the four map styles in a headless browser, wait for the map to render, then extract the SVG and save it to the `maps/$ARGUMENTS/` directory (create it if it doesn't exist). The filename should be `{campaign}-{style}.svg`.

For each style, use the `exportSVG()` function built into the page — or extract the SVG element directly — and write the result to disk:

- `http://localhost:8787/original.html?map=$ARGUMENTS.json` → `maps/$ARGUMENTS/$ARGUMENTS-original.svg`
- `http://localhost:8787/treasuremap.html?map=$ARGUMENTS.json` → `maps/$ARGUMENTS/$ARGUMENTS-treasuremap.svg`
- `http://localhost:8787/wilderland.html?map=$ARGUMENTS.json` → `maps/$ARGUMENTS/$ARGUMENTS-wilderland.svg`
- `http://localhost:8787/world.html?map=$ARGUMENTS.json` → `maps/$ARGUMENTS/$ARGUMENTS-world.svg`

**Step 8: Report.**
Summarize: nodes added/removed/updated, links added/removed/updated, orphans flagged. List the exported SVG files. Then link the user to:

http://localhost:8787/viewer.html?map=$ARGUMENTS.json
