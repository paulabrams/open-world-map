# Open World — Claude Code Context

## What This Is

Point-crawl map system for TTRPG campaigns. Supabase DB (thoughts table) + MCP server + static SVG map viewer.

Current campaign: **The Basilisk Campaign** (Blackwater Crossing region, Belerion, Dragon Isles).

## MCP Tools Available

- `capture_thought` — save a thought to the database
- `search_thoughts` — semantic search by meaning
- `list_thoughts` — list by type (point, path, rumor, journey, campaign)
- `thought_stats` — summary counts

## Key Files

- `docs/Open-World-Map.md` — full spec
- `docs/rebuild-map.md` — full rebuild prompt and schema reference
- `maps/*.html` — map viewers (wilderland, world, treasuremap, original styles)
- `maps/{campaign}/{campaign}.json` — graph data per campaign (e.g. `maps/Basilisk/Basilisk.json`)
- `maps/{campaign}/{campaign}-{style}.svg` — exported SVGs per campaign

## View the Map

```sh
cd maps && python3 -m http.server 8787
```
Then open http://localhost:8787/wilderland.html?map=Basilisk

## Rebuild the Map JSON

Use `/map Basilisk` or follow `docs/rebuild-map.md`. Short version:

1. `list_thoughts` type "point" (limit 50) + type "path" (limit 50) + type "campaign"
2. Also `search_thoughts` for any places that may be mis-typed (Old Forest is "observation", Serpent's Teeth is "path" — both should be "point")
3. Parse each thought into the graph schema (see rebuild-map.md for field mappings)
4. Read existing JSON and preserve `x_hint`/`y_hint` values
5. Write updated JSON to `maps/{campaign}/{campaign}.json`

## Correct Map Data

Always update **both** the database AND the JSON to keep them in sync:

1. **Fix content:** `capture_thought` with corrected text, then rebuild the JSON
2. **Add location/path:** `capture_thought` with new content, then rebuild the JSON
3. **Fix layout only:** Edit `x_hint`/`y_hint` directly in the JSON (no DB change needed)

## Graph JSON Schema

```
{ meta: { campaign, world, region, era },
  nodes: [{ id, name, point_type, terrain, visible, description, x_hint, y_hint }],
  links: [{ source, target, name, days, path_type, terrain_difficulty, visible }] }
```

- `point_type`: heart, fortress, tavern, settlement, wilderness, dungeon, sanctuary, tower, ruin, waypoint, lair
- `terrain`: plains, forest, mountains, swamp
- `path_type`: road, trail, wilderness, river
- `terrain_difficulty`: easy, tough, perilous
- `x_hint`/`y_hint`: position in inches relative to Blackwater Crossing (0,0). Positive x = east, positive y = south. Based on the hand-drawn 8.5"×11" campaign map.

## Known DB Issues

- "The Old Forest" is stored as type `observation` instead of `point`
- "Serpent's Teeth Crags" is stored as type `path` instead of `point`

Both are found via `search_thoughts` but missed by `list_thoughts(type="point")`.
