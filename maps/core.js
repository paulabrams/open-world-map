// === Open World Map — Core Module ===
// Shared utilities, data loading, simulation, rendering orchestrator.

window.MapCore = {};
window.MapStyles = {};
window.MapGrids = {};

// --- Constants ---
const HINT_SCALE = 100; // 1 unit = 1 inch on the hand-drawn 8.5x11 map
const DAY_SCALE = 100;
const FONT = "Palatino, 'Palatino Linotype', 'Book Antiqua', 'Times New Roman', serif";

// --- Terrain types that are interior locations (not shown on overland map) ---
const INTERIOR_TERRAINS = new Set(["town", "city", "village", "keep", "stronghold", "castle", "ruin-interior", "underground"]);

// --- OSR travel time per 6-mile hex (off-road, unencumbered on foot) ---
// Based on B/X D&D Expert Set / 5e PHB normal-pace conventions: clear ground
// moves ≈24 mi/day (4 hex/day), difficult terrain halves speed, mountains
// and swamp halve again. Roads apply ROAD_MULTIPLIER (≈33% faster → matches
// the Basilisk campaign convention of ½ day per hex on the Old Northern
// Trade Road through forest).
const TERRAIN_DAYS_PER_HEX = {
  "plains":          0.25,
  "grassland":       0.25,
  "clear":           0.25,
  "farmland":        0.25,
  "desert":          0.5,
  "hills":           0.5,
  "forest":          0.75,
  "forested-hills":  1.0,
  "old-forest":      1.0,
  "jungle":          1.0,
  "mountains":       1.0,
  "swamp":           1.0,
  "tundra":          0.5,
};
const DEFAULT_DAYS_PER_HEX = 0.5;
const ROAD_MULTIPLIER = 2 / 3; // roads are ~50% faster → cost × 2/3

function hexTravelDays(hex, hexTerrain) {
  const t = hexTerrain && hexTerrain[hex];
  const rate = t ? TERRAIN_DAYS_PER_HEX[t] : undefined;
  return rate != null ? rate : DEFAULT_DAYS_PER_HEX;
}

function isOverlandNode(n) {
  if (n.visible === false) return false;
  if (n.scale === "local") return false;
  if (n.parent) return false;
  if (INTERIOR_TERRAINS.has(n.terrain)) return false;
  return true;
}

// --- Seeded random for deterministic symbol placement ---
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function seedFromString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

// --- River rendering ---
// Draws an organic, wiggly river line through a list of hex centers.
// Small boats/barges scattered along the river — adds life to the waterway.
// Called by style renderers after renderRiver so the boats sit on top of the
// water. Each boat is oriented along the river's local direction.
// Skips hexes that hold a large node icon (heart/fortress) so boats don't
// appear inside town silhouettes.
function renderBoats(ctx, options = {}) {
  const { g, riverPath, riverSpine, nodes, HINT_SCALE, WIDTH, HEIGHT } = ctx;
  if (!riverPath || riverPath.length < 2) return;
  const ink = options.color || "#2a1f14";
  const parch = options.parchment || "#f4e8d1";
  const count = options.count || 3;

  // Hexes that carry a town-scale icon — skip these so boats don't sit
  // inside the Blackwater Crossing walls, etc.
  const blockedHexes = new Set();
  (nodes || []).forEach(n => {
    if (n.hex && (n.point_type === "heart" || n.point_type === "fortress")) {
      blockedHexes.add(n.hex);
    }
  });

  // Compute hex centers so we can identify blocked zones on the spine
  const bcCol = 10, bcRow = 10;
  const size = HINT_SCALE / 2;
  const colStep = size * 2 * 0.75;
  const rowStep = size * Math.sqrt(3);
  const hexCenters = riverPath.map(h => {
    const col = parseInt(h.substring(0, 2));
    const row = parseInt(h.substring(2, 4));
    const x = (col - bcCol) * colStep + WIDTH / 2;
    const y = (row - bcRow) * rowStep + (col % 2 !== bcCol % 2 ? rowStep / 2 : 0) + HEIGHT / 2;
    return [x, y];
  });
  const blockedCenters = riverPath
    .map((h, i) => blockedHexes.has(h) ? hexCenters[i] : null)
    .filter(Boolean);

  // If we have the actual river spine (exposed by renderRiver), pick boat
  // positions along it so the boats sit ON the wavy water, not on the
  // hex-center line that the water diverges from.
  const spine = Array.isArray(riverSpine) && riverSpine.length > 1 ? riverSpine : hexCenters;
  if (spine.length < 3) return;

  const rng = mulberry32(seedFromString("boats-" + riverPath.join("")));
  const boatGroup = g.append("g").attr("class", "boats");

  // Gather candidate spine indices — skip any point near a blocked hex
  // center (town/fortress). Also skip the first/last 10% of the spine.
  const skipBlockDist2 = (size * 1.1) * (size * 1.1);
  const startCutoff = Math.floor(spine.length * 0.1);
  const endCutoff = Math.floor(spine.length * 0.9);
  const candidates = [];
  for (let i = startCutoff; i < endCutoff; i++) {
    const [sx, sy] = spine[i];
    let blocked = false;
    for (const [bx0, by0] of blockedCenters) {
      const d2 = (sx - bx0) * (sx - bx0) + (sy - by0) * (sy - by0);
      if (d2 < skipBlockDist2) { blocked = true; break; }
    }
    if (!blocked) candidates.push(i);
  }
  if (candidates.length === 0) return;

  // Fisher–Yates shuffle the candidates and take `count`
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const chosen = candidates.slice(0, Math.min(count, candidates.length));

  for (const idx of chosen) {
    const [cx, cy] = spine[idx];
    // Use adjacent spine points to compute the local flow direction
    const [px, py] = spine[Math.max(0, idx - 2)];
    const [nx2, ny2] = spine[Math.min(spine.length - 1, idx + 2)];
    const dx = nx2 - px, dy = ny2 - py;
    const bx = cx;
    const by = cy;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

    const bg = boatGroup.append("g")
      .attr("transform", `translate(${bx}, ${by}) rotate(${angle})`);

    // Pick boat style: barge (wide flat) or small rowboat (pointed)
    const style = rng();
    if (style < 0.55) {
      // Small rowboat — oval hull, pointed bow, tiny mast or oarsman
      const hullW = 5, hullH = 1.8;
      bg.append("path")
        .attr("d", `M ${-hullW / 2} 0 Q ${-hullW / 2} ${hullH} 0 ${hullH} Q ${hullW / 2} ${hullH} ${hullW / 2} 0 L ${hullW / 2 + 2} 0 L ${hullW / 2} ${-hullH * 0.4} Z`)
        .attr("fill", parch).attr("stroke", ink).attr("stroke-width", 0.6);
      // Small sail or mast
      if (rng() > 0.5) {
        bg.append("line").attr("x1", 0).attr("y1", -0.3).attr("x2", 0).attr("y2", -hullW * 0.7)
          .attr("stroke", ink).attr("stroke-width", 0.55);
        bg.append("path")
          .attr("d", `M 0 ${-hullW * 0.7} L ${hullW * 0.35} ${-hullW * 0.45} L 0 ${-hullW * 0.25}`)
          .attr("fill", parch).attr("stroke", ink).attr("stroke-width", 0.5);
      } else {
        // Two short oar strokes
        bg.append("line").attr("x1", -hullW * 0.2).attr("y1", 0).attr("x2", -hullW * 0.4).attr("y2", -1.5)
          .attr("stroke", ink).attr("stroke-width", 0.5);
        bg.append("line").attr("x1", hullW * 0.2).attr("y1", 0).attr("x2", hullW * 0.4).attr("y2", -1.5)
          .attr("stroke", ink).attr("stroke-width", 0.5);
      }
    } else {
      // Flat barge — rectangular hull, cargo stacks
      const hullW = 7, hullH = 2.0;
      bg.append("rect")
        .attr("x", -hullW / 2).attr("y", 0)
        .attr("width", hullW).attr("height", hullH)
        .attr("fill", parch).attr("stroke", ink).attr("stroke-width", 0.6);
      // Pointed bow on the right end
      bg.append("path")
        .attr("d", `M ${hullW / 2} 0 L ${hullW / 2 + 2.2} ${hullH / 2} L ${hullW / 2} ${hullH} Z`)
        .attr("fill", parch).attr("stroke", ink).attr("stroke-width", 0.6);
      // Cargo stacks — 2-3 small rectangles on deck
      for (let c = 0; c < 3; c++) {
        bg.append("rect")
          .attr("x", -hullW * 0.35 + c * hullW * 0.22).attr("y", -hullH * 0.6)
          .attr("width", hullW * 0.15).attr("height", hullH * 0.55)
          .attr("fill", ink).attr("opacity", 0.75);
      }
    }
  }
}

// riverColor and riverWidth are style-dependent. Called from style render functions.
// riverColor, riverWidth — style-dependent. Accepts an optional third
// argument { singleLine: true } to draw a single spine stroke instead of
// the default two banks (used by Tolkien-Wilderland style where rivers
// are thin black lines, not double-banked blue streams).
function renderRiver(ctx, riverColor, riverWidth, options = {}) {
  const { g, riverPath, HINT_SCALE, WIDTH, HEIGHT } = ctx;
  if (!riverPath || riverPath.length < 2) return;
  const singleLine = options.singleLine === true;

  const bcCol = 10, bcRow = 10;
  const size = HINT_SCALE / 2;
  const colStep = size * 2 * 0.75;
  const rowStep = size * Math.sqrt(3);

  // Convert hex codes to pixel positions
  const points = riverPath.map(h => {
    const col = parseInt(h.substring(0, 2));
    const row = parseInt(h.substring(2, 4));
    const x = (col - bcCol) * colStep + WIDTH / 2;
    const y = (row - bcRow) * rowStep + (col % 2 !== bcCol % 2 ? rowStep / 2 : 0) + HEIGHT / 2;
    return [x, y];
  });

  // Town-interior river routing. Where the river passes through a settlement
  // that declares a flow shape (e.g. Blackwater Crossing: enter N, run S,
  // bend E, exit E), replace the single hex-center waypoint with an L-path
  // of interior vertices so the river visibly threads the town footprint
  // instead of cutting straight across it.
  const townRouting = {
    // Blackwater Crossing: river enters at the northern edge, runs south
    // through the town, then bends east and exits at the east edge. An
    // extra "above the hex" vertex pulls the incoming trajectory so the
    // final approach reads as coming from directly north.
    "1010": (x, y) => [
      [x,                    y - rowStep * 0.85],  // above-hex approach
      [x,                    y - rowStep * 0.40],  // N-edge entry
      [x,                    y + rowStep * 0.18],  // south-of-center interior
      [x + colStep * 0.55,   y + rowStep * 0.25],  // E-edge exit
    ],
  };
  for (let i = points.length - 1; i >= 0; i--) {
    const route = townRouting[riverPath[i]];
    if (route) {
      const [x, y] = points[i];
      points.splice(i, 1, ...route(x, y));
    }
  }

  const rng = mulberry32(seedFromString("blackwater-river"));
  const riverGroup = g.append("g").attr("class", "river");

  // Generate wiggly sub-points between each hex center. Wiggle amplitude is
  // tapered near endpoints (sin envelope) so the river passes through the hex
  // corridor but swings freely through large bends in between.
  const wigglePoints = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / len, ny = dx / len;

    // 20-26 intermediate points per segment — dense enough to hold tight bends
    const segs = 20 + Math.floor(rng() * 7);
    // Three independent scales of meander with random phases
    const broadPhase = rng() * Math.PI * 2;
    const broadFreq = 1.2 + rng() * 1.3;
    const medPhase = rng() * Math.PI * 2;
    const medFreq = 3.5 + rng() * 2.5;
    const finePhase = rng() * Math.PI * 2;
    const fineFreq = 9 + rng() * 4;

    const startS = i === 0 ? 0 : 1;
    for (let s = startS; s <= segs; s++) {
      const t = s / segs;
      const mx = x1 + dx * t;
      const my = y1 + dy * t;
      // Envelope: zero at endpoints, 1 at midpoint. Keeps river in hex corridor.
      const envelope = Math.sin(t * Math.PI);
      const broad = Math.sin(broadPhase + t * Math.PI * broadFreq) * len * 0.32;
      const med = Math.sin(medPhase + t * Math.PI * medFreq) * len * 0.14;
      const fine = Math.sin(finePhase + t * Math.PI * fineFreq) * len * 0.05;
      const noise = (rng() - 0.5) * len * 0.03;
      const offset = (broad + med + fine + noise) * (0.2 + envelope * 0.8);
      wigglePoints.push([mx + nx * offset, my + ny * offset]);
    }
  }

  // Expose the spine so downstream renderers (boats, etc) can place props
  // on the actual wavy water line rather than the straight hex-center path.
  ctx.riverSpine = wigglePoints;

  // Per-point unit perpendicular (averaged tangent of adjacent spine points)
  function perpAt(i) {
    const p0 = wigglePoints[Math.max(0, i - 1)];
    const p1 = wigglePoints[Math.min(wigglePoints.length - 1, i + 1)];
    const tx = p1[0] - p0[0];
    const ty = p1[1] - p0[1];
    const tl = Math.sqrt(tx * tx + ty * ty) || 1;
    return [-ty / tl, tx / tl];
  }

  // Varying river width along the spine: base + slow undulation + small bumps +
  // occasional widenings (pools).
  const baseHalfWidth = riverWidth * 0.55;
  const poolCenters = [];
  const numPools = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < numPools; i++) {
    poolCenters.push({
      idx: Math.floor(5 + rng() * (wigglePoints.length - 10)),
      span: 6 + Math.floor(rng() * 10),
      boost: 1.3 + rng() * 0.7,
    });
  }
  const widthsRaw = wigglePoints.map((_, i) => {
    const t = i / wigglePoints.length;
    const undulation = 1 + Math.sin(t * Math.PI * 6 + rng()) * 0.25;
    const noise = 1 + (rng() - 0.5) * 0.15;
    let pool = 1;
    for (const p of poolCenters) {
      const d = Math.abs(i - p.idx);
      if (d < p.span) {
        const falloff = Math.cos((d / p.span) * Math.PI / 2);
        pool *= 1 + (p.boost - 1) * falloff;
      }
    }
    return baseHalfWidth * undulation * noise * pool;
  });
  // Smooth widths so banks don't have sharp steps
  const widths = widthsRaw.map((_, i) => {
    const w0 = widthsRaw[Math.max(0, i - 1)];
    const w1 = widthsRaw[i];
    const w2 = widthsRaw[Math.min(widthsRaw.length - 1, i + 1)];
    return (w0 + w1 * 2 + w2) / 4;
  });
  // Taper width near the river's endpoints so banks come to a point
  const taperN = 4;
  for (let i = 0; i < taperN && i < widths.length; i++) {
    widths[i] *= i / taperN;
    widths[widths.length - 1 - i] *= i / taperN;
  }

  // Compute left and right bank points
  const leftBank = wigglePoints.map((pt, i) => {
    const [px, py] = perpAt(i);
    return [pt[0] + px * widths[i], pt[1] + py * widths[i]];
  });
  const rightBank = wigglePoints.map((pt, i) => {
    const [px, py] = perpAt(i);
    return [pt[0] - px * widths[i], pt[1] - py * widths[i]];
  });

  const line = d3.line().curve(d3.curveCatmullRom.alpha(0.5));
  const bankStroke = Math.max(0.9, riverWidth * 0.4);

  if (singleLine) {
    // Tolkien Wilderland-style river — one thin ink stroke along the
    // spine, no bank-fill, no second line. Reads as a hand-drawn stream.
    riverGroup.append("path")
      .attr("d", line(wigglePoints))
      .attr("fill", "none").attr("stroke", riverColor)
      .attr("stroke-width", Math.max(0.9, riverWidth * 0.6))
      .attr("stroke-linecap", "round");
  } else {
    // Subtle water body fill between the banks
    const waterPath = leftBank.concat(rightBank.slice().reverse());
    riverGroup.append("path")
      .attr("d", d3.line().curve(d3.curveLinearClosed)(waterPath))
      .attr("fill", riverColor)
      .attr("stroke", "none")
      .attr("opacity", 0.08);

    // Two bank lines — hand-drawn feel, thin ink
    riverGroup.append("path")
      .attr("d", line(leftBank))
      .attr("fill", "none")
      .attr("stroke", riverColor)
      .attr("stroke-width", bankStroke)
      .attr("stroke-linecap", "round")
      .attr("opacity", 0.8);
    riverGroup.append("path")
      .attr("d", line(rightBank))
      .attr("fill", "none")
      .attr("stroke", riverColor)
      .attr("stroke-width", bankStroke)
      .attr("stroke-linecap", "round")
      .attr("opacity", 0.8);
  }

  // Invisible spine path as a textPath anchor for the river name label.
  const spineId = "river-spine-" + Math.random().toString(36).slice(2, 8);
  riverGroup.append("path")
    .attr("id", spineId)
    .attr("d", line(wigglePoints))
    .attr("fill", "none")
    .attr("stroke", "none");
  // Expose the id so styles can render the river name on it.
  ctx._riverSpineId = spineId;

  // Small islands in wider stretches — skipped in singleLine mode since
  // there are no visible banks to break around.
  if (singleLine) return;
  for (const p of poolCenters) {
    if (rng() > 0.45) continue;
    const i = p.idx;
    if (i < 3 || i > wigglePoints.length - 4) continue;
    const [cx, cy] = wigglePoints[i];
    const [nxP, nyP] = perpAt(i);
    const hw = widths[i];
    // Island small enough to leave water flowing on both sides
    const iLen = hw * (0.6 + rng() * 0.7);
    const iWid = hw * (0.2 + rng() * 0.2);
    // Slight lateral shift so flow is visibly split
    const lat = (rng() - 0.5) * hw * 0.3;
    const ix = cx + nxP * lat;
    const iy = cy + nyP * lat;
    // Along-stream tangent
    const txS = -nyP, tyS = nxP;
    const ipts = [];
    const steps = 12;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const wobble = 1 + (rng() - 0.5) * 0.2;
      const lx = Math.cos(a) * iLen * 0.5 * wobble;
      const ly = Math.sin(a) * iWid * wobble;
      ipts.push([ix + lx * txS + ly * nxP, iy + lx * tyS + ly * nyP]);
    }
    ipts.push(ipts[0]);
    riverGroup.append("path")
      .attr("d", d3.line().curve(d3.curveCatmullRomClosed.alpha(0.5))(ipts))
      .attr("fill", "#f4e8d1")
      .attr("stroke", riverColor)
      .attr("stroke-width", bankStroke * 0.9)
      .attr("opacity", 0.9);
  }
}

// --- River name label ---
// Places the river name along the river's spine using SVG textPath.
// The spine path id is stashed by renderRiver on ctx._riverSpineId.
// Call this AFTER renderRiver. graphData.river_name or default "River".
function renderRiverLabel(ctx, style) {
  const { g, _riverSpineId } = ctx;
  if (!_riverSpineId) return;
  const name = (graphData && graphData.river_name) || null;
  if (!name) return;
  const {
    color = "#335",
    strokeColor = "#f4e8d1",
    fontSize = 13,
    opacity = 0.8,
    startOffset = "45%",
    letterSpacing = "2px",
    fontStyle = "italic",
  } = style || {};
  g.append("text")
    .attr("font-family", FONT)
    .attr("font-size", fontSize + "px")
    .attr("font-style", fontStyle)
    .attr("letter-spacing", letterSpacing)
    .attr("fill", color)
    .attr("stroke", strokeColor)
    .attr("stroke-width", 3)
    .attr("paint-order", "stroke")
    .attr("opacity", opacity)
    .append("textPath")
    .attr("href", "#" + _riverSpineId)
    .attr("startOffset", startOffset)
    .attr("text-anchor", "middle")
    .text(name);
}

// --- Road rendering ---
// Draws roads through lists of hex centers with a hand-drawn feel.
// roadPath can be a single list of hex codes, or a list of lists (multiple roads).
function renderRoad(ctx, roadColor, roadWidth) {
  const { g, roadPath, HINT_SCALE, WIDTH, HEIGHT } = ctx;
  if (!roadPath || roadPath.length === 0) return;

  const bcCol = 10, bcRow = 10;
  const size = HINT_SCALE / 2;
  const colStep = size * 2 * 0.75;
  const rowStep = size * Math.sqrt(3);

  const roadGroup = g.append("g").attr("class", "road");
  const line = d3.line().curve(d3.curveCatmullRom.alpha(0.5));

  // Normalize entries: accept array (legacy), or {hexes, label?, days?}
  const paths = roadPath.map(entry => {
    if (Array.isArray(entry)) return { hexes: entry };
    if (entry && entry.hexes) return entry;
    return { hexes: roadPath };
  });
  const isFlatLegacy = typeof roadPath[0] === "string";
  const normalized = isFlatLegacy ? [{ hexes: roadPath }] : paths;

  normalized.forEach((pathObj, pathIdx) => {
    const hexes = pathObj.hexes;
    if (!hexes || hexes.length < 2) return;

    const points = hexes
      .filter(h => typeof h === "string" && h.length >= 4)
      .map(h => {
        const col = parseInt(h.substring(0, 2));
        const row = parseInt(h.substring(2, 4));
        const x = (col - bcCol) * colStep + WIDTH / 2;
        const y = (row - bcRow) * rowStep + (col % 2 !== bcCol % 2 ? rowStep / 2 : 0) + HEIGHT / 2;
        return [x, y];
      });
    if (points.length < 2) return;

    const rng = mulberry32(seedFromString("road-" + pathIdx));

    // Dense wiggly sub-points per segment, with sine-envelope tapering so the
    // road still passes through hex corridors but bends naturally between them.
    const wigglePoints = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = -dy / len, ny = dx / len;

      const segs = 10 + Math.floor(rng() * 5);
      const broadPhase = rng() * Math.PI * 2;
      const broadFreq = 1.2 + rng() * 1.0;
      const fineFreq = 6 + rng() * 4;
      const finePhase = rng() * Math.PI * 2;

      const startS = i === 0 ? 0 : 1;
      for (let s = startS; s <= segs; s++) {
        const t = s / segs;
        const mx = x1 + dx * t;
        const my = y1 + dy * t;
        const env = Math.sin(t * Math.PI);
        const broad = Math.sin(broadPhase + t * Math.PI * broadFreq) * len * 0.12;
        const fine = Math.sin(finePhase + t * Math.PI * fineFreq) * len * 0.03;
        const noise = (rng() - 0.5) * len * 0.02;
        const offset = (broad + fine + noise) * (0.25 + env * 0.75);
        wigglePoints.push([mx + nx * offset, my + ny * offset]);
      }
    }

    // Two overlapping hand-drawn strokes, slightly offset, for sketchy feel
    const d = line(wigglePoints);
    const spineId = "road-spine-" + pathIdx + "-" + Math.random().toString(36).slice(2, 8);
    roadGroup.append("path")
      .attr("id", spineId)
      .attr("d", d)
      .attr("fill", "none")
      .attr("stroke", roadColor)
      .attr("stroke-width", roadWidth)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("opacity", 0.75);
    roadGroup.append("path")
      .attr("d", d)
      .attr("fill", "none")
      .attr("stroke", roadColor)
      .attr("stroke-width", roadWidth * 0.5)
      .attr("stroke-linecap", "round")
      .attr("stroke-dasharray", `${roadWidth * 2.5} ${roadWidth * 1.5}`)
      .attr("transform", `translate(${(rng() - 0.5) * 1.2}, ${(rng() - 0.5) * 1.2})`)
      .attr("opacity", 0.35);

    // Road name along the spine via textPath
    if (pathObj.name) {
      roadGroup.append("text")
        .attr("font-family", FONT)
        .attr("font-size", "12px")
        .attr("font-style", "italic")
        .attr("letter-spacing", "2px")
        .attr("fill", roadColor)
        .attr("stroke", "#f4e8d1")
        .attr("stroke-width", 3)
        .attr("paint-order", "stroke")
        .attr("opacity", 0.8)
        .append("textPath")
        .attr("href", "#" + spineId)
        .attr("startOffset", "50%")
        .attr("text-anchor", "middle")
        .text(pathObj.name);
    }

    if (pathObj.label) {
      const midIdx = Math.floor(points.length / 2);
      const [pA, pB] = points.length % 2 === 0
        ? [points[midIdx - 1], points[midIdx]]
        : [points[midIdx], points[midIdx]];
      const mx = (pA[0] + pB[0]) / 2;
      const my = (pA[1] + pB[1]) / 2;
      const dx = pB[0] - pA[0], dy = pB[1] - pA[1];
      const segLen = Math.sqrt(dx * dx + dy * dy) || 1;
      const offX = -dy / segLen * 12;
      const offY = dx / segLen * 12;
      roadGroup.append("text")
        .attr("x", mx + offX)
        .attr("y", my + offY)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("font-family", FONT)
        .attr("font-size", "11px")
        .attr("font-style", "italic")
        .attr("fill", roadColor)
        .attr("opacity", 0.85)
        .text(pathObj.label);
    }
  });
}

