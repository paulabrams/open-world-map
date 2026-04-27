// === Open World Map — Shared Data Module ===
// Hex math, RNG, data loading, and overland-filter logic shared between the
// SVG pipeline (core.js + renderers/*.js) and the raster pipeline
// (core-raster.js + renderers/mapeffects.js).
//
// This file intentionally has no DOM or D3 dependency. Every helper that
// depends on viewport size accepts WIDTH/HEIGHT parameters explicitly.
//
// Loading order in the painted page: core-data.js → core-raster.js →
// renderers/mapeffects.js → painted.html init script.

(function () {
  "use strict";

  const HINT_SCALE = 100; // 1 unit = 1 inch on the hand-drawn 8.5"×11" page

  // Terrain tags that represent interior scenes, not points on the overland map.
  const INTERIOR_TERRAINS = new Set([
    "town", "city", "village", "keep", "stronghold", "castle",
    "ruin-interior", "underground",
  ]);

  function isOverlandNode(n) {
    if (n.visible === false) return false;
    if (n.scale === "local") return false;
    if (n.parent) return false;
    if (INTERIOR_TERRAINS.has(n.terrain)) return false;
    return true;
  }

  // --- Seeded RNG (deterministic stamp placement) ---
  function mulberry32(a) {
    return function () {
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

  // --- Hex math (pointy-top, odd-q offset, BC at col 10 / row 10) ---
  const BC_COL = 10, BC_ROW = 10;

  function hexCenterXY(hex, width, height) {
    const size = HINT_SCALE / 2;
    const colStep = size * 2 * 0.75;
    const rowStep = size * Math.sqrt(3);
    const col = parseInt(hex.substring(0, 2), 10);
    const row = parseInt(hex.substring(2, 4), 10);
    const shifted = (col % 2) !== (BC_COL % 2);
    const x = (col - BC_COL) * colStep + width / 2;
    const y = (row - BC_ROW) * rowStep + (shifted ? rowStep / 2 : 0) + height / 2;
    return [x, y];
  }

  function hexPolygon(hex, width, height) {
    const [cx, cy] = hexCenterXY(hex, width, height);
    const size = HINT_SCALE / 2;
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i; // flat-right corner first (pointy-top)
      pts.push([cx + size * Math.cos(angle), cy + size * Math.sin(angle)]);
    }
    return pts;
  }

  function xyToHex(x, y, width, height) {
    const size = HINT_SCALE / 2;
    const colStep = size * 2 * 0.75;
    const rowStep = size * Math.sqrt(3);
    const xRel = x - width / 2;
    const colGuess = Math.round(xRel / colStep) + BC_COL;
    let best = null, bestDist = Infinity;
    for (let dc = -1; dc <= 1; dc++) {
      const col = colGuess + dc;
      const isShifted = (col % 2) !== (BC_COL % 2);
      const colX = (col - BC_COL) * colStep + width / 2;
      const rowOff = isShifted ? rowStep / 2 : 0;
      const yRel = y - height / 2 - rowOff;
      const rowGuess = Math.round(yRel / rowStep) + BC_ROW;
      for (let dr = -1; dr <= 1; dr++) {
        const row = rowGuess + dr;
        const rowY = (row - BC_ROW) * rowStep + rowOff + height / 2;
        const dx = x - colX, dy = y - rowY;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist) { bestDist = d2; best = { col, row }; }
      }
    }
    if (!best) return null;
    return String(best.col).padStart(2, "0") + String(best.row).padStart(2, "0");
  }

  // --- Travel-time + route finding (parity with the SVG renderer) ---
  const TERRAIN_DAYS_PER_HEX = {
    "plains":         0.25, "grassland":    0.25, "clear":     0.25,
    "farmland":       0.25, "desert":       0.5,  "hills":     0.5,
    "forest":         0.75, "forested-hills": 1.0, "old-forest":1.0,
    "jungle":         1.0,  "mountains":    1.0,  "swamp":     1.0,
    "tundra":         0.5,
  };
  const DEFAULT_DAYS_PER_HEX = 0.5;
  const ROAD_MULTIPLIER = 2 / 3;

  function hexTravelDays(hex, hexTerrain) {
    const t = hexTerrain && hexTerrain[hex];
    const r = t ? TERRAIN_DAYS_PER_HEX[t] : undefined;
    return r != null ? r : DEFAULT_DAYS_PER_HEX;
  }

  function hexToCube(hex) {
    const col = parseInt(hex.substring(0, 2), 10);
    const row = parseInt(hex.substring(2, 4), 10);
    const parity = (col % 2) !== (BC_COL % 2) ? 1 : 0;
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

  function buildTravelGraph(graphData) {
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
    const edgeCost = (a, b) =>
      (hexTravelDays(a, hexTerrain) + hexTravelDays(b, hexTerrain)) / 2;
    const roads = (graphData && graphData.road_path) || [];
    const roadEntries = typeof roads[0] === "string" ? [{ hexes: roads }] : roads;
    roadEntries.forEach(entry => {
      const hexes = Array.isArray(entry) ? entry : (entry && entry.hexes) || [];
      if (hexes.length < 2) return;
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

  function dijkstra(graph, start, end) {
    if (!graph.has(start) || !graph.has(end)) return null;
    const dist = new Map();
    const prev = new Map();
    dist.set(start, 0);
    const visited = new Set();
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
    while (cur != null) { path.unshift(cur); cur = prev.get(cur); }
    return { path, days: dist.get(end) };
  }

  function hexLinePath(start, end, hexTerrain) {
    const n = hexDistance(start, end);
    const [x1, y1, z1] = hexToCube(start);
    const [x2, y2, z2] = hexToCube(end);
    const steps = Math.max(1, Math.round(n));
    const cubeToOffset = (cx, cz) => {
      const col = cx;
      const parity = (col % 2) !== (BC_COL % 2) ? 1 : 0;
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
    let days = 0;
    for (let i = 1; i < path.length; i++) {
      days += (hexTravelDays(path[i - 1], hexTerrain) + hexTravelDays(path[i], hexTerrain)) / 2;
    }
    return { path, days };
  }

  function findRoute(startHex, endHex, graphData) {
    if (startHex === endHex) return { path: [startHex], days: 0 };
    const { graph, known } = buildTravelGraph(graphData);
    if (known.has(startHex) && known.has(endHex)) {
      const res = dijkstra(graph, startHex, endHex);
      if (res) return res;
    }
    return hexLinePath(startHex, endHex, (graphData && graphData.hex_terrain) || {});
  }

  function formatDaysLabel(days) {
    if (days == null || !isFinite(days)) return "";
    if (Math.abs(days) < 0.001) return "0 d";
    if (days < 1) {
      const hours = Math.round(days * 24);
      if (hours <= 0) return "0 d";
      if (hours < 24) return hours + " h";
    }
    const rounded = Math.round(days * 4) / 4;
    return (Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")) + " d";
  }

  function hexNeighbors(hex) {
    if (typeof hex !== "string" || hex.length < 4) return [];
    const col = parseInt(hex.substring(0, 2), 10);
    const row = parseInt(hex.substring(2, 4), 10);
    if (isNaN(col) || isNaN(row)) return [];
    const isShifted = (col % 2) !== (BC_COL % 2);
    const offsets = isShifted
      ? [[0, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]
      : [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1]];
    return offsets.map(([dc, dr]) =>
      String(col + dc).padStart(2, "0") + String(row + dr).padStart(2, "0")
    );
  }

  function nodeXY(node, width, height) {
    if (node.hex) {
      const [cx, cy] = hexCenterXY(node.hex, width, height);
      // Honor x_hint/y_hint as a small within-hex offset (same convention
      // the SVG renderers use via the force simulation).
      if (Number.isFinite(node.x_hint) && Number.isFinite(node.y_hint)) {
        // hex-relative convention: (x_hint, y_hint) are inches from BC, so
        // they already represent absolute positions. Use them directly.
        return [node.x_hint * HINT_SCALE + width / 2, node.y_hint * HINT_SCALE + height / 2];
      }
      return [cx, cy];
    }
    if (Number.isFinite(node.x_hint) && Number.isFinite(node.y_hint)) {
      return [node.x_hint * HINT_SCALE + width / 2, node.y_hint * HINT_SCALE + height / 2];
    }
    return [width / 2, height / 2];
  }

  // Compute the pixel bounds covering every land hex in hex_terrain.
  function landBounds(hexTerrain, width, height, pad = 60) {
    const size = HINT_SCALE / 2;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    Object.keys(hexTerrain || {}).forEach(h => {
      const [cx, cy] = hexCenterXY(h, width, height);
      minX = Math.min(minX, cx - size);
      minY = Math.min(minY, cy - size);
      maxX = Math.max(maxX, cx + size);
      maxY = Math.max(maxY, cy + size);
    });
    if (!isFinite(minX)) return null;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }

  // --- Data loading ---
  // The campaign JSON is sometimes hand-edited and can pick up trailing
  // garbage (concurrent writes, partial pastes). Be tolerant: if JSON.parse
  // fails, walk the brace depth and try parsing the first complete object,
  // and if that also fails, surface a banner but return a minimal valid
  // graph so the rest of the page still renders.
  async function loadData(campaign) {
    const url = "../maps/" + campaign + "/" + campaign + ".json";
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Failed to load " + url + ": " + resp.status);
    const text = await resp.text();
    try { return JSON.parse(text); }
    catch (e) {
      console.error(`[loadData] ${url} parse failed: ${e.message}`);
      const truncated = truncateAtFirstCompleteObject(text);
      if (truncated && truncated.length < text.length) {
        try {
          const data = JSON.parse(truncated);
          console.warn(`[loadData] recovered ${url} by truncating ${text.length - truncated.length} stray bytes after first complete object`);
          showLoadError(`${url} had trailing junk; recovered the first complete object. Save the file again to clean it up.`);
          return data;
        } catch (_) { /* fall through */ }
      }
      showLoadError(`${url} is malformed JSON: ${e.message}. Showing an empty world.`);
      return MINIMAL_GRAPH();
    }
  }

  // Walk braces (string-aware) and return the substring up to and including
  // the first close-brace that returns the depth to zero.
  function truncateAtFirstCompleteObject(text) {
    let depth = 0, inString = false, escaped = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (escaped) { escaped = false; continue; }
      if (inString) {
        if (c === "\\") escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') { inString = true; continue; }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return text.slice(0, i + 1);
      }
    }
    return text;
  }

  function MINIMAL_GRAPH() {
    return {
      meta: {}, nodes: [], links: [], hex_terrain: {},
      river_path: [], road_path: [], off_map_arrows: [],
    };
  }

  function showLoadError(msg) {
    let bar = document.getElementById("map-load-error");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "map-load-error";
      bar.style.cssText = [
        "position:fixed", "top:0", "left:0", "right:0",
        "background:#9c2a1f", "color:#fdf6e3",
        "padding:8px 14px", "font-size:13px", "z-index:1000",
        "font-family:monospace", "border-bottom:1px solid #1a1410",
      ].join(";");
      document.body.appendChild(bar);
    }
    bar.textContent = "⚠ " + msg;
  }

  // --- Detail panel (shared DOM helpers) ---
  // The painted page uses the same panel markup as map.html. These are tiny
  // helpers so the renderer doesn't need to duplicate DOM plumbing.
  function openPanel(node, { connections = [], actions = [] } = {}) {
    const panel = document.getElementById("detail-panel");
    if (!panel) return;
    const el = id => document.getElementById(id);
    el("panel-hex-id").textContent = node.hex ? ("HEX " + node.hex) : "";
    el("panel-name").textContent = node.name || node.id || "";
    el("panel-type").textContent = node.point_type || "";
    el("panel-desc").textContent = node.description || "";
    el("panel-travel").textContent = "";
    el("panel-pois").innerHTML = "";
    const encEl = el("panel-encounter");
    if (encEl) encEl.innerHTML = "";
    const rumEl = el("panel-rumors");
    if (rumEl) rumEl.innerHTML = "";
    const actEl = el("panel-actions");
    if (actEl) {
      actEl.innerHTML = "";
      actions.forEach(a => {
        const btn = document.createElement("button");
        btn.className = "panel-action";
        btn.type = "button";
        btn.textContent = a.label;
        btn.addEventListener("click", () => a.onClick(btn));
        actEl.appendChild(btn);
      });
    }
    const connEl = el("panel-connections");
    if (connEl) {
      if (connections.length) {
        connEl.innerHTML = "<h3>Connections</h3><ul>" +
          connections.map(c => `<li>${escapeHtml(c)}</li>`).join("") + "</ul>";
      } else {
        connEl.innerHTML = "";
      }
    }
    panel.classList.add("open");
  }

  function closePanel() {
    const panel = document.getElementById("detail-panel");
    if (panel) panel.classList.remove("open");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  window.MapData = {
    HINT_SCALE,
    INTERIOR_TERRAINS,
    isOverlandNode,
    mulberry32, seedFromString,
    hexCenterXY, hexPolygon, xyToHex, hexNeighbors, nodeXY, landBounds,
    hexTravelDays, hexToCube, hexDistance,
    buildTravelGraph, dijkstra, hexLinePath, findRoute, formatDaysLabel,
    loadData,
    openPanel, closePanel, escapeHtml,
  };
})();
