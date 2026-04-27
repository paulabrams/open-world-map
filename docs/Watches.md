# Watches — Travel Time Model

How the painted map computes overland travel time. Replaces the older "days
per hex" / "hours per hex" formulations.

## The unit

A **watch is 6 hours**. A 24-hour day is 4 watches:

- Watch 1 — dawn (sunrise → 12:00)
- Watch 2 — afternoon (12:00 → dusk)
- Watch 3 — evening / first night (dusk → midnight)
- Watch 4 — late night (midnight → dawn)

In play, a typical adventuring day is **2 productive watches** of marching
(dawn to dusk, ~12h on the road) followed by camp. Pushing past two watches
is *forced march* and costs hit points.

## Per-hex cost

Hexes are 6 miles across. Path type carries the speed advantage; off-trail
terrain is binary (normal vs. perilous):

| Path / terrain | Hexes / watch | Hours / hex |
| --- | ---: | ---: |
| **Road** | 3 | **2** |
| **Trail** *(future — needs a `trail_path` array)* | 2 | **3** |
| **Off-trail** — plains, forest, hills, desert, tundra, … | 1 | **6** |
| **Off-trail in mountains / swamp / jungle** | ½ | **12** |

Roads and trails *cap* their hexes at the listed cost regardless of the
underlying terrain (a flat ceiling, no multiplier). So a road through swamp
is still 2h/hex; only when a swamp hex is *off-trail* does it grind to 12h.

A consequence: leaving a road into open prairie costs you — plains are
6h/hex *off-trail*. The road's value isn't only "road through forest";
it's that the road exists at all on a route that would otherwise be
trackless.

## Edge cost in the travel graph

The route finder builds an undirected graph keyed by hex code. An edge
between two hexes costs the **average** of their per-hex hours. Road edges
override that to a flat 2h. So:

- two road hexes: 2h (= 1/3 watch)
- plains → forest: (2 + 3) / 2 = 2.5h
- forest → mountain: (3 + 6) / 2 = 4.5h
- mountain → swamp: 6h

A whole route is the sum of its edge costs.

## Daily plan + forced-march cost

Total route hours are converted to watches (rounded to the nearest half) and
distributed across days at the chosen pace. Each watch past **2 in a single
day** costs **1d6 HP per PC**. Costs reset by a full night's rest.

| Pace | Watches/day | Cost per long day |
| --- | ---: | --- |
| Safe | 2 | 0 |
| Push (into the night) | 3 | 1d6 |
| Forced (all-day all-night) | 4 | 2d6 — hard cap |

A day at the *Safe* pace ends at dusk; *Push* runs 6h into night; *Forced* is
24h continuous and ends in collapse without rest.

## UI / display

The route midpoint label reads:

```
<watches>w · <days>d [· <cost>d6]
```

Examples:

- `4w · 2d` — four watches over two safe days, no cost.
- `5w · 2d · 1d6` — five watches squeezed into two days at Push pace; one of
  the days had three watches → 1d6 HP cost.
- `1w · 1d` — short hop, fits in a single morning watch.

Sub-watch totals (e.g. 0.5w for a single road hex) display as `0.5w`. The
internal computation stays in hours; only the label rounds to the nearest
half-watch.

## Worked examples

### Blackwater → Thornespire Keep (Safe)

Path the route finder picks: 1010 (plains) → 0911 (forest) → 0810 (forest)
→ 0709 (forest) → 0708 (forest) → 0707 (forest) → 0707 (forest) → 0704
(forest). The exact hex chain depends on the graph; assume ~5 forest hops
plus 1 plains hop.

- 1 plains edge: 2h
- 5 forest-forest edges: 5 × 3 = 15h
- Total: ~17h ≈ 3 watches → **3w · 2d at Safe** (one day has two watches,
  the other has one — both safe).

### Swamp (0504) → Thornespire Keep (0704)

