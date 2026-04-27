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
  async function loadData(campaign) {
    const url = "../maps/" + campaign + "/" + campaign + ".json";
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Failed to load " + url + ": " + resp.status);
    return await resp.json();
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
    loadData,
    openPanel, closePanel, escapeHtml,
  };
})();
