// thirdage.js — "Third Age" map style for Open World Map viewer
// Dense, engraving-like aesthetic inspired by Pauline Baynes'
// Map of Middle-earth. All rendering is self-contained;
// the host page supplies a render context (ctx).

window.MapStyles = window.MapStyles || {};

window.MapStyles.thirdage = {
  name: "Third Age",

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
    INK:            "#1a1610",
    INK_MID:        "#3a3428",
    INK_LIGHT:      "#5a4a3a",
    LABEL_RED:      "#8b2500",
    REGION_RED:     "#a03520",
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
    MapCore.renderRiver(ctx, ctx.colors.INK, 3);
    MapCore.renderRiverLabel(ctx, { color: ctx.colors.INK, strokeColor: ctx.colors.PARCHMENT });
    MapCore.renderBridges(ctx, { color: ctx.colors.INK, strokeWidth: 1.1, bridgeLen: 14 });
    MapCore.renderRoad(ctx, ctx.colors.INK, 2);
    MapCore.renderCrevasse(ctx, "#2a1f14", 3);
    this.renderLinks(ctx);
    this.renderTerrainSymbols(ctx);
    MapCore.renderRegionLabels(ctx, {
      color: ctx.colors.REGION_RED,
      strokeColor: ctx.colors.PARCHMENT,
      fontSize: 24,
      letterSpacing: "8px",
      opacity: 0.6,
      fontStyle: "normal",
    });
    this.renderNodes(ctx);
    this.renderRegionLabels(ctx);
    this.renderLabels(ctx);
    this.renderDayLabels(ctx);
    this.renderCompass(ctx);
    this.renderScaleBar(ctx);
    this.renderCartouche(ctx);
  },

  /* ────────────────────────────────────────────────────────────
     Individual render methods — ported from world.html
     with bare constants replaced by ctx.colors / ctx.*
     ──────────────────────────────────────────────────────────── */

  // --- Parchment background ---
  renderBackground(ctx) {
    const { g, defs, WIDTH, HEIGHT } = ctx;
    const { PARCHMENT, PARCHMENT_DARK } = ctx.colors;

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

  // --- Map border: double ruled line with corner flourishes ---
  renderBorder(ctx) {
    const { g, bounds } = ctx;
    const { INK } = ctx.colors;
    const pad = 40;
    const x = bounds.minX - pad, y = bounds.minY - pad;
    const w = bounds.maxX - bounds.minX + pad * 2;
    const h = bounds.maxY - bounds.minY + pad * 2;

    g.append("rect")
      .attr("x", x).attr("y", y).attr("width", w).attr("height", h)
      .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.6).attr("opacity", 0.45);
    g.append("rect")
      .attr("x", x + 5).attr("y", y + 5).attr("width", w - 10).attr("height", h - 10)
      .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.35).attr("opacity", 0.35);

    // Corner flourishes: small filled diamonds
    [[x + 5, y + 5], [x + w - 5, y + 5], [x + 5, y + h - 5], [x + w - 5, y + h - 5]].forEach(([cx, cy]) => {
      g.append("path")
        .attr("d", `M ${cx} ${cy - 3} L ${cx + 3} ${cy} L ${cx} ${cy + 3} L ${cx - 3} ${cy} Z`)
        .attr("fill", INK).attr("opacity", 0.45);
    });
  },

  // --- Path / link rendering ---
  renderLinks(ctx) {
    const { g, links } = ctx;
    const { INK } = ctx.colors;
    const mulberry32 = ctx.mulberry32;
    const seedFromString = ctx.seedFromString;

    const linkGroup = g.append("g").attr("class", "links");

    links.forEach(link => {
      const sx = link.source.x, sy = link.source.y;
      const tx = link.target.x, ty = link.target.y;

      const dx = tx - sx, dy = ty - sy;
      const len = Math.sqrt(dx * dx + dy * dy);
      const rng = mulberry32(seedFromString(link.name || "link"));
      const curvature = (rng() - 0.5) * len * 0.15;
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
          path.attr("stroke-width", 2.3).attr("opacity", 0.9);
          break;
        case "trail":
          path.attr("stroke-width", 1.5).attr("stroke-dasharray", "8 4").attr("opacity", 0.8);
          break;
        case "wilderness":
          path.attr("stroke-width", 1.0).attr("stroke-dasharray", "3 5").attr("opacity", 0.6);
          break;
        default:
          path.attr("stroke-width", 1.5);
      }
    });
  },

  // --- Terrain symbol placement (dense, multiple clusters) ---
  renderTerrainSymbols(ctx) {
    const { g } = ctx;
    const { INK } = ctx.colors;

    const terrainGroup = g.append("g").attr("class", "terrain");

    // Draw terrain from hex_terrain data
    const style = this;
    MapCore.renderHexTerrain(ctx, {
      "forested-hills": (tg, x, y, sz, rng) => style.drawHill(tg, x, y, sz, rng, INK),
      "hills": (tg, x, y, sz, rng) => style.drawHill(tg, x, y, sz, rng, INK),
      "swamp": (tg, x, y, sz, rng) => style.drawSwampLines(tg, x, y, sz, rng, INK),
      "farmland": (tg, x, y, sz, rng) => style.drawFarm(tg, x, y, sz, rng, INK),
      "plains": (tg, x, y, sz, rng) => style.drawGrassStipple(tg, x, y, sz, rng, INK),
      "graveyard": (tg, x, y, sz, rng) => style.drawGraveyard(tg, x, y, sz, rng, INK),
    });
    MapCore.renderMountainsWithElevation(ctx,
      (tg, x, y, sz, rng) => style.drawMountainRange(tg, x, y, sz, rng, INK),
      (tg, x, y, sz, rng) => style.drawHill(tg, x, y, sz, rng, INK));
    MapCore.renderForestEdgeTrees(ctx,
      (tg, x, y, sz, rng) => style.drawForestHatch(tg, x, y, sz, rng, INK),
      ["forest", "forested-hills"]);
    MapCore.renderTerrainEdges(ctx, ["forest", "forested-hills"], {
      color: INK, strokeWidth: 1.1, opacity: 0.6, wobble: 2.0, className: "forest-edges",
    });
  },

  drawGraveyard(g, x, y, size, rng, INK) {
    const count = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const gx = x + (rng() - 0.5) * size * 1.1;
      const gy = y + (rng() - 0.5) * size * 0.6;
      const gh = size * (0.3 + rng() * 0.15);
      const gw = gh * 0.55;
      if (rng() > 0.55) {
        g.append("line")
          .attr("x1", gx).attr("y1", gy - gh * 0.45)
          .attr("x2", gx).attr("y2", gy + gh * 0.45)
          .attr("stroke", INK).attr("stroke-width", 0.8).attr("opacity", 0.8);
        g.append("line")
          .attr("x1", gx - gw * 0.5).attr("y1", gy - gh * 0.2)
          .attr("x2", gx + gw * 0.5).attr("y2", gy - gh * 0.2)
          .attr("stroke", INK).attr("stroke-width", 0.8).attr("opacity", 0.8);
      } else {
        // Solid filled tombstone (engraving style)
        g.append("path")
          .attr("d", `M ${gx - gw / 2} ${gy + gh * 0.45} L ${gx - gw / 2} ${gy - gh * 0.15} Q ${gx} ${gy - gh * 0.55} ${gx + gw / 2} ${gy - gh * 0.15} L ${gx + gw / 2} ${gy + gh * 0.45} Z`)
          .attr("fill", INK).attr("opacity", 0.75);
      }
      // Occasional burial-mound ground line beneath the marker
      if (rng() > 0.65) {
        g.append("line")
          .attr("x1", gx - gw * 0.7).attr("y1", gy + gh * 0.5)
          .attr("x2", gx + gw * 0.7).attr("y2", gy + gh * 0.5)
          .attr("stroke", INK).attr("stroke-width", 0.45).attr("opacity", 0.5);
      }
    }
  },

  // --- Node icons ---
  renderNodes(ctx) {
    const { g, nodes } = ctx;
    const { INK, PARCHMENT } = ctx.colors;

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

      // Farm override — cute farmhouse for any farm-named node
      if (node.name && node.name.toLowerCase().includes("farm")) {
        // House body
        ng.append("rect").attr("x", -s).attr("y", -s*0.5).attr("width", s*2).attr("height", s*1.5)
          .attr("fill", INK).attr("stroke", "none");
        // Roof (triangle)
        ng.append("path")
          .attr("d", `M ${-s-1} ${-s*0.5} L 0 ${-s*1.5} L ${s+1} ${-s*0.5} Z`)
          .attr("fill", INK).attr("stroke", "none");
        // Chimney
        ng.append("rect").attr("x", s*0.3).attr("y", -s*1.3).attr("width", s*0.4).attr("height", s*0.5)
          .attr("fill", INK).attr("stroke", "none");
        // Door
        ng.append("rect").attr("x", -s*0.25).attr("y", s*0.1).attr("width", s*0.5).attr("height", s*0.9)
          .attr("fill", PARCHMENT).attr("stroke", "none");
        // Small field lines to the right
        for (let fi = 0; fi < 3; fi++) {
          ng.append("line")
            .attr("x1", s + 3 + fi * 3).attr("y1", s*0.5)
            .attr("x2", s + 3 + fi * 3).attr("y2", s*1.0)
            .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.5);
        }
      } else switch (node.point_type) {
        case "heart": {
          // Main town — cluster of filled houses with a tiny spire at center
          const hs = 4;
          const positions = [{x:0, y:0}, {x:-hs*1.3, y:hs*0.2}, {x:hs*1.3, y:hs*0.1}, {x:-hs*0.5, y:-hs*0.8}, {x:hs*0.6, y:-hs*0.7}];
          positions.forEach((p, idx) => {
            ng.append("rect").attr("x", p.x - hs*0.45).attr("y", p.y - hs*0.2).attr("width", hs*0.9).attr("height", hs*0.65)
              .attr("fill", INK).attr("stroke", "none");
            ng.append("path")
              .attr("d", `M ${p.x - hs*0.55} ${p.y - hs*0.2} L ${p.x} ${p.y - hs*0.75} L ${p.x + hs*0.55} ${p.y - hs*0.2} Z`)
              .attr("fill", INK).attr("stroke", "none");
            // Smoke plume on two of the outer houses — inhabited capital
            if (idx === 1 || idx === 2) {
              const sx = p.x + hs * 0.18;
              const sy = p.y - hs * 0.75;
              ng.append("path")
                .attr("d", `M ${sx} ${sy} C ${sx - hs * 0.25} ${sy - hs * 0.4}, ${sx + hs * 0.25} ${sy - hs * 0.7}, ${sx - hs * 0.05} ${sy - hs * 1.1}`)
                .attr("fill", "none").attr("stroke", INK)
                .attr("stroke-width", 0.55).attr("stroke-linecap", "round")
                .attr("opacity", 0.55);
            }
          });
          // Central spire (cathedral/keep) rising above the cluster
          ng.append("rect").attr("x", -0.8).attr("y", -hs*1.5).attr("width", 1.6).attr("height", hs*0.75)
            .attr("fill", INK).attr("stroke", "none");
          ng.append("path")
            .attr("d", `M ${-1.3} ${-hs*1.5} L 0 ${-hs*2.05} L 1.3 ${-hs*1.5} Z`)
            .attr("fill", INK).attr("stroke", "none");
          // Tiny cross-bar near spire top
          ng.append("line")
            .attr("x1", -1).attr("y1", -hs*1.75).attr("x2", 1).attr("y2", -hs*1.75)
            .attr("stroke", INK).attr("stroke-width", 0.7);
          // Faint walled-town oval — matches hand-drawn convention for capital
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
          const hs = 5;
          // Main wall (filled)
          ng.append("rect").attr("x", -hs).attr("y", -hs*0.4).attr("width", hs*2).attr("height", hs*0.9)
            .attr("fill", INK).attr("stroke", "none");
          // Left tower (filled)
          ng.append("rect").attr("x", -hs - hs*0.3).attr("y", -hs).attr("width", hs*0.6).attr("height", hs*1.5)
            .attr("fill", INK).attr("stroke", "none");
          // Right tower (filled)
          ng.append("rect").attr("x", hs - hs*0.3).attr("y", -hs).attr("width", hs*0.6).attr("height", hs*1.5)
            .attr("fill", INK).attr("stroke", "none");
          // Crenellations on left tower
          for (let ci = 0; ci < 2; ci++) {
            ng.append("rect").attr("x", -hs - hs*0.2 + ci * hs*0.3).attr("y", -hs - hs*0.2).attr("width", hs*0.2).attr("height", hs*0.2)
              .attr("fill", INK).attr("stroke", "none");
          }
          // Crenellations on right tower
          for (let ci = 0; ci < 2; ci++) {
            ng.append("rect").attr("x", hs - hs*0.2 + ci * hs*0.3).attr("y", -hs - hs*0.2).attr("width", hs*0.2).attr("height", hs*0.2)
              .attr("fill", INK).attr("stroke", "none");
          }
          // Gate arch (cutout on filled wall)
          ng.append("path")
            .attr("d", `M ${-hs*0.25} ${hs*0.5} L ${-hs*0.25} ${hs*0.1} A ${hs*0.25} ${hs*0.25} 0 0 1 ${hs*0.25} ${hs*0.1} L ${hs*0.25} ${hs*0.5} Z`)
            .attr("fill", PARCHMENT).attr("stroke", "none");
          // Pennant on a pole atop the right tower
          const pX = hs, pTop = -hs - hs * 0.55;
          ng.append("line")
            .attr("x1", pX).attr("y1", -hs - hs * 0.2).attr("x2", pX).attr("y2", pTop)
            .attr("stroke", INK).attr("stroke-width", 0.6);
          ng.append("path")
            .attr("d", `M ${pX} ${pTop} L ${pX + hs * 0.55} ${pTop + hs * 0.13} L ${pX} ${pTop + hs * 0.26} Z`)
            .attr("fill", INK).attr("opacity", 0.85);
          // Ground-shadow beneath the castle walls
          ng.append("line")
            .attr("x1", -hs - 1).attr("y1", hs * 0.5 + 2).attr("x2", hs + 1).attr("y2", hs * 0.5 + 2)
            .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.4);
          break;
        }
        case "tavern": {
          const hs = isLocal ? 2 : 3.5;
          // Building body (filled)
          ng.append("rect").attr("x", -hs*0.7).attr("y", -hs*0.3).attr("width", hs*1.4).attr("height", hs)
            .attr("fill", INK).attr("stroke", "none");
          // Roof (filled)
          ng.append("path")
            .attr("d", `M ${-hs*0.8} ${-hs*0.3} L 0 ${-hs*1.1} L ${hs*0.8} ${-hs*0.3} Z`)
            .attr("fill", INK).attr("stroke", "none");
          // Arched door cutout against the filled wall
          ng.append("path")
            .attr("d", `M ${-hs*0.22} ${hs*0.7} L ${-hs*0.22} ${hs*0.25} Q 0 ${hs*0.02} ${hs*0.22} ${hs*0.25} L ${hs*0.22} ${hs*0.7}`)
            .attr("fill", "none").attr("stroke", PARCHMENT).attr("stroke-width", 0.5).attr("opacity", 0.85);
          // Hanging sign — arm + two short chains + filled board
          ng.append("line").attr("x1", hs*0.7).attr("y1", -hs*0.1).attr("x2", hs*1.2).attr("y2", -hs*0.1)
            .attr("stroke", INK).attr("stroke-width", 0.5);
          ng.append("line").attr("x1", hs*1.05).attr("y1", -hs*0.1).attr("x2", hs*1.05).attr("y2", -hs*0.03)
            .attr("stroke", INK).attr("stroke-width", 0.4);
          ng.append("line").attr("x1", hs*1.45).attr("y1", -hs*0.1).attr("x2", hs*1.45).attr("y2", -hs*0.03)
            .attr("stroke", INK).attr("stroke-width", 0.4);
          ng.append("rect").attr("x", hs*1.0).attr("y", -hs*0.03).attr("width", hs*0.5).attr("height", hs*0.38)
            .attr("fill", INK).attr("stroke", "none").attr("opacity", 0.65);
          break;
        }
        case "settlement": {
          // Cluster of 2-3 tiny filled houses with a smoke plume from the central one
          const hs = isLocal ? 2 : 3.5;
          const houseCount = isLocal ? 2 : 3;
          const smokeFromIdx = Math.floor(houseCount / 2);
          for (let hi = 0; hi < houseCount; hi++) {
            const hx = (hi - (houseCount-1)/2) * hs * 1.4;
            const hy = (hi % 2) * hs * 0.3;
            ng.append("rect").attr("x", hx - hs*0.6).attr("y", hy - hs*0.3).attr("width", hs*1.2).attr("height", hs*0.9)
              .attr("fill", INK).attr("stroke", "none");
            ng.append("path")
              .attr("d", `M ${hx - hs*0.7} ${hy - hs*0.3} L ${hx} ${hy - hs} L ${hx + hs*0.7} ${hy - hs*0.3} Z`)
              .attr("fill", INK).attr("stroke", "none");
            if (hi === smokeFromIdx) {
              const sx = hx + hs * 0.2;
              const sy = hy - hs;
              ng.append("path")
                .attr("d", `M ${sx} ${sy} C ${sx - hs*0.3} ${sy - hs*0.45}, ${sx + hs*0.3} ${sy - hs*0.85}, ${sx - hs*0.1} ${sy - hs*1.35}`)
                .attr("fill", "none").attr("stroke", INK)
                .attr("stroke-width", 0.6).attr("stroke-linecap", "round")
                .attr("opacity", 0.6);
            }
          }
          break;
        }
        case "wilderness":
          // Open circle with a small tree inside — "wild place"
          ng.append("circle").attr("r", s).attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.2);
          ng.append("path")
            .attr("d", `M ${-s * 0.45} ${s * 0.15} L 0 ${-s * 0.5} L ${s * 0.45} ${s * 0.15} Z`)
            .attr("fill", INK);
          ng.append("line")
            .attr("x1", 0).attr("y1", s * 0.15).attr("x2", 0).attr("y2", s * 0.5)
            .attr("stroke", INK).attr("stroke-width", 0.8);
          break;
        case "dungeon": {
          // Cave mouth — arched black opening (consistent with other styles)
          const dd = s * 1.3;
          ng.append("path")
            .attr("d", `M ${-dd} ${dd * 0.4} L ${-dd} 0 Q ${-dd} ${-dd} 0 ${-dd} Q ${dd} ${-dd} ${dd} 0 L ${dd} ${dd * 0.4} Z`)
            .attr("fill", INK).attr("stroke", "none");
          break;
        }
        case "sanctuary": {
          // Small filled chapel with arched door and cross on top
          const hs = s * 0.9;
          ng.append("rect").attr("x", -hs * 0.65).attr("y", -hs * 0.25).attr("width", hs * 1.3).attr("height", hs * 0.95)
            .attr("fill", INK).attr("stroke", "none");
          ng.append("path")
            .attr("d", `M ${-hs * 0.8} ${-hs * 0.25} L 0 ${-hs} L ${hs * 0.8} ${-hs * 0.25} Z`)
            .attr("fill", INK).attr("stroke", "none");
          // Arched door cutout (parchment) on the front wall
          ng.append("path")
            .attr("d", `M ${-hs * 0.2} ${hs * 0.7} L ${-hs * 0.2} ${hs * 0.25} Q 0 ${hs * 0.02} ${hs * 0.2} ${hs * 0.25} L ${hs * 0.2} ${hs * 0.7}`)
            .attr("fill", "none").attr("stroke", PARCHMENT).attr("stroke-width", 0.55).attr("opacity", 0.85);
          // Cross above roof
          ng.append("line").attr("x1", 0).attr("y1", -hs).attr("x2", 0).attr("y2", -hs * 1.55)
            .attr("stroke", INK).attr("stroke-width", 0.9);
          ng.append("line").attr("x1", -hs * 0.3).attr("y1", -hs * 1.3).attr("x2", hs * 0.3).attr("y2", -hs * 1.3)
            .attr("stroke", INK).attr("stroke-width", 0.9);
          // Ground-shadow under the chapel
          ng.append("line")
            .attr("x1", -hs * 0.8).attr("y1", hs * 0.78).attr("x2", hs * 0.8).attr("y2", hs * 0.78)
            .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.4);
          break;
        }
        case "tower":
          ng.append("rect").attr("x", -2).attr("y", -s - 2).attr("width", 4).attr("height", s * 2 + 4)
            .attr("fill", INK).attr("stroke", "none");
          // Crenellated top (wider rectangle for battlement)
          ng.append("rect").attr("x", -3.5).attr("y", -s - 4).attr("width", 7).attr("height", 2)
            .attr("fill", INK);
          // Arched door at base (cut out with a parchment-stroke)
          ng.append("path")
            .attr("d", `M -1.2 ${s + 2} L -1.2 ${s - 0.3} Q 0 ${s - 1.5} 1.2 ${s - 0.3} L 1.2 ${s + 2}`)
            .attr("fill", "none").attr("stroke", PARCHMENT).attr("stroke-width", 0.5).attr("opacity", 0.85);
          // Pennant on a pole atop the tower
          ng.append("line")
            .attr("x1", 0).attr("y1", -s - 4).attr("x2", 0).attr("y2", -s - 8.5)
            .attr("stroke", INK).attr("stroke-width", 0.6);
          ng.append("path")
            .attr("d", `M 0 ${-s - 8.5} L 4.5 ${-s - 7.5} L 0 ${-s - 6.5} Z`)
            .attr("fill", INK);
          // Ground-shadow under the tower
          ng.append("line")
            .attr("x1", -3).attr("y1", s + 3).attr("x2", 3).attr("y2", s + 3)
            .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.4);
          break;
        case "ruin": {
          // Broken wall fragment with crack — matches hexcrawl ruin style
          const rs = s;
          ng.append("path")
            .attr("d", `M ${-rs} ${rs * 0.6} L ${-rs} ${-rs * 0.3} L ${-rs * 0.5} ${-rs * 0.7} L ${-rs * 0.2} ${-rs * 0.1} L ${rs * 0.3} ${-rs * 0.5} L ${rs * 0.7} ${-rs * 0.1} L ${rs} ${rs * 0.6} Z`)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.0);
          ng.append("line").attr("x1", 0).attr("y1", -rs * 0.2).attr("x2", 0).attr("y2", rs * 0.5)
            .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.6);
          break;
        }
        case "waypoint":
          // Standing stone / menhir with a ground line
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
              .attr("fill", INK).attr("opacity", 0.75);
          });
          break;
        }
        default:
          ng.append("circle").attr("r", 4).attr("fill", INK);
      }
    });
  },

  // --- Labels (red, letter-spaced for important places) ---
  renderLabels(ctx) {
    const { g, nodes, FONT } = ctx;
    const { INK_LIGHT, LABEL_RED, PARCHMENT } = ctx.colors;

    const labelGroup = g.append("g").attr("class", "labels");

    nodes.forEach(node => {
      const isLocal = node.scale === "local";
      const isRegion = node.point_type === "heart" || node.point_type === "fortress";
      const fontSize = isLocal ? 10 : (isRegion ? 16 : 13);
      const fontWeight = isRegion ? "bold" : "normal";
      const color = isLocal ? INK_LIGHT : LABEL_RED;
      const yOffset = isLocal ? 14 : 20;

      const text = labelGroup.append("text")
        .attr("x", node.x)
        .attr("y", node.y + yOffset)
        .attr("text-anchor", "middle")
        .attr("font-family", FONT)
        .attr("font-size", fontSize + "px")
        .attr("font-weight", fontWeight)
        .attr("fill", color)
        .attr("stroke", PARCHMENT)
        .attr("stroke-width", 3)
        .attr("paint-order", "stroke")
        .text(node.name);

      if (isRegion && !isLocal) {
        text.attr("letter-spacing", "3px");
      }
    });
  },

  // --- Region labels (large ghosted text) ---
  renderRegionLabels(ctx) {
    const { g, nodes, meta, FONT } = ctx;
    const { LABEL_RED } = ctx.colors;

    const regionLabelGroup = g.append("g").attr("class", "region-labels");

    // Large spread-out labels for heart/fortress nodes (major regions)
    // Skip if the node name matches the campaign region (rendered as central watermark)
    const regionName = (meta && meta.region) ? meta.region.toUpperCase() : "";
    nodes.forEach(node => {
      if (node.point_type !== "heart" && node.point_type !== "fortress") return;
      if (node.scale === "local") return;
      if (node.name.toUpperCase() === regionName) return;

      regionLabelGroup.append("text")
        .attr("x", node.x)
        .attr("y", node.y - 50)
        .attr("text-anchor", "middle")
        .attr("font-family", FONT)
        .attr("font-size", "24px")
        .attr("font-weight", "normal")
        .attr("letter-spacing", "10px")
        .attr("text-transform", "uppercase")
        .attr("fill", LABEL_RED)
        .attr("opacity", 0.15)
        .text(node.name.toUpperCase());
    });

    // Campaign region name centered on the map
    if (meta && meta.region) {
      const cx = d3.mean(nodes, d => d.x);
      const cy = d3.mean(nodes, d => d.y);

      regionLabelGroup.append("text")
        .attr("x", cx)
        .attr("y", cy)
        .attr("text-anchor", "middle")
        .attr("font-family", FONT)
        .attr("font-size", "32px")
        .attr("font-weight", "normal")
        .attr("letter-spacing", "15px")
        .attr("text-transform", "uppercase")
        .attr("fill", LABEL_RED)
        .attr("opacity", 0.12)
        .text(meta.region.toUpperCase());
    }
  },

  // --- Day labels on paths ---
  renderDayLabels(ctx) {
    const { INK_LIGHT, PARCHMENT } = ctx.colors;
    MapCore.renderDayLabelsAlongLinks(ctx, {
      color: INK_LIGHT, strokeColor: PARCHMENT, fontSize: 9, fontStyle: "normal", offset: 8,
    });
  },

  // --- Ornate compass rose (red, like the published map) ---
  renderCompass(ctx) {
    const { g, bounds, FONT } = ctx;
    const { LABEL_RED } = ctx.colors;

    const x = bounds.maxX + 70;
    const y = bounds.minY - 30;

    const cg = g.append("g")
      .attr("transform", `translate(${x}, ${y})`)
      .attr("opacity", 0.75);

    const size = 40;

    // Outer circles
    cg.append("circle").attr("r", size * 1.2)
      .attr("fill", "none").attr("stroke", LABEL_RED).attr("stroke-width", 1.0);
    cg.append("circle").attr("r", size * 1.15)
      .attr("fill", "none").attr("stroke", LABEL_RED).attr("stroke-width", 0.4);

    // North (filled red)
    cg.append("path")
      .attr("d", `M 0 ${-size} L ${size * 0.12} ${-size * 0.2} L 0 ${-size * 0.1} L ${-size * 0.12} ${-size * 0.2} Z`)
      .attr("fill", LABEL_RED);
    // South
    cg.append("path")
      .attr("d", `M 0 ${size} L ${size * 0.12} ${size * 0.2} L 0 ${size * 0.1} L ${-size * 0.12} ${size * 0.2} Z`)
      .attr("fill", "none").attr("stroke", LABEL_RED).attr("stroke-width", 0.8);
    // East
    cg.append("path")
      .attr("d", `M ${size} 0 L ${size * 0.2} ${-size * 0.12} L ${size * 0.1} 0 L ${size * 0.2} ${size * 0.12} Z`)
      .attr("fill", "none").attr("stroke", LABEL_RED).attr("stroke-width", 0.8);
    // West
    cg.append("path")
      .attr("d", `M ${-size} 0 L ${-size * 0.2} ${-size * 0.12} L ${-size * 0.1} 0 L ${-size * 0.2} ${size * 0.12} Z`)
      .attr("fill", "none").attr("stroke", LABEL_RED).attr("stroke-width", 0.8);

    // Intercardinal lines
    const ic = size * 0.6;
    const diag = ic * 0.707;
    [[diag, -diag], [diag, diag], [-diag, diag], [-diag, -diag]].forEach(([dx, dy]) => {
      cg.append("line")
        .attr("x1", dx * 0.15).attr("y1", dy * 0.15)
        .attr("x2", dx).attr("y2", dy)
        .attr("stroke", LABEL_RED).attr("stroke-width", 0.5);
    });

    // Cardinal labels
    [["N", 0, -size - 8], ["S", 0, size + 12], ["E", size + 8, 4], ["W", -size - 8, 4]].forEach(([t, lx, ly]) => {
      cg.append("text")
        .attr("x", lx).attr("y", ly)
        .attr("text-anchor", "middle")
        .attr("font-family", FONT)
        .attr("font-size", "11px")
        .attr("font-weight", "bold")
        .attr("fill", LABEL_RED)
        .text(t);
    });
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
    // Cartographic end-caps
    sg.append("line")
      .attr("x1", bx).attr("y1", by - 3).attr("x2", bx).attr("y2", by + barH + 3)
      .attr("stroke", INK).attr("stroke-width", 0.6);
    sg.append("line")
      .attr("x1", bx + barW).attr("y1", by - 3).attr("x2", bx + barW).attr("y2", by + barH + 3)
      .attr("stroke", INK).attr("stroke-width", 0.6);
  },

  // --- Title cartouche (ornate box) ---
  renderCartouche(ctx) {
    const { g, bounds, meta, FONT } = ctx;
    const { INK, INK_LIGHT, PARCHMENT } = ctx.colors;

    const boxW = 200;
    const boxH = 70;
    const bx = bounds.minX - 20;
    const by = bounds.maxY - boxH + 30;

    g.append("rect")
      .attr("x", bx).attr("y", by)
      .attr("width", boxW).attr("height", boxH)
      .attr("fill", PARCHMENT)
      .attr("stroke", INK)
      .attr("stroke-width", 1.5);

    g.append("rect")
      .attr("x", bx + 3).attr("y", by + 3)
      .attr("width", boxW - 6).attr("height", boxH - 6)
      .attr("fill", "none")
      .attr("stroke", INK)
      .attr("stroke-width", 0.5);

    // Decorative line between title and subtitle, flanked by tiny diamond flourishes
    const midY = by + 35;
    g.append("line")
      .attr("x1", bx + 26).attr("y1", midY)
      .attr("x2", bx + boxW - 26).attr("y2", midY)
      .attr("stroke", INK).attr("stroke-width", 0.4);
    // Left flourish
    g.append("path")
      .attr("d", `M ${bx + 20} ${midY} L ${bx + 23} ${midY - 3} L ${bx + 26} ${midY} L ${bx + 23} ${midY + 3} Z`)
      .attr("fill", INK).attr("opacity", 0.7);
    // Right flourish
    g.append("path")
      .attr("d", `M ${bx + boxW - 20} ${midY} L ${bx + boxW - 23} ${midY - 3} L ${bx + boxW - 26} ${midY} L ${bx + boxW - 23} ${midY + 3} Z`)
      .attr("fill", INK).attr("opacity", 0.7);

    g.append("text")
      .attr("x", bx + boxW / 2)
      .attr("y", by + 28)
      .attr("text-anchor", "middle")
      .attr("font-family", FONT)
      .attr("font-size", "15px")
      .attr("font-weight", "bold")
      .attr("letter-spacing", "3px")
      .attr("fill", INK)
      .text(meta.region ? meta.region.toUpperCase() : meta.campaign.toUpperCase());

    g.append("text")
      .attr("x", bx + boxW / 2)
      .attr("y", by + 50)
      .attr("text-anchor", "middle")
      .attr("font-family", FONT)
      .attr("font-size", "9px")
      .attr("font-style", "italic")
      .attr("fill", INK_LIGHT)
      .text(meta.world + (meta.era ? " \u2014 " + meta.era : ""));

    if (meta.world) {
      g.append("text")
        .attr("x", bx + boxW / 2)
        .attr("y", by + 62)
        .attr("text-anchor", "middle")
        .attr("font-family", FONT)
        .attr("font-size", "7px")
        .attr("font-style", "italic")
        .attr("fill", INK_LIGHT)
        .attr("opacity", 0.6)
        .text("A Map of " + (meta.region || meta.campaign));
    }
  },

  /* ────────────────────────────────────────────────────────────
     Terrain symbol drawing helpers
     INK is passed explicitly so they stay pure functions.
     ──────────────────────────────────────────────────────────── */

  // Dense engraving-style mountain range: 1-3 overlapping sharp peaks
  drawMountainRange(g, x, y, size, rng, INK) {
    const peakCount = 1 + Math.floor(rng() * 2);
    const spacing = size * 0.7;
    const peaks = [];
    for (let i = 0; i < peakCount; i++) {
      const offsetX = (i - (peakCount - 1) / 2) * spacing + (rng() - 0.5) * size * 0.12;
      const hMul = 0.75 + rng() * 0.4;
      peaks.push({ cx: x + offsetX, h: size * (0.85 + rng() * 0.25) * hMul });
    }
    peaks.sort((a, b) => b.h - a.h);

    peaks.forEach(p => {
      const w = size * (0.85 + rng() * 0.25);
      const skew = (rng() - 0.5) * w * 0.08;
      const peakX = p.cx + skew;
      const peakY = y - p.h;

      // Solid shadow side (left half)
      g.append("path")
        .attr("d", `M ${p.cx - w/2} ${y} L ${peakX} ${peakY} L ${p.cx} ${y} Z`)
        .attr("fill", INK)
        .attr("stroke", "none");

      // Fine engraved hatching inside the shadow side (classic atlas look)
      const hatchCount = 3 + Math.floor(rng() * 2);
      for (let i = 0; i < hatchCount; i++) {
        const t = (i + 1) / (hatchCount + 1);
        const hx = (p.cx - w / 2) + (peakX - (p.cx - w / 2)) * t;
        const hy = y + (peakY - y) * t;
        // Short diagonal line toward the base of the peak
        const endX = hx + w * 0.05;
        const endY = y;
        g.append("line")
          .attr("x1", hx).attr("y1", hy)
          .attr("x2", endX).attr("y2", endY)
          .attr("stroke", "#f4e8d1")
          .attr("stroke-width", 0.35).attr("opacity", 0.35);
      }

      // Light side outline (right half)
      g.append("path")
        .attr("d", `M ${p.cx} ${y} L ${peakX} ${peakY} L ${p.cx + w/2} ${y}`)
        .attr("fill", "none")
        .attr("stroke", INK)
        .attr("stroke-width", 1.0)
        .attr("stroke-linejoin", "round");

      // Ridge detail lines on light side
      const ridgeCount = 2 + Math.floor(rng() * 2);
      for (let i = 1; i <= ridgeCount; i++) {
        const t = i / (ridgeCount + 1);
        const rx = peakX + (p.cx + w/2 - peakX) * t;
        const ry = peakY + (y - peakY) * t;
        const lineLen = w * 0.12 * t;
        g.append("line")
          .attr("x1", rx - lineLen * 0.5).attr("y1", ry)
          .attr("x2", rx + lineLen * 0.5).attr("y2", ry + lineLen * 0.4)
          .attr("stroke", INK)
          .attr("stroke-width", 0.5)
          .attr("opacity", 0.6);
      }
    });

    // Scree dots along the whole range base
    const rangeW = (peakCount) * spacing;
    const dotCount = 5 + Math.floor(rng() * 5);
    for (let i = 0; i < dotCount; i++) {
      g.append("circle")
        .attr("cx", x + (rng() - 0.5) * rangeW)
        .attr("cy", y + 1 + rng() * 4)
        .attr("r", 0.5 + rng() * 0.6)
        .attr("fill", INK)
        .attr("opacity", 0.55);
    }
  },

  // Small cluster of 2-3 triangular fir trees — Middle Earth tree-chain style
  drawForestHatch(g, x, y, size, rng, INK) {
    // Faint ink wash beneath the cluster — forest-floor darkening
    g.append("ellipse")
      .attr("cx", x).attr("cy", y)
      .attr("rx", size * 0.6).attr("ry", size * 0.45)
      .attr("fill", INK).attr("opacity", 0.05);
    const count = 2 + Math.floor(rng() * 2);
    const spread = size * 0.55;
    const trees = [];
    for (let i = 0; i < count; i++) {
      trees.push({
        tx: x + (rng() - 0.5) * spread * 1.2,
        ty: y + (rng() - 0.5) * spread * 0.5,
        th: size * (0.45 + rng() * 0.25),
      });
    }
    // Back-to-front so nearer trees overlap further ones
    trees.sort((a, b) => a.ty - b.ty);
    trees.forEach(t => {
      const tw = t.th * 0.55;
      // Tiered fir silhouette — two stacked triangles suggesting branches.
      // Upper tier (smaller, higher)
      g.append("path")
        .attr("d", `M ${t.tx - tw*0.35} ${t.ty - t.th*0.05} L ${t.tx} ${t.ty - t.th*0.55} L ${t.tx + tw*0.35} ${t.ty - t.th*0.05} Z`)
        .attr("fill", INK)
        .attr("stroke", "none")
        .attr("opacity", 0.9);
      // Lower tier (wider, overlapping the upper)
      g.append("path")
        .attr("d", `M ${t.tx - tw/2} ${t.ty + t.th*0.15} L ${t.tx} ${t.ty - t.th*0.25} L ${t.tx + tw/2} ${t.ty + t.th*0.15} Z`)
        .attr("fill", INK)
        .attr("stroke", "none")
        .attr("opacity", 0.85);
      // Tiny trunk
      g.append("line")
        .attr("x1", t.tx).attr("y1", t.ty + t.th * 0.15)
        .attr("x2", t.tx).attr("y2", t.ty + t.th * 0.35)
        .attr("stroke", INK)
        .attr("stroke-width", 0.6)
        .attr("opacity", 0.8);
      // Thin shadow stroke under the trunk — grounds the fir
      g.append("line")
        .attr("x1", t.tx - tw * 0.45).attr("y1", t.ty + t.th * 0.38)
        .attr("x2", t.tx + tw * 0.45).attr("y2", t.ty + t.th * 0.38)
        .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.35);
    });
  },

  // Engraving-style swamp: dense horizontal ripples with reed tufts
  drawSwampLines(g, x, y, size, rng, INK) {
    // Faint ink wash beneath the ripples — suggests a marsh pool
    g.append("ellipse")
      .attr("cx", x).attr("cy", y)
      .attr("rx", size * 0.85).attr("ry", size * 0.5)
      .attr("fill", INK).attr("opacity", 0.07);
    // Dense ripple lines with varying widths
    const rippleCount = 5 + Math.floor(rng() * 2);
    for (let i = 0; i < rippleCount; i++) {
      const ly = y + (i - rippleCount / 2) * size * 0.18 + (rng() - 0.5) * 1;
      const w = size * (0.7 + rng() * 0.5);
      const lx = x - w / 2 + (rng() - 0.5) * 2;
      const segments = 4;
      let d = `M ${lx} ${ly}`;
      for (let j = 1; j <= segments; j++) {
        const sx = lx + (j / segments) * w;
        const dir = j % 2 === 0 ? -1 : 1;
        const cpx = lx + ((j - 0.5) / segments) * w;
        const cpy = ly + dir * size * (0.05 + rng() * 0.03);
        d += ` Q ${cpx} ${cpy} ${sx} ${ly}`;
      }
      g.append("path")
        .attr("d", d)
        .attr("fill", "none")
        .attr("stroke", INK)
        .attr("stroke-width", 0.55)
        .attr("opacity", 0.55);
    }
    // Reed tufts with cattails (engraving solid heads)
    const tufts = 2 + Math.floor(rng() * 2);
    for (let t = 0; t < tufts; t++) {
      const cx = x + (rng() - 0.5) * size * 0.9;
      const baseY = y - size * 0.05;
      const stalks = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < stalks; i++) {
        const rx = cx + (i - (stalks - 1) / 2) * 1.4 + (rng() - 0.5) * 0.6;
        const topLean = (rng() - 0.5) * 1.4;
        const topY = baseY - size * (0.35 + rng() * 0.2);
        g.append("line")
          .attr("x1", rx).attr("y1", baseY)
          .attr("x2", rx + topLean).attr("y2", topY)
          .attr("stroke", INK).attr("stroke-width", 0.55).attr("opacity", 0.8);
        if (rng() > 0.4) {
          g.append("ellipse")
            .attr("cx", rx + topLean).attr("cy", topY - 1.5)
            .attr("rx", 0.9).attr("ry", 1.8)
            .attr("fill", INK).attr("opacity", 0.8);
        }
      }
    }
  },

  // Dot-stipple grass pattern
  drawGrassStipple(g, x, y, size, rng, INK) {
    // Base dot stipple
    const dotCount = 10 + Math.floor(rng() * 6);
    for (let i = 0; i < dotCount; i++) {
      g.append("circle")
        .attr("cx", x + (rng() - 0.5) * size * 1.2)
        .attr("cy", y + (rng() - 0.5) * size * 0.8)
        .attr("r", 0.7 + rng() * 0.5)
        .attr("fill", INK)
        .attr("opacity", 0.4);
    }
    // Occasional tiny grass tufts — a few short vertical strokes
    const tuftCount = 2 + Math.floor(rng() * 3);
    for (let t = 0; t < tuftCount; t++) {
      const cx = x + (rng() - 0.5) * size * 1.1;
      const cy = y + (rng() - 0.5) * size * 0.7;
      const blades = 3;
      for (let b = 0; b < blades; b++) {
        const bx = cx + (b - 1) * 1.2 + (rng() - 0.5) * 0.6;
        const lean = (rng() - 0.5) * 1.0;
        g.append("line")
          .attr("x1", bx).attr("y1", cy)
          .attr("x2", bx + lean).attr("y2", cy - size * (0.18 + rng() * 0.08))
          .attr("stroke", INK).attr("stroke-width", 0.45).attr("opacity", 0.45);
      }
    }
  },

  drawHill(g, x, y, size, rng, INK) {
    // Cluster of 1-2 humps with engraving-style cross-hatch shading
    const count = 1 + Math.floor(rng() * 2);
    const spacing = size * 0.75;
    const humps = [];
    for (let i = 0; i < count; i++) {
      humps.push({
        cx: x + (i - (count - 1) / 2) * spacing + (rng() - 0.5) * size * 0.15,
        w: size * (0.85 + rng() * 0.4),
        h: size * (0.4 + rng() * 0.3),
      });
    }
    humps.sort((a, b) => b.h - a.h);
    humps.forEach(({ cx, w, h }) => {
      const peakOff = (rng() - 0.5) * w * 0.15;
      g.append("path")
        .attr("d", `M ${cx - w/2} ${y} Q ${cx - w/4 + peakOff} ${y - h} ${cx + peakOff} ${y - h} Q ${cx + w/4 + peakOff} ${y - h} ${cx + w/2} ${y}`)
        .attr("fill", "none")
        .attr("stroke", INK)
        .attr("stroke-width", 0.9)
        .attr("opacity", 0.65);
      // Engraving hatch on right side: 2-3 short parallel lines
      const hatchCount = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < hatchCount; i++) {
        const t = 0.3 + i * 0.22;
        const hx = cx + peakOff + w * 0.1 + i * w * 0.05;
        g.append("line")
          .attr("x1", hx).attr("y1", y - h * (0.65 - t * 0.3))
          .attr("x2", hx + w * 0.06).attr("y2", y - h * 0.05)
          .attr("stroke", INK).attr("stroke-width", 0.45).attr("opacity", 0.5);
      }
      // Rolling-downs crown stroke — suggests another ridge beyond
      const sx0 = cx - w * 0.28 + (rng() - 0.5);
      const sy0 = y - h * 0.7;
      g.append("path")
        .attr("d", `M ${sx0} ${sy0} Q ${sx0 + w * 0.12} ${sy0 - 2} ${sx0 + w * 0.25} ${sy0 - 1}`)
        .attr("fill", "none")
        .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.4);
    });
  },

  drawFarm(g, x, y, size, rng, INK) {
    // Engraving-style farm compound: 2-3 buildings with solid dark roofs
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
        .attr("stroke-width", 0.6).attr("opacity", 0.75);
      const roofPeakY = by - bh / 2 - bh * 0.8;
      // Solid dark roof triangle (engraving style)
      g.append("path")
        .attr("d", `M ${bx - bw / 2 - 0.3} ${by - bh / 2} L ${bx} ${roofPeakY} L ${bx + bw / 2 + 0.3} ${by - bh / 2} Z`)
        .attr("fill", INK).attr("opacity", 0.7);
      // Tiny smoke puff from the central farmhouse
      if (b === smokeIdx) {
        const sx = bx + bw * 0.15;
        const sy = roofPeakY;
        g.append("path")
          .attr("d", `M ${sx} ${sy} C ${sx - 1.5} ${sy - 2}, ${sx + 1.5} ${sy - 4}, ${sx - 0.5} ${sy - 6}`)
          .attr("fill", "none").attr("stroke", INK)
          .attr("stroke-width", 0.4).attr("stroke-linecap", "round")
          .attr("opacity", 0.5);
      }
    }
    // Dense furrows fanning out on both sides
    const perSide = 4 + Math.floor(rng() * 2);
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < perSide; i++) {
        const fx = x + side * size * (0.55 + i * 0.15);
        g.append("line")
          .attr("x1", fx).attr("y1", y - size * 0.3)
          .attr("x2", fx).attr("y2", y + size * 0.3)
          .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.45);
      }
    }
  },
};