- 0504 (swamp) → 0604 (forest): (6 + 3) / 2 = 4.5h
- 0604 (forest) → 0704 (forest): (3 + 3) / 2 = 3h
- Total: 7.5h ≈ 1.5 watches → **1.5w · 1d at Safe**.

### Merchant on the Old Northern Trade Road

Six road hexes dawn → dusk:

- 6 × 2h (road cap) = 12h = exactly 2 watches → **2w · 1d at Safe**.

This is the canonical "left at sunrise, arrived by sunset" trip.

## Pace examples

A 5-watch journey (e.g. Blackwater → some far hex):

- Safe (2/day): **3 days**, 0 HP cost (2 + 2 + 1).
- Push (3/day): **2 days**, 1d6 HP (3 + 2; the 3-watch day costs 1d6).
- Forced (4/day): **2 days**, 2d6 HP (4 + 1; the 4-watch day costs 2d6).

A 7-watch journey:

- Safe: **4 days**, 0 HP.
- Push: **3 days**, 1d6 HP (3 + 3 + 1; one of the 3-watch days costs 1d6 —
  but the *single* d6 is for the day that pushed; both 3-watch days cost
  1d6 each, totalling **2d6**).
- Forced: **2 days**, 2 × 2d6 = 4d6 HP (4 + 3 → 2d6 + 1d6).

(The cost calculator sums per-day costs across the whole journey, so longer
trips at aggressive paces compound.)

## Endpoint quirk (intentional)

Edge cost averages the two hexes' per-hex hours. Mathematically that gives
each *interior* hex a full hex's worth of time (½ from the edge before, ½
from the edge after) — but it gives each *endpoint* hex only ½ a hex of
time. Yet the route line is drawn from hex centre to hex centre, so a
trip that touches N hexes really crosses N-1 hex widths of ground.

In practice this **slightly under-counts** travel inside the start and end
hexes — and that's fine. Departing a settlement at dawn realistically eats
extra time (saddling up, last errands, leaving the gate); arriving in the
afternoon involves slowing down, finding lodging, dealing with the city
watch. The model's missing half-hex on each end is a reasonable proxy for
that bookkeeping. We could fix it (add half a hex of cost at each
endpoint, or +1h flat per journey) but the natural slack reads as fiction
rather than as a model error, so we don't.

## Why this works

- **Six-hour watches** divide cleanly into a 24h day and the OSR
  3-mph / 2-mph / 1-mph terrain bands give clean integer hex counts per
  watch (3 / 2 / 1).
- **Two productive watches** = a daylight day, matching how players intuit
  "leave at dawn, arrive by dusk."
- **1d6 per extra watch** keeps forced march painful but not lethal —
  enough to make the GM ask "are you sure?" without auto-killing.
- **Roads dominate plains for transit**: 6 hexes/day on roads vs. 6 hexes/day
  on plains too (both 2h/hex). The road's value isn't speed in the open;
  it's the cap when crossing forest or hills.
- **Mountains and swamp grind hard**: 1 hex per watch means a mountain pass
  costs a whole watch even on the best day. Two of them, plus a forest leg,
  fill an entire merchant's day.

## Files

- [`viewer/core-data.js`](../viewer/core-data.js) —
  `TERRAIN_HOURS_PER_HEX`, `HOURS_PER_WATCH`, `PACE_WATCHES`,
  `buildTravelGraph`, `findRoute`, `planRoute`, `formatWatchLabel`.
- [`viewer/painted.html`](../viewer/painted.html) — Pace dropdown, route
  click handlers (single-click sets start, shift-click finds + draws the
  route with a watch label at the midpoint).

## Future tweaks

- **Trail edges** could add +1 watch + a "lost" roll (Cairn 2E style) when
  off-road and unfamiliar.
- **Weather difficulty** could add +1 to +2 watches per day on bad-weather
  days.
- **Mounts / guides** could discount one tier of terrain difficulty.
- **Per-PC HP rolls** instead of a single party-wide d6 (currently the
  display shows `1d6` understanding the GM rolls per PC).