// --- Crevasse rendering ---
// Default: jagged zig-zag canyon through hex centers plus perpendicular
// shadow hatches. Pass `options.style = "twinbank"` for a Thror's-Map
// "Running River" look — two parallel wavy lines with short cross-ticks
// between them, suggesting a current-filled channel.
// crevassePath entries look like { hexes: [...], name? }.
function renderCrevasse(ctx, color, width, options = {}) {
  const { g, crevassePath, HINT_SCALE, WIDTH, HEIGHT } = ctx;
  if (!crevassePath || crevassePath.length === 0) return;

  const bcCol = 10, bcRow = 10;
  const size = HINT_SCALE / 2;
  const colStep = size * 2 * 0.75;
  const rowStep = size * Math.sqrt(3);

  const crevasseColor = color || "#2a1f14";
  const w = width || 3;
  const style = options.style || "jagged";
  const group = g.append("g").attr("class", "crevasse");

  crevassePath.forEach((entry, pathIdx) => {
    const hexes = Array.isArray(entry) ? entry : (entry && entry.hexes);
    if (!hexes || hexes.length < 2) return;

    const centers = hexes
      .filter(h => typeof h === "string" && h.length >= 4)
      .map(h => {
        const col = parseInt(h.substring(0, 2));
        const row = parseInt(h.substring(2, 4));
        const x = (col - bcCol) * colStep + WIDTH / 2;
        const y = (row - bcRow) * rowStep + (col % 2 !== bcCol % 2 ? rowStep / 2 : 0) + HEIGHT / 2;
        return [x, y];
      });
    if (centers.length < 2) return;

    const rng = mulberry32(seedFromString("crevasse-" + pathIdx));

    if (style === "twinbank") {
      // Crack-in-the-ground gorge — two wiggly banks that meet at the tips
      // and bulge irregularly through the middle, so the width varies like
      // a natural fissure rather than a lens with constant edges.
      const spine = [];
      const tangents = [];
      const tapers = []; // 0 at the tips, up to ~1.3 at wide spots
      // Pre-generate a low-frequency noise curve (sum of two sines) that
      // modulates the overall gorge width along its length. Combined with
      // the end-taper, this makes the middle wider in some places and
      // slightly pinched in others.
      const widthPhase1 = rng() * Math.PI * 2;
      const widthPhase2 = rng() * Math.PI * 2;
      const widthMod = u => 0.85 + 0.35 * Math.sin(u * Math.PI * 2 + widthPhase1)
                                 + 0.15 * Math.sin(u * Math.PI * 5 + widthPhase2);
      for (let i = 0; i < centers.length - 1; i++) {
        const [x1, y1] = centers[i];
        const [x2, y2] = centers[i + 1];
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const tx = dx / len, ty = dy / len;
        const nx = -ty, ny = tx;
        const segs = 12 + Math.floor(rng() * 4);
        for (let s = 0; s < segs; s++) {
          const segT = s / segs;
          const u = (i + segT) / (centers.length - 1);
          // End-taper (sharp points at the tips) × mid-section width mod
          const endTaper = Math.sin(u * Math.PI);
          const taper = endTaper * Math.max(0, widthMod(u));
          const amp = size * 0.16 * endTaper * (0.7 + rng() * 0.6);
          const phase = rng() * 0.4;
          const wig = Math.sin(segT * Math.PI * 3 + phase) * amp;
          spine.push([x1 + dx * segT + nx * wig, y1 + dy * segT + ny * wig]);
          tangents.push([tx, ty]);
          tapers.push(taper);
        }
      }
      spine.push(centers[centers.length - 1]);
      tangents.push(tangents[tangents.length - 1] || [1, 0]);
      tapers.push(0); // tip — banks converge here

      const halfW = w * 0.9; // half the channel width at the widest point
      const line = d3.line().curve(d3.curveCatmullRom.alpha(0.5));

      // Two banks offset perpendicular to the spine. The offset is scaled
      // by `taper` so both banks collapse to the spine at the tips.
      const bankA = spine.map((p, i) => {
        const [tx, ty] = tangents[i];
        const off = halfW * tapers[i];
        return [p[0] + (-ty) * off, p[1] + tx * off];
      });
      const bankB = spine.map((p, i) => {
        const [tx, ty] = tangents[i];
        const off = halfW * tapers[i];
        return [p[0] - (-ty) * off, p[1] - tx * off];
      });

      // Single closed outline around the crack so the tips are explicitly
      // joined (no small gap from two separate paths).
      const outline = bankA.concat(bankB.slice().reverse());
      group.append("path")
        .attr("d", line(outline) + " Z")
        .attr("fill", "none")
        .attr("stroke", crevasseColor)
        .attr("stroke-width", Math.max(0.8, w * 0.45))
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round")
        .attr("opacity", 0.9);

      // Cross-ticks between the banks — short perpendicular hatches every
      // few spine points, suggesting depth / water / current. Skip the
      // tapered ends where the banks are nearly touching.
      const tickStride = 3;
      for (let i = 1; i < spine.length - 1; i += tickStride) {
        if (tapers[i] < 0.35) continue;
        const a = bankA[i];
        const b = bankB[i];
        const ax = a[0] + (b[0] - a[0]) * 0.2;
        const ay = a[1] + (b[1] - a[1]) * 0.2;
        const bx = a[0] + (b[0] - a[0]) * 0.8;
        const by = a[1] + (b[1] - a[1]) * 0.8;
        group.append("line")
          .attr("x1", ax).attr("y1", ay)
          .attr("x2", bx).attr("y2", by)
          .attr("stroke", crevasseColor)
          .attr("stroke-width", Math.max(0.4, w * 0.22))
          .attr("stroke-linecap", "round")
          .attr("opacity", 0.65);
      }
      return;
    }

    // Default "jagged" style — zig-zag canyon spine with one-sided shadow
    // hatches.
    const spine = [centers[0]];
    for (let i = 0; i < centers.length - 1; i++) {
      const [x1, y1] = centers[i];
      const [x2, y2] = centers[i + 1];
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const zigs = 6;
      for (let s = 1; s <= zigs; s++) {
        const t = s / zigs;
        const mx = x1 + dx * t;
        const my = y1 + dy * t;
        const alt = (s % 2 === 0 ? 1 : -1);
        const amp = size * 0.12 * (0.7 + rng() * 0.6);
        spine.push([mx + nx * alt * amp, my + ny * alt * amp]);
      }
    }

    const line = d3.line();
    group.append("path")
      .attr("d", line(spine))
      .attr("fill", "none")
      .attr("stroke", crevasseColor)
      .attr("stroke-width", w)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "miter")
      .attr("opacity", 0.9);

    for (let i = 1; i < spine.length - 1; i += 2) {
      const [px, py] = spine[i];
      const [pxN, pyN] = spine[i + 1];
      const tx = pxN - px, ty = pyN - py;
      const tl = Math.sqrt(tx * tx + ty * ty) || 1;
      const perpX = -ty / tl, perpY = tx / tl;
      const hatchLen = size * (0.18 + rng() * 0.14);
      const side = rng() > 0.5 ? 1 : -1;
      group.append("line")
        .attr("x1", px).attr("y1", py)
        .attr("x2", px + perpX * hatchLen * side).attr("y2", py + perpY * hatchLen * side)
        .attr("stroke", crevasseColor)
        .attr("stroke-width", w * 0.45)
        .attr("stroke-linecap", "round")
        .attr("opacity", 0.55);
    }
  });
}

// --- Hex terrain rendering ---
// Draws terrain decorations at hex centers based on hex_terrain data.
// terrainDrawers is an object mapping terrain type to a draw function: (g, x, y, size, rng) => void
// options.density scales the scatter point count: 1.0 = full 7 points, 0.3 = center only.
function renderHexTerrain(ctx, terrainDrawers, options) {
  const { g, hexTerrain, HINT_SCALE, WIDTH, HEIGHT, mulberry32, seedFromString, riverPath } = ctx;
  if (!hexTerrain || Object.keys(hexTerrain).length === 0) return;

  const bcCol = 10, bcRow = 10;
  const size = HINT_SCALE / 2;
  const colStep = size * 2 * 0.75;
  const rowStep = size * Math.sqrt(3);

  const density = (options && typeof options.density === "number") ? options.density : 1.0;
  const terrainGroup = g.append("g").attr("class", "terrain");

  const neighborsA = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1]];
  const neighborsB = [[0, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  const inscribed = size * Math.sqrt(3) / 2;
  const edgeMids = [
    [0, -inscribed],
    [size * 0.75, -inscribed / 2],
    [size * 0.75, inscribed / 2],
    [0, inscribed],
    [-size * 0.75, inscribed / 2],
    [-size * 0.75, -inscribed / 2],
  ];
  const riverSet = new Set(Array.isArray(riverPath) ? riverPath : []);

  // Swamp reeds cluster near open water. For every swamp hex, build a
  // unit-vector bias toward its river-bordering edges; placement points
  // shift along this vector so reeds concentrate on the waterside of the
  // hex rather than scatter evenly across it.
  function computeWaterBias(col, row, terrain) {
    if (terrain !== "swamp") return null;
    const isShifted = (col % 2) !== (bcCol % 2);
    const neighbors = isShifted ? neighborsB : neighborsA;
    let bx = 0, by = 0, count = 0;
    neighbors.forEach((off, i) => {
      const nKey = String(col + off[0]).padStart(2, "0") + String(row + off[1]).padStart(2, "0");
      const isWater = riverSet.has(nKey) || hexTerrain[nKey] === "swamp";
      if (isWater) {
        bx += edgeMids[i][0];
        by += edgeMids[i][1];
        count++;
      }
    });
    if (count === 0) return null;
    const len = Math.sqrt(bx * bx + by * by) || 1;
    return [bx / len, by / len];
  }

  Object.entries(hexTerrain).forEach(([hex, terrain]) => {
    const drawer = terrainDrawers[terrain];
    if (!drawer) return;

    const col = parseInt(hex.substring(0, 2));
    const row = parseInt(hex.substring(2, 4));
    const hx = (col - bcCol) * colStep + WIDTH / 2;
    const hy = (row - bcRow) * rowStep + (col % 2 !== bcCol % 2 ? rowStep / 2 : 0) + HEIGHT / 2;

    const rng = mulberry32(seedFromString(hex));

    // Full layout: center + 6 ring points. Density trims how many we actually emit.
    const fullGrid = [
      [0, 0],
      ...[0, 60, 120, 180, 240, 300].map(a => {
        const r = size * 0.65;
        return [Math.cos(a * Math.PI / 180) * r, Math.sin(a * Math.PI / 180) * r];
      }),
    ];
    const targetN = Math.max(1, Math.round(fullGrid.length * density));
    // For swamps, bias points toward water neighbours so reeds cluster on
    // the waterside rather than sprinkling evenly across the hex.
    const waterBias = computeWaterBias(col, row, terrain);
    const biasedGrid = fullGrid.slice(0, targetN).map(([ox, oy]) => {
      if (!waterBias) return [ox, oy];
      // Shift each grid point strongly along the bias vector, and drop
      // off ring points that lie on the far side of the hex.
      const [bx, by] = waterBias;
      // Scale: move centre toward water by ~0.35*size, ring by up to 0.5*size
      const shiftMag = size * 0.35;
      return [ox + bx * shiftMag, oy + by * shiftMag];
    });
    // For biased swamps, drop any point whose projection onto the bias
    // is strongly negative (far side of the hex from the water).
    const grid = waterBias
      ? biasedGrid.filter(([ox, oy]) => (ox * waterBias[0] + oy * waterBias[1]) > -size * 0.35)
      : biasedGrid;

    grid.forEach(([ox, oy]) => {
      const jitterX = (rng() - 0.5) * size * 0.18;
      const jitterY = (rng() - 0.5) * size * 0.18;
      const dx = hx + ox + jitterX;
      const dy = hy + oy + jitterY;
      drawer(terrainGroup, dx, dy, 8 + rng() * 5, rng);
    });
  });
}

// --- Bridge rendering ---
// Finds every hex that appears in both road_path and river_path and draws a
// small hand-drawn bridge oriented along the road's local tangent.
function renderBridges(ctx, bridgeStyle) {
  const { g, riverPath, roadPath, HINT_SCALE, WIDTH, HEIGHT } = ctx;
  if (!riverPath || !roadPath || riverPath.length === 0 || roadPath.length === 0) return;

  const bcCol = 10, bcRow = 10;
  const size = HINT_SCALE / 2;
  const colStep = size * 2 * 0.75;
  const rowStep = size * Math.sqrt(3);

  const { color = "#333", strokeWidth = 1.0, bridgeLen = 14, opacity = 0.85 } = bridgeStyle || {};

  const riverSet = new Set(riverPath);
  // Normalize road paths to {hexes}
  const paths = roadPath.map(entry => {
    if (Array.isArray(entry)) return { hexes: entry };
    if (entry && entry.hexes) return entry;
    return null;
  }).filter(Boolean);
  if (typeof roadPath[0] === "string") {
    paths.length = 0;
    paths.push({ hexes: roadPath });
  }

  const bridgeGroup = g.append("g").attr("class", "bridges");

  const hexToXY = (h) => {
    if (typeof h !== "string" || h.length < 4) return null;
    const col = parseInt(h.substring(0, 2));
    const row = parseInt(h.substring(2, 4));
    if (isNaN(col) || isNaN(row)) return null;
    const hx = (col - bcCol) * colStep + WIDTH / 2;
    const hy = (row - bcRow) * rowStep + (col % 2 !== bcCol % 2 ? rowStep / 2 : 0) + HEIGHT / 2;
    return [hx, hy];
  };

  const drawn = new Set();
  paths.forEach(p => {
    const hexes = p.hexes;
    for (let i = 0; i < hexes.length; i++) {
      const hex = hexes[i];
      if (!riverSet.has(hex) || drawn.has(hex)) continue;
      const center = hexToXY(hex);
      if (!center) continue;
      // Tangent from neighboring hexes in the road path
      const prev = i > 0 ? hexToXY(hexes[i - 1]) : null;
      const next = i < hexes.length - 1 ? hexToXY(hexes[i + 1]) : null;
      let tx = 1, ty = 0;
      if (prev && next) {
        tx = next[0] - prev[0]; ty = next[1] - prev[1];
      } else if (prev) {
        tx = center[0] - prev[0]; ty = center[1] - prev[1];
      } else if (next) {
        tx = next[0] - center[0]; ty = next[1] - center[1];
      }
      const tl = Math.sqrt(tx * tx + ty * ty) || 1;
      tx /= tl; ty /= tl;
      // Perpendicular to road = bridge span direction
      const px = -ty, py = tx;

      const [cx, cy] = center;
      const half = bridgeLen / 2;
      // Two parallel planks across the road
      const plankOffset = 3;
      [-1, 1].forEach(side => {
        const ox = tx * plankOffset * side;
        const oy = ty * plankOffset * side;
        bridgeGroup.append("line")
          .attr("x1", cx + ox - px * half).attr("y1", cy + oy - py * half)
          .attr("x2", cx + ox + px * half).attr("y2", cy + oy + py * half)
          .attr("stroke", color).attr("stroke-width", strokeWidth)
          .attr("stroke-linecap", "round").attr("opacity", opacity);
      });
      // Short crossbars (ties) between the planks for a hand-drawn bridge
      for (let k = -2; k <= 2; k++) {
        const f = k / 2 * half * 0.6;
        bridgeGroup.append("line")
          .attr("x1", cx + px * f - tx * plankOffset)
          .attr("y1", cy + py * f - ty * plankOffset)
          .attr("x2", cx + px * f + tx * plankOffset)
          .attr("y2", cy + py * f + ty * plankOffset)
          .attr("stroke", color).attr("stroke-width", strokeWidth * 0.6)
          .attr("stroke-linecap", "round").attr("opacity", opacity * 0.8);
      }
      drawn.add(hex);
    }
  });
}

// --- Format fractional days for display: rounds to the nearest twelfth so
// it can show quarters (¼ ½ ¾) and thirds (⅓ ⅔) cleanly. ---
function formatDaysLabel(days) {
  if (days === 0) return "0 days";
  const twelfths = Math.round(days * 12);
  const whole = Math.floor(twelfths / 12);
  const rem = twelfths - whole * 12;
  const fracMap = { 2: "\u2159", 3: "\u00BC", 4: "\u2153", 6: "\u00BD", 8: "\u2154", 9: "\u00BE", 10: "\u215A" };
  const frac = fracMap[rem] || "";
  if (whole === 0 && frac) return frac + " day";
  if (whole === 0) return "0 days";
  if (whole === 1 && !frac) return "1 day";
  if (frac) return whole + frac + " days";
  return whole + " days";
}

// --- Render day labels along the straight-line midpoint of each link,
// rotated to follow the link direction and offset slightly above the line. ---
function renderDayLabelsAlongLinks(ctx, style) {
  const { g, links, FONT } = ctx;
  const {
    color = "#333",
    strokeColor = "#f4e8d1",
    fontSize = 9,
    opacity = 1,
    fontStyle = "italic",
    offset = 8,
    className = "day-labels",
  } = style || {};

  const labelGroup = g.append("g").attr("class", className);

  links.forEach(link => {
    if (!link.days || link.days < 0.25 || link.path_type === "river") return;

    const sx = link.source.x, sy = link.source.y;
    const tx = link.target.x, ty = link.target.y;
    const dx = tx - sx, dy = ty - sy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const mx = (sx + tx) / 2, my = (sy + ty) / 2;
    // Angle in degrees; flip horizontally so text reads left-to-right.
    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angle > 90) angle -= 180;
    else if (angle < -90) angle += 180;
    // Perpendicular offset so text floats just off the line
    const nx = -dy / len, ny = dx / len;
    const tx2 = mx + nx * offset;
    const ty2 = my + ny * offset;

    labelGroup.append("text")
      .attr("x", tx2).attr("y", ty2)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-family", FONT)
      .attr("font-size", fontSize + "px")
      .attr("font-style", fontStyle)
      .attr("fill", color)
      .attr("stroke", strokeColor)
      .attr("stroke-width", 2.5)
      .attr("paint-order", "stroke")
      .attr("opacity", opacity)
      .attr("transform", `rotate(${angle.toFixed(1)}, ${tx2}, ${ty2})`)
      .text(formatDaysLabel(link.days));
  });
}

// --- Region labels ---
// Renders large flowing captions spanning a region of hexes, Thror-style
// ("The Desolation of Smaug", "Far to the North are the Grey Mountains").
// Reads graphData.region_labels: [{text, hexes:[], fontSize?, rotation?, color?, letterSpacing?, fontStyle?}]
function renderRegionLabels(ctx, style) {
  const { g, HINT_SCALE, WIDTH, HEIGHT } = ctx;
  const labels = graphData && graphData.region_labels;
  if (!labels || !labels.length) return;

  const bcCol = 10, bcRow = 10;
  const size = HINT_SCALE / 2;
  const colStep = size * 2 * 0.75;
  const rowStep = size * Math.sqrt(3);

  const defaults = style || {};
  const labelGroup = g.append("g").attr("class", "region-labels");

  // Use defs to stash the invisible text-paths so we can reference them
  let defs = g.select("defs");
  if (defs.empty()) defs = g.append("defs");

  labels.forEach((entry, entryIdx) => {
    if (!entry.hexes || !entry.hexes.length || !entry.text) return;
    // Compute all hex centers for this region
    const centers = [];
    entry.hexes.forEach(h => {
      if (typeof h !== "string" || h.length < 4) return;
      const col = parseInt(h.substring(0, 2));
      const row = parseInt(h.substring(2, 4));
      if (isNaN(col) || isNaN(row)) return;
      const hx = (col - bcCol) * colStep + WIDTH / 2;
      const hy = (row - bcRow) * rowStep + (col % 2 !== bcCol % 2 ? rowStep / 2 : 0) + HEIGHT / 2;
      centers.push([hx, hy]);
    });
    if (centers.length === 0) return;
    let sumX = 0, sumY = 0;
    centers.forEach(([x, y]) => { sumX += x; sumY += y; });
    const cx = sumX / centers.length, cy = sumY / centers.length;

    const fontSize = entry.fontSize || defaults.fontSize || 20;
    const rotation = entry.rotation != null ? entry.rotation : (defaults.rotation || 0);
    const color = entry.color || defaults.color || "#335";
    const strokeColor = entry.strokeColor || defaults.strokeColor || "#f4e8d1";
    const letterSpacing = entry.letterSpacing || defaults.letterSpacing || "4px";
    const fontStyle = entry.fontStyle || defaults.fontStyle || "italic";
    const opacity = entry.opacity != null ? entry.opacity : (defaults.opacity != null ? defaults.opacity : 0.75);

    // Decide whether to render along a curved path. Enabled by default for
    // regions with 3+ hexes; can be forced on/off via entry.curve or
    // defaults.curve (true | false | "auto").
    const curveMode = entry.curve != null ? entry.curve : (defaults.curve != null ? defaults.curve : "auto");
    const useCurve = curveMode === true || (curveMode === "auto" && centers.length >= 3 && !entry.rotation);

    if (useCurve) {
      // Compute principal axis via PCA (ellipse-fit direction)
      let sxx = 0, syy = 0, sxy = 0;
      centers.forEach(([x, y]) => {
        const dx = x - cx, dy = y - cy;
        sxx += dx * dx;
        syy += dy * dy;
        sxy += dx * dy;
      });
      // 2x2 eigenvector of the covariance matrix — angle of the major axis
      const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
      const cosT = Math.cos(theta), sinT = Math.sin(theta);
      // Project each center onto the major axis (parameter along axis)
      const projected = centers.map(([x, y]) => {
        const dx = x - cx, dy = y - cy;
        return { x, y, t: dx * cosT + dy * sinT };
      });
      projected.sort((a, b) => a.t - b.t);
      const ordered = projected.map(p => [p.x, p.y]);
      // Build a smooth catmull-rom path through the ordered centers.
      const pathD = d3.line().curve(d3.curveCatmullRom.alpha(0.5))(ordered);
      const pathId = `region-label-path-${entryIdx}-${Math.floor(Math.random() * 1e6)}`;
      defs.append("path").attr("id", pathId).attr("d", pathD).attr("fill", "none");

      const textEl = labelGroup.append("text")
        .attr("font-family", FONT)
        .attr("font-size", fontSize + "px")
        .attr("font-style", fontStyle)
        .attr("letter-spacing", letterSpacing)
        .attr("fill", color)
        .attr("stroke", strokeColor)
        .attr("stroke-width", 3.5)
        .attr("paint-order", "stroke")
        .attr("opacity", opacity);
      textEl.append("textPath")
        .attr("href", "#" + pathId)
        .attr("xlink:href", "#" + pathId)
        .attr("startOffset", "50%")
        .attr("text-anchor", "middle")
        .text(entry.text);
    } else {
      labelGroup.append("text")
        .attr("x", cx).attr("y", cy)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("font-family", FONT)
        .attr("font-size", fontSize + "px")
        .attr("font-style", fontStyle)
        .attr("letter-spacing", letterSpacing)
        .attr("fill", color)
        .attr("stroke", strokeColor)
        .attr("stroke-width", 3.5)
        .attr("paint-order", "stroke")
        .attr("opacity", opacity)
        .attr("transform", rotation ? `rotate(${rotation}, ${cx}, ${cy})` : null)
        .text(entry.text);
    }
  });
}

