// world.js — "World Atlas" map style for Open World Map viewer
// Extracted from world.html. Dense, engraving-like aesthetic inspired
// by Christopher Tolkien's published maps. All rendering is
// self-contained; the host page supplies a render context (ctx).

window.MapStyles = window.MapStyles || {};

window.MapStyles.world = {
  name: "World Atlas",

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
    return nodes.filter(n => n.visible !== false);
  },

  /* ── Master render (called by core) ─────────────────────────── */
  render(ctx) {
    this.renderBackground(ctx);
    this.renderLinks(ctx);
    this.renderTerrainSymbols(ctx);
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
          path.attr("stroke-width", 3.0);
          break;
        case "trail":
          path.attr("stroke-width", 2.0).attr("stroke-dasharray", "8 4");
          break;
        case "wilderness":
          path.attr("stroke-width", 1.2).attr("stroke-dasharray", "3 5");
          break;
        default:
          path.attr("stroke-width", 1.5);
      }
    });
  },

  // --- Terrain symbol placement (dense, multiple clusters) ---
  renderTerrainSymbols(ctx) {
    const { g, nodes, links } = ctx;
    const { INK } = ctx.colors;
    const mulberry32 = ctx.mulberry32;
    const seedFromString = ctx.seedFromString;

    const terrainGroup = g.append("g").attr("class", "terrain");

    nodes.forEach(node => {
      const rng = mulberry32(seedFromString(node.id));

      const connected = links.filter(l =>
        (l.source.id || l.source) === node.id || (l.target.id || l.target) === node.id
      );
      let avgAngle = -Math.PI / 2;
      if (connected.length > 0) {
        let sx = 0, sy = 0;
        connected.forEach(l => {
          const other = (l.source.id || l.source) === node.id ? l.target : l.source;
          if (other.x !== undefined) {
            sx += other.x - node.x;
            sy += other.y - node.y;
          }
        });
        avgAngle = Math.atan2(sy, sx);
      }
      const placeAngle = avgAngle + Math.PI;
      const offset = 42;

      if (node.terrain === "mountains") {
        // Front row: 5-7 peaks, dense overlapping
        const count = 5 + Math.floor(rng() * 3);
        for (let i = 0; i < count; i++) {
          const spread = (i - (count - 1) / 2) * 16;
          const mx = node.x + Math.cos(placeAngle) * offset + Math.cos(placeAngle + Math.PI / 2) * spread;
          const my = node.y + Math.sin(placeAngle) * offset + Math.sin(placeAngle + Math.PI / 2) * spread;
          this.drawMountainRange(terrainGroup, mx, my, 11 + rng() * 5, rng, INK);
        }
        // Second row: ALWAYS present, 3-5 smaller peaks behind
        const count2 = 3 + Math.floor(rng() * 3);
        for (let i = 0; i < count2; i++) {
          const spread = (i - (count2 - 1) / 2) * 16 + (rng() - 0.5) * 6;
          const mx = node.x + Math.cos(placeAngle) * (offset + 18) + Math.cos(placeAngle + Math.PI / 2) * spread;
          const my = node.y + Math.sin(placeAngle) * (offset + 18) + Math.sin(placeAngle + Math.PI / 2) * spread;
          this.drawMountainRange(terrainGroup, mx, my, 8 + rng() * 4, rng, INK);
        }
        // Third row: 2-3 tiny peaks for extra depth
        const count3 = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < count3; i++) {
          const spread = (i - (count3 - 1) / 2) * 16 + (rng() - 0.5) * 8;
          const mx = node.x + Math.cos(placeAngle) * (offset + 34) + Math.cos(placeAngle + Math.PI / 2) * spread;
          const my = node.y + Math.sin(placeAngle) * (offset + 34) + Math.sin(placeAngle + Math.PI / 2) * spread;
          this.drawMountainRange(terrainGroup, mx, my, 5 + rng() * 3, rng, INK);
        }
        // Extra scattered tiny peaks further out
        const extraCount = 2 + Math.floor(rng() * 3);
        for (let i = 0; i < extraCount; i++) {
          const a = placeAngle + (rng() - 0.5) * 1.6;
          const r = offset + 40 + rng() * 15;
          const mx = node.x + Math.cos(a) * r;
          const my = node.y + Math.sin(a) * r;
          this.drawMountainRange(terrainGroup, mx, my, 5 + rng() * 3, rng, INK);
        }
      } else if (node.terrain === "forest") {
        const count = 12 + Math.floor(rng() * 7);
        for (let i = 0; i < count; i++) {
          const a = placeAngle + (rng() - 0.5) * 1.6;
          const r = offset * (0.15 + rng() * 0.45);
          const tx = node.x + Math.cos(a) * r;
          const ty = node.y + Math.sin(a) * r;
          this.drawForestHatch(terrainGroup, tx, ty, 8 + rng() * 4, rng, INK);
        }
      } else if (node.terrain === "swamp") {
        this.drawSwampLines(terrainGroup,
          node.x + Math.cos(placeAngle) * offset,
          node.y + Math.sin(placeAngle) * offset, 22, rng, INK);
      } else if (node.terrain === "plains") {
        for (let i = 0; i < 4; i++) {
          const a = placeAngle + (rng() - 0.5) * 1.4;
          const r = offset * (0.5 + rng() * 0.6);
          this.drawGrassStipple(terrainGroup, node.x + Math.cos(a) * r, node.y + Math.sin(a) * r, 15, rng, INK);
        }
      }
    });
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
          // Main town — cluster of filled houses
          const hs = 4;
          const positions = [{x:0, y:0}, {x:-hs*1.3, y:hs*0.2}, {x:hs*1.3, y:hs*0.1}, {x:-hs*0.5, y:-hs*0.8}, {x:hs*0.6, y:-hs*0.7}];
          positions.forEach(p => {
            // House body (filled)
            ng.append("rect").attr("x", p.x - hs*0.45).attr("y", p.y - hs*0.2).attr("width", hs*0.9).attr("height", hs*0.65)
              .attr("fill", INK).attr("stroke", "none");
            // Roof (filled)
            ng.append("path")
              .attr("d", `M ${p.x - hs*0.55} ${p.y - hs*0.2} L ${p.x} ${p.y - hs*0.75} L ${p.x + hs*0.55} ${p.y - hs*0.2} Z`)
              .attr("fill", INK).attr("stroke", "none");
          });
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
          // Hanging sign
          ng.append("line").attr("x1", hs*0.7).attr("y1", -hs*0.1).attr("x2", hs*1.2).attr("y2", -hs*0.1)
            .attr("stroke", INK).attr("stroke-width", 0.5);
          ng.append("rect").attr("x", hs*1.0).attr("y", -hs*0.1).attr("width", hs*0.5).attr("height", hs*0.4)
            .attr("fill", INK).attr("stroke", "none").attr("opacity", 0.6);
          break;
        }
        case "settlement": {
          // Cluster of 2-3 tiny filled houses
          const hs = isLocal ? 2 : 3.5;
          const houseCount = isLocal ? 2 : 3;
          for (let hi = 0; hi < houseCount; hi++) {
            const hx = (hi - (houseCount-1)/2) * hs * 1.4;
            const hy = (hi % 2) * hs * 0.3;
            // House body (filled)
            ng.append("rect").attr("x", hx - hs*0.6).attr("y", hy - hs*0.3).attr("width", hs*1.2).attr("height", hs*0.9)
              .attr("fill", INK).attr("stroke", "none");
            // Roof (filled)
            ng.append("path")
              .attr("d", `M ${hx - hs*0.7} ${hy - hs*0.3} L ${hx} ${hy - hs} L ${hx + hs*0.7} ${hy - hs*0.3} Z`)
              .attr("fill", INK).attr("stroke", "none");
          }
          break;
        }
        case "wilderness":
          ng.append("circle").attr("r", s).attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.5);
          break;
        case "dungeon": {
          const dd = s * 1.3;
          ng.append("path")
            .attr("d", `M 0 ${-dd} L ${dd} 0 L 0 ${dd} L ${-dd} 0 Z`)
            .attr("fill", INK).attr("stroke", "none");
          break;
        }
        case "sanctuary":
          ng.append("circle").attr("r", s).attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.5);
          ng.append("circle").attr("r", 2).attr("fill", INK);
          break;
        case "tower":
          ng.append("rect").attr("x", -2).attr("y", -s - 2).attr("width", 4).attr("height", s * 2 + 4)
            .attr("fill", INK).attr("stroke", "none");
          ng.append("rect").attr("x", -3.5).attr("y", -s - 4).attr("width", 7).attr("height", 2)
            .attr("fill", INK);
          break;
        case "ruin":
          ng.append("rect").attr("x", -s).attr("y", -s).attr("width", s*2).attr("height", s*2)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.2)
            .attr("stroke-dasharray", "2 2");
          break;
        case "waypoint":
          ng.append("path")
            .attr("d", `M 0 ${-s} L ${s} ${s} L ${-s} ${s} Z`)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.2);
          break;
        case "lair":
          ng.append("path")
            .attr("d", `M 0 ${-s} L ${s} ${s} L ${-s} ${s} Z`)
            .attr("fill", INK).attr("stroke", "none");
          break;
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
    const { g, links, FONT } = ctx;
    const { INK_LIGHT, PARCHMENT } = ctx.colors;

    const labelGroup = g.append("g").attr("class", "day-labels");

    links.forEach(link => {
      if (!link.days || link.days < 0.25 || link.path_type === "river") return;

      const sx = link.source.x, sy = link.source.y;
      const tx = link.target.x, ty = link.target.y;
      const mx = (sx + tx) / 2, my = (sy + ty) / 2;

      const text = link.days === 1 ? "1 day" : link.days + " days";

      labelGroup.append("text")
        .attr("x", mx)
        .attr("y", my + 3)
        .attr("text-anchor", "middle")
        .attr("font-family", FONT)
        .attr("font-size", "9px")
        .attr("fill", INK_LIGHT)
        .attr("stroke", PARCHMENT)
        .attr("stroke-width", 2.5)
        .attr("paint-order", "stroke")
        .text(text);
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

    // "Miles" label
    sg.append("text")
      .attr("x", bx + barW / 2).attr("y", by + barH + 24)
      .attr("text-anchor", "middle")
      .attr("font-family", FONT)
      .attr("font-size", "9px")
      .attr("font-style", "italic")
      .attr("fill", INK)
      .text("Miles");
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

    g.append("line")
      .attr("x1", bx + 20).attr("y1", by + 35)
      .attr("x2", bx + boxW - 20).attr("y2", by + 35)
      .attr("stroke", INK).attr("stroke-width", 0.4);

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

  // Dense engraving-style mountain with shadow side, ridge lines, and scree
  drawMountainRange(g, x, y, size, rng, INK) {
    const w = size * (0.8 + rng() * 0.4);
    const h = size * (1.3 + rng() * 0.5);
    const skew = (rng() - 0.5) * w * 0.1;
    const peakX = x + skew;
    const peakY = y - h;

    // Solid shadow side (left half)
    g.append("path")
      .attr("d", `M ${x - w/2} ${y} L ${peakX} ${peakY} L ${x} ${y} Z`)
      .attr("fill", INK)
      .attr("stroke", "none");

    // Light side outline (right half)
    g.append("path")
      .attr("d", `M ${x} ${y} L ${peakX} ${peakY} L ${x + w/2} ${y}`)
      .attr("fill", "none")
      .attr("stroke", INK)
      .attr("stroke-width", 1.0);

    // Ridge detail lines on light side
    const ridgeCount = 2 + Math.floor(rng() * 2);
    for (let i = 1; i <= ridgeCount; i++) {
      const t = i / (ridgeCount + 1);
      const rx = peakX + (x + w/2 - peakX) * t;
      const ry = peakY + (y - peakY) * t;
      const lineLen = w * 0.12 * t;
      g.append("line")
        .attr("x1", rx - lineLen * 0.5).attr("y1", ry)
        .attr("x2", rx + lineLen * 0.5).attr("y2", ry + lineLen * 0.4)
        .attr("stroke", INK)
        .attr("stroke-width", 0.5)
        .attr("opacity", 0.6);
    }

    // Scree dots at base
    const dotCount = 5 + Math.floor(rng() * 5);
    for (let i = 0; i < dotCount; i++) {
      g.append("circle")
        .attr("cx", x + (rng() - 0.5) * w * 1.0)
        .attr("cy", y + 1 + rng() * 4)
        .attr("r", 0.5 + rng() * 0.6)
        .attr("fill", INK)
        .attr("opacity", 0.55);
    }
  },

  // Dense hatched ellipse canopy
  drawForestHatch(g, x, y, size, rng, INK) {
    const rx = size * (0.35 + rng() * 0.15);
    const ry = size * (0.45 + rng() * 0.15);

    // Hatching lines within canopy — dense
    const hatchCount = 7 + Math.floor(rng() * 3);
    for (let i = 0; i < hatchCount; i++) {
      const t = (i + 0.5) / hatchCount;
      const ly = y - ry + t * ry * 2;
      const dyNorm = (ly - y) / ry;
      const hWidth = rx * Math.sqrt(Math.max(0, 1 - dyNorm * dyNorm));
      if (hWidth > 0.5) {
        g.append("line")
          .attr("x1", x - hWidth).attr("y1", ly)
          .attr("x2", x + hWidth).attr("y2", ly)
          .attr("stroke", INK)
          .attr("stroke-width", 0.5)
          .attr("opacity", 0.9);
      }
    }

    // Outline
    g.append("ellipse")
      .attr("cx", x).attr("cy", y)
      .attr("rx", rx).attr("ry", ry)
      .attr("fill", "none")
      .attr("stroke", INK)
      .attr("stroke-width", 0.8)
      .attr("opacity", 0.8);
  },

  // Wavy water lines with reed stalks
  drawSwampLines(g, x, y, size, rng, INK) {
    for (let i = 0; i < 5; i++) {
      const ly = y + (i - 2) * size * 0.2;
      const lx = x - size * 0.5;
      const segments = 4;
      let d = `M ${lx} ${ly}`;
      for (let j = 1; j <= segments; j++) {
        const sx = lx + (j / segments) * size;
        const dir = j % 2 === 0 ? -1 : 1;
        const cpx = lx + ((j - 0.5) / segments) * size;
        const cpy = ly + dir * size * 0.06;
        d += ` Q ${cpx} ${cpy} ${sx} ${ly}`;
      }
      g.append("path")
        .attr("d", d)
        .attr("fill", "none")
        .attr("stroke", INK)
        .attr("stroke-width", 0.5)
        .attr("opacity", 0.4);
    }
    for (let i = 0; i < 4; i++) {
      const rx = x - size * 0.3 + rng() * size * 0.6;
      const ry = y - size * 0.1;
      g.append("line")
        .attr("x1", rx).attr("y1", ry)
        .attr("x2", rx + (rng() - 0.5) * 2).attr("y2", ry - size * 0.35)
        .attr("stroke", INK)
        .attr("stroke-width", 0.5)
        .attr("opacity", 0.5);
    }
  },

  // Dot-stipple grass pattern
  drawGrassStipple(g, x, y, size, rng, INK) {
    const count = 12 + Math.floor(rng() * 7);
    for (let i = 0; i < count; i++) {
      g.append("circle")
        .attr("cx", x + (rng() - 0.5) * size * 1.2)
        .attr("cy", y + (rng() - 0.5) * size * 0.8)
        .attr("r", 0.7 + rng() * 0.5)
        .attr("fill", INK)
        .attr("opacity", 0.4);
    }
  },
};
