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
  const line = d3.line().curve(d3.curveBasis);

  // Normalize entries: accept array (legacy), or {hexes, label?, days?}
  const paths = roadPath.map(entry => {
    if (Array.isArray(entry)) return { hexes: entry };
    if (entry && entry.hexes) return entry;
    return { hexes: roadPath };
  });
  // Handle legacy single flat array
  const isFlatLegacy = typeof roadPath[0] === "string";
  const normalized = isFlatLegacy ? [{ hexes: roadPath }] : paths;

  normalized.forEach((pathObj, pathIdx) => {
    const hexes = pathObj.hexes;
    if (!hexes || hexes.length < 2) return;

    const points = hexes.map(h => {
      const col = parseInt(h.substring(0, 2));
      const row = parseInt(h.substring(2, 4));
      const x = (col - bcCol) * colStep + WIDTH / 2;
      const y = (row - bcRow) * rowStep + (col % 2 !== bcCol % 2 ? rowStep / 2 : 0) + HEIGHT / 2;
      return [x, y];
    });

    const rng = mulberry32(seedFromString("road-" + pathIdx));

    const wigglePoints = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = -dy / len, ny = dx / len;

      wigglePoints.push([x1, y1]);

      const segs = 2 + Math.floor(rng() * 2);
      for (let s = 1; s <= segs; s++) {
        const t = s / (segs + 1);
        const mx = x1 + dx * t;
        const my = y1 + dy * t;
        const wiggle = (rng() - 0.5) * len * 0.04;
        wigglePoints.push([mx + nx * wiggle, my + ny * wiggle]);
      }
    }
    wigglePoints.push(points[points.length - 1]);

    roadGroup.append("path")
      .attr("d", line(wigglePoints))
      .attr("fill", "none")
      .attr("stroke", roadColor)
      .attr("stroke-width", roadWidth)
      .attr("stroke-linecap", "round")
      .attr("opacity", 0.8);

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
function renderHexTerrain(ctx, terrainDrawers) {
  const { g, hexTerrain, HINT_SCALE, WIDTH, HEIGHT, mulberry32, seedFromString } = ctx;
  if (!hexTerrain || Object.keys(hexTerrain).length === 0) return;

  const bcCol = 10, bcRow = 10;
  const size = HINT_SCALE / 2;
  const colStep = size * 2 * 0.75;
  const rowStep = size * Math.sqrt(3);

  const terrainGroup = g.append("g").attr("class", "terrain");

  Object.entries(hexTerrain).forEach(([hex, terrain]) => {
    const drawer = terrainDrawers[terrain];
    if (!drawer) return;

    const col = parseInt(hex.substring(0, 2));
    const row = parseInt(hex.substring(2, 4));
    const hx = (col - bcCol) * colStep + WIDTH / 2;
    const hy = (row - bcRow) * rowStep + (col % 2 !== bcCol % 2 ? rowStep / 2 : 0) + HEIGHT / 2;

    const rng = mulberry32(seedFromString(hex));

    // Draw multiple decorations scattered around the hex center
    const count = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (rng() - 0.5) * 1.0;
      const r = 10 + rng() * 25;
      const dx = hx + Math.cos(angle) * r;
      const dy = hy + Math.sin(angle) * r;
      drawer(terrainGroup, dx, dy, 8 + rng() * 5, rng);
    }
  });
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

    Object.keys(graphData.hex_terrain).forEach(hex => {
      const col = parseInt(hex.substring(0, 2));
      const row = parseInt(hex.substring(2, 4));
      const hx = (col - bcCol) * colStep + WIDTH / 2;
      const hy = (row - bcRow) * rowStep + (col % 2 !== bcCol % 2 ? rowStep / 2 : 0) + HEIGHT / 2;
      minX = Math.min(minX, hx);
      maxX = Math.max(maxX, hx);
      minY = Math.min(minY, hy);
      maxY = Math.max(maxY, hy);
    });
  }

  // Expand to include river path positions
  if (graphData && graphData.river_path) {
    const bcCol = 10, bcRow = 10;
    const size = HINT_SCALE / 2;
    const colStep = size * 2 * 0.75;
    const rowStep = size * Math.sqrt(3);

    graphData.river_path.forEach(hex => {
      const col = parseInt(hex.substring(0, 2));
      const row = parseInt(hex.substring(2, 4));
      const hx = (col - bcCol) * colStep + WIDTH / 2;
      const hy = (row - bcRow) * rowStep + (col % 2 !== bcCol % 2 ? rowStep / 2 : 0) + HEIGHT / 2;
      minX = Math.min(minX, hx);
      maxX = Math.max(maxX, hx);
      minY = Math.min(minY, hy);
      maxY = Math.max(maxY, hy);
    });
  }

  // Expand to include road path positions
  if (graphData && graphData.road_path) {
    const bcCol = 10, bcRow = 10;
    const size = HINT_SCALE / 2;
    const colStep = size * 2 * 0.75;
    const rowStep = size * Math.sqrt(3);

    // road_path entries can be arrays, objects {hexes}, or a single flat array
    let roadPaths;
    if (typeof graphData.road_path[0] === "string") {
      roadPaths = [graphData.road_path];
    } else {
      roadPaths = graphData.road_path.map(entry =>
        Array.isArray(entry) ? entry : (entry && entry.hexes) || []
      );
    }
    roadPaths.forEach(path => {
      path.forEach(hex => {
        const col = parseInt(hex.substring(0, 2));
        const row = parseInt(hex.substring(2, 4));
        const hx = (col - bcCol) * colStep + WIDTH / 2;
        const hy = (row - bcRow) * rowStep + (col % 2 !== bcCol % 2 ? rowStep / 2 : 0) + HEIGHT / 2;
        minX = Math.min(minX, hx);
        maxX = Math.max(maxX, hx);
        minY = Math.min(minY, hy);
        maxY = Math.max(maxY, hy);
      });
    });
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
    if (n.x_hint !== undefined) n.x = n.x_hint * HINT_SCALE + WIDTH / 2;
    if (n.y_hint !== undefined) n.y = n.y_hint * HINT_SCALE + HEIGHT / 2;
  });

  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(d => Math.max(40, (d.days || 1) * DAY_SCALE)).strength(0.05))
    .force("charge", d3.forceManyBody().strength(-50))
    .force("collide", d3.forceCollide(15))
    .force("x", d3.forceX(d => (d.x_hint || 0) * HINT_SCALE + WIDTH / 2).strength(0.9))
    .force("y", d3.forceY(d => (d.y_hint || 0) * HINT_SCALE + HEIGHT / 2).strength(0.9));

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
    hexTerrain: graphData.hex_terrain || {}
  };

  // Run the style's render pipeline
  style.render(ctx);

  // Overlay grid if requested
  if (gridName && gridName !== "none" && MapGrids[gridName]) {
    MapGrids[gridName].render(ctx);
  }

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
  HINT_SCALE, DAY_SCALE, FONT, INTERIOR_TERRAINS,
  isOverlandNode, renderRiver, renderRoad, renderHexTerrain, renderTerrainEdges, mulberry32, seedFromString, computeBounds,
  showDetail, closePanel,
  loadData, runSimulation, setupSVG, centerView,
  renderMap, applyTheme, exportSVG,
  get graphData() { return graphData; }
});