// --- Elevation-aware mountain rendering ---
// Scales mountain peak size by the number of mountain neighbors (interior hex
// = tall peaks; border hex = shorter) and optionally draws hills on the
// external edges as a transition to adjacent non-mountain terrain.
function renderMountainsWithElevation(ctx, mountainDrawer, hillDrawer, options) {
  const { g, hexTerrain, HINT_SCALE, WIDTH, HEIGHT, mulberry32, seedFromString } = ctx;
  if (!hexTerrain) return;
  const density = (options && typeof options.density === "number") ? options.density : 1.0;

  const bcCol = 10, bcRow = 10;
  const size = HINT_SCALE / 2;
  const colStep = size * 2 * 0.75;
  const rowStep = size * Math.sqrt(3);

  const mountainHexes = new Set();
  Object.entries(hexTerrain).forEach(([hex, terrain]) => {
    if (terrain === "mountains") mountainHexes.add(hex);
  });
  if (mountainHexes.size === 0) return;

  const neighborsA = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1]];
  const neighborsB = [[0, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  const inscribed = size * Math.sqrt(3) / 2;
  const edgeMids = [
    [0, -inscribed],
    [size * 0.75, -inscribed / 2],
    [size * 0.75, inscribed / 2],
    [0, inscribed],
    [-size * 0.75, inscribed / 2],
    [-size * 0.75, -inscribed / 2],
  ];
  const edgeTangents = edgeMids.map(([mx, my]) => {
    const l = Math.sqrt(mx * mx + my * my) || 1;
    return [-my / l, mx / l];
  });

  const terrainGroup = g.append("g").attr("class", "terrain mountains-elev");

  mountainHexes.forEach(hex => {
    const col = parseInt(hex.substring(0, 2));
    const row = parseInt(hex.substring(2, 4));
    const isShifted = (col % 2) !== (bcCol % 2);
    const hx = (col - bcCol) * colStep + WIDTH / 2;
    const hy = (row - bcRow) * rowStep + (isShifted ? rowStep / 2 : 0) + HEIGHT / 2;
    const rng = mulberry32(seedFromString("mountain-" + hex));
    const neighbors = isShifted ? neighborsB : neighborsA;

    let mountainNeighborCount = 0;
    const externalEdges = [];
    neighbors.forEach((offset, i) => {
      const nKey = String(col + offset[0]).padStart(2, "0") + String(row + offset[1]).padStart(2, "0");
      if (mountainHexes.has(nKey)) mountainNeighborCount++;
      else externalEdges.push(i);
    });

    // Elevation factor: ~0.75 on isolated peak, ~1.6 on fully interior hex.
    // This drives BOTH peak size and how close to the edge peaks sit, so a
    // cluster of mountain hexes reads as a single continuous range without
    // adding more glyphs per hex.
    const elevation = 0.75 + (mountainNeighborCount / 6) * 0.85;

    // Whether each of the six edges borders another mountain hex. Peaks
    // drawn near such an edge are allowed to extend across — visually
    // stitching the adjacent hex's range to this one. Peaks near a non-
    // mountain edge are clamped so they don't spill into foreign terrain.
    const edgeIsMountain = neighbors.map((offset) => {
      const nKey = String(col + offset[0]).padStart(2, "0") + String(row + offset[1]).padStart(2, "0");
      return mountainHexes.has(nKey);
    });

    // One cluster per hex. The drawer itself renders a wide ridge of
    // sub-peaks that overlaps into neighbouring mountain hexes — two
    // clusters per hex would produce a double-stacked row (clearly wrong
    // against the Pauline Baynes reference).
    const peakCount = 1;

    // Anchor bias — each non-mountain neighbour pulls the placement anchor
    // AWAY from that edge (inward), so a hex on the border of the range
    // always has its peak(s) pulled toward the centre of the hex with
    // whitespace + transition hills near the non-mountain side.
    let anchorX = 0, anchorY = 0;
    neighbors.forEach((offset, i) => {
      if (edgeIsMountain[i]) return;
      // Vector pointing from edge midpoint toward hex centre = negative of edgeMids
      anchorX -= edgeMids[i][0] * 0.22;
      anchorY -= edgeMids[i][1] * 0.22;
    });

    // Ridge axis — if two OPPOSITE edges both border mountains, peaks are
    // arranged along the through-line so adjacent hexes' ridges appear to
    // connect in a continuous line.
    const oppositePairs = [[0, 3], [1, 4], [2, 5]];
    let ridgeAxis = null;
    for (const [a, b] of oppositePairs) {
      if (edgeIsMountain[a] && edgeIsMountain[b]) {
        ridgeAxis = [edgeMids[a], edgeMids[b]];
        break;
      }
    }

    const gridPoints = [];
    if (ridgeAxis && peakCount >= 2) {
      // Two peaks straddling centre along the ridge axis — this creates a
      // "pulled toward each other" line through the mountain cluster.
      const [p1, p2] = ridgeAxis;
      gridPoints.push([anchorX + p1[0] * 0.42, anchorY + p1[1] * 0.42]);
      gridPoints.push([anchorX + p2[0] * 0.42, anchorY + p2[1] * 0.42]);
    } else if (peakCount >= 2) {
      // Centre peak plus a second peak biased toward one of the mountain
      // neighbours (if any) so the cluster leans into the adjacent range.
      const mountainEdges = edgeIsMountain.map((m, i) => m ? i : -1).filter(i => i >= 0);
      gridPoints.push([anchorX, anchorY]);
      if (mountainEdges.length > 0) {
        const pick = mountainEdges[Math.floor(rng() * mountainEdges.length)];
        const [mx, my] = edgeMids[pick];
        gridPoints.push([anchorX + mx * 0.38, anchorY + my * 0.38]);
      } else {
        const a = rng() * Math.PI * 2;
        const r = size * 0.14;
        gridPoints.push([anchorX + Math.cos(a) * r, anchorY + Math.sin(a) * r]);
      }
    } else {
      // Single peak — place at the biased anchor (centre for fully
      // surrounded hexes, pulled inward for border hexes).
      gridPoints.push([anchorX, anchorY]);
    }

    // Three unique edge-normal axes for the flat-top hex (30°, 90°, 150°).
    // Each axis corresponds to an antipodal pair of edges (indices in the
    // neighbors array: N=0/S=3, NE=1/SW=4, SE=2/NW=5). A peak can safely
    // extend past an edge only if THAT edge borders another mountain.
    const axes = [
      { nx: Math.cos(Math.PI / 6), ny: Math.sin(Math.PI / 6), posEdge: 1, negEdge: 4 },   // 30° ↔ NE / SW
      { nx: 0,                       ny: 1,                     posEdge: 3, negEdge: 0 }, // 90° ↔  S /  N
      { nx: Math.cos(5 * Math.PI / 6), ny: Math.sin(5 * Math.PI / 6), posEdge: 5, negEdge: 2 }, // 150° ↔ NW / SE
    ];
    // Returns a scale factor ≤ 1 that pulls (ox,oy) toward centre as much
    // as needed so that a peak of radius r drawn there does not cross any
    // non-mountain edge. Crossing a mountain-mountain edge is allowed
    // (overlap into a neighbouring mountain hex reads as continuous range).
    function clampToHexUnlessMountainEdge(ox, oy, r) {
      let scale = 1;
      for (const { nx, ny, posEdge, negEdge } of axes) {
        const proj = ox * nx + oy * ny;
        const overflow = Math.abs(proj) - (inscribed - r);
        if (overflow <= 0) continue;
        // Which side of this axis are we overflowing toward?
        const edgeIdx = proj >= 0 ? posEdge : negEdge;
        if (edgeIsMountain[edgeIdx]) continue; // overlap into mountain — fine
        // Otherwise, pull in along this axis.
        const maxProj = Math.max(0, inscribed - r);
        if (Math.abs(proj) > 0) scale = Math.min(scale, maxProj / Math.abs(proj));
      }
      return [ox * scale, oy * scale];
    }

    gridPoints.forEach(([ox, oy]) => {
      const jitterX = (rng() - 0.5) * size * 0.08;
      const jitterY = (rng() - 0.5) * size * 0.08;
      // Large peaks that fill the hex. Interior hexes exceed the inscribed
      // radius on purpose — the clamp lets them spill into mountain
      // neighbours but not into foreign terrain. Sized ~10% smaller than
      // the initial 3× bump (the peaks were reading a touch too tall).
      const mSize = (25 + rng() * 13) * elevation;
      const [cx, cy] = clampToHexUnlessMountainEdge(ox + jitterX, oy + jitterY, mSize);
      mountainDrawer(terrainGroup, hx + cx, hy + cy, mSize, rng);
    });

    // Transition hills on the external edges (border hexes only)
    if (externalEdges.length > 0 && hillDrawer) {
      externalEdges.forEach(edgeIdx => {
        const [mx, my] = edgeMids[edgeIdx];
        const [tx, ty] = edgeTangents[edgeIdx];
        // Pull slightly outward from the hex center but still inside the hex
        const hillInset = 0.75;
        const hillCx = hx + mx * hillInset;
        const hillCy = hy + my * hillInset;
        const n = 1 + Math.floor(rng() * 2);
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0 : (i / (n - 1) - 0.5);
          const span = t * size * 0.55;
          const hillSize = 6 + rng() * 3;
          hillDrawer(terrainGroup, hillCx + tx * span, hillCy + ty * span, hillSize, rng);
        }
      });
    }
  });
}

// --- Region-based mountain rendering ---
// Finds connected groups of "mountains" hexes, computes a PCA spine
// through each region, and places single-peak glyphs along that spine.
// Produces the serpentine, multi-hex-spanning chain silhouette of
// Pauline Baynes-style ranges — unlike the per-hex cluster approach of
// renderMountainsWithElevation which can't escape hex-row alignment.
function renderMountainsByRegion(ctx, ridgeDrawer, options) {
  const { g, hexTerrain, HINT_SCALE, WIDTH, HEIGHT, mulberry32, seedFromString } = ctx;
  if (!hexTerrain) return;

  const bcCol = 10, bcRow = 10;
  const size = HINT_SCALE / 2;
  const colStep = size * 2 * 0.75;
  const rowStep = size * Math.sqrt(3);

  const hexCenter = (hex) => {
    const col = parseInt(hex.substring(0, 2));
    const row = parseInt(hex.substring(2, 4));
    const hx = (col - bcCol) * colStep + WIDTH / 2;
    const hy = (row - bcRow) * rowStep + (col % 2 !== bcCol % 2 ? rowStep / 2 : 0) + HEIGHT / 2;
    return [hx, hy];
  };

  const mountainHexes = new Set();
  Object.entries(hexTerrain).forEach(([hex, terrain]) => {
    if (terrain === "mountains") mountainHexes.add(hex);
  });
  if (mountainHexes.size === 0) return;

  const terrainGroup = g.append("g").attr("class", "terrain mountains-region");

  // Horizontal runs: a run is a chain of mountain hexes that share the
  // same vertical position (same row, same column parity → same y) and
  // are adjacent along the east-west axis (Δcol = ±2). Ridges run
  // east-to-west inside each run so the skyline never wiggles up/down
  // between rows — only within a row. A single mountain hex is a run
  // of length 1.
  const visited = new Set();
  const runs = [];
  mountainHexes.forEach(startHex => {
    if (visited.has(startHex)) return;
    const sCol = parseInt(startHex.substring(0, 2));
    const sRow = parseInt(startHex.substring(2, 4));
    const run = [startHex];
    visited.add(startHex);
    // Extend east.
    for (let col = sCol + 2; ; col += 2) {
      const h = String(col).padStart(2, "0") + String(sRow).padStart(2, "0");
      if (!mountainHexes.has(h) || visited.has(h)) break;
      run.push(h);
      visited.add(h);
    }
    // Extend west.
    for (let col = sCol - 2; ; col -= 2) {
      const h = String(col).padStart(2, "0") + String(sRow).padStart(2, "0");
      if (!mountainHexes.has(h) || visited.has(h)) break;
      run.unshift(h);
      visited.add(h);
    }
    runs.push(run);
  });

  runs.forEach((run, runIdx) => {
    const rng = mulberry32(seedFromString("mountain-run-" + run[0] + "-" + runIdx));
    const mSize = (18 + rng() * 6) * 0.99;

    // Each hex in the run becomes its own CLUSTER of peaks, rendered
    // as a separate ridge. Clusters are visually separated by the
    // natural gap at hex boundaries — matches the Baynes reference
    // where mountain ranges read as groups of 3-6 peaks, not one long
    // unbroken saw-tooth row.
    run.forEach(hexId => {
      const [hx, hy] = hexCenter(hexId);
      // Tighter cluster extent forces peak bases to overlap — matches
      // Baynes dense Drúwaith clusters where peaks share bases.
      const inset = size * 0.40;
      const leftX = hx - size + inset;
      const rightX = hx + size - inset;
      const extent = rightX - leftX;
      // Per-hex cluster: 7-11 small peaks (Baynes Misty-Mtn density).
      const peakCount = 7 + Math.floor(rng() * 5);

      // Heights: most peaks are similar-sized (small), with just slight
      // variation. No dominant hero that swallows the hex — reference
      // clusters feel like a group of similar-size teeth, not 1 giant
      // peak + foothills.
      // One hero index per cluster — rises ~1.6× taller than neighbours
      // to match Baynes reference where heros clearly stand out.
      const heroIdx = Math.floor(rng() * peakCount);
      const peaks = [];
      for (let i = 0; i < peakCount; i++) {
        const t = (i + 0.5) / peakCount + (rng() - 0.5) * 0.35 / peakCount;
        const px = leftX + t * extent;
        const isHero = i === heroIdx;
        const hBase = isHero ? 0.85 + rng() * 0.25
                             : 0.30 + Math.pow(rng(), 1.3) * 0.40;
        const pyJitter = (rng() - 0.5) * mSize * 0.50;
        peaks.push({
          px,
          py: hy + pyJitter,
          h: mSize * hBase,
          pw: mSize * (0.55 + rng() * 0.20),
          isHero,
          t,
        });
      }

      ridgeDrawer(terrainGroup, peaks, rng, { mSize, size });
    });
  });
}

// --- Neighbor-aware farmland scattering ---
// Farmland hexes: place farm clusters close to edges that border roads or
// rivers (food needs water and trade); leave a gap at edges that border
// forest, mountains, or hills (farms don't push into those).
function renderFarmlandBiased(ctx, drawer) {
  const { g, hexTerrain, riverPath, roadPath, HINT_SCALE, WIDTH, HEIGHT, mulberry32, seedFromString } = ctx;
  if (!hexTerrain) return;

  const bcCol = 10, bcRow = 10;
  const size = HINT_SCALE / 2;
  const colStep = size * 2 * 0.75;
  const rowStep = size * Math.sqrt(3);

  // Collect hex sets we'll reference for neighbor bias
  const farmlandHexes = [];
  Object.entries(hexTerrain).forEach(([hex, terrain]) => {
    if (terrain === "farmland") farmlandHexes.push(hex);
  });
  if (farmlandHexes.length === 0) return;

  const riverSet = new Set(Array.isArray(riverPath) ? riverPath : []);
  const roadSet = new Set();
  if (Array.isArray(roadPath)) {
    if (typeof roadPath[0] === "string") {
      roadPath.forEach(h => typeof h === "string" && roadSet.add(h));
    } else {
      roadPath.forEach(entry => {
        const hs = Array.isArray(entry) ? entry : (entry && entry.hexes) || [];
        hs.forEach(h => typeof h === "string" && roadSet.add(h));
      });
    }
  }
  const repulsiveTerrains = new Set(["forest", "forested-hills", "mountains", "hills"]);

  const neighborsA = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1]];
  const neighborsB = [[0, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  const inscribed = size * Math.sqrt(3) / 2;
  const edgeMids = [
    [0, -inscribed],
    [size * 0.75, -inscribed / 2],
    [size * 0.75, inscribed / 2],
    [0, inscribed],
    [-size * 0.75, inscribed / 2],
    [-size * 0.75, -inscribed / 2],
  ];
  const edgeTangents = edgeMids.map(([mx, my]) => {
    const l = Math.sqrt(mx * mx + my * my) || 1;
    return [-my / l, mx / l];
  });

  const terrainGroup = g.append("g").attr("class", "terrain farmland-biased");

  // Tile slots inside a hex (2 rows × 3 cols). Fields tile in slots without
  // overlapping; houses go in slots that face a road (or the most central
  // slot if there is no road neighbor); repel-facing slots stay empty.
  const slotCols = 3, slotRows = 2;
  const slotSpanX = size * 0.5;       // horizontal spacing between slot centers
  const slotSpanY = rowStep * 0.28;    // vertical spacing
  const slotW = slotSpanX * 0.85;      // field/house footprint (leaves gaps)
  const slotH = slotSpanY * 0.95;
  const slotPositions = [];
  for (let sr = 0; sr < slotRows; sr++) {
    for (let sc = 0; sc < slotCols; sc++) {
      slotPositions.push({
        dx: (sc - (slotCols - 1) / 2) * slotSpanX,
        dy: (sr - (slotRows - 1) / 2) * slotSpanY,
      });
    }
  }

  farmlandHexes.forEach(hex => {
    const col = parseInt(hex.substring(0, 2));
    const row = parseInt(hex.substring(2, 4));
    const isShifted = (col % 2) !== (bcCol % 2);
    const hx = (col - bcCol) * colStep + WIDTH / 2;
    const hy = (row - bcRow) * rowStep + (isShifted ? rowStep / 2 : 0) + HEIGHT / 2;
    const rng = mulberry32(seedFromString("farmland-" + hex));
    const neighbors = isShifted ? neighborsB : neighborsA;

    // Classify each of the six edges
    const edgeKind = neighbors.map(([dc, dr]) => {
      const nKey = String(col + dc).padStart(2, "0") + String(row + dr).padStart(2, "0");
      if (riverSet.has(nKey) || roadSet.has(nKey)) return "road";
      const nTerrain = hexTerrain[nKey];
      if (repulsiveTerrains.has(nTerrain)) return "repel";
      return "neutral";
    });

    const colors = ctx.colors || {};
    const accent = colors.INK || colors.BLUE_INK || "#333";

    // If this hex is on the road/river itself, the path passes through the
    // hex interior — slots near that corridor should stay empty so fields
    // and houses don't sit directly on the line.
    const hexOnRoad = roadSet.has(hex) || riverSet.has(hex);
    // Identify the corridor direction through the hex: find the two edges
    // whose neighbors are ALSO on the same path. The line between their
    // midpoints is the approximate route through this hex.
    let corridorMid1 = null, corridorMid2 = null;
    if (hexOnRoad) {
      const onPathEdges = [];
      neighbors.forEach(([dc, dr], i) => {
        const nKey = String(col + dc).padStart(2, "0") + String(row + dr).padStart(2, "0");
        if (roadSet.has(nKey) || riverSet.has(nKey)) onPathEdges.push(i);
      });
      if (onPathEdges.length >= 2) {
        corridorMid1 = edgeMids[onPathEdges[0]];
        corridorMid2 = edgeMids[onPathEdges[onPathEdges.length - 1]];
      }
    }

    // Distance from point (dx, dy) to the line segment (p1, p2).
    function distToSegment(dx, dy, p1, p2) {
      const ax = p1[0], ay = p1[1], bx = p2[0], by = p2[1];
      const vx = bx - ax, vy = by - ay;
      const len2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((dx - ax) * vx + (dy - ay) * vy) / len2));
      const qx = ax + t * vx, qy = ay + t * vy;
      return Math.sqrt((dx - qx) * (dx - qx) + (dy - qy) * (dy - qy));
    }

    // For each slot, find the edge it "faces" (highest dot with its direction).
    const slotRoles = slotPositions.map(({ dx, dy }) => {
      // Skip slots sitting on the road/river corridor — leave them empty so
      // the route line has clear space.
      if (corridorMid1 && corridorMid2) {
        const d = distToSegment(dx, dy, corridorMid1, corridorMid2);
        if (d < size * 0.28) return "empty";
      }
      const sl = Math.sqrt(dx * dx + dy * dy) || 1;
      let bestI = 0, bestDot = -Infinity;
      edgeMids.forEach(([mx, my], i) => {
        const ml = Math.sqrt(mx * mx + my * my) || 1;
        const dot = (dx / sl) * (mx / ml) + (dy / sl) * (my / ml);
        if (dot > bestDot) { bestDot = dot; bestI = i; }
      });
      const kind = edgeKind[bestI];
      if (kind === "repel" && bestDot > 0.55) return "empty";
      if (kind === "road") return "house";
      return "field";
    });

    // If no slot picked up a "house" role (no road-adjacent hex), convert the
    // slot closest to the hex center into a house so the farmstead always
    // has at least one visible dwelling — even if every edge faces repel.
    if (!slotRoles.includes("house")) {
      let centerI = 0, centerDist = Infinity;
      slotPositions.forEach(({ dx, dy }, i) => {
        const d = dx * dx + dy * dy;
        if (d < centerDist) { centerDist = d; centerI = i; }
      });
      slotRoles[centerI] = "house";
    }

    // Render each slot in its grid position. Houses can get slight jitter to
    // avoid looking too regimented; fields stay aligned to the tile grid.
    slotPositions.forEach(({ dx, dy }, i) => {
      const role = slotRoles[i];
      if (role === "empty") return;
      if (role === "house") {
        const jx = (rng() - 0.5) * size * 0.06;
        const jy = (rng() - 0.5) * rowStep * 0.05;
        // Compact farmstead sized to fit its slot (roughly half the slot
        // width so the buildings read but don't crowd the fields).
        drawer(terrainGroup, hx + dx + jx, hy + dy + jy, 9 + rng() * 1.5, rng);
      } else {
        // Field — tile aligned. Small jitter within slot so not perfectly on grid.
        const jx = (rng() - 0.5) * size * 0.03;
        const jy = (rng() - 0.5) * rowStep * 0.03;
        drawFieldPatch(terrainGroup, hx + dx + jx, hy + dy + jy, slotW, slotH, rng, accent);
      }
    });

    // Occasional tiny animal tucked into one of the field slots.
    const fieldSlots = slotPositions.filter((_, i) => slotRoles[i] === "field");
    if (fieldSlots.length > 0 && rng() > 0.5) {
      const pick = fieldSlots[Math.floor(rng() * fieldSlots.length)];
      const ax = pick.dx + (rng() - 0.5) * slotW * 0.4;
      const ay = pick.dy + slotH * 0.15;
      drawAnimalGlyph(terrainGroup, hx + ax, hy + ay, rng, accent);
    }
  });
}

// Small field patch sized to fit a specific slot. Traditional old-map
// field texture varied per patch: cross-hatch, parallel furrows, or plain
// vertical rows. Passing explicit w/h lets callers tile patches next to
// each other without overlapping; hatch lines are clipped to the rect.
function drawFieldPatch(g, x, y, w, h, rng, color) {
  // Small rotation only — the grid should still read as tiled fields.
  const rot = (rng() - 0.5) * 8;
  const patchG = g.append("g").attr("transform", `translate(${x}, ${y}) rotate(${rot})`);
  // Outer rectangle (faint boundary)
  patchG.append("rect")
    .attr("x", -w / 2).attr("y", -h / 2).attr("width", w).attr("height", h)
    .attr("fill", "none").attr("stroke", color)
    .attr("stroke-width", 0.45).attr("opacity", 0.4);
  // Clip hatch lines to the rect so diagonals don't bleed past the field
  const clipId = `fp-clip-${Math.floor(rng() * 1e9).toString(36)}`;
  patchG.append("clipPath").attr("id", clipId)
    .append("rect").attr("x", -w / 2).attr("y", -h / 2).attr("width", w).attr("height", h);
  const hatchG = patchG.append("g").attr("clip-path", `url(#${clipId})`);

  // Pick a style deterministically from rng so neighboring fields differ
  const pick = rng();
  const strokeW = 0.3;
  if (pick < 0.4) {
    // Cross-hatch — two sets of diagonals
    const step = 3;
    const count = Math.max(4, Math.round((w + h) / step));
    for (let i = 0; i < count; i++) {
      const tx = -w / 2 + (i / count) * (w + h);
      hatchG.append("line")
        .attr("x1", tx).attr("y1", -h / 2)
        .attr("x2", tx - h).attr("y2", h / 2)
        .attr("stroke", color).attr("stroke-width", strokeW).attr("opacity", 0.3);
      hatchG.append("line")
        .attr("x1", tx - h).attr("y1", -h / 2)
        .attr("x2", tx).attr("y2", h / 2)
        .attr("stroke", color).attr("stroke-width", strokeW).attr("opacity", 0.28);
    }
  } else if (pick < 0.75) {
    // Parallel diagonal furrows — more uniform look
    const step = 2.5;
    const count = Math.max(4, Math.round((w + h) / step));
    const dir = rng() > 0.5 ? 1 : -1;
    for (let i = 0; i < count; i++) {
      const tx = -w / 2 + (i / count) * (w + h);
      hatchG.append("line")
        .attr("x1", tx).attr("y1", -h / 2)
        .attr("x2", tx - dir * h).attr("y2", h / 2)
        .attr("stroke", color).attr("stroke-width", strokeW).attr("opacity", 0.35);
    }
  } else {
    // Vertical rows of crop furrows (stubby dashes) — classic plough marks
    const step = 2.2;
    const count = Math.max(3, Math.round(w / step));
    for (let i = 0; i < count; i++) {
      const fx = -w / 2 + (i + 0.5) * (w / count);
      hatchG.append("line")
        .attr("x1", fx).attr("y1", -h / 2 + 1)
        .attr("x2", fx).attr("y2", h / 2 - 1)
        .attr("stroke", color).attr("stroke-width", strokeW).attr("opacity", 0.35);
    }
  }
}

// Tiny livestock glyph: oval body + small head + 4 leg ticks.
// Uses outline strokes only so it reads at tiny scale without becoming a blob.
function drawAnimalGlyph(g, x, y, rng, color) {
  const g2 = g.append("g").attr("transform", `translate(${x}, ${y})`);
  const bodyW = 3;
  const bodyH = 1.5;
  // Body oval
  g2.append("ellipse")
    .attr("cx", 0).attr("cy", 0).attr("rx", bodyW).attr("ry", bodyH)
    .attr("fill", "none").attr("stroke", color)
    .attr("stroke-width", 0.45).attr("opacity", 0.75);
  // Head on one side
  const headDir = rng() > 0.5 ? 1 : -1;
  g2.append("circle")
    .attr("cx", headDir * (bodyW + 0.3)).attr("cy", -0.4).attr("r", 0.9)
    .attr("fill", "none").attr("stroke", color)
    .attr("stroke-width", 0.4).attr("opacity", 0.75);
  // 4 leg ticks
  for (let i = 0; i < 4; i++) {
    const lx = -bodyW * 0.7 + i * (bodyW * 1.4 / 3);
    g2.append("line")
      .attr("x1", lx).attr("y1", bodyH * 0.6)
      .attr("x2", lx).attr("y2", bodyH * 1.9)
      .attr("stroke", color).attr("stroke-width", 0.35).attr("opacity", 0.7);
  }
}

