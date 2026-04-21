// thirdage.js — "Third Age" map style for Open World Map viewer
// Dense, engraving-like aesthetic inspired by Pauline Baynes'
// Map of Middle-earth. All rendering is self-contained;
// the host page supplies a render context (ctx).

window.MapStyles = window.MapStyles || {};

window.MapStyles.thirdage = {
  name: "Third Age",

  // Pauline Baynes' engraved Middle-earth map uses small-caps Roman
  // letterforms. Alegreya SC evokes the engraving-era style while
  // remaining readable at map-label size.
  font: "'Alegreya SC', 'IM Fell English SC', 'Palatino Linotype', Palatino, serif",

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
    MapCore.renderBoats(ctx, { color: ctx.colors.INK, parchment: ctx.colors.PARCHMENT, count: 4 });
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
      "plains": (tg, x, y, sz, rng) => style.drawGrassStipple(tg, x, y, sz, rng, INK),
      "graveyard": (tg, x, y, sz, rng) => style.drawGraveyard(tg, x, y, sz, rng, INK),
    });
    MapCore.renderMountainsWithElevation(ctx,
      (tg, x, y, sz, rng) => style.drawMountainRange(tg, x, y, sz, rng, INK),
      (tg, x, y, sz, rng) => style.drawHill(tg, x, y, sz, rng, INK));
    MapCore.renderForestEdgeTrees(ctx,
      (tg, x, y, sz, rng) => style.drawForestHatch(tg, x, y, sz, rng, INK),
      ["forest", "forested-hills"]);
    MapCore.renderFarmlandBiased(ctx,
      (tg, x, y, sz, rng) => style.drawFarm(tg, x, y, sz, rng, INK));
    // Soft forest-region outline — unifies contiguous forest hexes into a
    // single zone boundary (skips interior edges) with Pauline Baynes
    // slightly heavier ink than Wilderland.
    MapCore.renderTerrainEdges(ctx, ["forest", "forested-hills"], {
      color: INK, strokeWidth: 0.7, opacity: 0.28, wobble: 2.8,
      className: "forest-region",
    });
    // Mountain-region boundary — groups adjacent mountain hexes into one
    // visible range outline so peaks don't read as isolated glyphs.
    MapCore.renderTerrainEdges(ctx, ["mountains"], {
      color: INK, strokeWidth: 0.85, opacity: 0.35, wobble: 2.2,
      className: "mountain-region",
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
    const { g, nodes, mulberry32, seedFromString } = ctx;
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

      // Shared id-based special icons (before point_type switch)
      if (MapCore.renderSpecialIcon(ng, node, { ink: INK, parchment: PARCHMENT })) return;

      // Farm override — cute farmhouse for any farm-named node (not ruins)
      if (node.name && node.name.toLowerCase().includes("farm") && node.point_type !== "ruin") {
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
          // Main town — walled city filling roughly the middle 50% of its
          // hex. Scattered (not grid-aligned) tower skyline with solid INK
          // silhouettes, central keep, four corner wall-towers, single
          // central bridge. Engraving-style (filled) rendering.
          const hs = 12;
          const rng = mulberry32(seedFromString("city-" + (node.id || "heart")));
          const bY = hs * 0.15;
          // Ground halo
          ng.append("ellipse")
            .attr("cx", 0).attr("cy", hs * 0.6)
            .attr("rx", hs * 2.4).attr("ry", hs * 0.5)
            .attr("fill", INK).attr("opacity", 0.08);
          // Walled oval — filled pale parchment so towers pop in solid black
          ng.append("ellipse")
            .attr("cx", 0).attr("cy", 0)
            .attr("rx", hs * 2.1).attr("ry", hs * 1.55)
            .attr("fill", PARCHMENT).attr("fill-opacity", 0.9)
            .attr("stroke", INK).attr("stroke-width", 1.1);
          // Scattered tall towers via rejection sampling
          const towers = [];
          const ovRx = hs * 1.85, ovRy = hs * 1.3;
          const minDist = hs * 0.22;
          let attempts = 0;
          while (towers.length < 22 && attempts < 900) {
            attempts++;
            const rx = (rng() - 0.5) * 2 * ovRx;
            const ry = (rng() - 0.5) * 2 * ovRy - hs * 0.1;
            if ((rx * rx) / (ovRx * ovRx) + (ry * ry) / (ovRy * ovRy) > 1) continue;
            if (Math.abs(ry - bY) < hs * 0.45 && Math.abs(rx) < hs * 1.0) continue;
            if (rx > -hs * 0.55 && rx < hs * 0.15 && ry < hs * 0.4) continue;
            let ok = true;
            for (const t of towers) {
              const dx = t.x - rx, dy = t.y - ry;
              if (dx * dx + dy * dy < minDist * minDist) { ok = false; break; }
            }
            if (ok) towers.push({ x: rx, y: ry });
          }
          towers.sort((a, b) => a.y - b.y);
          towers.forEach(t => {
            const storyCount = 3 + Math.floor(rng() * 4);
            const storyH = hs * 0.2;
            const th = storyCount * storyH;
            const tw = hs * (0.14 + rng() * 0.06);
            const yTop = t.y - th;
            // Tower — solid black engraving
            ng.append("rect")
              .attr("x", t.x - tw / 2).attr("y", yTop)
              .attr("width", tw).attr("height", th)
              .attr("fill", INK).attr("stroke", "none");
            // Pointed roof OR crenellation
            if (rng() > 0.5) {
              // Crenellation as two tiny merlons on top
              ng.append("rect").attr("x", t.x - tw / 2 - 0.3).attr("y", yTop - hs * 0.08)
                .attr("width", tw * 0.35).attr("height", hs * 0.08).attr("fill", INK);
              ng.append("rect").attr("x", t.x + tw * 0.15).attr("y", yTop - hs * 0.08)
                .attr("width", tw * 0.35).attr("height", hs * 0.08).attr("fill", INK);
            } else {
              // Solid pointed roof
              ng.append("path")
                .attr("d", `M ${t.x - tw / 2 - 0.4} ${yTop} L ${t.x} ${yTop - tw * 0.9} L ${t.x + tw / 2 + 0.4} ${yTop} Z`)
                .attr("fill", INK);
            }
            // Window slits as parchment punch-outs
            for (let si = 0; si < storyCount; si += 2) {
              ng.append("rect")
                .attr("x", t.x - 0.2).attr("y", yTop + (si + 0.5) * storyH - 0.5)
                .attr("width", 0.4).attr("height", 1.0)
                .attr("fill", PARCHMENT);
            }
          });
          // Two bridge-gate towers — one flanking each side of the bridge
          const bridgeSpan0 = hs * 1.55;
          [-1, 1].forEach(side => {
            const tX = side * (bridgeSpan0 / 2 + hs * 0.32);
            const tH = hs * 1.7;
            const tBase = bY + hs * 0.12;
            const tTop = tBase - tH;
            const tW = hs * 0.32;
            ng.append("rect")
              .attr("x", tX - tW / 2).attr("y", tTop).attr("width", tW).attr("height", tH)
              .attr("fill", INK);
            ng.append("rect").attr("x", tX - tW / 2 - 0.4).attr("y", tTop - hs * 0.12).attr("width", tW * 0.3).attr("height", hs * 0.12).attr("fill", INK);
            ng.append("rect").attr("x", tX + tW * 0.05).attr("y", tTop - hs * 0.12).attr("width", tW * 0.3).attr("height", hs * 0.12).attr("fill", INK);
            ng.append("line")
              .attr("x1", tX).attr("y1", tTop - hs * 0.12).attr("x2", tX).attr("y2", tTop - hs * 0.7)
              .attr("stroke", INK).attr("stroke-width", 0.8);
            ng.append("path")
              .attr("d", `M ${tX} ${tTop - hs * 0.7} L ${tX + side * hs * 0.5} ${tTop - hs * 0.58} L ${tX} ${tTop - hs * 0.46} Z`)
              .attr("fill", INK);
            ng.append("rect")
              .attr("x", tX - 0.2).attr("y", tTop + tH * 0.4).attr("width", 0.4).attr("height", tH * 0.15).attr("fill", PARCHMENT);
          });
          // Four corner wall-towers
          [[-hs * 1.95, -hs * 0.4, hs * 0.95], [hs * 1.95, -hs * 0.4, hs * 0.9],
           [-hs * 1.95, hs * 0.4, hs * 0.85], [hs * 1.95, hs * 0.4, hs * 1.0]].forEach(([tx, ty, th]) => {
            ng.append("rect")
              .attr("x", tx - hs * 0.17).attr("y", ty - th * 0.6)
              .attr("width", hs * 0.34).attr("height", th)
              .attr("fill", INK);
          });
          // Main gate arch — parchment cutout on solid wall
          ng.append("path")
            .attr("d", `M ${-hs * 0.3} ${hs * 1.55} L ${-hs * 0.3} ${hs * 0.95} Q 0 ${hs * 0.6} ${hs * 0.3} ${hs * 0.95} L ${hs * 0.3} ${hs * 1.55} Z`)
            .attr("fill", PARCHMENT).attr("stroke", INK).attr("stroke-width", 0.9);
          // Single central stone bridge spanning the river
          const bridgeSpan = hs * 1.55;
          const deckTop = bY;
          const deckBot = bY + hs * 0.11;
          const bridgeG = ng.append("g").attr("class", "bridge");
          bridgeG.append("rect")
            .attr("x", -bridgeSpan / 2 - hs * 0.28).attr("y", deckTop - 0.5)
            .attr("width", bridgeSpan + hs * 0.56).attr("height", hs * 0.12)
            .attr("fill", INK);
          [-bridgeSpan * 0.3, bridgeSpan * 0.3].forEach(px => {
            bridgeG.append("rect")
              .attr("x", px - 0.6).attr("y", deckBot).attr("width", 1.2).attr("height", hs * 0.4)
              .attr("fill", INK);
          });
          const archW = bridgeSpan * 0.55;
          bridgeG.append("path")
            .attr("d", `M ${-archW / 2} ${deckBot + hs * 0.42} Q 0 ${deckBot - hs * 0.05} ${archW / 2} ${deckBot + hs * 0.42}`)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.8);
          break;
        }
        case "fortress": {
          // Imposing long-walled keep atop a rocky mesa — Trampier-inspired.
          // Three slim towers with pointed conical spires, long crenellated
          // curtain wall with square wall-towers, detached right-side gate
          // tower. Engraving (solid INK) aesthetic.
          const hs = 9;
          const rng = mulberry32(seedFromString("fortress-" + (node.id || "fortress")));
          // Hill widened so flat crest supports the whole keep (detached
          // right gate-tower at +hs*2.15). Flat top ±hs*2.6, hill ±hs*4.5.
          const hillBaseY = hs * 1.9, hillTopY = hs * 0.6, hillW = hs * 4.5;
          const flatEdge = hs * 2.6;
          // Hill mound
          ng.append("path")
            .attr("d", `M ${-hillW} ${hillBaseY}
                        Q ${-hillW * 0.75} ${hillBaseY - hs * 0.1} ${-flatEdge} ${hillTopY + hs * 0.25}
                        Q ${-flatEdge * 0.5} ${hillTopY - hs * 0.1} 0 ${hillTopY}
                        Q ${flatEdge * 0.5} ${hillTopY - hs * 0.1} ${flatEdge} ${hillTopY + hs * 0.25}
                        Q ${hillW * 0.75} ${hillBaseY - hs * 0.1} ${hillW} ${hillBaseY} Z`)
            .attr("fill", INK).attr("opacity", 0.18);
          // Hill crest outline
          ng.append("path")
            .attr("d", `M ${-hillW} ${hillBaseY}
                        Q ${-hillW * 0.75} ${hillBaseY - hs * 0.1} ${-flatEdge} ${hillTopY + hs * 0.25}
                        Q ${-flatEdge * 0.5} ${hillTopY - hs * 0.1} 0 ${hillTopY}
                        Q ${flatEdge * 0.5} ${hillTopY - hs * 0.1} ${flatEdge} ${hillTopY + hs * 0.25}
                        Q ${hillW * 0.75} ${hillBaseY - hs * 0.1} ${hillW} ${hillBaseY}`)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.9).attr("opacity", 0.7);
          // Rocky strata hatch lines
          for (let si = 0; si < 10; si++) {
            const t = 0.08 + si * 0.095;
            const sx = -hillW + 2 * hillW * t;
            const syTop = hillTopY + hs * 0.35;
            const syBot = hillBaseY - hs * 0.08;
            const midX = sx + (rng() - 0.5) * hs * 0.15;
            const endX = sx + (rng() - 0.5) * hs * 0.1;
            ng.append("path")
              .attr("d", `M ${sx} ${syTop} Q ${midX} ${(syTop + syBot) / 2} ${endX} ${syBot}`)
              .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.4);
          }
          // Boulders on hillside
          [{ x: -hillW * 0.82, y: hillBaseY - hs * 0.1, r: hs * 0.18 },
           { x: -hillW * 0.45, y: hillBaseY + hs * 0.05, r: hs * 0.22 },
           { x:  hillW * 0.5,  y: hillBaseY - hs * 0.05, r: hs * 0.2 },
           { x:  hillW * 0.82, y: hillBaseY - hs * 0.12, r: hs * 0.17 }].forEach(b => {
            ng.append("ellipse")
              .attr("cx", b.x).attr("cy", b.y).attr("rx", b.r).attr("ry", b.r * 0.7)
              .attr("fill", INK).attr("opacity", 0.85);
          });

          const baseY = hillTopY;
          const crenCap = (x, y, w) => {
            const steps = Math.max(3, Math.floor(w / (hs * 0.1)));
            const stepW = w / steps;
            for (let i = 0; i < steps; i++) {
              if (i % 2 === 0) {
                ng.append("rect")
                  .attr("x", x - w / 2 + i * stepW).attr("y", y - hs * 0.14)
                  .attr("width", stepW).attr("height", hs * 0.14).attr("fill", INK);
              }
            }
          };
          const slit = (sx, sy1, sy2) => {
            ng.append("rect").attr("x", sx - 0.2).attr("y", sy1)
              .attr("width", 0.4).attr("height", sy2 - sy1).attr("fill", PARCHMENT);
          };
          const pointedSpire = (x, baseTop, w, spireH) => {
            ng.append("rect")
              .attr("x", x - w * 0.58).attr("y", baseTop - hs * 0.06)
              .attr("width", w * 1.16).attr("height", hs * 0.09).attr("fill", INK);
            ng.append("path")
              .attr("d", `M ${x - w * 0.55} ${baseTop - hs * 0.06} L ${x} ${baseTop - spireH} L ${x + w * 0.55} ${baseTop - hs * 0.06} Z`)
              .attr("fill", INK);
          };

          const wallLeft = -hs * 1.7, wallRight = hs * 1.7;
          const wallTop = baseY - hs * 0.9;
          ng.append("rect")
            .attr("x", wallLeft).attr("y", wallTop).attr("width", wallRight - wallLeft).attr("height", hs * 0.9)
            .attr("fill", INK);
          const merlonCount = 11;
          const merlonW = hs * 0.18;
          const merlonGap = ((wallRight - wallLeft) - merlonCount * merlonW) / (merlonCount - 1);
          for (let i = 0; i < merlonCount; i++) {
            const mx = wallLeft + i * (merlonW + merlonGap);
            ng.append("rect").attr("x", mx).attr("y", wallTop - hs * 0.15)
              .attr("width", merlonW).attr("height", hs * 0.15).attr("fill", INK);
          }
          const wallTowers = [
            { x: -hs * 1.55, h: hs * 1.4, w: hs * 0.34 },
            { x: -hs * 0.8,  h: hs * 1.2, w: hs * 0.30 },
            { x:  hs * 0.15, h: hs * 1.25, w: hs * 0.30 },
            { x:  hs * 0.85, h: hs * 1.3, w: hs * 0.32 },
            { x:  hs * 1.55, h: hs * 1.45, w: hs * 0.34 },
          ];
          wallTowers.forEach(({ x, h, w }) => {
            const topY = baseY - h;
            ng.append("rect").attr("x", x - w / 2).attr("y", topY).attr("width", w).attr("height", h).attr("fill", INK);
            crenCap(x, topY, w + hs * 0.08);
            slit(x, topY + h * 0.35, topY + h * 0.55);
          });
          const spires = [
            { x: -hs * 1.15, baseH: hs * 2.1, spireH: hs * 0.95, w: hs * 0.22 },
            { x: -hs * 0.35, baseH: hs * 2.45, spireH: hs * 1.1, w: hs * 0.22 },
            { x:  hs * 0.45, baseH: hs * 2.1, spireH: hs * 0.95, w: hs * 0.22 },
          ];
          spires.forEach(({ x, baseH, spireH, w }) => {
            const topY = baseY - baseH;
            ng.append("rect").attr("x", x - w / 2).attr("y", topY).attr("width", w).attr("height", baseH).attr("fill", INK);
            slit(x, topY + baseH * 0.22, topY + baseH * 0.37);
            slit(x, topY + baseH * 0.55, topY + baseH * 0.7);
            pointedSpire(x, topY, w, spireH);
          });
          // Detached right gate-tower
          const detX = hs * 2.15, detH = hs * 1.55, detW = hs * 0.38;
          const detTop = baseY - detH + hs * 0.15;
          ng.append("rect").attr("x", detX - detW / 2).attr("y", detTop).attr("width", detW).attr("height", detH).attr("fill", INK);
          crenCap(detX, detTop, detW + hs * 0.08);
          slit(detX, detTop + detH * 0.3, detTop + detH * 0.5);
          slit(detX, detTop + detH * 0.6, detTop + detH * 0.8);
          // Main gate — parchment cutout arch
          ng.append("path")
            .attr("d", `M ${-hs * 0.05} ${baseY} L ${-hs * 0.05} ${baseY - hs * 0.55} Q ${hs * 0.15} ${baseY - hs * 0.82} ${hs * 0.35} ${baseY - hs * 0.55} L ${hs * 0.35} ${baseY} Z`)
            .attr("fill", PARCHMENT).attr("stroke", INK).attr("stroke-width", 0.75);
          // Switchback dashed path up the right
          ng.append("path")
            .attr("d", `M ${hillW * 0.75} ${hillBaseY - hs * 0.1} Q ${hs * 1.2} ${hillBaseY - hs * 0.55} ${hs * 0.7} ${hillTopY + hs * 0.2} Q ${hs * 0.5} ${hillTopY + hs * 0.05} ${hs * 0.15} ${baseY}`)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.55)
            .attr("stroke-dasharray", "2 2").attr("opacity", 0.6);
          // Pennants
          const flagTop = baseY - spires[1].baseH - spires[1].spireH - hs * 0.35;
          ng.append("line")
            .attr("x1", spires[1].x).attr("y1", baseY - spires[1].baseH - spires[1].spireH)
            .attr("x2", spires[1].x).attr("y2", flagTop)
            .attr("stroke", INK).attr("stroke-width", 0.6);
          ng.append("path")
            .attr("d", `M ${spires[1].x} ${flagTop} L ${spires[1].x + hs * 0.7} ${flagTop + hs * 0.18} L ${spires[1].x} ${flagTop + hs * 0.36} Z`)
            .attr("fill", INK);
          [spires[0], spires[2]].forEach(s => {
            const topY = baseY - s.baseH - s.spireH;
            ng.append("line").attr("x1", s.x).attr("y1", topY).attr("x2", s.x).attr("y2", topY - hs * 0.35)
              .attr("stroke", INK).attr("stroke-width", 0.5);
            ng.append("path")
              .attr("d", `M ${s.x} ${topY - hs * 0.35} L ${s.x + hs * 0.32} ${topY - hs * 0.26} L ${s.x} ${topY - hs * 0.17} Z`)
              .attr("fill", INK);
          });
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
      // Larger heart icon now extends ~20 below center, so push its label
      // further down so it doesn't collide with the oval.
      const typeOffset = { heart: 32, fortress: 30, tower: 24, lair: 22 };
      const specialOff = MapCore.specialIconLabelOffset(node);
      const yOffset = isLocal ? 14 : (specialOff || typeOffset[node.point_type] || 20);

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
    // Pauline Baynes "Middle-earth" range (see
    // style-references/middle-earth.webp). Each call now draws a WIDE
    // continuous ridge so that adjacent mountain hexes overlap at their
    // shared edge and read as one long serpentine chain (Ered Lithui /
    // Misty Mountains), rather than separate cluster-per-hex lumps.
    const peakCount = 18 + Math.floor(rng() * 7); // 18-24 peaks per call
    const spacing = size * 0.16;                  // tight overlap
    const rangeW = (peakCount - 1) * spacing;     // ~2.7-3.8 × size → overflows hex
    // A couple of hero peaks standing taller within the ridge
    const heroIdxs = new Set();
    const heroCount = 2 + Math.floor(rng() * 2);
    while (heroIdxs.size < heroCount) {
      heroIdxs.add(3 + Math.floor(rng() * (peakCount - 6)));
    }
    const peaks = [];
    for (let i = 0; i < peakCount; i++) {
      const isHero = heroIdxs.has(i);
      // Lots of height variation — most peaks short; heroes clearly tall.
      const hBase = isHero ? 0.65 + rng() * 0.22 : 0.18 + Math.pow(rng(), 1.4) * 0.38;
      const wBase = isHero ? 0.26 + rng() * 0.06 : 0.2 + rng() * 0.06;
      peaks.push({
        px: x - rangeW / 2 + i * spacing + (rng() - 0.5) * size * 0.03,
        baseY: y + (rng() - 0.5) * size * 0.025,
        h: size * hBase,
        pw: size * wBase,
        isHero,
      });
    }
    // Tall peaks last so they overlap the shorter ones in front.
    peaks.sort((a, b) => a.h - b.h);
    peaks.forEach(p => {
      const peakY = p.baseY - p.h;
      g.append("path")
        .attr("d", `M ${p.px - p.pw / 2} ${p.baseY} L ${p.px} ${peakY} L ${p.px + p.pw / 2} ${p.baseY} Z`)
        .attr("fill", INK)
        .attr("stroke", "none");
    });

    // Foothill arcs at the base — the "^^^^^" row the reference draws
    // beneath every Baynes range. Runs the full ridge width.
    const hillCount = Math.round(peakCount * 0.7);
    const hillSpacing = rangeW / (hillCount - 1);
    const hillBaseY = y + size * 0.1;
    for (let i = 0; i < hillCount; i++) {
      const cx = x - rangeW / 2 + i * hillSpacing + (rng() - 0.5) * size * 0.02;
      const r = size * (0.05 + rng() * 0.04);
      g.append("path")
        .attr("d", `M ${cx - r} ${hillBaseY} Q ${cx} ${hillBaseY - r * 1.1} ${cx + r} ${hillBaseY}`)
        .attr("fill", "none")
        .attr("stroke", INK)
        .attr("stroke-width", 0.6)
        .attr("stroke-linecap", "round");
    }
  },

  // Small cluster of 2-3 triangular fir trees — Middle Earth tree-chain style
  drawForestHatch(g, x, y, size, rng, INK) {
    // Pick one of several engraving-style tree variants for hand-drawn
    // variety. All solid-ink silhouettes.
    const variant = rng();

    // Mapeffects old-growth scatter ticks on the forest floor
    const floorMarks = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < floorMarks; i++) {
      const fx = x + (rng() - 0.5) * size * 0.9;
      const fy = y + size * (0.35 + rng() * 0.25);
      const len = 1 + rng() * 1.2;
      g.append("line")
        .attr("x1", fx).attr("y1", fy)
        .attr("x2", fx + len).attr("y2", fy + len * 0.45)
        .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.5);
    }
    if (variant < 0.45) {
      // Two stacked fir tiers (original)
      const th = size * (0.55 + rng() * 0.2);
      const tw = th * 0.55;
      g.append("path")
        .attr("d", `M ${x - tw*0.35} ${y - th*0.05} L ${x} ${y - th*0.55} L ${x + tw*0.35} ${y - th*0.05} Z`)
        .attr("fill", INK).attr("opacity", 0.9);
      g.append("path")
        .attr("d", `M ${x - tw/2} ${y + th*0.15} L ${x} ${y - th*0.25} L ${x + tw/2} ${y + th*0.15} Z`)
        .attr("fill", INK).attr("opacity", 0.85);
      g.append("line")
        .attr("x1", x).attr("y1", y + th * 0.15)
        .attr("x2", x).attr("y2", y + th * 0.3)
        .attr("stroke", INK).attr("stroke-width", 0.6).attr("opacity", 0.8);
    } else if (variant < 0.75) {
      // Three-tier tall fir — Middle-earth tree-chain look
      const th = size * 0.7;
      const tw = size * 0.42;
      for (let i = 0; i < 3; i++) {
        const tierY = y - th * (i / 3) * 0.85;
        const tierW = tw * (1 - i * 0.22);
        g.append("path")
          .attr("d", `M ${x - tierW / 2} ${tierY} L ${x} ${tierY - th * 0.42} L ${x + tierW / 2} ${tierY} Z`)
          .attr("fill", INK);
      }
      g.append("line")
        .attr("x1", x).attr("y1", y).attr("x2", x).attr("y2", y + size * 0.14)
        .attr("stroke", INK).attr("stroke-width", 0.6);
    } else {
      // Rounded deciduous silhouette (filled circle + trunk)
      const r = size * (0.28 + rng() * 0.1);
      const cy = y - r * 0.4;
      g.append("rect").attr("x", x - 0.7).attr("y", cy + r * 0.6).attr("width", 1.4).attr("height", r * 0.8).attr("fill", INK);
      g.append("circle").attr("cx", x).attr("cy", cy).attr("r", r).attr("fill", INK).attr("opacity", 0.88);
    }
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
    // Three hand-drawn hill variants — simple hump, rolling double-hump,
    // or hump with a small rocky crest.
    const variant = rng();
    if (variant < 0.55) {
      const count = 1 + Math.floor(rng() * 2);
      const spacing = size * 0.65;
      for (let i = 0; i < count; i++) {
        const cx = x + (i - (count - 1) / 2) * spacing + (rng() - 0.5) * size * 0.1;
        const w = size * (0.75 + rng() * 0.25);
        const h = size * (0.35 + rng() * 0.2);
        g.append("path")
          .attr("d", `M ${cx - w / 2} ${y} Q ${cx} ${y - h * 1.2} ${cx + w / 2} ${y}`)
          .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.9)
          .attr("stroke-linecap", "round").attr("opacity", 0.75);
      }
    } else if (variant < 0.85) {
      const w = size * (0.95 + rng() * 0.25);
      const h = size * (0.35 + rng() * 0.18);
      const mid = x + (rng() - 0.5) * size * 0.08;
      const midY = y - h * 0.4;
      g.append("path")
        .attr("d", `M ${x - w / 2} ${y}
                    Q ${x - w / 4} ${y - h * 1.2} ${mid} ${midY}
                    Q ${x + w / 4} ${y - h * 1.3} ${x + w / 2} ${y}`)
        .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.9)
        .attr("stroke-linecap", "round").attr("opacity", 0.75);
    } else {
      const w = size * (0.7 + rng() * 0.2);
      const h = size * (0.4 + rng() * 0.15);
      const cx = x + (rng() - 0.5) * size * 0.08;
      g.append("path")
        .attr("d", `M ${cx - w / 2} ${y} Q ${cx} ${y - h * 1.2} ${cx + w / 2} ${y}`)
        .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.9)
        .attr("stroke-linecap", "round").attr("opacity", 0.75);
      const rx = cx + (rng() - 0.5) * w * 0.15;
      const ry = y - h * 1.05;
      g.append("ellipse")
        .attr("cx", rx).attr("cy", ry).attr("rx", size * 0.1).attr("ry", size * 0.065)
        .attr("fill", INK).attr("opacity", 0.85);
    }
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
