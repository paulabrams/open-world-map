// === Open World Map — Map Effects (painted) Renderer ===
// Canvas-based pipeline that composites Map Effects brush stamps onto a
// paper background. See docs/mapeffects-renderer.md for the spec.
//
// Depends on:
//   - window.MapData    (core-data.js)
//   - window.MapRaster  (core-raster.js)
//
// Loaded after both into painted.html.

(function () {
  "use strict";

  const D = window.MapData;
  const R = window.MapRaster;
  if (!D || !R) throw new Error("renderers/mapeffects.js requires core-data.js and core-raster.js");

  // Base palette. Stamps and terrain art always use these. Per-style
  // overrides below tune ONLY the linework — rivers, roads, trails, label
  // ink, and label-highlight colours — to mirror the SVG style palettes.
  const COLORS_BASE = {
    INK:        "#1a1410",
    INK_SOFT:   "#3a2a1c",
    RED:        "#9c2a1f",
    PAPER:      "#ffffff",
    SEA:        "#dfd4b0",
    SEA_DEEP:   "#cfc4a0",
    COAST:      "#1a1410",
    LAND_TINT:  "#e8d8b0",
    // Linework defaults (painted style):
    RIVER:      "#1a1410",
    ROAD:       "#1a1410",
    TRAIL:      "#3a2a1c",
    LABEL:      "#1a1410",
    LABEL_HIGHLIGHT: "#9c2a1f",  // red labels for heart/fortress/lair/dungeon
  };

  // Per-style link palette — applied on top of COLORS_BASE. Mirrors the
  // SVG renderers' linework colours so the painted style can carry a
  // chosen brand (Wilderland, Third Age, etc.) while keeping the painted
  // stamp art unchanged.
  const STYLE_PALETTES = {
    painted: { /* base only */ },
    wilderland: {
      RIVER:           "#2a1f14",   // dark ink ribbon (twin-bank)
      ROAD:            "#3a6090",   // Tolkien Wilderland convention: blue roads
      TRAIL:           "#3a6090",
      LABEL:           "#3a6090",   // place names in blue
      LABEL_HIGHLIGHT: "#3a6090",   // major nodes also blue (no red)
    },
    moonletters: {
      RIVER:           "#1a1410",
      ROAD:            "#1a1410",
      TRAIL:           "#1a1410",
      LABEL:           "#1a1410",
      LABEL_HIGHLIGHT: "#1a1410",
    },
    dragonisles: {
      RIVER:           "#1a1410",
      ROAD:            "#5a2a1c",
      TRAIL:           "#5a2a1c",
      LABEL:           "#1a1410",
      LABEL_HIGHLIGHT: "#9c2a1f",
    },
  };

  // Allow the host page to override the paper colour before render. The
  // background dropdown uses this; if MAP_PAPER_COLOR is set on window
  // before the renderer initialises, it wins over COLORS_BASE.PAPER.
  if (typeof window !== "undefined" && window.MAP_PAPER_COLOR) {
    COLORS_BASE.PAPER = window.MAP_PAPER_COLOR;
  }

  // Resolved palette for the current page load. Set via setLinkStyle() before
  // first render; defaults to "painted".
  let COLORS = Object.assign({}, COLORS_BASE);
  function setLinkStyle(name) {
    const palette = STYLE_PALETTES[name] || STYLE_PALETTES.painted;
    COLORS = Object.assign({}, COLORS_BASE, palette);
    COLORS._styleName = name;
  }
  // Expose so painted.html can switch on a URL ?style= param.
  window.MapStyles = window.MapStyles || {};
  window.MapStyles.setLinkStyle = setLinkStyle;
  window.MapStyles.setPaperColor = function (color) {
    COLORS_BASE.PAPER = color;
    COLORS.PAPER = color;
  };

  const FONT_STACK = "'IM Fell English', 'Cinzel', 'Palatino', serif";

  // Per-node overrides — applied before the point_type table when the
  // node id matches. Each entry is either:
  //   { src, scale, anchor }                 — single stamp
  //   { compound: [{src, scale, anchor, dx, dy}, ...] }  — multiple stamps,
  //                                              dx/dy offset from node anchor
  // All settlement heights in painted-scale pixels (PAINTED_SCALE = 200, so
  // 1 inch = 200 px). These are explicit on-canvas heights — drawStampAtHeight
  // computes the per-stamp scale factor from each PNG's natural ink size.
  // Calibrated for the post-halving scale where mountains target ~55 px.
  const NODE_ID_STAMP = {
    "mud-wallow":      { src: "symbols/lakes/shape-01.png", height: 16, anchor: [0.5, 0.7]  }, // small lake/pool — mud wallow / hot spring
    "crag-cairn":      { src: "symbols/viking/shape-21.png",   height: 12, anchor: [0.5, 0.92] }, // Burial Mound (halved)
    "kobold-crevasse": { src: "symbols/terrain/shape-28.png",  height: 22, anchor: [0.5, 0.85] }, // Crevasse 1
    "pjork-choppe-hille": { src: "symbols/terrain/shape-47.png", height: 30, anchor: [0.5, 0.95], dx: -30 }, // Cliff 1, west side of hex 0905 (hex W corner is at -50)
    "mistwood-glen":   { src: "symbols/viking/shape-28.png",   height: 45, anchor: [0.5, 0.85] }, // Sacred Tree with Standing Stones (+50%)
    // Description-matched overrides:
    "fae-glade":       { src: "symbols/viking/shape-30.png",   height: 30, anchor: [0.5, 0.85] }, // Sacred Tree — old-growth forest with face-trees
    "kalla-cave":      { src: "symbols/features/shape-03.png", height: 22, anchor: [0.5, 0.85] }, // Cave 1 — actual cave, not ruin
    "vault-of-first-light": { src: "symbols/features/shape-29.png", height: 22, anchor: [0.5, 0.85] }, // Cave 4 — dwarven dungeon entrance
    "tower-of-stargazer":   { src: "symbols/medieval/shape-19.png", height: 38, anchor: [0.5, 0.92] }, // Wizard Tower — matches the spiked-dome description
    "ravens-perch":    { src: "symbols/medieval/shape-26.png", height: 26, anchor: [0.5, 0.9]  }, // Tower Ruins — abandoned watchtower
    "bandit-camp":     { src: "symbols/mountains/shape-16.png", height: 18, anchor: [0.5, 0.92], dx: -30 }, // Hills 9 — Bandit Ambush Hill (rocky Weathertop hill, west side of hex)
    "northern-warding-stone": { src: "symbols/features/shape-31.png", height: 22, anchor: [0.5, 0.92] }, // Standing Stone 1 — single rune-stone
    "southern-warding-stone": { src: "symbols/features/shape-31.png", height: 22, anchor: [0.5, 0.92] }, // Standing Stone 1
    "serpents-pass":   { src: "symbols/terrain/shape-52.png",  height: 30, anchor: [0.5, 0.9]  }, // Pointed Rock 1 — jagged peak between crags
    "the-swamp":       { src: "symbols/vegetation/shape-12.png", height: 18, anchor: [0.5, 0.85] }, // Marsh 1 — actual marsh (was a farm brush by mistake)
    "south-road-mountain-watch": { src: "symbols/medieval/shape-16.png", height: 22, anchor: [0.5, 0.9] }, // Wood Tower — Brunhilde's foothill inn
    // Thornespire Keep — use the Stronghold brush directly. The Viking
    // variant (shape-03) has the widest multi-tower silhouette, which
    // reads as a multi-bailey fortress at the keep's hex.
    "thornespire-keep": { src: "symbols/viking/shape-03.png", height: 32, anchor: [0.5, 0.9] },
  };

  // Curated point_type → specific stamp src (relative to manifest base).
  // Belerion uses Viking-style settlements per the Dragon Isles convention.
  // Anything not listed here falls back to a procedural ink glyph
  // (see drawSettlementIcon).
  const POINT_TYPE_STAMP = {
    heart:      { src: "symbols/viking/shape-33.png",   height: 32, anchor: [0.5, 0.85] }, // walled city (halved)
    fortress:   { src: "symbols/medieval/shape-22.png", height: 42, anchor: [0.5, 0.85] },
    settlement: { src: "symbols/viking/shape-32.png",   height: 32, anchor: [0.5, 0.85] }, // Village (was Shield Wall — wrong)
    tavern:     { src: "symbols/medieval/shape-07.png", height: 20, anchor: [0.5, 0.85] },
    tower:      { src: "symbols/medieval/shape-04.png", height: 26, anchor: [0.5, 0.9]  },
    ruin:       { src: "symbols/features/shape-15.png", height: 22, anchor: [0.5, 0.9]  }, // explicit "Ruin" brush — was standing stones
    sanctuary:  { src: "symbols/viking/shape-22.png",   height: 24, anchor: [0.5, 0.85] }, // standing stones — incl. Vampire Warding Stones
  };

  const RED_TYPES = new Set(["heart", "fortress", "dungeon", "lair"]);

  async function render(paintCtx) {
    const ctx = paintCtx.ctx2d;
    const { WIDTH, HEIGHT } = paintCtx;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Clear SVG overlay layers once per render; individual layers below
    // just append.
    if (paintCtx.svgPathLayer)  while (paintCtx.svgPathLayer.firstChild)  paintCtx.svgPathLayer.removeChild(paintCtx.svgPathLayer.firstChild);
    if (paintCtx.svgLabelLayer) while (paintCtx.svgLabelLayer.firstChild) paintCtx.svgLabelLayer.removeChild(paintCtx.svgLabelLayer.firstChild);

    layerPaper(paintCtx);
    layerGridOverlay(paintCtx);   // user-selected hex/square grid (or none)
    // Pre-compute clear-zones used by layerForests so it can skip placing
    // trees over settlements / roads / rivers / labels.
    precomputeLabelBoxes(paintCtx);
    layerMountains(paintCtx);
    layerForests(paintCtx);
    layerVegetation(paintCtx);
    layerRivers(paintCtx);
    layerRoads(paintCtx);
    layerSettlements(paintCtx);
    layerLabels(paintCtx);
    layerEdgeAnnotations(paintCtx);
    layerCompassRose(paintCtx);
    layerCartouche(paintCtx);
  }

  // ---------------------------------------------------------------------
  // Edge annotations — off-map directional labels around the map border.
  // Reads `off_map_arrows` from the campaign JSON. Mirrors the Wilderland
  // SVG renderer: top label is large spaced-caps; left/right are rotated
  // italic; bottom is centred italic. Skips any direction that has no entry.
  // ---------------------------------------------------------------------
  function layerEdgeAnnotations(paintCtx) {
    const { WIDTH, HEIGHT } = paintCtx;
    const layer = paintCtx.svgLabelLayer;
    const ns = paintCtx.svgNS;
    if (!layer || !ns) return;
    const arrows = (paintCtx.graphData && paintCtx.graphData.off_map_arrows) || [];
    if (!arrows.length) return;
    const byDir = {};
    arrows.forEach(a => { byDir[a.direction] = a.label; });

    const margin = 28;
    const minX = margin, maxX = WIDTH - margin;
    const minY = margin, maxY = HEIGHT - margin;

    // Top edge label arcs gently across the top of the map. Sized to match
    // the other off-map edge labels (italic 18) so it doesn't overpower
    // the rest of the map.
    const topLabel = byDir.N;
    if (topLabel) {
      const cx = (minX + maxX) / 2;
      const arcY = minY + 14;
      const sag = 8;
      const arcD = `M${minX + 60},${arcY} Q${cx},${arcY - sag} ${maxX - 60},${arcY}`;
      appendSvgTextOnPath(layer, ns, topLabel, arcD, {
        fontSize: 18,
        fontStyle: "italic",
        fill: COLORS.LABEL,
        opacity: 0.85,
        haloWidth: 3,
      });
    }

    // Left edge — three rotated italic labels (NW / W / SW).
    const leftEntries = [
      { dir: "NW", frac: 0.22 },
      { dir: "W",  frac: 0.50 },
      { dir: "SW", frac: 0.78 },
    ];
    leftEntries.forEach(({ dir, frac }) => {
      const label = byDir[dir];
      if (!label) return;
      const ly = minY + (maxY - minY) * frac;
      const lx = minX + 16;
      appendSvgText(layer, ns, label, 0, 0, {
        fontSize: 18,
        fontStyle: "italic",
        fill: COLORS.LABEL,
        opacity: 0.85,
        transform: `translate(${lx},${ly}) rotate(-90)`,
      });
    });

    // Right edge — NE / E / SE.
    const rightEntries = [
      { dir: "NE", frac: 0.22 },
      { dir: "E",  frac: 0.50 },
      { dir: "SE", frac: 0.78 },
    ];
    rightEntries.forEach(({ dir, frac }) => {
      const label = byDir[dir];
      if (!label) return;
      const ly = minY + (maxY - minY) * frac;
      const lx = maxX - 16;
      appendSvgText(layer, ns, label, 0, 0, {
        fontSize: 18,
        fontStyle: "italic",
        fill: COLORS.LABEL,
        opacity: 0.85,
        transform: `translate(${lx},${ly}) rotate(90)`,
      });
    });

    // Bottom — centred italic.
    if (byDir.S) {
      appendSvgText(layer, ns, byDir.S, (minX + maxX) / 2, maxY - 6, {
        fontSize: 18,
        fontStyle: "italic",
        fill: COLORS.LABEL,
        opacity: 0.85,
      });
    }
  }

  // Estimate label bounding boxes BEFORE forests draw, so the forest layer
  // can avoid placing trees where text will appear (matching the cleared
  // background space the artist left around labels in the source art).
  function precomputeLabelBoxes(paintCtx) {
    const { nodes, nodeXY, ctx2d } = paintCtx;
    const boxes = [];
    paintCtx._labelBoxes = boxes;
    if (!nodes || !nodeXY) return;
    ctx2d.save();
    for (const node of nodes) {
      if (D.isOverlandNode && !D.isOverlandNode(node)) continue;
      if (!node.name) continue;
      const xy = nodeXY(node);
      if (!xy) continue;
      const fontSize = node.point_type === "heart" ? 16 : 13;
      // Estimate vertical offset from node centre to label centre. The
      // settlement stamp height varies, but most settlements end up putting
      // their labels ~30 px below the node anchor.
      const labelYOff = 32;
      ctx2d.font = `${fontSize}px ${FONT_STACK}`;
      const textW = ctx2d.measureText(node.name).width;
      boxes.push({
        cx: xy[0],
        cy: xy[1] + labelYOff,
        halfW: textW / 2 + 8,    // padding
        halfH: fontSize * 0.7 + 4,
      });
    }
    ctx2d.restore();
  }

  // ---------------------------------------------------------------------
  // User-selected grid overlay (hex / square / none). Read from
  // window.MAP_GRID set by painted.html based on the ?grid= URL param.
  // ---------------------------------------------------------------------
  function layerGridOverlay(paintCtx) {
    const grid = (typeof window !== "undefined" && window.MAP_GRID) || "none";
    if (grid === "none") return;
    const { ctx2d, WIDTH, HEIGHT, origin, PAINTED_SCALE, nodes, nodeXY, hexTerrain, hexPolygon } = paintCtx;
    if (!ctx2d) return;

    // Anchor the grid to Blackwater Crossing if available, else canvas centre.
    let cx = origin ? origin.x : WIDTH / 2;
    let cy = origin ? origin.y : HEIGHT / 2;
    if (nodes && nodeXY) {
      const bc = nodes.find(n => n.id === "blackwater-crossing");
      if (bc) {
        const xy = nodeXY(bc);
        if (xy) { cx = xy[0]; cy = xy[1]; }
      }
    }

    ctx2d.save();
    if (grid === "square") {
      // Inch grid: 1 inch = PAINTED_SCALE px. Major line at the BC origin.
      const step = PAINTED_SCALE || 200;
      const extent = 12;  // inches each direction
      ctx2d.lineWidth = 0.5;
      for (let i = -extent; i <= extent; i++) {
        const isMajor = i === 0;
        ctx2d.strokeStyle = isMajor ? "rgba(120,80,40,0.30)" : "rgba(120,80,40,0.10)";
        ctx2d.lineWidth = isMajor ? 1.0 : 0.5;
        const x = cx + i * step;
        const y = cy + i * step;
        ctx2d.beginPath();
        ctx2d.moveTo(x, cy - extent * step);
        ctx2d.lineTo(x, cy + extent * step);
        ctx2d.stroke();
        ctx2d.beginPath();
        ctx2d.moveTo(cx - extent * step, y);
        ctx2d.lineTo(cx + extent * step, y);
        ctx2d.stroke();
      }
    } else if (grid === "hex" && hexTerrain && hexPolygon) {
      // Hex grid: trace every land hex. Soft brown ink so the grid reads
      // as a quiet guide and stamps remain dominant.
      ctx2d.strokeStyle = "rgba(120,80,40,0.18)";
      ctx2d.lineWidth = 0.5;
      ctx2d.lineJoin = "miter";
      ctx2d.beginPath();
      Object.keys(hexTerrain).forEach(h => {
        const pts = hexPolygon(h);
        if (!pts || pts.length < 3) return;
        ctx2d.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx2d.lineTo(pts[i][0], pts[i][1]);
        ctx2d.closePath();
      });
      ctx2d.stroke();

      // Faint hex address labels — emitted as SVG so they stay crisp at
      // zoom. No paper halo (they're meant to be quiet).
      const labelLayer = paintCtx.svgLabelLayer;
      const ns = paintCtx.svgNS;
      if (labelLayer && ns) {
        Object.keys(hexTerrain).forEach(h => {
          const pts = hexPolygon(h);
          if (!pts || pts.length < 3) return;
          let mx = 0, my = 0;
          pts.forEach(p => { mx += p[0]; my += p[1]; });
          mx /= pts.length; my /= pts.length;
          appendSvgText(labelLayer, ns, h, mx, my - 28, {
            fontSize: 10,
            fontFamily: FONT_STACK,
            fill: "rgba(120,80,40,0.45)",
            dominantBaseline: "middle",
            halo: false,
          });
        });
      }
    }
    ctx2d.restore();
  }

  // ---------------------------------------------------------------------
  // Hex grid overlay — light gray lines, printable, no fills
  // ---------------------------------------------------------------------
  function layerHexGrid(paintCtx) {
    const { ctx2d, hexTerrain, hexPolygon } = paintCtx;
    if (!hexTerrain) return;
    ctx2d.save();
    ctx2d.strokeStyle = "rgba(110, 90, 60, 0.25)";
    ctx2d.lineWidth = 0.6;
    ctx2d.lineJoin = "miter";
    ctx2d.beginPath();
    Object.keys(hexTerrain).forEach(h => {
      const pts = hexPolygon(h);
      ctx2d.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx2d.lineTo(pts[i][0], pts[i][1]);
      ctx2d.closePath();
    });
    ctx2d.stroke();
    ctx2d.restore();
  }

  // ---------------------------------------------------------------------
  // Layer 1 — paper
  // ---------------------------------------------------------------------
  function layerPaper(paintCtx) {
    // Solid cream background — same colour as the river fill (COLORS.PAPER).
    // The textured parchment is intentionally NOT drawn; the page-level
    // background and this fill share #ffffff so canvas edges blend
    // seamlessly with the page.
    const { ctx2d, WIDTH, HEIGHT } = paintCtx;
    ctx2d.fillStyle = COLORS.PAPER;
    ctx2d.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // ---------------------------------------------------------------------
  // Layer 2 — sea fill (everything outside any defined land hex)
  // ---------------------------------------------------------------------
  function layerSea(paintCtx) {
    const { ctx2d, WIDTH, HEIGHT } = paintCtx;
    // Paint sea tint on an offscreen buffer, punch out land, then blur the
    // result so the sea/land boundary is a soft gradient rather than a
    // hard hexagonal silhouette. The coastline ink stroke (layer 3) draws
    // the actual visible boundary on top.
    const off = document.createElement("canvas");
    off.width = WIDTH; off.height = HEIGHT;
    const offCtx = off.getContext("2d");
    offCtx.fillStyle = COLORS.SEA;
    offCtx.fillRect(0, 0, WIDTH, HEIGHT);
    offCtx.globalCompositeOperation = "destination-out";
    const landPath = buildLandPath(paintCtx);
    offCtx.fill(landPath);
    offCtx.lineWidth = 4;
    offCtx.lineJoin = "miter";
    offCtx.stroke(landPath);

    ctx2d.save();
    if (typeof ctx2d.filter === "string") {
      ctx2d.filter = "blur(3px)";
    }
    ctx2d.globalAlpha = 0.5;
    ctx2d.drawImage(off, 0, 0);
    ctx2d.restore();
  }

  function buildLandPath(paintCtx) {
    const { hexTerrain, hexPolygon } = paintCtx;
    const path = new Path2D();
    Object.keys(hexTerrain).forEach(h => {
      const pts = hexPolygon(h);
      path.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
      path.closePath();
    });
    return path;
  }

  function buildSeaPath(paintCtx) {
    const { WIDTH, HEIGHT, hexTerrain, hexPolygon } = paintCtx;
    const path = new Path2D();
    path.moveTo(0, 0); path.lineTo(WIDTH, 0); path.lineTo(WIDTH, HEIGHT); path.lineTo(0, HEIGHT); path.closePath();
    Object.keys(hexTerrain).forEach(h => {
      const pts = hexPolygon(h);
      path.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
      path.closePath();
    });
    return path;
  }

  // ---------------------------------------------------------------------
  // Layer 3 — coastline
  // Trace edges between land and sea hexes, wobble, double-stroke.
  // ---------------------------------------------------------------------
  function layerCoastline(paintCtx) {
    const edges = collectCoastEdges(paintCtx);
    if (!edges.length) return;
    // Chain coastline edges into continuous polylines so the wobble flows
    // naturally instead of resetting at each hex side.
    const rings = chainEdges(edges);
    const { ctx2d } = paintCtx;
    const rng = D.mulberry32(D.seedFromString("coast:" + paintCtx.campaign));
    ctx2d.save();
    ctx2d.lineJoin = "round";
    ctx2d.lineCap = "round";
    ctx2d.strokeStyle = COLORS.COAST;
    rings.forEach(ring => {
      const wob = wobblePolyline(ring, rng, 2.4, 3);
      // Heavy outer stroke for the ink line.
      ctx2d.lineWidth = 1.8;
      ctx2d.globalAlpha = 0.95;
      ctx2d.beginPath();
      drawSpline(ctx2d, wob);
      ctx2d.stroke();
      // Soft inner contour line, slightly inset, to read as a doubled ink line.
      const inset = insetPolyline(wob, 2.2);
      ctx2d.lineWidth = 0.5;
      ctx2d.globalAlpha = 0.45;
      ctx2d.beginPath();
      drawSpline(ctx2d, inset);
      ctx2d.stroke();
      ctx2d.globalAlpha = 1.0;
    });
    ctx2d.restore();
  }

  // Greedily chain coastline edges into longer polylines by matching shared endpoints.
  function chainEdges(edges) {
    const remaining = edges.map(e => [e[0], e[1]]);
    const rings = [];
    // Coast-edge endpoints come from hex polygon corners that are computed
    // independently per hex; floating-point drift makes shared corners differ
    // by sub-pixel amounts. Round to whole pixels to match consistently.
    const keyOf = p => Math.round(p[0]) + "," + Math.round(p[1]);
    while (remaining.length) {
      const [a, b] = remaining.shift();
      const ring = [a, b];
      let extended = true;
      while (extended) {
        extended = false;
        for (let i = 0; i < remaining.length; i++) {
          const [c, d] = remaining[i];
          const tail = ring[ring.length - 1];
          const head = ring[0];
          if (keyOf(c) === keyOf(tail))      { ring.push(d); remaining.splice(i, 1); extended = true; break; }
          else if (keyOf(d) === keyOf(tail)) { ring.push(c); remaining.splice(i, 1); extended = true; break; }
          else if (keyOf(c) === keyOf(head)) { ring.unshift(d); remaining.splice(i, 1); extended = true; break; }
          else if (keyOf(d) === keyOf(head)) { ring.unshift(c); remaining.splice(i, 1); extended = true; break; }
        }
      }
      rings.push(ring);
    }
    return rings;
  }

  // Offset a polyline inward (toward the right of the direction of travel) by `d` pixels.
  function insetPolyline(pts, d) {
    if (pts.length < 2) return pts.slice();
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      const dx = next[0] - prev[0];
      const dy = next[1] - prev[1];
      const len = Math.hypot(dx, dy) || 1;
      // Right-hand normal — for a clockwise ring this points inward.
      const nx = dy / len;
      const ny = -dx / len;
      out.push([pts[i][0] + nx * d, pts[i][1] + ny * d]);
    }
    return out;
  }

  // For each land hex, compare each of its 6 neighbors. Where the neighbor
  // is sea (not in hex_terrain), emit the corresponding hex edge as a coastline
  // segment.
  function collectCoastEdges(paintCtx) {
    const { hexTerrain, hexPolygon } = paintCtx;
    // Hex edge order: edge i goes from corner[(i+5)%6] to corner[i]. We
    // align this with the neighbor order produced by D.hexNeighbors so the
    // i-th neighbor sits across the i-th edge.
    // hexNeighbors yields [N, NE, SE, S, SW, NW] in the unshifted column case.
    // Pointy-top corners (with our angle = i*PI/3, starting at angle 0) are:
    //   c0 right, c1 lower-right, c2 lower-left, c3 left, c4 upper-left, c5 upper-right
    // The edges between consecutive corners run:
    //   e_NE: c0–c5 (upper-right side)  → neighbor index 1 (NE)
    //   e_N:  c5–c4 (top-right to top-left? wait) ...
    // Rather than derive analytically, we just match each neighbor by its
    // shared midpoint with the source hex.
    const edges = [];
    const seen = new Set();
    Object.keys(hexTerrain).forEach(h => {
      const corners = hexPolygon(h);
      const nbrs = D.hexNeighbors(h);
      for (let i = 0; i < 6; i++) {
        const nb = nbrs[i];
        if (hexTerrain[nb]) continue; // shared with land — not coast
        // Find which two corners are shared with this neighbor.
        const nbCorners = hexPolygon(nb);
        // Two corners of `corners` will be roughly equal to two corners of `nbCorners`.
        const matches = [];
        for (let a = 0; a < 6; a++) {
          for (let b = 0; b < 6; b++) {
            const dx = corners[a][0] - nbCorners[b][0];
            const dy = corners[a][1] - nbCorners[b][1];
            if (dx * dx + dy * dy < 1) {
              matches.push(corners[a]);
              break;
            }
          }
          if (matches.length === 2) break;
        }
        if (matches.length === 2) {
          const k = edgeKey(matches[0], matches[1]);
          if (!seen.has(k)) {
            seen.add(k);
            edges.push(matches);
          }
        }
      }
    });
    return edges;
  }

  function edgeKey(a, b) {
    const ka = a[0].toFixed(1) + "," + a[1].toFixed(1);
    const kb = b[0].toFixed(1) + "," + b[1].toFixed(1);
    return ka < kb ? ka + "|" + kb : kb + "|" + ka;
  }

  function wobbleSegment(a, b, rng, amp) {
    const steps = 6;
    const nx = -(b[1] - a[1]);
    const ny = (b[0] - a[0]);
    const len = Math.hypot(nx, ny) || 1;
    const ux = nx / len, uy = ny / len;
    const out = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;
      const k = (rng() - 0.5) * 2 * amp * (1 - Math.abs(t * 2 - 1));
      out.push([x + ux * k, y + uy * k]);
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // Layer 4 — sub-region pattern fills (swamp, farmland)
  // ---------------------------------------------------------------------
  function layerSubregionPatterns(paintCtx) {
    const { ctx2d, hexTerrain, hexPolygon, assets } = paintCtx;
    const marsh = assets.pattern(ctx2d, "marsh");
    Object.entries(hexTerrain).forEach(([h, t]) => {
      const pts = hexPolygon(h);
      const xs = pts.map(p => p[0]);
      const ys = pts.map(p => p[1]);
      const minX = Math.min(...xs), minY = Math.min(...ys);
      const maxX = Math.max(...xs), maxY = Math.max(...ys);
      ctx2d.save();
      ctx2d.beginPath();
      R.tracePolygon(ctx2d, pts);
      ctx2d.clip();
      if (t === "swamp" && marsh) {
        ctx2d.globalAlpha = 0.22;
        ctx2d.fillStyle = marsh;
        ctx2d.fillRect(minX, minY, maxX - minX, maxY - minY);
      } else if (t === "plains") {
        ctx2d.globalAlpha = 0.05;
        ctx2d.fillStyle = COLORS.LAND_TINT;
        R.tracePolygon(ctx2d, pts);
        ctx2d.fill();
      }
      ctx2d.restore();
    });
  }

  // ---------------------------------------------------------------------
  // Layer 5 — mountain stamps
  // ---------------------------------------------------------------------
  function layerMountains(paintCtx) {
    const { ctx2d, hexTerrain, hexPolygon, assets } = paintCtx;

    // Pick filters reused per draw.
    const PICK_HILLS    = { archetypes: ["small-hill"] };
    const PICK_MOUNTAIN = {
      // Crags / ranges are jagged peaks, not volcanic. Volcanoes and calderas
      // are dramatic features — only place them via explicit node override
      // (a node specifically described as a volcano).
      archetypes: ["mountain"],
    };
    // Edge-of-range stamps — smaller mountains for the transition zone
    // between peak interior and surrounding terrain.
    const PICK_FOOTHILL = {
      archetypes: ["mountain"],
      // Bias toward smaller mountains (lower file_kb → smaller suggested_height_px)
      // by simply allowing the picker; the size jitter at draw time handles the rest.
    };

    const isMountainHex = (t) => t === "mountains";
    const isHillsHex    = (t) => t === "hills" || t === "forested-hills";

    // Hex neighbour offsets (odd-q axial). For a given hex string "CCRR",
    // produce the 6 neighbours and report whether each is a mountain hex.
    function neighbours(hex) {
      const col = parseInt(hex.substring(0, 2), 10);
      const row = parseInt(hex.substring(2, 4), 10);
      const odd = col % 2 !== 0;
      const dirs = odd
        ? [[+1, 0], [+1, +1], [0, +1], [-1, +1], [-1, 0], [0, -1]]
        : [[+1, -1], [+1, 0], [0, +1], [-1, 0], [-1, -1], [0, -1]];
      return dirs.map(([dc, dr]) => {
        const nc = col + dc, nr = row + dr;
        const key = String(nc).padStart(2, "0") + String(nr).padStart(2, "0");
        return { key, terrain: hexTerrain[key] };
      });
    }

    // Accumulate all placements first, then y-sort + draw at end so south
    // mountains paint on top of north (depth illusion).
    const placements = [];

    Object.entries(hexTerrain).forEach(([h, t]) => {
      if (!isMountainHex(t) && !isHillsHex(t)) return;
      const polygon = hexPolygon(h);
      const rng = D.mulberry32(D.seedFromString("mtn:" + h));

      if (isHillsHex(t)) {
        // Hills hex: 1 small-hill stamp at hex centre.
        const pts = R.poissonInPolygon(polygon, 60, rng).slice(0, 1);
        pts.forEach(p => placements.push({ p, terrain: "hills", rng, role: "core" }));
        return;
      }

      // Mountain hex. Decide if it's interior (all 6 neighbours are also
      // mountains) vs edge (at least one non-mountain neighbour). Interior
      // hexes pack peaks densely; edge hexes scatter foothills along the
      // borders that face non-mountain terrain to fade into the surroundings.
      const nbrs = neighbours(h);
      const mountainNbrCount = nbrs.filter(n => isMountainHex(n.terrain)).length;
      const isInterior = mountainNbrCount === 6;
      const cx = polygon.reduce((s, p) => s + p[0], 0) / polygon.length;
      const cy = polygon.reduce((s, p) => s + p[1], 0) / polygon.length;

      // 1. Core peaks — generate plenty of candidates and let the bbox
      // no-overlap check (run after sorting) winnow them. With a strict
      // overlap reject, low candidate counts left hexes nearly empty —
      // we want enough candidates that even after rejection the hex reads
      // as a mountain hex.
      const coreCount = isInterior ? 4 + Math.floor(rng() * 3) : 3 + Math.floor(rng() * 2);
      const coreRadius = 50;
      const corePts = R.poissonInPolygon(polygon, coreRadius, rng).slice(0, coreCount);
      // Bias core points toward the centre by averaging with the centroid.
      corePts.forEach(p => {
        const px = cx + (p[0] - cx) * 0.55;
        const py = cy + (p[1] - cy) * 0.55;
        placements.push({ p: [px, py], terrain: "mountains", rng, role: "core" });
      });

      // 2. Edge falloff — for each side of the hex that touches a
      // non-mountain neighbour, scatter 2–3 smaller mountains/hills along
      // that edge so the range tapers naturally into surrounding terrain.
      // Polygon vertices are 6 corners; edges are vertex i to vertex i+1.
      // Each edge corresponds to one of the 6 neighbour directions.
      for (let i = 0; i < polygon.length; i++) {
        // For pointy-top hex from poissonInPolygon's polygon ordering,
        // edge i is between vertices i and (i+1)%6; the matching neighbour
        // index depends on hexPolygon's vertex order. We scatter falloff
        // toward whichever non-mountain neighbour edge we identify by
        // proximity to the polygon edge midpoint.
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;

        // Find the neighbour whose centre direction best matches this
        // edge midpoint (relative to hex centre).
        const edgeDirX = mx - cx, edgeDirY = my - cy;
        const edgeLen = Math.hypot(edgeDirX, edgeDirY) || 1;
        let bestNbr = null, bestDot = -Infinity;
        for (const n of nbrs) {
          const ncol = parseInt(n.key.substring(0, 2), 10);
          const nrow = parseInt(n.key.substring(2, 4), 10);
          const hcol = parseInt(h.substring(0, 2), 10);
          const hrow = parseInt(h.substring(2, 4), 10);
          const ndx = ncol - hcol, ndy = nrow - hrow;
          // Use rough screen-space direction from neighbour offset.
          const ndirX = ndx, ndirY = ndy;
          const nlen = Math.hypot(ndirX, ndirY) || 1;
          const dot = (edgeDirX * ndirX + edgeDirY * ndirY) / (edgeLen * nlen);
          if (dot > bestDot) { bestDot = dot; bestNbr = n; }
        }
        if (!bestNbr || isMountainHex(bestNbr.terrain)) continue;

        // Scatter foothills along this edge — pull placements slightly
        // INTO the hex so they don't fall outside.
        const inset = 14;
        const insetX = -edgeDirX / edgeLen * inset;
        const insetY = -edgeDirY / edgeLen * inset;
        const along = 3;  // 3 falloff stamps per outward-facing edge
        for (let s = 0; s < along; s++) {
          const t = (s + 0.5) / along;
          const px = a[0] + (b[0] - a[0]) * t + insetX + (rng() - 0.5) * 8;
          const py = a[1] + (b[1] - a[1]) * t + insetY + (rng() - 0.5) * 8;
          // Decide what to place: 50% small mountain, 50% hill.
          const role = rng() < 0.5 ? "foothill" : "edgehill";
          placements.push({ p: [px, py], terrain: role, rng, role });
        }
      }
    });

    // Paint south→north so northern peaks layer behind southern.
    placements.sort((a, b) => a.p[1] - b.p[1]);

    // Track every placed mountain's bounding box (in canvas pixels) so we
    // can reject any candidate that would overlap an existing peak.
    // Mountains never superimpose on top of each other.
    const placedBoxes = [];
    function bboxOverlaps(box) {
      for (const b of placedBoxes) {
        if (Math.abs(box.cx - b.cx) < (box.hw + b.hw)
         && Math.abs(box.cy - b.cy) < (box.hh + b.hh)) return true;
      }
      return false;
    }

    placements.forEach(({ p, terrain, rng, role }) => {
      let opts;
      if (role === "edgehill" || terrain === "hills") {
        opts = PICK_HILLS;
      } else if (role === "foothill") {
        opts = PICK_FOOTHILL;
      } else {
        opts = PICK_MOUNTAIN;
      }
      const stamp = assets.pickWhere("mountains", rng, opts);
      if (!stamp) return;
      const h = R.targetHeightFor(stamp, "mountains");
      let multBase = 1.0;
      if (role === "foothill") multBase = 0.55;
      else if (role === "edgehill") multBase = 0.7;
      const mult = multBase * (0.88 + rng() * 0.24);

      // Compute the would-be render bbox to check for overlap.
      const renderH = h * mult;
      const renderW = (stamp.w / (stamp.h || 1)) * renderH;
      // The stamp is anchored bottom-centre-ish; its bbox centre lifts up
      // by anchor[1] × renderH from the placement point.
      const anchorY = (stamp.anchor && stamp.anchor[1]) != null ? stamp.anchor[1] : 0.9;
      const cx = p[0];
      const cy = p[1] - renderH * (anchorY - 0.5);
      // Shrink half-extents so peaks can lightly touch shoulders when
      // forming a chain. 0.32 is the threshold where mountain peaks read
      // as a connected skyline without smudging into each other.
      const candidate = {
        cx, cy,
        hw: renderW * 0.32,
        hh: renderH * 0.32,
      };
      if (bboxOverlaps(candidate)) return;
      placedBoxes.push(candidate);

      R.drawStampAtHeight(ctx2d, stamp, p[0], p[1], h, {
        flipX: rng() > 0.5,
        alpha: 0.78,
        mult,
      });
    });
  }

  // ---------------------------------------------------------------------
  // Layer 6 — forest stamps
  // ---------------------------------------------------------------------
  function layerForests(paintCtx) {
    const { ctx2d, hexTerrain, hexPolygon, assets, nodes, nodeXY,
            riverPath, hexCenterXY, roadPath } = paintCtx;

    // Filter sets reused per draw.
    const PICK_CLUMP    = { includeRoles: ["composed-range"], excludeRoles: new Set() };
    const PICK_SINGLE   = { /* defaults: excludes composed-range, overlays, etc. */ };

    // Build avoidance geometry once: visible-node positions + river/road
    // polylines. Trees skip placements within these clear-zone radii so
    // settlements, roads, and rivers stay legible.
    const NODE_CLEAR_R = 28;     // canvas px around each visible node
    const PATH_CLEAR_R = 12;     // canvas px from any point on a river/road
    const NODE_CLEAR_R2 = NODE_CLEAR_R * NODE_CLEAR_R;
    const PATH_CLEAR_R2 = PATH_CLEAR_R * PATH_CLEAR_R;
    const nodePts = [];
    if (nodes && nodeXY) {
      nodes.forEach(n => {
        if (D.isOverlandNode && !D.isOverlandNode(n)) return;
        const xy = nodeXY(n);
        if (xy) nodePts.push(xy);
      });
    }
    const riverPts = (riverPath && hexCenterXY)
      ? riverPath.map(h => hexCenterXY(h))
      : [];
    const roadSegs = [];
    if (roadPath && hexCenterXY) {
      roadPath.forEach(road => {
        if (road && road.hexes && road.hexes.length >= 2) {
          roadSegs.push(road.hexes.map(h => hexCenterXY(h)));
        }
      });
    }

    function distSqToPolyline(x, y, poly) {
      let best = Infinity;
      for (let i = 0; i < poly.length - 1; i++) {
        const ax = poly[i][0], ay = poly[i][1];
        const bx = poly[i+1][0], by = poly[i+1][1];
        const dx = bx - ax, dy = by - ay;
        const lenSq = dx*dx + dy*dy;
        let t = lenSq > 0 ? ((x-ax)*dx + (y-ay)*dy) / lenSq : 0;
        t = Math.max(0, Math.min(1, t));
        const px = ax + t*dx, py = ay + t*dy;
        const ex = x - px, ey = y - py;
        const d2 = ex*ex + ey*ey;
        if (d2 < best) best = d2;
      }
      return best;
    }
    const labelBoxes = paintCtx._labelBoxes || [];
    function tooCloseToProtected(x, y) {
      for (const [nx, ny] of nodePts) {
        const dx = x - nx, dy = y - ny;
        if (dx*dx + dy*dy < NODE_CLEAR_R2) return true;
      }
      if (riverPts.length >= 2 && distSqToPolyline(x, y, riverPts) < PATH_CLEAR_R2) return true;
      for (const seg of roadSegs) {
        if (distSqToPolyline(x, y, seg) < PATH_CLEAR_R2) return true;
      }
      // Label clear-zone — match the hand-drawn convention of leaving
      // paper around labels so the names read clearly.
      for (const box of labelBoxes) {
        if (Math.abs(x - box.cx) < box.halfW && Math.abs(y - box.cy) < box.halfH) return true;
      }
      return false;
    }

    Object.entries(hexTerrain).forEach(([h, t]) => {
      const isForest = (t === "forest" || t === "forested-hills" || t === "old-forest" || t === "jungle");
      if (!isForest) return;
      const polygon = hexPolygon(h);
      const rng = D.mulberry32(D.seedFromString("forest:" + h));

      // Hex bounds, used to place tree-line and periphery trees.
      let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
      polygon.forEach(([x, y]) => {
        if (x < xmin) xmin = x;
        if (x > xmax) xmax = x;
        if (y < ymin) ymin = y;
        if (y > ymax) ymax = y;
      });
      const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
      const hexW = xmax - xmin, hexH = ymax - ymin;

      // Region-based dominant species. Old Forest (north of Blackwater)
      // is described as black pines → conifer. The southern forest around
      // Mistwood Glen has the three-oak Kalla'din → deciduous. Y on canvas
      // is positive = south; the hex centre y is in `cy` already.
      // Use the canvas-y of this hex relative to the canvas centre for the
      // split. Hexes with y > centerY favor deciduous; y < centerY favor conifer.
      const canvasH = paintCtx.HEIGHT || 2400;
      const isNorth = cy < canvasH * 0.5;
      const dominant = isNorth ? "conifer" : "deciduous";
      const minor    = isNorth ? "deciduous" : "conifer";
      const pickCat  = () => (rng() < 0.92 ? dominant : minor);

      // Accumulate placements then y-sort + draw at the end so northern
      // stamps paint behind southern ones.
      const placements = [];
      const queue = (p, stamp, cat) => {
        if (stamp) placements.push({ p, stamp, cat });
      };

      // 1. Composed-range clumps — the bulk of the forest interior.
      // forested-hills gets the same clump count as forest so trees are
      // visibly present alongside the hill silhouettes.
      const clumpCount = 2 + Math.floor(rng() * 2);
      const clumpRadius = 60;
      const clumpPts = R.poissonInPolygon(polygon, clumpRadius, rng).slice(0, clumpCount);
      clumpPts.forEach(p => {
        if (tooCloseToProtected(p[0], p[1])) return;
        const cat = pickCat();
        queue(p, assets.pickWhere(cat, rng, PICK_CLUMP), cat);
      });

      // Tree-vs-tree spacing within this hex: a tree placement is rejected
      // if it lands too close to another tree placement (clumps and singles
      // alike). Singles need ~22 px clearance; clumps already use Poisson
      // radius 60.
      const TREE_MIN_DIST = 22;
      const TREE_MIN_DIST2 = TREE_MIN_DIST * TREE_MIN_DIST;
      function tooCloseToOtherTree(x, y) {
        for (const pl of placements) {
          const dx = x - pl.p[0], dy = y - pl.p[1];
          if (dx * dx + dy * dy < TREE_MIN_DIST2) return true;
        }
        return false;
      }

      // 2. Tree line along the front (south) edge — 5–8 single trees in a
      //    rough horizontal row (+25% from 4–6).
      const lineCount = 5 + Math.floor(rng() * 4);
      const frontY = ymin + hexH * 0.78;
      for (let i = 0; i < lineCount; i++) {
        const tFrac = (i + 0.5) / lineCount;
        const x = xmin + hexW * (0.12 + 0.76 * tFrac) + (rng() - 0.5) * 6;
        const y = frontY + (rng() - 0.5) * 10;
        if (!R.pointInPolygon(x, y, polygon)) continue;
        if (tooCloseToProtected(x, y)) continue;
        if (tooCloseToOtherTree(x, y)) continue;
        const cat = pickCat();
        queue([x, y], assets.pickWhere(cat, rng, PICK_SINGLE), cat);
      }

      // 3. Periphery — 4–5 single trees around the hex edge for natural fade
      //    (+25% from 3–4).
      const periphCount = 4 + Math.floor(rng() * 2);
      for (let i = 0; i < periphCount; i++) {
        const angle = rng() * Math.PI * 2;
        const r = 0.65 + rng() * 0.25;
        const x = cx + Math.cos(angle) * r * hexW * 0.5;
        const y = cy + Math.sin(angle) * r * hexH * 0.5;
        if (!R.pointInPolygon(x, y, polygon)) continue;
        if (tooCloseToProtected(x, y)) continue;
        if (tooCloseToOtherTree(x, y)) continue;
        const cat = pickCat();
        queue([x, y], assets.pickWhere(cat, rng, PICK_SINGLE), cat);
      }

      // y-sort so depth ordering reads correctly, then draw.
      placements.sort((a, b) => a.p[1] - b.p[1]);
      placements.forEach(({ p, stamp, cat }) => {
        const h = R.targetHeightFor(stamp, cat);
        const mult = 0.88 + rng() * 0.24;
        R.drawStampAtHeight(ctx2d, stamp, p[0], p[1], h, {
          flipX: rng() > 0.5,
          alpha: 0.78,
          mult,
        });
      });
    });
  }

  // ---------------------------------------------------------------------
  // Layer 7 — vegetation flecks
  // ---------------------------------------------------------------------
  function layerVegetation(paintCtx) {
    const { ctx2d, hexTerrain, hexPolygon, assets, riverPath, hexCenterXY, roadPath } = paintCtx;

    // Pre-compute road/river polylines once for proximity checks.
    const riverPts = (riverPath && hexCenterXY)
      ? riverPath.map(h => hexCenterXY(h))
      : [];
    const roadSegs = [];
    if (roadPath && hexCenterXY) {
      roadPath.forEach(road => {
        if (road && road.hexes && road.hexes.length >= 2) {
          roadSegs.push(road.hexes.map(h => hexCenterXY(h)));
        }
      });
    }
    function distSqToPolyline(x, y, poly) {
      let best = Infinity;
      for (let i = 0; i < poly.length - 1; i++) {
        const ax = poly[i][0], ay = poly[i][1];
        const bx = poly[i+1][0], by = poly[i+1][1];
        const dx = bx - ax, dy = by - ay;
        const lenSq = dx*dx + dy*dy;
        let t = lenSq > 0 ? ((x-ax)*dx + (y-ay)*dy) / lenSq : 0;
        t = Math.max(0, Math.min(1, t));
        const px = ax + t*dx, py = ay + t*dy;
        const ex = x - px, ey = y - py;
        const d2 = ex*ex + ey*ey;
        if (d2 < best) best = d2;
      }
      return best;
    }
    const PATH_CLEAR_R2 = 14 * 14;
    function tooCloseToPath(x, y) {
      if (riverPts.length >= 2 && distSqToPolyline(x, y, riverPts) < PATH_CLEAR_R2) return true;
      for (const seg of roadSegs) {
        if (distSqToPolyline(x, y, seg) < PATH_CLEAR_R2) return true;
      }
      return false;
    }

    // Build farm regions: connected components of farmland hexes, where
    // adjacency is broken by road or river hexes. Hexes in the same region
    // share a single farm-field brush so the style stays consistent across
    // the region; regions on opposite sides of a road or river get different
    // brushes naturally.
    const roadHexes = new Set();
    if (roadPath) {
      roadPath.forEach(r => { (r && r.hexes || []).forEach(h => roadHexes.add(h)); });
    }
    const riverHexes = new Set(riverPath || []);
    function isBoundaryHex(h) { return roadHexes.has(h) || riverHexes.has(h); }
    function hexNeighbours(hex) {
      const col = parseInt(hex.substring(0, 2), 10);
      const row = parseInt(hex.substring(2, 4), 10);
      const odd = col % 2 !== 0;
      const dirs = odd
        ? [[+1, 0], [+1, +1], [0, +1], [-1, +1], [-1, 0], [0, -1]]
        : [[+1, -1], [+1, 0], [0, +1], [-1, 0], [-1, -1], [0, -1]];
      const out = [];
      for (const [dc, dr] of dirs) {
        const nc = col + dc, nr = row + dr;
        out.push(String(nc).padStart(2, "0") + String(nr).padStart(2, "0"));
      }
      return out;
    }
    const farmlandHexes = Object.keys(hexTerrain).filter(h => hexTerrain[h] === "farmland");
    const regionOfHex = {};
    let nextRegionId = 0;
    farmlandHexes.forEach(seed => {
      if (regionOfHex[seed] != null) return;
      const id = nextRegionId++;
      const queue = [seed];
      while (queue.length) {
        const h = queue.shift();
        if (regionOfHex[h] != null) continue;
        regionOfHex[h] = id;
        for (const nbr of hexNeighbours(h)) {
          if (hexTerrain[nbr] !== "farmland") continue;
          if (regionOfHex[nbr] != null) continue;
          // A road/river hex is a boundary that breaks the region.
          if (isBoundaryHex(nbr) || isBoundaryHex(h)) continue;
          queue.push(nbr);
        }
      }
    });

    // Per-terrain dispatch.
    Object.entries(hexTerrain).forEach(([h, t]) => {
      const polygon = hexPolygon(h);
      const rng = D.mulberry32(D.seedFromString("veg:" + h));

      if (t === "farmland") {
        const regionId = regionOfHex[h] != null ? regionOfHex[h] : 0;
        renderFarmlandHex(paintCtx, polygon, rng, regionId, tooCloseToPath);
        return;
      }

      const TERRAIN_VEG = {
        plains:     { archetypes: ["vegetation-grass", "thorns"], radius: 36, cap: 3 },
        grassland:  { archetypes: ["vegetation-grass"],          radius: 36, cap: 3 },
        // Swamp gets denser marsh + cattail clumps than before so the
        // terrain reads at a glance. A separate tree pass below adds a
        // sparse scatter of stunted swamp trees.
        swamp:      { archetypes: ["marsh", "cattail"],          radius: 36, cap: 7 },
        desert:     { archetypes: ["cactus", "desert-scrub"],    radius: 32, cap: 4 },
      };
      const cfg = TERRAIN_VEG[t];
      if (!cfg) return;
      const pts = R.poissonInPolygon(polygon, cfg.radius, rng).slice(0, cfg.cap);
      // Track stamp bboxes inside this hex so we never paint two marsh /
      // grass / etc. patches over each other.
      const placed = [];
      function overlaps(cx, cy, hw, hh) {
        for (const b of placed) {
          if (Math.abs(cx - b.cx) < (hw + b.hw)
           && Math.abs(cy - b.cy) < (hh + b.hh)) return true;
        }
        return false;
      }
      pts.forEach(p => {
        const stamp = assets.pickWhere("vegetation", rng, {
          archetypes: cfg.archetypes,
          excludeRoles: new Set(),
        });
        if (!stamp) return;
        const targetH = R.targetHeightFor(stamp, "vegetation");
        const mult = 0.85 + rng() * 0.30;
        const renderH = targetH * mult;
        const renderW = (stamp.w / (stamp.h || 1)) * renderH;
        // Anchor offset to bbox centre.
        const anchorY = (stamp.anchor && stamp.anchor[1]) != null ? stamp.anchor[1] : 0.5;
        const cx = p[0];
        const cy = p[1] - renderH * (anchorY - 0.5);
        const hw = renderW * 0.45;
        const hh = renderH * 0.45;
        if (overlaps(cx, cy, hw, hh)) return;
        placed.push({ cx, cy, hw, hh });
        R.drawStampAtHeight(ctx2d, stamp, p[0], p[1], targetH, {
          flipX: rng() > 0.5,
          alpha: 0.55,
          mult,
        });
      });

      // Extra-dense cattail pass for swamp hexes. The standard pass above
      // mixes marsh + cattail at radius 36; this second pass is cattail-only
      // at a much tighter radius so the swamp reads as a thicket of reeds
      // rather than a few scattered tufts. Tracks bbox via the same `placed`
      // array so cattails don't stack on top of marsh stamps.
      if (t === "swamp") {
        const reedRng = D.mulberry32(D.seedFromString("swamp-reeds:" + h));
        const reedPts = R.poissonInPolygon(polygon, 20, reedRng).slice(0, 22);
        reedPts.forEach(p => {
          const stamp = assets.pickWhere("vegetation", reedRng, {
            archetypes: ["cattail"],
          });
          if (!stamp) return;
          const targetH = R.targetHeightFor(stamp, "vegetation");
          const mult = 0.7 + reedRng() * 0.45;
          const renderH = targetH * mult;
          const renderW = (stamp.w / (stamp.h || 1)) * renderH;
          const anchorY = (stamp.anchor && stamp.anchor[1]) != null ? stamp.anchor[1] : 0.5;
          const cx = p[0];
          const cy = p[1] - renderH * (anchorY - 0.5);
          // Tighter half-extents than the broad marsh stamps so reeds can
          // pack closely without rejecting each other.
          const hw = renderW * 0.30;
          const hh = renderH * 0.30;
          if (overlaps(cx, cy, hw, hh)) return;
          placed.push({ cx, cy, hw, hh });
          R.drawStampAtHeight(ctx2d, stamp, p[0], p[1], targetH, {
            flipX: reedRng() > 0.5,
            alpha: 0.55,
            mult,
          });
        });
      }

      // Sparse stunted-tree pass for swamp hexes — 2-3 trees scattered
      // among the marsh, avoiding overlap with the marsh + cattail stamps.
      if (t === "swamp") {
        const treeRng = D.mulberry32(D.seedFromString("swamp-trees:" + h));
        const treePts = R.poissonInPolygon(polygon, 50, treeRng).slice(0, 3);
        treePts.forEach(p => {
          const stamp = assets.pickWhere("forest", treeRng, {
            archetypes: ["deciduous"],
          });
          if (!stamp) return;
          const targetH = R.targetHeightFor(stamp, "forest") * 0.85;
          const renderH = targetH;
          const renderW = (stamp.w / (stamp.h || 1)) * renderH;
          const anchorY = (stamp.anchor && stamp.anchor[1]) != null ? stamp.anchor[1] : 0.5;
          const cx = p[0];
          const cy = p[1] - renderH * (anchorY - 0.5);
          const hw = renderW * 0.45;
          const hh = renderH * 0.45;
          if (overlaps(cx, cy, hw, hh)) return;
          placed.push({ cx, cy, hw, hh });
          R.drawStampAtHeight(ctx2d, stamp, p[0], p[1], targetH, {
            flipX: treeRng() > 0.5,
            alpha: 0.7,
          });
        });
      }
    });
  }

  // Farm fields tile adjacently across the hex. One farm brush per hex so
  // tile dimensions are consistent; fields are placed on a regular grid
  // sized to the chosen stamp's actual render dimensions, so adjacent fields
  // touch edge-to-edge with no overlap or gap. No rotation — fields read as
  // axis-aligned plots.
  function renderFarmlandHex(paintCtx, polygon, rng, regionId, tooCloseToPath) {
    const { ctx2d, assets } = paintCtx;
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    polygon.forEach(([x, y]) => {
      if (x < xmin) xmin = x;
      if (x > xmax) xmax = x;
      if (y < ymin) ymin = y;
      if (y > ymax) ymax = y;
    });
    const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;

    // Region-stable stamp choice: all hexes in the same farm region share
    // the same farm-field brush so they look like one contiguous farm.
    // Region boundaries are roads/rivers; the stamp changes naturally
    // when the farm crosses one.
    const regionRng = D.mulberry32(D.seedFromString("farmregion:" + regionId));
    const tileStamp = assets.pickWhere("vegetation", regionRng, {
      archetypes: ["farm"],
      excludeRoles: new Set(),
    });
    if (!tileStamp) return;

    const targetH = R.targetHeightFor(tileStamp, "vegetation");
    const tileH = targetH * 1.9;            // 2× larger per the user's call
    const tileScale = tileH / (tileStamp.h || 1);
    const tileW = (tileStamp.w || 1) * tileScale;

    const stepX = tileW;
    const stepY = tileH;
    const cols = Math.max(1, Math.floor((xmax - xmin) / stepX));
    const rows = Math.max(1, Math.floor((ymax - ymin) / stepY));
    const x0 = cx - (cols - 1) * stepX / 2;
    const y0 = cy - (rows - 1) * stepY / 2;

    const placements = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = x0 + c * stepX;
        const y = y0 + r * stepY;
        if (!R.pointInPolygon(x, y, polygon)) continue;
        // Don't grow on the road or in the river.
        if (tooCloseToPath && tooCloseToPath(x, y)) continue;
        // ~50% reduction in field count: skip half via the per-hex rng,
        // checkerboard-style.
        if (rng() < 0.5) continue;
        placements.push({ x, y, kind: "field" });
      }
    }

    // Farmhouses: ~1 per 20 fields (80% reduction from previous 1-per-4).
    const fieldCount = placements.length;
    const houseCount = fieldCount > 0 ? Math.max(1, Math.round(fieldCount / 20)) : 0;
    for (let i = 0; i < houseCount && fieldCount > 0; i++) {
      const idx = Math.floor(rng() * fieldCount);
      if (placements[idx] && placements[idx].kind === "field") {
        placements[idx].kind = "house";
      }
    }

    placements.sort((a, b) => a.y - b.y);
    for (const p of placements) {
      if (p.kind === "field") {
        // Same brush across the whole region — that's the point.
        const sw = tileW;
        const sh = tileH;
        ctx2d.save();
        ctx2d.globalAlpha = 0.78;
        ctx2d.drawImage(tileStamp.img, p.x - sw * 0.5, p.y - sh * 0.5, sw, sh);
        ctx2d.restore();
      } else if (p.kind === "house") {
        const stamp = assets.bySrc("symbols/viking/shape-07.png")
                   || assets.bySrc("symbols/medieval/shape-03.png")
                   || assets.pickWhere("features", rng, { archetypes: ["village"] });
        if (!stamp) continue;
        const stampWithAnchor = Object.assign({}, stamp, { anchor: [0.5, 0.9] });
        // 8 px (halved from 16) — farmhouses were 2× too large.
        R.drawStampAtHeight(ctx2d, stampWithAnchor, p.x, p.y, 8, {
          alpha: 0.92,
          knockout: true,
          knockoutColor: COLORS.PAPER,
          flipX: rng() > 0.5,
        });
      }
    }
  }

  // ---------------------------------------------------------------------
  // Layer 8 — rivers
  // ---------------------------------------------------------------------
  function layerRivers(paintCtx) {
    const { ctx2d, riverPath, hexCenterXY } = paintCtx;
    if (!riverPath || riverPath.length < 2) return;
    const points = riverPath.map(h => hexCenterXY(h));
    const rng = D.mulberry32(D.seedFromString("river:" + paintCtx.campaign));

    // Three-frequency meander with sin envelope (zero at endpoints, max at
    // midpoint of each hop) so the river corridor stays inside its hexes
    // but swings freely through bends. Direct port of the Wilderland SVG
    // renderer's algorithm — the banks read as hand-drawn ribbon.
    const wiggle = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;

      const segs = 18 + Math.floor(rng() * 8);
      const broadPhase = rng() * Math.PI * 2;
      const broadFreq  = 1.2 + rng() * 1.3;
      const medPhase   = rng() * Math.PI * 2;
      const medFreq    = 3.5 + rng() * 2.5;
      const finePhase  = rng() * Math.PI * 2;
      const fineFreq   = 9 + rng() * 4;

      const startS = i === 0 ? 0 : 1;
      for (let s = startS; s <= segs; s++) {
        const t = s / segs;
        const mx = x1 + dx * t;
        const my = y1 + dy * t;
        const env = Math.sin(t * Math.PI);  // 0 at endpoints, 1 at midpoint
        const broad = Math.sin(broadPhase + t * Math.PI * broadFreq) * len * 0.32;
        const med   = Math.sin(medPhase   + t * Math.PI * medFreq)   * len * 0.14;
        const fine  = Math.sin(finePhase  + t * Math.PI * fineFreq)  * len * 0.05;
        const noise = (rng() - 0.5) * len * 0.03;
        const off = (broad + med + fine + noise) * (0.2 + env * 0.8);
        wiggle.push([mx + nx * off, my + ny * off]);
      }
    }
    if (wiggle.length < 2) return;

    // Per-vertex perpendicular (averaged tangent of adjacent spine points).
    function perpAt(i) {
      const p0 = wiggle[Math.max(0, i - 1)];
      const p1 = wiggle[Math.min(wiggle.length - 1, i + 1)];
      const tx = p1[0] - p0[0];
      const ty = p1[1] - p0[1];
      const tl = Math.hypot(tx, ty) || 1;
      return [-ty / tl, tx / tl];
    }

    // Variable river width — slow undulation + small noise + "pool" widenings,
    // smoothed and tapered to a point at both ends.
    const baseHalfWidth = 1.6;
    const numPools = 2 + Math.floor(rng() * 3);
    const pools = [];
    for (let i = 0; i < numPools; i++) {
      pools.push({
        idx: Math.floor(5 + rng() * (wiggle.length - 10)),
        span: 6 + Math.floor(rng() * 10),
        boost: 1.3 + rng() * 0.7,
      });
    }
    const wRaw = wiggle.map((_, i) => {
      const t = i / wiggle.length;
      const undulation = 1 + Math.sin(t * Math.PI * 6 + rng() * 0.5) * 0.25;
      const noise = 1 + (rng() - 0.5) * 0.15;
      let pool = 1;
      for (const p of pools) {
        const d = Math.abs(i - p.idx);
        if (d < p.span) {
          const falloff = Math.cos((d / p.span) * Math.PI / 2);
          pool *= 1 + (p.boost - 1) * falloff;
        }
      }
      return baseHalfWidth * undulation * noise * pool;
    });
    const widths = wRaw.map((_, i) => {
      const a = wRaw[Math.max(0, i - 1)];
      const b = wRaw[i];
      const c = wRaw[Math.min(wRaw.length - 1, i + 1)];
      return (a + b * 2 + c) / 4;
    });
    const taperN = 4;
    for (let i = 0; i < taperN && i < widths.length; i++) {
      widths[i] *= i / taperN;
      widths[widths.length - 1 - i] *= i / taperN;
    }

    const leftBank = wiggle.map((pt, i) => {
      const [px, py] = perpAt(i);
      return [pt[0] + px * widths[i], pt[1] + py * widths[i]];
    });
    const rightBank = wiggle.map((pt, i) => {
      const [px, py] = perpAt(i);
      return [pt[0] - px * widths[i], pt[1] - py * widths[i]];
    });

    // Emit as SVG paths in the path-layer overlay. Vector linework stays
    // sharp at any zoom, and the paper-color fill between the two banks
    // knocks out anything painted behind the river on the canvas.
    const layer = paintCtx.svgPathLayer;
    const ns = paintCtx.svgNS;
    if (!layer || !ns) return;
    // Ribbon fill (paper colour) — closed polygon between the two banks.
    appendSvgPath(layer, ns, closedRibbonD(leftBank, rightBank), {
      fill: COLORS.PAPER,
      stroke: "none",
      "fill-opacity": "1",
    });
    // Two ink bank strokes — same waveform, slightly translucent ink.
    const bankStroke = Math.max(0.9, baseHalfWidth * 0.55);
    appendSvgPath(layer, ns, polylineToD(leftBank), {
      fill: "none",
      stroke: COLORS.RIVER,
      "stroke-width": String(bankStroke),
      "stroke-opacity": "0.9",
    });
    appendSvgPath(layer, ns, polylineToD(rightBank), {
      fill: "none",
      stroke: COLORS.RIVER,
      "stroke-width": String(bankStroke),
      "stroke-opacity": "0.9",
    });
  }

  // ---------------------------------------------------------------------
  // SVG helpers — emit polylines / closed ribbons as <path d> strings.
  // ---------------------------------------------------------------------

  // Quadratic-spline polyline: matches the canvas drawSpline() output
  // exactly (control point at each vertex, target at the midpoint of the
  // next segment), so SVG and canvas paths look identical for the same
  // input polyline.
  function polylineToD(pts) {
    if (!pts || pts.length < 2) return "";
    const f = (n) => n.toFixed(2);
    let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
    if (pts.length === 2) {
      return d + ` L${f(pts[1][0])},${f(pts[1][1])}`;
    }
    for (let i = 1; i < pts.length - 1; i++) {
      const xc = (pts[i][0] + pts[i + 1][0]) / 2;
      const yc = (pts[i][1] + pts[i + 1][1]) / 2;
      d += ` Q${f(pts[i][0])},${f(pts[i][1])} ${f(xc)},${f(yc)}`;
    }
    d += ` L${f(pts[pts.length - 1][0])},${f(pts[pts.length - 1][1])}`;
    return d;
  }

  // Closed ribbon polygon: walk left bank forward, right bank backward,
  // close. Used for the paper-fill knockout between river/road banks.
  function closedRibbonD(left, right) {
    if (!left || !right || left.length < 2 || right.length < 2) return "";
    const f = (n) => n.toFixed(2);
    let d = `M${f(left[0][0])},${f(left[0][1])}`;
    for (let i = 1; i < left.length; i++) {
      d += ` L${f(left[i][0])},${f(left[i][1])}`;
    }
    for (let i = right.length - 1; i >= 0; i--) {
      d += ` L${f(right[i][0])},${f(right[i][1])}`;
    }
    return d + " Z";
  }

  function appendSvgPath(parent, ns, d, attrs) {
    if (!parent || !d) return null;
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    for (const [k, v] of Object.entries(attrs || {})) p.setAttribute(k, v);
    parent.appendChild(p);
    return p;
  }

  // Append an SVG <text>. Paper-stroke halo is on by default for legibility
  // over busy artwork (paint-order: stroke fill is set in painted.html CSS).
  function appendSvgText(parent, ns, text, x, y, opts) {
    if (!parent) return null;
    const t = document.createElementNS(ns, "text");
    t.setAttribute("x", String(x));
    t.setAttribute("y", String(y));
    t.setAttribute("text-anchor", opts.anchor || "middle");
    t.setAttribute("font-family", opts.fontFamily || FONT_STACK);
    t.setAttribute("font-size", String(opts.fontSize || 13));
    if (opts.fontWeight)    t.setAttribute("font-weight", opts.fontWeight);
    if (opts.fontStyle)     t.setAttribute("font-style",  opts.fontStyle);
    if (opts.letterSpacing != null) t.setAttribute("letter-spacing", String(opts.letterSpacing));
    if (opts.dominantBaseline) t.setAttribute("dominant-baseline", opts.dominantBaseline);
    if (opts.transform)     t.setAttribute("transform", opts.transform);
    t.setAttribute("fill", opts.fill || COLORS.LABEL);
    if (opts.halo !== false) {
      t.setAttribute("stroke", opts.haloColor || COLORS.PAPER);
      t.setAttribute("stroke-width", String(opts.haloWidth || 3));
      t.setAttribute("stroke-linejoin", "round");
    }
    if (opts.opacity != null) t.setAttribute("opacity", String(opts.opacity));
    t.textContent = text;
    parent.appendChild(t);
    return t;
  }

  // Append a <text> that follows an SVG path via <textPath>. The path is
  // emitted into a shared <defs> group inside the label layer so it can be
  // referenced by id. Used for arc-banner labels (region name, etc.) so
  // text curves across the map like the source art.
  let _textPathCounter = 0;
  function appendSvgTextOnPath(parent, ns, text, pathD, opts) {
    if (!parent) return null;
    let defs = parent.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS(ns, "defs");
      parent.insertBefore(defs, parent.firstChild);
    }
    const id = "tp-" + (++_textPathCounter);
    const path = document.createElementNS(ns, "path");
    path.setAttribute("id", id);
    path.setAttribute("d", pathD);
    defs.appendChild(path);

    const t = document.createElementNS(ns, "text");
    t.setAttribute("font-family", opts.fontFamily || FONT_STACK);
    t.setAttribute("font-size", String(opts.fontSize || 13));
    if (opts.fontWeight) t.setAttribute("font-weight", opts.fontWeight);
    if (opts.fontStyle)  t.setAttribute("font-style",  opts.fontStyle);
    if (opts.letterSpacing != null) t.setAttribute("letter-spacing", String(opts.letterSpacing));
    t.setAttribute("fill", opts.fill || COLORS.LABEL);
    if (opts.halo !== false) {
      t.setAttribute("stroke", opts.haloColor || COLORS.PAPER);
      t.setAttribute("stroke-width", String(opts.haloWidth || 3));
      t.setAttribute("stroke-linejoin", "round");
    }
    if (opts.opacity != null) t.setAttribute("opacity", String(opts.opacity));

    const tp = document.createElementNS(ns, "textPath");
    tp.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#" + id);
    tp.setAttribute("href", "#" + id);
    tp.setAttribute("startOffset", opts.startOffset || "50%");
    tp.setAttribute("text-anchor", opts.anchor || "middle");
    tp.textContent = text;
    t.appendChild(tp);
    parent.appendChild(t);
    return t;
  }

  // Random perpendicular jitter — used by roads/trails. Light variation only.
  function wobblePolyline(points, rng, amp, segments) {
    if (points.length < 2) return points.slice();
    const out = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      for (let s = 1; s <= segments; s++) {
        const t = s / (segments + 1);
        const x = a[0] + dx * t;
        const y = a[1] + dy * t;
        const k = (rng() - 0.5) * 2 * amp;
        out.push([x + nx * k, y + ny * k]);
      }
      out.push(b);
    }
    return out;
  }

  // Long-period meander: sine wave along cumulative arc-length plus a small
  // jitter on top. Wavelength is ~80 painted px (~0.4 in), which produces a
  // gentle one-bend-per-hex feel. Used for rivers (the SVG renderer's default
  // ribbon look).
  function meanderPolyline(points, rng, meanderAmp, jitterAmp, segmentsPerHop) {
    if (points.length < 2) return points.slice();
    const out = [points[0]];
    let cum = 0;
    const wavelength = 80;
    const phaseOffset = rng() * Math.PI * 2;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const segLen = Math.hypot(dx, dy) || 1;
      const nx = -dy / segLen, ny = dx / segLen;
      for (let s = 1; s <= segmentsPerHop; s++) {
        const t = s / (segmentsPerHop + 1);
        const x = a[0] + dx * t;
        const y = a[1] + dy * t;
        const arc = cum + segLen * t;
        const meander = Math.sin(arc / wavelength * Math.PI * 2 + phaseOffset) * meanderAmp;
        const jitter = (rng() - 0.5) * 2 * jitterAmp;
        const off = meander + jitter;
        out.push([x + nx * off, y + ny * off]);
      }
      out.push(b);
      cum += segLen;
    }
    return out;
  }

  // Compute a parallel polyline offset perpendicular to the centerline. Vertex
  // normals are averaged across adjacent segments so the banks stay smooth.
  // Positive offset = left-hand side of the direction of travel.
  function offsetPolyline(points, offset) {
    if (points.length < 2) return points.slice();
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      const dx = next[0] - prev[0];
      const dy = next[1] - prev[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      out.push([points[i][0] + nx * offset, points[i][1] + ny * offset]);
    }
    return out;
  }

  function drawSpline(ctx, pts) {
    if (pts.length < 2) return;
    ctx.moveTo(pts[0][0], pts[0][1]);
    if (pts.length === 2) { ctx.lineTo(pts[1][0], pts[1][1]); return; }
    for (let i = 1; i < pts.length - 1; i++) {
      const xc = (pts[i][0] + pts[i + 1][0]) / 2;
      const yc = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], xc, yc);
    }
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  }

  // ---------------------------------------------------------------------
  // Layer 9 — roads / trails
  // ---------------------------------------------------------------------
  function layerRoads(paintCtx) {
    const { roadPath, hexCenterXY } = paintCtx;
    if (!roadPath || !roadPath.length) return;
    const layer = paintCtx.svgPathLayer;
    const ns = paintCtx.svgNS;
    if (!layer || !ns) return;

    // Each road = wobbled centerline + ±0.5 px banks → narrow ribbon.
    // Paper-fill polygon between the banks knocks out anything painted
    // behind, then two thin stroked banks (dashed for visual road feel).
    const ROAD_HALF = 0.5;       // very narrow compared to the river
    const TRAIL_HALF = 0.35;
    roadPath.forEach((road, idx) => {
      if (!road.hexes || road.hexes.length < 2) return;
      const pts = road.hexes.map(h => hexCenterXY(h));
      const rng = D.mulberry32(D.seedFromString("road:" + (road.name || idx)));
      const wob = wobblePolyline(pts, rng, 0.6, 3);
      const isTrail = road.path_type === "trail" || road.terrain_difficulty === "perilous";
      const stroke = isTrail ? COLORS.TRAIL : COLORS.ROAD;
      const half = isTrail ? TRAIL_HALF : ROAD_HALF;

      // Twin parallel banks offset perpendicular.
      const left = [], right = [];
      for (let i = 0; i < wob.length; i++) {
        const prev = wob[Math.max(0, i - 1)];
        const next = wob[Math.min(wob.length - 1, i + 1)];
        const tx = next[0] - prev[0];
        const ty = next[1] - prev[1];
        const tl = Math.hypot(tx, ty) || 1;
        const nx = -ty / tl, ny = tx / tl;
        left.push([wob[i][0] + nx * half, wob[i][1] + ny * half]);
        right.push([wob[i][0] - nx * half, wob[i][1] - ny * half]);
      }

      // Paper fill between banks (knockout).
      appendSvgPath(layer, ns, closedRibbonD(left, right), {
        fill: COLORS.PAPER,
        stroke: "none",
      });
      // Two dashed bank strokes.
      const dash = isTrail ? "0.6 2.0" : "0.9 2.5";
      appendSvgPath(layer, ns, polylineToD(left), {
        fill: "none",
        stroke,
        "stroke-width": "0.7",
        "stroke-dasharray": dash,
        "stroke-linecap": "round",
      });
      appendSvgPath(layer, ns, polylineToD(right), {
        fill: "none",
        stroke,
        "stroke-width": "0.7",
        "stroke-dasharray": dash,
        "stroke-linecap": "round",
      });
    });
  }

  // ---------------------------------------------------------------------
  // Layer 10 — settlement / feature stamps
  // ---------------------------------------------------------------------
  function layerSettlements(paintCtx) {
    const { ctx2d, nodes, nodeXY, assets } = paintCtx;
    paintCtx._stampPositions = {};
    nodes.forEach(node => {
      if (!D.isOverlandNode(node)) return;
      const [x, y] = nodeXY(node);
      const override = NODE_ID_STAMP[node.id];
      const map = POINT_TYPE_STAMP[node.point_type];
      let bottomOffset = 0;
      if (override && override.compound) {
        // Compound: draw parts in array order (back-to-front). The author of
        // the compound writes parts in the order they should paint, so a
        // keep-on-hill places the hill first then the keep on top. Knockout
        // ensures front parts mask back parts inside their silhouette.
        const parts = override.compound;
        let maxBottom = 0;  // farthest distance below anchor across parts
        parts.forEach(part => {
          const stamp = assets.bySrc(part.src);
          if (!stamp) return;
          const stampWithAnchor = Object.assign({}, stamp, { anchor: part.anchor || stamp.anchor });
          const h = part.height || R.targetHeightFor(stamp);
          R.drawStampAtHeight(ctx2d, stampWithAnchor, x + (part.dx || 0), y + (part.dy || 0), h, {
            alpha: 0.92,
            knockout: true,
            knockoutColor: COLORS.PAPER,
          });
          // Bottom of this part = anchor_y + dy + h × (1 − anchor[1]).
          // We track the maximum (lowest on canvas) so labels sit just below
          // the visual base of the entire compound.
          const partBottom = (part.dy || 0) + h * (1 - stampWithAnchor.anchor[1]);
          if (partBottom > maxBottom) maxBottom = partBottom;
        });
        bottomOffset = maxBottom;
      } else if (override) {
        const stamp = assets.bySrc(override.src);
        if (stamp) {
          const stampWithAnchor = Object.assign({}, stamp, { anchor: override.anchor || stamp.anchor });
          const h = override.height || R.targetHeightFor(stamp);
          // Single overrides may also specify dx/dy to nudge the stamp
          // off the node's anchor — e.g. to place it in a particular
          // sub-hex when the description requires it.
          const ox = x + (override.dx || 0);
          const oy = y + (override.dy || 0);
          R.drawStampAtHeight(ctx2d, stampWithAnchor, ox, oy, h, {
            alpha: 0.92,
            knockout: true,
            knockoutColor: COLORS.PAPER,
          });
          bottomOffset = h * (1 - stampWithAnchor.anchor[1]) + (override.dy || 0);
          // Update _stampPositions so the label sits below the moved stamp.
          paintCtx._stampPositions[node.id] = { x: ox, y: oy, bottomOffset };
          return;  // bottomOffset already wired into the slot above
        }
      } else if (map) {
        const stamp = assets.bySrc(map.src);
        if (stamp) {
          const stampWithAnchor = Object.assign({}, stamp, { anchor: map.anchor || stamp.anchor });
          const h = map.height || R.targetHeightFor(stamp);
          R.drawStampAtHeight(ctx2d, stampWithAnchor, x, y, h, {
            alpha: 0.92,
            knockout: true,
            knockoutColor: COLORS.PAPER,
          });
          bottomOffset = h * (1 - stampWithAnchor.anchor[1]);
        }
      } else {
        // drawSettlementIcon returns the icon's HEIGHT (top-distance from
        // anchor); for procedural glyphs the bottom sits very close to the
        // anchor so a small fixed offset works.
        drawSettlementIcon(ctx2d, node.point_type, x, y);
        bottomOffset = 4;
      }
      paintCtx._stampPositions[node.id] = { x, y, bottomOffset };
    });
  }

  // Draw a small ink glyph for a settlement / feature. Returns the icon's
  // height above the placement point so the label layer can sit below it.
  function drawSettlementIcon(ctx, type, x, y) {
    ctx.save();
    ctx.strokeStyle = COLORS.INK;
    ctx.fillStyle = COLORS.INK;
    ctx.lineWidth = 1.1;
    ctx.lineJoin = "miter";
    ctx.lineCap = "square";
    let h = 0;
    switch (type) {
      case "heart": {
        // Walled city: crenellated wall with two flanking towers.
        const w = 22, hh = 14, cy = y - 2;
        ctx.beginPath();
        ctx.rect(x - w / 2, cy - hh, w, hh);
        ctx.fillStyle = "rgba(241,228,196,0.95)";
        ctx.fill();
        ctx.strokeStyle = COLORS.INK;
        ctx.stroke();
        // Crenellations
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const cx = x - w / 2 + 2 + i * (w - 4) / 4;
          ctx.rect(cx, cy - hh - 3, 2.5, 3);
        }
        ctx.fillStyle = COLORS.INK;
        ctx.fill();
        // Two towers flanking
        const tw = 4, th = hh + 5;
        ctx.fillStyle = "rgba(241,228,196,0.95)";
        ctx.fillRect(x - w / 2 - tw + 1, cy - th, tw, th);
        ctx.fillRect(x + w / 2 - 1, cy - th, tw, th);
        ctx.strokeRect(x - w / 2 - tw + 1, cy - th, tw, th);
        ctx.strokeRect(x + w / 2 - 1, cy - th, tw, th);
        // Gate
        ctx.beginPath();
        ctx.moveTo(x, cy - hh / 2);
        ctx.lineTo(x, cy);
        ctx.stroke();
        h = th + 4;
        break;
      }
      case "fortress": {
        // Castle: square keep with crenellated top and a flag.
        const w = 14, hh = 14;
        const top = y - hh;
        ctx.fillStyle = "rgba(241,228,196,0.95)";
        ctx.fillRect(x - w / 2, top, w, hh);
        ctx.strokeRect(x - w / 2, top, w, hh);
        // Crenellations
        ctx.fillStyle = COLORS.INK;
        for (let i = 0; i < 3; i++) {
          const cx = x - w / 2 + 1 + i * (w - 2) / 2.5;
          ctx.fillRect(cx, top - 3, 2.5, 3);
        }
        // Flag pole + pennant
        ctx.beginPath();
        ctx.moveTo(x, top - 3);
        ctx.lineTo(x, top - 10);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, top - 10);
        ctx.lineTo(x + 5, top - 8);
        ctx.lineTo(x, top - 6);
        ctx.closePath();
        ctx.fill();
        h = hh + 12;
        break;
      }
      case "settlement":
      case "tavern": {
        // Village: 3 small house glyphs
        const small = type === "tavern";
        const sw = small ? 4 : 5, sh = small ? 4 : 5;
        const positions = [[-7, 0], [0, -1], [6, 0]];
        positions.forEach(([dx, dy]) => {
          ctx.fillStyle = "rgba(241,228,196,0.95)";
          ctx.fillRect(x + dx - sw / 2, y + dy - sh, sw, sh);
          ctx.strokeRect(x + dx - sw / 2, y + dy - sh, sw, sh);
          // Roof triangle
          ctx.beginPath();
          ctx.moveTo(x + dx - sw / 2 - 0.5, y + dy - sh);
          ctx.lineTo(x + dx, y + dy - sh - sw / 2);
          ctx.lineTo(x + dx + sw / 2 + 0.5, y + dy - sh);
          ctx.closePath();
          ctx.fillStyle = COLORS.INK;
          ctx.fill();
        });
        h = sh + 4;
        break;
      }
      case "tower": {
        // Tall narrow tower with conical roof
        const w = 6, hh = 16;
        const top = y - hh;
        ctx.fillStyle = "rgba(241,228,196,0.95)";
        ctx.fillRect(x - w / 2, top, w, hh);
        ctx.strokeRect(x - w / 2, top, w, hh);
        ctx.beginPath();
        ctx.moveTo(x - w / 2 - 1, top);
        ctx.lineTo(x, top - 6);
        ctx.lineTo(x + w / 2 + 1, top);
        ctx.closePath();
        ctx.fillStyle = COLORS.INK;
        ctx.fill();
        h = hh + 8;
        break;
      }
      case "ruin": {
        // Broken wall: jagged top edge
        const w = 14, hh = 8;
        ctx.beginPath();
        ctx.moveTo(x - w / 2, y);
        ctx.lineTo(x - w / 2, y - hh + 2);
        ctx.lineTo(x - w / 4, y - hh);
        ctx.lineTo(x - w / 4 + 2, y - hh + 4);
        ctx.lineTo(x, y - hh + 1);
        ctx.lineTo(x + w / 4 - 2, y - hh + 5);
        ctx.lineTo(x + w / 4, y - hh + 2);
        ctx.lineTo(x + w / 2 - 2, y - hh + 4);
        ctx.lineTo(x + w / 2, y);
        ctx.closePath();
        ctx.fillStyle = "rgba(241,228,196,0.95)";
        ctx.fill();
        ctx.strokeStyle = COLORS.INK;
        ctx.stroke();
        h = hh + 2;
        break;
      }
      case "lair":
      case "dungeon": {
        // Cave / dungeon: arched mouth on a small mound
        const w = 12, hh = 8;
        ctx.beginPath();
        ctx.moveTo(x - w / 2, y);
        ctx.quadraticCurveTo(x, y - hh * 1.4, x + w / 2, y);
        ctx.closePath();
        ctx.fillStyle = "rgba(241,228,196,0.95)";
        ctx.fill();
        ctx.stroke();
        // Mouth arch
        ctx.beginPath();
        ctx.moveTo(x - 4, y);
        ctx.quadraticCurveTo(x, y - 6, x + 4, y);
        ctx.fillStyle = COLORS.INK;
        ctx.fill();
        h = hh + 2;
        break;
      }
      case "sanctuary": {
        // Chapel: square with cross on roof
        const w = 10, hh = 10;
        const top = y - hh;
        ctx.fillStyle = "rgba(241,228,196,0.95)";
        ctx.fillRect(x - w / 2, top, w, hh);
        ctx.strokeRect(x - w / 2, top, w, hh);
        // Roof triangle
        ctx.beginPath();
        ctx.moveTo(x - w / 2 - 1, top);
        ctx.lineTo(x, top - 5);
        ctx.lineTo(x + w / 2 + 1, top);
        ctx.closePath();
        ctx.stroke();
        // Cross
        ctx.beginPath();
        ctx.moveTo(x, top - 5);
        ctx.lineTo(x, top - 10);
        ctx.moveTo(x - 2, top - 8);
        ctx.lineTo(x + 2, top - 8);
        ctx.stroke();
        h = hh + 12;
        break;
      }
      case "waypoint": {
        // Small filled diamond
        ctx.beginPath();
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x + 4, y);
        ctx.lineTo(x, y + 4);
        ctx.lineTo(x - 4, y);
        ctx.closePath();
        ctx.fillStyle = COLORS.INK;
        ctx.fill();
        h = 4;
        break;
      }
      case "wilderness":
      default: {
        // Tiny dot — label-only by intent
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.INK;
        ctx.fill();
        h = 2;
        break;
      }
    }
    ctx.restore();
    return h;
  }

  function targetScale(stamp, targetHeightPx) {
    if (!stamp || !stamp.h) return 1;
    return targetHeightPx / stamp.h;
  }

  // ---------------------------------------------------------------------
  // Layer 11 — rhumb lines
  // ---------------------------------------------------------------------
  function layerRhumbLines(paintCtx) {
    const { ctx2d, WIDTH, HEIGHT } = paintCtx;
    const seaPath = buildSeaPath(paintCtx);
    // Pick a center: the centroid of land hexes shifted east into open sea
    // (simple heuristic: use canvas center, slightly biased).
    const cx = WIDTH * 0.5;
    const cy = HEIGHT * 0.55;
    ctx2d.save();
    ctx2d.clip(seaPath, "evenodd");
    ctx2d.strokeStyle = COLORS.INK;
    ctx2d.globalAlpha = 0.18;
    ctx2d.lineWidth = 0.4;
    const rays = 16;
    const r = Math.hypot(WIDTH, HEIGHT);
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      ctx2d.beginPath();
      ctx2d.moveTo(cx, cy);
      ctx2d.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx2d.stroke();
    }
    ctx2d.restore();
  }

  // ---------------------------------------------------------------------
  // Layer 13 — labels
  // ---------------------------------------------------------------------
  function layerLabels(paintCtx) {
    const { nodes, nodeXY, meta, WIDTH, HEIGHT } = paintCtx;
    const layer = paintCtx.svgLabelLayer;
    const ns = paintCtx.svgNS;
    if (!layer || !ns) return;
    // Layer is cleared centrally in render() before any layer paints.

    function svgText(text, x, y, opts) {
      const t = document.createElementNS(ns, "text");
      t.setAttribute("x", x.toFixed(1));
      t.setAttribute("y", y.toFixed(1));
      t.setAttribute("text-anchor", opts.anchor || "middle");
      t.setAttribute("font-family", opts.fontFamily || FONT_STACK);
      t.setAttribute("font-size", String(opts.fontSize || 13));
      if (opts.fontWeight) t.setAttribute("font-weight", opts.fontWeight);
      if (opts.fontStyle)  t.setAttribute("font-style",  opts.fontStyle);
      if (opts.letterSpacing != null) t.setAttribute("letter-spacing", opts.letterSpacing);
      t.setAttribute("fill", opts.fill);
      // Paper-color halo via stroke; CSS `paint-order: stroke` (set on the
      // label-layer in painted.html) puts the stroke BEHIND the fill so the
      // text reads cleanly over busy artwork.
      if (opts.halo !== false) {
        t.setAttribute("stroke", COLORS.PAPER);
        t.setAttribute("stroke-width", String(opts.haloWidth || 3));
        t.setAttribute("stroke-linejoin", "round");
      }
      if (opts.opacity != null) t.setAttribute("opacity", String(opts.opacity));
      t.textContent = text;
      layer.appendChild(t);
      return t;
    }

    // Region label — wide-tracked caps banner that arcs gently across the
    // top of the landmass like the source art (textPath on a shallow
    // quadratic curve). Quieter than the off-map top label so they don't
    // compete; smaller font, lower opacity.
    if (meta.region) {
      const lb = paintCtx.landBounds(0);
      const lx = lb ? (lb.minX + lb.maxX) / 2 : WIDTH / 2;
      const ly = lb ? lb.minY + 36 : HEIGHT * 0.10;
      const halfW = lb ? Math.max(120, (lb.maxX - lb.minX) * 0.42) : WIDTH * 0.3;
      const sag = 18;
      const arcD = `M${lx - halfW},${ly} Q${lx},${ly - sag} ${lx + halfW},${ly}`;
      appendSvgTextOnPath(layer, ns, meta.region.toUpperCase(), arcD, {
        fontSize: 26,
        fontWeight: "500",
        letterSpacing: "8",
        fill: COLORS.INK,
        opacity: 0.5,
        haloWidth: 4,
      });
    }

    // Place labels per visible node.
    nodes.forEach(node => {
      if (!D.isOverlandNode(node)) return;
      if (!node.name) return;
      const slot = paintCtx._stampPositions && paintCtx._stampPositions[node.id];
      const [x, y] = slot ? [slot.x, slot.y] : nodeXY(node);
      const yOff = (slot ? slot.bottomOffset : 0) + 6;
      const isRed = RED_TYPES.has(node.point_type);
      const fontSize = node.point_type === "heart" ? 16 : 13;
      svgText(node.name, x, y + yOff, {
        fontSize,
        fontWeight: isRed ? "600" : "400",
        fill: isRed ? COLORS.LABEL_HIGHLIGHT : COLORS.LABEL,
        haloWidth: 3,
      });
    });
  }

  // ---------------------------------------------------------------------
  // Layer 14 — cartouche
  // ---------------------------------------------------------------------
  function layerCartouche(paintCtx) {
    const { ctx2d, WIDTH, meta } = paintCtx;
    if (!meta.world && !meta.campaign) return;
    const layer = paintCtx.svgLabelLayer;
    const ns = paintCtx.svgNS;
    const pad = 28;
    const w = 280, h = 96;
    const x = WIDTH - w - pad;
    const y = pad;
    // Cartouche frame: borders only, no fill — text reads directly over
    // the page background. (The earlier parchment tint was fighting the
    // chosen background colour.)
    ctx2d.save();
    ctx2d.strokeStyle = COLORS.INK;
    ctx2d.lineWidth = 1.2;
    roundedRect(ctx2d, x, y, w, h, 6);
    ctx2d.stroke();
    ctx2d.lineWidth = 0.6;
    roundedRect(ctx2d, x + 4, y + 4, w - 8, h - 8, 4);
    ctx2d.stroke();
    ctx2d.restore();
    // Cartouche text → SVG so it stays sharp at zoom.
    if (!layer || !ns) return;
    appendSvgText(layer, ns, meta.world || meta.campaign, x + w / 2, y + 38, {
      fontSize: 18, fontWeight: "bold", fill: COLORS.INK,
      dominantBaseline: "alphabetic", haloWidth: 3,
    });
    if (meta.region) {
      appendSvgText(layer, ns, meta.region, x + w / 2, y + 60, {
        fontSize: 13, fontStyle: "italic", fill: COLORS.INK_SOFT,
        dominantBaseline: "alphabetic", haloWidth: 3,
      });
    }
    if (meta.era) {
      appendSvgText(layer, ns, meta.era, x + w / 2, y + 80, {
        fontSize: 12, fill: COLORS.INK_SOFT,
        dominantBaseline: "alphabetic", haloWidth: 3,
      });
    }
  }

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  // ---------------------------------------------------------------------
  // Layer 15 — compass rose (procedural, upper-left)
  // ---------------------------------------------------------------------
  function layerCompassRose(paintCtx) {
    const { ctx2d, assets } = paintCtx;
    const cx = 130, cy = 150;
    const COMPASS_HEIGHT = 220;
    const stamp = assets.bySrc("symbols/medieval/shape-32.png");
    if (!stamp) return;
    // Rose stamp on canvas.
    const drawWithAnchor = Object.assign({}, stamp, { anchor: [0.5, 0.5] });
    R.drawStampAtHeight(ctx2d, drawWithAnchor, cx, cy, COMPASS_HEIGHT, { alpha: 0.9 });
    // Cardinal letters → SVG so they stay sharp at zoom and pick up the
    // paper-halo style automatically.
    const layer = paintCtx.svgLabelLayer;
    const ns = paintCtx.svgNS;
    if (!layer || !ns) return;
    const radius = COMPASS_HEIGHT * 0.55 + 10;
    const cardOpts = {
      fontSize: 14, fontWeight: "bold", fill: COLORS.INK,
      dominantBaseline: "middle", haloWidth: 3,
    };
    appendSvgText(layer, ns, "N", cx, cy - radius, cardOpts);
    appendSvgText(layer, ns, "S", cx, cy + radius, cardOpts);
    appendSvgText(layer, ns, "E", cx + radius, cy, cardOpts);
    appendSvgText(layer, ns, "W", cx - radius, cy, cardOpts);
  }

  // ---------------------------------------------------------------------
  // Layer 16 — border (top of stack)
  // ---------------------------------------------------------------------
  function layerBorder(paintCtx) {
    const { ctx2d, WIDTH, HEIGHT, assets } = paintCtx;
    if (!assets.border) return;
    ctx2d.save();
    ctx2d.globalAlpha = 0.9;
    ctx2d.drawImage(assets.border, 0, 0, WIDTH, HEIGHT);
    ctx2d.restore();
  }

  // ---------------------------------------------------------------------
  // Style module export
  // ---------------------------------------------------------------------
  window.MapStyles = window.MapStyles || {};
  window.MapStyles.mapeffects = {
    name: "Map Effects",
    font: FONT_STACK,
    colors: COLORS,
    filterNodes(nodes) { return nodes.filter(D.isOverlandNode); },
    render,
  };
})();