// --- Edge-aware forest tree scattering ---
// For hexes in `matchTerrains` (e.g. forest, forested-hills), concentrate tree
// scatter centers along edges that border non-matching neighbors. Interior
// hexes (all neighbors match) get sparse scatter. This produces the classic
// "border of trees" look where the forest silhouette reads clearly.
function renderForestEdgeTrees(ctx, drawer, matchTerrains, options) {
  const { g, hexTerrain, HINT_SCALE, WIDTH, HEIGHT, mulberry32, seedFromString, nodes } = ctx;
  if (!hexTerrain || Object.keys(hexTerrain).length === 0) return;
  const density = (options && typeof options.density === "number") ? options.density : 1.0;

  const bcCol = 10, bcRow = 10;
  const size = HINT_SCALE / 2;
  const colStep = size * 2 * 0.75;
  const rowStep = size * Math.sqrt(3);

  const matchSet = new Set(matchTerrains);
  const forestHexes = new Set();
  Object.entries(hexTerrain).forEach(([hex, terrain]) => {
    if (matchSet.has(terrain)) forestHexes.add(hex);
  });
  if (forestHexes.size === 0) return;

  // Keep-out zones — large structures (keeps, towers, walled towns, etc.)
  // must not have trees drawn over them. Build a per-hex list of
  // {cx, cy, r} circles to avoid during placement.
  const POINT_TYPE_KEEPOUT = {
    heart:      size * 1.05,
    fortress:   size * 0.85,
    settlement: size * 0.55,
    tower:      size * 0.55,
    dungeon:    size * 0.45,
    sanctuary:  size * 0.40,
    ruin:       size * 0.35,
    lair:       size * 0.30,
    waypoint:   size * 0.25,
  };
  const keepoutByHex = new Map();
  (nodes || []).forEach(n => {
    if (!n.hex || typeof n.x !== "number" || typeof n.y !== "number") return;
    const r = POINT_TYPE_KEEPOUT[n.point_type];
    if (!r) return;
    const list = keepoutByHex.get(n.hex) || [];
    list.push({ x: n.x, y: n.y, r });
    keepoutByHex.set(n.hex, list);
  });

  const neighborsA = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1]];
  const neighborsB = [[0, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  // Flat-top hex edge midpoint offsets in neighbor order [N, NE, SE, S, SW, NW]
  const inscribed = size * Math.sqrt(3) / 2;
  const edgeMids = [
    [0, -inscribed],
    [size * 0.75, -inscribed / 2],
    [size * 0.75, inscribed / 2],
    [0, inscribed],
    [-size * 0.75, inscribed / 2],
    [-size * 0.75, -inscribed / 2],
  ];
  // Tangent along each edge (90° from midpoint direction)
  const edgeTangents = edgeMids.map(([mx, my]) => {
    const l = Math.sqrt(mx * mx + my * my) || 1;
    return [-my / l, mx / l];
  });

  const terrainGroup = g.append("g").attr("class", "terrain forest-edge-trees");

  forestHexes.forEach(hex => {
    const col = parseInt(hex.substring(0, 2));
    const row = parseInt(hex.substring(2, 4));
    const isShifted = (col % 2) !== (bcCol % 2);
    const hx = (col - bcCol) * colStep + WIDTH / 2;
    const hy = (row - bcRow) * rowStep + (isShifted ? rowStep / 2 : 0) + HEIGHT / 2;
    const rng = mulberry32(seedFromString("forest-" + hex));
    const neighbors = isShifted ? neighborsB : neighborsA;

    const externalEdges = [];
    neighbors.forEach((offset, i) => {
      const nKey = String(col + offset[0]).padStart(2, "0") + String(row + offset[1]).padStart(2, "0");
      if (!forestHexes.has(nKey)) externalEdges.push(i);
    });

    // Smaller tree glyphs (trees are ~½ their former size) so the higher
    // count below doesn't pile up into overlapping blobs.
    const treeSize = () => 5 + rng() * 3;

    // Poisson-ish scatter: generate candidate points and reject any that
    // land within minDist of an already-placed tree, OR inside the
    // keep-out radius of an important node in this hex (so trees never
    // cover a keep, tower, walled city, etc.).
    const keepout = keepoutByHex.get(hex) || [];
    const placed = [];
    function place(x, y, s, minDist) {
      // Absolute coords for node keep-out test
      const ax = hx + x, ay = hy + y;
      for (const k of keepout) {
        const dx = k.x - ax, dy = k.y - ay;
        if (dx * dx + dy * dy < k.r * k.r) return false;
      }
      for (let i = 0; i < placed.length; i++) {
        const dx = placed[i][0] - x, dy = placed[i][1] - y;
        if (dx * dx + dy * dy < minDist * minDist) return false;
      }
      placed.push([x, y]);
      drawer(terrainGroup, hx + x, hy + y, s, rng);
      return true;
    }
    function scatterInCircle(targetCount, maxR, minDist) {
      let tries = 0, placedCount = 0;
      while (placedCount < targetCount && tries < targetCount * 12) {
        const a = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * maxR;
        if (place(Math.cos(a) * r, Math.sin(a) * r, treeSize(), minDist)) placedCount++;
        tries++;
      }
    }

    // Classify each of the six edges
    const forestEdges = [];
    neighbors.forEach((offset, i) => {
      if (externalEdges.includes(i)) return;
      const nKey = String(col + offset[0]).padStart(2, "0") + String(row + offset[1]).padStart(2, "0");
      if (forestHexes.has(nKey)) forestEdges.push(i);
    });

    // Density gradient: trees are sparse near the forest's outer boundary
    // (non-forest neighbours) and get progressively denser toward the
    // interior. `depthFromExternalEdge(x, y)` returns 0 at an external
    // edge, 1 well inside the forest.
    const externalEdgeNormals = externalEdges.map(i => {
      const [mx, my] = edgeMids[i];
      const mLen = Math.sqrt(mx * mx + my * my) || 1;
      return { nx: -mx / mLen, ny: -my / mLen };
    });
    function depthFromExternalEdge(x, y) {
      if (externalEdgeNormals.length === 0) return 1;
      let minDepth = 1;
      for (const { nx, ny } of externalEdgeNormals) {
        // Projection onto inward normal; at the edge = -inscribed, at centre = 0
        const proj = x * nx + y * ny;
        const depth = (proj + inscribed) / (inscribed * 1.1);
        if (depth < minDepth) minDepth = depth;
      }
      return Math.max(0, Math.min(1, minDepth));
    }

    // Candidate-based scatter that uses the density gradient. We aim for
    // `targetCount` successful placements across the hex; candidates near
    // an external edge are accepted with lower probability so growth fades
    // out near the forest boundary.
    function gradientScatter(targetCount, maxR, minDist, sizeFn) {
      let tries = 0, placedCount = 0;
      const limit = targetCount * 16;
      while (placedCount < targetCount && tries < limit) {
        tries++;
        const a = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * maxR;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        const depth = depthFromExternalEdge(x, y);
        // Gentle sapling probability curve — depth=0 gives ~10% chance,
        // depth=1 gives 100%. Saplings near the edge are smaller too.
        const p = 0.1 + 0.9 * Math.pow(depth, 1.4);
        if (rng() > p) continue;
        const s = sizeFn(depth);
        if (place(x, y, s, minDist)) placedCount++;
      }
    }

    // Tree-size function: small saplings near the edge, full-size trees
    // in the interior.
    const treeSizeByDepth = d => (4 + d * 3) + rng() * 2;

    if (externalEdges.length === 0) {
      // Fully interior forest hex — blanket the whole body with trees,
      // right out to the hex edges so neighbouring forest hexes never
      // show a gap at shared edges.
      const baseN = 24 + Math.floor(rng() * 10);
      gradientScatter(Math.max(1, Math.round(baseN * density)), size * 0.98, 6, () => treeSize());
      return;
    }

    // Border hex — density gradient: sparse near external edges, denser
    // toward the interior. Target count stays roughly the same as an
    // interior hex; the gradient acceptance naturally thins out the
    // external boundary.
    const baseN = 22 + Math.floor(rng() * 8);
    gradientScatter(Math.max(1, Math.round(baseN * density)), size * 0.98, 6, treeSizeByDepth);

    // Forest-bordered edges still get a dense continuous tree line so the
    // canopy flows seamlessly into the neighbouring forest hex.
    forestEdges.forEach(edgeIdx => {
      const [mx, my] = edgeMids[edgeIdx];
      const [tx, ty] = edgeTangents[edgeIdx];
      const inset = 0.95;
      const mxInset = mx * inset;
      const myInset = my * inset;
      const mLen = Math.sqrt(mx * mx + my * my) || 1;
      const n = Math.max(2, Math.round((12 + rng() * 5) * density));
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : (i / (n - 1) - 0.5);
        const span = t * size * 0.85;
        const jitterX = (rng() - 0.5) * size * 0.08;
        const jitterY = (rng() - 0.5) * size * 0.08;
        const depthJitter = rng() * size * 0.12;
        const inwardX = -mx / mLen * depthJitter;
        const inwardY = -my / mLen * depthJitter;
        const ox = mxInset + tx * span + jitterX + inwardX;
        const oy = myInset + ty * span + jitterY + inwardY;
        place(ox, oy, treeSize(), 6);
      }
    });
  });
}

// --- Hex hover info ---
// Updates the side info panel based on which hex the pointer is over.
// Uses SVG-level mousemove so node click handlers keep working.
function renderHexHover(ctx) {
  const { g, HINT_SCALE, WIDTH, HEIGHT, nodes, hexTerrain } = ctx;
  // Unified panel — one overlay drives both node-click and hex-hover.
  const panel = document.getElementById("detail-panel");
  if (!panel) return;

  const bcCol = 10, bcRow = 10;
  const size = HINT_SCALE / 2;
  const colStep = size * 2 * 0.75;
  const rowStep = size * Math.sqrt(3);

  // Build hex → nodes lookup
  const hexNodes = {};
  (nodes || []).forEach(n => {
    if (!n.hex) return;
    (hexNodes[n.hex] = hexNodes[n.hex] || []).push(n);
  });
  // Also include local-scale nodes from graphData (filtered out of nodes for overland).
  if (graphData && Array.isArray(graphData.nodes)) {
    graphData.nodes.forEach(n => {
      if (!n.hex) return;
      if ((hexNodes[n.hex] || []).some(existing => existing.id === n.id)) return;
      (hexNodes[n.hex] = hexNodes[n.hex] || []).push(n);
    });
  }

  // Attach mousemove on the SVG itself so nodes retain their click handlers.
  // d3.pointer against `g` translates event coords into the map's user
  // coordinate system, accounting for zoom/pan.
  const svgSel = d3.select(g.node().ownerSVGElement);

  // Hover highlight polygon — drawn once, repositioned on mousemove.
  const hexVertices = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * 60) * Math.PI / 180;
    hexVertices.push([size * Math.cos(a), size * Math.sin(a)]);
  }
  const highlight = g.append("polygon")
    .attr("class", "hex-hover-highlight")
    .attr("points", hexVertices.map(v => v.join(",")).join(" "))
    .attr("fill", "none")
    .attr("stroke", "currentColor")
    .attr("stroke-width", 1.2)
    .attr("opacity", 0)
    .style("pointer-events", "none");

  // Valid hex window — must agree with grids/hex.js. Hexes outside this
  // range don't exist on the map, so we don't highlight or open a panel
  // for them.
  const MAX_CR = 20;

  // Approximate pixel → hex for flat-top offset layout
  function pixelToHex(px, py) {
    const xRel = px - WIDTH / 2;
    // Iterate nearby candidate cols and pick the one whose center is closest
    const colGuess = Math.round(xRel / colStep) + bcCol;
    let best = null, bestDist = Infinity;
    for (let dc = -1; dc <= 1; dc++) {
      const col = colGuess + dc;
      const isShifted = (col % 2) !== (bcCol % 2);
      const colX = (col - bcCol) * colStep + WIDTH / 2;
      const rowOff = isShifted ? rowStep / 2 : 0;
      const yRel = py - HEIGHT / 2 - rowOff;
      const rowGuess = Math.round(yRel / rowStep) + bcRow;
      for (let dr = -1; dr <= 1; dr++) {
        const row = rowGuess + dr;
        const rowY = (row - bcRow) * rowStep + rowOff + HEIGHT / 2;
        const dx = px - colX, dy = py - rowY;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist) { bestDist = d2; best = { col, row }; }
      }
    }
    if (!best) return null;
    const { col, row } = best;
    if (col < 0 || row < 0 || col > MAX_CR || row > MAX_CR) return null;
    return `${String(col).padStart(2, "0")}${String(row).padStart(2, "0")}`;
  }

  function hexCenter(hex) {
    const col = parseInt(hex.substring(0, 2));
    const row = parseInt(hex.substring(2, 4));
    const isShifted = (col % 2) !== (bcCol % 2);
    const hx = (col - bcCol) * colStep + WIDTH / 2;
    const hy = (row - bcRow) * rowStep + (isShifted ? rowStep / 2 : 0) + HEIGHT / 2;
    return [hx, hy];
  }

  let currentHex = null;
  // Shift-held coordinate readout (x_hint/y_hint in inches from origin at Blackwater Crossing hex 1010).
  // Key handlers live on the window but need re-binding per render. Remove prior
  // handlers so style switches don't leak listeners.
  const coordEl = document.getElementById("coord-readout");
  if (window._shiftKeyDownHandler) window.removeEventListener("keydown", window._shiftKeyDownHandler);
  if (window._shiftKeyUpHandler) window.removeEventListener("keyup", window._shiftKeyUpHandler);
  const shiftState = { held: false };
  window._shiftKeyDownHandler = (e) => { if (e.key === "Shift") shiftState.held = true; };
  window._shiftKeyUpHandler = (e) => {
    if (e.key === "Shift") {
      shiftState.held = false;
      if (coordEl) coordEl.classList.remove("visible");
    }
  };
  window.addEventListener("keydown", window._shiftKeyDownHandler);
  window.addEventListener("keyup", window._shiftKeyUpHandler);

  // Helper: update panel + highlight for a given pointer position.
  function syncToPointer(event) {
    const pt = d3.pointer(event, g.node());
    const hex = pixelToHex(pt[0], pt[1]);
    if (!hex) {
      // Pointer is outside the valid hex window — hide the highlight and
      // forget the last hex so re-entering the map re-triggers an update.
      highlight.attr("opacity", 0);
      currentHex = null;
      return;
    }
    if (hex !== currentHex) {
      currentHex = hex;
      const [cx, cy] = hexCenter(hex);
      highlight
        .attr("transform", `translate(${cx}, ${cy})`)
        .attr("opacity", 0.5);
      updatePanel(hex);
    }
  }

  svgSel.on("mousemove.hex-hover", function (event) {
    const pt = d3.pointer(event, g.node());
    syncToPointer(event);
    // Shift-held inch readout
    if (coordEl && shiftState.held) {
      const xInches = (pt[0] - WIDTH / 2) / HINT_SCALE;
      const yInches = (pt[1] - HEIGHT / 2) / HINT_SCALE;
      coordEl.textContent = `x: ${xInches.toFixed(2)}″   y: ${yInches.toFixed(2)}″`;
      coordEl.style.left = (event.clientX + 14) + "px";
      coordEl.style.top = (event.clientY + 14) + "px";
      coordEl.classList.add("visible");
    } else if (coordEl) {
      coordEl.classList.remove("visible");
    }
  });
  // Click/tap — mobile support. Opens the panel for whatever hex was
  // clicked/tapped. Reuses the same hover path so behaviour is uniform.
  svgSel.on("click.hex-hover", function (event) {
    syncToPointer(event);
  });
  svgSel.on("mouseleave.hex-hover", () => {
    // Don't clear the panel on mouseleave — leave last-selected hex info
    // visible. User closes via the X button. Highlight hides though.
    highlight.attr("opacity", 0);
    if (coordEl) coordEl.classList.remove("visible");
  });

  // Pre-compute the set of road hexes so we can tell per hex whether the
  // faster "on road" rate applies.
  const roadHexSet = new Set();
  if (graphData && Array.isArray(graphData.road_path)) {
    const entries = typeof graphData.road_path[0] === "string"
      ? [{ hexes: graphData.road_path }]
      : graphData.road_path;
    entries.forEach(e => {
      const hs = Array.isArray(e) ? e : (e && e.hexes) || [];
      hs.forEach(h => roadHexSet.add(h));
    });
  }

  function updatePanel(hex) {
    const terrain = (hexTerrain && hexTerrain[hex]) || null;
    const pois = hexNodes[hex] || [];
    // Always open the panel — every hex gets a card, even empty ones.
    // Hex id (mono, small-caps at the top)
    document.getElementById("panel-hex-id").textContent = "HEX " + hex;
    // Travel-time line — per-hex rate in days. If the hex is on a road, show
    // both the off-road rate and the faster on-road rate.
    const travelEl = document.getElementById("panel-travel");
    if (travelEl) {
      const offRoad = hexTravelDays(hex, hexTerrain);
      const onRoad = offRoad * ROAD_MULTIPLIER;
      const onThisRoad = roadHexSet.has(hex);
      if (onThisRoad) {
        travelEl.innerHTML = `Travel: <strong>${formatDaysLabel(onRoad)}</strong> per hex on road · ${formatDaysLabel(offRoad)} off-road`;
      } else {
        travelEl.innerHTML = `Travel: <strong>${formatDaysLabel(offRoad)}</strong> per hex · ${formatDaysLabel(onRoad)} if on road`;
      }
    }
    // Main title — the terrain or the first named POI's name
    const titleEl = document.getElementById("panel-name");
    const typeEl = document.getElementById("panel-type");
    const descEl = document.getElementById("panel-desc");
    if (pois.length === 1) {
      // Single POI — use its name as heading, description in main body
      const n = pois[0];
      titleEl.textContent = n.name || n.id;
      typeEl.textContent = (n.point_type ? n.point_type.charAt(0).toUpperCase() + n.point_type.slice(1) : "")
        + (n.terrain ? " \u2022 " + n.terrain : "")
        + (terrain && !n.terrain ? " \u2022 " + terrain.replace(/-/g, " ") : "");
      descEl.textContent = n.description || "";
    } else {
      // Terrain-only or multi-POI — use terrain as heading, list POIs below
      titleEl.textContent = terrain ? terrain.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "Empty hex";
      typeEl.textContent = "";
      descEl.textContent = "";
    }
    // POI list below (shown for multi-POI hexes, hidden for single-node)
    const poisEl = document.getElementById("panel-pois");
    if (pois.length === 0) {
      poisEl.innerHTML = '<div class="hex-empty">No points of interest in this hex</div>';
    } else if (pois.length === 1) {
      poisEl.innerHTML = "";
    } else {
      poisEl.innerHTML = '<div class="hex-pois-header" style="font-size:13px;color:var(--panel-heading,#8b2500);margin-bottom:6px;border-top:1px solid var(--panel-type,#5a4a3a);padding-top:8px;">Points of Interest</div>' + pois.map(n => {
        const name = escapeHtml(n.name || n.id);
        const type = escapeHtml((n.point_type || "") + (n.scale === "local" ? " (local)" : ""));
        const desc = n.description ? escapeHtml(n.description) : "";
        return `<div class="poi"><div class="poi-name">${name}</div>` +
          (type ? `<div class="poi-type">${type}</div>` : "") +
          (desc ? `<div class="poi-desc">${desc}</div>` : "") +
          "</div>";
      }).join("");
    }
    // Combined connections (paths from any POI in this hex)
    const connEl = document.getElementById("panel-connections");
    if (pois.length > 0 && graphData && graphData.links) {
      const seen = new Set();
      const conns = [];
      pois.forEach(node => {
        graphData.links.forEach(l => {
          const srcId = l.source.id || l.source;
          const tgtId = l.target.id || l.target;
          if (srcId === node.id || tgtId === node.id) {
            const other = srcId === node.id ? l.target : l.source;
            const otherId = other.id || other;
            const key = `${node.id}->${otherId}`;
            if (seen.has(key)) return;
            seen.add(key);
            const otherName = other.name || other.id || other;
            const days = l.days ? ` (${l.days} ${l.days === 1 ? "day" : "days"})` : "";
            const type = l.path_type ? ` \u2014 ${l.path_type}` : "";
            conns.push(`<li>\u2192 ${escapeHtml(otherName)}${days}${type}</li>`);
          }
        });
      });
      connEl.innerHTML = conns.length
        ? `<h3>Paths</h3><ul>${conns.join("")}</ul>`
        : "";
    } else {
      connEl.innerHTML = "";
    }
    panel.classList.add("open");
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
}

