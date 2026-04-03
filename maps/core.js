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

  // Generate wiggly sub-points between each hex center
  const wigglePoints = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / len, ny = dx / len; // perpendicular normal

    // Add the start point
    wigglePoints.push([x1, y1]);

    // Add 8-12 intermediate wiggle points per segment for real bends
    const segs = 8 + Math.floor(rng() * 5);
    let prevWiggle = 0;
    for (let s = 1; s <= segs; s++) {
      const t = s / (segs + 1);
      const mx = x1 + dx * t;
      const my = y1 + dy * t;
      // Big meander bends — river wanders side to side
      const meander = Math.sin(t * Math.PI * (2 + rng() * 3)) * len * 0.15;
      // Plus random local wiggle
      const localWiggle = (rng() - 0.5) * len * 0.08;
      const wiggle = meander + localWiggle;
      // Smooth transition from previous wiggle
      const smoothWiggle = prevWiggle * 0.3 + wiggle * 0.7;
      prevWiggle = smoothWiggle;
      wigglePoints.push([mx + nx * smoothWiggle, my + ny * smoothWiggle]);
    }
  }
  // Add final point
  wigglePoints.push(points[points.length - 1]);

  // Draw the main river as a variable-width path using overlapping strokes
  const line = d3.line().curve(d3.curveBasis);

  // Outer bank line (wider, lighter)
  riverGroup.append("path")
    .attr("d", line(wigglePoints))
    .attr("fill", "none")
    .attr("stroke", riverColor)
    .attr("stroke-width", riverWidth * 1.8)
    .attr("stroke-linecap", "round")
    .attr("opacity", 0.15);

  // Main river channel
  riverGroup.append("path")
    .attr("d", line(wigglePoints))
    .attr("fill", "none")
    .attr("stroke", riverColor)
    .attr("stroke-width", riverWidth)
    .attr("stroke-linecap", "round")
    .attr("opacity", 0.6);

  // Narrow center current (lighter highlight)
  riverGroup.append("path")
    .attr("d", line(wigglePoints))
    .attr("fill", "none")
    .attr("stroke", riverColor)
    .attr("stroke-width", riverWidth * 0.3)
    .attr("stroke-linecap", "round")
    .attr("opacity", 0.25);

  // Widenings and pools at random points along the river
  for (let i = 3; i < wigglePoints.length - 3; i += 2 + Math.floor(rng() * 4)) {
    const [px, py] = wigglePoints[i];
    const poolSize = riverWidth * (1.0 + rng() * 2.0);
    riverGroup.append("ellipse")
      .attr("cx", px + (rng() - 0.5) * 4)
      .attr("cy", py + (rng() - 0.5) * 4)
      .attr("rx", poolSize)
      .attr("ry", poolSize * (0.6 + rng() * 0.4))
      .attr("fill", riverColor)
      .attr("opacity", 0.15)
      .attr("transform", `rotate(${rng() * 360}, ${px}, ${py})`);
  }
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

// --- Bounds ---
function computeBounds(nodes) {
  return {
    minX: d3.min(nodes, d => d.x) - 50,
    maxX: d3.max(nodes, d => d.x) + 50,
    minY: d3.min(nodes, d => d.y) - 50,
    maxY: d3.max(nodes, d => d.y) + 50,
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
  isOverlandNode, renderRiver, renderHexTerrain, mulberry32, seedFromString, computeBounds,
  showDetail, closePanel,
  loadData, runSimulation, setupSVG, centerView,
  renderMap, applyTheme, exportSVG,
  get graphData() { return graphData; }
});
