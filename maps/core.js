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
// riverColor and riverWidth are style-dependent. Called from style render functions.
function renderRiver(ctx, riverColor, riverWidth) {
  const { g, riverPath, HINT_SCALE, WIDTH, HEIGHT } = ctx;
  if (!riverPath || riverPath.length < 2) return;

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

  // Subtle water body fill between the banks
  const waterPath = leftBank.concat(rightBank.slice().reverse());
  riverGroup.append("path")
    .attr("d", d3.line().curve(d3.curveLinearClosed)(waterPath))
    .attr("fill", riverColor)
    .attr("stroke", "none")
    .attr("opacity", 0.08);

  // Two bank lines — hand-drawn feel, thin ink
  const bankStroke = Math.max(0.9, riverWidth * 0.4);
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

  // Invisible spine path as a textPath anchor for the river name label.
  const spineId = "river-spine-" + Math.random().toString(36).slice(2, 8);
  riverGroup.append("path")
    .attr("id", spineId)
    .attr("d", line(wigglePoints))
    .attr("fill", "none")
    .attr("stroke", "none");
  // Expose the id so styles can render the river name on it.
  ctx._riverSpineId = spineId;

  // Small islands in wider stretches
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

// --- Hex terrain rendering ---
// Draws terrain decorations at hex centers based on hex_terrain data.
// terrainDrawers is an object mapping terrain type to a draw function: (g, x, y, size, rng) => void
// options.density scales the scatter point count: 1.0 = full 7 points, 0.3 = center only.
function renderHexTerrain(ctx, terrainDrawers, options) {
  const { g, hexTerrain, HINT_SCALE, WIDTH, HEIGHT, mulberry32, seedFromString } = ctx;
  if (!hexTerrain || Object.keys(hexTerrain).length === 0) return;

  const bcCol = 10, bcRow = 10;
  const size = HINT_SCALE / 2;
  const colStep = size * 2 * 0.75;
  const rowStep = size * Math.sqrt(3);

  const density = (options && typeof options.density === "number") ? options.density : 1.0;
  const terrainGroup = g.append("g").attr("class", "terrain");

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
    const gridPoints = fullGrid.slice(0, targetN);
    gridPoints.forEach(([ox, oy]) => {
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

// --- Format fractional days for display: 0.5 → "½", 0.25 → "¼", 0.75 → "¾" ---
function formatDaysLabel(days) {
  if (days === 1) return "1 day";
  if (days === 0.5) return "\u00BD day";
  if (days === 0.25) return "\u00BC day";
  if (days === 0.75) return "\u00BE day";
  const whole = Math.floor(days);
  const frac = days - whole;
  let fracStr = "";
  if (frac === 0.5) fracStr = "\u00BD";
  else if (frac === 0.25) fracStr = "\u00BC";
  else if (frac === 0.75) fracStr = "\u00BE";
  if (whole > 0 && fracStr) return whole + fracStr + " days";
  return days + " days";
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

  labels.forEach(entry => {
    if (!entry.hexes || !entry.hexes.length || !entry.text) return;
    // Compute centroid of the region's hex centers
    let sumX = 0, sumY = 0, count = 0;
    entry.hexes.forEach(h => {
      if (typeof h !== "string" || h.length < 4) return;
      const col = parseInt(h.substring(0, 2));
      const row = parseInt(h.substring(2, 4));
      if (isNaN(col) || isNaN(row)) return;
      const hx = (col - bcCol) * colStep + WIDTH / 2;
      const hy = (row - bcRow) * rowStep + (col % 2 !== bcCol % 2 ? rowStep / 2 : 0) + HEIGHT / 2;
      sumX += hx; sumY += hy; count++;
    });
    if (count === 0) return;
    const cx = sumX / count, cy = sumY / count;

    const fontSize = entry.fontSize || defaults.fontSize || 20;
    const rotation = entry.rotation != null ? entry.rotation : (defaults.rotation || 0);
    const color = entry.color || defaults.color || "#335";
    const strokeColor = entry.strokeColor || defaults.strokeColor || "#f4e8d1";
    const letterSpacing = entry.letterSpacing || defaults.letterSpacing || "4px";
    const fontStyle = entry.fontStyle || defaults.fontStyle || "italic";
    const opacity = entry.opacity != null ? entry.opacity : (defaults.opacity != null ? defaults.opacity : 0.75);

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

    // Elevation factor: ~0.6 on isolated peak, ~1.35 on fully interior hex
    const elevation = 0.6 + (mountainNeighborCount / 6) * 0.75;

    // Scatter pattern: center + inner ring, trimmed by density
    const fullGrid = [
      [0, 0],
      ...[0, 60, 120, 180, 240, 300].map(a => {
        const r = size * 0.65;
        return [Math.cos(a * Math.PI / 180) * r, Math.sin(a * Math.PI / 180) * r];
      }),
    ];
    const targetN = Math.max(1, Math.round(fullGrid.length * density));
    const gridPoints = fullGrid.slice(0, targetN);
    gridPoints.forEach(([ox, oy]) => {
      const jitterX = (rng() - 0.5) * size * 0.18;
      const jitterY = (rng() - 0.5) * size * 0.18;
      const mSize = (8 + rng() * 5) * elevation;
      mountainDrawer(terrainGroup, hx + ox + jitterX, hy + oy + jitterY, mSize, rng);
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

// --- Edge-aware forest tree scattering ---
// For hexes in `matchTerrains` (e.g. forest, forested-hills), concentrate tree
// scatter centers along edges that border non-matching neighbors. Interior
// hexes (all neighbors match) get sparse scatter. This produces the classic
// "border of trees" look where the forest silhouette reads clearly.
function renderForestEdgeTrees(ctx, drawer, matchTerrains, options) {
  const { g, hexTerrain, HINT_SCALE, WIDTH, HEIGHT, mulberry32, seedFromString } = ctx;
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

    if (externalEdges.length === 0) {
      // Interior — sparse: scaled 2-3 central trees
      const baseN = 2 + Math.floor(rng() * 2);
      const n = Math.max(0, Math.round(baseN * density));
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2;
        const r = size * (0.1 + rng() * 0.25);
        drawer(terrainGroup, hx + Math.cos(a) * r, hy + Math.sin(a) * r, 8 + rng() * 4, rng);
      }
      return;
    }

    // Border hex — concentrate trees along each external edge
    externalEdges.forEach(edgeIdx => {
      const [mx, my] = edgeMids[edgeIdx];
      const [tx, ty] = edgeTangents[edgeIdx];
      const inset = 0.82;
      const mxInset = mx * inset;
      const myInset = my * inset;
      const baseN = 3 + Math.floor(rng() * 2);
      const n = Math.max(1, Math.round(baseN * density));
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : (i / (n - 1) - 0.5);
        const span = t * size * 0.75;
        const jitterX = (rng() - 0.5) * size * 0.12;
        const jitterY = (rng() - 0.5) * size * 0.12;
        const depthJitter = rng() * size * 0.15;
        const inwardX = -mx / Math.sqrt(mx * mx + my * my) * depthJitter;
        const inwardY = -my / Math.sqrt(mx * mx + my * my) * depthJitter;
        const ox = mxInset + tx * span + jitterX + inwardX;
        const oy = myInset + ty * span + jitterY + inwardY;
        drawer(terrainGroup, hx + ox, hy + oy, 8 + rng() * 4, rng);
      }
    });
    // A light interior sprinkle so the hex center isn't empty on thick-border
    // hexes; omit when nearly all sides are external so the edge reads clearly.
    if (externalEdges.length <= 3) {
      const baseN = 1 + Math.floor(rng() * 2);
      const n = Math.max(0, Math.round(baseN * density));
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2;
        const r = size * (0.1 + rng() * 0.2);
        drawer(terrainGroup, hx + Math.cos(a) * r, hy + Math.sin(a) * r, 8 + rng() * 4, rng);
      }
    }
  });
}

// --- Hex hover info ---
// Updates the side info panel based on which hex the pointer is over.
// Uses SVG-level mousemove so node click handlers keep working.
function renderHexHover(ctx) {
  const { g, HINT_SCALE, WIDTH, HEIGHT, nodes, hexTerrain } = ctx;
  const panel = document.getElementById("hex-panel");
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

  svgSel.on("mousemove.hex-hover", function (event) {
    const pt = d3.pointer(event, g.node());
    const hex = pixelToHex(pt[0], pt[1]);
    if (hex && hex !== currentHex) {
      currentHex = hex;
      const [cx, cy] = hexCenter(hex);
      highlight
        .attr("transform", `translate(${cx}, ${cy})`)
        .attr("opacity", 0.5);
      updatePanel(hex);
    }
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
  svgSel.on("mouseleave.hex-hover", () => {
    currentHex = null;
    highlight.attr("opacity", 0);
    panel.classList.remove("visible");
    if (coordEl) coordEl.classList.remove("visible");
  });

  function updatePanel(hex) {
    const terrain = (hexTerrain && hexTerrain[hex]) || null;
    const pois = hexNodes[hex] || [];
    if (!terrain && pois.length === 0) {
      panel.classList.remove("visible");
      return;
    }
    document.getElementById("hex-panel-id").textContent = "Hex " + hex;
    document.getElementById("hex-panel-terrain").textContent = terrain ? terrain.replace(/-/g, " ") : "—";
    const poisEl = document.getElementById("hex-panel-pois");
    if (pois.length === 0) {
      poisEl.innerHTML = '<div class="hex-empty">No points of interest</div>';
    } else {
      poisEl.innerHTML = pois.map(n => {
        const name = escapeHtml(n.name || n.id);
        const type = escapeHtml((n.point_type || "") + (n.scale === "local" ? " (local)" : ""));
        const desc = n.description ? escapeHtml(n.description) : "";
        return `<div class="poi"><div class="poi-name">${name}</div>` +
          (type ? `<div class="poi-type">${type}</div>` : "") +
          (desc ? `<div class="poi-desc">${desc}</div>` : "") +
          "</div>";
      }).join("");
    }
    panel.classList.add("visible");
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

function showDetail(node) {
  const panel = document.getElementById("detail-panel");
  document.getElementById("panel-name").textContent = node.name;
  document.getElementById("panel-type").textContent =
    node.point_type.charAt(0).toUpperCase() + node.point_type.slice(1) +
    (node.terrain ? " \u2022 " + node.terrain : "") +
    (node.hex ? " \u2022 hex " + node.hex : "");
  document.getElementById("panel-desc").textContent = node.description || "";

  const connections = graphData.links.filter(l =>
    (l.source.id || l.source) === node.id || (l.target.id || l.target) === node.id
  );
  const connHTML = connections.map(l => {
    const other = (l.source.id || l.source) === node.id ? l.target : l.source;
    const name = other.name || other.id || other;
    const days = l.days ? ` (${l.days} ${l.days === 1 ? "day" : "days"})` : "";
    const type = l.path_type ? ` \u2014 ${l.path_type}` : "";
    return `<li>\u2192 ${name}${days}${type}</li>`;
  }).join("");
  document.getElementById("panel-connections").innerHTML =
    connections.length ? `<h3>Paths</h3><ul>${connHTML}</ul>` : "";

  panel.classList.add("open");
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
  svg.call(zoom);
  svg.on("click", () => closePanel());

  return { svg, defs, g, zoom };
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

  _currentStyle = styleName;
  _currentGrid = gridName;

  const WIDTH = window.innerWidth;
  const HEIGHT = window.innerHeight;

  // Re-run simulation if needed (filter function may differ per style)
  const sim = runSimulation(graphData, style.filterNodes);

  applyTheme(style);

  const { svg, defs, g, zoom } = setupSVG();

  // Build render context
  const ctx = {
    g, defs,
    nodes: sim.nodes,
    links: sim.links,
    bounds: sim.bounds,
    meta: sim.meta,
    colors: style.colors,
    WIDTH, HEIGHT, HINT_SCALE, DAY_SCALE,
    mulberry32, seedFromString, FONT,
    riverPath: graphData.river_path || [],
    roadPath: graphData.road_path || [],
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

// Expose for global access
Object.assign(MapCore, {
  HINT_SCALE, DAY_SCALE, FONT, INTERIOR_TERRAINS, SUBHEX_OFFSETS,
  isOverlandNode, hexToXY, renderRiver, renderRiverLabel, renderRoad, renderBridges, renderHexTerrain, renderMountainsWithElevation, renderForestEdgeTrees, renderRegionLabels, renderHexHover, renderTerrainEdges, formatDaysLabel, renderDayLabelsAlongLinks, mulberry32, seedFromString, computeBounds,
  showDetail, closePanel,
  loadData, runSimulation, setupSVG, centerView,
  renderMap, applyTheme, exportSVG,
  get graphData() { return graphData; }
});