// --- Terrain region edges ---
// Traces the outer boundary of a contiguous terrain region as hex edges,
// drawing them as slightly wobbled ink lines. Gives forests (or any terrain
// you nominate) a crisp, well-defined silhouette.
// matchTerrains: array of terrain-type strings treated as "inside" the region.
function renderTerrainEdges(ctx, matchTerrains, edgeStyle = {}) {
  const { g, hexTerrain, HINT_SCALE, WIDTH, HEIGHT, mulberry32, seedFromString } = ctx;
  if (!hexTerrain || Object.keys(hexTerrain).length === 0) return;

  const bcCol = 10, bcRow = 10;
  const size = HINT_SCALE / 2;
  const colStep = size * 2 * 0.75;
  const rowStep = size * Math.sqrt(3);

  const matchSet = new Set(matchTerrains);
  const inside = new Set();
  Object.entries(hexTerrain).forEach(([hex, terrain]) => {
    if (matchSet.has(terrain)) inside.add(hex);
  });
  if (inside.size === 0) return;

  const {
    color = "#333",
    strokeWidth = 1.0,
    opacity = 0.7,
    wobble = 1.5,
    className = "terrain-edges",
  } = edgeStyle;

  // Flat-top hex vertices (v0 at 0°, v1 at 60°, … CCW in screen-flipped Y)
  const vOff = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * 60) * Math.PI / 180;
    vOff.push([size * Math.cos(a), size * Math.sin(a)]);
  }
  // Edge endpoints in neighbor order [N, NE, SE, S, SW, NW]
  const edgeVerts = [[5, 4], [0, 5], [1, 0], [2, 1], [3, 2], [4, 3]];
  // Neighbor (col, row) offsets — parity-dependent because odd-q offsets
  // shift every other column by half a row.
  const neighborsA = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1]];
  const neighborsB = [[0, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];

  const edgeGroup = g.append("g").attr("class", className);
  const rng = mulberry32(seedFromString("terrain-edges-" + matchTerrains.join(",")));

  inside.forEach(hex => {
    const col = parseInt(hex.substring(0, 2));
    const row = parseInt(hex.substring(2, 4));
    const isShifted = (col % 2) !== (bcCol % 2);
    const hx = (col - bcCol) * colStep + WIDTH / 2;
    const hy = (row - bcRow) * rowStep + (isShifted ? rowStep / 2 : 0) + HEIGHT / 2;
    const neighbors = isShifted ? neighborsB : neighborsA;

    for (let i = 0; i < 6; i++) {
      const [dc, dr] = neighbors[i];
      const nCol = col + dc, nRow = row + dr;
      const nKey = String(nCol).padStart(2, "0") + String(nRow).padStart(2, "0");
      if (inside.has(nKey)) continue;

      const [vi1, vi2] = edgeVerts[i];
      const [vx1, vy1] = vOff[vi1];
      const [vx2, vy2] = vOff[vi2];
      const x1 = hx + vx1, y1 = hy + vy1;
      const x2 = hx + vx2, y2 = hy + vy2;
      // Quadratic curve with perpendicular wobble at midpoint for hand-drawn feel
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const edgeDx = x2 - x1, edgeDy = y2 - y1;
      const elen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy) || 1;
      const pnx = -edgeDy / elen, pny = edgeDx / elen;
      const off = (rng() - 0.5) * 2 * wobble;
      const cx = mx + pnx * off;
      const cy = my + pny * off;

      edgeGroup.append("path")
        .attr("d", `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", strokeWidth)
        .attr("stroke-linecap", "round")
        .attr("opacity", opacity);
    }
  });
}

// --- Bounds ---
function computeBounds(nodes) {
  const WIDTH = window.innerWidth;
  const HEIGHT = window.innerHeight;

  // Start with node positions
  let minX = d3.min(nodes, d => d.x);
  let maxX = d3.max(nodes, d => d.x);
  let minY = d3.min(nodes, d => d.y);
  let maxY = d3.max(nodes, d => d.y);

  // Expand to include hex terrain positions
  if (graphData && graphData.hex_terrain) {
    const bcCol = 10, bcRow = 10;
    const size = HINT_SCALE / 2;
    const colStep = size * 2 * 0.75;
    const rowStep = size * Math.sqrt(3);

    const addHexBounds = (hex) => {
      if (typeof hex !== "string" || hex.length < 4) return;
      const col = parseInt(hex.substring(0, 2));
      const row = parseInt(hex.substring(2, 4));
      if (isNaN(col) || isNaN(row)) return;
      const hx = (col - bcCol) * colStep + WIDTH / 2;
      const hy = (row - bcRow) * rowStep + (col % 2 !== bcCol % 2 ? rowStep / 2 : 0) + HEIGHT / 2;
      minX = Math.min(minX, hx);
      maxX = Math.max(maxX, hx);
      minY = Math.min(minY, hy);
      maxY = Math.max(maxY, hy);
    };

    Object.keys(graphData.hex_terrain).forEach(addHexBounds);

    if (graphData.river_path) {
      graphData.river_path.forEach(addHexBounds);
    }

    if (graphData.road_path) {
      // road_path entries can be arrays, {hexes, ...}, or a flat array of strings
      let roadPaths;
      if (typeof graphData.road_path[0] === "string") {
        roadPaths = [graphData.road_path];
      } else {
        roadPaths = graphData.road_path.map(entry =>
          Array.isArray(entry) ? entry : (entry && entry.hexes) || []
        );
      }
      roadPaths.forEach(path => path.forEach(addHexBounds));
    }

    if (graphData.crevasse_path) {
      graphData.crevasse_path.forEach(entry => {
        const hexes = Array.isArray(entry) ? entry : (entry && entry.hexes) || [];
        hexes.forEach(addHexBounds);
      });
    }
  }

  return {
    minX: minX - 50,
    maxX: maxX + 50,
    minY: minY - 50,
    maxY: maxY + 50,
  };
}

// --- Detail panel ---
let graphData = null;

// The unified detail-panel is now driven by hex hover (renderHexHover
// populates it). Clicking on a node is a no-op — hover already showed
// that node's info when the pointer crossed its hex. Kept for backward
// compatibility with style renderers that call it.
function showDetail(node) {
  /* no-op — hover-driven panel replaces click-to-open. */
}

function closePanel() {
  document.getElementById("detail-panel").classList.remove("open");
}

// --- Data loading and simulation ---
let _rawData = null; // pristine copy for re-simulation

async function loadData(campaign) {
  const mapFile = campaign + "/" + campaign + ".json";
  const response = await fetch(mapFile);
  _rawData = await response.json();
  graphData = JSON.parse(JSON.stringify(_rawData));
  return graphData;
}

// --- Sub-hex offsets (unit vectors toward the 6 flat-top neighbors) ---
const SUBHEX_OFFSETS = {
  C:  [0, 0],
  N:  [0, -1],
  NE: [0.866, -0.5],
  SE: [0.866, 0.5],
  S:  [0, 1],
  SW: [-0.866, 0.5],
  NW: [-0.866, -0.5],
};
const SUBHEX_FRACTION = 0.4; // how far toward the neighbor as a fraction of hex size

function hexToXY(hex, subhex) {
  const WIDTH = window.innerWidth;
  const HEIGHT = window.innerHeight;
  const bcCol = 10, bcRow = 10;
  const size = HINT_SCALE / 2;
  const colStep = size * 2 * 0.75;
  const rowStep = size * Math.sqrt(3);

  const col = parseInt(hex.substring(0, 2));
  const row = parseInt(hex.substring(2, 4));
  const cx = (col - bcCol) * colStep + WIDTH / 2;
  const cy = (row - bcRow) * rowStep + (col % 2 !== bcCol % 2 ? rowStep / 2 : 0) + HEIGHT / 2;

  const [ox, oy] = SUBHEX_OFFSETS[subhex || "C"] || SUBHEX_OFFSETS.C;
  const d = size * SUBHEX_FRACTION;
  return [cx + ox * d, cy + oy * d];
}

// Inverse of hexToXY: SVG coords in the g-group space → CCRR hex code.
// Picks whichever of the nearby candidate hex centers is closest.
function xyToHex(x, y) {
  const WIDTH = window.innerWidth;
  const HEIGHT = window.innerHeight;
  const bcCol = 10, bcRow = 10;
  const size = HINT_SCALE / 2;
  const colStep = size * 2 * 0.75;
  const rowStep = size * Math.sqrt(3);

  const xRel = x - WIDTH / 2;
  const colGuess = Math.round(xRel / colStep) + bcCol;
  let best = null, bestDist = Infinity;
  for (let dc = -1; dc <= 1; dc++) {
    const col = colGuess + dc;
    const isShifted = (col % 2) !== (bcCol % 2);
    const colX = (col - bcCol) * colStep + WIDTH / 2;
    const rowOff = isShifted ? rowStep / 2 : 0;
    const yRel = y - HEIGHT / 2 - rowOff;
    const rowGuess = Math.round(yRel / rowStep) + bcRow;
    for (let dr = -1; dr <= 1; dr++) {
      const row = rowGuess + dr;
      const rowY = (row - bcRow) * rowStep + rowOff + HEIGHT / 2;
      const dx = x - colX, dy = y - rowY;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) { bestDist = d2; best = { col, row }; }
    }
  }
  if (!best) return null;
  return `${String(best.col).padStart(2, "0")}${String(best.row).padStart(2, "0")}`;
}

// Six flat-top hex neighbors for a given CCRR hex (parity-aware).
function hexNeighbors(hex) {
  if (typeof hex !== "string" || hex.length < 4) return [];
  const col = parseInt(hex.substring(0, 2));
  const row = parseInt(hex.substring(2, 4));
  if (isNaN(col) || isNaN(row)) return [];
  const bcCol = 10;
  const isShifted = (col % 2) !== (bcCol % 2);
  const offsets = isShifted
    ? [[0, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]
    : [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1]];
  return offsets.map(([dc, dr]) =>
    String(col + dc).padStart(2, "0") + String(row + dr).padStart(2, "0")
  );
}

// Offset CCRR → cube coords (for straight-line hex paths in Dijkstra fallback).
function hexToCube(hex) {
  const col = parseInt(hex.substring(0, 2));
  const row = parseInt(hex.substring(2, 4));
  const bcCol = 10;
  // odd-q offset: shifted columns have different parity from bcCol (10 = even).
  const parity = (col % 2) !== (bcCol % 2) ? 1 : 0;
  const x = col;
  const z = row - (col - parity) / 2;
  const y = -x - z;
  return [x, y, z];
}

function hexDistance(a, b) {
  const [ax, ay, az] = hexToCube(a);
  const [bx, by, bz] = hexToCube(b);
  return (Math.abs(ax - bx) + Math.abs(ay - by) + Math.abs(az - bz)) / 2;
}

function runSimulation(rawData, filterFn) {
  const WIDTH = window.innerWidth;
  const HEIGHT = window.innerHeight;

  // Deep-copy from pristine data so D3 mutation doesn't persist
  const freshNodes = JSON.parse(JSON.stringify(_rawData.nodes));
  const freshLinks = JSON.parse(JSON.stringify(_rawData.links));

  const nodes = filterFn
    ? filterFn(freshNodes)
    : freshNodes.filter(isOverlandNode);
  const nodeIds = new Set(nodes.map(n => n.id));
  const links = freshLinks.filter(l => l.visible !== false && nodeIds.has(l.source) && nodeIds.has(l.target));

  nodes.forEach(n => {
    if (n.hex) {
      const [x, y] = hexToXY(n.hex, n.subhex);
      n.x = x;
      n.y = y;
    }
  });

  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(d => Math.max(40, (d.days || 1) * DAY_SCALE)).strength(0.05))
    .force("charge", d3.forceManyBody().strength(-50))
    .force("collide", d3.forceCollide(15))
    .force("x", d3.forceX(d => d.hex ? hexToXY(d.hex, d.subhex)[0] : WIDTH / 2).strength(0.9))
    .force("y", d3.forceY(d => d.hex ? hexToXY(d.hex, d.subhex)[1] : HEIGHT / 2).strength(0.9));

  simulation.stop();
  for (let i = 0; i < 300; i++) simulation.tick();

  // Cache back onto graphData
  graphData.nodes = nodes;
  graphData.links = links;

  return { nodes, links, meta: rawData.meta, bounds: computeBounds(nodes) };
}

// --- SVG setup ---
function setupSVG() {
  const WIDTH = window.innerWidth;
  const HEIGHT = window.innerHeight;

  const svg = d3.select("#map")
    .attr("width", WIDTH)
    .attr("height", HEIGHT);

  // Clear previous content
  svg.selectAll("*").remove();

  const defs = svg.append("defs");
  const g = svg.append("g");

  const zoom = d3.zoom()
    .scaleExtent([0.3, 4])
    .on("zoom", (event) => g.attr("transform", event.transform));
  // Disable d3's default double-click zoom so our handler owns that gesture.
  svg.call(zoom).on("dblclick.zoom", null);
  // Clicking the SVG background is now a no-op for the detail panel —
  // the hex-hover handler takes care of click/tap-to-open, and the panel
  // has its own close X button.

  return { svg, defs, g, zoom };
}

// --- Route highlight (feature 2) ---
// Module-level because they must be cleared on style/grid re-render.
let _routeStartHex = null;
let _routeEndHex = null;

function _clearRouteState() {
  _routeStartHex = null;
  _routeEndHex = null;
}

// Build an undirected graph keyed by hex code. Edge cost is the average of
// the two hexes' terrain travel times (see TERRAIN_DAYS_PER_HEX). Road
// edges apply ROAD_MULTIPLIER so Dijkstra always prefers a road when one
// is available.
function _buildTravelGraph() {
  const graph = new Map();
  const addEdge = (a, b, days) => {
    if (!graph.has(a)) graph.set(a, new Map());
    if (!graph.has(b)) graph.set(b, new Map());
    const cur = graph.get(a).get(b);
    if (cur == null || days < cur) {
      graph.get(a).set(b, days);
      graph.get(b).set(a, days);
    }
  };

  const hexTerrain = (graphData && graphData.hex_terrain) || {};
  const edgeCost = (a, b) => (hexTravelDays(a, hexTerrain) + hexTravelDays(b, hexTerrain)) / 2;

  // Road edges — faster than off-road over the same terrain
  const roads = graphData && graphData.road_path ? graphData.road_path : [];
  const roadEntries = typeof roads[0] === "string" ? [{ hexes: roads }] : roads;
  roadEntries.forEach(entry => {
    const hexes = Array.isArray(entry) ? entry : (entry && entry.hexes) || [];
    if (hexes.length < 2) return;
    // Explicit `days` on the entry overrides the terrain calculation.
    const explicitPerHop = entry && entry.days && hexes.length > 1
      ? entry.days / (hexes.length - 1)
      : null;
    for (let i = 0; i < hexes.length - 1; i++) {
      const cost = explicitPerHop != null
        ? explicitPerHop
        : edgeCost(hexes[i], hexes[i + 1]) * ROAD_MULTIPLIER;
      addEdge(hexes[i], hexes[i + 1], cost);
    }
  });

  // Seed known hexes for overland neighbor edges from terrain / nodes / river / road
  const known = new Set();
  if (graphData) {
    if (graphData.hex_terrain) Object.keys(graphData.hex_terrain).forEach(h => known.add(h));
    if (graphData.river_path) graphData.river_path.forEach(h => known.add(h));
    if (graphData.nodes) graphData.nodes.forEach(n => { if (n.hex) known.add(n.hex); });
    roadEntries.forEach(entry => {
      const hexes = Array.isArray(entry) ? entry : (entry && entry.hexes) || [];
      hexes.forEach(h => known.add(h));
    });
  }

  known.forEach(hex => {
    hexNeighbors(hex).forEach(n => {
      if (known.has(n)) addEdge(hex, n, edgeCost(hex, n));
    });
  });

  return { graph, known };
}

function _dijkstra(graph, start, end) {
  if (!graph.has(start) || !graph.has(end)) return null;
  const dist = new Map();
  const prev = new Map();
  dist.set(start, 0);
  const visited = new Set();
  // Simple priority queue via linear scan — graphs here are tiny (a few hundred hexes).
  while (true) {
    let u = null, uDist = Infinity;
    dist.forEach((d, k) => {
      if (!visited.has(k) && d < uDist) { u = k; uDist = d; }
    });
    if (u == null) break;
    if (u === end) break;
    visited.add(u);
    const nbrs = graph.get(u);
    if (!nbrs) continue;
    nbrs.forEach((w, v) => {
      if (visited.has(v)) return;
      const alt = uDist + w;
      if (alt < (dist.get(v) ?? Infinity)) {
        dist.set(v, alt);
        prev.set(v, u);
      }
    });
  }
  if (!dist.has(end)) return null;
  const path = [];
  let cur = end;
  while (cur != null) {
    path.unshift(cur);
    cur = prev.get(cur);
  }
  return { path, days: dist.get(end) };
}

// Straight-line hex path via cube-coord linear interpolation — fallback when
// Dijkstra can't reach (one or both endpoints outside the known graph).
function _hexLinePath(start, end) {
  const n = hexDistance(start, end);
  const [x1, y1, z1] = hexToCube(start);
  const [x2, y2, z2] = hexToCube(end);
  const steps = Math.max(1, Math.round(n));
  const cubeToOffset = (cx, cz) => {
    const col = cx;
    const bcCol = 10;
    const parity = (col % 2) !== (bcCol % 2) ? 1 : 0;
    const row = cz + (col - parity) / 2;
    return String(col).padStart(2, "0") + String(row).padStart(2, "0");
  };
  const cubeRound = (x, y, z) => {
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    return [rx, ry, rz];
  };
  const path = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const [rx, , rz] = cubeRound(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, z1 + (z2 - z1) * t);
    path.push(cubeToOffset(rx, rz));
  }
  // Sum per-hex terrain costs for the straight-line path (off-road).
  const hexTerrain = (graphData && graphData.hex_terrain) || {};
  let days = 0;
  for (let i = 1; i < path.length; i++) {
    days += (hexTravelDays(path[i - 1], hexTerrain) + hexTravelDays(path[i], hexTerrain)) / 2;
  }
  return { path, days };
}

function _findRoute(startHex, endHex) {
  if (startHex === endHex) return { path: [startHex], days: 0 };
  const { graph, known } = _buildTravelGraph();
  if (known.has(startHex) && known.has(endHex)) {
    const res = _dijkstra(graph, startHex, endHex);
    if (res) return res;
  }
  return _hexLinePath(startHex, endHex);
}

function _hexCenterXY(hex) {
  const WIDTH = window.innerWidth;
  const HEIGHT = window.innerHeight;
  const bcCol = 10, bcRow = 10;
  const size = HINT_SCALE / 2;
  const colStep = size * 2 * 0.75;
  const rowStep = size * Math.sqrt(3);
  const col = parseInt(hex.substring(0, 2));
  const row = parseInt(hex.substring(2, 4));
  const x = (col - bcCol) * colStep + WIDTH / 2;
  const y = (row - bcRow) * rowStep + (col % 2 !== bcCol % 2 ? rowStep / 2 : 0) + HEIGHT / 2;
  return [x, y];
}

function _clearRouteGroups(g) {
  g.selectAll("g.route-highlight").remove();
  g.selectAll("g.route-start-marker").remove();
}

function _renderRouteStart(g, hex) {
  _clearRouteGroups(g);
  if (!hex) return;
  const size = HINT_SCALE / 2;
  const [cx, cy] = _hexCenterXY(hex);
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * 60) * Math.PI / 180;
    pts.push([cx + size * Math.cos(a), cy + size * Math.sin(a)]);
  }
  const markerGroup = g.append("g").attr("class", "route-start-marker").style("pointer-events", "none");
  markerGroup.append("polygon")
    .attr("points", pts.map(p => p.join(",")).join(" "))
    .attr("fill", "var(--route-accent, #c25b2b)")
    .attr("opacity", 0.22);
  markerGroup.append("polygon")
    .attr("points", pts.map(p => p.join(",")).join(" "))
    .attr("fill", "none")
    .attr("stroke", "var(--route-accent, #c25b2b)")
    .attr("stroke-width", 2)
    .attr("opacity", 0.7);
}

function _renderRoute(g, path, days) {
  _clearRouteGroups(g);
  if (!path || path.length === 0) return;
  const size = HINT_SCALE / 2;
  const group = g.append("g").attr("class", "route-highlight").style("pointer-events", "none");

  // Filled hex highlights along the route
  path.forEach(hex => {
    const [cx, cy] = _hexCenterXY(hex);
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * 60) * Math.PI / 180;
      pts.push([cx + size * Math.cos(a), cy + size * Math.sin(a)]);
    }
    group.append("polygon")
      .attr("points", pts.map(p => p.join(",")).join(" "))
      .attr("fill", "var(--route-accent, #c25b2b)")
      .attr("opacity", 0.3);
  });

  // Thick polyline through hex centers
  if (path.length >= 2) {
    const centers = path.map(_hexCenterXY);
    const line = d3.line().curve(d3.curveCatmullRom.alpha(0.5));
    group.append("path")
      .attr("d", line(centers))
      .attr("fill", "none")
      .attr("stroke", "var(--route-accent, #c25b2b)")
      .attr("stroke-width", 4)
      .attr("stroke-linecap", "round")
      .attr("opacity", 0.7);
  }

  // Travel-time label at route midpoint
  if (days != null && path.length >= 2) {
    const centers = path.map(_hexCenterXY);
    const midIdx = Math.floor(centers.length / 2);
    const [lx, ly] = centers[midIdx];
    const label = group.append("g").attr("transform", `translate(${lx}, ${ly - 14})`);
    const text = formatDaysLabel(Math.round(days * 4) / 4);
    label.append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-family", FONT)
      .attr("font-size", "14px")
      .attr("font-weight", "bold")
      .attr("fill", "var(--route-accent, #c25b2b)")
      .attr("stroke", "#f4e8d1")
      .attr("stroke-width", 4)
      .attr("paint-order", "stroke")
      .text(text);
  }
}

// Set up single-click / shift-click route handling on the svg. Uses the
// svg-level click, then hit-tests against the hex under the pointer, so clicks
// on terrain or empty parchment still register without touching node click
// handlers (nodes stop propagation separately when appropriate).
function _setupRouteInteraction(svg, g, zoom) {
  svg.on("click.route", function (event) {
    // Ignore clicks on node elements — they have their own handlers.
    if (event.target && event.target.closest && event.target.closest(".node")) return;
    const [px, py] = d3.pointer(event, g.node());
    const hex = xyToHex(px, py);
    if (!hex) {
      _clearRouteState();
      _clearRouteGroups(g);
      return;
    }
    if (event.shiftKey && _routeStartHex) {
      _routeEndHex = hex;
      const res = _findRoute(_routeStartHex, hex);
      if (res) _renderRoute(g, res.path, res.days);
      return;
    }
    // Plain click (including shift-click with no start): set new start
    _routeStartHex = hex;
    _routeEndHex = null;
    _renderRouteStart(g, hex);
  });

  // Double-click: zoom onto clicked hex + its 6 neighbors
  svg.on("dblclick.hex", function (event) {
    const [px, py] = d3.pointer(event, g.node());
    const hex = xyToHex(px, py);
    if (!hex) return;
    const cluster = [hex, ...hexNeighbors(hex)];
    const radius = HINT_SCALE / 2;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    cluster.forEach(h => {
      const [cx, cy] = _hexCenterXY(h);
      minX = Math.min(minX, cx - radius);
      minY = Math.min(minY, cy - radius);
      maxX = Math.max(maxX, cx + radius);
      maxY = Math.max(maxY, cy + radius);
    });
    const W = window.innerWidth, H = window.innerHeight;
    const padFactor = 1.25; // ~20% margin
    const bw = (maxX - minX) * padFactor;
    const bh = (maxY - minY) * padFactor;
    const scale = Math.min(W / bw, H / bh, 4);
    const clampedScale = Math.max(0.3, Math.min(4, scale));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const transform = d3.zoomIdentity
      .translate(W / 2 - cx * clampedScale, H / 2 - cy * clampedScale)
      .scale(clampedScale);
    svg.transition().duration(400).call(zoom.transform, transform);
  });
}

function centerView(svg, zoom, bounds) {
  const WIDTH = window.innerWidth;
  const HEIGHT = window.innerHeight;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const initialTransform = d3.zoomIdentity.translate(WIDTH / 2 - cx, HEIGHT / 2 - cy);
  svg.call(zoom.transform, initialTransform);
}

// --- Render orchestrator ---
let _cachedSim = null;
let _currentStyle = null;
let _currentGrid = null;

function applyTheme(style) {
  const root = document.documentElement;
  if (style.css) {
    Object.entries(style.css).forEach(([prop, val]) => root.style.setProperty(prop, val));
  }
}

function renderMap(styleName, gridName) {
  const style = MapStyles[styleName];
  if (!style) { console.error("Unknown style:", styleName); return; }

  // Reset route highlight state on every re-render (style/grid change).
  _clearRouteState();

  _currentStyle = styleName;
  _currentGrid = gridName;

  const WIDTH = window.innerWidth;
  const HEIGHT = window.innerHeight;

  // Re-run simulation if needed (filter function may differ per style)
  const sim = runSimulation(graphData, style.filterNodes);

  applyTheme(style);

  const { svg, defs, g, zoom } = setupSVG();

  // Use the style's preferred font if it declares one, otherwise fall
  // back to the shared Palatino stack.
  const styleFont = style.font || FONT;
  // Build render context
  const ctx = {
    g, defs,
    nodes: sim.nodes,
    links: sim.links,
    bounds: sim.bounds,
    meta: sim.meta,
    colors: style.colors,
    WIDTH, HEIGHT, HINT_SCALE, DAY_SCALE,
    mulberry32, seedFromString, FONT: styleFont,
    riverPath: graphData.river_path || [],
    roadPath: graphData.road_path || [],
    crevassePath: graphData.crevasse_path || [],
    hexTerrain: graphData.hex_terrain || {},
    offMapArrows: graphData.off_map_arrows || []
  };

  // Run the style's render pipeline
  style.render(ctx);

  // Overlay grid if requested
  if (gridName && gridName !== "none" && MapGrids[gridName]) {
    MapGrids[gridName].render(ctx);
  }

  // Hex hover panel — runs on top so it captures pointer events.
  renderHexHover(ctx);

  // Double-click zoom + shift-click routing
  _setupRouteInteraction(svg, g, zoom);

  // Center the view
  centerView(svg, zoom, sim.bounds);

  // Update title bar
  document.getElementById("title-bar").textContent =
    `${sim.meta.campaign} \u2014 ${sim.meta.region}, ${sim.meta.world} \u2014 ${sim.meta.era}`;
}

// --- SVG export ---
function exportSVG() {
  const svgEl = document.getElementById("map");
  const clone = svgEl.cloneNode(true);

  const g = svgEl.querySelector("g");
  const contentSelectors = [".links", ".terrain", ".nodes", ".labels", ".day-labels"];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  contentSelectors.forEach(sel => {
    const el = g.querySelector(sel);
    if (!el) return;
    const bb = el.getBBox();
    minX = Math.min(minX, bb.x);
    minY = Math.min(minY, bb.y);
    maxX = Math.max(maxX, bb.x + bb.width);
    maxY = Math.max(maxY, bb.y + bb.height);
  });
  const pad = 80;
  const vbX = minX - pad, vbY = minY - pad;
  const vbW = maxX - minX + pad * 2, vbH = maxY - minY + pad * 2;

  clone.setAttribute("viewBox", `${vbX} ${vbY} ${vbW} ${vbH}`);
  clone.setAttribute("width", vbW);
  clone.setAttribute("height", vbH);
  clone.querySelector("g").removeAttribute("transform");

  const bgRect = clone.querySelector("g > rect");
  if (bgRect) {
    bgRect.setAttribute("x", vbX);
    bgRect.setAttribute("y", vbY);
    bgRect.setAttribute("width", vbW);
    bgRect.setAttribute("height", vbH);
  }

  clone.querySelectorAll("text").forEach(t => {
    if (!t.getAttribute("font-family")) {
      t.setAttribute("font-family", FONT);
    }
  });

  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const data = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([data], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  const dlCampaign = new URLSearchParams(window.location.search).get("map")?.replace(/\.json$/, "") || "Basilisk";
  const styleSuffix = _currentStyle || "map";
  a.download = dlCampaign + "-" + styleSuffix + ".svg";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- Shared special-icon helpers ---
// Each helper draws into the provided <g> node (`ng`, pre-translated to the
// node position) and uses the caller's palette colors.

function renderFaeGlade(ng, { ink, parchment }) {
  const fs = 7;
  // Faint ground halo
  ng.append("ellipse")
    .attr("cx", 0).attr("cy", fs * 0.3)
    .attr("rx", fs * 1.7).attr("ry", fs * 0.7)
    .attr("fill", ink).attr("opacity", 0.05);
  // Ring of 8 tiny silver-bark trees — circled around the glade
  const treeCount = 8;
  for (let i = 0; i < treeCount; i++) {
    const angle = (i / treeCount) * Math.PI * 2 - Math.PI / 2;
    const rx = Math.cos(angle) * fs * 1.25;
    const ry = Math.sin(angle) * fs * 0.9;
    const th = fs * 0.7;
    const tw = fs * 0.4;
    ng.append("path")
      .attr("d", `M ${rx - tw/2} ${ry} L ${rx} ${ry - th} L ${rx + tw/2} ${ry} Z`)
      .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.65);
    ng.append("line")
      .attr("x1", rx).attr("y1", ry).attr("x2", rx).attr("y2", ry + fs * 0.15)
      .attr("stroke", ink).attr("stroke-width", 0.55);
    // Hint of a face on two of the outer trees
    if (i === 0 || i === 4) {
      ng.append("circle").attr("cx", rx - tw * 0.18).attr("cy", ry - th * 0.45).attr("r", 0.35).attr("fill", ink);
      ng.append("circle").attr("cx", rx + tw * 0.18).attr("cy", ry - th * 0.45).attr("r", 0.35).attr("fill", ink);
    }
  }
  // Central clearing — dotted circle suggesting a fey ring
  const ringR = fs * 0.55;
  const dots = 12;
  for (let i = 0; i < dots; i++) {
    const a = (i / dots) * Math.PI * 2;
    ng.append("circle")
      .attr("cx", Math.cos(a) * ringR).attr("cy", fs * 0.1 + Math.sin(a) * ringR * 0.7)
      .attr("r", 0.4).attr("fill", ink).attr("opacity", 0.75);
  }
  // Runic spiral at the center — the Garden's pocket-realm marker
  ng.append("path")
    .attr("d", `M 0 ${fs * 0.1} m -1.8 0 a 1.8 1.8 0 1 1 3.6 0 a 1.2 1.2 0 1 0 -2.4 0`)
    .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.55).attr("opacity", 0.75);
  // Three light wisps rising — fey magic drifting up
  [-fs * 0.7, 0, fs * 0.7].forEach(wx => {
    const wStart = -fs * 0.5;
    ng.append("path")
      .attr("d", `M ${wx} ${wStart} C ${wx - 1} ${wStart - 2.5}, ${wx + 1.2} ${wStart - 5}, ${wx - 0.4} ${wStart - 8}`)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.5)
      .attr("stroke-linecap", "round").attr("opacity", 0.5);
  });
}

// Warding-stone menhir — tall upright stone with three rows of angular
// runes carved on its face. Use the node id to seed rune layout so each
// warding stone looks slightly different but is deterministic.
function renderWardingStone(ng, node, { ink, parchment }) {
  const ms = 7;
  const rng = mulberry32(seedFromString("menhir-" + (node.id || "warding")));
  // Ground line
  ng.append("line")
    .attr("x1", -ms * 1.0).attr("y1", ms * 0.9).attr("x2", ms * 1.0).attr("y2", ms * 0.9)
    .attr("stroke", ink).attr("stroke-width", 0.6).attr("opacity", 0.5);
  // Menhir body — tall, slightly irregular standing stone
  const topW = ms * 0.55, botW = ms * 0.75;
  ng.append("path")
    .attr("d", `M ${-botW/2} ${ms * 0.9}
                L ${-topW/2 - 0.3} ${-ms * 0.8}
                Q 0 ${-ms * 1.15} ${topW/2 + 0.3} ${-ms * 0.8}
                L ${botW/2} ${ms * 0.9} Z`)
    .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.9);
  // Subtle vertical grain
  for (let i = 0; i < 2; i++) {
    const gx = (rng() - 0.5) * ms * 0.3;
    ng.append("path")
      .attr("d", `M ${gx} ${-ms * 0.7} Q ${gx + 0.4} 0 ${gx - 0.2} ${ms * 0.7}`)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.35).attr("opacity", 0.25);
  }
  // Three rows of angular runic glyphs
  const runeRows = 3;
  for (let r = 0; r < runeRows; r++) {
    const ry = -ms * 0.55 + r * ms * 0.48;
    const glyphCount = 2 + Math.floor(rng() * 2);
    for (let gi = 0; gi < glyphCount; gi++) {
      const gx = -ms * 0.18 + gi * ms * 0.2;
      const shape = Math.floor(rng() * 4);
      if (shape === 0) {
        ng.append("path")
          .attr("d", `M ${gx} ${ry - ms * 0.12} L ${gx} ${ry + ms * 0.12} M ${gx} ${ry} L ${gx + ms * 0.1} ${ry - ms * 0.08}`)
          .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.55);
      } else if (shape === 1) {
        ng.append("path")
          .attr("d", `M ${gx - ms * 0.08} ${ry - ms * 0.1} L ${gx + ms * 0.08} ${ry + ms * 0.1} M ${gx - ms * 0.08} ${ry + ms * 0.1} L ${gx + ms * 0.08} ${ry - ms * 0.1}`)
          .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.55);
      } else if (shape === 2) {
        ng.append("path")
          .attr("d", `M ${gx} ${ry - ms * 0.12} L ${gx} ${ry + ms * 0.12} M ${gx - ms * 0.08} ${ry + ms * 0.04} L ${gx} ${ry + ms * 0.12} L ${gx + ms * 0.08} ${ry + ms * 0.04}`)
          .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.55);
      } else {
        ng.append("path")
          .attr("d", `M ${gx} ${ry - ms * 0.12} L ${gx} ${ry + ms * 0.12} M ${gx} ${ry - ms * 0.04} L ${gx + ms * 0.08} ${ry - ms * 0.12} M ${gx} ${ry + ms * 0.04} L ${gx + ms * 0.08} ${ry + ms * 0.12}`)
          .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.55);
      }
    }
  }
}

// Barrow mound — wide dome with a dark tomb entrance, two flanking menhirs,
// scattered bones at the mouth, a faint skull atop the mound. Use for
// wight-barrow / cairn points.
function renderCragCairn(ng, { ink, parchment }) {
  const cs = 7;
  // Mound body — a wide dome
  ng.append("path")
    .attr("d", `M ${-cs * 1.5} ${cs * 0.9} Q ${-cs * 1.2} ${-cs * 0.6} 0 ${-cs * 0.9} Q ${cs * 1.2} ${-cs * 0.6} ${cs * 1.5} ${cs * 0.9} Z`)
    .attr("fill", parchment).attr("fill-opacity", 0.8)
    .attr("stroke", ink).attr("stroke-width", 0.9);
  // Crown of grass tick marks on the dome
  for (let i = 0; i < 4; i++) {
    const t = (i + 1) / 5;
    const a = (t - 0.5) * Math.PI;
    const r = cs * 1.15;
    const hx0 = Math.sin(a) * r * 1.1;
    const hy0 = -Math.cos(a) * cs * 0.8 - cs * 0.05;
    ng.append("line")
      .attr("x1", hx0).attr("y1", hy0).attr("x2", hx0).attr("y2", hy0 - cs * 0.18)
      .attr("stroke", ink).attr("stroke-width", 0.45).attr("opacity", 0.55);
  }
  // Longitudinal curve lines across the mound for volume
  [-0.4, 0, 0.4].forEach(off => {
    ng.append("path")
      .attr("d", `M ${-cs * 1.4} ${cs * 0.9 - cs * 0.2} Q 0 ${-cs * 0.75 + off * cs * 0.3} ${cs * 1.4} ${cs * 0.9 - cs * 0.2}`)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.4).attr("opacity", 0.25);
  });
  // Dark tomb entrance — arched opening at base center
  ng.append("path")
    .attr("d", `M ${-cs * 0.3} ${cs * 0.9} L ${-cs * 0.3} ${cs * 0.2} Q 0 ${-cs * 0.15} ${cs * 0.3} ${cs * 0.2} L ${cs * 0.3} ${cs * 0.9} Z`)
    .attr("fill", ink).attr("opacity", 0.85);
  // Lintel line above the entrance
  ng.append("line")
    .attr("x1", -cs * 0.4).attr("y1", cs * 0.2).attr("x2", cs * 0.4).attr("y2", cs * 0.2)
    .attr("stroke", ink).attr("stroke-width", 0.7);
  // Two standing stones flanking the mound
  [-cs * 1.75, cs * 1.75].forEach(sx => {
    ng.append("path")
      .attr("d", `M ${sx - cs * 0.18} ${cs * 0.95} L ${sx - cs * 0.12} ${-cs * 0.5} Q ${sx} ${-cs * 0.75} ${sx + cs * 0.12} ${-cs * 0.5} L ${sx + cs * 0.18} ${cs * 0.95} Z`)
      .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.8);
  });
  // Scattered bones at the tomb mouth
  [{ bx: -cs * 0.65, by: cs * 1.05 }, { bx: cs * 0.55, by: cs * 1.1 }, { bx: -cs * 0.1, by: cs * 1.15 }].forEach(({ bx, by }) => {
    ng.append("ellipse").attr("cx", bx).attr("cy", by).attr("rx", cs * 0.18).attr("ry", cs * 0.05)
      .attr("fill", ink).attr("opacity", 0.7);
    ng.append("circle").attr("cx", bx - cs * 0.18).attr("cy", by).attr("r", cs * 0.05).attr("fill", ink).attr("opacity", 0.7);
    ng.append("circle").attr("cx", bx + cs * 0.18).attr("cy", by).attr("r", cs * 0.05).attr("fill", ink).attr("opacity", 0.7);
  });
  // Faint skull above the mound top — the wight's throne on bones
  const skX = 0, skY = -cs * 1.15;
  ng.append("circle").attr("cx", skX).attr("cy", skY).attr("r", cs * 0.2).attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.55).attr("opacity", 0.85);
  ng.append("circle").attr("cx", skX - cs * 0.07).attr("cy", skY - cs * 0.02).attr("r", cs * 0.045).attr("fill", ink).attr("opacity", 0.85);
  ng.append("circle").attr("cx", skX + cs * 0.07).attr("cy", skY - cs * 0.02).attr("r", cs * 0.045).attr("fill", ink).attr("opacity", 0.85);
  ng.append("line").attr("x1", skX - cs * 0.05).attr("y1", skY + cs * 0.1).attr("x2", skX + cs * 0.05).attr("y2", skY + cs * 0.1)
    .attr("stroke", ink).attr("stroke-width", 0.4).attr("opacity", 0.7);
}

// Mistwood Glen — pocket-realm clearing with floating rune-stones above,
// some trees normal and one inverted, plus an upward-flowing waterfall hint
// (chevrons going up). Distinct from Fae Glade.
function renderMistwoodGlen(ng, node, { ink, parchment }) {
  const ms = 7;
  const rngM = mulberry32(seedFromString("mistwood-" + (node.id || "mistwood")));
  ng.append("ellipse")
    .attr("cx", 0).attr("cy", ms * 0.65)
    .attr("rx", ms * 1.5).attr("ry", ms * 0.35)
    .attr("fill", ink).attr("opacity", 0.07);
  const trees = [
    { x: -ms * 1.1, y: ms * 0.35, inverted: false },
    { x:  ms * 1.1, y: ms * 0.35, inverted: false },
    { x: -ms * 0.55, y: -ms * 0.2, inverted: false },
    { x:  ms * 0.55, y: -ms * 0.8, inverted: true },
  ];
  trees.forEach(({ x, y, inverted }) => {
    const th = ms * 0.75;
    const tw = ms * 0.42;
    if (!inverted) {
      ng.append("path")
        .attr("d", `M ${x - tw/2} ${y} L ${x} ${y - th} L ${x + tw/2} ${y} Z`)
        .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.65);
      ng.append("line")
        .attr("x1", x).attr("y1", y).attr("x2", x).attr("y2", y + ms * 0.18)
        .attr("stroke", ink).attr("stroke-width", 0.55);
    } else {
      ng.append("path")
        .attr("d", `M ${x - tw/2} ${y} L ${x} ${y + th} L ${x + tw/2} ${y} Z`)
        .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.65);
      ng.append("line")
        .attr("x1", x).attr("y1", y).attr("x2", x).attr("y2", y - ms * 0.18)
        .attr("stroke", ink).attr("stroke-width", 0.55).attr("stroke-dasharray", "1 1");
    }
  });
  const stones = [
    { x: -ms * 0.35, y: -ms * 1.3, w: ms * 0.45, h: ms * 0.3 },
    { x:  ms * 0.3,  y: -ms * 1.55, w: ms * 0.4,  h: ms * 0.32 },
    { x: -ms * 0.0,  y: -ms * 0.95, w: ms * 0.38, h: ms * 0.26 },
  ];
  stones.forEach(s => {
    const tilt = (rngM() - 0.5) * 20;
    const sg = ng.append("g").attr("transform", `translate(${s.x}, ${s.y}) rotate(${tilt})`);
    sg.append("rect")
      .attr("x", -s.w / 2).attr("y", -s.h / 2).attr("width", s.w).attr("height", s.h)
      .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.65);
    sg.append("line").attr("x1", -s.w * 0.15).attr("y1", -s.h * 0.22).attr("x2", -s.w * 0.15).attr("y2", s.h * 0.22)
      .attr("stroke", ink).attr("stroke-width", 0.45);
    sg.append("line").attr("x1", -s.w * 0.15).attr("y1", 0).attr("x2", s.w * 0.05).attr("y2", -s.h * 0.2)
      .attr("stroke", ink).attr("stroke-width", 0.45);
    sg.append("line").attr("x1", s.w * 0.2).attr("y1", -s.h * 0.2).attr("x2", s.w * 0.2).attr("y2", s.h * 0.2)
      .attr("stroke", ink).attr("stroke-width", 0.45);
    for (let di = 0; di < 2; di++) {
      sg.append("circle").attr("cx", (di - 0.5) * s.w * 0.3).attr("cy", s.h * 0.6 + di * 1.2)
        .attr("r", 0.3).attr("fill", ink).attr("opacity", 0.45);
    }
  });
  [0, 1, 2].forEach(i => {
    const wy = ms * 0.4 - i * ms * 0.35;
    ng.append("path")
      .attr("d", `M ${-ms * 0.12} ${wy} L 0 ${wy - ms * 0.12} L ${ms * 0.12} ${wy}`)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.5).attr("opacity", 0.55);
  });
}

// Mud Wallow — steaming sulfur hot spring. Pool shape + ripples + bubbles
// + steam wisps. Seeded so bubble placement is stable per node.
function renderMudWallow(ng, node, { ink, parchment }) {
  const ms = 7;
  const rng = mulberry32(seedFromString("mudpool-" + (node.id || "pool")));
  // Wet ground halo
  ng.append("ellipse")
    .attr("cx", 0).attr("cy", ms * 0.15)
    .attr("rx", ms * 1.45).attr("ry", ms * 0.65)
    .attr("fill", ink).attr("opacity", 0.08);
  // Pool body
  ng.append("ellipse")
    .attr("cx", 0).attr("cy", ms * 0.2)
    .attr("rx", ms * 1.1).attr("ry", ms * 0.5)
    .attr("fill", ink).attr("opacity", 0.22)
    .attr("stroke", ink).attr("stroke-width", 0.6);
  [-ms * 0.25, ms * 0.05, ms * 0.35].forEach(ry => {
    ng.append("path")
      .attr("d", `M ${-ms * 0.75} ${ms * 0.2 + ry * 0.3} q ${ms * 0.3} ${-ms * 0.05} ${ms * 0.5} 0 t ${ms * 0.5} 0 t ${ms * 0.5} 0`)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.4).attr("opacity", 0.55);
  });
  for (let i = 0; i < 6; i++) {
    const bx = (rng() - 0.5) * ms * 1.8;
    const by = ms * 0.05 + rng() * ms * 0.35;
    const br = 0.35 + rng() * 0.5;
    ng.append("circle")
      .attr("cx", bx).attr("cy", by).attr("r", br)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.4).attr("opacity", 0.6);
  }
  [-ms * 0.6, 0, ms * 0.6].forEach(sx => {
    ng.append("path")
      .attr("d", `M ${sx} ${-ms * 0.1} C ${sx - 1.5} ${-ms * 0.55}, ${sx + 2} ${-ms * 1.0}, ${sx - 0.5} ${-ms * 1.5}`)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.5)
      .attr("stroke-linecap", "round").attr("opacity", 0.5);
  });
}

// Kobold Crevasse — dark jagged crack in the ground with three tiny trees
// at the rim (mystic ring) and two little dog-kobold figures at the surface.
function renderKoboldCrevasse(ng, { ink, parchment }) {
  const ks = 7;
  // Ground crack — dark jagged wedge
  ng.append("path")
    .attr("d", `M ${-ks * 0.7} ${ks * 0.2} L ${-ks * 0.3} ${-ks * 0.1} L ${-ks * 0.1} ${ks * 0.3} L ${ks * 0.2} ${-ks * 0.15} L ${ks * 0.5} ${ks * 0.25} L ${ks * 0.8} ${-ks * 0.05} L ${ks * 0.6} ${ks * 0.7} L ${-ks * 0.5} ${ks * 0.8} Z`)
    .attr("fill", ink).attr("opacity", 0.88);
  // Crack edge ridges
  ng.append("path")
    .attr("d", `M ${-ks * 0.8} ${ks * 0.2} L ${-ks * 0.55} ${-ks * 0.05}`)
    .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.6).attr("opacity", 0.5);
  ng.append("path")
    .attr("d", `M ${ks * 0.85} ${-ks * 0.02} L ${ks * 0.7} ${ks * 0.5}`)
    .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.6).attr("opacity", 0.5);
  // Three trees at the rim
  [{ x: -ks * 1.1, y: ks * 0.45 }, { x: ks * 1.1, y: ks * 0.2 }, { x: 0, y: -ks * 0.7 }].forEach(({ x, y }) => {
    ng.append("path")
      .attr("d", `M ${x - ks * 0.15} ${y} L ${x} ${y - ks * 0.4} L ${x + ks * 0.15} ${y} Z`)
      .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.55);
    ng.append("line")
      .attr("x1", x).attr("y1", y).attr("x2", x).attr("y2", y + ks * 0.1)
      .attr("stroke", ink).attr("stroke-width", 0.45);
  });
  // Two dog-kobolds at the surface
  [{ x: -ks * 0.85, y: ks * 0.9, face: 1 },
   { x:  ks * 0.55, y: ks * 1.05, face: -1 }].forEach(({ x, y, face }) => {
    const kh = ks * 0.35;
    ng.append("ellipse")
      .attr("cx", x).attr("cy", y).attr("rx", kh * 0.55).attr("ry", kh * 0.35)
      .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.55);
    const headX = x + face * kh * 0.5;
    const headY = y - kh * 0.2;
    ng.append("path")
      .attr("d", `M ${headX - face * kh * 0.2} ${headY}
                  Q ${headX} ${headY - kh * 0.35} ${headX + face * kh * 0.25} ${headY - kh * 0.1}
                  L ${headX + face * kh * 0.45} ${headY}
                  L ${headX + face * kh * 0.25} ${headY + kh * 0.1} Z`)
      .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.5);
    ng.append("path")
      .attr("d", `M ${headX - face * kh * 0.05} ${headY - kh * 0.3} L ${headX + face * kh * 0.05} ${headY - kh * 0.55} L ${headX + face * kh * 0.15} ${headY - kh * 0.28} Z`)
      .attr("fill", ink).attr("opacity", 0.85);
    ng.append("circle").attr("cx", headX + face * kh * 0.12).attr("cy", headY - kh * 0.18).attr("r", 0.4).attr("fill", ink);
    for (let i = 0; i < 4; i++) {
      const lx = x - kh * 0.4 + i * kh * 0.25;
      ng.append("line")
        .attr("x1", lx).attr("y1", y + kh * 0.25).attr("x2", lx).attr("y2", y + kh * 0.55)
        .attr("stroke", ink).attr("stroke-width", 0.5);
    }
    const tailX = x - face * kh * 0.55;
    ng.append("path")
      .attr("d", `M ${tailX} ${y - kh * 0.05} q ${-face * kh * 0.2} ${-kh * 0.2} ${-face * kh * 0.05} ${-kh * 0.3}`)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.5);
  });
}

// Pjörk Choppe Hille — simple horseshoe of five rounded hills opening east,
// with one small cave mouth and a tiny orcish banner in the middle. Simple
// shorthand for the Caves-of-Chaos valley.
function renderPorcHills(ng, { ink, parchment }) {
  const ps = 8;
  const hills = [
    { x: -ps * 0.55, y: -ps * 0.9 },
    { x: -ps * 1.25, y: -ps * 0.55 },
    { x: -ps * 1.45, y:  ps * 0.0 },
    { x: -ps * 1.25, y:  ps * 0.55 },
    { x: -ps * 0.55, y:  ps * 0.9 },
  ];
  hills.forEach(({ x, y }, i) => {
    const hw = ps * (0.8 + (i % 2) * 0.1);
    const hh = ps * 0.45;
    ng.append("path")
      .attr("d", `M ${x - hw / 2} ${y} Q ${x - hw / 4} ${y - hh} ${x} ${y - hh} Q ${x + hw / 4} ${y - hh} ${x + hw / 2} ${y} Z`)
      .attr("fill", parchment).attr("fill-opacity", 0.6)
      .attr("stroke", ink).attr("stroke-width", 0.8);
    for (let r = 0; r < 2; r++) {
      const t = (r + 1) / 3;
      ng.append("path")
        .attr("d", `M ${x - hw * 0.28 + t * hw * 0.12} ${y - hh * (0.5 + t * 0.25)} q ${hw * 0.18} ${-1} ${hw * 0.25} 0`)
        .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.45).attr("opacity", 0.45);
    }
  });
  // One small cave mouth tucked into the innermost hill
  const cX = -ps * 0.75, cY = ps * 0.05;
  ng.append("path")
    .attr("d", `M ${cX - ps * 0.2} ${cY + ps * 0.12}
                L ${cX - ps * 0.2} ${cY - ps * 0.06}
                Q ${cX} ${cY - ps * 0.22} ${cX + ps * 0.2} ${cY - ps * 0.06}
                L ${cX + ps * 0.2} ${cY + ps * 0.12} Z`)
    .attr("fill", ink).attr("opacity", 0.85);
  // Tiny orcish banner inside the horseshoe
  const bX = -ps * 0.3, bY = ps * 0.25;
  ng.append("line")
    .attr("x1", bX).attr("y1", bY).attr("x2", bX).attr("y2", bY - ps * 0.45)
    .attr("stroke", ink).attr("stroke-width", 0.55);
  ng.append("path")
    .attr("d", `M ${bX} ${bY - ps * 0.4} L ${bX + ps * 0.22} ${bY - ps * 0.32} L ${bX + ps * 0.15} ${bY - ps * 0.2} L ${bX} ${bY - ps * 0.24} Z`)
    .attr("fill", ink).attr("opacity", 0.75);
}

// Basilisk Spiderwood — a spider's web between three dark bent-over trees,
// with the basilisk lying coiled at the base. The campaign's namesake lair,
// so it gets a distinct silhouette rather than the generic cave mouth.
function renderBasiliskSpiderwood(ng, { ink, parchment }) {
  const bs = 7;
  // Three hunched dead-looking trees forming a triangle around the web
  [{ x: -bs * 1.2, y: -bs * 0.2 }, { x: bs * 1.2, y: -bs * 0.2 }, { x: 0, y: -bs * 1.0 }].forEach(({ x, y }) => {
    // Leaning trunk
    const lean = x === 0 ? 0 : (x > 0 ? -0.2 : 0.2);
    ng.append("line")
      .attr("x1", x).attr("y1", y).attr("x2", x + lean * bs).attr("y2", y - bs * 0.8)
      .attr("stroke", ink).attr("stroke-width", 0.9);
    // A couple of bare bent branches
    ng.append("line")
      .attr("x1", x + lean * bs * 0.5).attr("y1", y - bs * 0.4)
      .attr("x2", x + lean * bs * 0.8 + bs * 0.18).attr("y2", y - bs * 0.55)
      .attr("stroke", ink).attr("stroke-width", 0.55);
    ng.append("line")
      .attr("x1", x + lean * bs * 0.5).attr("y1", y - bs * 0.55)
      .attr("x2", x + lean * bs * 0.8 - bs * 0.18).attr("y2", y - bs * 0.65)
      .attr("stroke", ink).attr("stroke-width", 0.55);
  });
  // Spider web strung between the three trees — radial lines + concentric arcs
  const webCx = 0, webCy = -bs * 0.55;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = bs * 0.65;
    ng.append("line")
      .attr("x1", webCx).attr("y1", webCy)
      .attr("x2", webCx + Math.cos(a) * r).attr("y2", webCy + Math.sin(a) * r)
      .attr("stroke", ink).attr("stroke-width", 0.4).attr("opacity", 0.7);
  }
  for (let ring = 1; ring <= 3; ring++) {
    const r = bs * 0.2 * ring;
    ng.append("circle")
      .attr("cx", webCx).attr("cy", webCy).attr("r", r)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.4).attr("opacity", 0.6);
  }
  // Tiny spider on the web
  ng.append("circle").attr("cx", webCx + bs * 0.15).attr("cy", webCy - bs * 0.08).attr("r", 0.8)
    .attr("fill", ink);
  for (let li = 0; li < 4; li++) {
    const la = (li / 4) * Math.PI * 2 + Math.PI / 4;
    ng.append("line")
      .attr("x1", webCx + bs * 0.15).attr("y1", webCy - bs * 0.08)
      .attr("x2", webCx + bs * 0.15 + Math.cos(la) * 1.5).attr("y2", webCy - bs * 0.08 + Math.sin(la) * 1.5)
      .attr("stroke", ink).attr("stroke-width", 0.4);
  }
  // Basilisk coiled at the base — serpentine S with a head
  ng.append("path")
    .attr("d", `M ${-bs * 0.9} ${bs * 0.9}
                Q ${-bs * 0.3} ${bs * 0.55} 0 ${bs * 0.85}
                Q ${bs * 0.3} ${bs * 1.15} ${bs * 0.8} ${bs * 0.85}
                Q ${bs * 1.05} ${bs * 0.7} ${bs * 1.0} ${bs * 0.45}`)
    .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 1.0)
    .attr("stroke-linecap", "round");
  // Little head with beady eye
  ng.append("circle").attr("cx", bs * 1.0).attr("cy", bs * 0.45).attr("r", bs * 0.1)
    .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.55);
  ng.append("circle").attr("cx", bs * 1.02).attr("cy", bs * 0.42).attr("r", 0.6)
    .attr("fill", ink);
  // Tiny forked tongue
  ng.append("line").attr("x1", bs * 1.1).attr("y1", bs * 0.48)
    .attr("x2", bs * 1.25).attr("y2", bs * 0.42)
    .attr("stroke", ink).attr("stroke-width", 0.4);
  ng.append("line").attr("x1", bs * 1.1).attr("y1", bs * 0.48)
    .attr("x2", bs * 1.25).attr("y2", bs * 0.55)
    .attr("stroke", ink).attr("stroke-width", 0.4);
}

// Graveyard — a small field of tombstones with a faint wrought-iron fence
// line behind, matching the hand-drawn "graves" marker near the Old Wood.
function renderGraveyard(ng, { ink, parchment }) {
  const gs = 7;
  // Faint ground halo
  ng.append("ellipse")
    .attr("cx", 0).attr("cy", gs * 0.4)
    .attr("rx", gs * 1.4).attr("ry", gs * 0.4)
    .attr("fill", ink).attr("opacity", 0.06);
  // Six tombstones in two rows — mix of rounded-arch and cross styles
  const stones = [
    { x: -gs * 1.0, y: gs * 0.3, style: "arch" },
    { x: -gs * 0.4, y: gs * 0.25, style: "cross" },
    { x:  gs * 0.2, y: gs * 0.32, style: "arch" },
    { x:  gs * 0.85, y: gs * 0.28, style: "cross" },
    { x: -gs * 0.75, y: -gs * 0.15, style: "cross" },
    { x:  gs * 0.55, y: -gs * 0.12, style: "arch" },
  ];
  stones.forEach(({ x, y, style }) => {
    if (style === "arch") {
      // Rounded-top tombstone
      ng.append("path")
        .attr("d", `M ${x - gs * 0.22} ${y + gs * 0.3}
                    L ${x - gs * 0.22} ${y - gs * 0.15}
                    Q ${x} ${y - gs * 0.38} ${x + gs * 0.22} ${y - gs * 0.15}
                    L ${x + gs * 0.22} ${y + gs * 0.3} Z`)
        .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.7);
      // Small inscription line
      ng.append("line")
        .attr("x1", x - gs * 0.12).attr("y1", y + gs * 0.05)
        .attr("x2", x + gs * 0.12).attr("y2", y + gs * 0.05)
        .attr("stroke", ink).attr("stroke-width", 0.4).attr("opacity", 0.6);
    } else {
      // Cross
      ng.append("line").attr("x1", x).attr("y1", y - gs * 0.32).attr("x2", x).attr("y2", y + gs * 0.3)
        .attr("stroke", ink).attr("stroke-width", 0.85);
      ng.append("line").attr("x1", x - gs * 0.16).attr("y1", y - gs * 0.1).attr("x2", x + gs * 0.16).attr("y2", y - gs * 0.1)
        .attr("stroke", ink).attr("stroke-width", 0.85);
    }
    // Small burial-mound indication — short ground line at base
    ng.append("line")
      .attr("x1", x - gs * 0.22).attr("y1", y + gs * 0.32)
      .attr("x2", x + gs * 0.22).attr("y2", y + gs * 0.32)
      .attr("stroke", ink).attr("stroke-width", 0.4).attr("opacity", 0.45);
  });
  // Faint iron-fence line behind the stones
  for (let fi = 0; fi < 10; fi++) {
    const fx = -gs * 1.4 + fi * gs * 0.3;
    ng.append("line")
      .attr("x1", fx).attr("y1", -gs * 0.6).attr("x2", fx).attr("y2", -gs * 0.4)
      .attr("stroke", ink).attr("stroke-width", 0.35).attr("opacity", 0.45);
  }
  ng.append("line")
    .attr("x1", -gs * 1.4).attr("y1", -gs * 0.58).attr("x2", gs * 1.4).attr("y2", -gs * 0.58)
    .attr("stroke", ink).attr("stroke-width", 0.35).attr("opacity", 0.45);
}

// Tower of the Stargazer — tall cylindrical tower with no windows, crowned
// by a layered metal dome like a globe ringed with spikes, with four ground
// spikes leaning inward and lightning bolts striking constantly.
function renderStargazerTower(ng, { ink, parchment }) {
  const ts = 7;
  // Faint ground halo (blasted lunar ground)
  ng.append("ellipse")
    .attr("cx", 0).attr("cy", ts * 1.0)
    .attr("rx", ts * 1.6).attr("ry", ts * 0.3)
    .attr("fill", ink).attr("opacity", 0.1);
  // Four ground spikes leaning inward
  [{ x: -ts * 1.3, y: ts * 1.05, tip: { x: -ts * 0.45, y: ts * 0.35 } },
   { x:  ts * 1.3, y: ts * 1.05, tip: { x:  ts * 0.45, y: ts * 0.35 } },
   { x: -ts * 1.4, y: ts * 0.6,  tip: { x: -ts * 0.55, y: ts * 0.0 } },
   { x:  ts * 1.4, y: ts * 0.6,  tip: { x:  ts * 0.55, y: ts * 0.0 } }].forEach(({ x, y, tip }) => {
    ng.append("path")
      .attr("d", `M ${x - 0.8} ${y} L ${tip.x} ${tip.y} L ${x + 0.8} ${y} Z`)
      .attr("fill", ink).attr("opacity", 0.75);
  });
  // Tower body — tall narrow cylinder, no windows
  const tw = ts * 0.55;
  const th = ts * 2.0;
  ng.append("rect")
    .attr("x", -tw / 2).attr("y", -ts * 1.0).attr("width", tw).attr("height", th)
    .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 1.0);
  // Two vertical grooves on the tower (give it some volume)
  [-0.15, 0.15].forEach(off => {
    ng.append("line")
      .attr("x1", tw * off).attr("y1", -ts * 0.95)
      .attr("x2", tw * off).attr("y2", ts * 0.95)
      .attr("stroke", ink).attr("stroke-width", 0.35).attr("opacity", 0.35);
  });
  // Layered metal dome atop the tower — a globe
  const domeY = -ts * 1.0;
  ng.append("ellipse")
    .attr("cx", 0).attr("cy", domeY - ts * 0.3)
    .attr("rx", ts * 0.55).attr("ry", ts * 0.35)
    .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.85);
  // Layered bands across the dome
  [-0.1, 0.1].forEach(yo => {
    ng.append("path")
      .attr("d", `M ${-ts * 0.5} ${domeY - ts * 0.3 + ts * yo}
                  Q 0 ${domeY - ts * 0.4 + ts * yo} ${ts * 0.5} ${domeY - ts * 0.3 + ts * yo}`)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.45).attr("opacity", 0.55);
  });
  // Spikes radiating from the dome
  [-60, -30, 0, 30, 60].forEach(deg => {
    const rad = deg * Math.PI / 180;
    const sx1 = Math.sin(rad) * ts * 0.48;
    const sy1 = -Math.cos(rad) * ts * 0.32 + (domeY - ts * 0.3);
    const sx2 = Math.sin(rad) * ts * 0.72;
    const sy2 = -Math.cos(rad) * ts * 0.55 + (domeY - ts * 0.3);
    ng.append("line")
      .attr("x1", sx1).attr("y1", sy1).attr("x2", sx2).attr("y2", sy2)
      .attr("stroke", ink).attr("stroke-width", 0.7);
  });
  // Two lightning bolts striking the dome — jagged zigzag
  [-1, 1].forEach(dir => {
    const bx0 = dir * ts * 1.0, by0 = -ts * 2.3;
    const bx1 = dir * ts * 0.75, by1 = -ts * 2.0;
    const bx2 = dir * ts * 0.85, by2 = -ts * 1.75;
    const bx3 = dir * ts * 0.55, by3 = -ts * 1.5;
    const bx4 = dir * ts * 0.3, by4 = -ts * 1.35;
    ng.append("path")
      .attr("d", `M ${bx0} ${by0} L ${bx1} ${by1} L ${bx2} ${by2} L ${bx3} ${by3} L ${bx4} ${by4}`)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.85).attr("opacity", 0.8)
      .attr("stroke-linecap", "round").attr("stroke-linejoin", "round");
  });
  // Tiny arrow-slit door at the base
  ng.append("rect")
    .attr("x", -0.8).attr("y", ts * 0.55)
    .attr("width", 1.6).attr("height", ts * 0.4)
    .attr("fill", ink);
}

// Raven's Perch — an abandoned watchtower with a broken top and a raven
// perched on the crenellations. A silhouette in the Old Forest.
function renderRavensPerch(ng, { ink, parchment }) {
  const rs = 7;
  // Ground line
  ng.append("line")
    .attr("x1", -rs * 0.8).attr("y1", rs * 1.0).attr("x2", rs * 0.8).attr("y2", rs * 1.0)
    .attr("stroke", ink).attr("stroke-width", 0.5).attr("opacity", 0.5);
  // Tower body with a broken jagged top — parchment-filled outline
  const tw = rs * 0.7;
  ng.append("path")
    .attr("d", `M ${-tw / 2} ${rs * 1.0}
                L ${-tw / 2} ${-rs * 0.8}
                L ${-tw / 2 + tw * 0.2} ${-rs * 1.05}
                L ${-tw / 2 + tw * 0.35} ${-rs * 0.75}
                L ${-tw / 2 + tw * 0.55} ${-rs * 1.15}
                L ${-tw / 2 + tw * 0.7} ${-rs * 0.7}
                L ${tw / 2} ${-rs * 0.9}
                L ${tw / 2} ${rs * 1.0} Z`)
    .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.85);
  // Narrow arrow-slit window in the middle of the tower
  ng.append("rect")
    .attr("x", -0.3).attr("y", -rs * 0.25).attr("width", 0.6).attr("height", rs * 0.5)
    .attr("fill", ink).attr("opacity", 0.85);
  // Doorway at base (solid dark rectangle)
  ng.append("rect")
    .attr("x", -rs * 0.15).attr("y", rs * 0.55).attr("width", rs * 0.3).attr("height", rs * 0.45)
    .attr("fill", ink).attr("opacity", 0.85);
  // A few climbing-ivy strokes up the tower
  [rs * 0.2, -rs * 0.1, rs * 0.05].forEach((y, i) => {
    const dx = (i % 2 === 0 ? -1 : 1) * tw * 0.3;
    ng.append("path")
      .attr("d", `M ${dx} ${y} q ${-dx * 0.4} ${-rs * 0.15} ${-dx * 0.2} ${-rs * 0.3}`)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.35).attr("opacity", 0.55);
  });
  // Raven perched on the broken top — tiny silhouette
  const birdX = -tw / 2 + tw * 0.55;
  const birdY = -rs * 1.2;
  // Body
  ng.append("ellipse")
    .attr("cx", birdX).attr("cy", birdY).attr("rx", 1.6).attr("ry", 1.0)
    .attr("fill", ink);
  // Head
  ng.append("circle").attr("cx", birdX + 1.4).attr("cy", birdY - 0.6).attr("r", 0.9)
    .attr("fill", ink);
  // Beak
  ng.append("path")
    .attr("d", `M ${birdX + 2.1} ${birdY - 0.6} L ${birdX + 3.0} ${birdY - 0.3} L ${birdX + 2.1} ${birdY - 0.3} Z`)
    .attr("fill", ink);
  // Eye dot (as parchment cutout)
  ng.append("circle").attr("cx", birdX + 1.55).attr("cy", birdY - 0.7).attr("r", 0.18)
    .attr("fill", parchment);
  // Tail feathers
  ng.append("path")
    .attr("d", `M ${birdX - 1.6} ${birdY} L ${birdX - 2.4} ${birdY + 0.4} L ${birdX - 1.5} ${birdY + 0.6} Z`)
    .attr("fill", ink);
  // A second raven in flight above, smaller
  const fx = rs * 0.6, fy = -rs * 1.65;
  ng.append("path")
    .attr("d", `M ${fx - 1.3} ${fy} q 0.6 -0.7 1.3 0 q 0.7 -0.7 1.3 0`)
    .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.55).attr("stroke-linecap", "round");
}

// Hangman Hill — bandit camp with a visible gallows (hence the name), two
// tents, and the dark obsidian spire at the quarry's center.
function renderHangmanHill(ng, { ink, parchment }) {
  const hs = 7;
  // Ground line
  ng.append("line")
    .attr("x1", -hs * 1.3).attr("y1", hs * 0.95).attr("x2", hs * 1.3).attr("y2", hs * 0.95)
    .attr("stroke", ink).attr("stroke-width", 0.5).attr("opacity", 0.5);
  // Dark obsidian spire — tall pointed triangle in the back-center
  ng.append("path")
    .attr("d", `M ${-hs * 0.2} ${hs * 0.95}
                L ${-hs * 0.05} ${-hs * 1.2}
                L ${hs * 0.2} ${hs * 0.95} Z`)
    .attr("fill", ink).attr("opacity", 0.82);
  // Serpent-mark scratch on the spire face
  ng.append("path")
    .attr("d", `M ${-hs * 0.02} ${-hs * 0.3} q ${hs * 0.08} ${-hs * 0.15} ${hs * 0.02} ${-hs * 0.3}
                q ${-hs * 0.1} ${-hs * 0.15} ${hs * 0.02} ${-hs * 0.3}`)
    .attr("fill", "none").attr("stroke", parchment).attr("stroke-width", 0.4).attr("opacity", 0.85);
  // Gallows — left of the spire, T-shape with a noose dangling
  const gX = -hs * 0.9, gBaseY = hs * 0.95;
  const gTopY = -hs * 0.4;
  // Vertical post
  ng.append("line")
    .attr("x1", gX).attr("y1", gBaseY).attr("x2", gX).attr("y2", gTopY)
    .attr("stroke", ink).attr("stroke-width", 0.85);
  // Horizontal arm (projects to the right, away from the post)
  const armEndX = gX + hs * 0.55;
  ng.append("line")
    .attr("x1", gX).attr("y1", gTopY).attr("x2", armEndX).attr("y2", gTopY)
    .attr("stroke", ink).attr("stroke-width", 0.85);
  // Brace (diagonal support between post and arm)
  ng.append("line")
    .attr("x1", gX).attr("y1", gTopY + hs * 0.18).attr("x2", gX + hs * 0.18).attr("y2", gTopY)
    .attr("stroke", ink).attr("stroke-width", 0.55);
  // Rope dropping from the arm end — a thin line terminating in a noose loop
  const ropeY = gTopY + hs * 0.45;
  ng.append("line")
    .attr("x1", armEndX).attr("y1", gTopY).attr("x2", armEndX).attr("y2", ropeY)
    .attr("stroke", ink).attr("stroke-width", 0.55);
  // Noose loop (small circle)
  ng.append("circle")
    .attr("cx", armEndX).attr("cy", ropeY + hs * 0.08).attr("r", hs * 0.08)
    .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.55);
  // Two small tent silhouettes on the right
  [{ x: hs * 0.65, w: hs * 0.45 }, { x: hs * 1.15, w: hs * 0.35 }].forEach(({ x, w }) => {
    ng.append("path")
      .attr("d", `M ${x - w / 2} ${hs * 0.95} L ${x} ${hs * 0.35} L ${x + w / 2} ${hs * 0.95} Z`)
      .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.65);
    // Vertical center line (tent pole shadow)
    ng.append("line")
      .attr("x1", x).attr("y1", hs * 0.35).attr("x2", x).attr("y2", hs * 0.95)
      .attr("stroke", ink).attr("stroke-width", 0.35).attr("opacity", 0.5);
    // Tent flap opening
    ng.append("path")
      .attr("d", `M ${x - w * 0.15} ${hs * 0.95} L ${x} ${hs * 0.6} L ${x + w * 0.15} ${hs * 0.95}`)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.45).attr("opacity", 0.7);
  });
  // Tiny campfire between the gallows and tents — Y-shaped sticks + flame
  const cfx = 0, cfy = hs * 0.8;
  [-hs * 0.08, 0, hs * 0.08].forEach(d => {
    ng.append("line")
      .attr("x1", cfx + d).attr("y1", hs * 0.95).attr("x2", cfx + d * 2).attr("y2", cfy)
      .attr("stroke", ink).attr("stroke-width", 0.4).attr("opacity", 0.7);
  });
  // Small flame tick above
  ng.append("path")
    .attr("d", `M ${cfx - hs * 0.08} ${cfy} q ${hs * 0.04} ${-hs * 0.12} ${hs * 0.08} 0 q ${hs * 0.04} ${-hs * 0.08} ${hs * 0.04} ${-hs * 0.18}`)
    .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.4).attr("opacity", 0.55);
}

// The Swamp — flooded wetlands with reeds, wavy water, a small hermit hut
// on stilts, and a lizardman snout peeking out. A few tiny strange-light
// dots echo the "pulsing deep lights" of the lore.
function renderSwampWetlands(ng, { ink, parchment }) {
  const ss = 7;
  // Water pool base — wavy fill
  ng.append("ellipse")
    .attr("cx", 0).attr("cy", ss * 0.35)
    .attr("rx", ss * 1.6).attr("ry", ss * 0.75)
    .attr("fill", ink).attr("opacity", 0.12);
  // Wavy water lines across the surface
  [-ss * 0.2, ss * 0.15, ss * 0.5, ss * 0.8].forEach((wy, i) => {
    const xoff = (i % 2) * ss * 0.1;
    ng.append("path")
      .attr("d", `M ${-ss * 1.3 + xoff} ${wy}
                  q ${ss * 0.25} ${-ss * 0.08} ${ss * 0.5} 0
                  t ${ss * 0.5} 0
                  t ${ss * 0.5} 0`)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.5).attr("opacity", 0.65);
  });
  // Clusters of reeds/cattails — thin vertical lines with seed heads
  [-ss * 1.1, -ss * 0.7, ss * 0.85, ss * 1.15].forEach(rx => {
    // A cluster of 3-4 reeds
    [-0.1, 0.0, 0.1].forEach((off, i) => {
      const ry = i === 1 ? -ss * 0.35 : -ss * 0.25;
      ng.append("line")
        .attr("x1", rx + off * ss).attr("y1", ss * 0.3)
        .attr("x2", rx + off * ss).attr("y2", ry)
        .attr("stroke", ink).attr("stroke-width", 0.55).attr("opacity", 0.85);
      // Tiny seed-head ellipse at the tip
      ng.append("ellipse")
        .attr("cx", rx + off * ss).attr("cy", ry - 0.5).attr("rx", 0.6).attr("ry", 1.3)
        .attr("fill", ink).attr("opacity", 0.8);
    });
  });
  // Hermit hut on stilts — small square with peaked roof
  const huX = 0, huY = -ss * 0.1;
  const huW = ss * 0.55;
  const huH = ss * 0.4;
  // Stilts
  [-huW * 0.3, huW * 0.3].forEach(sx => {
    ng.append("line")
      .attr("x1", huX + sx).attr("y1", huY + huH * 0.5)
      .attr("x2", huX + sx).attr("y2", ss * 0.5)
      .attr("stroke", ink).attr("stroke-width", 0.55);
  });
  // Hut body
  ng.append("rect")
    .attr("x", huX - huW / 2).attr("y", huY - huH * 0.2)
    .attr("width", huW).attr("height", huH)
    .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.75);
  // Peaked thatched roof
  ng.append("path")
    .attr("d", `M ${huX - huW / 2 - 0.5} ${huY - huH * 0.2}
                L ${huX} ${huY - huH * 0.9}
                L ${huX + huW / 2 + 0.5} ${huY - huH * 0.2} Z`)
    .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.75);
  // Small dark doorway
  ng.append("rect")
    .attr("x", huX - 0.6).attr("y", huY + huH * 0.05)
    .attr("width", 1.2).attr("height", huH * 0.25)
    .attr("fill", ink);
  // A curl of smoke above the roof
  ng.append("path")
    .attr("d", `M ${huX + huW * 0.1} ${huY - huH * 0.9}
                C ${huX - 1.2} ${huY - huH * 1.3},
                  ${huX + 1.5} ${huY - huH * 1.7},
                  ${huX - 0.3} ${huY - huH * 2.2}`)
    .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.45)
    .attr("stroke-linecap", "round").attr("opacity", 0.5);
  // Lizardman snout peeking out of the water — small triangular ridge with eye
  const lzX = -ss * 0.45, lzY = ss * 0.55;
  ng.append("path")
    .attr("d", `M ${lzX - 1.2} ${lzY} L ${lzX} ${lzY - 0.9} L ${lzX + 1.2} ${lzY} Z`)
    .attr("fill", ink).attr("opacity", 0.85);
  // Scales tick behind the snout
  [0.6, 1.0, 1.4].forEach(dx => {
    ng.append("path")
      .attr("d", `M ${lzX - dx} ${lzY - 0.15} q 0.25 -0.25 0.5 0`)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.4).attr("opacity", 0.65);
  });
  // Tiny eye
  ng.append("circle").attr("cx", lzX - 0.3).attr("cy", lzY - 0.35).attr("r", 0.25)
    .attr("fill", parchment);
  // Three tiny pulsing-light dots in the deep
  [{ x: ss * 0.55, y: ss * 0.75 }, { x: ss * 0.85, y: ss * 0.55 }, { x: ss * 0.3, y: ss * 0.9 }].forEach(({ x, y }) => {
    ng.append("circle").attr("cx", x).attr("cy", y).attr("r", 0.55)
      .attr("fill", ink).attr("opacity", 0.6);
    ng.append("circle").attr("cx", x).attr("cy", y).attr("r", 1.2)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.3).attr("opacity", 0.35);
  });
}

// Vault of First Light — ancient dwarven dungeon with a carved stone
// archway gate set into mountains, flanked by two angular pillars, runes
// above the arch, and a candle-flame at the threshold (the eternal candle).
function renderVaultOfFirstLight(ng, { ink, parchment }) {
  const vs = 7;
  // Mountain peaks flanking the vault
  [-1, 1].forEach(dir => {
    ng.append("path")
      .attr("d", `M ${dir * vs * 1.6} ${vs * 0.95}
                  L ${dir * vs * 1.1} ${-vs * 0.3}
                  L ${dir * vs * 0.8} ${-vs * 0.05}
                  L ${dir * vs * 0.5} ${vs * 0.95} Z`)
      .attr("fill", ink).attr("opacity", 0.18)
      .attr("stroke", ink).attr("stroke-width", 0.7);
    // Snow-line stroke near the peak
    ng.append("path")
      .attr("d", `M ${dir * vs * 0.85} ${-vs * 0.18} L ${dir * vs * 1.05} ${-vs * 0.3} L ${dir * vs * 1.05} ${-vs * 0.08}`)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.45).attr("opacity", 0.5);
  });
  // Dwarven archway frame
  const arX = 0, arBaseY = vs * 0.95, arTopY = -vs * 0.6;
  const arW = vs * 0.95;
  ng.append("path")
    .attr("d", `M ${arX - arW} ${arBaseY}
                L ${arX - arW} ${arTopY - vs * 0.2}
                L ${arX - arW - vs * 0.12} ${arTopY - vs * 0.2}
                L ${arX - arW - vs * 0.12} ${arBaseY + vs * 0.1}
                L ${arX + arW + vs * 0.12} ${arBaseY + vs * 0.1}
                L ${arX + arW + vs * 0.12} ${arTopY - vs * 0.2}
                L ${arX + arW} ${arTopY - vs * 0.2}
                L ${arX + arW} ${arBaseY}
                Z`)
    .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.9);
  // Lintel block
  ng.append("rect")
    .attr("x", arX - arW - vs * 0.2).attr("y", arTopY - vs * 0.35)
    .attr("width", (arW + vs * 0.2) * 2).attr("height", vs * 0.25)
    .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.9);
  // Dwarven trapezoidal cap
  ng.append("path")
    .attr("d", `M ${arX - arW - vs * 0.08} ${arTopY - vs * 0.35}
                L ${arX - arW * 0.7} ${arTopY - vs * 0.58}
                L ${arX + arW * 0.7} ${arTopY - vs * 0.58}
                L ${arX + arW + vs * 0.08} ${arTopY - vs * 0.35} Z`)
    .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.9);
  // Runes along the lintel
  for (let i = 0; i < 5; i++) {
    const rx = arX - arW + (i + 0.5) * (arW * 2 / 5);
    const ry = arTopY - vs * 0.23;
    ng.append("path")
      .attr("d", `M ${rx} ${ry - vs * 0.06} L ${rx} ${ry + vs * 0.06} M ${rx} ${ry} L ${rx + vs * 0.05} ${ry - vs * 0.04}`)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.55);
  }
  // Inner dark doorway
  const doorW = arW * 0.85;
  const doorTopY = arTopY - vs * 0.15;
  ng.append("rect")
    .attr("x", arX - doorW / 2).attr("y", doorTopY)
    .attr("width", doorW).attr("height", arBaseY - doorTopY - vs * 0.05)
    .attr("fill", ink).attr("opacity", 0.92);
  // Eternal candle at the threshold
  const candleX = arX, candleY = arBaseY - vs * 0.05;
  ng.append("rect")
    .attr("x", candleX - 1.2).attr("y", candleY - vs * 0.25)
    .attr("width", 2.4).attr("height", vs * 0.25)
    .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.55);
  ng.append("path")
    .attr("d", `M ${candleX} ${candleY - vs * 0.28}
                q ${vs * 0.1} ${-vs * 0.12} 0 ${-vs * 0.32}
                q ${-vs * 0.1} ${vs * 0.12} 0 ${vs * 0.12}`)
    .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.55);
  ng.append("line")
    .attr("x1", candleX).attr("y1", candleY - vs * 0.42)
    .attr("x2", candleX).attr("y2", candleY - vs * 0.34)
    .attr("stroke", ink).attr("stroke-width", 0.5);
  // Ground line
  ng.append("line")
    .attr("x1", -vs * 1.6).attr("y1", arBaseY + vs * 0.1)
    .attr("x2",  vs * 1.6).attr("y2", arBaseY + vs * 0.1)
    .attr("stroke", ink).attr("stroke-width", 0.45).attr("opacity", 0.6);
}

// Spider Cave — dark cave mouth in a rocky hill with a big spider-web
// spanning the entrance, a daemon spider descending on a thread. Darker
// than the regular dungeon cave icon to match the chaos-shrine lore.
function renderSpiderCave(ng, { ink, parchment }) {
  const cs = 7;
  // Rocky hill silhouette around the cave mouth
  ng.append("path")
    .attr("d", `M ${-cs * 1.3} ${cs * 0.95}
                L ${-cs * 1.1} ${-cs * 0.1}
                L ${-cs * 0.7} ${-cs * 0.4}
                L ${-cs * 0.3} ${-cs * 0.15}
                L 0 ${-cs * 0.55}
                L ${cs * 0.4} ${-cs * 0.2}
                L ${cs * 0.8} ${-cs * 0.5}
                L ${cs * 1.15} ${-cs * 0.1}
                L ${cs * 1.3} ${cs * 0.95} Z`)
    .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.9);
  // Rocky crosshatch texture on the hill
  for (let i = 0; i < 8; i++) {
    const rx = -cs * 1.1 + (i * cs * 0.3);
    const ry = cs * 0.2 + (i % 2) * cs * 0.15;
    ng.append("path")
      .attr("d", `M ${rx} ${ry} l ${cs * 0.1} ${cs * 0.12}`)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.35).attr("opacity", 0.4);
  }
  // Large dark cave mouth — wide arch
  const cmW = cs * 1.2, cmTopY = -cs * 0.05, cmBaseY = cs * 0.95;
  ng.append("path")
    .attr("d", `M ${-cmW / 2} ${cmBaseY}
                L ${-cmW / 2} ${cmTopY + cs * 0.3}
                Q 0 ${cmTopY - cs * 0.15} ${cmW / 2} ${cmTopY + cs * 0.3}
                L ${cmW / 2} ${cmBaseY} Z`)
    .attr("fill", ink).attr("opacity", 0.9);
  // Spider web spanning the cave mouth — radial from top-center
  const webCx = 0, webCy = cmTopY + cs * 0.05;
  const webR = cs * 0.55;
  for (let i = 0; i < 6; i++) {
    const a = Math.PI + (i / 5) * Math.PI;
    ng.append("line")
      .attr("x1", webCx).attr("y1", webCy)
      .attr("x2", webCx + Math.cos(a) * webR).attr("y2", webCy - Math.sin(a) * webR)
      .attr("stroke", parchment).attr("stroke-width", 0.5).attr("opacity", 0.85);
  }
  // Concentric web arcs
  for (let ring = 1; ring <= 3; ring++) {
    const r = webR * (ring / 3);
    ng.append("path")
      .attr("d", `M ${webCx - r} ${webCy} Q ${webCx} ${webCy - r * 1.2} ${webCx + r} ${webCy}`)
      .attr("fill", "none").attr("stroke", parchment).attr("stroke-width", 0.4).attr("opacity", 0.8);
  }
  // Daemon spider descending on a silk thread from the cave roof
  const spY = cs * 0.25;
  ng.append("line")
    .attr("x1", webCx).attr("y1", webCy)
    .attr("x2", webCx).attr("y2", spY)
    .attr("stroke", parchment).attr("stroke-width", 0.45).attr("opacity", 0.85);
  // Spider body (parchment against dark cave)
  ng.append("ellipse")
    .attr("cx", webCx).attr("cy", spY + 0.4).attr("rx", 1.8).attr("ry", 1.3)
    .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.45);
  // Little dot-head
  ng.append("circle").attr("cx", webCx).attr("cy", spY - 0.5).attr("r", 0.8)
    .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.35);
  // Eight spider legs — four per side, bent
  for (let li = 0; li < 4; li++) {
    const angle = -20 + li * 25;
    const rad = angle * Math.PI / 180;
    [-1, 1].forEach(dir => {
      const lx0 = webCx + dir * 1.3;
      const ly0 = spY + 0.4;
      const lx1 = lx0 + dir * Math.cos(rad) * 2.2;
      const ly1 = ly0 + Math.sin(rad) * 2.2;
      const lx2 = lx1 + dir * 0.3;
      const ly2 = ly1 + 1.2;
      ng.append("path")
        .attr("d", `M ${lx0} ${ly0} L ${lx1} ${ly1} L ${lx2} ${ly2}`)
        .attr("fill", "none").attr("stroke", parchment).attr("stroke-width", 0.4)
        .attr("stroke-linecap", "round").attr("opacity", 0.85);
    });
  }
  // A small chaos-sigil scratched on the rock above the cave — an eight-pointed star
  const sX = 0, sY = -cs * 0.6;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ng.append("line")
      .attr("x1", sX).attr("y1", sY).attr("x2", sX + Math.cos(a) * 1.8).attr("y2", sY + Math.sin(a) * 1.8)
      .attr("stroke", ink).attr("stroke-width", 0.45).attr("opacity", 0.75);
  }
  ng.append("circle").attr("cx", sX).attr("cy", sY).attr("r", 0.4).attr("fill", ink);
  // Ground line
  ng.append("line")
    .attr("x1", -cs * 1.3).attr("y1", cs * 0.95)
    .attr("x2",  cs * 1.3).attr("y2", cs * 0.95)
    .attr("stroke", ink).attr("stroke-width", 0.45).attr("opacity", 0.6);
}

// Bandit Ambush Hill — Weathertop-style rocky dome with ancient broken
// stones ringing the crown, a small bandit figure with a raised sword
// lurking on the crest, and scattered boulders at the base.
function renderBanditHill(ng, { ink, parchment }) {
  const bs = 7;
  // Dome-shaped rocky hill
  ng.append("path")
    .attr("d", `M ${-bs * 1.3} ${bs * 0.95}
                Q ${-bs * 1.0} ${-bs * 0.5} 0 ${-bs * 0.8}
                Q ${bs * 1.0} ${-bs * 0.5} ${bs * 1.3} ${bs * 0.95} Z`)
    .attr("fill", parchment).attr("fill-opacity", 0.85)
    .attr("stroke", ink).attr("stroke-width", 0.85);
  // A few erosion/shadow lines on the hill
  [-0.5, -0.2, 0.2, 0.5].forEach(t => {
    ng.append("path")
      .attr("d", `M ${bs * t * 1.0} ${bs * 0.9}
                  Q ${bs * t * 0.7} ${bs * 0.1} ${bs * t * 0.3} ${-bs * 0.5}`)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.35).attr("opacity", 0.4);
  });
  // Ring of ancient broken stones on the crown — five upright fragments
  const crown = [
    { x: -bs * 0.55, y: -bs * 0.55, h: bs * 0.3 },
    { x: -bs * 0.25, y: -bs * 0.75, h: bs * 0.5 },
    { x:  bs * 0.05, y: -bs * 0.82, h: bs * 0.4 },
    { x:  bs * 0.35, y: -bs * 0.7,  h: bs * 0.55 },
    { x:  bs * 0.65, y: -bs * 0.5,  h: bs * 0.28 },
  ];
  crown.forEach(({ x, y, h }) => {
    ng.append("path")
      .attr("d", `M ${x - 1.0} ${y}
                  L ${x - 0.6} ${y - h}
                  L ${x + 0.7} ${y - h + 0.4}
                  L ${x + 1.1} ${y} Z`)
      .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.65);
  });
  // One big toppled lintel stone lying across two of the uprights
  ng.append("path")
    .attr("d", `M ${-bs * 0.3} ${-bs * 0.95}
                L ${bs * 0.2} ${-bs * 1.0}
                L ${bs * 0.25} ${-bs * 0.88}
                L ${-bs * 0.28} ${-bs * 0.83} Z`)
    .attr("fill", ink).attr("opacity", 0.85);
  // Bandit figure on the crest — silhouette with raised sword
  const bX = bs * 0.5, bY = -bs * 0.58;
  // Body
  ng.append("rect").attr("x", bX - 0.6).attr("y", bY - 1.8).attr("width", 1.2).attr("height", 2.2).attr("fill", ink);
  // Head
  ng.append("circle").attr("cx", bX).attr("cy", bY - 2.5).attr("r", 0.8).attr("fill", ink);
  // Legs — two quick ticks
  ng.append("line").attr("x1", bX - 0.3).attr("y1", bY + 0.3).attr("x2", bX - 0.6).attr("y2", bY + 1.1).attr("stroke", ink).attr("stroke-width", 0.55);
  ng.append("line").attr("x1", bX + 0.3).attr("y1", bY + 0.3).attr("x2", bX + 0.7).attr("y2", bY + 1.1).attr("stroke", ink).attr("stroke-width", 0.55);
  // Sword arm raised high
  ng.append("line").attr("x1", bX).attr("y1", bY - 1.6).attr("x2", bX + 1.2).attr("y2", bY - 3.4).attr("stroke", ink).attr("stroke-width", 0.55);
  // Sword blade
  ng.append("line").attr("x1", bX + 1.2).attr("y1", bY - 3.4).attr("x2", bX + 2.8).attr("y2", bY - 5.0).attr("stroke", ink).attr("stroke-width", 0.85);
  // Crossguard
  ng.append("line").attr("x1", bX + 0.7).attr("y1", bY - 3.1).attr("x2", bX + 1.5).attr("y2", bY - 3.9).attr("stroke", ink).attr("stroke-width", 0.5);
  // Scattered boulders at the hill base
  [{ x: -bs * 1.15, y: bs * 0.88 }, { x: -bs * 0.75, y: bs * 1.02 },
   { x:  bs * 0.75, y: bs * 1.02 }, { x:  bs * 1.15, y: bs * 0.88 }].forEach(({ x, y }) => {
    ng.append("ellipse").attr("cx", x).attr("cy", y).attr("rx", bs * 0.14).attr("ry", bs * 0.09)
      .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.5);
    ng.append("path")
      .attr("d", `M ${x - bs * 0.08} ${y - bs * 0.03} q ${bs * 0.08} ${-bs * 0.05} ${bs * 0.16} 0`)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.35).attr("opacity", 0.55);
  });
  // Ground line
  ng.append("line")
    .attr("x1", -bs * 1.3).attr("y1", bs * 0.98)
    .attr("x2",  bs * 1.3).attr("y2", bs * 0.98)
    .attr("stroke", ink).attr("stroke-width", 0.45).attr("opacity", 0.55);
}

// Kalla Cave — cave mouth with a small stream flowing out and a cluster of
// kalla mushrooms growing near the entrance (the cave is "stocked with a
// large supply of kalla").
function renderKallaCave(ng, { ink, parchment }) {
  const cs = 7;
  // Hill / cliff silhouette around the cave
  ng.append("path")
    .attr("d", `M ${-cs * 1.25} ${cs * 0.95}
                L ${-cs * 1.1} ${-cs * 0.1}
                L ${-cs * 0.7} ${-cs * 0.35}
                L ${-cs * 0.2} ${-cs * 0.1}
                L ${cs * 0.25} ${-cs * 0.35}
                L ${cs * 0.75} ${-cs * 0.1}
                L ${cs * 1.15} ${-cs * 0.25}
                L ${cs * 1.25} ${cs * 0.95} Z`)
    .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.8);
  // Short rocky hatching along the hill body
  for (let i = 0; i < 5; i++) {
    const hx0 = -cs * 0.9 + i * cs * 0.45;
    const hy0 = cs * 0.3 + (i % 2) * cs * 0.12;
    ng.append("line")
      .attr("x1", hx0).attr("y1", hy0).attr("x2", hx0 + cs * 0.12).attr("y2", hy0 + cs * 0.12)
      .attr("stroke", ink).attr("stroke-width", 0.35).attr("opacity", 0.4);
  }
  // Cave mouth — dark arched opening, slightly off-center
  const cmX = -cs * 0.2, cmW = cs * 0.8;
  const cmBaseY = cs * 0.95, cmTopY = cs * 0.0;
  ng.append("path")
    .attr("d", `M ${cmX - cmW / 2} ${cmBaseY}
                L ${cmX - cmW / 2} ${cmTopY + cs * 0.2}
                Q ${cmX} ${cmTopY - cs * 0.1} ${cmX + cmW / 2} ${cmTopY + cs * 0.2}
                L ${cmX + cmW / 2} ${cmBaseY} Z`)
    .attr("fill", ink).attr("opacity", 0.9);
  // Stream flowing out of the cave — two parallel wavy lines exiting right-down
  const streamStartX = cmX + cmW / 2 - 1;
  const streamStartY = cmBaseY - 0.5;
  ng.append("path")
    .attr("d", `M ${streamStartX} ${streamStartY}
                q ${cs * 0.35} ${cs * 0.05} ${cs * 0.6} ${cs * 0.15}
                t ${cs * 0.4} ${cs * 0.05}`)
    .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.6).attr("opacity", 0.75);
  ng.append("path")
    .attr("d", `M ${streamStartX - 0.4} ${streamStartY + 1.4}
                q ${cs * 0.35} ${cs * 0.05} ${cs * 0.6} ${cs * 0.15}
                t ${cs * 0.4} ${cs * 0.05}`)
    .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.6).attr("opacity", 0.75);
  // Tiny water ripple ticks along the stream
  [cs * 0.1, cs * 0.55, cs * 0.95].forEach(dx => {
    ng.append("path")
      .attr("d", `M ${streamStartX + dx - 1} ${streamStartY + 0.5} q 1 0.3 2 0`)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.35).attr("opacity", 0.5);
  });
  // Cluster of kalla mushrooms near the cave mouth — left side
  const mushrooms = [
    { x: -cs * 0.95, y: cs * 0.8, h: cs * 0.3 },
    { x: -cs * 0.75, y: cs * 0.85, h: cs * 0.22 },
    { x: -cs * 0.6,  y: cs * 0.8, h: cs * 0.27 },
    { x: -cs * 0.45, y: cs * 0.85, h: cs * 0.2 },
  ];
  mushrooms.forEach(({ x, y, h }) => {
    // Stalk
    ng.append("rect")
      .attr("x", x - 0.5).attr("y", y - h).attr("width", 1.0).attr("height", h - h * 0.35)
      .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.45);
    // Cap (dome)
    ng.append("path")
      .attr("d", `M ${x - h * 0.55} ${y - h * 0.65}
                  Q ${x} ${y - h * 1.2} ${x + h * 0.55} ${y - h * 0.65}
                  L ${x + h * 0.35} ${y - h * 0.65}
                  L ${x - h * 0.35} ${y - h * 0.65} Z`)
      .attr("fill", ink).attr("opacity", 0.85);
    // Tiny dots on the cap
    [-h * 0.22, 0, h * 0.22].forEach(dx => {
      ng.append("circle")
        .attr("cx", x + dx).attr("cy", y - h * 0.9).attr("r", 0.4)
        .attr("fill", parchment);
    });
  });
  // A couple of grass tufts at the right of the stream
  [cs * 0.9, cs * 1.1].forEach(gx => {
    [-0.3, 0, 0.3].forEach(off => {
      ng.append("line")
        .attr("x1", gx + off).attr("y1", cs * 0.97).attr("x2", gx + off * 1.5).attr("y2", cs * 0.75)
        .attr("stroke", ink).attr("stroke-width", 0.4).attr("opacity", 0.7);
    });
  });
  // Ground line
  ng.append("line")
    .attr("x1", -cs * 1.25).attr("y1", cs * 0.95)
    .attr("x2",  cs * 1.25).attr("y2", cs * 0.95)
    .attr("stroke", ink).attr("stroke-width", 0.45).attr("opacity", 0.55);
}

// Mountain pass — two flanking peaks with a narrow road/trail threading
// between them, appropriate for Serpent's Pass and South Pass.
function renderMountainPass(ng, { ink, parchment }) {
  const ps = 7;
  // Left peak — tall jagged triangle with shadow side
  ng.append("path")
    .attr("d", `M ${-ps * 1.4} ${ps * 0.95}
                L ${-ps * 0.6} ${-ps * 1.1}
                L ${-ps * 0.1} ${ps * 0.95} Z`)
    .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.9);
  // Shadow side of left peak
  ng.append("path")
    .attr("d", `M ${-ps * 0.6} ${-ps * 1.1}
                L ${-ps * 0.1} ${ps * 0.95}
                L ${-ps * 0.35} ${ps * 0.2} Z`)
    .attr("fill", ink).attr("opacity", 0.22);
  // Snow line on left peak
  ng.append("path")
    .attr("d", `M ${-ps * 0.85} ${-ps * 0.35}
                L ${-ps * 0.75} ${-ps * 0.6}
                L ${-ps * 0.55} ${-ps * 0.4}
                L ${-ps * 0.5} ${-ps * 0.6}`)
    .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.5).attr("opacity", 0.7);
  // Right peak — slightly shorter for visual variety
  ng.append("path")
    .attr("d", `M ${ps * 0.1} ${ps * 0.95}
                L ${ps * 0.65} ${-ps * 0.95}
                L ${ps * 1.5} ${ps * 0.95} Z`)
    .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.9);
  // Shadow side of right peak
  ng.append("path")
    .attr("d", `M ${ps * 0.65} ${-ps * 0.95}
                L ${ps * 1.5} ${ps * 0.95}
                L ${ps * 0.95} ${ps * 0.25} Z`)
    .attr("fill", ink).attr("opacity", 0.22);
  // Snow line on right peak
  ng.append("path")
    .attr("d", `M ${ps * 0.45} ${-ps * 0.25}
                L ${ps * 0.6} ${-ps * 0.5}
                L ${ps * 0.78} ${-ps * 0.3}`)
    .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.5).attr("opacity", 0.7);
  // Narrow pass road — a dashed curved line threading between the peaks
  ng.append("path")
    .attr("d", `M ${-ps * 1.4} ${ps * 1.15}
                Q ${-ps * 0.7} ${ps * 0.8} ${0} ${ps * 0.6}
                Q ${ps * 0.5} ${ps * 0.4} ${ps * 1.4} ${ps * 1.15}`)
    .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.85)
    .attr("stroke-linecap", "round").attr("stroke-dasharray", "3 2").attr("opacity", 0.7);
  // Ground line
  ng.append("line")
    .attr("x1", -ps * 1.5).attr("y1", ps * 1.0)
    .attr("x2", ps * 1.5).attr("y2", ps * 1.0)
    .attr("stroke", ink).attr("stroke-width", 0.45).attr("opacity", 0.5);
}

// Brunhilde's Mountain Watch Camp — a wooden stockade inn surrounded by a
// moat, with a recruiting banner flying above and a guard silhouette at
// the gate. Sits in the foothills before Serpent's Pass.
function renderWatchCamp(ng, { ink, parchment }) {
  const ws = 7;
  // Moat — outer ring ellipse (blue-ish under ink)
  ng.append("ellipse")
    .attr("cx", 0).attr("cy", ws * 0.1)
    .attr("rx", ws * 1.25).attr("ry", ws * 0.75)
    .attr("fill", ink).attr("opacity", 0.18);
  // Wavy ripples on moat surface
  [-ws * 0.9, ws * 0.9].forEach(xSign => {
    ng.append("path")
      .attr("d", `M ${xSign - ws * 0.15} ${ws * 0.1} q ${ws * 0.1} ${-ws * 0.05} ${ws * 0.2} 0 t ${ws * 0.2} 0`)
      .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.4).attr("opacity", 0.55);
  });
  ng.append("path")
    .attr("d", `M ${-ws * 0.3} ${-ws * 0.45} q ${ws * 0.12} ${-ws * 0.05} ${ws * 0.2} 0 t ${ws * 0.2} 0`)
    .attr("fill", "none").attr("stroke", ink).attr("stroke-width", 0.4).attr("opacity", 0.55);
  // Central island (clear ground inside moat)
  ng.append("ellipse")
    .attr("cx", 0).attr("cy", ws * 0.15)
    .attr("rx", ws * 0.85).attr("ry", ws * 0.5)
    .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.55);
  // Stockade — palisade ring of sharpened stakes around the building
  const stakeCount = 9;
  for (let i = 0; i < stakeCount; i++) {
    const t = i / (stakeCount - 1);
    const a = Math.PI * (0.15 + t * 0.7);
    const rx = Math.cos(a) * ws * 0.7;
    const ry = Math.sin(a) * ws * 0.35 + ws * 0.3;
    // Stake — tall triangle
    ng.append("path")
      .attr("d", `M ${rx - 0.3} ${ry} L ${rx} ${ry - ws * 0.28} L ${rx + 0.3} ${ry} Z`)
      .attr("fill", ink).attr("opacity", 0.85);
  }
  // Inn building — main log structure
  const inW = ws * 0.75, inH = ws * 0.45;
  const inX = 0, inY = -ws * 0.15;
  ng.append("rect")
    .attr("x", inX - inW / 2).attr("y", inY - inH * 0.2)
    .attr("width", inW).attr("height", inH)
    .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.75);
  // Peaked log roof
  ng.append("path")
    .attr("d", `M ${inX - inW / 2 - 0.8} ${inY - inH * 0.2}
                L ${inX} ${inY - inH * 0.85}
                L ${inX + inW / 2 + 0.8} ${inY - inH * 0.2} Z`)
    .attr("fill", parchment).attr("stroke", ink).attr("stroke-width", 0.75);
  // Horizontal log lines on the building side
  [0.15, 0.5, 0.85].forEach(ty => {
    ng.append("line")
      .attr("x1", inX - inW / 2 + 0.4).attr("y1", inY - inH * 0.2 + inH * ty)
      .attr("x2", inX + inW / 2 - 0.4).attr("y2", inY - inH * 0.2 + inH * ty)
      .attr("stroke", ink).attr("stroke-width", 0.35).attr("opacity", 0.45);
  });
  // Arched doorway on the front
  ng.append("path")
    .attr("d", `M ${inX - inW * 0.12} ${inY + inH * 0.8}
                L ${inX - inW * 0.12} ${inY + inH * 0.25}
                Q ${inX} ${inY + inH * 0.05} ${inX + inW * 0.12} ${inY + inH * 0.25}
                L ${inX + inW * 0.12} ${inY + inH * 0.8} Z`)
    .attr("fill", ink).attr("opacity", 0.85);
  // Tall flagpole on the roof with recruiting pennant (swallow-tail)
  const poleTopY = inY - inH * 0.85 - ws * 0.8;
  ng.append("line")
    .attr("x1", inX).attr("y1", inY - inH * 0.85)
    .attr("x2", inX).attr("y2", poleTopY)
    .attr("stroke", ink).attr("stroke-width", 0.7);
  ng.append("path")
    .attr("d", `M ${inX} ${poleTopY}
                L ${inX + ws * 0.55} ${poleTopY + ws * 0.08}
                L ${inX + ws * 0.4} ${poleTopY + ws * 0.18}
                L ${inX + ws * 0.55} ${poleTopY + ws * 0.28}
                L ${inX} ${poleTopY + ws * 0.2} Z`)
    .attr("fill", ink).attr("opacity", 0.9);
  // Tiny guard silhouette at the gate (pike/spear)
  const guardX = inX + inW * 0.45, guardY = inY + inH * 0.65;
  ng.append("rect").attr("x", guardX - 0.4).attr("y", guardY - 1.5).attr("width", 0.8).attr("height", 1.7).attr("fill", ink);
  ng.append("circle").attr("cx", guardX).attr("cy", guardY - 2.0).attr("r", 0.5).attr("fill", ink);
  ng.append("line").attr("x1", guardX + 0.4).attr("y1", guardY - 1.4).attr("x2", guardX + 0.4).attr("y2", guardY - 3.5).attr("stroke", ink).attr("stroke-width", 0.5);
  // Spear tip
  ng.append("path").attr("d", `M ${guardX + 0.4} ${guardY - 3.5} l -0.35 -0.3 l 0.7 0 Z`).attr("fill", ink);
}

// Central dispatcher for all id-based special icons. Each entry declares
// both the renderer and a baseline label offset (in pixels below node
// center) so a style can use a shared offset-lookup without duplicating
// per-id offset tables. Styles scale the baseline by their own factor.
const SPECIAL_ICONS = {
  "fae-glade":           { draw: (ng, node, opts) => renderFaeGlade(ng, opts),          labelOffset: 20 },
  "mistwood-glen":       { draw: (ng, node, opts) => renderMistwoodGlen(ng, node, opts), labelOffset: 22 },
  "crag-cairn":          { draw: (ng, node, opts) => renderCragCairn(ng, opts),          labelOffset: 26 },
  "mud-wallow":          { draw: (ng, node, opts) => renderMudWallow(ng, node, opts),    labelOffset: 22 },
  "kobold-crevasse":     { draw: (ng, node, opts) => renderKoboldCrevasse(ng, opts),     labelOffset: 24 },
  "pjork-choppe-hille":  { draw: (ng, node, opts) => renderPorcHills(ng, opts),          labelOffset: 22 },
  "basilisk-spiderwood": { draw: (ng, node, opts) => renderBasiliskSpiderwood(ng, opts), labelOffset: 24 },
  "graveyard":           { draw: (ng, node, opts) => renderGraveyard(ng, opts),          labelOffset: 20 },
  "tower-of-stargazer":  { draw: (ng, node, opts) => renderStargazerTower(ng, opts),     labelOffset: 22 },
  "ravens-perch":        { draw: (ng, node, opts) => renderRavensPerch(ng, opts),        labelOffset: 22 },
  "hangman-hill":        { draw: (ng, node, opts) => renderHangmanHill(ng, opts),        labelOffset: 22 },
  "the-swamp":           { draw: (ng, node, opts) => renderSwampWetlands(ng, opts),      labelOffset: 22 },
  "vault-of-first-light":{ draw: (ng, node, opts) => renderVaultOfFirstLight(ng, opts),  labelOffset: 24 },
  "spider-cave":         { draw: (ng, node, opts) => renderSpiderCave(ng, opts),         labelOffset: 22 },
  "bandit-camp":         { draw: (ng, node, opts) => renderBanditHill(ng, opts),         labelOffset: 24 },
  "kalla-cave":          { draw: (ng, node, opts) => renderKallaCave(ng, opts),          labelOffset: 22 },
  "serpents-pass":       { draw: (ng, node, opts) => renderMountainPass(ng, opts),       labelOffset: 22 },
  "south-pass":          { draw: (ng, node, opts) => renderMountainPass(ng, opts),       labelOffset: 22 },
  "south-road-mountain-watch": { draw: (ng, node, opts) => renderWatchCamp(ng, opts),    labelOffset: 24 },
};

function renderSpecialIcon(ng, node, opts) {
  // Name-based override: warding stones (two nodes, both match by name)
  if (node.name && node.name.toLowerCase().includes("warding stone")) {
    renderWardingStone(ng, node, opts);
    return true;
  }
  const entry = SPECIAL_ICONS[node.id];
  if (entry) {
    entry.draw(ng, node, opts);
    return true;
  }
  return false;
}

// Look up a style-scaled label offset for a node. Returns the baseline
// offset from SPECIAL_ICONS (if this node has a special icon) or undefined
// otherwise. Styles multiply by their own scaleFactor (1.0 for most, 0.9
// for moonletters' tighter label spacing).
function specialIconLabelOffset(node, scaleFactor = 1.0) {
  if (node.name && node.name.toLowerCase().includes("warding stone")) {
    return 18 * scaleFactor;
  }
  const entry = SPECIAL_ICONS[node.id];
  return entry ? entry.labelOffset * scaleFactor : undefined;
}

// Expose for global access
Object.assign(MapCore, {
  renderFaeGlade, renderWardingStone, renderCragCairn, renderMistwoodGlen, renderMudWallow,
  renderKoboldCrevasse, renderPorcHills, renderBasiliskSpiderwood, renderGraveyard, renderStargazerTower,
  renderRavensPerch, renderHangmanHill, renderSwampWetlands, renderVaultOfFirstLight, renderSpiderCave,
  renderBanditHill, renderKallaCave, renderMountainPass, renderWatchCamp, renderSpecialIcon, specialIconLabelOffset,
  HINT_SCALE, DAY_SCALE, FONT, INTERIOR_TERRAINS, SUBHEX_OFFSETS,
  isOverlandNode, hexToXY, xyToHex, hexNeighbors, renderRiver, renderRiverLabel, renderRoad, renderCrevasse, renderBridges, renderBoats, renderHexTerrain, renderMountainsWithElevation, renderMountainsByRegion, renderForestEdgeTrees, renderFarmlandBiased, renderRegionLabels, renderHexHover, renderTerrainEdges, formatDaysLabel, renderDayLabelsAlongLinks, mulberry32, seedFromString, computeBounds,
  showDetail, closePanel,
  loadData, runSimulation, setupSVG, centerView,
  renderMap, applyTheme, exportSVG,
  get graphData() { return graphData; }
});
