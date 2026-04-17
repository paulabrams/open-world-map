// moonletters.js — "Moon Letters" style for Open World Map viewer
// Sparse blue-ink sketch inspired by Thror's Map. The red text
// only appears in moonlight. All rendering is self-contained;
// the host page supplies a render context (ctx).

window.MapStyles = window.MapStyles || {};

window.MapStyles.moonletters = {
  name: "Moon Letters",

  /* ── CSS custom-property values ─────────────────────────────── */
  css: {
    "--bg-color":      "#3a3428",
    "--panel-bg":      "#f0e6cc",
    "--panel-border":  "#5a7a9a",
    "--panel-text":    "#3a5a7a",
    "--panel-heading": "#3a5a7a",
    "--panel-type":    "#7a8a7a",
    "--title-color":   "#7a9ab8",
    "--btn-bg":        "#f0e6cc",
    "--btn-border":    "#5a7a9a",
    "--btn-text":      "#3a3428",
  },

  /* ── Palette ────────────────────────────────────────────────── */
  colors: {
    BLUE_INK:       "#3a6590",
    BLUE_LIGHT:     "#6a90b0",
    BLUE_FAINT:     "#90b0cc",
    RED_INK:        "#a03020",
    RED_LIGHT:      "#c05040",
    PARCHMENT:      "#f0e6cc",
    PARCHMENT_DARK: "#d8ccaa",
    DARK_INK:       "#3a3a30",
  },

  /* ── Node visibility filter ─────────────────────────────────── */
  filterNodes(nodes) {
    return nodes.filter(isOverlandNode);
  },

  /* ── Master render (called by core) ─────────────────────────── */
  render(ctx) {
    this.renderBackground(ctx);
    this.renderRunicBorder(ctx);
    MapCore.renderRiver(ctx, ctx.colors.BLUE_INK, 3);
    MapCore.renderBridges(ctx, { color: ctx.colors.BLUE_INK, strokeWidth: 1.0, bridgeLen: 14 });
    MapCore.renderRoad(ctx, ctx.colors.BLUE_INK, 2);
    this.renderLinks(ctx);
    this.renderTerrainSymbols(ctx);
    this.renderNodes(ctx);
    this.renderLabels(ctx);
    this.renderDayLabels(ctx);
    this.renderAnnotations(ctx);
    this.renderBeastSymbol(ctx);
    this.renderBeastMark(ctx);
    this.renderCompass(ctx);
    this.renderScaleBar(ctx);
    this.renderCartouche(ctx);
    this.renderCobweb(ctx);
    this.renderOffMapArrows(ctx);
  },

  /* ────────────────────────────────────────────────────────────
     Terrain drawing helpers
     ──────────────────────────────────────────────────────────── */

  drawMountainSketch(g, x, y, size, rng, colors) {
    const variant = Math.floor(rng() * 5);
    if (variant === 0) {
      this.drawPeakTwin(g, x, y, size, rng, colors);
    } else if (variant === 1) {
      this.drawPeakStubby(g, x, y, size, rng, colors);
    } else if (variant === 2) {
      this.drawPeakSingle(g, x - size * 0.7, y, size * 0.85, rng, colors);
      this.drawPeakSingle(g, x + size * 0.6, y + 1, size * 1.0, rng, colors);
    } else {
      this.drawPeakSingle(g, x, y, size, rng, colors);
    }
  },

  drawPeakSingle(g, x, y, size, rng, colors) {
    const { BLUE_INK } = colors;
    const w = size * (1.1 + rng() * 0.3);
    const h = size * (0.9 + rng() * 0.25);
    const peakShift = (rng() - 0.5) * w * 0.22;
    const px = x + peakShift;
    const py = y - h;
    const bl = x - w / 2;
    const br = x + w / 2;
    const lcx = (bl + px) / 2 - rng() * 0.8;
    const lcy = (y + py) / 2 + (rng() - 0.3) * 1.2;
    const rcx = (br + px) / 2 + rng() * 0.8;
    const rcy = (y + py) / 2 + (rng() - 0.3) * 1.2;

    g.append("path")
      .attr("d", `M ${bl} ${y} Q ${lcx} ${lcy} ${px} ${py} Q ${rcx} ${rcy} ${br} ${y}`)
      .attr("fill", "none")
      .attr("stroke", BLUE_INK)
      .attr("stroke-width", 1.0)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("opacity", 0.85);

    this.drawPeakShading(g, px, py, br, y, rng, colors, 3 + Math.floor(rng() * 2));
  },

  drawPeakTwin(g, x, y, size, rng, colors) {
    const { BLUE_INK } = colors;
    const w = size * (1.9 + rng() * 0.4);
    const h1 = size * (0.9 + rng() * 0.25);
    const h2 = size * (0.65 + rng() * 0.2);
    const leftTaller = rng() > 0.5;
    const hL = leftTaller ? h1 : h2;
    const hR = leftTaller ? h2 : h1;
    const px1 = x - w * 0.24;
    const py1 = y - hL;
    const px2 = x + w * 0.24;
    const py2 = y - hR;
    const valleyX = (px1 + px2) / 2 + (rng() - 0.5) * 1.5;
    const valleyY = y - Math.min(hL, hR) * (0.32 + rng() * 0.15);
    const bl = x - w / 2;
    const br = x + w / 2;

    g.append("path")
      .attr("d", `M ${bl} ${y} Q ${(bl + px1) / 2} ${(y + py1) / 2 + 0.5} ${px1} ${py1} L ${valleyX} ${valleyY} L ${px2} ${py2} Q ${(br + px2) / 2} ${(y + py2) / 2 + 0.5} ${br} ${y}`)
      .attr("fill", "none")
      .attr("stroke", BLUE_INK)
      .attr("stroke-width", 1.0)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("opacity", 0.85);

    this.drawPeakShading(g, px1, py1, valleyX, y, rng, colors, 2);
    this.drawPeakShading(g, px2, py2, br, y, rng, colors, 2 + Math.floor(rng() * 2));
  },

  drawPeakStubby(g, x, y, size, rng, colors) {
    const { BLUE_INK } = colors;
    const w = size * (1.5 + rng() * 0.3);
    const h = size * (0.7 + rng() * 0.2);
    const peakShift = (rng() - 0.5) * w * 0.15;
    const px = x + peakShift;
    const py = y - h;
    const bl = x - w / 2;
    const br = x + w / 2;

    g.append("path")
      .attr("d", `M ${bl} ${y} Q ${(bl + px) / 2 - 1} ${(y + py) / 2 + 1} ${px} ${py} Q ${(br + px) / 2 + 1} ${(y + py) / 2 + 1} ${br} ${y}`)
      .attr("fill", "none")
      .attr("stroke", BLUE_INK)
      .attr("stroke-width", 1.0)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("opacity", 0.85);

    this.drawPeakShading(g, px, py, br, y, rng, colors, 3 + Math.floor(rng() * 2));
  },

  drawPeakShading(g, px, py, baseEndX, baseY, rng, colors, nHatch) {
    const { BLUE_INK } = colors;
    for (let i = 0; i < nHatch; i++) {
      const t = 0.22 + (i / Math.max(1, nHatch - 1)) * 0.6 + (rng() - 0.5) * 0.05;
      const startX = px + (baseEndX - px) * t;
      const startY = py + (baseY - py) * t;
      const endOffset = (baseEndX - px) * 0.08;
      const endX = startX - endOffset + (rng() - 0.5) * 0.8;
      const endY = baseY - rng() * 1.0;
      g.append("line")
        .attr("x1", startX).attr("y1", startY)
        .attr("x2", endX).attr("y2", endY)
        .attr("stroke", BLUE_INK)
        .attr("stroke-width", 0.5)
        .attr("opacity", 0.55);
    }
  },

  drawSparseTree(g, x, y, size, rng, colors) {
    // Cluster of 2-4 small tree glyphs — mixes Y-shape and fir shape for variety
    const count = 2 + Math.floor(rng() * 3);
    const trees = [];
    for (let i = 0; i < count; i++) {
      trees.push({
        tx: x + (rng() - 0.5) * size * 1.3,
        ty: y + (rng() - 0.5) * size * 0.8,
        sz: size * (0.5 + rng() * 0.4),
        style: rng() > 0.4 ? "y" : "fir",
      });
    }
    trees.sort((a, b) => a.ty - b.ty);
    trees.forEach(t => {
      if (t.style === "y") this.drawTreeGlyphY(g, t.tx, t.ty, t.sz, rng, colors);
      else this.drawTreeGlyphFir(g, t.tx, t.ty, t.sz, rng, colors);
    });
  },

  drawTreeGlyphY(g, x, y, size, rng, colors) {
    const { BLUE_INK } = colors;
    const h = size * (0.9 + rng() * 0.25);
    const w = h * (0.5 + rng() * 0.2);
    const lean = (rng() - 0.5) * w * 0.15;
    g.append("line")
      .attr("x1", x).attr("y1", y + h * 0.35)
      .attr("x2", x + lean).attr("y2", y - h * 0.5)
      .attr("stroke", BLUE_INK).attr("stroke-width", 0.7)
      .attr("stroke-linecap", "round").attr("opacity", 0.78);
    g.append("line")
      .attr("x1", x - w * 0.05).attr("y1", y - h * 0.05)
      .attr("x2", x - w * 0.5).attr("y2", y - h * 0.4)
      .attr("stroke", BLUE_INK).attr("stroke-width", 0.6)
      .attr("stroke-linecap", "round").attr("opacity", 0.72);
    g.append("line")
      .attr("x1", x + w * 0.05).attr("y1", y - h * 0.05)
      .attr("x2", x + w * 0.5 + lean).attr("y2", y - h * 0.35)
      .attr("stroke", BLUE_INK).attr("stroke-width", 0.6)
      .attr("stroke-linecap", "round").attr("opacity", 0.72);
  },

  drawTreeGlyphFir(g, x, y, size, rng, colors) {
    const { BLUE_INK } = colors;
    const h = size * (1.0 + rng() * 0.3);
    const w = size * (0.5 + rng() * 0.2);
    // Trunk
    g.append("line")
      .attr("x1", x).attr("y1", y + h * 0.3)
      .attr("x2", x).attr("y2", y + h * 0.5)
      .attr("stroke", BLUE_INK).attr("stroke-width", 0.6).attr("opacity", 0.75);
    // Two or three downward V-tiers suggesting fir fronds
    const tiers = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers;
      const tierY = y - h * 0.55 + t * h * 0.75;
      const tierW = w * (0.4 + t * 0.6);
      g.append("path")
        .attr("d", `M ${x - tierW / 2} ${tierY + 2} L ${x} ${tierY - 3} L ${x + tierW / 2} ${tierY + 2}`)
        .attr("fill", "none")
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.6)
        .attr("stroke-linejoin", "round").attr("opacity", 0.75);
    }
  },

  drawSwampMark(g, x, y, size, rng, colors) {
    const { BLUE_INK } = colors;
    // Wavy water ripple lines
    const rippleCount = 3 + Math.floor(rng() * 2);
    for (let i = 0; i < rippleCount; i++) {
      const ly = y - size * 0.2 + i * size * 0.28 + (rng() - 0.5) * 2;
      const lx = x - size * 0.45;
      const w = size * (0.9 + rng() * 0.3);
      const amp = size * (0.08 + rng() * 0.04);
      const d = `M ${lx} ${ly} Q ${lx + w * 0.25} ${ly - amp} ${lx + w * 0.5} ${ly} Q ${lx + w * 0.75} ${ly + amp} ${lx + w} ${ly}`;
      g.append("path")
        .attr("d", d)
        .attr("fill", "none")
        .attr("stroke", BLUE_INK)
        .attr("stroke-width", 0.55)
        .attr("opacity", 0.5);
    }
    // Small reed tufts scattered above
    const tufts = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < tufts; i++) {
      const rx = x + (rng() - 0.5) * size * 0.8;
      const ry = y - size * 0.15;
      for (let b = 0; b < 3; b++) {
        const bx = rx + (b - 1) * 1.2;
        g.append("line")
          .attr("x1", bx).attr("y1", ry)
          .attr("x2", bx + (rng() - 0.5) * 1.0).attr("y2", ry - size * (0.2 + rng() * 0.1))
          .attr("stroke", BLUE_INK).attr("stroke-width", 0.5).attr("opacity", 0.55);
      }
    }
  },

  drawDesolationDots(g, x, y, size, rng, colors) {
    const { BLUE_INK } = colors;
    // Sparse dots (desolation) mixed with occasional tiny tick marks
    const dotCount = 7 + Math.floor(rng() * 5);
    for (let i = 0; i < dotCount; i++) {
      const dx = (rng() - 0.5) * size * 1.5;
      const dy = (rng() - 0.5) * size * 0.9;
      g.append("circle")
        .attr("cx", x + dx).attr("cy", y + dy)
        .attr("r", 0.7 + rng() * 0.5)
        .attr("fill", BLUE_INK)
        .attr("opacity", 0.45);
    }
    // A few tiny tick marks — Thror's subtle ground-detail touch
    const tickCount = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < tickCount; i++) {
      const tx = x + (rng() - 0.5) * size * 1.3;
      const ty = y + (rng() - 0.5) * size * 0.8;
      const len = 1.5 + rng() * 1.0;
      g.append("line")
        .attr("x1", tx).attr("y1", ty)
        .attr("x2", tx + (rng() - 0.5) * 0.8).attr("y2", ty - len)
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.45)
        .attr("stroke-linecap", "round").attr("opacity", 0.5);
    }
  },

  drawHill(g, x, y, size, rng, colors) {
    const { BLUE_INK } = colors;
    // Gentle cluster of 2-3 faint hillocks
    const count = 2 + Math.floor(rng() * 2);
    const spacing = size * 0.5;
    const humps = [];
    for (let i = 0; i < count; i++) {
      humps.push({
        cx: x + (i - (count - 1) / 2) * spacing + (rng() - 0.5) * size * 0.15,
        w: size * (0.85 + rng() * 0.4),
        h: size * (0.38 + rng() * 0.25),
      });
    }
    humps.sort((a, b) => b.h - a.h);
    humps.forEach(({ cx, w, h }) => {
      const peakOff = (rng() - 0.5) * w * 0.12;
      g.append("path")
        .attr("d", `M ${cx - w/2} ${y} Q ${cx - w/4 + peakOff} ${y - h} ${cx + peakOff} ${y - h} Q ${cx + w/4 + peakOff} ${y - h} ${cx + w/2} ${y}`)
        .attr("fill", "none")
        .attr("stroke", BLUE_INK)
        .attr("stroke-width", 0.7)
        .attr("opacity", 0.5);
    });
  },

  drawFarm(g, x, y, size, rng, colors) {
    const { BLUE_INK } = colors;
    // 2-3 small farm buildings clustered, with furrows fanning out
    const buildings = 2 + Math.floor(rng() * 2);
    const spacing = size * 0.45;
    for (let b = 0; b < buildings; b++) {
      const bx = x + (b - (buildings - 1) / 2) * spacing + (rng() - 0.5) * 1;
      const by = y + (rng() - 0.5) * size * 0.2;
      const bw = size * (0.22 + rng() * 0.15);
      const bh = size * (0.16 + rng() * 0.12);
      g.append("rect")
        .attr("x", bx - bw / 2).attr("y", by - bh / 2)
        .attr("width", bw).attr("height", bh)
        .attr("fill", "none").attr("stroke", BLUE_INK)
        .attr("stroke-width", 0.55).attr("opacity", 0.7);
      g.append("path")
        .attr("d", `M ${bx - bw / 2 - 0.3} ${by - bh / 2} L ${bx} ${by - bh / 2 - bh * 0.7} L ${bx + bw / 2 + 0.3} ${by - bh / 2}`)
        .attr("fill", "none").attr("stroke", BLUE_INK)
        .attr("stroke-width", 0.55).attr("opacity", 0.7);
    }
    // Furrows on both sides
    const furrowCount = 4 + Math.floor(rng() * 3);
    for (let i = 0; i < furrowCount; i++) {
      const side = i < furrowCount / 2 ? -1 : 1;
      const dist = size * (0.55 + (i % Math.ceil(furrowCount / 2)) * 0.18);
      const fx = x + side * dist;
      g.append("line")
        .attr("x1", fx).attr("y1", y - size * 0.25)
        .attr("x2", fx).attr("y2", y + size * 0.25)
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.35).attr("opacity", 0.35);
    }
  },

  /* ────────────────────────────────────────────────────────────
     Render methods — ported from treasuremap.html
     ──────────────────────────────────────────────────────────── */

  renderTerrainSymbols(ctx) {
    const { g, colors } = ctx;
    const terrainGroup = g.append("g").attr("class", "terrain");

    // Draw terrain from hex_terrain data
    const style = this;
    MapCore.renderHexTerrain(ctx, {
      "forest": (tg, x, y, sz, rng) => style.drawSparseTree(tg, x, y, sz, rng, colors),
      "forested-hills": (tg, x, y, sz, rng) => { style.drawHill(tg, x, y, sz, rng, colors); style.drawSparseTree(tg, x - 6, y - 4, sz * 0.8, rng, colors); },
      "mountains": (tg, x, y, sz, rng) => style.drawMountainSketch(tg, x, y, sz, rng, colors),
      "hills": (tg, x, y, sz, rng) => style.drawHill(tg, x, y, sz, rng, colors),
      "swamp": (tg, x, y, sz, rng) => style.drawSwampMark(tg, x, y, sz, rng, colors),
      "farmland": (tg, x, y, sz, rng) => style.drawFarm(tg, x, y, sz, rng, colors),
      "plains": (tg, x, y, sz, rng) => style.drawDesolationDots(tg, x, y, sz, rng, colors),
      "graveyard": (tg, x, y, sz, rng) => style.drawGraveyard(tg, x, y, sz, rng, colors),
    });
    MapCore.renderTerrainEdges(ctx, ["forest", "forested-hills"], {
      color: colors.BLUE_FAINT, strokeWidth: 0.7, opacity: 0.5, wobble: 2.5, className: "forest-edges",
    });
  },

  drawGraveyard(g, x, y, size, rng, colors) {
    const { BLUE_INK } = colors;
    const count = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const gx = x + (rng() - 0.5) * size * 1.1;
      const gy = y + (rng() - 0.5) * size * 0.6;
      const gh = size * (0.3 + rng() * 0.15);
      const gw = gh * 0.55;
      // All crosses in Thror's sparse ink style
      g.append("line")
        .attr("x1", gx).attr("y1", gy - gh * 0.45)
        .attr("x2", gx).attr("y2", gy + gh * 0.45)
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.6).attr("opacity", 0.7);
      g.append("line")
        .attr("x1", gx - gw * 0.5).attr("y1", gy - gh * 0.2)
        .attr("x2", gx + gw * 0.5).attr("y2", gy - gh * 0.2)
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.6).attr("opacity", 0.7);
    }
  },

  renderNodes(ctx) {
    const { g, nodes, colors } = ctx;
    const { BLUE_INK, RED_INK } = colors;
    const nodeGroup = g.append("g").attr("class", "nodes");

    nodes.forEach(node => {
      const ng = nodeGroup.append("g")
        .attr("transform", `translate(${node.x}, ${node.y})`)
        .attr("class", "node")
        .style("cursor", "pointer")
        .on("click", (event) => { event.stopPropagation(); MapCore.showDetail(node); });

      const isLocal = node.scale === "local";
      const s = isLocal ? 3.5 : 5;
      const isDanger = node.point_type === "lair" || node.point_type === "dungeon";
      const color = isDanger ? RED_INK : BLUE_INK;

      // Farm override
      if (node.name && node.name.toLowerCase().includes("farm")) {
        ng.append("rect").attr("x", -s).attr("y", -s*0.5).attr("width", s*2).attr("height", s*1.5)
          .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.6);
        ng.append("path")
          .attr("d", `M ${-s-1} ${-s*0.5} L 0 ${-s*1.5} L ${s+1} ${-s*0.5}`)
          .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.6);
        ng.append("line").attr("x1", 0).attr("y1", s*0.1).attr("x2", 0).attr("y2", s*1.0)
          .attr("stroke", BLUE_INK).attr("stroke-width", 0.5);
        for (let fi = 0; fi < 3; fi++) {
          ng.append("line")
            .attr("x1", s + 3 + fi * 3).attr("y1", s*0.5)
            .attr("x2", s + 3 + fi * 3).attr("y2", s*1.0)
            .attr("stroke", BLUE_INK).attr("stroke-width", 0.5).attr("opacity", 0.5);
        }
      } else switch (node.point_type) {
        case "heart": {
          const hs = 3.5;
          const positions = [{x:0, y:0}, {x:-hs*1.2, y:hs*0.2}, {x:hs*1.2, y:hs*0.1}, {x:0, y:-hs*0.9}];
          positions.forEach(p => {
            ng.append("rect").attr("x", p.x - hs*0.45).attr("y", p.y - hs*0.2).attr("width", hs*0.9).attr("height", hs*0.65)
              .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.6);
            ng.append("path")
              .attr("d", `M ${p.x - hs*0.55} ${p.y - hs*0.2} L ${p.x} ${p.y - hs*0.75} L ${p.x + hs*0.55} ${p.y - hs*0.2}`)
              .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.6);
          });
          break;
        }
        case "fortress": {
          const hs = 4;
          ng.append("rect").attr("x", -hs).attr("y", -hs*0.35).attr("width", hs*2).attr("height", hs*0.8)
            .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.7);
          ng.append("rect").attr("x", -hs*0.3).attr("y", -hs).attr("width", hs*0.6).attr("height", hs*1.45)
            .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.7);
          for (let ci = 0; ci < 2; ci++) {
            ng.append("rect").attr("x", -hs*0.2 + ci * hs*0.25).attr("y", -hs - hs*0.18).attr("width", hs*0.15).attr("height", hs*0.18)
              .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.5);
          }
          ng.append("path")
            .attr("d", `M ${-hs*0.2} ${hs*0.45} L ${-hs*0.2} ${hs*0.1} A ${hs*0.2} ${hs*0.2} 0 0 1 ${hs*0.2} ${hs*0.1} L ${hs*0.2} ${hs*0.45}`)
            .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.6);
          break;
        }
        case "tavern": {
          const hs = isLocal ? 2.5 : 3.5;
          ng.append("rect").attr("x", -hs*0.7).attr("y", -hs*0.3).attr("width", hs*1.4).attr("height", hs)
            .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.6);
          ng.append("path")
            .attr("d", `M ${-hs*0.8} ${-hs*0.3} L 0 ${-hs*1.1} L ${hs*0.8} ${-hs*0.3}`)
            .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.6);
          ng.append("line").attr("x1", hs*0.7).attr("y1", -hs*0.1).attr("x2", hs*1.2).attr("y2", -hs*0.1)
            .attr("stroke", BLUE_INK).attr("stroke-width", 0.4);
          ng.append("rect").attr("x", hs*1.0).attr("y", -hs*0.1).attr("width", hs*0.4).attr("height", hs*0.35)
            .attr("fill", BLUE_INK).attr("stroke", "none").attr("opacity", 0.5);
          break;
        }
        case "settlement": {
          const hs = isLocal ? 2.5 : 3.5;
          for (let hi = 0; hi < 2; hi++) {
            const hx = (hi - 0.5) * hs * 1.4;
            const hy = (hi % 2) * hs * 0.3;
            ng.append("rect").attr("x", hx - hs*0.6).attr("y", hy - hs*0.3).attr("width", hs*1.2).attr("height", hs*0.9)
              .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.6);
            ng.append("path")
              .attr("d", `M ${hx - hs*0.7} ${hy - hs*0.3} L ${hx} ${hy - hs} L ${hx + hs*0.7} ${hy - hs*0.3}`)
              .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.6);
          }
          break;
        }
        case "wilderness":
          ng.append("circle").attr("r", s).attr("fill", "none").attr("stroke", color).attr("stroke-width", 0.8);
          break;
        case "dungeon": {
          const d = s * 1.2;
          ng.append("line").attr("x1", -d).attr("y1", -d).attr("x2", d).attr("y2", d)
            .attr("stroke", color).attr("stroke-width", 1.5);
          ng.append("line").attr("x1", d).attr("y1", -d).attr("x2", -d).attr("y2", d)
            .attr("stroke", color).attr("stroke-width", 1.5);
          break;
        }
        case "sanctuary":
          ng.append("circle").attr("r", s).attr("fill", "none").attr("stroke", color).attr("stroke-width", 0.8);
          ng.append("circle").attr("r", 1.5).attr("fill", color);
          break;
        case "tower":
          ng.append("line").attr("x1", 0).attr("y1", -s - 3).attr("x2", 0).attr("y2", s + 1)
            .attr("stroke", color).attr("stroke-width", 1.0);
          ng.append("circle").attr("cx", 0).attr("cy", -s - 4).attr("r", 1.5)
            .attr("fill", color);
          break;
        case "ruin":
          ng.append("rect").attr("x", -s).attr("y", -s).attr("width", s*2).attr("height", s*2)
            .attr("fill", "none").attr("stroke", color).attr("stroke-width", 0.8)
            .attr("stroke-dasharray", "2 2").attr("opacity", 0.7);
          break;
        case "waypoint":
          ng.append("circle").attr("r", 2).attr("fill", color).attr("opacity", 0.6);
          break;
        case "lair": {
          const d = s * 1.3;
          ng.append("line").attr("x1", -d).attr("y1", -d).attr("x2", d).attr("y2", d)
            .attr("stroke", color).attr("stroke-width", 2.0);
          ng.append("line").attr("x1", d).attr("y1", -d).attr("x2", -d).attr("y2", d)
            .attr("stroke", color).attr("stroke-width", 2.0);
          break;
        }
        default:
          ng.append("circle").attr("r", 3).attr("fill", color).attr("opacity", 0.6);
      }
    });
  },

  renderLinks(ctx) {
    const { g, links, colors, mulberry32, seedFromString } = ctx;
    const { BLUE_INK } = colors;
    const linkGroup = g.append("g").attr("class", "links");

    links.forEach(link => {
      const sx = link.source.x, sy = link.source.y;
      const tx = link.target.x, ty = link.target.y;

      const dx = tx - sx, dy = ty - sy;
      const len = Math.sqrt(dx * dx + dy * dy);
      const rng = mulberry32(seedFromString(link.name || "link"));
      const curvature = (rng() - 0.5) * len * 0.12;
      const nx = -dy / len, ny = dx / len;
      const cx = (sx + tx) / 2 + nx * curvature;
      const cy = (sy + ty) / 2 + ny * curvature;

      if (link.path_type === "river") {
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
          .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 1.2)
          .attr("stroke-linecap", "round");
        linkGroup.append("path").attr("d", lineGen(offsetBank(spine, -1)))
          .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 1.2)
          .attr("stroke-linecap", "round");
        return;
      }

      const pathD = `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;

      const path = linkGroup.append("path")
        .attr("d", pathD)
        .attr("fill", "none")
        .attr("stroke", BLUE_INK)
        .attr("stroke-linecap", "round");

      switch (link.path_type) {
        case "road":
          path.attr("stroke-width", 2.0);
          break;
        case "trail":
          path.attr("stroke-width", 1.0).attr("stroke-dasharray", "5 4");
          break;
        case "wilderness":
          path.attr("stroke-width", 0.8).attr("stroke-dasharray", "2 4");
          break;
        default:
          path.attr("stroke-width", 1.2);
      }
    });
  },

  renderDayLabels(ctx) {
    const { BLUE_LIGHT, PARCHMENT } = ctx.colors;
    MapCore.renderDayLabelsAlongLinks(ctx, {
      color: BLUE_LIGHT, strokeColor: PARCHMENT, fontSize: 9, offset: 8,
    });
  },

  renderLabels(ctx) {
    const { g, nodes, colors, FONT } = ctx;
    const { BLUE_INK, BLUE_LIGHT, RED_INK, PARCHMENT } = colors;
    const labelGroup = g.append("g").attr("class", "labels");

    nodes.forEach(node => {
      const isLocal = node.scale === "local";
      const isDanger = node.point_type === "lair" || node.point_type === "dungeon";
      const isImportant = node.point_type === "heart" || node.point_type === "fortress";
      const fontSize = isLocal ? 10 : (isImportant ? 16 : 13);
      const color = isDanger ? RED_INK : (isLocal ? BLUE_LIGHT : BLUE_INK);
      const yOffset = isLocal ? 12 : 16;

      const text = labelGroup.append("text")
        .attr("x", node.x)
        .attr("y", node.y + yOffset)
        .attr("text-anchor", "middle")
        .attr("font-family", FONT)
        .attr("font-size", fontSize + "px")
        .attr("font-style", "italic")
        .attr("fill", color)
        .attr("stroke", PARCHMENT)
        .attr("stroke-width", 2.5)
        .attr("paint-order", "stroke")
        .text(node.name);

      if (isImportant) {
        text.attr("letter-spacing", "2.5px");
        // Thin decorative underline beneath the name, Thror's-style
        const approxWidth = (node.name || "").length * fontSize * 0.5;
        const ulY = node.y + yOffset + fontSize * 0.35;
        labelGroup.append("line")
          .attr("x1", node.x - approxWidth / 2).attr("y1", ulY)
          .attr("x2", node.x + approxWidth / 2).attr("y2", ulY)
          .attr("stroke", color).attr("stroke-width", 0.6).attr("opacity", 0.65);
      }
    });
  },

  renderRunicBorder(ctx) {
    const { g, bounds, colors, mulberry32 } = ctx;
    const { BLUE_INK, BLUE_LIGHT, RED_INK } = colors;
    const pad = 50;
    const x = bounds.minX - pad;
    const y = bounds.minY - pad;
    const w = bounds.maxX - bounds.minX + pad * 2;
    const h = bounds.maxY - bounds.minY + pad * 2;

    // Single thin blue border
    g.append("rect")
      .attr("x", x).attr("y", y)
      .attr("width", w).attr("height", h)
      .attr("fill", "none")
      .attr("stroke", BLUE_LIGHT)
      .attr("stroke-width", 1.2)
      .attr("opacity", 0.8);

    // Decorative corner marks
    const cm = 12;
    const corners = [
      [x, y], [x + w, y], [x, y + h], [x + w, y + h]
    ];
    corners.forEach(([cx, cy]) => {
      const sx = cx === x ? 1 : -1;
      const sy = cy === y ? 1 : -1;
      g.append("line")
        .attr("x1", cx).attr("y1", cy)
        .attr("x2", cx + cm * sx).attr("y2", cy)
        .attr("stroke", BLUE_INK).attr("stroke-width", 1.0);
      g.append("line")
        .attr("x1", cx).attr("y1", cy)
        .attr("x2", cx).attr("y2", cy + cm * sy)
        .attr("stroke", BLUE_INK).attr("stroke-width", 1.0);
    });

    // Small red runic block, upper-left (outside border) — echoes Thror's Map
    this.drawRuneBlock(g, {
      x: x - 62, y: y + 18,
      cols: 4, rows: 5,
      cellW: 12, cellH: 18,
      color: RED_INK, seed: 42, strokeWidth: 0.9, opacity: 0.75,
    }, mulberry32);

    // Larger blue runic block, right-middle (outside border)
    this.drawRuneBlock(g, {
      x: x + w + 18, y: y + h * 0.32,
      cols: 5, rows: 6,
      cellW: 14, cellH: 20,
      color: BLUE_INK, seed: 271, strokeWidth: 1.1, opacity: 0.8,
    }, mulberry32);
  },

  drawRuneBlock(g, opts, mulberry32) {
    const { x, y, cols, rows, cellW, cellH, color, seed, strokeWidth, opacity } = opts;
    const r = mulberry32(seed);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cx = x + col * cellW + cellW / 2;
        const cy = y + row * cellH;
        this.drawRuneGlyph(g, cx, cy, cellW, cellH, r, color, strokeWidth, opacity);
      }
    }
  },

  drawRuneGlyph(g, cx, cy, w, h, rand, color, strokeWidth, opacity) {
    const glyphH = h * 0.78;
    // Main vertical stave
    g.append("line")
      .attr("x1", cx).attr("y1", cy)
      .attr("x2", cx).attr("y2", cy + glyphH)
      .attr("stroke", color).attr("stroke-width", strokeWidth).attr("opacity", opacity);
    // Upper diagonal (common)
    if (rand() > 0.15) {
      const ty = cy + glyphH * (0.1 + rand() * 0.25);
      const dir = rand() > 0.5 ? 1 : -1;
      g.append("line")
        .attr("x1", cx).attr("y1", ty)
        .attr("x2", cx + w * 0.35 * dir).attr("y2", ty - glyphH * 0.1)
        .attr("stroke", color).attr("stroke-width", strokeWidth * 0.9).attr("opacity", opacity);
    }
    // Crossbar or X (fairly common)
    if (rand() > 0.35) {
      const ty = cy + glyphH * (0.35 + rand() * 0.2);
      g.append("line")
        .attr("x1", cx - w * 0.35).attr("y1", ty + 1)
        .attr("x2", cx + w * 0.35).attr("y2", ty - 1)
        .attr("stroke", color).attr("stroke-width", strokeWidth * 0.85).attr("opacity", opacity);
    }
    // Lower diagonal (less common)
    if (rand() > 0.55) {
      const ty = cy + glyphH * (0.55 + rand() * 0.2);
      const dir = rand() > 0.5 ? 1 : -1;
      g.append("line")
        .attr("x1", cx).attr("y1", ty)
        .attr("x2", cx + w * 0.3 * dir).attr("y2", ty + glyphH * 0.15)
        .attr("stroke", color).attr("stroke-width", strokeWidth * 0.85).attr("opacity", opacity);
    }
  },

  renderScaleBar(ctx) {
    const { g, bounds, colors, HINT_SCALE, FONT } = ctx;
    const { BLUE_INK, PARCHMENT } = colors;
    const milesPerInch = 6;
    const barSegments = 3;
    const segLen = HINT_SCALE;
    const barW = barSegments * segLen;
    const barH = 6;
    const bx = bounds.maxX - barW - 10;
    const by = bounds.maxY + 30;

    const sg = g.append("g").attr("class", "scale-bar");

    for (let i = 0; i < barSegments; i++) {
      sg.append("rect")
        .attr("x", bx + i * segLen).attr("y", by)
        .attr("width", segLen).attr("height", barH)
        .attr("fill", i % 2 === 0 ? BLUE_INK : PARCHMENT)
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.8);
    }

    for (let i = 0; i <= barSegments; i++) {
      sg.append("text")
        .attr("x", bx + i * segLen).attr("y", by + barH + 12)
        .attr("text-anchor", "middle")
        .attr("font-family", FONT)
        .attr("font-size", "8px")
        .attr("fill", BLUE_INK)
        .text(i * milesPerInch);
    }

    sg.append("text")
      .attr("x", bx + barW / 2).attr("y", by + barH + 24)
      .attr("text-anchor", "middle")
      .attr("font-family", FONT)
      .attr("font-size", "9px")
      .attr("font-style", "italic")
      .attr("fill", BLUE_INK)
      .text("Miles");
  },

  renderCartouche(ctx) {
    const { g, bounds, meta, colors, FONT } = ctx;
    const { BLUE_INK, BLUE_LIGHT } = colors;
    const bx = bounds.minX - 30;
    const by = bounds.maxY + 25;

    g.append("text")
      .attr("x", bx)
      .attr("y", by)
      .attr("text-anchor", "start")
      .attr("font-family", FONT)
      .attr("font-size", "13px")
      .attr("font-style", "italic")
      .attr("fill", BLUE_INK)
      .attr("opacity", 0.7)
      .text(meta.campaign);

    if (meta.region) {
      g.append("text")
        .attr("x", bx)
        .attr("y", by + 15)
        .attr("text-anchor", "start")
        .attr("font-family", FONT)
        .attr("font-size", "10px")
        .attr("font-style", "italic")
        .attr("fill", BLUE_LIGHT)
        .attr("opacity", 0.6)
        .text(meta.region + (meta.world ? ", " + meta.world : ""));
    }

    if (meta.era) {
      g.append("text")
        .attr("x", bx)
        .attr("y", by + 28)
        .attr("text-anchor", "start")
        .attr("font-family", FONT)
        .attr("font-size", "9px")
        .attr("font-style", "italic")
        .attr("fill", BLUE_LIGHT)
        .attr("opacity", 0.5)
        .text(meta.era);
    }

    const textLen = meta.campaign.length * 6.5;
    g.append("line")
      .attr("x1", bx).attr("y1", by + 3)
      .attr("x2", bx + textLen).attr("y2", by + 3)
      .attr("stroke", BLUE_INK).attr("stroke-width", 0.4).attr("opacity", 0.5);
  },

  // Cobweb tucked into the bottom-left inside corner of the border,
  // echoing Thror's Map's distinctive Thror's-Map-cartouche decoration.
  renderCobweb(ctx) {
    const { g, bounds, colors } = ctx;
    const { BLUE_INK } = colors;
    const pad = 50;
    const cornerX = bounds.minX - pad;
    const cornerY = bounds.maxY + pad;
    // Web anchors at the corner and sweeps outward / upward
    const radii = [18, 30, 42, 54];
    const angles = [-10, -25, -45, -65, -80]; // degrees, measuring up-right from the corner
    const toRad = d => (d * Math.PI) / 180;

    const cg = g.append("g").attr("class", "cobweb").attr("opacity", 0.75);

    // Radial spokes (from corner outward)
    angles.forEach(deg => {
      const rad = toRad(deg);
      const maxR = radii[radii.length - 1] + 2;
      const ex = cornerX + Math.cos(rad) * maxR;
      const ey = cornerY + Math.sin(rad) * maxR;
      cg.append("line")
        .attr("x1", cornerX).attr("y1", cornerY)
        .attr("x2", ex).attr("y2", ey)
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.5).attr("opacity", 0.8);
    });

    // Concentric sagging curves connecting adjacent spokes
    for (let ri = 0; ri < radii.length; ri++) {
      const r = radii[ri];
      for (let ai = 0; ai < angles.length - 1; ai++) {
        const a1 = toRad(angles[ai]);
        const a2 = toRad(angles[ai + 1]);
        const x1 = cornerX + Math.cos(a1) * r;
        const y1 = cornerY + Math.sin(a1) * r;
        const x2 = cornerX + Math.cos(a2) * r;
        const y2 = cornerY + Math.sin(a2) * r;
        // Sag slightly toward the corner (gravity-style curve)
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const cornerDir = [(cornerX - mx), (cornerY - my)];
        const cornerLen = Math.sqrt(cornerDir[0] ** 2 + cornerDir[1] ** 2) || 1;
        const sag = 2 + ri * 0.8;
        const cpx = mx + (cornerDir[0] / cornerLen) * sag;
        const cpy = my + (cornerDir[1] / cornerLen) * sag;
        cg.append("path")
          .attr("d", `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`)
          .attr("fill", "none")
          .attr("stroke", BLUE_INK).attr("stroke-width", 0.45).attr("opacity", 0.7);
      }
    }
  },

  renderAnnotations(ctx) {
    const { g, nodes, colors, mulberry32, seedFromString, FONT } = ctx;
    const { BLUE_INK, RED_INK, PARCHMENT } = colors;
    const annotGroup = g.append("g").attr("class", "annotations");

    nodes.forEach(node => {
      const isLocal = node.scale === "local";
      if (isLocal) return;

      const rng = mulberry32(seedFromString(node.id + "-annotation"));
      const isDanger = node.point_type === "lair" || node.point_type === "dungeon";

      const angle = (rng() - 0.5) * Math.PI * 1.5;
      const dist = 45 + rng() * 15;

      const ax = node.x + Math.cos(angle) * dist;
      const ay = node.y + Math.sin(angle) * dist;

      // Connector squiggle from annotation toward the node — Thror's-style pointer.
      // Use a gentle curve with small ticks so it reads as hand-drawn.
      const connectorColor = isDanger ? RED_INK : BLUE_INK;
      const nearAnnotX = node.x + Math.cos(angle) * (dist - 18);
      const nearAnnotY = node.y + Math.sin(angle) * (dist - 18);
      const nearNodeX = node.x + Math.cos(angle) * 14;
      const nearNodeY = node.y + Math.sin(angle) * 14;
      // Midpoint offset for a subtle S-curve
      const midX = (nearAnnotX + nearNodeX) / 2 + Math.cos(angle + Math.PI / 2) * 3;
      const midY = (nearAnnotY + nearNodeY) / 2 + Math.sin(angle + Math.PI / 2) * 3;
      annotGroup.append("path")
        .attr("d", `M ${nearAnnotX} ${nearAnnotY} Q ${midX} ${midY} ${nearNodeX} ${nearNodeY}`)
        .attr("fill", "none")
        .attr("stroke", connectorColor)
        .attr("stroke-width", 0.55)
        .attr("stroke-linecap", "round")
        .attr("stroke-dasharray", "2 2.5")
        .attr("opacity", 0.55);
      // Small dot at the node end of the connector
      annotGroup.append("circle")
        .attr("cx", nearNodeX).attr("cy", nearNodeY).attr("r", 0.9)
        .attr("fill", connectorColor).attr("opacity", 0.7);

      let phrase;
      if (node.description) {
        const limit = 25 + Math.floor(rng() * 5);
        if (node.description.length > limit) {
          let cut = node.description.lastIndexOf(" ", limit);
          if (cut < 20) cut = limit;
          phrase = node.description.slice(0, cut) + "\u2026";
        } else {
          phrase = node.description;
        }
      } else {
        const flavorPhrases = [
          "here of old was a place of note",
          "known to few who wander far",
          "travellers rest upon this ground",
          "the road goes ever on from here"
        ];
        phrase = flavorPhrases[Math.floor(rng() * flavorPhrases.length)];
      }

      const color = isDanger ? RED_INK : BLUE_INK;
      const rotation = (rng() - 0.5) * 16;

      let line1 = phrase, line2 = null;
      if (phrase.length > 24) {
        const mid = Math.floor(phrase.length / 2);
        let splitAt = phrase.lastIndexOf(" ", mid + 5);
        if (splitAt < mid - 8) splitAt = phrase.indexOf(" ", mid);
        if (splitAt > 0) {
          line1 = phrase.slice(0, splitAt);
          line2 = phrase.slice(splitAt + 1);
        }
      }

      const text = annotGroup.append("text")
        .attr("x", ax).attr("y", ay)
        .attr("text-anchor", "middle")
        .attr("transform", `rotate(${rotation}, ${ax}, ${ay})`)
        .attr("font-family", "'Palatino Linotype', serif")
        .attr("font-size", "10px")
        .attr("font-style", "italic")
        .attr("fill", color)
        .attr("stroke", PARCHMENT)
        .attr("stroke-width", 2.5)
        .attr("paint-order", "stroke");

      text.append("tspan")
        .attr("x", ax).attr("dy", 0)
        .text(line1);

      if (line2) {
        text.append("tspan")
          .attr("x", ax).attr("dy", "1.15em")
          .text(line2);
      }
    });
  },

  renderBeastSymbol(ctx) {
    const { g, nodes, colors, mulberry32, seedFromString } = ctx;
    const { RED_INK } = colors;

    let beast = nodes.find(n => n.point_type === "lair");
    if (!beast) beast = nodes.find(n => n.point_type === "dungeon");
    if (!beast) return;

    const rng = mulberry32(seedFromString(beast.id + "-beast"));
    const angle = rng() * Math.PI * 2;
    const dist = 55 + rng() * 20;
    const bx = beast.x + Math.cos(angle) * dist;
    const by = beast.y + Math.sin(angle) * dist;

    const bg = g.append("g")
      .attr("transform", `translate(${bx}, ${by}) scale(1.4)`)
      .attr("opacity", 0.75);

    // Serpentine body (spine)
    bg.append("path")
      .attr("d", "M -8 2 C -2 -3, 6 -4, 14 -10 C 22 -16, 30 -12, 36 -7 C 42 -2, 46 4, 52 6")
      .attr("fill", "none")
      .attr("stroke", RED_INK)
      .attr("stroke-width", 1.8)
      .attr("stroke-linecap", "round");

    // Left wing: membrane with finger ribs
    bg.append("path")
      .attr("d", "M 10 -8 C 4 -24, -4 -28, -12 -22 C -10 -17, -4 -13, 2 -12 C 0 -14, 0 -17, 2 -19 C 4 -14, 6 -11, 10 -8 Z")
      .attr("fill", RED_INK).attr("opacity", 0.2)
      .attr("stroke", RED_INK).attr("stroke-width", 0.9);
    // Wing rib ticks
    bg.append("path")
      .attr("d", "M 10 -8 C 6 -14, 2 -19, -2 -22 M 10 -8 C 4 -12, -2 -16, -8 -21")
      .attr("fill", "none").attr("stroke", RED_INK)
      .attr("stroke-width", 0.5).attr("opacity", 0.7);

    // Right wing
    bg.append("path")
      .attr("d", "M 22 -13 C 28 -28, 38 -30, 44 -22 C 42 -17, 36 -14, 30 -13 C 32 -16, 34 -18, 34 -22 C 30 -18, 26 -15, 22 -13 Z")
      .attr("fill", RED_INK).attr("opacity", 0.2)
      .attr("stroke", RED_INK).attr("stroke-width", 0.9);
    bg.append("path")
      .attr("d", "M 22 -13 C 28 -20, 34 -25, 38 -27 M 22 -13 C 30 -17, 36 -22, 40 -26")
      .attr("fill", "none").attr("stroke", RED_INK)
      .attr("stroke-width", 0.5).attr("opacity", 0.7);

    // Head with snout + eye
    bg.append("path")
      .attr("d", "M -8 2 L -14 -1 L -12 4 Z")
      .attr("fill", RED_INK).attr("opacity", 0.85);
    bg.append("circle")
      .attr("cx", -10).attr("cy", 0.5).attr("r", 0.5)
      .attr("fill", "#f0e6cc").attr("opacity", 0.9);

    // Puff of smoke / breath curl in front of head
    bg.append("path")
      .attr("d", "M -14 -1 C -18 -3, -22 -2, -22 -5 C -22 -7, -20 -8, -18 -7 M -20 -7 C -21 -10, -19 -12, -17 -10")
      .attr("fill", "none").attr("stroke", RED_INK)
      .attr("stroke-width", 0.7).attr("opacity", 0.55)
      .attr("stroke-linecap", "round");

    // Long swooping tail with arrow tip
    bg.append("path")
      .attr("d", "M 44 2 C 50 6, 56 8, 60 6 M 60 6 L 58 9 M 60 6 L 63 5")
      .attr("fill", "none").attr("stroke", RED_INK)
      .attr("stroke-width", 1.3).attr("stroke-linecap", "round")
      .attr("opacity", 0.85);
  },

  renderBeastMark(ctx) {
    const { g, nodes, colors, mulberry32, seedFromString } = ctx;
    const { RED_INK } = colors;

    const lairs = nodes.filter(n => n.point_type === "lair");
    if (!lairs.length) return;

    lairs.forEach(lair => {
      const rng = mulberry32(seedFromString(lair.id + "-beastmark"));
      const angle = rng() * Math.PI * 2;
      const dist = 50 + rng() * 25;
      const bx = lair.x + Math.cos(angle) * dist;
      const by = lair.y + Math.sin(angle) * dist;
      const flip = rng() > 0.5 ? -1 : 1;

      const bg = g.append("g")
        .attr("transform", `translate(${bx}, ${by}) scale(${flip * 1.2}, 1.2)`)
        .attr("opacity", 0.7);

      // Serpentine body
      bg.append("path")
        .attr("d", "M 0 0 C 5 -10, 15 -6, 20 -12 C 25 -18, 32 -10, 28 -4")
        .attr("fill", "none")
        .attr("stroke", RED_INK)
        .attr("stroke-width", 2.0)
        .attr("stroke-linecap", "round");

      // Pointed tail
      bg.append("path")
        .attr("d", "M 28 -4 C 32 0, 36 4, 40 2 L 38 5")
        .attr("fill", "none")
        .attr("stroke", RED_INK)
        .attr("stroke-width", 1.4)
        .attr("stroke-linecap", "round");

      // Small wing suggestion
      bg.append("path")
        .attr("d", "M 12 -9 C 8 -20, 2 -22, -2 -16 C 2 -14, 8 -12, 12 -9")
        .attr("fill", RED_INK)
        .attr("opacity", 0.3)
        .attr("stroke", RED_INK)
        .attr("stroke-width", 0.8);
    });
  },

  renderBackground(ctx) {
    const { g, defs, WIDTH, HEIGHT, colors } = ctx;
    const { PARCHMENT, PARCHMENT_DARK } = colors;

    const filter = defs.append("filter")
      .attr("id", "parchment-texture")
      .attr("x", "0%").attr("y", "0%")
      .attr("width", "100%").attr("height", "100%");

    filter.append("feTurbulence")
      .attr("type", "fractalNoise")
      .attr("baseFrequency", "0.03")
      .attr("numOctaves", "4")
      .attr("seed", "23")
      .attr("stitchTiles", "stitch")
      .attr("result", "noise");

    filter.append("feColorMatrix")
      .attr("type", "matrix")
      .attr("in", "noise")
      .attr("values", `0 0 0 0 0.941
                       0 0 0 0 0.902
                       0 0 0 0 0.800
                       0 0 0 0.3 0.7`)
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

  renderCompass(ctx) {
    const { g, bounds, colors } = ctx;
    const { BLUE_INK, RED_INK } = colors;
    const size = 22;
    const x = bounds.maxX + size + 16;
    const y = bounds.minY - size - 6;

    const cg = g.append("g")
      .attr("transform", `translate(${x}, ${y})`);

    // Outer circle
    cg.append("circle")
      .attr("cx", 0).attr("cy", 0).attr("r", size)
      .attr("fill", "none")
      .attr("stroke", BLUE_INK).attr("stroke-width", 0.9).attr("opacity", 0.8);

    // Inner ring
    cg.append("circle")
      .attr("cx", 0).attr("cy", 0).attr("r", size * 0.35)
      .attr("fill", "none")
      .attr("stroke", BLUE_INK).attr("stroke-width", 0.7).attr("opacity", 0.75);

    // Center dot
    cg.append("circle")
      .attr("cx", 0).attr("cy", 0).attr("r", 1.5)
      .attr("fill", BLUE_INK).attr("opacity", 0.8);

    // Four cardinal rays with filled half-diamond pointers (N/E/S/W)
    const rays = [
      { dx: 0, dy: -1, label: "N", lx: 0, ly: -size - 5, tAnchor: "middle" },
      { dx: 1, dy: 0, label: "E", lx: size + 5, ly: 3, tAnchor: "start" },
      { dx: 0, dy: 1, label: "S", lx: 0, ly: size + 10, tAnchor: "middle" },
      { dx: -1, dy: 0, label: "W", lx: -size - 5, ly: 3, tAnchor: "end" },
    ];

    rays.forEach(({ dx, dy, label, lx, ly, tAnchor }) => {
      const tipX = dx * size;
      const tipY = dy * size;
      const baseX = dx * size * 0.35;
      const baseY = dy * size * 0.35;
      // Perpendicular for diamond width
      const px = -dy * size * 0.1;
      const py = dx * size * 0.1;
      // Filled half of the pointer (solid fill like Thror's)
      cg.append("path")
        .attr("d", `M ${baseX} ${baseY} L ${tipX} ${tipY} L ${(baseX + tipX) / 2 + px} ${(baseY + tipY) / 2 + py} Z`)
        .attr("fill", BLUE_INK).attr("opacity", 0.85);
      // Outline of the other half
      cg.append("path")
        .attr("d", `M ${baseX} ${baseY} L ${tipX} ${tipY} L ${(baseX + tipX) / 2 - px} ${(baseY + tipY) / 2 - py} Z`)
        .attr("fill", "none")
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.7).attr("opacity", 0.8);
      // Red label
      cg.append("text")
        .attr("x", lx).attr("y", ly)
        .attr("text-anchor", tAnchor)
        .attr("font-family", "'Palatino Linotype', serif")
        .attr("font-size", "11px")
        .attr("font-style", "italic")
        .attr("fill", RED_INK).attr("opacity", 0.9)
        .text(label);
    });

    // Minor tick marks on outer circle between cardinals
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI / 4) + Math.PI / 8;
      const x1 = Math.cos(a) * size;
      const y1 = Math.sin(a) * size;
      const x2 = Math.cos(a) * (size - 3);
      const y2 = Math.sin(a) * (size - 3);
      cg.append("line")
        .attr("x1", x1).attr("y1", y1)
        .attr("x2", x2).attr("y2", y2)
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.5).attr("opacity", 0.65);
    }
  },

  // Off-map direction arrows — Thror's "East lie the Iron Hills" style.
  // Reads ctx.offMapArrows: [{direction: "N|NE|E|SE|S|SW|W|NW", label: string}]
  renderOffMapArrows(ctx) {
    const { g, bounds, offMapArrows, colors } = ctx;
    if (!offMapArrows || offMapArrows.length === 0) return;
    const { BLUE_INK, BLUE_LIGHT, PARCHMENT } = colors;

    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const mapHalfW = (bounds.maxX - bounds.minX) / 2;
    const mapHalfH = (bounds.maxY - bounds.minY) / 2;

    const dirVec = {
      N:  [0, -1],    NE: [0.707, -0.707],
      E:  [1, 0],     SE: [0.707, 0.707],
      S:  [0, 1],     SW: [-0.707, 0.707],
      W:  [-1, 0],    NW: [-0.707, -0.707],
    };

    const arrowGroup = g.append("g").attr("class", "off-map-arrows");

    offMapArrows.forEach(entry => {
      const v = dirVec[entry.direction];
      if (!v) return;
      // Anchor point just outside the map bounds along the direction vector
      const anchorDist = Math.abs(v[0]) * (mapHalfW + 60) + Math.abs(v[1]) * (mapHalfH + 60);
      const ax = cx + v[0] * anchorDist;
      const ay = cy + v[1] * anchorDist;
      // Tail-to-tip arrow pointing outward
      const tailLen = 28;
      const tipX = ax + v[0] * tailLen * 0.6;
      const tipY = ay + v[1] * tailLen * 0.6;
      const baseX = ax - v[0] * tailLen * 0.4;
      const baseY = ay - v[1] * tailLen * 0.4;
      arrowGroup.append("line")
        .attr("x1", baseX).attr("y1", baseY)
        .attr("x2", tipX).attr("y2", tipY)
        .attr("stroke", BLUE_INK).attr("stroke-width", 1.0).attr("opacity", 0.85);
      // Arrowhead
      const perpX = -v[1], perpY = v[0];
      arrowGroup.append("path")
        .attr("d", `M ${tipX} ${tipY} L ${tipX - v[0] * 5 + perpX * 3} ${tipY - v[1] * 5 + perpY * 3} L ${tipX - v[0] * 5 - perpX * 3} ${tipY - v[1] * 5 - perpY * 3} Z`)
        .attr("fill", BLUE_INK).attr("opacity", 0.85);
      // Italic label, placed on the side of the arrow away from the map center
      const labelOffset = 10;
      const lx = baseX - v[0] * labelOffset;
      const ly = baseY - v[1] * labelOffset;
      // For vertical/horizontal arrows, place label centered on the cross-axis
      const textAnchor = v[0] > 0.3 ? "end" : v[0] < -0.3 ? "start" : "middle";
      const dyBase = v[1] > 0.3 ? "hanging" : v[1] < -0.3 ? "baseline" : "central";
      arrowGroup.append("text")
        .attr("x", lx).attr("y", ly)
        .attr("text-anchor", textAnchor)
        .attr("dominant-baseline", dyBase)
        .attr("font-family", "'Palatino Linotype', serif")
        .attr("font-size", "11px")
        .attr("font-style", "italic")
        .attr("fill", BLUE_LIGHT)
        .attr("stroke", PARCHMENT).attr("stroke-width", 2.5)
        .attr("paint-order", "stroke")
        .text(entry.label);
    });
  },
};
