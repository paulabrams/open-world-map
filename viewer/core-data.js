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

  // --- Travel-time + route finding ---
  // 6-hour watches on a 6-mile hex. Path type carries the speed advantage;
  // off-trail terrain is binary (normal vs. perilous):
  //   road       → 3 hexes / watch · 2h / hex
  //   trail      → 2 hexes / watch · 3h / hex   (future — needs trail_path)
  //   off-trail  → 1 hex / watch  · 6h / hex
  //   off-trail in mountains / swamp / jungle → ½ hex / watch · 12h / hex
  // A normal merchant's day = 2 watches (dawn to dusk, 12h marching).
  // Every watch past 2 in the same day costs 1d6 HP per PC.
  const TERRAIN_HOURS_PER_HEX = {
    // Off-trail normal — 1 hex / watch
    "plains":         6,  "grassland":    6,  "clear":      6,
    "farmland":       6,  "desert":       6,  "hills":      6,
    "forest":         6,  "forested-hills": 6, "old-forest": 6,
    "tundra":         6,  "farmland-forest": 6,
    // Off-trail perilous — ½ hex / watch
    "mountains":     12,  "swamp":       12,  "jungle":    12,
  };
  const DEFAULT_HOURS_PER_HEX = 6;
  const ROAD_HOURS_CAP  = 2;
  const TRAIL_HOURS_CAP = 3;   // applied if a future `trail_path` is present
  // Productive marching hours per calendar day for "days + hours" display.
  const HOURS_PER_DAY_FAMILIAR  = 8;
  const HOURS_PER_DAY_UNEXPLORED = 6;

  function hexTravelHours(hex, hexTerrain) {
    const t = hexTerrain && hexTerrain[hex];
    const r = t ? TERRAIN_HOURS_PER_HEX[t] : undefined;
    return r != null ? r : DEFAULT_HOURS_PER_HEX;
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
    const addEdge = (a, b, hours) => {
      if (!graph.has(a)) graph.set(a, new Map());
      if (!graph.has(b)) graph.set(b, new Map());
      const cur = graph.get(a).get(b);
      if (cur == null || hours < cur) {
        graph.get(a).set(b, hours);
        graph.get(b).set(a, hours);
      }
    };
    const hexTerrain = (graphData && graphData.hex_terrain) || {};
    // Rivers are treated as perilous off-trail (12h/hex) — fording or
    // wading takes time. Roads/trails crossing a river hex stay capped
    // (bridges/fords) because the road/trail edge override wins.
    const riverHexes = new Set((graphData && graphData.river_path) || []);
    const hexTravelHoursWithRiver = (h) => {
      const base = hexTravelHours(h, hexTerrain);
      return riverHexes.has(h) ? Math.max(base, 12) : base;
    };
    const edgeCost = (a, b) =>
      (hexTravelHoursWithRiver(a) + hexTravelHoursWithRiver(b)) / 2;
    function addPathEntries(entries, defaultCap) {
      const norm = typeof entries[0] === "string" ? [{ hexes: entries }] : entries;
      norm.forEach(entry => {
        const hexes = Array.isArray(entry) ? entry : (entry && entry.hexes) || [];
        if (hexes.length < 2) return;
        // Author override: `entry.hours` direct; `entry.days` legacy (× 8h).
        let explicitPerHop = null;
        if (entry && entry.hours && hexes.length > 1) {
          explicitPerHop = entry.hours / (hexes.length - 1);
        } else if (entry && entry.days && hexes.length > 1) {
          explicitPerHop = (entry.days * 8) / (hexes.length - 1);
        }
        for (let i = 0; i < hexes.length - 1; i++) {
          const cost = explicitPerHop != null ? explicitPerHop : defaultCap;
          addEdge(hexes[i], hexes[i + 1], cost);
        }
      });
    }
    const roads  = (graphData && graphData.road_path)  || [];
    const trails = (graphData && graphData.trail_path) || [];
    addPathEntries(roads,  ROAD_HOURS_CAP);
    addPathEntries(trails, TRAIL_HOURS_CAP);
    const known = new Set();
    if (graphData) {
      if (graphData.hex_terrain) Object.keys(graphData.hex_terrain).forEach(h => known.add(h));
      if (graphData.river_path) graphData.river_path.forEach(h => known.add(h));
      if (graphData.nodes) graphData.nodes.forEach(n => { if (n.hex) known.add(n.hex); });
      [roads, trails].forEach(entries => {
        (typeof entries[0] === "string" ? [{ hexes: entries }] : entries).forEach(entry => {
          const hexes = Array.isArray(entry) ? entry : (entry && entry.hexes) || [];
          hexes.forEach(h => known.add(h));
        });
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
    return { path, hours: dist.get(end) };
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
    let hours = 0;
    for (let i = 1; i < path.length; i++) {
      hours += (hexTravelHours(path[i - 1], hexTerrain) + hexTravelHours(path[i], hexTerrain)) / 2;
    }
    return { path, hours };
  }

  function findRoute(startHex, endHex, graphData) {
    if (startHex === endHex) return { path: [startHex], hours: 0 };
    const { graph, known } = buildTravelGraph(graphData);
    if (known.has(startHex) && known.has(endHex)) {
      const res = dijkstra(graph, startHex, endHex);
      if (res) return res;
    }
    return hexLinePath(startHex, endHex, (graphData && graphData.hex_terrain) || {});
  }

  // ---- Watches model ------------------------------------------------------
  // 1 watch = 6 hours. A typical merchant's day = 2 watches (dawn to dusk,
  // 12h marching, 6 road hexes). Each watch past 2 in a single day costs
  // 1d6 HP per PC, reset by a full night's rest.
  //   safe   = 2  → 0 d6 cost per day
  //   push   = 3  → 1d6 cost per day (into the night, 18h)
  //   forced = 4  → 2d6 cost per day (all-day all-night, hard cap)
  const HOURS_PER_WATCH = 6;
  const PACE_WATCHES = { safe: 2, push: 3, forced: 4 };

  // Plan a route across days at the chosen pace. Total watches are rounded
  // to the nearest half-watch (so a 6h leg reads as 1.5w, not "2w too long").
  // Per-day cost: every started watch past the 2nd costs 1d6 HP — half a
  // watch into the danger zone still triggers (you don't get half a d6),
  // hence ceil() on the over-2 portion.
  function planRoute(hours, pace) {
    const watches = Math.max(0, Math.round((hours || 0) * 2 / HOURS_PER_WATCH) / 2);
    const perDay  = PACE_WATCHES[pace] || PACE_WATCHES.safe;
    const days    = watches === 0 ? 0 : Math.ceil(watches / perDay);
    let cost = 0;
    let remaining = watches;
    for (let d = 0; d < days; d++) {
      const today = Math.min(perDay, remaining);
      cost += Math.max(0, Math.ceil(today - 2));
      remaining -= today;
    }
    return { watches, days, cost, perDay };
  }

  // Classify each edge of a route as road / trail / off-trail and produce a
  // natural-language descriptor: "by road", "by trail", "overland", or
  // mixed combinations like "by road and overland".
  function describeRoutePathType(path, graphData) {
    if (!path || path.length < 2 || !graphData) return "";
    let road = 0, trail = 0, off = 0;
    const onPath = (a, b, paths) => {
      if (!paths) return false;
      const norm = typeof paths[0] === "string" ? [paths] : paths;
      return norm.some(entry => {
        const hexes = Array.isArray(entry) ? entry : (entry && entry.hexes) || [];
        for (let i = 1; i < hexes.length; i++) {
          if ((hexes[i - 1] === a && hexes[i] === b)
           || (hexes[i - 1] === b && hexes[i] === a)) return true;
        }
        return false;
      });
    };
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      if      (onPath(a, b, graphData.road_path))  road++;
      else if (onPath(a, b, graphData.trail_path)) trail++;
      else                                         off++;
    }
    const total = road + trail + off;
    if (total === 0) return "";
    if (road  === total) return "by road";
    if (trail === total) return "by trail";
    if (off   === total) return "overland";
    const parts = [];
    if (road)  parts.push("road");
    if (trail) parts.push("trail");
    if (off)   parts.push("overland");
    if (parts.length === 2) return "by " + parts.join(" and ");
    return "by " + parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
  }

  // Route midpoint label: "3 watches (18 hours)". Compact, no per-pace
  // day-counts (those depend on the GM's chosen pace). Miles + path-type
  // breakdown live in the hovercard, not the inline label.
  function formatRouteLabel(path, hours /*, graphData */) {
    if (hours == null || !isFinite(hours)) return "";
    const watches = Math.max(0, Math.round((hours || 0) * 2 / HOURS_PER_WATCH) / 2);
    const watchStr = (watches % 1 === 0) ? String(watches) : watches.toFixed(1);
    const noun = watches === 1 ? "watch" : "watches";
    const hoursRound = Math.round(hours);
    const hoursNoun = hoursRound === 1 ? "hour" : "hours";
    return watchStr + " " + noun + " (" + hoursRound + " " + hoursNoun + ")";
  }

  // Back-compat: callers that still pass (hours, miles) get the simpler
  // "miles · Nw" form.
  function formatWatchLabel(hours, miles) {
    if (hours == null || !isFinite(hours)) return "";
    const watches = Math.max(0, Math.round((hours || 0) * 2 / HOURS_PER_WATCH) / 2);
    const watchStr = (watches % 1 === 0) ? String(watches) : watches.toFixed(1);
    if (miles == null || !isFinite(miles)) return watchStr + "w";
    return Math.round(miles) + " mi · " + watchStr + "w";
  }

  // Back-compat shim — anything still asking for a "days" label gets the
  // watches formatter at safe pace.
  function formatDaysLabel(hours) { return formatWatchLabel(hours, "safe"); }
  function formatTravelLabel(hours, pace) { return formatWatchLabel(hours, pace); }

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
    hexTravelHours, hexToCube, hexDistance,
    buildTravelGraph, dijkstra, hexLinePath, findRoute,
    planRoute, describeRoutePathType, formatRouteLabel,
    formatWatchLabel, formatTravelLabel, formatDaysLabel,
    loadData,
    openPanel, closePanel, escapeHtml,
  };
})();
