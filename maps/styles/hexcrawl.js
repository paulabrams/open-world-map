// hexcrawl.js — "Hex Crawl" parchment map style for Open World Map viewer
// Simple icons on parchment, designed for hex grid overlay.

window.MapStyles = window.MapStyles || {};

window.MapStyles.hexcrawl = {
  name: "Hex Crawl",

  /* ── CSS custom-property values ─────────────────────────────── */
  css: {
    "--bg-color":      "#2a1f14",
    "--panel-bg":      "#f4e8d1",
    "--panel-border":  "#2a1f14",
    "--panel-text":    "#2a1f14",
    "--panel-heading": "#8b2500",
    "--panel-type":    "#5a4a3a",
    "--title-color":   "#8b2500",
    "--btn-bg":        "#f4e8d1",
    "--btn-border":    "#2a1f14",
    "--btn-text":      "#2a1f14",
  },

  /* ── Palette ────────────────────────────────────────────────── */
  colors: {
    INK:            "#2a1f14",
    INK_LIGHT:      "#5a4a3a",
    LABEL_RED:      "#8b2500",
    PARCHMENT:      "#f4e8d1",
    PARCHMENT_DARK: "#d4c4a0",
  },

  /* ── Node visibility filter ─────────────────────────────────── */
  filterNodes(nodes) {
    return nodes.filter(isOverlandNode);
  },

  /* ── Master render (called by core) ─────────────────────────── */
  render(ctx) {
    this.renderBackground(ctx);
    this.renderBorder(ctx);
    this.renderOriginAxes(ctx);
    this.renderTravelRadii(ctx);
    MapCore.renderRiver(ctx, ctx.colors.INK, 3);
    MapCore.renderRiverLabel(ctx, { color: ctx.colors.INK, strokeColor: ctx.colors.PARCHMENT });
    MapCore.renderRoad(ctx, ctx.colors.INK, 2);
    MapCore.renderCrevasse(ctx, "#2a1f14", 3);
    MapCore.renderBridges(ctx, { color: ctx.colors.INK, strokeWidth: 1.1, bridgeLen: 14 });
    this.renderLinks(ctx);
    this.renderTerrainSymbols(ctx);
    MapCore.renderRegionLabels(ctx, {
      color: ctx.colors.INK,
      strokeColor: ctx.colors.PARCHMENT,
      fontSize: 18,
      letterSpacing: "4px",
      opacity: 0.55,
      fontStyle: "normal",
    });
    this.renderNodes(ctx);
    this.renderLabels(ctx);
    this.renderDayLabels(ctx);
    this.renderCompass(ctx);
    this.renderScaleBar(ctx);
    this.renderCartouche(ctx);
  },

  // Small hex coordinate labels (e.g. "0904") near the top of each hex that
  // has terrain data — classic tactical hex-crawl convention for referencing.
  renderHexCoords(ctx) {
    const { g, hexTerrain, HINT_SCALE, WIDTH, HEIGHT, FONT } = ctx;
    const { INK } = ctx.colors;
    if (!hexTerrain) return;
    const bcCol = 10, bcRow = 10;
    const size = HINT_SCALE / 2;
    const colStep = size * 2 * 0.75;
    const rowStep = size * Math.sqrt(3);

    const group = g.append("g").attr("class", "hex-coords");
    Object.keys(hexTerrain).forEach(hex => {
      if (typeof hex !== "string" || hex.length < 4) return;
      const col = parseInt(hex.substring(0, 2));
      const row = parseInt(hex.substring(2, 4));
      if (isNaN(col) || isNaN(row)) return;
      const hx = (col - bcCol) * colStep + WIDTH / 2;
      const hy = (row - bcRow) * rowStep + (col % 2 !== bcCol % 2 ? rowStep / 2 : 0) + HEIGHT / 2;
      // Position near the top edge of the hex (inscribed radius * 0.8 above center)
      const inscribed = size * Math.sqrt(3) / 2;
      group.append("text")
        .attr("x", hx).attr("y", hy - inscribed * 0.82)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "hanging")
        .attr("font-family", "'SF Mono', 'Monaco', 'Menlo', monospace")
        .attr("font-size", "7.5px")
        .attr("fill", INK).attr("opacity", 0.28)
        .text(hex);
    });
  },

  // Faint cross axes through the heart node with inch tick marks —
  // matches the user's hand-drawn hex sketch convention.
  renderOriginAxes(ctx) {
    const { g, nodes, bounds, HINT_SCALE } = ctx;
    const { INK } = ctx.colors;
    const heart = nodes.find(n => n.point_type === "heart" && n.scale !== "local");
    if (!heart) return;

    const axG = g.append("g").attr("class", "origin-axes");
    // Horizontal axis
    axG.append("line")
      .attr("x1", bounds.minX - 10).attr("y1", heart.y)
      .attr("x2", bounds.maxX + 10).attr("y2", heart.y)
      .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.18);
    // Vertical axis
    axG.append("line")
      .attr("x1", heart.x).attr("y1", bounds.minY - 10)
      .attr("x2", heart.x).attr("y2", bounds.maxY + 10)
      .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.18);

    // Inch tick marks along both axes
    const tickLen = 4;
    const leftInches = Math.floor((heart.x - bounds.minX) / HINT_SCALE);
    const rightInches = Math.floor((bounds.maxX - heart.x) / HINT_SCALE);
    const upInches = Math.floor((heart.y - bounds.minY) / HINT_SCALE);
    const downInches = Math.floor((bounds.maxY - heart.y) / HINT_SCALE);
    for (let i = -leftInches; i <= rightInches; i++) {
      if (i === 0) continue;
      const tx = heart.x + i * HINT_SCALE;
      axG.append("line")
        .attr("x1", tx).attr("y1", heart.y - tickLen / 2)
        .attr("x2", tx).attr("y2", heart.y + tickLen / 2)
        .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.3);
    }
    for (let i = -upInches; i <= downInches; i++) {
      if (i === 0) continue;
      const ty = heart.y + i * HINT_SCALE;
      axG.append("line")
        .attr("x1", heart.x - tickLen / 2).attr("y1", ty)
        .attr("x2", heart.x + tickLen / 2).attr("y2", ty)
        .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.3);
    }
  },

  // Faint concentric circles around the heart node — echoes the
  // hand-drawn Basilisk map's travel-day ranges.
  renderTravelRadii(ctx) {
    const { g, nodes, DAY_SCALE } = ctx;
    const { INK } = ctx.colors;
    const heart = nodes.find(n => n.point_type === "heart" && n.scale !== "local");
    if (!heart) return;

    const radii = [
      { days: 1, label: "1 day" },
      { days: 3, label: "3 days" },
    ];
    const radiusGroup = g.append("g").attr("class", "travel-radii");

    radii.forEach(({ days, label }) => {
      const r = days * DAY_SCALE;
      radiusGroup.append("circle")
        .attr("cx", heart.x).attr("cy", heart.y).attr("r", r)
        .attr("fill", "none")
        .attr("stroke", INK)
        .attr("stroke-width", 0.7)
        .attr("stroke-dasharray", "3 4")
        .attr("opacity", 0.25);
      // Small italic label on the upper-right of the circle
      radiusGroup.append("text")
        .attr("x", heart.x + r * 0.72).attr("y", heart.y - r * 0.72)
        .attr("text-anchor", "middle")
        .attr("font-family", ctx.FONT)
        .attr("font-size", "10px")
        .attr("font-style", "italic")
        .attr("fill", INK)
        .attr("opacity", 0.4)
        .text(label);
    });
  },

  /* ────────────────────────────────────────────────────────────
     Individual render methods — ported verbatim from grid.html
     with bare constants replaced by ctx.colors / ctx.*
     ──────────────────────────────────────────────────────────── */

  // --- Parchment background ---
  renderBackground(ctx) {
    const { g, defs, WIDTH, HEIGHT } = ctx;
    const { PARCHMENT, PARCHMENT_DARK } = ctx.colors;

    // Paper texture filter
    const filter = defs.append("filter")
      .attr("id", "parchment-texture")
      .attr("x", "0%").attr("y", "0%")
      .attr("width", "100%").attr("height", "100%");

    filter.append("feTurbulence")
      .attr("type", "fractalNoise")
      .attr("baseFrequency", "0.035")
      .attr("numOctaves", "4")
      .attr("seed", "15")
      .attr("stitchTiles", "stitch")
      .attr("result", "noise");

    filter.append("feColorMatrix")
      .attr("type", "matrix")
      .attr("in", "noise")
      .attr("values", `0 0 0 0 0.957
                       0 0 0 0 0.910
                       0 0 0 0 0.820
                       0 0 0 0.4 0.6`)
      .attr("result", "colored");

    filter.append("feBlend")
      .attr("in", "SourceGraphic")
      .attr("in2", "colored")
      .attr("mode", "multiply");

    // Background rect with gradient
    const grad = defs.append("radialGradient")
      .attr("id", "parchment-grad")
      .attr("cx", "50%").attr("cy", "50%").attr("r", "70%");
    grad.append("stop").attr("offset", "0%").attr("stop-color", PARCHMENT);
    grad.append("stop").attr("offset", "100%").attr("stop-color", PARCHMENT_DARK);

    g.append("rect")
      .attr("width", WIDTH * 3)
      .attr("height", HEIGHT * 3)
      .attr("x", -WIDTH)
      .attr("y", -HEIGHT)
      .attr("fill", "url(#parchment-grad)")
      .attr("filter", "url(#parchment-texture)");
  },

  // --- Simple tactical-style border ---
  renderBorder(ctx) {
    const { g, bounds } = ctx;
    const { INK } = ctx.colors;
    const pad = 40;
    const x = bounds.minX - pad, y = bounds.minY - pad;
    const w = bounds.maxX - bounds.minX + pad * 2;
    const h = bounds.maxY - bounds.minY + pad * 2;
    g.append("rect")
      .attr("x", x).attr("y", y).attr("width", w).attr("height", h)
      .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.4);
    // Short tick marks at corners — just a hint of a frame
    const cm = 10;
    [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(([cx, cy, sx, sy]) => {
      g.append("line").attr("x1", cx).attr("y1", cy).attr("x2", cx + cm * sx).attr("y2", cy)
        .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.5);
      g.append("line").attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy + cm * sy)
        .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.5);
    });
  },

  // --- Path / link rendering ---
  renderLinks(ctx) {
    const { g, links, HINT_SCALE } = ctx;
    const { INK } = ctx.colors;
    const mulberry32 = ctx.mulberry32;
    const seedFromString = ctx.seedFromString;

    const linkGroup = g.append("g").attr("class", "links");

    links.forEach(link => {
      const sx = link.source.x, sy = link.source.y;
      const tx = link.target.x, ty = link.target.y;

      // Compute a slight curve offset
      const dx = tx - sx, dy = ty - sy;
      const len = Math.sqrt(dx * dx + dy * dy);
      const rng = mulberry32(seedFromString(link.name || "link"));
      const curvature = (rng() - 0.5) * len * 0.15;
      // Perpendicular offset for control point
      const nx = -dy / len, ny = dx / len;
      const cx = (sx + tx) / 2 + nx * curvature;
      const cy = (sy + ty) / 2 + ny * curvature;

      if (link.path_type === "river") {
        // Double-line river channel (Tolkien style: two parallel bank lines)
        const segments = 20;
        const spine = [];
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const bx = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cx + t * t * tx;
          const by = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cy + t * t * ty;
          const wave = Math.sin(t * Math.PI * 3) * 4;
          spine.push({ x: bx + nx * wave, y: by + ny * wave });
        }

        const bankWidth = 3.5;
        function offsetBank(pts, sign) {
          const result = [];
          for (let i = 0; i < pts.length; i++) {
            let lnx, lny;
            if (i === 0) { lnx = pts[1].x - pts[0].x; lny = pts[1].y - pts[0].y; }
            else if (i === pts.length - 1) { lnx = pts[i].x - pts[i-1].x; lny = pts[i].y - pts[i-1].y; }
            else { lnx = pts[i+1].x - pts[i-1].x; lny = pts[i+1].y - pts[i-1].y; }
            const ll = Math.sqrt(lnx * lnx + lny * lny) || 1;
            result.push({ x: pts[i].x + sign * (-lny / ll) * bankWidth, y: pts[i].y + sign * (lnx / ll) * bankWidth });
          }
          return result;
        }

        const lineGen = d3.line().x(d => d.x).y(d => d.y).curve(d3.curveBasis);

        linkGroup.append("path").attr("d", lineGen(offsetBank(spine, 1)))
          .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.2)
          .attr("stroke-linecap", "round").attr("opacity", 0.7);
        linkGroup.append("path").attr("d", lineGen(offsetBank(spine, -1)))
          .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.2)
          .attr("stroke-linecap", "round").attr("opacity", 0.7);
        return;
      }

      const pathD = `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;

      const path = linkGroup.append("path")
        .attr("d", pathD)
        .attr("fill", "none")
        .attr("stroke", INK)
        .attr("stroke-linecap", "round");

      switch (link.path_type) {
        case "road":
          path.attr("stroke-width", 2.0).attr("opacity", 0.9);
          break;
        case "trail":
          path.attr("stroke-width", 1.3).attr("stroke-dasharray", "8 4").attr("opacity", 0.8);
          break;
        case "wilderness":
          path.attr("stroke-width", 0.9).attr("stroke-dasharray", "3 5").attr("opacity", 0.6);
          break;
        default:
          path.attr("stroke-width", 1.5);
      }
    });
  },

  // --- Terrain symbol placement ---
  renderTerrainSymbols(ctx) {
    const { g } = ctx;
    const { INK } = ctx.colors;

    const terrainGroup = g.append("g").attr("class", "terrain");

    // Draw terrain from hex_terrain data
    const style = this;
    MapCore.renderHexTerrain(ctx, {
      // forest trees and mountains rendered by dedicated helpers below
      "forested-hills": (tg, x, y, sz, rng) => style.drawHill(tg, x, y, sz, rng, INK),
      "hills": (tg, x, y, sz, rng) => style.drawHill(tg, x, y, sz, rng, INK),
      "swamp": (tg, x, y, sz, rng) => style.drawSwampReeds(tg, x, y, sz, rng, INK),
      "plains": (tg, x, y, sz, rng) => style.drawGrassTuft(tg, x, y, sz, rng, INK),
      "graveyard": (tg, x, y, sz, rng) => style.drawGraveyard(tg, x, y, sz, rng, INK),
    });
    MapCore.renderMountainsWithElevation(ctx,
      (tg, x, y, sz, rng) => style.drawMountain(tg, x, y, sz, rng, INK),
      (tg, x, y, sz, rng) => style.drawHill(tg, x, y, sz, rng, INK));
    MapCore.renderForestEdgeTrees(ctx,
      (tg, x, y, sz, rng) => style.drawTree(tg, x, y, sz, rng, INK),
      ["forest", "forested-hills"]);
    MapCore.renderFarmlandBiased(ctx,
      (tg, x, y, sz, rng) => style.drawFarm(tg, x, y, sz, rng, INK));
    MapCore.renderTerrainEdges(ctx, ["forest", "forested-hills"], {
      color: INK, strokeWidth: 1.0, opacity: 0.55, wobble: 2.0, className: "forest-edges",
    });
  },

  drawGraveyard(g, x, y, size, rng, INK) {
    // Cluster of 3-5 small crosses / tombstones
    const count = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const gx = x + (rng() - 0.5) * size * 1.1;
      const gy = y + (rng() - 0.5) * size * 0.65;
      const gh = size * (0.3 + rng() * 0.15);
      const gw = gh * 0.55;
      const style = rng();
      if (style > 0.6) {
        // Cross
        g.append("line")
          .attr("x1", gx).attr("y1", gy - gh * 0.45)
          .attr("x2", gx).attr("y2", gy + gh * 0.45)
          .attr("stroke", INK).attr("stroke-width", 0.7).attr("opacity", 0.7);
        g.append("line")
          .attr("x1", gx - gw * 0.5).attr("y1", gy - gh * 0.2)
          .attr("x2", gx + gw * 0.5).attr("y2", gy - gh * 0.2)
          .attr("stroke", INK).attr("stroke-width", 0.7).attr("opacity", 0.7);
      } else {
        // Rounded tombstone
        g.append("path")
          .attr("d", `M ${gx - gw / 2} ${gy + gh * 0.45} L ${gx - gw / 2} ${gy - gh * 0.15} Q ${gx} ${gy - gh * 0.5} ${gx + gw / 2} ${gy - gh * 0.15} L ${gx + gw / 2} ${gy + gh * 0.45} Z`)
          .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.6).attr("opacity", 0.7);
      }
      // Occasional burial-mound ground line beneath the marker
      if (rng() > 0.65) {
        g.append("line")
          .attr("x1", gx - gw * 0.7).attr("y1", gy + gh * 0.5)
          .attr("x2", gx + gw * 0.7).attr("y2", gy + gh * 0.5)
          .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.45);
      }
    }
  },

  // --- Node icon rendering ---
  renderNodes(ctx) {
    const { g, nodes } = ctx;
    const { INK } = ctx.colors;

    const nodeGroup = g.append("g").attr("class", "nodes");

    nodes.forEach(node => {
      const ng = nodeGroup.append("g")
        .attr("transform", `translate(${node.x}, ${node.y})`)
        .attr("class", "node")
        .style("cursor", "pointer")
        .on("click", (event) => { event.stopPropagation(); MapCore.showDetail(node); });
      ng.append("title").text(node.name);

      const isLocal = node.scale === "local";
      const s = isLocal ? 3 : 5;

      switch (node.point_type) {
        case "heart": {
          // Town cluster — multiple small filled houses, with a central tower and pennant
          const hs = 5;
          const spots = [
            { dx: 0, dy: 0, sc: 1.2 },
            { dx: -hs * 1.4, dy: hs * 0.3, sc: 0.9 },
            { dx: hs * 1.4, dy: hs * 0.2, sc: 0.9 },
            { dx: -hs * 0.4, dy: -hs * 0.9, sc: 0.85 },
            { dx: hs * 0.5, dy: -hs * 0.8, sc: 0.85 },
          ];
          spots.forEach((p, idx) => {
            const w = hs * 0.9 * p.sc;
            const h = hs * 0.6 * p.sc;
            ng.append("rect").attr("x", p.dx - w / 2).attr("y", p.dy - h / 2 + h * 0.1)
              .attr("width", w).attr("height", h).attr("fill", INK);
            ng.append("path")
              .attr("d", `M ${p.dx - w / 2 - 0.5} ${p.dy - h / 2 + h * 0.1} L ${p.dx} ${p.dy - h * 0.9} L ${p.dx + w / 2 + 0.5} ${p.dy - h / 2 + h * 0.1} Z`)
              .attr("fill", INK);
            // Smoke plume from the left/right outlying house — inhabited marker
            if (idx === 1 || idx === 2) {
              const sx = p.dx + w * 0.2;
              const sy = p.dy - h * 0.9;
              ng.append("path")
                .attr("d", `M ${sx} ${sy} C ${sx - hs * 0.25} ${sy - hs * 0.4}, ${sx + hs * 0.25} ${sy - hs * 0.7}, ${sx - hs * 0.05} ${sy - hs * 1.1}`)
                .attr("fill", "none").attr("stroke", INK)
                .attr("stroke-width", 0.5).attr("stroke-linecap", "round")
                .attr("opacity", 0.5);
            }
          });
          // Central tower + pennant — marks this as the capital of the region
          const tX = 0, tTop = -hs * 1.7, tBase = -hs * 0.9;
          ng.append("rect").attr("x", tX - 1).attr("y", tTop).attr("width", 2).attr("height", tBase - tTop)
            .attr("fill", INK);
          ng.append("line")
            .attr("x1", tX).attr("y1", tTop).attr("x2", tX).attr("y2", tTop - hs * 0.6)
            .attr("stroke", INK).attr("stroke-width", 0.7);
          ng.append("path")
            .attr("d", `M ${tX} ${tTop - hs * 0.6} L ${tX + hs * 0.55} ${tTop - hs * 0.45} L ${tX} ${tTop - hs * 0.3} Z`)
            .attr("fill", INK);
          // Faint walled-town oval ring — matches the hand-drawn sketch's circle around BC
          ng.append("ellipse")
            .attr("cx", 0).attr("cy", 0)
            .attr("rx", hs * 2.4).attr("ry", hs * 1.8)
            .attr("fill", "none")
            .attr("stroke", INK)
            .attr("stroke-width", 0.7)
            .attr("opacity", 0.35);
          break;
        }
        case "fortress": {
          // Castle: wall with twin towers + arched gate
          const hs = 5;
          // Faint ground halo — cleared area around the castle
          ng.append("ellipse")
            .attr("cx", 0).attr("cy", hs * 0.4)
            .attr("rx", hs * 1.6).attr("ry", hs * 0.45)
            .attr("fill", INK).attr("opacity", 0.06);
          ng.append("rect").attr("x", -hs).attr("y", -hs * 0.35).attr("width", hs * 2).attr("height", hs * 0.85)
            .attr("fill", INK);
          // Twin towers
          [-1, 1].forEach(side => {
            ng.append("rect").attr("x", side * hs - hs * 0.3).attr("y", -hs).attr("width", hs * 0.55).attr("height", hs * 1.55)
              .attr("fill", INK);
            // Crenellations
            for (let c = 0; c < 2; c++) {
              ng.append("rect").attr("x", side * hs - hs * 0.25 + c * hs * 0.25).attr("y", -hs - hs * 0.2).attr("width", hs * 0.13).attr("height", hs * 0.2)
                .attr("fill", INK);
            }
          });
          // Arched gate cut into the wall
          ng.append("path")
            .attr("d", `M ${-hs * 0.25} ${hs * 0.5} L ${-hs * 0.25} ${hs * 0.1} Q 0 ${-hs * 0.15} ${hs * 0.25} ${hs * 0.1} L ${hs * 0.25} ${hs * 0.5}`)
            .attr("fill", "none").attr("stroke", "#fff").attr("stroke-width", 0.7).attr("opacity", 0.85);
          // Pennant on the right tower
          const pX = hs, pTop = -hs - hs * 0.55;
          ng.append("line")
            .attr("x1", pX).attr("y1", -hs - hs * 0.2).attr("x2", pX).attr("y2", pTop)
            .attr("stroke", INK).attr("stroke-width", 0.6);
          ng.append("path")
            .attr("d", `M ${pX} ${pTop} L ${pX + hs * 0.55} ${pTop + hs * 0.13} L ${pX} ${pTop + hs * 0.26} Z`)
            .attr("fill", INK);
          // Ground-shadow beneath the walls
          ng.append("line")
            .attr("x1", -hs - 1).attr("y1", hs * 0.5 + 2).attr("x2", hs + 1).attr("y2", hs * 0.5 + 2)
            .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.4);
          break;
        }
        case "tavern": {
          // Inn: filled house with a cutout arched door and a sign post
          const hs = isLocal ? 3 : 4;
          ng.append("rect").attr("x", -hs * 0.8).attr("y", -hs * 0.3).attr("width", hs * 1.6).attr("height", hs * 1.1)
            .attr("fill", INK);
          ng.append("path")
            .attr("d", `M ${-hs * 0.95} ${-hs * 0.3} L 0 ${-hs * 1.1} L ${hs * 0.95} ${-hs * 0.3} Z`)
            .attr("fill", INK);
          // Arched door (light cutout against the filled wall)
          ng.append("path")
            .attr("d", `M ${-hs * 0.22} ${hs * 0.8} L ${-hs * 0.22} ${hs * 0.3} Q 0 ${hs * 0.05} ${hs * 0.22} ${hs * 0.3} L ${hs * 0.22} ${hs * 0.8}`)
            .attr("fill", "none").attr("stroke", "#fff").attr("stroke-width", 0.6).attr("opacity", 0.85);
          // Sign post to the right — horizontal arm + two short chains + filled sign board
          ng.append("line").attr("x1", hs * 1.0).attr("y1", 0).attr("x2", hs * 1.5).attr("y2", 0)
            .attr("stroke", INK).attr("stroke-width", 0.7);
          ng.append("line").attr("x1", hs * 1.2).attr("y1", 0).attr("x2", hs * 1.2).attr("y2", hs * 0.08)
            .attr("stroke", INK).attr("stroke-width", 0.5);
          ng.append("line").attr("x1", hs * 1.65).attr("y1", 0).attr("x2", hs * 1.65).attr("y2", hs * 0.08)
            .attr("stroke", INK).attr("stroke-width", 0.5);
          ng.append("rect").attr("x", hs * 1.2).attr("y", hs * 0.08).attr("width", hs * 0.45).attr("height", hs * 0.4)
            .attr("fill", INK);
          break;
        }
        case "settlement": {
          // Two small houses with a smoke plume from the right roof (inhabited marker)
          const hs = isLocal ? 3 : 4;
          [-1, 1].forEach(side => {
            const dx = side * hs * 0.9;
            ng.append("rect").attr("x", dx - hs * 0.55).attr("y", -hs * 0.25).attr("width", hs * 1.1).attr("height", hs * 0.75)
              .attr("fill", INK);
            ng.append("path")
              .attr("d", `M ${dx - hs * 0.7} ${-hs * 0.25} L ${dx} ${-hs * 0.95} L ${dx + hs * 0.7} ${-hs * 0.25} Z`)
              .attr("fill", INK);
            if (side === 1) {
              const sx = dx + hs * 0.2;
              const sy = -hs * 0.95;
              ng.append("path")
                .attr("d", `M ${sx} ${sy} C ${sx - hs * 0.3} ${sy - hs * 0.45}, ${sx + hs * 0.3} ${sy - hs * 0.8}, ${sx - hs * 0.1} ${sy - hs * 1.3}`)
                .attr("fill", "none").attr("stroke", INK)
                .attr("stroke-width", 0.6).attr("stroke-linecap", "round")
                .attr("opacity", 0.55);
            }
          });
          break;
        }
        case "wilderness":
          // Open circle with a small tree silhouette inside — "unmapped wilds"
          ng.append("circle").attr("r", s).attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.2);
          // Interior tree glyph: tiny triangle + trunk
          ng.append("path")
            .attr("d", `M ${-s * 0.45} ${s * 0.15} L 0 ${-s * 0.5} L ${s * 0.45} ${s * 0.15} Z`)
            .attr("fill", INK);
          ng.append("line")
            .attr("x1", 0).attr("y1", s * 0.15).attr("x2", 0).attr("y2", s * 0.5)
            .attr("stroke", INK).attr("stroke-width", 0.8);
          break;
        case "dungeon": {
          // Cave mouth: arched opening
          const dd = s * 1.2;
          ng.append("path")
            .attr("d", `M ${-dd} ${dd * 0.4} L ${-dd} 0 Q ${-dd} ${-dd} 0 ${-dd} Q ${dd} ${-dd} ${dd} 0 L ${dd} ${dd * 0.4} Z`)
            .attr("fill", INK);
          break;
        }
        case "sanctuary": {
          // Small chapel with cross on top and arched door
          const hs = s * 0.9;
          ng.append("rect").attr("x", -hs * 0.7).attr("y", -hs * 0.3).attr("width", hs * 1.4).attr("height", hs * 1.1)
            .attr("fill", INK);
          ng.append("path")
            .attr("d", `M ${-hs * 0.85} ${-hs * 0.3} L 0 ${-hs * 1.1} L ${hs * 0.85} ${-hs * 0.3} Z`)
            .attr("fill", INK);
          // Arched door cutout on the front wall
          ng.append("path")
            .attr("d", `M ${-hs * 0.2} ${hs * 0.8} L ${-hs * 0.2} ${hs * 0.3} Q 0 ${hs * 0.05} ${hs * 0.2} ${hs * 0.3} L ${hs * 0.2} ${hs * 0.8}`)
            .attr("fill", "none").attr("stroke", "#fff").attr("stroke-width", 0.6).attr("opacity", 0.85);
          // Cross on roof peak
          ng.append("line").attr("x1", 0).attr("y1", -hs * 1.1).attr("x2", 0).attr("y2", -hs * 1.7)
            .attr("stroke", INK).attr("stroke-width", 0.9);
          ng.append("line").attr("x1", -hs * 0.3).attr("y1", -hs * 1.45).attr("x2", hs * 0.3).attr("y2", -hs * 1.45)
            .attr("stroke", INK).attr("stroke-width", 0.9);
          // Ground-shadow under the chapel
          ng.append("line")
            .attr("x1", -hs * 0.85).attr("y1", hs * 0.9).attr("x2", hs * 0.85).attr("y2", hs * 0.9)
            .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.4);
          break;
        }
        case "tower":
          ng.append("rect").attr("x", -2).attr("y", -s - 2).attr("width", 4).attr("height", s * 2 + 4)
            .attr("fill", INK);
          // Crenellation at top — 3 teeth
          for (let c = -1; c <= 1; c++) {
            ng.append("rect").attr("x", c * 1.6 - 0.7).attr("y", -s - 4.5).attr("width", 1.4).attr("height", 2.5)
              .attr("fill", INK);
          }
          // Arched door at base (cutout via light stroke)
          ng.append("path")
            .attr("d", `M -1.2 ${s + 2} L -1.2 ${s - 0.3} Q 0 ${s - 1.5} 1.2 ${s - 0.3} L 1.2 ${s + 2}`)
            .attr("fill", "none").attr("stroke", "#fff").attr("stroke-width", 0.5).attr("opacity", 0.75);
          // Small pennant on a pole atop the tower
          ng.append("line")
            .attr("x1", 0).attr("y1", -s - 4.5).attr("x2", 0).attr("y2", -s - 9)
            .attr("stroke", INK).attr("stroke-width", 0.6);
          ng.append("path")
            .attr("d", `M 0 ${-s - 9} L 4.5 ${-s - 8} L 0 ${-s - 7} Z`)
            .attr("fill", INK);
          // Thin ground-shadow stroke — seats the tower on its hex
          ng.append("line")
            .attr("x1", -3).attr("y1", s + 3).attr("x2", 3).attr("y2", s + 3)
            .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.35);
          break;
        case "ruin": {
          // Broken wall fragment
          const hs = s;
          ng.append("path")
            .attr("d", `M ${-hs} ${hs * 0.6} L ${-hs} ${-hs * 0.3} L ${-hs * 0.5} ${-hs * 0.7} L ${-hs * 0.2} ${-hs * 0.1} L ${hs * 0.3} ${-hs * 0.5} L ${hs * 0.7} ${-hs * 0.1} L ${hs} ${hs * 0.6} Z`)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.0);
          // Crack lines
          ng.append("line").attr("x1", 0).attr("y1", -hs * 0.2).attr("x2", 0).attr("y2", hs * 0.5)
            .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.6);
          break;
        }
        case "waypoint":
          // Standing stone / menhir
          ng.append("rect").attr("x", -1.5).attr("y", -s).attr("width", 3).attr("height", s * 1.8)
            .attr("fill", INK);
          ng.append("line").attr("x1", -s * 0.8).attr("y1", s * 0.8).attr("x2", s * 0.8).attr("y2", s * 0.8)
            .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.5);
          break;
        case "lair": {
          // Fanged cave mouth + scattered bones at the entrance
          const dd = s * 1.3;
          ng.append("path")
            .attr("d", `M ${-dd} ${dd * 0.5} L ${-dd} 0 Q ${-dd} ${-dd} 0 ${-dd} Q ${dd} ${-dd} ${dd} 0 L ${dd} ${dd * 0.5} L ${dd * 0.5} ${dd * 0.1} L ${dd * 0.2} ${dd * 0.5} L ${-dd * 0.2} ${dd * 0.1} L ${-dd * 0.5} ${dd * 0.5} Z`)
            .attr("fill", INK);
          [[-dd * 0.55, dd * 0.85], [dd * 0.15, dd * 0.95], [dd * 0.75, dd * 0.8]].forEach(([bx, by]) => {
            ng.append("ellipse")
              .attr("cx", bx).attr("cy", by).attr("rx", 1.3).attr("ry", 0.5)
              .attr("fill", INK).attr("opacity", 0.7);
          });
          break;
        }
        default:
          ng.append("circle").attr("r", 4).attr("fill", INK);
      }
    });
  },

  // --- Red labels ---
  renderLabels(ctx) {
    const { g, nodes, FONT, mulberry32, seedFromString } = ctx;
    const { INK, INK_LIGHT, LABEL_RED, PARCHMENT } = ctx.colors;

    const labelGroup = g.append("g").attr("class", "labels");

    nodes.forEach(node => {
      const isLocal = node.scale === "local";
      const isImportant = node.point_type === "heart" || node.point_type === "fortress";
      const fontSize = isLocal ? 10 : 13;
      const fontWeight = isImportant ? "bold" : "normal";
      const color = isLocal ? INK_LIGHT : LABEL_RED;
      const yOffset = isLocal ? 14 : 18;

      // Important nodes: offset the label and draw a thin leader line,
      // echoing the hand-drawn sketch convention "Town: Blackwater Crossing →"
      let lx = node.x, ly = node.y + yOffset;
      if (isImportant && !isLocal) {
        const rng = mulberry32(seedFromString(node.id + "-leader"));
        const angle = Math.PI * 0.45 + (rng() - 0.5) * 0.5;
        const dist = 42;
        lx = node.x + Math.cos(angle) * dist;
        ly = node.y + Math.sin(angle) * dist;
        // Leader line from just outside the node to just before the label
        const startX = node.x + Math.cos(angle) * 11;
        const startY = node.y + Math.sin(angle) * 11;
        const endX = lx - Math.cos(angle) * 6;
        const endY = ly - Math.sin(angle) * 6;
        labelGroup.append("line")
          .attr("x1", startX).attr("y1", startY)
          .attr("x2", endX).attr("y2", endY)
          .attr("stroke", INK)
          .attr("stroke-width", 0.5)
          .attr("opacity", 0.6);
      }

      labelGroup.append("text")
        .attr("x", lx)
        .attr("y", ly)
        .attr("text-anchor", "middle")
        .attr("font-family", FONT)
        .attr("font-size", fontSize + "px")
        .attr("font-weight", fontWeight)
        .attr("fill", color)
        .attr("stroke", PARCHMENT)
        .attr("stroke-width", 3)
        .attr("paint-order", "stroke")
        .text(node.name);
    });
  },

  // --- Day labels on paths ---
  renderDayLabels(ctx) {
    const { INK_LIGHT, PARCHMENT } = ctx.colors;
    MapCore.renderDayLabelsAlongLinks(ctx, {
      color: INK_LIGHT, strokeColor: PARCHMENT, fontSize: 9, offset: 8,
    });
  },

  // --- Compass rose ---
  renderCompass(ctx) {
    const { g, bounds, FONT } = ctx;
    const { INK } = ctx.colors;

    const x = bounds.maxX + 40;
    const y = bounds.minY - 20;
    const size = 26;

    const cg = g.append("g").attr("transform", `translate(${x}, ${y})`);

    // Outer circle
    cg.append("circle")
      .attr("cx", 0).attr("cy", 0).attr("r", size)
      .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.0).attr("opacity", 0.75);
    cg.append("circle")
      .attr("cx", 0).attr("cy", 0).attr("r", size * 0.32)
      .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.7).attr("opacity", 0.65);

    // Filled half-diamond pointers with cardinal labels
    const cardinals = [
      { dx: 0, dy: -1, label: "N" },
      { dx: 1, dy: 0, label: "E" },
      { dx: 0, dy: 1, label: "S" },
      { dx: -1, dy: 0, label: "W" },
    ];
    cardinals.forEach(({ dx, dy, label }) => {
      const tipX = dx * size, tipY = dy * size;
      const baseX = dx * size * 0.32, baseY = dy * size * 0.32;
      const perpX = -dy * size * 0.11, perpY = dx * size * 0.11;
      cg.append("path")
        .attr("d", `M ${baseX} ${baseY} L ${tipX} ${tipY} L ${(baseX + tipX) / 2 + perpX} ${(baseY + tipY) / 2 + perpY} Z`)
        .attr("fill", INK).attr("opacity", 0.85);
      cg.append("path")
        .attr("d", `M ${baseX} ${baseY} L ${tipX} ${tipY} L ${(baseX + tipX) / 2 - perpX} ${(baseY + tipY) / 2 - perpY} Z`)
        .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.7).attr("opacity", 0.8);
      const labelDist = size + 7;
      cg.append("text")
        .attr("x", dx * labelDist).attr("y", dy * labelDist + (dy === 0 ? 3 : 0))
        .attr("text-anchor", dx === 0 ? "middle" : dx > 0 ? "start" : "end")
        .attr("dominant-baseline", dy === 0 ? "middle" : dy > 0 ? "hanging" : "baseline")
        .attr("font-family", FONT)
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .attr("fill", INK).attr("opacity", 0.9)
        .text(label);
    });

    // Minor tick marks between cardinals
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI / 4) + Math.PI / 8;
      cg.append("line")
        .attr("x1", Math.cos(a) * size).attr("y1", Math.sin(a) * size)
        .attr("x2", Math.cos(a) * (size - 3)).attr("y2", Math.sin(a) * (size - 3))
        .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.6);
    }
    // Center fleur-de-lis marking North
    const fsz = 26;
    const fleurG = cg.append("g").attr("opacity", 0.9);
    fleurG.append("path")
      .attr("d", `M 0 ${-fsz * 0.25} L 0 ${fsz * 0.1}`)
      .attr("stroke", INK).attr("stroke-width", 1.0).attr("fill", "none");
    fleurG.append("path")
      .attr("d", `M 0 ${-fsz * 0.3} C -${fsz * 0.08} ${-fsz * 0.35}, -${fsz * 0.08} ${-fsz * 0.22}, 0 ${-fsz * 0.2} C ${fsz * 0.08} ${-fsz * 0.22}, ${fsz * 0.08} ${-fsz * 0.35}, 0 ${-fsz * 0.3} Z`)
      .attr("fill", INK);
    fleurG.append("path")
      .attr("d", `M 0 ${-fsz * 0.15} C -${fsz * 0.13} ${-fsz * 0.1}, -${fsz * 0.14} ${fsz * 0.02}, -${fsz * 0.05} ${fsz * 0.05}`)
      .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.9);
    fleurG.append("path")
      .attr("d", `M 0 ${-fsz * 0.15} C ${fsz * 0.13} ${-fsz * 0.1}, ${fsz * 0.14} ${fsz * 0.02}, ${fsz * 0.05} ${fsz * 0.05}`)
      .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.9);
    fleurG.append("line")
      .attr("x1", -fsz * 0.1).attr("y1", fsz * 0.05)
      .attr("x2", fsz * 0.1).attr("y2", fsz * 0.05)
      .attr("stroke", INK).attr("stroke-width", 1.0);
  },

  // --- Scale bar ---
  renderScaleBar(ctx) {
    const { g, bounds, HINT_SCALE, FONT } = ctx;
    const { INK, PARCHMENT } = ctx.colors;

    const milesPerInch = 6;
    const barSegments = 3; // 3 segments of 6 miles each = 18 miles
    const segLen = HINT_SCALE; // 1 inch = 100px
    const barW = barSegments * segLen;
    const barH = 6;
    const bx = bounds.maxX - barW - 10;
    const by = bounds.maxY + 30;

    const sg = g.append("g").attr("class", "scale-bar");

    // Alternating black/white segments
    for (let i = 0; i < barSegments; i++) {
      sg.append("rect")
        .attr("x", bx + i * segLen).attr("y", by)
        .attr("width", segLen).attr("height", barH)
        .attr("fill", i % 2 === 0 ? INK : PARCHMENT)
        .attr("stroke", INK).attr("stroke-width", 0.8);
    }

    // Tick labels
    for (let i = 0; i <= barSegments; i++) {
      sg.append("text")
        .attr("x", bx + i * segLen).attr("y", by + barH + 12)
        .attr("text-anchor", "middle")
        .attr("font-family", FONT)
        .attr("font-size", "8px")
        .attr("fill", INK)
        .text(i * milesPerInch);
    }

    // "miles" label — atlas-style lowercase with letter-spacing
    sg.append("text")
      .attr("x", bx + barW / 2).attr("y", by + barH + 24)
      .attr("text-anchor", "middle")
      .attr("font-family", FONT)
      .attr("font-size", "10px")
      .attr("font-style", "italic")
      .attr("letter-spacing", "2px")
      .attr("fill", INK)
      .text("miles");
    // Cartographic end-caps for a formal scale bar
    sg.append("line")
      .attr("x1", bx).attr("y1", by - 3).attr("x2", bx).attr("y2", by + barH + 3)
      .attr("stroke", INK).attr("stroke-width", 0.6);
    sg.append("line")
      .attr("x1", bx + barW).attr("y1", by - 3).attr("x2", bx + barW).attr("y2", by + barH + 3)
      .attr("stroke", INK).attr("stroke-width", 0.6);
  },

  /* ────────────────────────────────────────────────────────────
     Terrain symbol drawing helpers
     INK is passed explicitly so they stay pure functions.
     ──────────────────────────────────────────────────────────── */

  drawMountain(g, x, y, size, rng, INK) {
    const peakCount = 1 + Math.floor(rng() * 2);
    const baseSpacing = size * 0.7;
    const peaks = [];
    for (let i = 0; i < peakCount; i++) {
      const offsetX = (i - (peakCount - 1) / 2) * baseSpacing + (rng() - 0.5) * size * 0.15;
      const hMul = 0.75 + rng() * 0.35;
      peaks.push({ cx: x + offsetX, h: size * (0.7 + rng() * 0.25) * hMul });
    }
    // Render back-to-front so front peaks overlap back ones
    peaks.sort((a, b) => b.h - a.h);
    peaks.forEach(p => {
      const w = size * (0.9 + rng() * 0.25);
      const skew = (rng() - 0.5) * w * 0.12;
      const px = p.cx + skew;
      const py = y - p.h;
      // Shadow side (left) - filled
      g.append("path")
        .attr("d", `M ${p.cx - w/2} ${y} L ${px} ${py} L ${p.cx} ${y} Z`)
        .attr("fill", INK)
        .attr("stroke", "none");
      // Light side (right) - outline
      g.append("path")
        .attr("d", `M ${p.cx} ${y} L ${px} ${py} L ${p.cx + w/2} ${y}`)
        .attr("fill", "none")
        .attr("stroke", INK)
        .attr("stroke-width", 1.2)
        .attr("stroke-linejoin", "round");
      // Subtle ridge tick on the light side
      const midX = (px + p.cx + w/2) / 2;
      const midY = (py + y) / 2;
      g.append("line")
        .attr("x1", midX).attr("y1", midY)
        .attr("x2", midX + w * 0.08).attr("y2", midY + w * 0.05)
        .attr("stroke", INK)
        .attr("stroke-width", 0.5)
        .attr("opacity", 0.55);
    });
  },

  drawTree(g, x, y, size, rng, INK) {
    // Very faint ink wash behind the canopy cluster — forest-floor hint
    g.append("ellipse")
      .attr("cx", x).attr("cy", y)
      .attr("rx", size * 0.65).attr("ry", size * 0.5)
      .attr("fill", INK).attr("opacity", 0.04);
    // Small cluster of 1-2 egg-shaped canopies, sorted back-to-front
    const count = 1 + Math.floor(rng() * 2);
    const trees = [];
    for (let i = 0; i < count; i++) {
      trees.push({
        tx: x + (rng() - 0.5) * size * 0.9,
        ty: y + (rng() - 0.5) * size * 0.5,
        sz: size * (0.45 + rng() * 0.35),
      });
    }
    trees.sort((a, b) => a.ty - b.ty);
    const line = d3.line().curve(d3.curveBasisClosed);
    trees.forEach(t => {
      const rx = t.sz * (0.35 + rng() * 0.15);
      const ry = t.sz * (0.5 + rng() * 0.2);
      const points = [];
      for (let a = 0; a < Math.PI * 2; a += 0.2) {
        const r_x = rx;
        let r_y = ry;
        if (Math.sin(a) < 0) r_y *= 1.3;
        const wobble = 1 + (rng() - 0.5) * 0.15;
        points.push([t.tx + Math.cos(a) * r_x * wobble, t.ty + Math.sin(a) * r_y * wobble]);
      }
      g.append("path")
        .attr("d", line(points))
        .attr("fill", INK)
        .attr("stroke", "none")
        .attr("opacity", 0.82);
      g.append("line")
        .attr("x1", t.tx).attr("y1", t.ty + ry * 0.6)
        .attr("x2", t.tx).attr("y2", t.ty + ry * 0.6 + t.sz * 0.3)
        .attr("stroke", INK)
        .attr("stroke-width", 0.7)
        .attr("opacity", 0.85);
      // Thin shadow stroke under the trunk — grounds the tree on the map
      g.append("line")
        .attr("x1", t.tx - rx * 0.6).attr("y1", t.ty + ry * 0.6 + t.sz * 0.3 + 0.5)
        .attr("x2", t.tx + rx * 0.6).attr("y2", t.ty + ry * 0.6 + t.sz * 0.3 + 0.5)
        .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.3);
    });
  },

  drawSwampReeds(g, x, y, size, rng, INK) {
    // Subtle faint ink-wash ellipse — reads as a muddy pool under the ripples
    g.append("ellipse")
      .attr("cx", x).attr("cy", y)
      .attr("rx", size * 0.85).attr("ry", size * 0.5)
      .attr("fill", INK).attr("opacity", 0.06);
    // Layered water ripples with varying lengths and amplitudes
    const ripples = 4 + Math.floor(rng() * 2);
    for (let i = 0; i < ripples; i++) {
      const ly = y - size * 0.35 + i * size * 0.22 + (rng() - 0.5) * 2;
      const w = size * (0.7 + rng() * 0.5);
      const lx = x - w / 2 + (rng() - 0.5) * 3;
      const amp = size * (0.06 + rng() * 0.05);
      const d = `M ${lx} ${ly} Q ${lx + w * 0.25} ${ly - amp} ${lx + w * 0.5} ${ly} Q ${lx + w * 0.75} ${ly + amp} ${lx + w} ${ly}`;
      g.append("path")
        .attr("d", d)
        .attr("fill", "none")
        .attr("stroke", INK)
        .attr("stroke-width", 0.7)
        .attr("opacity", 0.5);
    }
    // Reed tufts: 2-3 clusters, each with 2-4 stalks + cattail tip
    const tufts = 2 + Math.floor(rng() * 2);
    for (let t = 0; t < tufts; t++) {
      const cx = x + (rng() - 0.5) * size * 0.9;
      const baseY = y + (rng() - 0.3) * size * 0.1;
      const stalks = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < stalks; i++) {
        const rx = cx + (i - (stalks - 1) / 2) * 1.4 + (rng() - 0.5) * 0.6;
        const topLean = (rng() - 0.5) * 1.5;
        const topY = baseY - size * (0.35 + rng() * 0.2);
        g.append("line")
          .attr("x1", rx).attr("y1", baseY)
          .attr("x2", rx + topLean).attr("y2", topY)
          .attr("stroke", INK).attr("stroke-width", 0.6).attr("opacity", 0.75);
        // Cattail head on some stalks
        if (rng() > 0.45) {
          g.append("ellipse")
            .attr("cx", rx + topLean).attr("cy", topY - 1.5)
            .attr("rx", 0.8).attr("ry", 1.6)
            .attr("fill", INK).attr("opacity", 0.75);
        }
      }
    }
  },

  drawGrassTuft(g, x, y, size, rng, INK) {
    // Multiple small tufts scattered around the hex center
    const tufts = 3 + Math.floor(rng() * 3);
    for (let t = 0; t < tufts; t++) {
      const tx0 = x + (rng() - 0.5) * size * 1.1;
      const ty0 = y + (rng() - 0.5) * size * 0.65;
      const blades = 3 + Math.floor(rng() * 2);
      const tuftLean = (rng() - 0.5) * 0.4;
      for (let i = 0; i < blades; i++) {
        const angle = -Math.PI / 2 + tuftLean + (i - blades / 2) * 0.3 + (rng() - 0.5) * 0.18;
        const len = size * (0.22 + rng() * 0.18);
        const txe = tx0 + Math.cos(angle) * len;
        const tye = ty0 + Math.sin(angle) * len;
        const cxe = tx0 + Math.cos(angle) * len * 0.5 + (rng() - 0.5) * 1.5;
        const cye = ty0 + Math.sin(angle) * len * 0.5;
        g.append("path")
          .attr("d", `M ${tx0} ${ty0} Q ${cxe} ${cye} ${txe} ${tye}`)
          .attr("fill", "none")
          .attr("stroke", INK)
          .attr("stroke-width", 0.6)
          .attr("opacity", 0.45);
      }
    }
  },

  drawHill(g, x, y, size, rng, INK) {
    // Cluster of 1-2 gentle humps back-to-front
    const count = 1 + Math.floor(rng() * 2);
    const spacing = size * 0.75;
    const humps = [];
    for (let i = 0; i < count; i++) {
      humps.push({
        cx: x + (i - (count - 1) / 2) * spacing + (rng() - 0.5) * size * 0.15,
        w: size * (0.85 + rng() * 0.4),
        h: size * (0.38 + rng() * 0.3),
      });
    }
    humps.sort((a, b) => b.h - a.h);
    humps.forEach(({ cx, w, h }) => {
      const peakOff = (rng() - 0.5) * w * 0.15;
      g.append("path")
        .attr("d", `M ${cx - w/2} ${y} Q ${cx - w/4 + peakOff} ${y - h} ${cx + peakOff} ${y - h} Q ${cx + w/4 + peakOff} ${y - h} ${cx + w/2} ${y}`)
        .attr("fill", "none")
        .attr("stroke", INK)
        .attr("stroke-width", 0.8)
        .attr("opacity", 0.55);
      if (rng() > 0.5) {
        const hx = cx + peakOff + w * 0.18;
        g.append("line")
          .attr("x1", hx).attr("y1", y - h * 0.55)
          .attr("x2", hx + w * 0.08).attr("y2", y - h * 0.05)
          .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.4);
      }
      // 1-2 short curved crown strokes along the crown — rolling-downs detail
      const crownStrokes = 1 + Math.floor(rng() * 2);
      for (let s = 0; s < crownStrokes; s++) {
        const t = (s + 1) / (crownStrokes + 1);
        const sx0 = cx - w * 0.3 + t * w * 0.18 + (rng() - 0.5);
        const sy0 = y - h * (0.55 + t * 0.2);
        const sx1 = sx0 + w * 0.2;
        const sy1 = sy0 - 1;
        g.append("path")
          .attr("d", `M ${sx0} ${sy0} Q ${(sx0 + sx1) / 2} ${sy0 - 1.5} ${sx1} ${sy1}`)
          .attr("fill", "none")
          .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.35);
      }
    });
  },

  drawFarm(g, x, y, size, rng, INK) {
    // 2-3 small farm buildings clustered + furrows on both sides
    const buildings = 2 + Math.floor(rng() * 2);
    const spacing = size * 0.45;
    const smokeIdx = Math.floor(buildings / 2);
    for (let b = 0; b < buildings; b++) {
      const bx = x + (b - (buildings - 1) / 2) * spacing + (rng() - 0.5) * 1;
      const by = y + (rng() - 0.5) * size * 0.2;
      const bw = size * (0.24 + rng() * 0.15);
      const bh = size * (0.17 + rng() * 0.12);
      g.append("rect")
        .attr("x", bx - bw / 2).attr("y", by - bh / 2)
        .attr("width", bw).attr("height", bh)
        .attr("fill", "none").attr("stroke", INK)
        .attr("stroke-width", 0.55).attr("opacity", 0.65);
      const roofPeakY = by - bh / 2 - bh * 0.8;
      g.append("path")
        .attr("d", `M ${bx - bw / 2 - 0.3} ${by - bh / 2} L ${bx} ${roofPeakY} L ${bx + bw / 2 + 0.3} ${by - bh / 2}`)
        .attr("fill", "none").attr("stroke", INK)
        .attr("stroke-width", 0.55).attr("opacity", 0.65);
      // Tiny smoke puff from the central farmhouse
      if (b === smokeIdx) {
        const sx = bx + bw * 0.15;
        const sy = roofPeakY;
        g.append("path")
          .attr("d", `M ${sx} ${sy} C ${sx - 1.5} ${sy - 2}, ${sx + 1.5} ${sy - 4}, ${sx - 0.5} ${sy - 6}`)
          .attr("fill", "none").attr("stroke", INK)
          .attr("stroke-width", 0.4).attr("stroke-linecap", "round")
          .attr("opacity", 0.45);
      }
    }
    // Furrows fanning out on both sides of the cluster
    const perSide = 3 + Math.floor(rng() * 2);
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < perSide; i++) {
        const fx = x + side * size * (0.6 + i * 0.18);
        g.append("line")
          .attr("x1", fx).attr("y1", y - size * 0.28)
          .attr("x2", fx).attr("y2", y + size * 0.28)
          .attr("stroke", INK).attr("stroke-width", 0.35).attr("opacity", 0.35);
      }
    }
  },

  // --- Cartouche (tactical/OSR style: plain boxed block at bottom-left) ---
  renderCartouche(ctx) {
    const { g, bounds, meta, FONT } = ctx;
    const { INK, PARCHMENT } = ctx.colors;

    const boxW = 200;
    const boxH = 48;
    const bx = bounds.minX - 10;
    const by = bounds.maxY - boxH + 40;

    // Outer box
    g.append("rect")
      .attr("x", bx).attr("y", by)
      .attr("width", boxW).attr("height", boxH)
      .attr("fill", PARCHMENT)
      .attr("stroke", INK)
      .attr("stroke-width", 1.5);

    // Inner border
    g.append("rect")
      .attr("x", bx + 3).attr("y", by + 3)
      .attr("width", boxW - 6).attr("height", boxH - 6)
      .attr("fill", "none")
      .attr("stroke", INK)
      .attr("stroke-width", 0.5);

    // Small hex-symbol flourish in each corner of the box — tactical/OSR touch
    const hexR = 4;
    const hexCorners = [
      [bx + 12, by + 12],
      [bx + boxW - 12, by + 12],
      [bx + 12, by + boxH - 12],
      [bx + boxW - 12, by + boxH - 12],
    ];
    hexCorners.forEach(([hx, hy]) => {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = (i * 60) * Math.PI / 180;
        pts.push(`${hx + Math.cos(a) * hexR},${hy + Math.sin(a) * hexR}`);
      }
      g.append("polygon")
        .attr("points", pts.join(" "))
        .attr("fill", "none")
        .attr("stroke", INK).attr("stroke-width", 0.6).attr("opacity", 0.6);
    });

    // Title
    g.append("text")
      .attr("x", bx + boxW / 2)
      .attr("y", by + 22)
      .attr("text-anchor", "middle")
      .attr("font-family", FONT)
      .attr("font-size", "14px")
      .attr("font-weight", "bold")
      .attr("letter-spacing", "2px")
      .attr("fill", INK)
      .text((meta.region || meta.campaign).toUpperCase());

    // Subtitle (world + era)
    const sub = [meta.world, meta.era].filter(Boolean).join(" \u2014 ");
    if (sub) {
      g.append("text")
        .attr("x", bx + boxW / 2)
        .attr("y", by + 38)
        .attr("text-anchor", "middle")
        .attr("font-family", FONT)
        .attr("font-size", "9px")
        .attr("font-style", "italic")
        .attr("fill", INK)
        .attr("opacity", 0.75)
        .text(sub);
    }
  },
};
