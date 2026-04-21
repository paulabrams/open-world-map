// moonletters.js — "Moon Letters" style for Open World Map viewer
// Sparse blue-ink sketch inspired by Thror's Map. The red text
// only appears in moonlight. All rendering is self-contained;
// the host page supplies a render context (ctx).

window.MapStyles = window.MapStyles || {};

window.MapStyles.moonletters = {
  name: "Moon Letters",

  // Thror's Map in The Hobbit is drawn in a spidery, hand-lettered hand.
  // IM Fell English (italic-capable) reads as ink-and-quill on vellum.
  font: "'IM Fell English', 'Palatino Linotype', Palatino, serif",

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
    MapCore.renderRiverLabel(ctx, { color: ctx.colors.BLUE_INK, strokeColor: ctx.colors.PARCHMENT });
    MapCore.renderBridges(ctx, { color: ctx.colors.BLUE_INK, strokeWidth: 1.0, bridgeLen: 14 });
    MapCore.renderBoats(ctx, { color: ctx.colors.BLUE_INK, parchment: ctx.colors.PARCHMENT, count: 3 });
    MapCore.renderRoad(ctx, ctx.colors.BLUE_INK, 2);
    // Thror's-Map "Running River" styling — blue ink, twin wiggly banks
    // with short cross-ticks between them.
    MapCore.renderCrevasse(ctx, ctx.colors.BLUE_INK, 6, { style: "twinbank" });
    this.renderLinks(ctx);
    this.renderTerrainSymbols(ctx);
    MapCore.renderRegionLabels(ctx, {
      color: ctx.colors.BLUE_INK,
      strokeColor: ctx.colors.PARCHMENT,
      fontSize: 22,
      letterSpacing: "5px",
      opacity: 0.7,
    });
    this.renderNodes(ctx);
    this.renderLabels(ctx);
    this.renderDayLabels(ctx);
    // Per-node description captions are disabled by user request — only
    // directional off-map labels (renderOffMapArrows) remain.
    // this.renderAnnotations(ctx);
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
    // Thror's Map Lonely Mountain style — a single big lumpy mountain per
    // draw, with a wavy irregular ridgeline of 3-4 peaks, interior ridge
    // lines running down from each peak, and vertical hatching on the
    // shadow side. Replaces the old small-peak variants.
    // Spread successive draws across 3 y-tiers so multiple Lonely-Mountain
    // shapes per hex form a ranged silhouette with depth rather than all
    // sitting at the same hex-center line.
    const tier = Math.floor(rng() * 3);
    const tierOffset = tier * size * 0.18;
    this.drawLonelyMountain(g, x, y - tierOffset, size, rng, colors);
  },

  drawLonelyMountain(g, x, y, size, rng, colors) {
    const { BLUE_INK } = colors;
    const w = size * (1.7 + rng() * 0.3);
    const h = size * (1.0 + rng() * 0.3);
    const baseL = x - w / 2;
    const baseR = x + w / 2;
    // Build a wavy ridgeline of 3-5 irregular peaks along the top
    const peakCount = 3 + Math.floor(rng() * 2);
    const peaks = [];
    for (let i = 0; i < peakCount; i++) {
      const t = (i + 0.5) / peakCount;
      const px = baseL + t * w + (rng() - 0.5) * w * 0.06;
      const peakH = h * (0.55 + rng() * 0.45); // varied peak heights
      peaks.push({ x: px, y: y - peakH });
    }
    // Sort by x so the path moves left→right along the ridge
    peaks.sort((a, b) => a.x - b.x);
    // Construct the outline: from base-left, up through all peaks with
    // valley dips between them, then down to base-right.
    let d = `M ${baseL} ${y}`;
    // Left flank up to first peak — one small shoulder bump partway up
    const shoulderLX = baseL + (peaks[0].x - baseL) * 0.55 + (rng() - 0.5) * 2;
    const shoulderLY = y + (peaks[0].y - y) * 0.55 + (rng() - 0.5) * 2;
    d += ` L ${shoulderLX} ${shoulderLY} L ${peaks[0].x} ${peaks[0].y}`;
    for (let i = 1; i < peaks.length; i++) {
      // Valley between peaks — dips ~25-40% down from the lower peak
      const prev = peaks[i - 1];
      const curr = peaks[i];
      const lowerY = Math.max(prev.y, curr.y);
      const valleyY = lowerY + h * (0.18 + rng() * 0.18);
      const valleyX = (prev.x + curr.x) / 2 + (rng() - 0.5) * w * 0.04;
      d += ` L ${valleyX} ${valleyY} L ${curr.x} ${curr.y}`;
    }
    // Right flank down with a shoulder bump
    const shoulderRX = peaks[peaks.length - 1].x + (baseR - peaks[peaks.length - 1].x) * 0.45 + (rng() - 0.5) * 2;
    const shoulderRY = peaks[peaks.length - 1].y + (y - peaks[peaks.length - 1].y) * 0.45 + (rng() - 0.5) * 2;
    d += ` L ${shoulderRX} ${shoulderRY} L ${baseR} ${y}`;

    g.append("path")
      .attr("d", d)
      .attr("fill", "none").attr("stroke", BLUE_INK)
      .attr("stroke-width", 1.1)
      .attr("stroke-linejoin", "round").attr("stroke-linecap", "round")
      .attr("opacity", 0.9);

    // Interior ridge lines: one from each peak descending toward the base,
    // giving the crumpled-paper contour effect from Thror's Lonely Mountain.
    peaks.forEach((p, i) => {
      // Ridge drops roughly straight down from the peak, veering slightly
      const endX = p.x + (rng() - 0.5) * w * 0.06;
      const endY = y - h * (0.1 + rng() * 0.08);
      // Kink mid-ridge for the crumpled feel
      const kinkX = p.x + (endX - p.x) * 0.5 + (rng() - 0.5) * 2;
      const kinkY = p.y + (endY - p.y) * 0.5 + (rng() - 0.5) * 2;
      g.append("path")
        .attr("d", `M ${p.x} ${p.y} L ${kinkX} ${kinkY} L ${endX} ${endY}`)
        .attr("fill", "none").attr("stroke", BLUE_INK)
        .attr("stroke-width", 0.55).attr("stroke-linecap", "round")
        .attr("opacity", 0.65);
    });

    // Vertical hatching on the shadow (left) face — thin parallel strokes
    const hatchCount = 4 + Math.floor(rng() * 3);
    for (let i = 0; i < hatchCount; i++) {
      const t = (i + 1) / (hatchCount + 1);
      const sx = baseL + w * 0.1 + t * w * 0.25;
      const sy = y - h * (0.15 + t * 0.4);
      g.append("line")
        .attr("x1", sx).attr("y1", sy)
        .attr("x2", sx + w * 0.02).attr("y2", sy + h * 0.22)
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.4).attr("opacity", 0.5);
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
    // Small kink part-way up each slope for a jagged, Thror-style silhouette
    const leftKinkX = bl + (px - bl) * 0.55 + (rng() - 0.5) * 1.2;
    const leftKinkY = y + (py - y) * 0.55 + (rng() - 0.5) * 1.2;
    const rightKinkX = px + (br - px) * 0.4 + (rng() - 0.5) * 1.2;
    const rightKinkY = py + (y - py) * 0.4 + (rng() - 0.5) * 1.2;

    g.append("path")
      .attr("d", `M ${bl} ${y} L ${leftKinkX} ${leftKinkY} L ${px} ${py} L ${rightKinkX} ${rightKinkY} L ${br} ${y}`)
      .attr("fill", "none")
      .attr("stroke", BLUE_INK)
      .attr("stroke-width", 1.0)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("opacity", 0.9);

    // Interior ridge line from the peak down — adds depth like Thror's Lonely Mountain
    const ridgeEndX = px + (rng() - 0.5) * w * 0.18;
    const ridgeEndY = y - h * 0.15;
    g.append("line")
      .attr("x1", px).attr("y1", py)
      .attr("x2", ridgeEndX).attr("y2", ridgeEndY)
      .attr("stroke", BLUE_INK).attr("stroke-width", 0.55)
      .attr("stroke-linecap", "round").attr("opacity", 0.55);

    this.drawPeakShading(g, px, py, br, y, rng, colors, 4 + Math.floor(rng() * 2));
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
    // Normal living trees — mix of fir (angular stacked Vs) and round
    // leafy. Dead Y-shape trees used to be here but they're reserved for
    // desolation regions (not in this campaign).

    // Mapeffects old-growth scatter ticks — tiny detail marks on the
    // forest floor (kept very faint for moonletters' sparse aesthetic)
    const { BLUE_INK } = colors;
    const floorMarks = Math.floor(rng() * 2);
    for (let i = 0; i < floorMarks; i++) {
      const fx = x + (rng() - 0.5) * size * 0.8;
      const fy = y + size * (0.4 + rng() * 0.2);
      const len = 1 + rng() * 1.0;
      g.append("line")
        .attr("x1", fx).attr("y1", fy)
        .attr("x2", fx + len).attr("y2", fy + len * 0.45)
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.35).attr("opacity", 0.4);
    }

    const count = 1 + Math.floor(rng() * 2);
    const trees = [];
    for (let i = 0; i < count; i++) {
      trees.push({
        tx: x + (rng() - 0.5) * size * 0.8,
        ty: y + (rng() - 0.5) * size * 0.5,
        sz: size * (0.45 + rng() * 0.35),
        style: rng() > 0.45 ? "fir" : "round",
      });
    }
    trees.sort((a, b) => a.ty - b.ty);
    trees.forEach(t => {
      if (t.style === "fir") this.drawTreeGlyphFir(g, t.tx, t.ty, t.sz, rng, colors);
      else this.drawTreeGlyphRound(g, t.tx, t.ty, t.sz, rng, colors);
    });
  },

  drawTreeGlyphRound(g, x, y, size, rng, colors) {
    const { BLUE_INK } = colors;
    const r = size * (0.3 + rng() * 0.1);
    const cy = y - r * 0.3;
    // Trunk
    g.append("line")
      .attr("x1", x).attr("y1", cy + r * 0.55).attr("x2", x).attr("y2", cy + r * 1.05)
      .attr("stroke", BLUE_INK).attr("stroke-width", 0.6).attr("opacity", 0.78);
    // Leafy circle outline (not filled — keeps moonletter sparseness)
    g.append("circle")
      .attr("cx", x).attr("cy", cy).attr("r", r)
      .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.65).attr("opacity", 0.78);
    // Small cross-veins inside (stylized leaves)
    g.append("line")
      .attr("x1", x - r * 0.5).attr("y1", cy).attr("x2", x + r * 0.5).attr("y2", cy)
      .attr("stroke", BLUE_INK).attr("stroke-width", 0.4).attr("opacity", 0.55);
    g.append("line")
      .attr("x1", x).attr("y1", cy - r * 0.5).attr("x2", x).attr("y2", cy + r * 0.5)
      .attr("stroke", BLUE_INK).attr("stroke-width", 0.4).attr("opacity", 0.55);
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
    // Extremely faint blue wash beneath the ripples — suggests marsh water
    g.append("ellipse")
      .attr("cx", x).attr("cy", y)
      .attr("rx", size * 0.8).attr("ry", size * 0.45)
      .attr("fill", BLUE_INK).attr("opacity", 0.07);
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
    // Sparse dots (desolation) mixed with occasional bare-tree glyphs, echoing
    // Thror's "Desolation of Smaug" empty-wasted-land pattern.
    const dotCount = 5 + Math.floor(rng() * 4);
    for (let i = 0; i < dotCount; i++) {
      const dx = (rng() - 0.5) * size * 1.5;
      const dy = (rng() - 0.5) * size * 0.9;
      g.append("circle")
        .attr("cx", x + dx).attr("cy", y + dy)
        .attr("r", 0.7 + rng() * 0.5)
        .attr("fill", BLUE_INK)
        .attr("opacity", 0.45);
    }
    // Occasional bare/dead tree glyph — a single curving trunk with 1-2 twig strokes
    const bareTreeCount = rng() > 0.5 ? 1 : 0;
    for (let i = 0; i < bareTreeCount; i++) {
      const tx = x + (rng() - 0.5) * size * 1.2;
      const ty = y + (rng() - 0.2) * size * 0.4;
      const h = size * (0.35 + rng() * 0.15);
      const lean = (rng() - 0.5) * 1.5;
      // Trunk
      g.append("path")
        .attr("d", `M ${tx} ${ty} Q ${tx + lean * 0.6} ${ty - h * 0.6} ${tx + lean} ${ty - h}`)
        .attr("fill", "none")
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.5)
        .attr("stroke-linecap", "round").attr("opacity", 0.6);
      // Twigs — 2 small branches at the top
      const twigY = ty - h * 0.75;
      const twigBaseX = tx + lean * 0.75;
      g.append("line")
        .attr("x1", twigBaseX).attr("y1", twigY)
        .attr("x2", twigBaseX - 2 - rng()).attr("y2", twigY - 1.5 - rng())
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.4)
        .attr("stroke-linecap", "round").attr("opacity", 0.55);
      g.append("line")
        .attr("x1", twigBaseX).attr("y1", twigY)
        .attr("x2", twigBaseX + 2 + rng()).attr("y2", twigY - 1.5 - rng())
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.4)
        .attr("stroke-linecap", "round").attr("opacity", 0.55);
    }
  },

  drawHill(g, x, y, size, rng, colors) {
    const { BLUE_INK } = colors;
    // Gentle cluster of 1-2 faint hillocks
    const count = 1 + Math.floor(rng() * 2);
    const spacing = size * 0.75;
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
        .attr("opacity", 0.55);
      // Occasional crown stroke — hints at rolling downs, Thror-subtle
      if (rng() > 0.45) {
        const sx0 = cx - w * 0.25 + (rng() - 0.5);
        const sy0 = y - h * 0.7;
        g.append("path")
          .attr("d", `M ${sx0} ${sy0} Q ${sx0 + w * 0.1} ${sy0 - 1.5} ${sx0 + w * 0.22} ${sy0 - 0.5}`)
          .attr("fill", "none")
          .attr("stroke", BLUE_INK).attr("stroke-width", 0.4).attr("opacity", 0.4);
      }
    });
  },

  drawFarm(g, x, y, size, rng, colors) {
    const { BLUE_INK } = colors;
    // Sparse Thror-style farm: a single tiny house with a handful of short
    // furrow ticks to one side. Thror's Map stays minimal.
    const bw = size * (0.22 + rng() * 0.1);
    const bh = size * (0.15 + rng() * 0.08);
    g.append("rect")
      .attr("x", x - bw / 2).attr("y", y - bh / 2)
      .attr("width", bw).attr("height", bh)
      .attr("fill", "none").attr("stroke", BLUE_INK)
      .attr("stroke-width", 0.55).attr("opacity", 0.75);
    g.append("path")
      .attr("d", `M ${x - bw / 2 - 0.3} ${y - bh / 2} L ${x} ${y - bh / 2 - bh * 0.75} L ${x + bw / 2 + 0.3} ${y - bh / 2}`)
      .attr("fill", "none").attr("stroke", BLUE_INK)
      .attr("stroke-width", 0.55).attr("opacity", 0.75);
    // 3-4 short furrow ticks on one side only
    const side = rng() > 0.5 ? 1 : -1;
    const furrowCount = 3 + Math.floor(rng() * 2);
    for (let i = 0; i < furrowCount; i++) {
      const fx = x + side * size * (0.45 + i * 0.18);
      g.append("line")
        .attr("x1", fx).attr("y1", y - size * 0.12)
        .attr("x2", fx).attr("y2", y + size * 0.12)
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.35).attr("opacity", 0.4);
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
    // Moon Letters: sparse, Thror-style — way less per hex, lots of empty parchment
    MapCore.renderHexTerrain(ctx, {
      "forested-hills": (tg, x, y, sz, rng) => style.drawHill(tg, x, y, sz, rng, colors),
      "hills": (tg, x, y, sz, rng) => style.drawHill(tg, x, y, sz, rng, colors),
      "swamp": (tg, x, y, sz, rng) => style.drawSwampMark(tg, x, y, sz, rng, colors),
      "plains": (tg, x, y, sz, rng) => style.drawDesolationDots(tg, x, y, sz, rng, colors),
      "graveyard": (tg, x, y, sz, rng) => style.drawGraveyard(tg, x, y, sz, rng, colors),
    }, { density: 0.3 });
    // Bumped mountain density for Moonletters — the Lonely Mountain style
    // is distinctive, and the user asked for more per hex.
    MapCore.renderMountainsWithElevation(ctx,
      (tg, x, y, sz, rng) => style.drawMountainSketch(tg, x, y, sz, rng, colors),
      (tg, x, y, sz, rng) => style.drawHill(tg, x, y, sz, rng, colors),
      { density: 0.85 });
    MapCore.renderForestEdgeTrees(ctx,
      (tg, x, y, sz, rng) => style.drawSparseTree(tg, x, y, sz, rng, colors),
      ["forest", "forested-hills"],
      { density: 0.75 });
    MapCore.renderFarmlandBiased(ctx,
      (tg, x, y, sz, rng) => style.drawFarm(tg, x, y, sz, rng, colors));
    // Forest boundary comes from the scattered edge trees — no hard
    // hex-outline stroke.
  },

  drawGraveyard(g, x, y, size, rng, colors) {
    const { BLUE_INK } = colors;
    // Sparse Thror-style: just 2-3 small crosses, leaves the area visibly quiet
    const count = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < count; i++) {
      const gx = x + (rng() - 0.5) * size * 1.0;
      const gy = y + (rng() - 0.5) * size * 0.55;
      const gh = size * (0.28 + rng() * 0.12);
      const gw = gh * 0.55;
      g.append("line")
        .attr("x1", gx).attr("y1", gy - gh * 0.45)
        .attr("x2", gx).attr("y2", gy + gh * 0.45)
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.55).attr("opacity", 0.7);
      g.append("line")
        .attr("x1", gx - gw * 0.5).attr("y1", gy - gh * 0.2)
        .attr("x2", gx + gw * 0.5).attr("y2", gy - gh * 0.2)
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.55).attr("opacity", 0.7);
      // Occasional small ground-line beneath a cross — suggests a burial mound
      if (rng() > 0.6) {
        g.append("line")
          .attr("x1", gx - gw * 0.6).attr("y1", gy + gh * 0.5)
          .attr("x2", gx + gw * 0.6).attr("y2", gy + gh * 0.5)
          .attr("stroke", BLUE_INK).attr("stroke-width", 0.4).attr("opacity", 0.5);
      }
    }
  },

  renderNodes(ctx) {
    const { g, nodes, colors, mulberry32, seedFromString } = ctx;
    const { BLUE_INK, RED_INK, PARCHMENT } = colors;
    const nodeGroup = g.append("g").attr("class", "nodes");

    nodes.forEach(node => {
      const ng = nodeGroup.append("g")
        .attr("transform", `translate(${node.x}, ${node.y})`)
        .attr("class", "node")
        .style("cursor", "pointer")
        .on("click", (event) => { event.stopPropagation(); MapCore.showDetail(node); });
      ng.append("title").text(node.name);

      const isLocal = node.scale === "local";
      const s = isLocal ? 3.5 : 5;
      const isDanger = node.point_type === "lair" || node.point_type === "dungeon";
      const color = isDanger ? RED_INK : BLUE_INK;

      // Shared id-based special icons (before point_type switch)
      if (MapCore.renderSpecialIcon(ng, node, { ink: BLUE_INK, parchment: PARCHMENT })) return;

      // Farm override (not ruins)
      if (node.name && node.name.toLowerCase().includes("farm") && node.point_type !== "ruin") {
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
          // Walled capital — fills the middle 50% of its hex in the spare
          // moonletter angular aesthetic. Thin blue-ink outlines only (no
          // solid fills), pointed-roof towers (no crenellations), single
          // central bridge across the river.
          const hs = 12;
          const rng = mulberry32(seedFromString("city-" + (node.id || "heart")));
          const bY = hs * 0.15;
          // Thin walled oval — main silhouette
          ng.append("ellipse")
            .attr("cx", 0).attr("cy", 0)
            .attr("rx", hs * 2.1).attr("ry", hs * 1.55)
            .attr("fill", PARCHMENT).attr("fill-opacity", 0.6)
            .attr("stroke", BLUE_INK).attr("stroke-width", 0.9);
          // Scattered tower outlines via rejection sampling
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
            ng.append("rect")
              .attr("x", t.x - tw / 2).attr("y", yTop)
              .attr("width", tw).attr("height", th)
              .attr("fill", PARCHMENT).attr("stroke", BLUE_INK).attr("stroke-width", 0.5);
            // Angular pointed roof — moonletter convention
            ng.append("path")
              .attr("d", `M ${t.x - tw / 2 - 0.4} ${yTop} L ${t.x} ${yTop - tw * 1.0} L ${t.x + tw / 2 + 0.4} ${yTop}`)
              .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.5);
          });
          // Two bridge-gate towers — one flanking each side of the bridge
          const bridgeSpan0 = hs * 1.5;
          [-1, 1].forEach(side => {
            const tX = side * (bridgeSpan0 / 2 + hs * 0.32);
            const tH = hs * 1.7;
            const tBase = bY + hs * 0.12;
            const tTop = tBase - tH;
            const tW = hs * 0.3;
            ng.append("rect")
              .attr("x", tX - tW / 2).attr("y", tTop).attr("width", tW).attr("height", tH)
              .attr("fill", PARCHMENT).attr("stroke", BLUE_INK).attr("stroke-width", 0.8);
            // Pointed roof
            ng.append("path")
              .attr("d", `M ${tX - tW / 2 - 0.5} ${tTop} L ${tX} ${tTop - tW * 1.2} L ${tX + tW / 2 + 0.5} ${tTop}`)
              .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.7);
            // Pole and pennant leaning away from bridge
            ng.append("line")
              .attr("x1", tX).attr("y1", tTop - tW * 1.2).attr("x2", tX).attr("y2", tTop - hs * 0.65)
              .attr("stroke", BLUE_INK).attr("stroke-width", 0.55);
            ng.append("path")
              .attr("d", `M ${tX} ${tTop - hs * 0.65} L ${tX + side * hs * 0.5} ${tTop - hs * 0.54} L ${tX} ${tTop - hs * 0.43} Z`)
              .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.55);
          });
          // Four corner wall-towers with pointed caps
          [{ x: -hs * 1.95, y: -hs * 0.4, h: hs * 0.95 },
           { x:  hs * 1.95, y: -hs * 0.4, h: hs * 0.9 },
           { x: -hs * 1.95, y:  hs * 0.4, h: hs * 0.85 },
           { x:  hs * 1.95, y:  hs * 0.4, h: hs * 1.0 }].forEach(({ x, y, h }) => {
            ng.append("rect")
              .attr("x", x - hs * 0.15).attr("y", y - h * 0.6)
              .attr("width", hs * 0.3).attr("height", h)
              .attr("fill", PARCHMENT).attr("stroke", BLUE_INK).attr("stroke-width", 0.65);
            ng.append("path")
              .attr("d", `M ${x - hs * 0.2} ${y - h * 0.6} L ${x} ${y - h * 0.85} L ${x + hs * 0.2} ${y - h * 0.6}`)
              .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.55);
          });
          // Main gate — triangle arch cutout
          ng.append("path")
            .attr("d", `M ${-hs * 0.28} ${hs * 1.55} L ${-hs * 0.28} ${hs * 0.9} L 0 ${hs * 0.55} L ${hs * 0.28} ${hs * 0.9} L ${hs * 0.28} ${hs * 1.55}`)
            .attr("fill", PARCHMENT).attr("stroke", BLUE_INK).attr("stroke-width", 0.7);
          // Single central bridge — angular (not rounded)
          const bridgeSpan = hs * 1.5;
          const bridgeG = ng.append("g").attr("class", "bridge");
          bridgeG.append("line")
            .attr("x1", -bridgeSpan / 2 - hs * 0.25).attr("y1", bY)
            .attr("x2",  bridgeSpan / 2 + hs * 0.25).attr("y2", bY)
            .attr("stroke", BLUE_INK).attr("stroke-width", 1.0);
          bridgeG.append("line")
            .attr("x1", -bridgeSpan / 2).attr("y1", bY + hs * 0.1)
            .attr("x2",  bridgeSpan / 2).attr("y2", bY + hs * 0.1)
            .attr("stroke", BLUE_INK).attr("stroke-width", 0.6);
          [-bridgeSpan * 0.3, bridgeSpan * 0.3].forEach(px => {
            bridgeG.append("line")
              .attr("x1", px).attr("y1", bY + hs * 0.1).attr("x2", px).attr("y2", bY + hs * 0.42)
              .attr("stroke", BLUE_INK).attr("stroke-width", 0.7);
          });
          // Triangular (angular) arch under the deck — moonletter aesthetic
          bridgeG.append("path")
            .attr("d", `M ${-bridgeSpan * 0.22} ${bY + hs * 0.42} L 0 ${bY + hs * 0.15} L ${bridgeSpan * 0.22} ${bY + hs * 0.42}`)
            .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.6);
          break;
        }
        case "fortress": {
          // Hilltop keep in the moonletter angular aesthetic — thin blue-ink
          // outlines, pointed conical spires, no solid fills. Three slim
          // towers with pointed caps, crenellated curtain wall, detached
          // gate-tower, rocky hilltop with faint strata lines.
          const hs = 9;
          const rng = mulberry32(seedFromString("fortress-" + (node.id || "fortress")));
          // Hill widened so flat crest fully supports the keep (detached
          // right gate-tower at +hs*2.15). Flat top ±hs*2.6, hill ±hs*4.5.
          const hillBaseY = hs * 1.9, hillTopY = hs * 0.6, hillW = hs * 4.5;
          const flatEdge = hs * 2.6;
          // Hill outline only (no heavy fill in moonletters)
          ng.append("path")
            .attr("d", `M ${-hillW} ${hillBaseY}
                        Q ${-hillW * 0.75} ${hillBaseY - hs * 0.1} ${-flatEdge} ${hillTopY + hs * 0.25}
                        Q ${-flatEdge * 0.5} ${hillTopY - hs * 0.1} 0 ${hillTopY}
                        Q ${flatEdge * 0.5} ${hillTopY - hs * 0.1} ${flatEdge} ${hillTopY + hs * 0.25}
                        Q ${hillW * 0.75} ${hillBaseY - hs * 0.1} ${hillW} ${hillBaseY}`)
            .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.8);
          // Strata lines on hillside
          for (let si = 0; si < 8; si++) {
            const t = 0.08 + si * 0.12;
            const sx = -hillW + 2 * hillW * t;
            const syTop = hillTopY + hs * 0.35;
            const syBot = hillBaseY - hs * 0.08;
            const midX = sx + (rng() - 0.5) * hs * 0.15;
            const endX = sx + (rng() - 0.5) * hs * 0.1;
            ng.append("path")
              .attr("d", `M ${sx} ${syTop} Q ${midX} ${(syTop + syBot) / 2} ${endX} ${syBot}`)
              .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.35).attr("opacity", 0.45);
          }
          // Angular boulders as tiny diamonds
          [-hillW * 0.75, -hillW * 0.35, hillW * 0.4, hillW * 0.78].forEach(bx => {
            const by = hillBaseY - hs * 0.05;
            ng.append("path")
              .attr("d", `M ${bx} ${by - hs * 0.15} L ${bx + hs * 0.15} ${by} L ${bx} ${by + hs * 0.1} L ${bx - hs * 0.15} ${by} Z`)
              .attr("fill", PARCHMENT).attr("stroke", BLUE_INK).attr("stroke-width", 0.5);
          });

          const baseY = hillTopY;
          const slit = (sx, sy1, sy2) => {
            ng.append("line").attr("x1", sx).attr("y1", sy1).attr("x2", sx).attr("y2", sy2)
              .attr("stroke", BLUE_INK).attr("stroke-width", 0.5);
          };
          const pointedSpire = (x, baseTop, w, spireH) => {
            // Drum ring
            ng.append("rect")
              .attr("x", x - w * 0.58).attr("y", baseTop - hs * 0.06)
              .attr("width", w * 1.16).attr("height", hs * 0.09)
              .attr("fill", PARCHMENT).attr("stroke", BLUE_INK).attr("stroke-width", 0.5);
            ng.append("path")
              .attr("d", `M ${x - w * 0.55} ${baseTop - hs * 0.06} L ${x} ${baseTop - spireH} L ${x + w * 0.55} ${baseTop - hs * 0.06}`)
              .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.6);
          };
          const pointedRoof = (x, topY, w) => {
            ng.append("path")
              .attr("d", `M ${x - w / 2 - 0.4} ${topY} L ${x} ${topY - w * 0.8} L ${x + w / 2 + 0.4} ${topY}`)
              .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.5);
          };

          // Curtain wall (outlined) + merlons
          const wallLeft = -hs * 1.7, wallRight = hs * 1.7;
          const wallTop = baseY - hs * 0.9;
          ng.append("rect")
            .attr("x", wallLeft).attr("y", wallTop).attr("width", wallRight - wallLeft).attr("height", hs * 0.9)
            .attr("fill", PARCHMENT).attr("stroke", BLUE_INK).attr("stroke-width", 0.8);
          const merlonCount = 9;
          const merlonW = hs * 0.2;
          const merlonGap = ((wallRight - wallLeft) - merlonCount * merlonW) / (merlonCount - 1);
          for (let i = 0; i < merlonCount; i++) {
            const mx = wallLeft + i * (merlonW + merlonGap);
            ng.append("rect").attr("x", mx).attr("y", wallTop - hs * 0.15)
              .attr("width", merlonW).attr("height", hs * 0.15)
              .attr("fill", PARCHMENT).attr("stroke", BLUE_INK).attr("stroke-width", 0.5);
          }
          // Wall-towers (outlined with pointed roofs)
          const wallTowers = [
            { x: -hs * 1.55, h: hs * 1.4, w: hs * 0.34 },
            { x: -hs * 0.8,  h: hs * 1.2, w: hs * 0.30 },
            { x:  hs * 0.15, h: hs * 1.25, w: hs * 0.30 },
            { x:  hs * 0.85, h: hs * 1.3, w: hs * 0.32 },
            { x:  hs * 1.55, h: hs * 1.45, w: hs * 0.34 },
          ];
          wallTowers.forEach(({ x, h, w }) => {
            const topY = baseY - h;
            ng.append("rect").attr("x", x - w / 2).attr("y", topY).attr("width", w).attr("height", h)
              .attr("fill", PARCHMENT).attr("stroke", BLUE_INK).attr("stroke-width", 0.65);
            pointedRoof(x, topY, w + hs * 0.06);
            slit(x, topY + h * 0.35, topY + h * 0.55);
          });
          // Slim pointed-spire towers
          const spires = [
            { x: -hs * 1.15, baseH: hs * 2.1, spireH: hs * 0.95, w: hs * 0.22 },
            { x: -hs * 0.35, baseH: hs * 2.45, spireH: hs * 1.1, w: hs * 0.22 },
            { x:  hs * 0.45, baseH: hs * 2.1, spireH: hs * 0.95, w: hs * 0.22 },
          ];
          spires.forEach(({ x, baseH, spireH, w }) => {
            const topY = baseY - baseH;
            ng.append("rect").attr("x", x - w / 2).attr("y", topY).attr("width", w).attr("height", baseH)
              .attr("fill", PARCHMENT).attr("stroke", BLUE_INK).attr("stroke-width", 0.7);
            slit(x, topY + baseH * 0.22, topY + baseH * 0.37);
            slit(x, topY + baseH * 0.55, topY + baseH * 0.7);
            pointedSpire(x, topY, w, spireH);
          });
          // Detached right gate-tower
          const detX = hs * 2.15, detH = hs * 1.55, detW = hs * 0.38;
          const detTop = baseY - detH + hs * 0.15;
          ng.append("rect").attr("x", detX - detW / 2).attr("y", detTop).attr("width", detW).attr("height", detH)
            .attr("fill", PARCHMENT).attr("stroke", BLUE_INK).attr("stroke-width", 0.7);
          pointedRoof(detX, detTop, detW + hs * 0.06);
          slit(detX, detTop + detH * 0.3, detTop + detH * 0.5);
          slit(detX, detTop + detH * 0.6, detTop + detH * 0.8);
          // Triangular (angular) gate cut — moonletter convention
          ng.append("path")
            .attr("d", `M ${-hs * 0.05} ${baseY} L ${-hs * 0.05} ${baseY - hs * 0.5} L ${hs * 0.15} ${baseY - hs * 0.8} L ${hs * 0.35} ${baseY - hs * 0.5} L ${hs * 0.35} ${baseY} Z`)
            .attr("fill", PARCHMENT).attr("stroke", BLUE_INK).attr("stroke-width", 0.6);
          // Switchback dashed path up the right
          ng.append("path")
            .attr("d", `M ${hillW * 0.75} ${hillBaseY - hs * 0.1} Q ${hs * 1.2} ${hillBaseY - hs * 0.55} ${hs * 0.7} ${hillTopY + hs * 0.2} Q ${hs * 0.5} ${hillTopY + hs * 0.05} ${hs * 0.15} ${baseY}`)
            .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.5)
            .attr("stroke-dasharray", "2 2").attr("opacity", 0.7);
          // Pennants (angular triangles, outlined only)
          const flagTop = baseY - spires[1].baseH - spires[1].spireH - hs * 0.35;
          ng.append("line")
            .attr("x1", spires[1].x).attr("y1", baseY - spires[1].baseH - spires[1].spireH)
            .attr("x2", spires[1].x).attr("y2", flagTop)
            .attr("stroke", BLUE_INK).attr("stroke-width", 0.55);
          ng.append("path")
            .attr("d", `M ${spires[1].x} ${flagTop} L ${spires[1].x + hs * 0.6} ${flagTop + hs * 0.15} L ${spires[1].x} ${flagTop + hs * 0.3} Z`)
            .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.55);
          [spires[0], spires[2]].forEach(s => {
            const topY = baseY - s.baseH - s.spireH;
            ng.append("line").attr("x1", s.x).attr("y1", topY).attr("x2", s.x).attr("y2", topY - hs * 0.3)
              .attr("stroke", BLUE_INK).attr("stroke-width", 0.45);
            ng.append("path")
              .attr("d", `M ${s.x} ${topY - hs * 0.3} L ${s.x + hs * 0.28} ${topY - hs * 0.22} L ${s.x} ${topY - hs * 0.14} Z`)
              .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.45);
          });
          break;
        }
        case "tavern": {
          const hs = isLocal ? 2.5 : 3.5;
          ng.append("rect").attr("x", -hs*0.7).attr("y", -hs*0.3).attr("width", hs*1.4).attr("height", hs)
            .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.6);
          ng.append("path")
            .attr("d", `M ${-hs*0.8} ${-hs*0.3} L 0 ${-hs*1.1} L ${hs*0.8} ${-hs*0.3}`)
            .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.6);
          // Small arched door on the front wall — thin-line Thror style
          ng.append("path")
            .attr("d", `M ${-hs*0.15} ${hs*0.7} L ${-hs*0.15} ${hs*0.25} Q 0 ${hs*0.05} ${hs*0.15} ${hs*0.25} L ${hs*0.15} ${hs*0.7}`)
            .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.5);
          // Hanging sign: arm + two short chains + outlined board
          ng.append("line").attr("x1", hs*0.7).attr("y1", -hs*0.1).attr("x2", hs*1.2).attr("y2", -hs*0.1)
            .attr("stroke", BLUE_INK).attr("stroke-width", 0.4);
          ng.append("line").attr("x1", hs*1.03).attr("y1", -hs*0.1).attr("x2", hs*1.03).attr("y2", -hs*0.02)
            .attr("stroke", BLUE_INK).attr("stroke-width", 0.35);
          ng.append("line").attr("x1", hs*1.37).attr("y1", -hs*0.1).attr("x2", hs*1.37).attr("y2", -hs*0.02)
            .attr("stroke", BLUE_INK).attr("stroke-width", 0.35);
          ng.append("rect").attr("x", hs*1.0).attr("y", -hs*0.02).attr("width", hs*0.4).attr("height", hs*0.35)
            .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.5);
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
            // Smoke plume from the right house — inhabited marker
            if (hi === 1) {
              const sx = hx + hs * 0.2;
              const sy = hy - hs;
              ng.append("path")
                .attr("d", `M ${sx} ${sy} C ${sx - hs*0.3} ${sy - hs*0.45}, ${sx + hs*0.3} ${sy - hs*0.85}, ${sx - hs*0.1} ${sy - hs*1.35}`)
                .attr("fill", "none").attr("stroke", BLUE_INK)
                .attr("stroke-width", 0.5).attr("stroke-linecap", "round")
                .attr("opacity", 0.55);
            }
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
        case "sanctuary": {
          // Thin-line chapel with arched door and cross — Thror-sketch version
          const hs = s * 0.9;
          ng.append("rect").attr("x", -hs * 0.55).attr("y", -hs * 0.2).attr("width", hs * 1.1).attr("height", hs * 0.85)
            .attr("fill", "none").attr("stroke", color).attr("stroke-width", 0.6);
          ng.append("path")
            .attr("d", `M ${-hs * 0.65} ${-hs * 0.2} L 0 ${-hs * 0.9} L ${hs * 0.65} ${-hs * 0.2}`)
            .attr("fill", "none").attr("stroke", color).attr("stroke-width", 0.6);
          // Arched door on the front wall
          ng.append("path")
            .attr("d", `M ${-hs * 0.18} ${hs * 0.65} L ${-hs * 0.18} ${hs * 0.25} Q 0 ${hs * 0.05} ${hs * 0.18} ${hs * 0.25} L ${hs * 0.18} ${hs * 0.65}`)
            .attr("fill", "none").attr("stroke", color).attr("stroke-width", 0.5);
          ng.append("line").attr("x1", 0).attr("y1", -hs * 0.9).attr("x2", 0).attr("y2", -hs * 1.55)
            .attr("stroke", color).attr("stroke-width", 0.6);
          ng.append("line").attr("x1", -hs * 0.3).attr("y1", -hs * 1.25).attr("x2", hs * 0.3).attr("y2", -hs * 1.25)
            .attr("stroke", color).attr("stroke-width", 0.6);
          break;
        }
        case "tower":
          // Tall thin tower silhouette with a small pennant up top
          ng.append("line").attr("x1", 0).attr("y1", -s - 3).attr("x2", 0).attr("y2", s + 1)
            .attr("stroke", color).attr("stroke-width", 1.0);
          // Pennant on a short pole above
          ng.append("line").attr("x1", 0).attr("y1", -s - 3).attr("x2", 0).attr("y2", -s - 7)
            .attr("stroke", color).attr("stroke-width", 0.6);
          ng.append("path")
            .attr("d", `M 0 ${-s - 7} L 4 ${-s - 6} L 0 ${-s - 5} Z`)
            .attr("fill", "none").attr("stroke", color).attr("stroke-width", 0.6);
          break;
        case "ruin": {
          // Broken wall silhouette with a crack — Thror-thin-line version
          const rs = s;
          ng.append("path")
            .attr("d", `M ${-rs} ${rs * 0.6} L ${-rs} ${-rs * 0.3} L ${-rs * 0.5} ${-rs * 0.7} L ${-rs * 0.2} ${-rs * 0.1} L ${rs * 0.3} ${-rs * 0.5} L ${rs * 0.7} ${-rs * 0.1} L ${rs} ${rs * 0.6} Z`)
            .attr("fill", "none").attr("stroke", color).attr("stroke-width", 0.7).attr("opacity", 0.85);
          ng.append("line").attr("x1", 0).attr("y1", -rs * 0.2).attr("x2", 0).attr("y2", rs * 0.5)
            .attr("stroke", color).attr("stroke-width", 0.4).attr("opacity", 0.6);
          break;
        }
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
          path.attr("stroke-width", 1.6).attr("opacity", 0.85);
          break;
        case "trail":
          path.attr("stroke-width", 0.9).attr("stroke-dasharray", "5 4").attr("opacity", 0.75);
          break;
        case "wilderness":
          path.attr("stroke-width", 0.7).attr("stroke-dasharray", "2 4").attr("opacity", 0.6);
          break;
        default:
          path.attr("stroke-width", 1.1).attr("opacity", 0.8);
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
      // Big icons push their label further below so text doesn't collide
      const typeOffset = { heart: 30, fortress: 26, tower: 22, lair: 20 };
      // Moonletters labels sit a bit tighter — scale baseline offsets by 0.9
      const specialOff = MapCore.specialIconLabelOffset(node, 0.9);
      const yOffset = isLocal ? 12 : (specialOff || typeOffset[node.point_type] || 16);

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

      // Optional red moon-rune glyph floating above the node when declared —
      // evokes Thror's Map "N" mark over the secret door of the Lonely Mountain.
      if (node.rune) {
        labelGroup.append("text")
          .attr("x", node.x).attr("y", node.y - 12)
          .attr("text-anchor", "middle")
          .attr("font-family", "'Noto Sans Runic', 'Palatino Linotype', serif")
          .attr("font-size", "15px")
          .attr("fill", RED_INK)
          .attr("stroke", PARCHMENT).attr("stroke-width", 2.5)
          .attr("paint-order", "stroke")
          .attr("opacity", 0.85)
          .text(node.rune);
      }
      // Small boxed rune-hint for nodes flagged with `has_secret_door` —
      // echoes the framed door-rune illustration on Thror's Map.
      if (node.has_secret_door) {
        const bx = node.x + 14, by = node.y - 8;
        const bw = 14, bh = 10;
        labelGroup.append("rect")
          .attr("x", bx).attr("y", by - bh).attr("width", bw).attr("height", bh)
          .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.7).attr("opacity", 0.8);
        // A simple rune-like glyph inside (vertical stave + diagonal)
        labelGroup.append("line")
          .attr("x1", bx + bw / 2).attr("y1", by - bh + 1.5)
          .attr("x2", bx + bw / 2).attr("y2", by - 1.5)
          .attr("stroke", BLUE_INK).attr("stroke-width", 0.8).attr("opacity", 0.85);
        labelGroup.append("line")
          .attr("x1", bx + bw / 2).attr("y1", by - bh * 0.65)
          .attr("x2", bx + bw * 0.85).attr("y2", by - bh * 0.85)
          .attr("stroke", BLUE_INK).attr("stroke-width", 0.8).attr("opacity", 0.85);
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

    // Double-ruled blue border — matches Thror's Map's prominent blue
    // ink frame. Outer stroke is heavy, inner stroke is lighter and
    // sits just inside for the classical double-rule look.
    g.append("rect")
      .attr("x", x).attr("y", y)
      .attr("width", w).attr("height", h)
      .attr("fill", "none")
      .attr("stroke", BLUE_INK)
      .attr("stroke-width", 2.2)
      .attr("opacity", 0.9);
    const innerInset = 5;
    g.append("rect")
      .attr("x", x + innerInset).attr("y", y + innerInset)
      .attr("width", w - innerInset * 2).attr("height", h - innerInset * 2)
      .attr("fill", "none")
      .attr("stroke", BLUE_INK)
      .attr("stroke-width", 0.9)
      .attr("opacity", 0.7);

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
    const barH = 4; // slimmer bar, Thror-sparse
    const bx = bounds.maxX - barW - 10;
    const by = bounds.maxY + 30;

    const sg = g.append("g").attr("class", "scale-bar").attr("opacity", 0.85);

    for (let i = 0; i < barSegments; i++) {
      sg.append("rect")
        .attr("x", bx + i * segLen).attr("y", by)
        .attr("width", segLen).attr("height", barH)
        .attr("fill", i % 2 === 0 ? BLUE_INK : PARCHMENT)
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.6);
    }

    for (let i = 0; i <= barSegments; i++) {
      sg.append("text")
        .attr("x", bx + i * segLen).attr("y", by + barH + 11)
        .attr("text-anchor", "middle")
        .attr("font-family", FONT)
        .attr("font-size", "8px")
        .attr("font-style", "italic")
        .attr("fill", BLUE_INK)
        .text(i * milesPerInch);
    }

    sg.append("text")
      .attr("x", bx + barW / 2).attr("y", by + barH + 23)
      .attr("text-anchor", "middle")
      .attr("font-family", FONT)
      .attr("font-size", "10px")
      .attr("font-style", "italic")
      .attr("letter-spacing", "2px")
      .attr("fill", BLUE_INK)
      .text("miles");
  },

  renderCartouche(ctx) {
    const { g, bounds, meta, colors, FONT } = ctx;
    const { BLUE_INK, BLUE_LIGHT } = colors;
    const bx = bounds.minX - 30;
    const by = bounds.maxY + 25;

    // Small crescent moon to the left of the title — evokes the "moon letters" namesake.
    const moonG = g.append("g").attr("class", "moon-cartouche").attr("opacity", 0.75);
    const moonCX = bx - 14, moonCY = by - 4, moonR = 5;
    // Crescent: full disc minus offset disc (SVG path using arcs)
    moonG.append("path")
      .attr("d", `M ${moonCX} ${moonCY - moonR} A ${moonR} ${moonR} 0 1 0 ${moonCX} ${moonCY + moonR} A ${moonR * 0.7} ${moonR} 0 1 1 ${moonCX} ${moonCY - moonR} Z`)
      .attr("fill", BLUE_INK);
    // Three tiny stars around the moon — adds a nocturnal Thror's touch
    const starSpots = [
      { x: moonCX - 9, y: moonCY - 7 },
      { x: moonCX - 12, y: moonCY + 3 },
      { x: moonCX + 6, y: moonCY - 9 },
    ];
    starSpots.forEach(s => {
      moonG.append("path")
        .attr("d", `M ${s.x} ${s.y - 1.5} L ${s.x + 0.5} ${s.y - 0.5} L ${s.x + 1.5} ${s.y} L ${s.x + 0.5} ${s.y + 0.5} L ${s.x} ${s.y + 1.5} L ${s.x - 0.5} ${s.y + 0.5} L ${s.x - 1.5} ${s.y} L ${s.x - 0.5} ${s.y - 0.5} Z`)
        .attr("fill", BLUE_INK).attr("opacity", 0.75);
    });

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
    // Thin underline, flanked by tiny tick-marks — Thror's calligraphic touch
    g.append("line")
      .attr("x1", bx).attr("y1", by + 3)
      .attr("x2", bx + textLen).attr("y2", by + 3)
      .attr("stroke", BLUE_INK).attr("stroke-width", 0.4).attr("opacity", 0.55);
    g.append("line")
      .attr("x1", bx - 2).attr("y1", by + 1).attr("x2", bx - 2).attr("y2", by + 5)
      .attr("stroke", BLUE_INK).attr("stroke-width", 0.4).attr("opacity", 0.55);
    g.append("line")
      .attr("x1", bx + textLen + 2).attr("y1", by + 1).attr("x2", bx + textLen + 2).attr("y2", by + 5)
      .attr("stroke", BLUE_INK).attr("stroke-width", 0.4).attr("opacity", 0.55);
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
    // Tiny spider hanging on the web — a Thror's touch of whimsy
    const spiderR = (radii[2] + radii[3]) / 2;
    const spiderA = toRad((angles[1] + angles[2]) / 2);
    const sX = cornerX + Math.cos(spiderA) * spiderR;
    const sY = cornerY + Math.sin(spiderA) * spiderR;
    // Body
    cg.append("ellipse")
      .attr("cx", sX).attr("cy", sY).attr("rx", 1.2).attr("ry", 1.8)
      .attr("fill", BLUE_INK).attr("opacity", 0.85);
    // Legs — 3 tiny strokes on each side
    for (let j = -1; j <= 1; j++) {
      const off = (j - 0.5) * 1.5;
      cg.append("line")
        .attr("x1", sX - 0.5).attr("y1", sY + off)
        .attr("x2", sX - 3).attr("y2", sY + off - 1)
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.4).attr("opacity", 0.85);
      cg.append("line")
        .attr("x1", sX + 0.5).attr("y1", sY + off)
        .attr("x2", sX + 3).attr("y2", sY + off - 1)
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.4).attr("opacity", 0.85);
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
        .attr("opacity", 0.6);
      // Tiny tick at the annotation-text end, dot at the node end
      annotGroup.append("line")
        .attr("x1", nearAnnotX - Math.cos(angle) * 1.5).attr("y1", nearAnnotY - Math.sin(angle) * 1.5)
        .attr("x2", nearAnnotX + Math.cos(angle) * 1.5).attr("y2", nearAnnotY + Math.sin(angle) * 1.5)
        .attr("stroke", connectorColor).attr("stroke-width", 0.6).attr("opacity", 0.7);
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
          "the road goes ever on from here",
          "mark well this hidden place",
          "long ago were men here",
          "beware the shadow beneath",
          "many a wanderer has passed",
          "tales are told of this stone",
          "the wind alone remembers",
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

    // Only render the dragon silhouette when a node explicitly declares one.
    const beast = nodes.find(n => n.has_dragon || n.creature === "dragon");
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

    // Only render "great worm" serpent marks when nodes explicitly say so.
    const lairs = nodes.filter(n => n.has_worm || n.creature === "worm" || n.creature === "serpent");
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

    // Center fleur-de-lis marking North — a classic cartographic flourish.
    const fleurG = cg.append("g").attr("opacity", 0.85);
    // Vertical stem
    fleurG.append("path")
      .attr("d", `M 0 ${-size * 0.25} L 0 ${size * 0.1}`)
      .attr("stroke", BLUE_INK).attr("stroke-width", 0.9).attr("fill", "none");
    // Top bud (lobe at the tip)
    fleurG.append("path")
      .attr("d", `M 0 ${-size * 0.3} C -${size * 0.08} ${-size * 0.35}, -${size * 0.08} ${-size * 0.22}, 0 ${-size * 0.2} C ${size * 0.08} ${-size * 0.22}, ${size * 0.08} ${-size * 0.35}, 0 ${-size * 0.3} Z`)
      .attr("fill", BLUE_INK);
    // Side curls (left and right petals)
    fleurG.append("path")
      .attr("d", `M 0 ${-size * 0.15} C -${size * 0.13} ${-size * 0.1}, -${size * 0.14} ${size * 0.02}, -${size * 0.05} ${size * 0.05}`)
      .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.8);
    fleurG.append("path")
      .attr("d", `M 0 ${-size * 0.15} C ${size * 0.13} ${-size * 0.1}, ${size * 0.14} ${size * 0.02}, ${size * 0.05} ${size * 0.05}`)
      .attr("fill", "none").attr("stroke", BLUE_INK).attr("stroke-width", 0.8);
    // Crossbar band near the base
    fleurG.append("line")
      .attr("x1", -size * 0.1).attr("y1", size * 0.05)
      .attr("x2", size * 0.1).attr("y2", size * 0.05)
      .attr("stroke", BLUE_INK).attr("stroke-width", 1.0);

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
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.9)
        .attr("stroke-linecap", "round").attr("opacity", 0.85);
      // Hand-drawn arrowhead — two angled strokes, not a filled triangle
      const perpX = -v[1], perpY = v[0];
      const barbBackX = tipX - v[0] * 6;
      const barbBackY = tipY - v[1] * 6;
      arrowGroup.append("line")
        .attr("x1", tipX).attr("y1", tipY)
        .attr("x2", barbBackX + perpX * 3.5).attr("y2", barbBackY + perpY * 3.5)
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.9)
        .attr("stroke-linecap", "round").attr("opacity", 0.85);
      arrowGroup.append("line")
        .attr("x1", tipX).attr("y1", tipY)
        .attr("x2", barbBackX - perpX * 3.5).attr("y2", barbBackY - perpY * 3.5)
        .attr("stroke", BLUE_INK).attr("stroke-width", 0.9)
        .attr("stroke-linecap", "round").attr("opacity", 0.85);
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
