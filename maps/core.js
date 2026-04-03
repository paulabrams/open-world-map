// === Open World Map — Core Module ===
// Shared utilities, data loading, simulation, rendering orchestrator.

window.MapCore = {};
window.MapStyles = {};
window.MapGrids = {};

// --- Constants ---
const HINT_SCALE = 100; // 1 unit = 1 inch on the hand-drawn 8.5x11 map
const DAY_SCALE = 100;
const FONT = "'Palatino Linotype', 'Book Antiqua', Palatino, serif";

// --- Terrain types that are interior locations (not shown on overland map) ---
const INTERIOR_TERRAINS = new Set(["town", "city", "village", "keep", "stronghold", "castle", "ruin-interior"]);

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
  isOverlandNode, mulberry32, seedFromString, computeBounds,
  showDetail, closePanel,
  loadData, runSimulation, setupSVG, centerView,
  renderMap, applyTheme, exportSVG,
  get graphData() { return graphData; }
});
