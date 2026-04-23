// wilderland.js — "Wilderland" hand-drawn map style for Open World Map viewer
// Extracted from wilderland.html. All rendering is self-contained; the host
// page supplies a render context (ctx) with shared utilities.

window.MapStyles = window.MapStyles || {};

window.MapStyles.wilderland = {
  name: "Wilderland",

  // Tolkien Wilderland uses hand-calligraphic labels. IM Fell English is
  // a near-facsimile of 1670s English metal type and reads as hand-drawn
  // on parchment.
  font: "'IM Fell English', 'Palatino Linotype', Palatino, serif",

  /* ── CSS custom-property values ─────────────────────────────── */
  css: {
    "--bg-color":      "#3a3428",
    "--panel-bg":      "#f5edd6",
    "--panel-border":  "#2a1f14",
    "--panel-text":    "#2a1f14",
    "--panel-heading": "#2a1f14",
    "--panel-type":    "#5a4a3a",
    "--title-color":   "#5a4a3a",
    "--btn-bg":        "#f4e8d1",
    "--btn-border":    "#2a1f14",
    "--btn-text":      "#2a1f14",
  },

  /* ── Palette ────────────────────────────────────────────────── */
  colors: {
    INK:            "#2a1f14",
    INK_LIGHT:      "#6b5d4d",
    BLUE:           "#3a6090",
    BLUE_LIGHT:     "#7a9ab8",
    PARCHMENT:      "#f5edd6",
    PARCHMENT_DARK: "#ddd0b4",
  },

  /* ── Node visibility filter ─────────────────────────────────── */
  filterNodes(nodes) {
    return nodes.filter(isOverlandNode);
  },

  /* ── Master render (called by core) ─────────────────────────── */
  render(ctx) {
    this.renderBackground(ctx);
    this.renderBorder(ctx);
    // Thin double-line ribbon — two parallel fine ink strokes (width 2
    // triggers the default twin-bank branch with bankStroke 0.9 and banks
    // ~2.2 px apart). Matches the Wilderland reference's ribbon rivers.
    // wl-18 flattened this to singleLine and that was a regression — per
    // user correction 2026-04-22, the reference is a ribbon, not a stroke.
    MapCore.renderRiver(ctx, ctx.colors.INK, 2);
    // River labels in BLUE ink — matches Tolkien's Wilderland reference
    // where "River Running", "Long Lake", etc. are all rendered in blue.
    MapCore.renderRiverLabel(ctx, { color: ctx.colors.BLUE, strokeColor: ctx.colors.PARCHMENT });
    MapCore.renderBridges(ctx, { color: ctx.colors.INK, strokeWidth: 1.0, bridgeLen: 14 });
    MapCore.renderBoats(ctx, { color: ctx.colors.INK, parchment: ctx.colors.PARCHMENT, count: 4 });
    // Tolkien's Wilderland renders the Old Forest Road in blue ink
    // (contrast against black-ink rivers).
    MapCore.renderRoad(ctx, ctx.colors.BLUE, 1.8);
    // Twin-banked gorge: tips meet at points, middle bulges irregularly
    // to read as a crack in the ground instead of a single zig-zag line.
    MapCore.renderCrevasse(ctx, "#2a1f14", 5, { style: "twinbank" });
    this.renderLinks(ctx);
    this.renderTerrainSymbols(ctx);
    // Wilderland reference uses BLUE ink for region labels ("GREY
    // MOUNTAINS", "Mirkwood", etc.), not black/brown. Matches Tolkien's
    // two-ink convention (black line art + blue label text).
    MapCore.renderRegionLabels(ctx, {
      color: ctx.colors.BLUE,
      strokeColor: ctx.colors.PARCHMENT,
      fontSize: 22,
      letterSpacing: "6px",
      opacity: 0.75,
      fontStyle: "normal",
    });
    this.renderNodes(ctx);
    this.renderLabels(ctx);
    this.renderDayLabels(ctx);
    this.renderCompass(ctx);
    this.renderScaleBar(ctx);
    this.renderCartouche(ctx);
    this.renderEdgeAnnotations(ctx);
  },

  /* ────────────────────────────────────────────────────────────
     Individual render methods — ported verbatim from wilderland.html
     with bare constants replaced by ctx.colors / ctx.*
     ──────────────────────────────────────────────────────────── */

  // --- Parchment background ---
  renderBackground(ctx) {
    const { g, defs, WIDTH, HEIGHT } = ctx;
    const { PARCHMENT, PARCHMENT_DARK } = ctx.colors;

    // Paper texture filter — warmer, slightly more visible grain
    const filter = defs.append("filter")
      .attr("id", "parchment-texture")
      .attr("x", "0%").attr("y", "0%")
      .attr("width", "100%").attr("height", "100%");

    filter.append("feTurbulence")
      .attr("type", "fractalNoise")
      .attr("baseFrequency", "0.04")
      .attr("numOctaves", "5")
      .attr("seed", "7")
      .attr("stitchTiles", "stitch")
      .attr("result", "noise");

    filter.append("feColorMatrix")
      .attr("type", "matrix")
      .attr("in", "noise")
      .attr("values", `0 0 0 0 0.961
                       0 0 0 0 0.929
                       0 0 0 0 0.839
                       0 0 0 0.35 0.65`)
      .attr("result", "colored");

    filter.append("feBlend")
      .attr("in", "SourceGraphic")
      .attr("in2", "colored")
      .attr("mode", "multiply");

    // Background gradient — warmer center
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

  // --- Border ---
  renderBorder(ctx) {
    const { g, bounds } = ctx;
    const { INK } = ctx.colors;

    const pad = 40;
    const x = bounds.minX - pad;
    const y = bounds.minY - pad;
    const w = bounds.maxX - bounds.minX + pad * 2;
    const h = bounds.maxY - bounds.minY + pad * 2;

    // Outer ruled line
    g.append("rect")
      .attr("x", x).attr("y", y)
      .attr("width", w).attr("height", h)
      .attr("fill", "none")
      .attr("stroke", INK)
      .attr("stroke-width", 0.6)
      .attr("opacity", 0.45);

    // Inner ruled line
    g.append("rect")
      .attr("x", x + 4).attr("y", y + 4)
      .attr("width", w - 8).attr("height", h - 8)
      .attr("fill", "none")
      .attr("stroke", INK)
      .attr("stroke-width", 0.35)
      .attr("opacity", 0.35);

    // Corner decorative marks — small cross/tick at each corner
    const cm = 8;
    const corners = [
      [x, y], [x + w, y], [x, y + h], [x + w, y + h]
    ];
    corners.forEach(([cx, cy]) => {
      g.append("line")
        .attr("x1", cx - cm).attr("y1", cy - cm)
        .attr("x2", cx + cm).attr("y2", cy + cm)
        .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.4);
      g.append("line")
        .attr("x1", cx + cm).attr("y1", cy - cm)
        .attr("x2", cx - cm).attr("y2", cy + cm)
        .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.4);
    });
  },

  // --- Path/link rendering ---
  renderLinks(ctx) {
    const { g, links } = ctx;
    const { INK, BLUE } = ctx.colors;
    const mulberry32 = ctx.mulberry32;
    const seedFromString = ctx.seedFromString;

    const linkGroup = g.append("g").attr("class", "links");

    links.forEach(link => {
      const sx = link.source.x, sy = link.source.y;
      const tx = link.target.x, ty = link.target.y;

      const dx = tx - sx, dy = ty - sy;
      const len = Math.sqrt(dx * dx + dy * dy);
      const rng = mulberry32(seedFromString(link.name || "link"));
      // Slightly more curvature than original for hand-drawn feel
      const curvature = (rng() - 0.5) * len * 0.2;
      const nx = -dy / len, ny = dx / len;
      const cx = (sx + tx) / 2 + nx * curvature;
      const cy = (sy + ty) / 2 + ny * curvature;

      if (link.path_type === "river") {
        // Double-line river channel (two parallel bank lines)
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
          .attr("fill", "none").attr("stroke", BLUE).attr("stroke-width", 2.5)
          .attr("stroke-linecap", "round");
        linkGroup.append("path").attr("d", lineGen(offsetBank(spine, -1)))
          .attr("fill", "none").attr("stroke", BLUE).attr("stroke-width", 1.5)
          .attr("stroke-linecap", "round");
        return;
      }

      const pathD = `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;

      const path = linkGroup.append("path")
        .attr("d", pathD)
        .attr("fill", "none")
        .attr("stroke-linecap", "round");

      switch (link.path_type) {
        case "road":
          // Blue ink matches the hand-drawn Wilderland road convention.
          path.attr("stroke", BLUE).attr("stroke-width", 1.8).attr("opacity", 0.9);
          break;
        case "trail":
          path.attr("stroke", INK).attr("stroke-width", 1.1).attr("stroke-dasharray", "6 4").attr("opacity", 0.8);
          break;
        case "wilderness":
          path.attr("stroke", INK).attr("stroke-width", 0.8).attr("stroke-dasharray", "3 5").attr("opacity", 0.65);
          break;
        default:
          path.attr("stroke", INK).attr("stroke-width", 1.2);
      }
    });
  },

  // --- Terrain symbol placement ---
  renderTerrainSymbols(ctx) {
    const { g, nodes, links } = ctx;
    const { INK, BLUE, PARCHMENT } = ctx.colors;
    const mulberry32 = ctx.mulberry32;
    const seedFromString = ctx.seedFromString;

    const terrainGroup = g.append("g").attr("class", "terrain");

    // --- Local terrain symbol helper functions ---

    function drawMountain(tg, x, y, size, rng) {
      // Tolkien Wilderland-style mountain — one of three variants so the
      // range doesn't look uniform. Each variant keeps the shadow-hatch
      // triangle aesthetic but varies peak count, height profile, and
      // tiering.
      const variant = rng();
      let peakCount, spacing, tiers, peakHRange, shortPeaks;
      if (variant < 0.4) {
        // A: Ridge — many modest peaks close together (the original look)
        peakCount = 4 + Math.floor(rng() * 3);
        spacing = size * 0.34;
        tiers = 3;
        peakHRange = [0.5, 0.8];
        shortPeaks = false;
      } else if (variant < 0.7) {
        // B: Twin Spires — two tall prominent peaks with smaller flanks
        peakCount = 3 + Math.floor(rng() * 2);
        spacing = size * 0.48;
        tiers = 2;
        peakHRange = [0.7, 1.15];
        shortPeaks = false;
      } else {
        // C: Broken hills — fewer, stubbier, rolling peaks (low rocky crest)
        peakCount = 2 + Math.floor(rng() * 2);
        spacing = size * 0.52;
        tiers = 2;
        peakHRange = [0.35, 0.55];
        shortPeaks = true;
      }

      const rangeW = (peakCount - 1) * spacing;
      const peaks = [];
      for (let i = 0; i < peakCount; i++) {
        const tier = Math.floor(rng() * tiers);
        const tierY = y - tier * size * 0.22;
        const px = x - rangeW / 2 + i * spacing + (rng() - 0.5) * size * 0.08;
        const h = size * (peakHRange[0] + rng() * (peakHRange[1] - peakHRange[0]));
        peaks.push({ px, baseY: tierY, h, pw: size * (0.4 + rng() * 0.12), tier });
      }
      peaks.sort((a, b) => (b.tier - a.tier) || (b.h - a.h));
      peaks.forEach((p) => {
        const peakY = p.baseY - p.h;
        const leftBaseX = p.px - p.pw / 2;
        const rightBaseX = p.px + p.pw / 2;
        tg.append("path")
          .attr("d", `M ${leftBaseX} ${p.baseY} L ${p.px} ${peakY} L ${rightBaseX} ${p.baseY} Z`)
          .attr("fill", PARCHMENT).attr("stroke", "none");
        tg.append("path")
          .attr("d", `M ${leftBaseX} ${p.baseY} L ${p.px} ${peakY} L ${rightBaseX} ${p.baseY}`)
          .attr("fill", "none").attr("stroke", INK)
          .attr("stroke-width", 0.7).attr("stroke-linejoin", "round")
          .attr("stroke-linecap", "round");
        // Shorter mountains get fewer hatch strokes; tall peaks get more
        const hatchCount = shortPeaks ? 3 : 5 + Math.floor(rng() * 2);
        for (let h = 0; h < hatchCount; h++) {
          const t = 0.18 + h * 0.14 + rng() * 0.03;
          const sx = leftBaseX + (p.px - leftBaseX) * t;
          const sy = p.baseY + (peakY - p.baseY) * t;
          const ex = sx + p.pw * 0.14;
          const ey = p.baseY;
          tg.append("line")
            .attr("x1", sx).attr("y1", sy).attr("x2", ex).attr("y2", ey)
            .attr("stroke", INK).attr("stroke-width", 0.45).attr("opacity", 0.7);
        }
      });
    }

    function drawMountainRidge(tg, peaks, rng, opts) {
      // Wilderland peaks at 5x zoom on the reference are LINE DRAWINGS,
      // not filled shapes. Each peak is a single curved pen stroke —
      // wave-crest shape, open at the bottom — with a few short hatch
      // ticks underneath for shadow. The dark character of the spine in
      // the reference comes from MANY OVERLAPPING peak strokes, not
      // from each peak being individually dark.
      if (!peaks || peaks.length === 0) return;

      peaks.forEach(p => {
        const baseY = p.py;
        const hw = p.h * 0.42;
        const baseLX = p.px - hw;
        const baseRX = p.px + hw;
        // Strong rightward apex tilt — matches reference's wind-shaped
        // peaks. Randomize slightly so peaks don't look stamped.
        const tiltRight = 0.22 + rng() * 0.20;
        const apX = p.px + hw * tiltRight;
        const apY = baseY - p.h;

        // Single open curve: rise on the left with a subtle belly,
        // drop on the right more steeply. Two cubic Bezier segments
        // meeting at the apex — no closure to the baseline.
        const lC1x = baseLX + hw * (0.35 + rng() * 0.15);
        const lC1y = baseY - p.h * (0.25 + rng() * 0.12);
        const lC2x = apX - hw * (0.15 + rng() * 0.10);
        const lC2y = apY + p.h * (0.10 + rng() * 0.08);
        const rC1x = apX + hw * (0.08 + rng() * 0.06);
        const rC1y = apY + p.h * (0.22 + rng() * 0.10);
        const rC2x = baseRX - hw * (0.08 + rng() * 0.08);
        const rC2y = baseY - p.h * (0.12 + rng() * 0.08);

        // Sample both cubic Beziers as a polyline with per-point jitter
        // so the peak line wobbles like a hand-drawn pen stroke instead
        // of reading as a mathematically smooth curve. Cubic Bezier
        // parametric form: B(t) = (1-t)^3 P0 + 3(1-t)^2 t P1 + 3(1-t) t^2 P2 + t^3 P3
        const sampleCubic = (P0, P1, P2, P3, steps, includeStart) => {
          const pts = [];
          for (let i = includeStart ? 0 : 1; i <= steps; i++) {
            const t = i / steps;
            const it = 1 - t;
            const b0 = it * it * it;
            const b1 = 3 * it * it * t;
            const b2 = 3 * it * t * t;
            const b3 = t * t * t;
            const x = b0 * P0[0] + b1 * P1[0] + b2 * P2[0] + b3 * P3[0];
            const y = b0 * P0[1] + b1 * P1[1] + b2 * P2[1] + b3 * P3[1];
            // Per-point jitter — endpoints get smaller jitter so the
            // peak ends connect cleanly to neighbours.
            const edgeDamp = Math.min(t, 1 - t) * 2;
            const jx = (rng() - 0.5) * 1.2 * edgeDamp;
            const jy = (rng() - 0.5) * 1.2 * edgeDamp;
            pts.push([x + jx, y + jy]);
          }
          return pts;
        };
        const leftPts  = sampleCubic([baseLX, baseY], [lC1x, lC1y], [lC2x, lC2y], [apX, apY], 10, true);
        const rightPts = sampleCubic([apX, apY], [rC1x, rC1y], [rC2x, rC2y], [baseRX, baseY], 8, false);
        const allPts = leftPts.concat(rightPts);
        const strokeD = "M " + allPts.map(p => p[0].toFixed(2) + " " + p[1].toFixed(2)).join(" L ");

        // Per-peak opacity variation — simulates pen pressure on hand-
        // drawn ink. Uniform opacity reads as mechanical/printed; small
        // opacity range 0.70-1.00 gives the range hand-drawn character.
        const peakOpacity = 0.72 + rng() * 0.28;
        tg.append("path")
          .attr("d", strokeD)
          .attr("fill", "none")
          .attr("stroke", INK)
          .attr("stroke-width", 1.0 + rng() * 0.3)
          .attr("stroke-linecap", "round")
          .attr("stroke-linejoin", "round")
          .attr("opacity", peakOpacity);

        // Shadow hatches: 2-4 SHORT horizontal ticks on the right flank
        // below the apex. NOT a dense fill — just a few dashes hinting
        // at the shadow side. Reference peaks have minimal hatching.
        const hatchCount = 2 + Math.floor(rng() * 3);
        for (let k = 0; k < hatchCount; k++) {
          const t = 0.35 + k * 0.16 + (rng() - 0.5) * 0.06;
          if (t >= 0.95) continue;
          const hy = apY + (baseY - apY) * t;
          // Right silhouette x at this y (linear approx of the Bezier)
          const rightEdgeAtT = apX + (baseRX - apX) * t;
          // Hatch spans from ~30-40% along the flank to just inside the edge
          const hx1 = apX + (rightEdgeAtT - apX) * (0.30 + rng() * 0.15) + (rng() - 0.5) * 0.8;
          const hx2 = rightEdgeAtT - 0.6 - rng() * 0.8;
          if (hx2 - hx1 < 1.0) continue;
          // Diagonal slant — reference ticks slope ↘ (down-right), not
          // flat horizontal. Slant 2-4px over a ~5-8px horizontal span
          // gives a ~30-45° diagonal.
          const slant = 2.0 + rng() * 2.0;
          tg.append("line")
            .attr("x1", hx1).attr("y1", hy)
            .attr("x2", hx2).attr("y2", hy + slant)
            .attr("stroke", INK)
            .attr("stroke-width", 0.5)
            .attr("opacity", 0.7 + rng() * 0.25)
            .attr("stroke-linecap", "round");
        }
      });
    }

    function drawTreeCanopy(tg, x, y, size, rng) {
      // Pick one of several hand-drawn tree variants at random — matches
      // the hand-drawn source's mix of round-leaf trees, fir/pine peaks,
      // thin saplings, and clumpy bushes.
      const variant = rng();
      const PARCH = ctx.colors.PARCHMENT;

      // Mapeffects old-growth technique: scatter a few short detail ticks
      // on the forest floor around every tree (downward-right isometric
      // angle). Adds texture without demanding much ink.
      const floorMarks = 1 + Math.floor(rng() * 2);
      for (let i = 0; i < floorMarks; i++) {
        const fx = x + (rng() - 0.5) * size * 0.9;
        const fy = y + size * (0.35 + rng() * 0.25);
        const len = 1 + rng() * 1.4;
        tg.append("line")
          .attr("x1", fx).attr("y1", fy)
          .attr("x2", fx + len).attr("y2", fy + len * 0.45)
          .attr("stroke", INK).attr("stroke-width", 0.42).attr("opacity", 0.5);
      }

      if (variant < 0.35) {
        // --- Cloud-blob canopy (old-growth look) ---
        // Mapeffects "old-growth" tips: overlap canopies back-to-front, draw
        // the TOP edge with a slightly heavier stroke so the forest pops off
        // the ground, and scatter tiny broken-line detail marks nearby for
        // floor texture.
        const count = 1 + Math.floor(rng() * 3);
        const spread = size * 0.6;
        const canopies = [];
        for (let i = 0; i < count; i++) {
          canopies.push({
            cx: x + (rng() - 0.5) * spread,
            cy: y + (rng() - 0.5) * spread * 0.7,
            cr: size * (0.25 + rng() * 0.18),
          });
        }
        canopies.sort((a, b) => a.cy - b.cy);
        const lineGen = d3.line().curve(d3.curveBasisClosed);
        canopies.forEach(c => {
          const wobble = c.cr * 0.18;
          const steps = 12;
          const points = [];
          for (let i = 0; i < steps; i++) {
            const a = (i / steps) * Math.PI * 2;
            const wr = c.cr + (rng() - 0.5) * wobble * 2;
            points.push([c.cx + Math.cos(a) * wr, c.cy + Math.sin(a) * wr]);
          }
          // Base canopy with medium stroke
          tg.append("path")
            .attr("d", lineGen(points))
            .attr("fill", PARCH).attr("stroke", INK).attr("stroke-width", 0.75).attr("opacity", 0.95);
          // Thicker TOP-edge arc — overdraws the upper half with a heavier
          // stroke so the canopy silhouette reads at a glance (key mapeffects
          // old-growth technique).
          const topArcPts = [];
          for (let i = 0; i <= 10; i++) {
            const a = Math.PI + (i / 10) * Math.PI; // top semicircle
            const wr = c.cr * 1.02;
            topArcPts.push([c.cx + Math.cos(a) * wr, c.cy + Math.sin(a) * wr]);
          }
          tg.append("path")
            .attr("d", d3.line().curve(d3.curveBasis)(topArcPts))
            .attr("fill", "none").attr("stroke", INK)
            .attr("stroke-width", 1.1).attr("stroke-linecap", "round")
            .attr("opacity", 0.85);
          // Tiny interior tuft mark
          if (rng() > 0.4) {
            const m = c.cr * 0.25;
            tg.append("line").attr("x1", c.cx - m).attr("y1", c.cy).attr("x2", c.cx + m).attr("y2", c.cy)
              .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.55);
            tg.append("line").attr("x1", c.cx).attr("y1", c.cy - m * 0.6).attr("x2", c.cx).attr("y2", c.cy + m * 0.6)
              .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.55);
          }
          // Ground shadow
          tg.append("line")
            .attr("x1", c.cx - c.cr * 0.55).attr("y1", c.cy + c.cr * 0.92)
            .attr("x2", c.cx + c.cr * 0.55).attr("y2", c.cy + c.cr * 0.92)
            .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.35);
        });
        // A few scattered forest-floor detail marks around the cluster —
        // tiny broken lines at a slight downward-right angle (mapeffects
        // "isometric scatter detail" technique).
        const floorMarks = 2 + Math.floor(rng() * 3);
        for (let i = 0; i < floorMarks; i++) {
          const fx = x + (rng() - 0.5) * size * 0.9;
          const fy = y + size * 0.4 + (rng() - 0.5) * size * 0.2;
          const len = 1 + rng() * 1.2;
          tg.append("line")
            .attr("x1", fx).attr("y1", fy)
            .attr("x2", fx + len).attr("y2", fy + len * 0.4)
            .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.45);
        }
      }
      else if (variant < 0.6) {
        // --- Fir/pine triangle (stacked canopy, trunk below) ---
        const th = size * 0.75;
        const tw = size * 0.45;
        const tiers = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < tiers; i++) {
          const tierY = y - th * (i / tiers) * 0.85 - size * 0.05;
          const tierW = tw * (1 - i * 0.2);
          tg.append("path")
            .attr("d", `M ${x - tierW / 2} ${tierY} L ${x} ${tierY - th * 0.5} L ${x + tierW / 2} ${tierY} Z`)
            .attr("fill", PARCH).attr("stroke", INK).attr("stroke-width", 0.7);
        }
        // Heavy top-edge accent on the topmost tier (mapeffects old-growth
        // "thicker line on the top silhouette" technique).
        const topTierY = y - th * ((tiers - 1) / tiers) * 0.85 - size * 0.05;
        const topTierW = tw * (1 - (tiers - 1) * 0.2);
        tg.append("path")
          .attr("d", `M ${x - topTierW / 2 - 0.3} ${topTierY} L ${x} ${topTierY - th * 0.5} L ${x + topTierW / 2 + 0.3} ${topTierY}`)
          .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.2)
          .attr("stroke-linejoin", "round").attr("stroke-linecap", "round");
        // Short trunk at the base
        tg.append("line")
          .attr("x1", x).attr("y1", y).attr("x2", x).attr("y2", y + size * 0.15)
          .attr("stroke", INK).attr("stroke-width", 0.7);
      }
      else if (variant < 0.82) {
        // --- Round leafy tree with visible trunk + heavy top-arc ---
        const r = size * (0.28 + rng() * 0.12);
        const cx = x, cy = y - r * 0.7;
        // Trunk (parchment-filled rectangle behind the canopy)
        tg.append("rect")
          .attr("x", cx - 0.7).attr("y", cy)
          .attr("width", 1.4).attr("height", r * 1.4)
          .attr("fill", PARCH).attr("stroke", INK).attr("stroke-width", 0.55);
        // Canopy — bumpy circle
        const bumps = 7;
        const points = [];
        for (let i = 0; i < bumps; i++) {
          const a = (i / bumps) * Math.PI * 2;
          const rr = r + (rng() - 0.5) * r * 0.25;
          points.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
        }
        tg.append("path")
          .attr("d", d3.line().curve(d3.curveBasisClosed)(points))
          .attr("fill", PARCH).attr("stroke", INK).attr("stroke-width", 0.75);
        // Heavy top half-arc — mapeffects old-growth "thicker top edge"
        const topArc = [];
        for (let i = 0; i <= 8; i++) {
          const a = Math.PI + (i / 8) * Math.PI;
          topArc.push([cx + Math.cos(a) * r * 1.02, cy + Math.sin(a) * r * 1.02]);
        }
        tg.append("path")
          .attr("d", d3.line().curve(d3.curveBasis)(topArc))
          .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.2)
          .attr("stroke-linecap", "round").attr("opacity", 0.9);
        // Inner vein lines for leafiness
        tg.append("line")
          .attr("x1", cx).attr("y1", cy - r * 0.5).attr("x2", cx).attr("y2", cy + r * 0.5)
          .attr("stroke", INK).attr("stroke-width", 0.35).attr("opacity", 0.45);
        tg.append("line")
          .attr("x1", cx - r * 0.4).attr("y1", cy).attr("x2", cx + r * 0.4).attr("y2", cy)
          .attr("stroke", INK).attr("stroke-width", 0.35).attr("opacity", 0.45);
      }
      else if (variant < 0.93) {
        // --- Tall thin sapling — just a few branches fanning out ---
        const th = size * 0.75;
        // Trunk
        tg.append("line")
          .attr("x1", x).attr("y1", y).attr("x2", x).attr("y2", y - th)
          .attr("stroke", INK).attr("stroke-width", 0.75);
        // 4-5 short branches
        const branchCount = 4 + Math.floor(rng() * 2);
        for (let i = 0; i < branchCount; i++) {
          const t = 0.3 + (i / branchCount) * 0.65;
          const by = y - th * t;
          const dir = i % 2 === 0 ? 1 : -1;
          const bLen = size * (0.12 + rng() * 0.1);
          tg.append("line")
            .attr("x1", x).attr("y1", by)
            .attr("x2", x + dir * bLen).attr("y2", by - bLen * 0.6)
            .attr("stroke", INK).attr("stroke-width", 0.5);
        }
      }
      else {
        // --- Low bush/clump — 3 small round bumps in a row ---
        const bw = size * 0.18;
        for (let i = 0; i < 3; i++) {
          const bx = x + (i - 1) * bw * 1.4;
          const by = y - bw * 0.4 + (rng() - 0.5) * 0.8;
          tg.append("circle")
            .attr("cx", bx).attr("cy", by).attr("r", bw * (0.9 + rng() * 0.2))
            .attr("fill", PARCH).attr("stroke", INK).attr("stroke-width", 0.6);
        }
        // Ground shadow
        tg.append("line")
          .attr("x1", x - bw * 1.6).attr("y1", y + 1).attr("x2", x + bw * 1.6).attr("y2", y + 1)
          .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.4);
      }
    }

    function drawSwampReeds(tg, x, y, size, rng) {
      // Subtle water-tint ellipse beneath the ripples — suggests wetland pool
      tg.append("ellipse")
        .attr("cx", x).attr("cy", y)
        .attr("rx", size * 0.85).attr("ry", size * 0.5)
        .attr("fill", BLUE).attr("opacity", 0.08);
      // Layered wavy blue water lines
      const ripples = 4 + Math.floor(rng() * 2);
      for (let i = 0; i < ripples; i++) {
        const ly = y - size * 0.3 + i * size * 0.22 + (rng() - 0.5) * 1.5;
        const w = size * (0.75 + rng() * 0.4);
        const lx = x - w / 2 + (rng() - 0.5) * 2;
        const amp = size * (0.08 + rng() * 0.05);
        const d = `M ${lx} ${ly} Q ${lx + w * 0.25} ${ly - amp} ${lx + w * 0.5} ${ly} Q ${lx + w * 0.75} ${ly + amp} ${lx + w} ${ly}`;
        tg.append("path")
          .attr("d", d)
          .attr("fill", "none")
          .attr("stroke", BLUE)
          .attr("stroke-width", 0.7)
          .attr("opacity", 0.6);
      }
      // Reed tufts with cattails
      const tufts = 2 + Math.floor(rng() * 2);
      for (let t = 0; t < tufts; t++) {
        const cx = x + (rng() - 0.5) * size * 0.9;
        const baseY = y - size * 0.1;
        const stalks = 2 + Math.floor(rng() * 3);
        for (let i = 0; i < stalks; i++) {
          const rx = cx + (i - (stalks - 1) / 2) * 1.4 + (rng() - 0.5) * 0.6;
          const topLean = (rng() - 0.5) * 1.5;
          const topY = baseY - size * (0.4 + rng() * 0.2);
          tg.append("line")
            .attr("x1", rx).attr("y1", baseY)
            .attr("x2", rx + topLean).attr("y2", topY)
            .attr("stroke", INK).attr("stroke-width", 0.6).attr("opacity", 0.75);
          if (rng() > 0.4) {
            tg.append("ellipse")
              .attr("cx", rx + topLean).attr("cy", topY - 1.5)
              .attr("rx", 0.8).attr("ry", 1.6)
              .attr("fill", INK).attr("opacity", 0.75);
          }
        }
      }
    }

    function drawGrassTuft(tg, x, y, size, rng) {
      // Tolkien Wilderland plains: subtle dot stipple with occasional tiny
      // grass flecks. Sparser and more cartographic than blade tufts.
      const dotCount = 6 + Math.floor(rng() * 5);
      for (let i = 0; i < dotCount; i++) {
        tg.append("circle")
          .attr("cx", x + (rng() - 0.5) * size * 1.4)
          .attr("cy", y + (rng() - 0.5) * size * 0.85)
          .attr("r", 0.55 + rng() * 0.45)
          .attr("fill", INK)
          .attr("opacity", 0.4);
      }
      // Occasional single short grass flick — breaks up pure dots
      const flickCount = Math.floor(rng() * 3);
      for (let i = 0; i < flickCount; i++) {
        const fx = x + (rng() - 0.5) * size * 1.2;
        const fy = y + (rng() - 0.5) * size * 0.7;
        const lean = (rng() - 0.5) * 1.0;
        tg.append("line")
          .attr("x1", fx).attr("y1", fy)
          .attr("x2", fx + lean).attr("y2", fy - size * 0.2)
          .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.45);
      }
    }

    function drawRocks(tg, x, y, size, rng) {
      // Scattered small pebble circles — distinctive Wilderland texture
      const count = 9 + Math.floor(rng() * 8);
      for (let i = 0; i < count; i++) {
        const rx = x + (rng() - 0.5) * size * 2.2;
        const ry = y + (rng() - 0.5) * size * 1.9;
        const r = 1.5 + rng() * 2.5;
        tg.append("circle")
          .attr("cx", rx).attr("cy", ry)
          .attr("r", r)
          .attr("fill", "none")
          .attr("stroke", INK)
          .attr("stroke-width", 0.8)
          .attr("opacity", 0.6);
      }
    }

    function drawSpiderweb(tg, x, y, size, rng) {
      const numRadials = 3 + Math.floor(rng() * 2); // 3-4 radial lines
      const len = 12 + rng() * 3; // 12-15px
      const angles = [];
      for (let i = 0; i < numRadials; i++) {
        angles.push(rng() * Math.PI * 2);
      }
      angles.sort((a, b) => a - b);

      // Draw radial lines
      angles.forEach(a => {
        tg.append("line")
          .attr("x1", x).attr("y1", y)
          .attr("x2", x + Math.cos(a) * len).attr("y2", y + Math.sin(a) * len)
          .attr("stroke", INK)
          .attr("stroke-width", 0.4)
          .attr("opacity", 0.85);
      });

      // Draw 2 concentric arc segments connecting radials
      [0.4, 0.75].forEach(t => {
        const r = len * t;
        for (let i = 0; i < angles.length; i++) {
          const a1 = angles[i];
          const a2 = angles[(i + 1) % angles.length];
          const x1 = x + Math.cos(a1) * r;
          const y1 = y + Math.sin(a1) * r;
          const x2 = x + Math.cos(a2) * r;
          const y2 = y + Math.sin(a2) * r;
          const midA = (a1 + a2) / 2 + (a2 < a1 ? Math.PI : 0);
          const bulge = r * 0.15;
          const cx = (x1 + x2) / 2 + Math.cos(midA) * bulge;
          const cy = (y1 + y2) / 2 + Math.sin(midA) * bulge;
          tg.append("path")
            .attr("d", `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`)
            .attr("fill", "none")
            .attr("stroke", INK)
            .attr("stroke-width", 0.4)
            .attr("opacity", 0.85);
        }
      });
    }

    function drawBird(tg, x, y, size, rng) {
      const w = 3 + rng() * 2; // half-wingspan 3-5px (total 6-10)
      const h = 2 + rng() * 2; // height of the V curve
      tg.append("path")
        .attr("d", `M ${x - w} ${y} Q ${x} ${y - h} ${x + w} ${y}`)
        .attr("fill", "none")
        .attr("stroke", INK)
        .attr("stroke-width", 0.5)
        .attr("opacity", 0.4);
    }

    // --- Terrain drawing helpers for hills and farms ---

    function drawHill(tg, x, y, size, rng) {
      // Hand-drawn hills with variety. Three variants:
      //   - single rounded hump (⌒) — the basic hill
      //   - rolling double hump (⌒⌒) — linked small hills
      //   - rocky/crested — hump with a small stone bump on top
      const variant = rng();
      if (variant < 0.55) {
        // Simple hump, 1-2 per cluster
        const count = 1 + Math.floor(rng() * 2);
        const spacing = size * 0.65;
        for (let i = 0; i < count; i++) {
          const cx = x + (i - (count - 1) / 2) * spacing + (rng() - 0.5) * size * 0.1;
          const w = size * (0.75 + rng() * 0.25);
          const h = size * (0.35 + rng() * 0.2);
          tg.append("path")
            .attr("d", `M ${cx - w / 2} ${y} Q ${cx} ${y - h * 1.2} ${cx + w / 2} ${y}`)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.85)
            .attr("stroke-linecap", "round").attr("opacity", 0.7);
        }
      } else if (variant < 0.85) {
        // Rolling double-hump — linked arcs making a continuous hilly shape
        const w = size * (0.95 + rng() * 0.25);
        const h = size * (0.35 + rng() * 0.18);
        const mid = x + (rng() - 0.5) * size * 0.08;
        const midY = y - h * 0.4;
        tg.append("path")
          .attr("d", `M ${x - w / 2} ${y}
                      Q ${x - w / 4} ${y - h * 1.2} ${mid} ${midY}
                      Q ${x + w / 4} ${y - h * 1.3} ${x + w / 2} ${y}`)
          .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.85)
          .attr("stroke-linecap", "round").attr("opacity", 0.7);
      } else {
        // Crested hill — a hump with a small stone / rocky crest on top
        const w = size * (0.7 + rng() * 0.2);
        const h = size * (0.4 + rng() * 0.15);
        const cx = x + (rng() - 0.5) * size * 0.08;
        tg.append("path")
          .attr("d", `M ${cx - w / 2} ${y} Q ${cx} ${y - h * 1.2} ${cx + w / 2} ${y}`)
          .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.85)
          .attr("stroke-linecap", "round").attr("opacity", 0.7);
        // Small rock on the crest
        const rx = cx + (rng() - 0.5) * w * 0.15;
        const ry = y - h * 1.05;
        tg.append("ellipse")
          .attr("cx", rx).attr("cy", ry).attr("rx", size * 0.1).attr("ry", size * 0.065)
          .attr("fill", INK).attr("opacity", 0.7);
      }
    }

    function drawFarm(tg, x, y, size, rng) {
      // Small farmhouse compound: 2-3 buildings with peaked roofs, furrows on both sides
      const buildings = 2 + Math.floor(rng() * 2);
      const spacing = size * 0.45;
      const smokeIdx = Math.floor(buildings / 2);
      for (let b = 0; b < buildings; b++) {
        const bx = x + (b - (buildings - 1) / 2) * spacing + (rng() - 0.5) * 1;
        const by = y + (rng() - 0.5) * size * 0.2;
        const bw = size * (0.22 + rng() * 0.15);
        const bh = size * (0.16 + rng() * 0.12);
        tg.append("rect")
          .attr("x", bx - bw / 2).attr("y", by - bh / 2)
          .attr("width", bw).attr("height", bh)
          .attr("fill", "none").attr("stroke", INK)
          .attr("stroke-width", 0.5).attr("opacity", 0.6);
        const roofPeakY = by - bh / 2 - bh * 0.75;
        tg.append("path")
          .attr("d", `M ${bx - bw / 2 - 0.3} ${by - bh / 2} L ${bx} ${roofPeakY} L ${bx + bw / 2 + 0.3} ${by - bh / 2}`)
          .attr("fill", "none").attr("stroke", INK)
          .attr("stroke-width", 0.5).attr("opacity", 0.6);
        // Tiny smoke puff from the central farmhouse — inhabited touch
        if (b === smokeIdx) {
          const sx = bx + bw * 0.15;
          const sy = roofPeakY;
          tg.append("path")
            .attr("d", `M ${sx} ${sy} C ${sx - 1.5} ${sy - 2}, ${sx + 1.5} ${sy - 4}, ${sx - 0.5} ${sy - 6}`)
            .attr("fill", "none").attr("stroke", INK)
            .attr("stroke-width", 0.4).attr("stroke-linecap", "round")
            .attr("opacity", 0.4);
        }
      }
      const perSide = 3 + Math.floor(rng() * 2);
      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < perSide; i++) {
          const fx = x + side * size * (0.55 + i * 0.17);
          tg.append("line")
            .attr("x1", fx).attr("y1", y - size * 0.28)
            .attr("x2", fx).attr("y2", y + size * 0.28)
            .attr("stroke", INK).attr("stroke-width", 0.3).attr("opacity", 0.3);
        }
      }
    }

    // --- Draw terrain from hex_terrain data only (not from nodes) ---

    function drawGraveyard(tg, x, y, size, rng) {
      const count = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < count; i++) {
        const gx = x + (rng() - 0.5) * size * 1.1;
        const gy = y + (rng() - 0.5) * size * 0.6;
        const gh = size * (0.3 + rng() * 0.15);
        const gw = gh * 0.55;
        if (rng() > 0.5) {
          tg.append("line")
            .attr("x1", gx).attr("y1", gy - gh * 0.45)
            .attr("x2", gx).attr("y2", gy + gh * 0.45)
            .attr("stroke", INK).attr("stroke-width", 0.7).attr("opacity", 0.7);
          tg.append("line")
            .attr("x1", gx - gw * 0.5).attr("y1", gy - gh * 0.2)
            .attr("x2", gx + gw * 0.5).attr("y2", gy - gh * 0.2)
            .attr("stroke", INK).attr("stroke-width", 0.7).attr("opacity", 0.7);
        } else {
          tg.append("path")
            .attr("d", `M ${gx - gw / 2} ${gy + gh * 0.45} L ${gx - gw / 2} ${gy - gh * 0.15} Q ${gx} ${gy - gh * 0.5} ${gx + gw / 2} ${gy - gh * 0.15} L ${gx + gw / 2} ${gy + gh * 0.45} Z`)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.6).attr("opacity", 0.7);
        }
        // Occasional burial-mound ground line beneath the marker
        if (rng() > 0.65) {
          tg.append("line")
            .attr("x1", gx - gw * 0.7).attr("y1", gy + gh * 0.5)
            .attr("x2", gx + gw * 0.7).attr("y2", gy + gh * 0.5)
            .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.45);
        }
      }
    }

    MapCore.renderHexTerrain(ctx, {
      "forested-hills": (tg, x, y, sz, rng) => drawHill(tg, x, y - 2, sz, rng),
      "hills": drawHill,
      "swamp": drawSwampReeds,
      "plains": drawGrassTuft,
      "graveyard": drawGraveyard,
    });
    // Hills still get hex-by-hex rendering (they read as individual lumps).
    MapCore.renderMountainsWithElevation(ctx, () => {}, drawHill);
    // Mountains: continuous zigzag skyline per region, outline + left-side
    // shadow hatching — matches Christopher Tolkien's Wilderland reference
    // where ranges form connected ridges with shared bases, not rows of
    // separate triangular stamps.
    MapCore.renderMountainsByRegion(ctx,
      (tg, peaks, rng, opts) => drawMountainRidge(tg, peaks, rng, opts),
      {
        clusterInset: 0.10,
        // Side-by-side shows reference peaks pack VERY densely — 30+
        // overlapping curves per range-length. 20-30 still left visible
        // gaps between peaks in wl-34. Bumping to 30-45.
        peakCountMin: 30,
        peakCountRange: 15,
        // Continuous height distribution — varied peaks mixed tightly.
        heightProfile: (rng) => 0.35 + Math.pow(rng(), 0.85) * 0.70,
        // Smaller peak scale so many peaks fit per hex. Reference peaks
        // at map zoom are ~10-14 px tall, not 30-40.
        peakSize: 20,
        peakSizeRange: 5,
        // Stagger peaks vertically — reference peaks fill a thick band
        // with tall ones behind short ones; default 0.5 keeps them too
        // flatly aligned. 1.2 × mSize = ±12px lets peaks stack.
        peakYJitter: 1.2,
      });
    // Dense forest packing to match Mirkwood density in the reference —
    // scattered trees at default density (1.0) read too sparse.
    // Reference Mirkwood is wall-to-wall trees with no visible gaps — push
    // density high and reduce minDist so canopies sit shoulder-to-shoulder
    // the way they do on Tolkien's hand-drawn Wilderland.
    MapCore.renderForestEdgeTrees(ctx, drawTreeCanopy, ["forest", "forested-hills"], { density: 2.4, minDist: 4.2 });
    MapCore.renderFarmlandBiased(ctx, drawFarm);
    // Very soft forest-region outline — traces the outer boundary of the
    // contiguous forest (skips interior hex-to-hex edges) with a wobbly
    // faint line so the forest reads as a unified ZONE the way Tolkien's
    // Mirkwood does, without the hard per-hex outline the user rejected.
    MapCore.renderTerrainEdges(ctx, ["forest", "forested-hills"], {
      color: INK, strokeWidth: 0.9, opacity: 0.55, wobble: 3.8,
      className: "forest-region",
    });
    // Same soft-outline treatment for contiguous mountain regions — reads
    // the range as a unified ridge band rather than loose per-hex peaks.
    MapCore.renderTerrainEdges(ctx, ["mountains"], {
      color: INK, strokeWidth: 0.65, opacity: 0.28, wobble: 2.6,
      className: "mountain-region",
    });
  },

  // --- Node icon rendering ---
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

      // Shared id-based special icons (before the point_type switch)
      if (MapCore.renderSpecialIcon(ng, node, { ink: INK, parchment: PARCHMENT })) {
        // Rendered; skip the rest of this node's logic below.
      }
      // Farm override — outlined farmhouse for any farm-named node
      else if (node.name && node.name.toLowerCase().includes("farm") && node.point_type !== "ruin") {
        // House body (outline only)
        ng.append("rect").attr("x", -s).attr("y", -s*0.5).attr("width", s*2).attr("height", s*1.5)
          .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.8);
        // Roof (triangle, outline only)
        ng.append("path")
          .attr("d", `M ${-s-1} ${-s*0.5} L 0 ${-s*1.5} L ${s+1} ${-s*0.5}`)
          .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.8);
        // Chimney (outline only)
        ng.append("rect").attr("x", s*0.3).attr("y", -s*1.3).attr("width", s*0.4).attr("height", s*0.5)
          .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.8);
        // Door (small line)
        ng.append("line").attr("x1", 0).attr("y1", s*0.1).attr("x2", 0).attr("y2", s*1.0)
          .attr("stroke", INK).attr("stroke-width", 0.5);
        // Small field lines to the right
        for (let fi = 0; fi < 3; fi++) {
          ng.append("line")
            .attr("x1", s + 3 + fi * 3).attr("y1", s*0.5)
            .attr("x2", s + 3 + fi * 3).attr("y2", s*1.0)
            .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.5);
        }
      } else switch (node.point_type) {
        case "heart": {
          // Main town — a walled city filling roughly the middle 50% of its
          // hex. Scattered (not grid-aligned) tower skyline, a single large
          // bridge at the town center where the road crosses the river, a
          // keep with pennant slightly off-center, and four corner towers.
          const hs = 12;
          const rng = mulberry32(seedFromString("city-" + (node.id || "heart")));
          const bY = hs * 0.15;
          // Faint ground halo
          ng.append("ellipse")
            .attr("cx", 0).attr("cy", hs * 0.6)
            .attr("rx", hs * 2.4).attr("ry", hs * 0.5)
            .attr("fill", INK).attr("opacity", 0.06);
          // Walled-town oval — main silhouette the towers rise from
          ng.append("ellipse")
            .attr("cx", 0).attr("cy", 0)
            .attr("rx", hs * 2.1).attr("ry", hs * 1.55)
            .attr("fill", PARCHMENT).attr("fill-opacity", 0.9)
            .attr("stroke", INK).attr("stroke-width", 1.4).attr("opacity", 0.95);
          // Second, faintly-inset wall-walk line — reads as the crenellated
          // parapet on top of the main wall. Gives the perimeter more weight
          // so the town body doesn't dissolve into scattered towers.
          ng.append("ellipse")
            .attr("cx", 0).attr("cy", 0)
            .attr("rx", hs * 2.0).attr("ry", hs * 1.45)
            .attr("fill", "none")
            .attr("stroke", INK).attr("stroke-width", 0.55).attr("opacity", 0.55);
          // Crenellation teeth around the oval rim — short rectangular
          // merlons at regular angular spacing. Concentrated on the upper
          // and side arcs where they read clearly; skipped on the bottom
          // arc where the main gate and halo sit.
          const crenCount = 42;
          for (let k = 0; k < crenCount; k++) {
            const a = (k / crenCount) * Math.PI * 2;
            // Skip the arc around the main gate (bottom)
            if (a > Math.PI * 0.40 && a < Math.PI * 0.60) continue;
            const cxT = Math.cos(a) * hs * 2.05;
            const cyT = Math.sin(a) * hs * 1.50;
            const nx = Math.cos(a), ny = Math.sin(a);
            const mW = hs * 0.10, mH = hs * 0.12;
            // Tooth: small rectangle oriented radially outward from center
            ng.append("rect")
              .attr("x", cxT - mW / 2).attr("y", cyT - mH / 2)
              .attr("width", mW).attr("height", mH)
              .attr("fill", PARCHMENT).attr("stroke", INK).attr("stroke-width", 0.5)
              .attr("transform", `rotate(${(Math.atan2(ny, nx) * 180 / Math.PI) + 90} ${cxT} ${cyT})`);
          }

          // Scatter 22 towers across the oval via rejection sampling. Skip a
          // central corridor where the bridge sits and a column where the
          // keep rises, and enforce a minimum distance between towers so
          // they don't overlap. This gives an organic (not row-aligned)
          // skyline.
          const towers = [];
          const ovRx = hs * 1.85, ovRy = hs * 1.3;
          const minDist = hs * 0.22;
          let attempts = 0;
          while (towers.length < 22 && attempts < 900) {
            attempts++;
            const rx = (rng() - 0.5) * 2 * ovRx;
            const ry = (rng() - 0.5) * 2 * ovRy - hs * 0.1;
            // Inside oval (inset)
            if ((rx * rx) / (ovRx * ovRx) + (ry * ry) / (ovRy * ovRy) > 1) continue;
            // Skip bridge corridor (horizontal strip through the middle)
            if (Math.abs(ry - bY) < hs * 0.45 && Math.abs(rx) < hs * 1.0) continue;
            // Skip keep column
            if (rx > -hs * 0.55 && rx < hs * 0.15 && ry < hs * 0.4) continue;
            // Min-dist to existing towers
            let ok = true;
            for (const t of towers) {
              const dx = t.x - rx, dy = t.y - ry;
              if (dx * dx + dy * dy < minDist * minDist) { ok = false; break; }
            }
            if (ok) towers.push({ x: rx, y: ry });
          }
          // Sort back→front so nearer towers overlap farther ones naturally
          towers.sort((a, b) => a.y - b.y);
          towers.forEach(t => {
            const storyCount = 3 + Math.floor(rng() * 4); // 3-6 stories
            const storyH = hs * 0.2;
            const th = storyCount * storyH;
            const tw = hs * (0.14 + rng() * 0.06);
            const yTop = t.y - th;
            ng.append("rect")
              .attr("x", t.x - tw / 2).attr("y", yTop)
              .attr("width", tw).attr("height", th)
              .attr("fill", PARCHMENT).attr("stroke", INK).attr("stroke-width", 0.55);
            if (rng() > 0.5) {
              const crW = tw + hs * 0.04;
              ng.append("rect")
                .attr("x", t.x - crW / 2).attr("y", yTop - hs * 0.06)
                .attr("width", crW).attr("height", hs * 0.06)
                .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.5);
            } else {
              ng.append("path")
                .attr("d", `M ${t.x - tw / 2 - 0.4} ${yTop} L ${t.x} ${yTop - tw * 0.9} L ${t.x + tw / 2 + 0.4} ${yTop}`)
                .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.55);
            }
            for (let si = 0; si < storyCount; si += 2) {
              ng.append("line")
                .attr("x1", t.x).attr("y1", yTop + (si + 0.5) * storyH - 0.3)
                .attr("x2", t.x).attr("y2", yTop + (si + 0.5) * storyH + 0.3)
                .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.7);
            }
          });

          // Foreground houses — small gabled buildings filling the gaps
          // between towers so the town reads as dense rather than sparse.
          // Placed by rejection-sampling against existing tower positions
          // and the central corridors. Drawn BEFORE the bridge/gate towers
          // so those stay on top.
          const houseMin = hs * 0.16;
          const houses = [];
          let hAttempts = 0;
          while (houses.length < 55 && hAttempts < 1600) {
            hAttempts++;
            const rx = (rng() - 0.5) * 2 * (ovRx - hs * 0.15);
            const ry = (rng() - 0.5) * 2 * (ovRy - hs * 0.15) - hs * 0.1;
            if ((rx * rx) / (ovRx * ovRx) + (ry * ry) / (ovRy * ovRy) > 0.92) continue;
            // Keep clear of the bridge corridor + keep column
            if (Math.abs(ry - bY) < hs * 0.4 && Math.abs(rx) < hs * 1.0) continue;
            if (rx > -hs * 0.55 && rx < hs * 0.15 && ry < hs * 0.4) continue;
            // Respect existing towers
            let ok = true;
            for (const t of towers) {
              const dx = t.x - rx, dy = t.y - ry;
              if (dx * dx + dy * dy < (hs * 0.2) * (hs * 0.2)) { ok = false; break; }
            }
            if (!ok) continue;
            // Respect other houses
            for (const h of houses) {
              const dx = h.x - rx, dy = h.y - ry;
              if (dx * dx + dy * dy < houseMin * houseMin) { ok = false; break; }
            }
            if (!ok) continue;
            houses.push({ x: rx, y: ry, rot: rng() < 0.5 ? 0 : 1 });
          }
          // Draw houses back-to-front
          houses.sort((a, b) => a.y - b.y);
          houses.forEach(h => {
            const hw = hs * (0.16 + rng() * 0.07);
            const hh = hs * (0.12 + rng() * 0.05);
            const roofH = hs * (0.07 + rng() * 0.04);
            const yTop = h.y - hh;
            // Body
            ng.append("rect")
              .attr("x", h.x - hw / 2).attr("y", yTop)
              .attr("width", hw).attr("height", hh)
              .attr("fill", PARCHMENT).attr("stroke", INK).attr("stroke-width", 0.45);
            // Pitched roof (gable, pointing "up" visually)
            ng.append("path")
              .attr("d", `M ${h.x - hw / 2 - 0.5} ${yTop} L ${h.x} ${yTop - roofH} L ${h.x + hw / 2 + 0.5} ${yTop} Z`)
              .attr("fill", INK).attr("opacity", 0.16)
              .attr("stroke", INK).attr("stroke-width", 0.45);
            // Optional chimney on ~1/3 of houses
            if (rng() > 0.66) {
              const chX = h.x + hw * (rng() > 0.5 ? 0.22 : -0.22);
              const chW = hs * 0.03;
              const chH = hs * 0.06;
              ng.append("rect")
                .attr("x", chX - chW / 2).attr("y", yTop - roofH * 0.35 - chH)
                .attr("width", chW).attr("height", chH)
                .attr("fill", PARCHMENT).attr("stroke", INK).attr("stroke-width", 0.4);
            }
          });

          // Two bridge-gate towers — one on each side of the bridge where
          // the road meets the water. These replace the old central keep so
          // there's no single tall tower floating over the river; instead
          // the bridge is protected by a tower at each bridgehead.
          const bridgeSpan0 = hs * 1.55;
          [-1, 1].forEach(side => {
            const tX = side * (bridgeSpan0 / 2 + hs * 0.32);
            const tH = hs * 1.7;
            const tBase = bY + hs * 0.12; // at the river/deck level
            const tTop = tBase - tH;
            const tW = hs * 0.32;
            // Body
            ng.append("rect")
              .attr("x", tX - tW / 2).attr("y", tTop)
              .attr("width", tW).attr("height", tH)
              .attr("fill", PARCHMENT).attr("stroke", INK).attr("stroke-width", 1.0);
            // Crenellation
            ng.append("rect")
              .attr("x", tX - tW / 2 - hs * 0.04).attr("y", tTop - hs * 0.1)
              .attr("width", tW + hs * 0.08).attr("height", hs * 0.1)
              .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.7);
            // Pennant pole + flag, leaning slightly away from the other tower
            ng.append("line")
              .attr("x1", tX).attr("y1", tTop - hs * 0.1)
              .attr("x2", tX).attr("y2", tTop - hs * 0.7)
              .attr("stroke", INK).attr("stroke-width", 0.7);
            ng.append("path")
              .attr("d", `M ${tX} ${tTop - hs * 0.7} L ${tX + side * hs * 0.5} ${tTop - hs * 0.58} L ${tX} ${tTop - hs * 0.46} Z`)
              .attr("fill", INK).attr("opacity", 0.9);
            // Arrow-slit window
            ng.append("line")
              .attr("x1", tX).attr("y1", tTop + tH * 0.4)
              .attr("x2", tX).attr("y2", tTop + tH * 0.55)
              .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.7);
          });

          // Four corner wall-towers — slightly varied heights for asymmetry
          const wallTowers = [
            { x: -hs * 1.95, y: -hs * 0.4, h: hs * 0.95 },
            { x:  hs * 1.95, y: -hs * 0.4, h: hs * 0.9 },
            { x: -hs * 1.95, y:  hs * 0.4, h: hs * 0.85 },
            { x:  hs * 1.95, y:  hs * 0.4, h: hs * 1.0 },
          ];
          wallTowers.forEach(({ x: tx, y: ty, h: th }) => {
            ng.append("rect")
              .attr("x", tx - hs * 0.17).attr("y", ty - th * 0.6)
              .attr("width", hs * 0.34).attr("height", th)
              .attr("fill", PARCHMENT).attr("stroke", INK).attr("stroke-width", 0.8);
            ng.append("rect")
              .attr("x", tx - hs * 0.21).attr("y", ty - th * 0.6 - hs * 0.09)
              .attr("width", hs * 0.42).attr("height", hs * 0.09)
              .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.6);
          });

          // Main gate at the bottom of the wall — arched
          ng.append("path")
            .attr("d", `M ${-hs * 0.3} ${hs * 1.55} L ${-hs * 0.3} ${hs * 0.95} Q 0 ${hs * 0.6} ${hs * 0.3} ${hs * 0.95} L ${hs * 0.3} ${hs * 1.55}`)
            .attr("fill", PARCHMENT).attr("stroke", INK).attr("stroke-width", 0.85);

          // --- Single large central bridge where the road crosses the river ---
          // One bridge only, horizontal, spanning the middle of town. Short
          // stub ramps on each bank visually tie into the town road network.
          const bridgeSpan = hs * 1.55;
          const deckTop = bY;
          const deckBot = bY + hs * 0.11;
          const bridgeG = ng.append("g").attr("class", "bridge");
          // Road deck — two parallel lines defining the road surface
          bridgeG.append("line")
            .attr("x1", -bridgeSpan / 2 - hs * 0.28).attr("y1", deckTop)
            .attr("x2",  bridgeSpan / 2 + hs * 0.28).attr("y2", deckTop)
            .attr("stroke", INK).attr("stroke-width", 1.3);
          bridgeG.append("line")
            .attr("x1", -bridgeSpan / 2).attr("y1", deckBot)
            .attr("x2",  bridgeSpan / 2).attr("y2", deckBot)
            .attr("stroke", INK).attr("stroke-width", 0.8);
          // Two piers supporting the span
          [-bridgeSpan * 0.3, bridgeSpan * 0.3].forEach(px => {
            bridgeG.append("line")
              .attr("x1", px).attr("y1", deckBot).attr("x2", px).attr("y2", deckBot + hs * 0.4)
              .attr("stroke", INK).attr("stroke-width", 0.85);
          });
          // One large semi-circular arch opening beneath the center
          const archW = bridgeSpan * 0.55;
          bridgeG.append("path")
            .attr("d", `M ${-archW / 2} ${deckBot + hs * 0.42} Q 0 ${deckBot - hs * 0.05} ${archW / 2} ${deckBot + hs * 0.42}`)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.7);
          // Short road-deck ramps beyond each bridgehead — connect to town roads
          [{ from: -bridgeSpan / 2 - hs * 0.28, to: -bridgeSpan / 2 - hs * 0.55 },
           { from:  bridgeSpan / 2 + hs * 0.28, to:  bridgeSpan / 2 + hs * 0.55 }].forEach(({ from, to }) => {
            bridgeG.append("line")
              .attr("x1", from).attr("y1", deckTop).attr("x2", to).attr("y2", deckTop + hs * 0.12)
              .attr("stroke", INK).attr("stroke-width", 0.9);
          });
          break;
        }
        case "fortress": {
          // Imposing long-walled keep atop a rocky mesa — directly modeled
          // on David Trampier's "Keep on the Borderlands" cover art.
          // Signature details: three slim towers with tall pointed/conical
          // spires, a long crenellated curtain wall with many square wall-
          // towers along it, arrow-slits on every tower, a detached gate-
          // tower at the far right, and a rocky cliff mesa underneath.
          const hs = 9;
          // Hill mound — a broader, more pronounced shape. Rendered as a
          // rounded hump so the keep appears to PERCH on top rather than
          // sit inside a faint triangle.
          const hillBaseY = hs * 1.9;
          const hillTopY = hs * 0.6;   // keep base sits at this y
          // Hill widened so the flat crest supports the full keep (including
          // the detached right gate-tower at x ≈ +hs*2.15). Flat top now
          // extends to roughly ±hs*2.6, with slopes beyond that down to the
          // hill base at ±hs*4.5.
          const hillW = hs * 4.5;
          const flatEdge = hs * 2.6;  // where the flat crest transitions to slope
          // Solid earth-tone fill for the hill
          ng.append("path")
            .attr("d", `M ${-hillW} ${hillBaseY}
                        Q ${-hillW * 0.75} ${hillBaseY - hs * 0.1} ${-flatEdge} ${hillTopY + hs * 0.25}
                        Q ${-flatEdge * 0.5} ${hillTopY - hs * 0.1} 0 ${hillTopY}
                        Q ${flatEdge * 0.5} ${hillTopY - hs * 0.1} ${flatEdge} ${hillTopY + hs * 0.25}
                        Q ${hillW * 0.75} ${hillBaseY - hs * 0.1} ${hillW} ${hillBaseY} Z`)
            .attr("fill", INK).attr("opacity", 0.1);
          // Hill crest outline — a darker ridge silhouette so the shape reads
          ng.append("path")
            .attr("d", `M ${-hillW} ${hillBaseY}
                        Q ${-hillW * 0.75} ${hillBaseY - hs * 0.1} ${-flatEdge} ${hillTopY + hs * 0.25}
                        Q ${-flatEdge * 0.5} ${hillTopY - hs * 0.1} 0 ${hillTopY}
                        Q ${flatEdge * 0.5} ${hillTopY - hs * 0.1} ${flatEdge} ${hillTopY + hs * 0.25}
                        Q ${hillW * 0.75} ${hillBaseY - hs * 0.1} ${hillW} ${hillBaseY}`)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.8).attr("opacity", 0.6);
          // Slope hatching — short strokes down each flank to reinforce hill
          for (let i = 0; i < 6; i++) {
            const t = 0.15 + i * 0.13;
            const sxL = -hillW * t - hs * 0.15;
            const syL = hillTopY + (hillBaseY - hillTopY) * t + hs * 0.1;
            ng.append("line")
              .attr("x1", sxL).attr("y1", syL).attr("x2", sxL - hs * 0.15).attr("y2", syL + hs * 0.35)
              .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.35);
            const sxR = hillW * t + hs * 0.15;
            ng.append("line")
              .attr("x1", sxR).attr("y1", syL).attr("x2", sxR + hs * 0.15).attr("y2", syL + hs * 0.35)
              .attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.35);
          }
          // Two tiny trees clinging to the hillside — grounds the scale
          [-hillW * 0.75, hillW * 0.75].forEach((tx, i) => {
            const ty = hillBaseY - hs * 0.2;
            ng.append("path")
              .attr("d", `M ${tx - hs * 0.12} ${ty} L ${tx} ${ty - hs * 0.3} L ${tx + hs * 0.12} ${ty} Z`)
              .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.45).attr("opacity", 0.5);
          });
          // --- Keep sits on the hilltop mesa ---
          const baseY = hillTopY;

          // Helper: small arrow-slit on a tower
          const slit = (sx, sy1, sy2) => {
            ng.append("line")
              .attr("x1", sx).attr("y1", sy1).attr("x2", sx).attr("y2", sy2)
              .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.75);
          };
          // Helper: crenellated cap at the top of a square tower (width w centred at x)
          const crenCap = (x, y, w) => {
            const steps = Math.max(3, Math.floor(w / (hs * 0.1)));
            const stepW = w / steps;
            let d = `M ${x - w / 2} ${y}`;
            for (let i = 0; i < steps; i++) {
              const x0 = x - w / 2 + i * stepW;
              const up = (i % 2 === 0) ? y - hs * 0.14 : y;
              d += ` L ${x0} ${up}`;
              d += ` L ${x0 + stepW} ${up}`;
            }
            d += ` L ${x + w / 2} ${y}`;
            ng.append("path").attr("d", d).attr("fill", PARCHMENT).attr("stroke", INK).attr("stroke-width", 0.55);
          };
          // Helper: pointed conical spire on a tower
          const pointedSpire = (x, baseTop, w, spireH) => {
            // Tiny drum/ring at the base of the spire
            ng.append("rect")
              .attr("x", x - w * 0.58).attr("y", baseTop - hs * 0.06)
              .attr("width", w * 1.16).attr("height", hs * 0.09)
              .attr("fill", PARCHMENT).attr("stroke", INK).attr("stroke-width", 0.55);
            // Conical spire
            ng.append("path")
              .attr("d", `M ${x - w * 0.55} ${baseTop - hs * 0.06} L ${x} ${baseTop - spireH} L ${x + w * 0.55} ${baseTop - hs * 0.06} Z`)
              .attr("fill", PARCHMENT).attr("stroke", INK).attr("stroke-width", 0.7);
            // Shadow line down the right side of the spire
            ng.append("path")
              .attr("d", `M ${x} ${baseTop - spireH} L ${x + w * 0.18} ${baseTop - spireH * 0.5}`)
              .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.35).attr("opacity", 0.45);
          };

          // --- The long curtain wall spanning the mesa ---
          const wallLeft = -hs * 1.7, wallRight = hs * 1.7;
          const wallTop = baseY - hs * 0.9;
          // Wall body
          ng.append("rect")
            .attr("x", wallLeft).attr("y", wallTop).attr("width", wallRight - wallLeft).attr("height", hs * 0.9)
            .attr("fill", PARCHMENT).attr("stroke", INK).attr("stroke-width", 1.0);
          // Crenellations along the entire top
          const merlonCount = 11;
          const merlonW = hs * 0.18;
          const merlonGap = ((wallRight - wallLeft) - merlonCount * merlonW) / (merlonCount - 1);
          for (let i = 0; i < merlonCount; i++) {
            const mx = wallLeft + i * (merlonW + merlonGap);
            ng.append("rect").attr("x", mx).attr("y", wallTop - hs * 0.15)
              .attr("width", merlonW).attr("height", hs * 0.15)
              .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.55);
          }

          // --- Square wall-towers along the curtain wall ---
          // Each tower has its own height + crenellated top + arrow slit.
          const wallTowers = [
            { x: -hs * 1.55, h: hs * 1.4, w: hs * 0.34 },   // left end tower
            { x: -hs * 0.8,  h: hs * 1.2, w: hs * 0.30 },   // mid-left
            { x:  hs * 0.15, h: hs * 1.25, w: hs * 0.30 },  // central gate-tower
            { x:  hs * 0.85, h: hs * 1.3, w: hs * 0.32 },   // mid-right
            { x:  hs * 1.55, h: hs * 1.45, w: hs * 0.34 },  // right end tower
          ];
          wallTowers.forEach(({ x, h, w }) => {
            const topY = baseY - h;
            ng.append("rect")
              .attr("x", x - w / 2).attr("y", topY).attr("width", w).attr("height", h)
              .attr("fill", PARCHMENT).attr("stroke", INK).attr("stroke-width", 0.85);
            crenCap(x, topY, w + hs * 0.08);
            // Arrow-slit midway up
            slit(x, topY + h * 0.35, topY + h * 0.55);
          });

          // --- Three slim towers with pointed conical spires (the iconic
          // Trampier detail) — two left, one right of center, varying heights.
          const spires = [
            { x: -hs * 1.15, baseH: hs * 2.1, spireH: hs * 0.95, w: hs * 0.22 },
            { x: -hs * 0.35, baseH: hs * 2.45, spireH: hs * 1.1,  w: hs * 0.22 },
            { x:  hs * 0.45, baseH: hs * 2.1, spireH: hs * 0.95, w: hs * 0.22 },
          ];
          spires.forEach(({ x, baseH, spireH, w }) => {
            const topY = baseY - baseH;
            // Tall slim body
            ng.append("rect")
              .attr("x", x - w / 2).attr("y", topY).attr("width", w).attr("height", baseH)
              .attr("fill", PARCHMENT).attr("stroke", INK).attr("stroke-width", 0.9);
            // Two arrow slits stacked
            slit(x, topY + baseH * 0.22, topY + baseH * 0.37);
            slit(x, topY + baseH * 0.55, topY + baseH * 0.7);
            // Pointed conical spire
            pointedSpire(x, topY, w, spireH);
          });

          // --- Detached rightmost gate-tower on its own spur of rock ---
          // (Matches the right-side square tower standing alone in the reference.)
          const detX = hs * 2.15;
          const detH = hs * 1.55;
          const detW = hs * 0.38;
          const detTop = baseY - detH + hs * 0.15;
          ng.append("rect")
            .attr("x", detX - detW / 2).attr("y", detTop).attr("width", detW).attr("height", detH)
            .attr("fill", PARCHMENT).attr("stroke", INK).attr("stroke-width", 0.9);
          crenCap(detX, detTop, detW + hs * 0.08);
          slit(detX, detTop + detH * 0.3, detTop + detH * 0.5);
          slit(detX, detTop + detH * 0.6, detTop + detH * 0.8);

          // --- Main gate in the curtain wall ---
          ng.append("path")
            .attr("d", `M ${-hs * 0.05} ${baseY} L ${-hs * 0.05} ${baseY - hs * 0.55} Q ${hs * 0.15} ${baseY - hs * 0.82} ${hs * 0.35} ${baseY - hs * 0.55} L ${hs * 0.35} ${baseY}`)
            .attr("fill", INK).attr("opacity", 0.85);
          // Portcullis bars
          [0.05, 0.15, 0.25].forEach(pxf => {
            ng.append("line")
              .attr("x1", hs * pxf).attr("y1", baseY - hs * 0.45)
              .attr("x2", hs * pxf).attr("y2", baseY - hs * 0.05)
              .attr("stroke", PARCHMENT).attr("stroke-width", 0.4).attr("opacity", 0.85);
          });

          // --- Rocky mesa texture ---
          // Vertical strata lines on the cliff face — Trampier-style
          // erosion marks show the mesa is a raised stone plateau.
          const rngF = mulberry32(seedFromString("fortress-" + (node.id || "fortress")));
          for (let si = 0; si < 10; si++) {
            const t = 0.08 + si * 0.095;
            const sx = -hillW + 2 * hillW * t;
            const syTop = hillTopY + hs * 0.35;
            const syBot = hillBaseY - hs * 0.08;
            const midX = sx + (rngF() - 0.5) * hs * 0.15;
            const endX = sx + (rngF() - 0.5) * hs * 0.1;
            ng.append("path")
              .attr("d", `M ${sx} ${syTop} Q ${midX} ${(syTop + syBot) / 2} ${endX} ${syBot}`)
              .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.4).attr("opacity", 0.3);
          }
          // Boulders scattered on the mesa approach
          const hillBoulders = [
            { x: -hillW * 0.82, y: hillBaseY - hs * 0.1, r: hs * 0.18 },
            { x: -hillW * 0.45, y: hillBaseY + hs * 0.05, r: hs * 0.22 },
            { x:  hillW * 0.5,  y: hillBaseY - hs * 0.05, r: hs * 0.2 },
            { x:  hillW * 0.82, y: hillBaseY - hs * 0.12, r: hs * 0.17 },
            { x: -hillW * 0.22, y: hillBaseY + hs * 0.0,  r: hs * 0.14 },
          ];
          hillBoulders.forEach(b => {
            ng.append("ellipse")
              .attr("cx", b.x).attr("cy", b.y).attr("rx", b.r).attr("ry", b.r * 0.7)
              .attr("fill", PARCHMENT).attr("stroke", INK).attr("stroke-width", 0.55).attr("opacity", 0.85);
            ng.append("path")
              .attr("d", `M ${b.x - b.r * 0.5} ${b.y - b.r * 0.3} q ${b.r * 0.5} ${-b.r * 0.25} ${b.r} 0`)
              .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.35).attr("opacity", 0.6);
          });

          // Switchback approach path on the right (matches the party/
          // traveler side in the reference)
          ng.append("path")
            .attr("d", `M ${hillW * 0.75} ${hillBaseY - hs * 0.1} Q ${hs * 1.2} ${hillBaseY - hs * 0.55} ${hs * 0.7} ${hillTopY + hs * 0.2} Q ${hs * 0.5} ${hillTopY + hs * 0.05} ${hs * 0.15} ${baseY}`)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.55)
            .attr("stroke-dasharray", "2 2").attr("opacity", 0.55);

          // --- Pennants ---
          // Tall banner streaming from the tallest central spire
          const flagTop = baseY - spires[1].baseH - spires[1].spireH - hs * 0.35;
          ng.append("line")
            .attr("x1", spires[1].x).attr("y1", baseY - spires[1].baseH - spires[1].spireH)
            .attr("x2", spires[1].x).attr("y2", flagTop)
            .attr("stroke", INK).attr("stroke-width", 0.6);
          ng.append("path")
            .attr("d", `M ${spires[1].x} ${flagTop} L ${spires[1].x + hs * 0.7} ${flagTop + hs * 0.18} L ${spires[1].x} ${flagTop + hs * 0.36} Z`)
            .attr("fill", INK).attr("opacity", 0.9);
          // Small pennants on the two flanking spires
          [spires[0], spires[2]].forEach(s => {
            const topY = baseY - s.baseH - s.spireH;
            ng.append("line")
              .attr("x1", s.x).attr("y1", topY).attr("x2", s.x).attr("y2", topY - hs * 0.35)
              .attr("stroke", INK).attr("stroke-width", 0.5);
            ng.append("path")
              .attr("d", `M ${s.x} ${topY - hs * 0.35} L ${s.x + hs * 0.32} ${topY - hs * 0.26} L ${s.x} ${topY - hs * 0.17} Z`)
              .attr("fill", INK).attr("opacity", 0.85);
          });
          break;
        }
        case "tavern": {
          const hs = isLocal ? 2.5 : 4;
          // Building body
          ng.append("rect").attr("x", -hs*0.7).attr("y", -hs*0.3).attr("width", hs*1.4).attr("height", hs)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.8);
          // Roof
          ng.append("path")
            .attr("d", `M ${-hs*0.8} ${-hs*0.3} L 0 ${-hs*1.1} L ${hs*0.8} ${-hs*0.3}`)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.8);
          // Arched door on the front wall
          ng.append("path")
            .attr("d", `M ${-hs*0.18} ${hs*0.7} L ${-hs*0.18} ${hs*0.25} Q 0 ${hs*0.02} ${hs*0.18} ${hs*0.25} L ${hs*0.18} ${hs*0.7}`)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.6);
          // Hanging sign (small rectangle on a line) — two chains
          ng.append("line").attr("x1", hs*0.7).attr("y1", -hs*0.1).attr("x2", hs*1.2).attr("y2", -hs*0.1)
            .attr("stroke", INK).attr("stroke-width", 0.5);
          // Two short chains dropping to the sign corners
          ng.append("line").attr("x1", hs*1.05).attr("y1", -hs*0.1).attr("x2", hs*1.05).attr("y2", -hs*0.03)
            .attr("stroke", INK).attr("stroke-width", 0.4);
          ng.append("line").attr("x1", hs*1.45).attr("y1", -hs*0.1).attr("x2", hs*1.45).attr("y2", -hs*0.03)
            .attr("stroke", INK).attr("stroke-width", 0.4);
          ng.append("rect").attr("x", hs*1.0).attr("y", -hs*0.03).attr("width", hs*0.5).attr("height", hs*0.38)
            .attr("fill", INK).attr("stroke", "none").attr("opacity", 0.65);
          break;
        }
        case "settlement": {
          // Cluster of 2-3 tiny outlined houses with a smoke plume from one
          const hs = isLocal ? 2.5 : 4;
          const houseCount = isLocal ? 2 : 3;
          const smokeFromIdx = Math.floor(houseCount / 2); // plume from central house
          for (let hi = 0; hi < houseCount; hi++) {
            const hx = (hi - (houseCount-1)/2) * hs * 1.4;
            const hy = (hi % 2) * hs * 0.3;
            ng.append("rect").attr("x", hx - hs*0.6).attr("y", hy - hs*0.3).attr("width", hs*1.2).attr("height", hs*0.9)
              .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.8);
            ng.append("path")
              .attr("d", `M ${hx - hs*0.7} ${hy - hs*0.3} L ${hx} ${hy - hs} L ${hx + hs*0.7} ${hy - hs*0.3}`)
              .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.8);
            // Smoke plume curling up from this roof
            if (hi === smokeFromIdx) {
              const sx = hx + hs * 0.2;
              const sy = hy - hs;
              ng.append("path")
                .attr("d", `M ${sx} ${sy} C ${sx - hs*0.3} ${sy - hs*0.5}, ${sx + hs*0.3} ${sy - hs*0.9}, ${sx - hs*0.1} ${sy - hs*1.4}`)
                .attr("fill", "none").attr("stroke", INK)
                .attr("stroke-width", 0.5).attr("stroke-linecap", "round")
                .attr("opacity", 0.55);
            }
          }
          break;
        }
        case "wilderness":
          // Open circle with a tiny tree inside — consistent wilderness icon
          ng.append("circle").attr("r", s).attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.2);
          ng.append("path")
            .attr("d", `M ${-s * 0.45} ${s * 0.15} L 0 ${-s * 0.5} L ${s * 0.45} ${s * 0.15} Z`)
            .attr("fill", INK);
          ng.append("line")
            .attr("x1", 0).attr("y1", s * 0.15).attr("x2", 0).attr("y2", s * 0.5)
            .attr("stroke", INK).attr("stroke-width", 0.8);
          break;
        case "dungeon": {
          // Cave mouth: arched black opening at ground level
          const dd = s * 1.3;
          ng.append("path")
            .attr("d", `M ${-dd} ${dd * 0.4} L ${-dd} 0 Q ${-dd} ${-dd} 0 ${-dd} Q ${dd} ${-dd} ${dd} 0 L ${dd} ${dd * 0.4} Z`)
            .attr("fill", INK).attr("stroke", "none");
          break;
        }
        case "sanctuary": {
          // Small outlined chapel with arched door + cross rising from the roof peak
          const hs = s * 1.1;
          ng.append("rect").attr("x", -hs * 0.55).attr("y", -hs * 0.2).attr("width", hs * 1.1).attr("height", hs * 0.85)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.8);
          ng.append("path")
            .attr("d", `M ${-hs * 0.65} ${-hs * 0.2} L 0 ${-hs * 0.9} L ${hs * 0.65} ${-hs * 0.2}`)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.8);
          // Arched door on the front wall
          ng.append("path")
            .attr("d", `M ${-hs * 0.18} ${hs * 0.65} L ${-hs * 0.18} ${hs * 0.25} Q 0 ${hs * 0.05} ${hs * 0.18} ${hs * 0.25} L ${hs * 0.18} ${hs * 0.65}`)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.6);
          // Cross above roof
          ng.append("line")
            .attr("x1", 0).attr("y1", -hs * 0.9).attr("x2", 0).attr("y2", -hs * 1.6)
            .attr("stroke", INK).attr("stroke-width", 0.8);
          ng.append("line")
            .attr("x1", -hs * 0.3).attr("y1", -hs * 1.3).attr("x2", hs * 0.3).attr("y2", -hs * 1.3)
            .attr("stroke", INK).attr("stroke-width", 0.8);
          break;
        }
        case "tower":
          ng.append("rect").attr("x", -2).attr("y", -s - 2).attr("width", 4).attr("height", s * 2 + 4)
            .attr("fill", INK).attr("stroke", "none");
          ng.append("rect").attr("x", -3.5).attr("y", -s - 4).attr("width", 7).attr("height", 2)
            .attr("fill", INK);
          // Arched door at base (parchment cutout)
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
          // Broken wall silhouette with crack — consistent with hexcrawl/thirdage
          const rs = s;
          ng.append("path")
            .attr("d", `M ${-rs} ${rs * 0.6} L ${-rs} ${-rs * 0.3} L ${-rs * 0.5} ${-rs * 0.7} L ${-rs * 0.2} ${-rs * 0.1} L ${rs * 0.3} ${-rs * 0.5} L ${rs * 0.7} ${-rs * 0.1} L ${rs} ${rs * 0.6} Z`)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.0);
          ng.append("line").attr("x1", 0).attr("y1", -rs * 0.2).attr("x2", 0).attr("y2", rs * 0.5)
            .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.6);
          break;
        }
        case "waypoint":
          // Standing stone / menhir with a ground line — consistent with hexcrawl
          ng.append("rect").attr("x", -1.5).attr("y", -s).attr("width", 3).attr("height", s * 1.8)
            .attr("fill", INK).attr("stroke", "none");
          ng.append("line").attr("x1", -s * 0.8).attr("y1", s * 0.8).attr("x2", s * 0.8).attr("y2", s * 0.8)
            .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.5);
          break;
        case "lair": {
          // Large fanged cave mouth + scattered bones at the entrance
          const dd = s * 1.3;
          ng.append("path")
            .attr("d", `M ${-dd} ${dd * 0.5} L ${-dd} 0 Q ${-dd} ${-dd} 0 ${-dd} Q ${dd} ${-dd} ${dd} 0 L ${dd} ${dd * 0.5} L ${dd * 0.5} ${dd * 0.1} L ${dd * 0.2} ${dd * 0.5} L ${-dd * 0.2} ${dd * 0.1} L ${-dd * 0.5} ${dd * 0.5} Z`)
            .attr("fill", INK);
          // Three bone-dots below the cave — scattered remains
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

  // --- Labels (ink for settlements, blue for geographic/terrain features) ---
  renderLabels(ctx) {
    const { g, nodes, FONT } = ctx;
    const { INK, INK_LIGHT, BLUE, PARCHMENT } = ctx.colors;

    const labelGroup = g.append("g").attr("class", "labels");

    // Geographic types that get blue labels (rivers, regions, wilderness features)
    const blueTypes = new Set(["wilderness", "waypoint"]);

    nodes.forEach(node => {
      const isLocal = node.scale === "local";
      const isBlue = blueTypes.has(node.point_type) || node.terrain === "swamp";
      const isImportant = node.point_type === "heart" || node.point_type === "fortress";
      const fontSize = isLocal ? 10 : (isImportant ? 15 : (isBlue ? 13 : 12));
      const fontWeight = isImportant ? "bold" : "normal";
      // Important names are roman; blue geographic features are italic, like
      // Tolkien's Wilderland. Locals use light ink italic for contrast.
      const fontStyle = isLocal || isBlue ? "italic" : "normal";
      const letterSpacing = isImportant ? "1.5px" : "normal";
      // Per Wilderland reference, essentially all overland text labels
      // are rendered in blue ink (Esgaroth, River Running, settlements
      // and features alike). Important-name styling stays in INK for
      // emphasis weight, but everything else defaults to BLUE instead
      // of INK.
      const color = isLocal ? INK_LIGHT : (isImportant ? INK : BLUE);
      // Per-type offset — bigger icons need their label further below so
      // the text doesn't collide with the icon body.
      const typeOffset = {
        heart: 30,        // walled town extends to ~y+20
        fortress: 32,     // hill/keep base extends to ~y+18
        tower: 24,        // tower body extends ~14 below center
        lair: 24,         // cave mouth + bones below center
        tavern: 18,
        settlement: 18,
        sanctuary: 22,
        ruin: 22,
        dungeon: 20,
        waypoint: 18,
        wilderness: 16,
      };
      // Shared id-based offset table lives in core.js / SPECIAL_ICONS
      const specialOff = MapCore.specialIconLabelOffset(node);
      const yOffset = isLocal ? 14 : (specialOff || typeOffset[node.point_type] || 18);

      labelGroup.append("text")
        .attr("x", node.x)
        .attr("y", node.y + yOffset)
        .attr("text-anchor", "middle")
        .attr("font-family", FONT)
        .attr("font-size", fontSize + "px")
        .attr("font-weight", fontWeight)
        .attr("font-style", fontStyle)
        .attr("letter-spacing", letterSpacing)
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

  // --- Compass rose (Wilderland style — small 4-arrow compass with
  // "N" marker at top-LEFT, matching the reference where the compass
  // sits just above the "Western Lands" edge label, not top-right) ---
  renderCompass(ctx) {
    const { g, bounds } = ctx;
    const { INK } = ctx.colors;

    const x = bounds.minX - 30;
    const y = bounds.minY - 20;
    const size = 22;

    const cg = g.append("g").attr("transform", `translate(${x}, ${y})`);

    // Outer circle
    cg.append("circle")
      .attr("cx", 0).attr("cy", 0).attr("r", size)
      .attr("fill", "none").attr("stroke", INK)
      .attr("stroke-width", 0.9).attr("opacity", 0.7);
    // Inner circle
    cg.append("circle")
      .attr("cx", 0).attr("cy", 0).attr("r", size * 0.3)
      .attr("fill", "none").attr("stroke", INK)
      .attr("stroke-width", 0.7).attr("opacity", 0.6);

    // Four cardinal pointers: half-filled diamond for each
    const cardinals = [
      { dx: 0, dy: -1, label: "N" },
      { dx: 1, dy: 0, label: "E" },
      { dx: 0, dy: 1, label: "S" },
      { dx: -1, dy: 0, label: "W" },
    ];
    cardinals.forEach(({ dx, dy, label }) => {
      const tipX = dx * size;
      const tipY = dy * size;
      const baseX = dx * size * 0.3;
      const baseY = dy * size * 0.3;
      const perpX = -dy * size * 0.12;
      const perpY = dx * size * 0.12;
      // Filled half of the pointer
      cg.append("path")
        .attr("d", `M ${baseX} ${baseY} L ${tipX} ${tipY} L ${(baseX + tipX) / 2 + perpX} ${(baseY + tipY) / 2 + perpY} Z`)
        .attr("fill", INK).attr("opacity", 0.8);
      // Outline of the other half
      cg.append("path")
        .attr("d", `M ${baseX} ${baseY} L ${tipX} ${tipY} L ${(baseX + tipX) / 2 - perpX} ${(baseY + tipY) / 2 - perpY} Z`)
        .attr("fill", "none")
        .attr("stroke", INK).attr("stroke-width", 0.7).attr("opacity", 0.75);
      // Label just outside the circle
      const labelDist = size + 6;
      cg.append("text")
        .attr("x", dx * labelDist).attr("y", dy * labelDist + (dy === 0 ? 3 : 0))
        .attr("text-anchor", dx === 0 ? "middle" : dx > 0 ? "start" : "end")
        .attr("dominant-baseline", dy === 0 ? "middle" : dy > 0 ? "hanging" : "baseline")
        .attr("font-family", "'Palatino Linotype', serif")
        .attr("font-size", "11px")
        .attr("font-weight", "bold")
        .attr("fill", INK).attr("opacity", 0.85)
        .text(label);
    });

    // Minor tick marks between cardinals
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI / 4) + Math.PI / 8;
      const x1 = Math.cos(a) * size;
      const y1 = Math.sin(a) * size;
      const x2 = Math.cos(a) * (size - 3);
      const y2 = Math.sin(a) * (size - 3);
      cg.append("line")
        .attr("x1", x1).attr("y1", y1)
        .attr("x2", x2).attr("y2", y2)
        .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.6);
    }

    // Center fleur-de-lis marking North
    const size2 = 22;
    const fleurG = cg.append("g").attr("opacity", 0.85);
    fleurG.append("path")
      .attr("d", `M 0 ${-size2 * 0.25} L 0 ${size2 * 0.1}`)
      .attr("stroke", INK).attr("stroke-width", 0.9).attr("fill", "none");
    fleurG.append("path")
      .attr("d", `M 0 ${-size2 * 0.3} C -${size2 * 0.08} ${-size2 * 0.35}, -${size2 * 0.08} ${-size2 * 0.22}, 0 ${-size2 * 0.2} C ${size2 * 0.08} ${-size2 * 0.22}, ${size2 * 0.08} ${-size2 * 0.35}, 0 ${-size2 * 0.3} Z`)
      .attr("fill", INK);
    fleurG.append("path")
      .attr("d", `M 0 ${-size2 * 0.15} C -${size2 * 0.13} ${-size2 * 0.1}, -${size2 * 0.14} ${size2 * 0.02}, -${size2 * 0.05} ${size2 * 0.05}`)
      .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.8);
    fleurG.append("path")
      .attr("d", `M 0 ${-size2 * 0.15} C ${size2 * 0.13} ${-size2 * 0.1}, ${size2 * 0.14} ${size2 * 0.02}, ${size2 * 0.05} ${size2 * 0.05}`)
      .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.8);
    fleurG.append("line")
      .attr("x1", -size2 * 0.1).attr("y1", size2 * 0.05)
      .attr("x2", size2 * 0.1).attr("y2", size2 * 0.05)
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

    // "Miles" label — spaced lowercase italic for atlas feel
    sg.append("text")
      .attr("x", bx + barW / 2).attr("y", by + barH + 24)
      .attr("text-anchor", "middle")
      .attr("font-family", FONT)
      .attr("font-size", "10px")
      .attr("font-style", "italic")
      .attr("letter-spacing", "2px")
      .attr("fill", INK)
      .text("miles");
    // Small end-caps on the bar for a more formal cartographic feel
    sg.append("line")
      .attr("x1", bx).attr("y1", by - 3).attr("x2", bx).attr("y2", by + barH + 3)
      .attr("stroke", INK).attr("stroke-width", 0.6);
    sg.append("line")
      .attr("x1", bx + barW).attr("y1", by - 3).attr("x2", bx + barW).attr("y2", by + barH + 3)
      .attr("stroke", INK).attr("stroke-width", 0.6);
  },

  // --- Title cartouche ---
  // A double-ruled parchment panel in the SE corner, modelled on the
  // "WILDERLAND" box from Christopher Tolkien's end-paper map: two
  // concentric rectangles with inked corner flourishes and the title
  // in small-caps hand-lettering.
  renderCartouche(ctx) {
    const { g, bounds, meta, FONT } = ctx;
    const { INK, INK_LIGHT, PARCHMENT } = ctx.colors;

    // Reference WILDERLAND cartouche visibly dominates the bottom-right
    // corner. Previous 210×78 read as a small caption on a mostly-empty
    // margin. Bump to 360×130 for reference-matching visual weight.
    const boxW = 360;
    const boxH = 130;
    const bx = bounds.maxX - boxW + 20;
    const by = bounds.maxY - boxH + 22;

    // Outer rule — heavy ink
    g.append("rect")
      .attr("x", bx).attr("y", by)
      .attr("width", boxW).attr("height", boxH)
      .attr("fill", PARCHMENT)
      .attr("stroke", INK)
      .attr("stroke-width", 1.8);

    // Middle rule — thin hairline, 4px inset
    g.append("rect")
      .attr("x", bx + 4).attr("y", by + 4)
      .attr("width", boxW - 8).attr("height", boxH - 8)
      .attr("fill", "none")
      .attr("stroke", INK)
      .attr("stroke-width", 0.55);

    // Inner rule — faint, 8px inset, gives the Tolkien triple-rule feel
    g.append("rect")
      .attr("x", bx + 8).attr("y", by + 8)
      .attr("width", boxW - 16).attr("height", boxH - 16)
      .attr("fill", "none")
      .attr("stroke", INK)
      .attr("stroke-width", 0.35)
      .attr("opacity", 0.55);

    // Corner quatrefoils — small ink dots at each inner-corner intersection
    [[bx + 8, by + 8], [bx + boxW - 8, by + 8],
     [bx + 8, by + boxH - 8], [bx + boxW - 8, by + boxH - 8]].forEach(([cx, cy]) => {
      g.append("circle")
        .attr("cx", cx).attr("cy", cy).attr("r", 1.2)
        .attr("fill", INK);
    });

    // Greek-key meander strip along top and bottom of the cartouche,
    // matching the reference's decorated border. A single unit is a
    // squared-spiral shape; repeated horizontally it reads as the
    // classic meander ornament used in the reference Wilderland
    // cartouche border.
    // Meander unit scaled up so the ornament reads at arm's length
    // alongside the larger title text; too-thin ornament on a big box
    // looks vestigial.
    const meanderStripH = 8;
    const meanderUnitW = 12;
    // Top strip sits just inside the middle rule.
    const meanderTopY = by + 5;
    const meanderBotY = by + boxH - 5 - meanderStripH;
    const meanderLeftX = bx + 6;
    const meanderRightX = bx + boxW - 6;
    const meanderSpan = meanderRightX - meanderLeftX;
    const meanderUnits = Math.floor(meanderSpan / meanderUnitW);
    const meanderActualSpan = meanderUnits * meanderUnitW;
    const meanderStartX = meanderLeftX + (meanderSpan - meanderActualSpan) / 2;

    const buildMeanderUnit = (ux, uy, w, h, flipY) => {
      // Draw a simple squared-spiral meander. If flipY is true, mirror
      // vertically so the bottom strip is symmetric with the top.
      const y0 = uy;
      const y1 = uy + h * 0.33;
      const y2 = uy + h * 0.66;
      const y3 = uy + h;
      const x0 = ux, x1 = ux + w * 0.33, x2 = ux + w * 0.66, x3 = ux + w;
      // Top strip: spiral opens downward. Bottom: opens upward.
      if (!flipY) {
        return `M ${x0} ${y3} L ${x0} ${y1} L ${x2} ${y1} L ${x2} ${y2} L ${x1} ${y2} L ${x1} ${y3}`;
      }
      return `M ${x0} ${y0} L ${x0} ${y2} L ${x2} ${y2} L ${x2} ${y1} L ${x1} ${y1} L ${x1} ${y0}`;
    };

    for (let i = 0; i < meanderUnits; i++) {
      const ux = meanderStartX + i * meanderUnitW;
      g.append("path")
        .attr("d", buildMeanderUnit(ux, meanderTopY, meanderUnitW, meanderStripH, false))
        .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.5);
      g.append("path")
        .attr("d", buildMeanderUnit(ux, meanderBotY, meanderUnitW, meanderStripH, true))
        .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.5);
    }

    // Vertical meander strips along left + right edges of the cartouche.
    // We reuse the same unit-builder but rotate each unit 90° via SVG
    // transform so the squared-spiral points inward (toward the title).
    const meanderUnitsV = Math.floor((boxH - 10 - meanderStripH) / meanderUnitW) + 1;
    const meanderVSpan = meanderUnitsV * meanderUnitW;
    const meanderStartY = by + (boxH - meanderVSpan) / 2;
    for (let i = 0; i < meanderUnitsV; i++) {
      const uy = meanderStartY + i * meanderUnitW;
      // Left strip: spiral opens rightward (into the box).
      const leftXStart = bx + 5;
      g.append("path")
        .attr("d", buildMeanderUnit(0, 0, meanderUnitW, meanderStripH, false))
        .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.5)
        .attr("transform", `translate(${leftXStart + meanderStripH}, ${uy}) rotate(90)`);
      // Right strip: spiral opens leftward.
      const rightXStart = bx + boxW - 5;
      g.append("path")
        .attr("d", buildMeanderUnit(0, 0, meanderUnitW, meanderStripH, true))
        .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.5)
        .attr("transform", `translate(${rightXStart - meanderStripH}, ${uy}) rotate(90)`);
    }

    // Decorative flourish above the title — short ink rule with centre pip
    const flourishY = by + 18;
    const flourishL = boxW * 0.45;
    g.append("line")
      .attr("x1", bx + (boxW - flourishL) / 2).attr("y1", flourishY)
      .attr("x2", bx + (boxW + flourishL) / 2).attr("y2", flourishY)
      .attr("stroke", INK).attr("stroke-width", 0.45).attr("opacity", 0.6);
    g.append("circle")
      .attr("cx", bx + boxW / 2).attr("cy", flourishY)
      .attr("r", 1.3).attr("fill", INK);

    // Title text — large small-caps in the style's hand-lettered font
    const titleText = meta.region
      ? meta.region.toUpperCase()
      : (meta.campaign || "").toUpperCase();
    g.append("text")
      .attr("x", bx + boxW / 2)
      .attr("y", by + boxH / 2 + 10)
      .attr("text-anchor", "middle")
      .attr("font-family", FONT)
      .attr("font-size", "32px")
      .attr("font-weight", "600")
      .attr("letter-spacing", "8px")
      .attr("fill", INK)
      .text(titleText);

    // Matching flourish below the title
    const flourishY2 = by + boxH - 14;
    g.append("line")
      .attr("x1", bx + (boxW - flourishL) / 2).attr("y1", flourishY2)
      .attr("x2", bx + (boxW + flourishL) / 2).attr("y2", flourishY2)
      .attr("stroke", INK).attr("stroke-width", 0.45).attr("opacity", 0.6);

    // Subtitle (world / era) — positioned between the title and the
    // bottom meander strip so the meander is never overlapped.
    if (meta.world) {
      g.append("text")
        .attr("x", bx + boxW / 2)
        .attr("y", by + boxH - 24)
        .attr("text-anchor", "middle")
        .attr("font-family", FONT)
        .attr("font-size", "14px")
        .attr("font-style", "italic")
        .attr("fill", INK_LIGHT)
        .text(meta.world + (meta.era ? " \u2014 " + meta.era : ""));
    }
  },

  // --- Edge annotations ---
  renderEdgeAnnotations(ctx) {
    const { g, bounds, meta, offMapArrows } = ctx;
    const { INK_LIGHT } = ctx.colors;
    const font = "'Palatino Linotype', 'Book Antiqua', Palatino, serif";

    const annotGroup = g.append("g").attr("class", "edge-annotations");

    // Left edge — three stacked labels, matching the Wilderland reference's
    // "Western Lands / Edge of the Wild / Hobbiton" triplet. When the
    // campaign provides off_map_arrows (on ctx.offMapArrows) we use them
    // for NW / W / SW directions; otherwise fall back to generic idiom.
    const arrows = offMapArrows || [];
    const byDir = {};
    arrows.forEach(a => { byDir[a.direction] = a.label; });
    const leftLabels = [
      byDir.NW || "Western Lands",
      byDir.W  || "Edge of the Wild",
      byDir.SW || byDir.S || "to Hobbiton and beyond",
    ];
    const leftX = bounds.minX - 20;
    const leftYs = [
      bounds.minY + (bounds.maxY - bounds.minY) * 0.22,
      (bounds.minY + bounds.maxY) / 2,
      bounds.minY + (bounds.maxY - bounds.minY) * 0.78,
    ];
    leftLabels.forEach((label, i) => {
      const ly = leftYs[i];
      annotGroup.append("text")
        .attr("x", leftX)
        .attr("y", ly)
        .attr("text-anchor", "middle")
        .attr("font-family", font)
        .attr("font-size", "10px")
        .attr("font-style", "italic")
        .attr("fill", INK_LIGHT)
        .attr("opacity", 0.85)
        .attr("transform", `rotate(-90, ${leftX}, ${ly})`)
        .text(label);
    });

    // Top edge — campaign's N off-map neighbor, in loose arching style.
    const topX = (bounds.minX + bounds.maxX) / 2;
    const topY = bounds.minY - 15;
    const regionName = meta.region || meta.campaign || "";
    const topLabel = byDir.N || regionName.toUpperCase();
    annotGroup.append("text")
      .attr("x", topX)
      .attr("y", topY)
      .attr("text-anchor", "middle")
      .attr("font-family", font)
      .attr("font-size", "14px")
      .attr("fill", INK_LIGHT)
      .attr("opacity", 0.85)
      .attr("letter-spacing", "4px")
      .text(topLabel);

    // Bottom edge — "to the South..."
    const botX = (bounds.minX + bounds.maxX) / 2;
    const botY = bounds.maxY + 25;
    annotGroup.append("text")
      .attr("x", botX)
      .attr("y", botY)
      .attr("text-anchor", "middle")
      .attr("font-family", font)
      .attr("font-size", "9px")
      .attr("font-style", "italic")
      .attr("fill", INK_LIGHT)
      .attr("opacity", 0.85)
      .text(byDir.S || "to the South\u2026");

    // Right edge — three stacked labels mirroring the left edge:
    // NE / E / SE when present, otherwise generic fallbacks.
    const rightLabels = [
      byDir.NE || "Far Reaches",
      byDir.E  || "Eastern Reaches",
      byDir.SE || "to the far east",
    ];
    const rightX = bounds.maxX + 20;
    const rightYs = [
      bounds.minY + (bounds.maxY - bounds.minY) * 0.22,
      (bounds.minY + bounds.maxY) / 2,
      bounds.minY + (bounds.maxY - bounds.minY) * 0.78,
    ];
    rightLabels.forEach((label, i) => {
      const ry = rightYs[i];
      annotGroup.append("text")
        .attr("x", rightX)
        .attr("y", ry)
        .attr("text-anchor", "middle")
        .attr("font-family", font)
        .attr("font-size", "10px")
        .attr("font-style", "italic")
        .attr("fill", INK_LIGHT)
        .attr("opacity", 0.85)
        .attr("transform", `rotate(90, ${rightX}, ${ry})`)
        .text(label);
    });
  },
};
