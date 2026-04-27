# Rebuild Map JSON

Run this prompt in Claude Code or Claude Desktop (with the open-world MCP connected) to rebuild the campaign map JSON from the database.

## Usage

1. Open Claude Code in the `open-world-map` project directory
2. Paste the prompt below
3. Claude will query the database, extract graph structure, and write the JSON file

---

## Prompt

```
Rebuild the point-crawl map JSON for the Basilisk Campaign from the Open World database.

**Step 1: Query the database.**
Use the open-world MCP tools to pull all data:
- `list_thoughts` with type "campaign" (get campaign metadata)
- `list_thoughts` with type "point" limit 50 (get all places)
- `list_thoughts` with type "path" limit 50 (get all connections)

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

**Step 3: Merge with existing overrides.**
Read the current `maps/Basilisk/Basilisk.json` file. For any node that already exists in the current file, preserve its `x_hint` and `y_hint` values (these are hand-tuned positions). For new nodes, set `x_hint` and `y_hint` to 0 (they'll need manual positioning).

**Step 4: Check for orphans.**
Every node must be reachable via at least one link. If a point has no corresponding path connecting it, flag it in a comment but still include it. If a path references a point that doesn't exist, flag it and skip the link.

**Step 5: Write the JSON.**
Output the complete JSON to `maps/Basilisk/Basilisk.json` in this exact schema:

{
  "meta": {
    "campaign": "...",
    "world": "...",
    "region": "...",
    "era": "..."
  },
  "nodes": [
    {
      "id": "slug",
      "name": "Display Name",
      "point_type": "heart|fortress|tavern|settlement|wilderness|dungeon|sanctuary|tower|ruin|waypoint|lair",
      "terrain": "plains|forest|mountains|swamp",
      "visible": true,
      "description": "Full text from DB",
      "x_hint": 0,
      "y_hint": 0
    }
  ],
  "links": [
    {
      "source": "node-id",
      "target": "node-id",
      "name": "Path Name",
      "days": 1.5,
      "path_type": "road|trail|wilderness|river",
      "terrain_difficulty": "easy|tough|perilous",
      "visible": true
    }
  ]
}

**Step 6: Report what changed.**
After writing the file, summarize: nodes added/removed/updated, links added/removed/updated, any orphan nodes flagged.
```
