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
    // wl-96: PAPER is the page-background colour (slightly darker
    // parchment, between the old PARCHMENT and PARCHMENT_DARK). All
    // terrain silhouette FILLS (hills, mountain peaks, tree canopies)
    // use PAPER so they blend seamlessly with the page. PARCHMENT is
    // retained for label strokes / legacy callers that need the old
    // lighter cream.
    PAPER:          "#e9ddbd",
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
    // --- Graphics pass (no text) ---
    // Thin double-line ribbon — two parallel fine ink strokes (width 2
    // triggers the default twin-bank branch with bankStroke 0.9 and banks
    // ~2.2 px apart). Matches the Wilderland reference's ribbon rivers.
    MapCore.renderRiver(ctx, ctx.colors.INK, 2);
    MapCore.renderBridges(ctx, { color: ctx.colors.INK, strokeWidth: 1.0, bridgeLen: 14 });
    MapCore.renderBoats(ctx, { color: ctx.colors.INK, parchment: ctx.colors.PARCHMENT, count: 4 });
    // Tolkien's Wilderland renders the Old Forest Road as a DASHED
    // blue line (not a solid stroke). dashedOnly skips the usual
    // solid spine and emits just the dashed pattern.
    MapCore.renderRoad(ctx, ctx.colors.BLUE, 1.8, { dashedOnly: true });
    // Twin-banked gorge: tips meet at points, middle bulges irregularly
    // to read as a crack in the ground instead of a single zig-zag line.
    MapCore.renderCrevasse(ctx, "#2a1f14", 5, { style: "twinbank" });
    this.renderLinks(ctx);
    this.renderTerrainSymbols(ctx);
    this.renderNodes(ctx);

    // --- Text pass (wl-94: all labels rendered AFTER all graphics) ---
    // Region labels, place names, river names, travel times, scale bar,
    // cartouche, and edge annotations all float above the graphics
    // layer so terrain/mountain fills can never occlude them.
    MapCore.renderRegionLabels(ctx, {
      color: ctx.colors.BLUE,
      strokeColor: ctx.colors.PARCHMENT,
      fontSize: 52,
      letterSpacing: "14px",
      opacity: 0.85,
      fontStyle: "normal",
    });
    // River labels in BLUE ink — matches Tolkien's Wilderland reference
    // where "River Running", "Long Lake", etc. are all rendered in blue.
    MapCore.renderRiverLabel(ctx, { color: ctx.colors.BLUE, strokeColor: ctx.colors.PARCHMENT });
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
    const { PAPER, PARCHMENT, PARCHMENT_DARK } = ctx.colors;
    void PARCHMENT; void PARCHMENT_DARK;

    // wl-97: solid PAPER rect, no texture filter or gradient.
    // The prior `parchment-texture` feBlend/multiply with a
    // PARCHMENT-colored noise was darkening the rendered page below
    // raw PAPER so terrain fills (solid PAPER) looked lighter than
    // the page they sat on. Remove the filter so page and fills
    // render at exactly the same #e9ddbd.
    // `parchment-grad` id retained for legacy references but no
    // longer used as the rect fill.
    const grad = defs.append("radialGradient")
      .attr("id", "parchment-grad")
      .attr("cx", "50%").attr("cy", "50%").attr("r", "70%");
    grad.append("stop").attr("offset", "0%").attr("stop-color", PAPER);
    grad.append("stop").attr("offset", "100%").attr("stop-color", PAPER);

    g.append("rect")
      .attr("width", WIDTH * 3)
      .attr("height", HEIGHT * 3)
      .attr("x", -WIDTH)
      .attr("y", -HEIGHT)
      .attr("fill", PAPER);
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
    const { INK, BLUE, PARCHMENT, PAPER } = ctx.colors;
    const mulberry32 = ctx.mulberry32;
    const seedFromString = ctx.seedFromString;

    const terrainGroup = g.append("g").attr("class", "terrain");

    // --- Rough.js integration (prototype) ---
    // Lazy-initialized RoughSVG instance bound to the map's root SVG.
    // Used to render skylines/strokes with hand-drawn character instead of
    // clean D3 paths. Falls back to clean rendering if rough.js isn't loaded.
    const __roughSVG = (typeof rough !== "undefined" && rough.svg)
      ? rough.svg(g.node().ownerSVGElement)
      : null;

    // Append a rough.js-rendered path node to a D3 selection.
    // opts follows rough.js's options shape ({stroke, strokeWidth, roughness, bowing, seed, ...}).
    // If rough.js is unavailable, appends a plain <path> instead.
    function roughPath(tg, d, opts) {
      if (__roughSVG) {
        const node = __roughSVG.path(d, opts);
        tg.node().appendChild(node);
      } else {
        tg.append("path")
          .attr("d", d)
          .attr("fill", opts.fill || "none")
          .attr("stroke", opts.stroke || "none")
          .attr("stroke-width", opts.strokeWidth || 1);
      }
    }

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
          .attr("fill", PAPER).attr("stroke", "none");
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
      // SKYLINE-FIRST MODEL (wl-66) — per user feedback 2026-04-23:
      // prior per-peak rendering had three failures: (1) peaks that
      // overlap don't clip (back peak shows through front), (2) peaks
      // don't inter-connect (reference has continuous shared-base
      // ranges), (3) variability is constrained to one template.
      //
      // New approach: build a SINGLE continuous zigzag polyline across
      // the whole cluster (start-base → apex 1 → valley 1 → apex 2 →
      // valley 2 → ... → end-base), draw as one <path> with wobble.
      // No overlap issues — only one z-layer. Peaks naturally connect
      // via shared valleys. Variability comes from varied apex heights,
      // valley depths, and asymmetric slopes.
      //
      // Then emit DIAGONAL HATCH LINES descending from points along the
      // right-side (descending) slopes of the skyline down to the base.
      // Taller peaks get more lines (proportional shading).
      if (!peaks || peaks.length === 0) return;

      // Sort peaks by x so skyline flows left-to-right.
      const sorted = peaks.slice().sort((a, b) => a.px - b.px);
      const baseY = sorted[0].py;

      // For each peak compute its apex point with per-peak tilt and
      // cache it — we need apex info for both the skyline and the
      // hatch emission. Width/height ratio tuned to reference (peaks
      // look more equilateral than narrow triangles). Per-peak width
      // and apex kind vary so the range has shape variety (reference
      // Grey Mountains has mixed sharp triangles + wider domes).
      const apexes = sorted.map(p => {
        // Peaks are narrow-sharp in the reference (wl-89). Removed the
        // dome variant — twin-sub-apex domes were reading as inverted
        // triangles on smaller peaks.
        const hwMul = 0.35 + rng() * 0.20;
        const hw = p.h * hwMul;
        const tiltSign = rng() < 0.75 ? 1 : -1;
        const tiltMag = 0.03 + rng() * 0.10;
        const apX = p.px + hw * tiltMag * tiltSign;
        const apY = p.py - p.h;
        return { p, hw, apX, apY, apexKind: "sharp" };
      });

      // wl-90: OVERLAPPING INVERTED-V MODEL (user feedback).
      // Each mountain is drawn as its own ∧: left-leg-start → apex →
      // right-leg-end. For peaks after the first, the LEFT LEG STARTS
      // PARTWAY UP THE PREVIOUS PEAK'S RIGHT LEG — not from the
      // baseline. This produces the classic hand-drawn overlap where
      // each peak "emerges" from its neighbour's slope rather than
      // connecting through a shared valley. Store each peak's right-
      // leg line so the next iteration can pick a start-point along it.
      // Store leg geometry so we can also compute where the next
      // peak's left leg emerges from this peak's right leg.
      const drawStroke = (d, widthBump = 0) => {
        roughPath(tg, d, {
          stroke: INK,
          strokeWidth: 1.05 + rng() * 0.25 + widthBump,
          fill: "none",
          roughness: 0.55,
          bowing: 0.35,
          disableMultiStroke: true,
          seed: Math.floor(rng() * 2 ** 31),
        });
      };
      // Small helper to emit a single-∧ stroke with light hand-drawn
      // wobble added between endpoints so each leg doesn't read as
      // pure geometric line.
      const wobbledSegment = (x0, y0, x1, y1, jitter = 0.45) => {
        const pts = [[x0, y0]];
        const SAMPLES = 2;
        for (let k = 1; k < SAMPLES; k++) {
          const t = k / SAMPLES;
          const edge = Math.min(t, 1 - t) * 2;
          pts.push([
            x0 + (x1 - x0) * t + (rng() - 0.5) * jitter * edge,
            y0 + (y1 - y0) * t + (rng() - 0.5) * jitter * edge,
          ]);
        }
        pts.push([x1, y1]);
        return pts;
      };
      // --- wl-91 BACKGROUND PASS ---
      // Between pairs of adjacent main peaks, occasionally emit a
      // BACKGROUND peak: a partial inverted V whose left leg starts
      // partway up the LEFT neighbour's right leg, whose apex sits
      // ABOVE both neighbours' apexes, and whose right leg ends
      // partway up the RIGHT neighbour's left leg. Only the TOP of
      // the ∧ is drawn (never reaches the baseline) so it reads as a
      // peak "peeking out" from behind the main range. Drawn FIRST
      // with a thinner/faded stroke so it visually recedes.
      // wl-94: span TWO peaks apart (peak[i] to peak[i+2]) so the
      // background ∧ has a wide base rooted on different mountains.
      // Prior adjacent-pair anchor produced narrow spike-shaped peaks
      // that looked like "radio antennas" poking up between their
      // immediate neighbours.
      for (let i = 0; i < apexes.length - 2; i++) {
        if (rng() < 0.50) continue;
        const a = apexes[i], b = apexes[i + 2];
        const baseR_a = a.p.px + a.hw;
        const baseL_b = b.p.px - b.hw;
        // Start: on peak A's right leg, somewhere between midpoint
        // and lower third (wider foot).
        const tLeft = 0.50 + rng() * 0.30;
        const sx = a.apX + (baseR_a - a.apX) * tLeft;
        const sy = a.apY + (baseY - a.apY) * tLeft;
        // End: on peak B's LEFT leg at a similar depth.
        const tRight = 0.50 + rng() * 0.30;
        const ex = b.apX + (baseL_b - b.apX) * tRight;
        const ey = b.apY + (baseY - b.apY) * tRight;
        if (ex <= sx + 1) continue; // ill-formed — skip
        // Back-peak apex sits ABOVE both anchor apexes. Moderate
        // lift (3-10px) — wide base means the apex can be taller
        // without looking spiky.
        const higherApY = Math.min(a.apY, b.apY);
        const lift = 3 + rng() * 7;
        const apY_bg = higherApY - lift;
        const apX_bg = (sx + ex) / 2 + (rng() - 0.5) * (ex - sx) * 0.20;
        // Build wobbled ∧.
        const bgL = wobbledSegment(sx, sy, apX_bg, apY_bg, 0.35);
        const bgR = wobbledSegment(apX_bg, apY_bg, ex, ey, 0.35);
        const bgPts = bgL.concat(bgR.slice(1));
        const bgD = "M " + bgPts.map(q => q[0].toFixed(2) + " " + q[1].toFixed(2)).join(" L ");
        roughPath(tg, bgD, {
          stroke: INK,
          strokeWidth: 0.7 + rng() * 0.15,
          fill: "none",
          roughness: 0.5,
          bowing: 0.3,
          disableMultiStroke: true,
          seed: Math.floor(rng() * 2 ** 31),
          opacity: 0.55 + rng() * 0.15,
        });
      }

      // --- MAIN PEAKS (wl-90 overlap + wl-92 right-leg clip) ---
      // Pre-pass: compute leftStart for each peak. Each peak i > 0
      // may start its left leg partway up peak i-1's right leg. We
      // need these positions BEFORE drawing, so that peak i-1's
      // right leg can be truncated at peak i's leftStart (avoiding
      // the X-shaped crossing artifact where both lines extended
      // through each other).
      const leftStarts = new Array(apexes.length);
      for (let i = 0; i < apexes.length; i++) {
        const a = apexes[i];
        const baseL = a.p.px - a.hw;
        if (i === 0) {
          leftStarts[i] = [baseL, baseY];
          continue;
        }
        const prev = apexes[i - 1];
        const prevBaseR = prev.p.px + prev.hw;
        const tOverlap = 0.30 + rng() * 0.35;
        const sx = prev.apX + (prevBaseR - prev.apX) * tOverlap;
        const sy = prev.apY + (baseY - prev.apY) * tOverlap;
        if (sx < a.apX - 1) {
          leftStarts[i] = [sx, sy];
        } else {
          leftStarts[i] = [baseL, baseY];
        }
      }

      // Draw each peak. The right leg ends at peak i+1's leftStart
      // when it lies on peak i's right leg (otherwise baseR).
      //
      // wl-98: each main peak now bakes a SMALLER foothill peak into
      // the left and right legs of its ∧ — the whole silhouette
      // reads as ∧₋∧₋∧ (a central peak flanked by two foothills),
      // drawn as a single continuous stroke. Foothill height is
      // ~30-50% of the main peak's height, placed 25-40% of the way
      // along the leg. The foothill apex pokes ABOVE the straight
      // leg-line; a mini valley between the foothill and the main
      // apex dips slightly BELOW the straight line.
      const mainLegs = [];
      const buildLeg = (start, apex, outward, rand) => {
        // Builds a sub-path from `start` to `apex` with a small
        // foothill ∧ pre-pended (before climbing to the main apex).
        // `outward` is -1 for left leg (foothill sits on left half),
        // +1 for right leg (foothill sits on right half). Returns
        // an array of points [start, foothillApex, miniValley, apex].
        const [sx, sy] = start;
        const [ax, ay] = apex;
        const dx = ax - sx, dy = ay - sy;
        const length = Math.hypot(dx, dy);
        if (length < 6) {
          // Too short for a foothill — return straight segment.
          return [[sx, sy], [ax, ay]];
        }
        const apexHeight = Math.abs(ay - sy);
        const foothillT = 0.28 + rand() * 0.18; // 28-46% along leg
        const valleyT  = foothillT + 0.18 + rand() * 0.10;
        const lineX_at = (t) => sx + dx * t;
        const lineY_at = (t) => sy + dy * t;
        // Foothill apex pokes ABOVE (smaller y) the straight line by
        // a fraction of apex height.
        const fhX = lineX_at(foothillT);
        const fhY = lineY_at(foothillT) - apexHeight * (0.25 + rand() * 0.20);
        // Mini valley dips BELOW (larger y) by a smaller amount.
        const mvX = lineX_at(valleyT);
        const mvY = lineY_at(valleyT) + apexHeight * (0.08 + rand() * 0.08);
        void outward;
        return [[sx, sy], [fhX, fhY], [mvX, mvY], [ax, ay]];
      };

      for (let i = 0; i < apexes.length; i++) {
        const a = apexes[i];
        const baseR = a.p.px + a.hw;
        const baseL = a.p.px - a.hw;
        const leftStart = leftStarts[i];
        let rightEnd;
        if (i + 1 < apexes.length) {
          const nextLS = leftStarts[i + 1];
          if (nextLS[0] > a.apX && nextLS[0] <= baseR) {
            rightEnd = nextLS;
          } else {
            rightEnd = [baseR, baseY];
          }
        } else {
          rightEnd = [baseR, baseY];
        }
        // Foothill legs. Small peaks have a low apex height budget
        // so the foothill bump stays proportional.
        const legLpts = buildLeg(leftStart, [a.apX, a.apY], -1, rng);
        const legRpts = buildLeg([a.apX, a.apY], rightEnd, +1, rng);
        // Concatenate (drop the duplicated apex vertex in legR[0]).
        const peakPts = legLpts.concat(legRpts.slice(1));
        // wl-93: fill with solid PAPER so it occludes content behind.
        const fillPts = peakPts.slice();
        fillPts.push([rightEnd[0], baseY]);
        fillPts.push([leftStart[0], baseY]);
        const fillD = "M " + fillPts.map(q => q[0].toFixed(2) + " " + q[1].toFixed(2)).join(" L ") + " Z";
        tg.append("path")
          .attr("d", fillD)
          .attr("fill", PAPER)
          .attr("stroke", "none");
        const peakD = "M " + peakPts.map(q => q[0].toFixed(2) + " " + q[1].toFixed(2)).join(" L ");
        const hBoost = a.p.h > 18 ? 0.15 : 0;
        drawStroke(peakD, hBoost);
        mainLegs.push({ leftStart, apX: a.apX, apY: a.apY, baseR, baseL, rightEnd });
      }

      // --- wl-93: MAIN-PEAK HATCHING (moved up) ---
      // Run hatching BEFORE the foreground passes so their parchment
      // fills occlude any hatch strokes that would otherwise bleed
      // into the foreground peak bodies.
      for (let i = 0; i < apexes.length; i++) {
        const a = apexes[i];
        const peakT = (typeof a.p.t === "number") ? a.p.t : 0.5;
        const isWest = peakT < 0.45;
        const isEast = peakT > 0.55;
        // wl-98: all peaks hatch more aggressively per user —
        // middle/west peaks used to skip frequently (0.45, 0.20),
        // now drop to (0.10, 0.05). East still always hatches.
        const hatchSkip = isEast ? 0.00 : (isWest ? 0.05 : 0.10);
        if (rng() < hatchSkip) continue;
        const baseR = a.p.px + a.hw;
        const baseL = a.p.px - a.hw;
        const fsDX = baseR - a.apX;
        const fsDY = baseY - a.apY;
        const lsDX = a.apX - baseL;
        const vSpan = fsDY;
        if (vSpan < 1.5) continue;
        const legEndX = (mainLegs[i] && mainLegs[i].rightEnd) ? mainLegs[i].rightEnd[0] : baseR;
        const maxExtendX = legEndX - 0.5;
        // wl-98: tighter spacing across the board so the whole range
        // reads as shaded, not just east faces.
        const rowSpacing = isEast ? (1.1 + rng() * 0.3) : (1.6 + rng() * 0.4);
        const rowCount = Math.max(3, Math.floor(vSpan / rowSpacing));
        const faceSlope = fsDY / fsDX;
        for (let k = 1; k < rowCount; k++) {
          const t = k / rowCount;
          if (t < 0.15) continue;
          const sx = a.apX + fsDX * t + (rng() - 0.5) * 0.2;
          const sy = a.apY + fsDY * t + (rng() - 0.5) * 0.15;
          const targetLen = a.hw * (0.25 + t * 0.70) * (0.85 + rng() * 0.30);
          const maxLen = maxExtendX - sx;
          if (maxLen < 0.8) continue;
          const dx = Math.min(maxLen, targetLen);
          const dy = dx * Math.max(0.08, faceSlope * 0.55);
          const endT = (sx + dx - a.apX) / fsDX;
          const faceYAtEnd = a.apY + fsDY * endT;
          const finalEndY = Math.max(sy + dy, faceYAtEnd + 0.25);
          tg.append("line")
            .attr("x1", sx).attr("y1", sy)
            .attr("x2", sx + dx).attr("y2", finalEndY)
            .attr("stroke", INK)
            .attr("stroke-width", isEast ? (0.60 + rng() * 0.15) : (0.45 + rng() * 0.15))
            .attr("opacity", isEast ? (0.82 + rng() * 0.13) : (0.70 + rng() * 0.15))
            .attr("stroke-linecap", "round");
        }
        // wl-97: east peaks get a SECOND crosshatch family — steeper
        // diagonal strokes at ~0.95× the face slope, running parallel
        // TO the right face but offset. Light comes from the west, so
        // east faces get the densest shadow rendering.
        if (isEast) {
          const rowSpacing2 = 1.4 + rng() * 0.35;
          const rowCount2 = Math.max(3, Math.floor(vSpan / rowSpacing2));
          for (let k = 1; k < rowCount2; k++) {
            const t = k / rowCount2;
            if (t < 0.18) continue;
            const sx = a.apX + fsDX * t + (rng() - 0.5) * 0.25;
            const sy = a.apY + fsDY * t + (rng() - 0.5) * 0.20;
            const targetLen = a.hw * (0.20 + t * 0.55) * (0.80 + rng() * 0.30);
            const maxLen = maxExtendX - sx;
            if (maxLen < 0.8) continue;
            const dx = Math.min(maxLen, targetLen);
            // Steeper descent than the primary family — approaches
            // the face slope so the two families cross at a narrow
            // angle, reading as a darker hatched shadow.
            const dy = dx * Math.max(0.18, faceSlope * 0.92);
            const endT = (sx + dx - a.apX) / fsDX;
            const faceYAtEnd = a.apY + fsDY * endT;
            const finalEndY = Math.max(sy + dy, faceYAtEnd + 0.25);
            tg.append("line")
              .attr("x1", sx).attr("y1", sy)
              .attr("x2", sx + dx).attr("y2", finalEndY)
              .attr("stroke", INK)
              .attr("stroke-width", 0.45 + rng() * 0.15)
              .attr("opacity", 0.70 + rng() * 0.18)
              .attr("stroke-linecap", "round");
          }
        }
        if (isWest && lsDX > 1.5) {
          const rowCountX = Math.max(2, Math.floor(vSpan / (2.6 + rng() * 0.6)));
          const leftFaceSlope = fsDY / lsDX;
          for (let k = 1; k < rowCountX; k++) {
            const t = k / rowCountX;
            if (t < 0.20) continue;
            const sx = a.apX - lsDX * t + (rng() - 0.5) * 0.2;
            const sy = a.apY + fsDY * t + (rng() - 0.5) * 0.15;
            const targetLen = a.hw * (0.35 + t * 0.55) * (0.8 + rng() * 0.3);
            const maxLen = (baseR - 0.5) - sx;
            if (maxLen < 0.8) continue;
            const dx = Math.min(maxLen, targetLen);
            const dy = -dx * Math.max(0.06, leftFaceSlope * 0.35);
            const endY = sy + dy;
            const endXT = Math.max(0, Math.min(1, (sx + dx - a.apX) / fsDX));
            const faceYAtEnd = a.apY + fsDY * endXT;
            const clampedEndY = Math.max(endY, faceYAtEnd + 0.25);
            tg.append("line")
              .attr("x1", sx).attr("y1", sy)
              .attr("x2", sx + dx).attr("y2", clampedEndY)
              .attr("stroke", INK)
              .attr("stroke-width", 0.35 + rng() * 0.15)
              .attr("opacity", 0.55 + rng() * 0.20)
              .attr("stroke-linecap", "round");
          }
        }
      }

      // --- wl-91/wl-92 FOREGROUND PASSES (TWO LAYERS) ---
      // Two foreground layers per cluster. Each progressive layer
      // sits LOWER on the y-axis (base pushed further below the main
      // baseY) and is SMALLER than the layer behind it, creating the
      // illusion that we're stacking closer mountains in front. Each
      // layer fills its body with the parchment gradient so it
      // occludes the range behind it.
      const drawFgPeak = (host, sizeMul, baseShift, strokeBump) => {
        const fgApX = host.apX + (rng() - 0.5) * host.hw * 0.8;
        const fgH = host.p.h * sizeMul;
        const fgBaseY = baseY + baseShift;
        const fgApY = fgBaseY - fgH;
        const fgHw = host.hw * (sizeMul * 0.95 + rng() * 0.15);
        const fgBaseL = fgApX - fgHw;
        const fgBaseR = fgApX + fgHw;
        const legLF = wobbledSegment(fgBaseL, fgBaseY, fgApX, fgApY, 0.55);
        const legRF = wobbledSegment(fgApX, fgApY, fgBaseR, fgBaseY, 0.55);
        const fgPts = legLF.concat(legRF.slice(1));
        // Closed polygon so we can fill the foreground peak interior
        // with the parchment gradient — this occludes the main and
        // back peak lines behind it.
        const fillPts = fgPts.slice();
        fillPts.push([fgBaseL, fgBaseY]);
        const fillD = "M " + fillPts.map(q => q[0].toFixed(2) + " " + q[1].toFixed(2)).join(" L ") + " Z";
        tg.append("path")
          .attr("d", fillD)
          .attr("fill", PAPER)
          .attr("stroke", "none");
        const fgD = "M " + fgPts.map(q => q[0].toFixed(2) + " " + q[1].toFixed(2)).join(" L ");
        roughPath(tg, fgD, {
          stroke: INK,
          strokeWidth: 1.15 + rng() * 0.25 + strokeBump,
          fill: "none",
          roughness: 0.55,
          bowing: 0.35,
          disableMultiStroke: true,
          seed: Math.floor(rng() * 2 ** 31),
        });
        // Right-face hatching.
        const fsDX_f = fgBaseR - fgApX;
        const fsDY_f = fgBaseY - fgApY;
        const rows = Math.max(3, Math.floor(fsDY_f / 2.2));
        for (let k = 1; k < rows; k++) {
          const t = k / rows;
          if (t < 0.18) continue;
          const sx = fgApX + fsDX_f * t + (rng() - 0.5) * 0.2;
          const sy = fgApY + fsDY_f * t + (rng() - 0.5) * 0.15;
          const targetLen = fgHw * (0.30 + t * 0.70) * (0.85 + rng() * 0.25);
          const maxLen = (fgBaseR - 0.5) - sx;
          if (maxLen < 0.8) continue;
          const dx = Math.min(maxLen, targetLen);
          const faceSlope = fsDY_f / fsDX_f;
          const dy = dx * Math.max(0.08, faceSlope * 0.55);
          const endT = (sx + dx - fgApX) / fsDX_f;
          const faceYAtEnd = fgApY + fsDY_f * endT;
          const finalEndY = Math.max(sy + dy, faceYAtEnd + 0.25);
          tg.append("line")
            .attr("x1", sx).attr("y1", sy)
            .attr("x2", sx + dx).attr("y2", finalEndY)
            .attr("stroke", INK)
            .attr("stroke-width", 0.55 + rng() * 0.15)
            .attr("opacity", 0.78 + rng() * 0.12)
            .attr("stroke-linecap", "round");
        }
      };

      // wl-94: foreground peaks are SLIGHTLY SHORTER than the host
      // main peak they sit in front of. Prior layer-1 (1.00-1.35×)
      // was taller than its host, which reads as a larger peak in
      // front of a smaller one — wrong perspective cue. Each layer
      // is now a fraction of the host height, progressively smaller.
      // Layer 1 — 0.82-0.95× host, base +5-11px.
      const fg1Count = Math.floor(rng() * 2) + (apexes.length >= 4 ? 1 : 0);
      for (let f = 0; f < fg1Count; f++) {
        const anchorIdx = Math.floor(apexes.length * (0.25 + rng() * 0.50));
        const host = apexes[Math.max(0, Math.min(apexes.length - 1, anchorIdx))];
        const sizeMul = 0.82 + rng() * 0.13;
        const baseShift = 5 + rng() * 6;
        drawFgPeak(host, sizeMul, baseShift, 0);
      }

      // Layer 2 — 0.60-0.78× host, base +13-22px.
      const fg2Count = Math.max(1, fg1Count);
      for (let f = 0; f < fg2Count; f++) {
        const anchorIdx = Math.floor(apexes.length * (0.20 + rng() * 0.60));
        const host = apexes[Math.max(0, Math.min(apexes.length - 1, anchorIdx))];
        const sizeMul = 0.60 + rng() * 0.18;
        const baseShift = 13 + rng() * 9;
        drawFgPeak(host, sizeMul, baseShift, 0.05);
      }

      // Layer 3 — 0.38-0.56× host, base +24-36px.
      const fg3Count = 1 + Math.floor(rng() * 2);
      for (let f = 0; f < fg3Count; f++) {
        const anchorIdx = Math.floor(apexes.length * (0.15 + rng() * 0.70));
        const host = apexes[Math.max(0, Math.min(apexes.length - 1, anchorIdx))];
        const sizeMul = 0.38 + rng() * 0.18;
        const baseShift = 24 + rng() * 12;
        drawFgPeak(host, sizeMul, baseShift, 0);
      }
      void mainLegs;
    }

    function drawTreeCanopy(tg, x, y, size, rng) {
      // Pick one of several hand-drawn tree variants at random — matches
      // the hand-drawn source's mix of round-leaf trees, fir/pine peaks,
      // thin saplings, and clumpy bushes.
      const variant = rng();
      // wl-96: tree canopies use PAPER (the page background colour)
      // so silhouettes blend with the paper. Legacy name retained.
      const PARCH = ctx.colors.PAPER;

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

      if (variant < 0.92) {
        // --- Classic tree glyph: rounded bumpy canopy + short trunk.
        // Reference Mirkwood trees are simple hand-drawn canopies:
        // a bumpy round silhouette with a short trunk peeking below.
        // No interior marks (those were the "eyes"). No ground shadow.
        // Canopy is a CLOSED parchment-filled bumpy circle so the tree
        // has visible body (the open-curve version from wl-78 read as
        // spiky bat silhouettes).
        const cx = x;
        const cy = y - size * 0.15;
        const r = size * (0.32 + rng() * 0.12);
        // wl-94: trunk drawn FIRST (vertical) so the canopy fill
        // covers its top half. Trunk is strictly vertical — no
        // angled trunks jutting sideways into the sky.
        const trunkX = cx + (rng() - 0.5) * r * 0.15;
        const trunkTop = cy;
        const trunkBottom = cy + r * (1.05 + rng() * 0.35);
        tg.append("line")
          .attr("x1", trunkX).attr("y1", trunkTop)
          .attr("x2", trunkX).attr("y2", trunkBottom)
          .attr("stroke", INK).attr("stroke-width", 0.9)
          .attr("stroke-linecap", "round").attr("opacity", 0.88);
        // Bumpy canopy — continuous small jitter around a circle.
        const samples = 14;
        const canopyPts = [];
        for (let i = 0; i < samples; i++) {
          const a = (i / samples) * Math.PI * 2 - Math.PI / 2;
          const rr = r * (0.94 + rng() * 0.14);
          canopyPts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
        }
        const closedLine = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.7));
        tg.append("path")
          .attr("d", closedLine(canopyPts))
          .attr("fill", PARCH).attr("stroke", INK).attr("stroke-width", 0.85)
          .attr("stroke-linejoin", "round").attr("opacity", 0.95);
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
      else if (variant < 0.88) {
        // --- Fir/pine triangle (stacked canopy, trunk below) ---
        // Reduced to 8% — reference has a few triangular fir shapes but
        // they're the exception, not a rival variant.
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
      else if (variant < 0.94) {
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
        // Interior vein crosshair removed 2026-04-23 per user feedback
        // (round tree + vertical + horizontal line = eye-shaped glyph).
      }
      else if (variant < 0.98) {
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
      // wl-96: Wilderland swamp composed of four elements, matching
      // the hand-drawn reference's Mirkwood-lake style — a horizontal
      // pool outline with wavy water-lines inside, a couple scraggly
      // bare/dead trees, one or two small live trees, reed tufts,
      // and occasional rivulets.

      // --- Central pool ---
      // Horizontal elongated oval with clear ink outline (no fill so
      // the parchment shows through). Water is suggested by wavy
      // horizontal lines INSIDE. Pool sits in the lower half of the
      // hex so trees/reeds above it read as standing on the bank.
      const poolCx = x + (rng() - 0.5) * size * 0.15;
      const poolCy = y + size * (0.15 + rng() * 0.10);
      const poolRX = size * (0.55 + rng() * 0.15);
      const poolRY = size * (0.18 + rng() * 0.06);
      // Outline — thin ink ellipse (slightly wobbled via rough-ish
      // effect by using stroke-dasharray with small jitter? simpler
      // to just use a plain ellipse with slight opacity).
      tg.append("ellipse")
        .attr("cx", poolCx).attr("cy", poolCy)
        .attr("rx", poolRX).attr("ry", poolRY)
        .attr("fill", "none")
        .attr("stroke", INK)
        .attr("stroke-width", 0.85)
        .attr("opacity", 0.85);
      // Interior water ripples — 3-5 horizontal wavy lines, each
      // shorter than the last toward the edges of the oval.
      const ripples = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < ripples; i++) {
        const rowT = (i + 0.5) / ripples;
        const ly = (poolCy - poolRY * 0.7) + rowT * poolRY * 1.4 + (rng() - 0.5) * 0.7;
        // Line length tapers at the top and bottom of the pool.
        const taper = Math.sin(rowT * Math.PI);
        const w = poolRX * (1.15 + rng() * 0.2) * taper * 1.1;
        const lx = poolCx - w / 2 + (rng() - 0.5) * 1.5;
        const amp = poolRY * (0.10 + rng() * 0.08);
        const q1x = lx + w * 0.25, q1y = ly - amp;
        const mx = lx + w * 0.5, my = ly + (rng() - 0.5) * 0.5;
        const q2x = lx + w * 0.75, q2y = ly + amp;
        const ex = lx + w, ey = ly + (rng() - 0.5) * 0.5;
        tg.append("path")
          .attr("d", `M ${lx.toFixed(2)} ${ly.toFixed(2)} Q ${q1x.toFixed(2)} ${q1y.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)} Q ${q2x.toFixed(2)} ${q2y.toFixed(2)} ${ex.toFixed(2)} ${ey.toFixed(2)}`)
          .attr("fill", "none")
          .attr("stroke", INK)
          .attr("stroke-width", 0.55)
          .attr("opacity", 0.75);
      }

      // --- Rivulets / little streams scattered around the hex ---
      // wl-98: streams are more numerous (3-5) and scatter all
      // around the hex — not just emerging from the pool. Some
      // connect to the pool, some wander independently.
      const rivCount = 3 + Math.floor(rng() * 3);
      for (let r = 0; r < rivCount; r++) {
        let sx, sy, ex2, ey2;
        if (r < 2 && rng() < 0.7) {
          // 1-2 of the streams emerge FROM the pool edge.
          const sideSign = rng() < 0.5 ? -1 : 1;
          sx = poolCx + sideSign * poolRX * (0.6 + rng() * 0.25);
          sy = poolCy + (rng() - 0.5) * poolRY * 0.6;
          ex2 = sx + sideSign * size * (0.20 + rng() * 0.30);
          ey2 = sy + (rng() - 0.5) * size * 0.40;
        } else {
          // Independent stream somewhere else in the hex.
          const ang = rng() * Math.PI * 2;
          const rad = size * (0.4 + rng() * 0.4);
          sx = x + Math.cos(ang) * rad;
          sy = y + Math.sin(ang) * rad * 0.7;
          const endAng = ang + (rng() - 0.5) * 0.8;
          const endRad = size * (0.15 + rng() * 0.35);
          ex2 = sx + Math.cos(endAng) * endRad;
          ey2 = sy + Math.sin(endAng) * endRad * 0.7;
        }
        const mx2 = (sx + ex2) / 2 + (rng() - 0.5) * size * 0.12;
        const my2 = (sy + ey2) / 2 + (rng() - 0.5) * size * 0.10;
        const cp1x = sx + (mx2 - sx) * 0.5 + (rng() - 0.5) * 2;
        const cp1y = sy + (my2 - sy) * 0.5 + (rng() - 0.5) * 2;
        const cp2x = ex2 + (mx2 - ex2) * 0.5 + (rng() - 0.5) * 2;
        const cp2y = ey2 + (my2 - ey2) * 0.5 + (rng() - 0.5) * 2;
        tg.append("path")
          .attr("d", `M ${sx.toFixed(2)} ${sy.toFixed(2)} Q ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${mx2.toFixed(2)} ${my2.toFixed(2)} Q ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${ex2.toFixed(2)} ${ey2.toFixed(2)}`)
          .attr("fill", "none")
          .attr("stroke", INK)
          .attr("stroke-width", 0.55)
          .attr("opacity", 0.65);
      }

      // --- Scraggly dead trees — bare trunk with jagged branches ---
      // wl-98: more dead trees (2-4) scattered across the whole hex.
      const closedLine = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.7));
      const deadCount = 2 + Math.floor(rng() * 3);
      for (let d = 0; d < deadCount; d++) {
        const dx = x + (rng() - 0.5) * size * 1.5;
        const dy = y + (rng() - 0.5) * size * 0.9 - size * 0.1;
        const th = size * (0.45 + rng() * 0.20);
        // Trunk
        tg.append("line")
          .attr("x1", dx).attr("y1", dy)
          .attr("x2", dx + (rng() - 0.5) * 0.6).attr("y2", dy - th)
          .attr("stroke", INK).attr("stroke-width", 0.9)
          .attr("stroke-linecap", "round").attr("opacity", 0.9);
        // 3-5 jagged branches at varying heights, each a short line
        // angling up-and-out from the trunk.
        const branchCount = 3 + Math.floor(rng() * 3);
        for (let b = 0; b < branchCount; b++) {
          const bt = 0.2 + (b / branchCount) * 0.75;
          const bx = dx + (rng() - 0.5) * 0.5;
          const by = dy - th * bt;
          const bSide = rng() < 0.5 ? -1 : 1;
          const bLen = size * (0.08 + rng() * 0.12);
          const bAngle = (Math.PI / 2) + bSide * (0.35 + rng() * 0.35); // upward-outward
          const bEndX = bx + Math.cos(bAngle) * bLen * -bSide;
          const bEndY = by - Math.sin(bAngle) * bLen;
          tg.append("line")
            .attr("x1", bx).attr("y1", by)
            .attr("x2", bEndX).attr("y2", bEndY)
            .attr("stroke", INK).attr("stroke-width", 0.65)
            .attr("stroke-linecap", "round").attr("opacity", 0.85);
          // Occasional tiny twig on the branch tip
          if (rng() < 0.4) {
            const tAngle = bAngle + (rng() - 0.5) * 0.6;
            const tLen = bLen * (0.3 + rng() * 0.25);
            tg.append("line")
              .attr("x1", bEndX).attr("y1", bEndY)
              .attr("x2", bEndX + Math.cos(tAngle) * tLen * -bSide)
              .attr("y2", bEndY - Math.sin(tAngle) * tLen)
              .attr("stroke", INK).attr("stroke-width", 0.5)
              .attr("stroke-linecap", "round").attr("opacity", 0.75);
          }
        }
      }

      // --- A live tree or two — small bumpy canopy on a vertical trunk ---
      // wl-98: 1-2 live trees scattered around the hex.
      const liveCount = 1 + Math.floor(rng() * 2);
      for (let l = 0; l < liveCount; l++) {
        const lx = x + (rng() - 0.5) * size * 1.5;
        const ly = y + (rng() - 0.5) * size * 0.9 - size * 0.05;
        const lr = size * (0.13 + rng() * 0.06);
        // Trunk first, strictly vertical.
        tg.append("line")
          .attr("x1", lx).attr("y1", ly)
          .attr("x2", lx).attr("y2", ly + lr * 1.2)
          .attr("stroke", INK).attr("stroke-width", 0.9)
          .attr("stroke-linecap", "round").attr("opacity", 0.9);
        // Bumpy canopy on top.
        const samples = 10;
        const pts = [];
        for (let s = 0; s < samples; s++) {
          const a = (s / samples) * Math.PI * 2 - Math.PI / 2;
          const rr = lr * (0.92 + rng() * 0.16);
          pts.push([lx + Math.cos(a) * rr, ly + Math.sin(a) * rr]);
        }
        tg.append("path")
          .attr("d", closedLine(pts))
          .attr("fill", PAPER).attr("stroke", INK).attr("stroke-width", 0.85)
          .attr("stroke-linejoin", "round").attr("opacity", 0.95);
      }

      // --- Reed tufts & grass clumps ---
      // wl-98: more tufts (5-9) scattered throughout the whole hex,
      // not just near the pool banks, so white-space between the
      // pool/trees/reeds is filled with ground-cover texture. Small
      // "grass clump" variant (just a few short stalks, no cattail)
      // mixed in with the full reed tufts.
      const tufts = 5 + Math.floor(rng() * 5);
      for (let t = 0; t < tufts; t++) {
        // Scatter across the whole hex, avoiding the pool interior.
        let tx, tyBase;
        let tries = 0;
        do {
          tx = x + (rng() - 0.5) * size * 1.6;
          tyBase = y + (rng() - 0.5) * size * 1.1;
          tries++;
          // Reject if inside pool ellipse
          const ndx = (tx - poolCx) / (poolRX + 1);
          const ndy = (tyBase - poolCy) / (poolRY + 1);
          if (ndx * ndx + ndy * ndy > 1) break;
        } while (tries < 6);
        const isGrass = rng() < 0.45; // 45% grass clumps, 55% reeds
        const stalks = isGrass ? (2 + Math.floor(rng() * 2)) : (2 + Math.floor(rng() * 3));
        const stalkHeight = isGrass ? size * (0.08 + rng() * 0.06) : size * (0.20 + rng() * 0.12);
        for (let i = 0; i < stalks; i++) {
          const rx = tx + (i - (stalks - 1) / 2) * 1.2 + (rng() - 0.5) * 0.5;
          const topLean = (rng() - 0.5) * (isGrass ? 0.8 : 1.2);
          const topY = tyBase - stalkHeight;
          tg.append("line")
            .attr("x1", rx).attr("y1", tyBase)
            .attr("x2", rx + topLean).attr("y2", topY)
            .attr("stroke", INK).attr("stroke-width", 0.5 + rng() * 0.15).attr("opacity", 0.7);
          if (!isGrass && rng() > 0.5) {
            tg.append("ellipse")
              .attr("cx", rx + topLean).attr("cy", topY - 1.2)
              .attr("rx", 0.7).attr("ry", 1.3)
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
      // wl-96: each hump now draws a PAPER-filled closed polygon
      // UNDER the outline so hills occlude the grid overlay and
      // match the page background exactly.
      const variant = rng();
      if (variant < 0.55) {
        const count = 1 + Math.floor(rng() * 2);
        const spacing = size * 0.65;
        for (let i = 0; i < count; i++) {
          const cx = x + (i - (count - 1) / 2) * spacing + (rng() - 0.5) * size * 0.1;
          const w = size * (0.75 + rng() * 0.25);
          const h = size * (0.35 + rng() * 0.2);
          const fillD = `M ${cx - w / 2} ${y} Q ${cx} ${y - h * 1.2} ${cx + w / 2} ${y} L ${cx - w / 2} ${y} Z`;
          tg.append("path").attr("d", fillD).attr("fill", PAPER).attr("stroke", "none");
          tg.append("path")
            .attr("d", `M ${cx - w / 2} ${y} Q ${cx} ${y - h * 1.2} ${cx + w / 2} ${y}`)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.85)
            .attr("stroke-linecap", "round").attr("opacity", 0.7);
        }
      } else if (variant < 0.85) {
        const w = size * (0.95 + rng() * 0.25);
        const h = size * (0.35 + rng() * 0.18);
        const mid = x + (rng() - 0.5) * size * 0.08;
        const midY = y - h * 0.4;
        const outlineD = `M ${x - w / 2} ${y} Q ${x - w / 4} ${y - h * 1.2} ${mid} ${midY} Q ${x + w / 4} ${y - h * 1.3} ${x + w / 2} ${y}`;
        tg.append("path").attr("d", outlineD + ` L ${x - w / 2} ${y} Z`).attr("fill", PAPER).attr("stroke", "none");
        tg.append("path").attr("d", outlineD)
          .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.85)
          .attr("stroke-linecap", "round").attr("opacity", 0.7);
      } else {
        const w = size * (0.7 + rng() * 0.2);
        const h = size * (0.4 + rng() * 0.15);
        const cx = x + (rng() - 0.5) * size * 0.08;
        const outlineD = `M ${cx - w / 2} ${y} Q ${cx} ${y - h * 1.2} ${cx + w / 2} ${y}`;
        tg.append("path").attr("d", outlineD + ` L ${cx - w / 2} ${y} Z`).attr("fill", PAPER).attr("stroke", "none");
        tg.append("path").attr("d", outlineD)
          .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.85)
          .attr("stroke-linecap", "round").attr("opacity", 0.7);
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
        // wl-98: negative inset (peaks extend 10% past the hex edges)
        // so adjacent mountain clusters OVERLAP — no gap at hex
        // seams, the ranges flow together as one band.
        clusterInset: -0.10,
        peakCountMin: 6,
        peakCountRange: 3,
        // wl-89: each cluster is a MINI-RANGE, not a random bag.
        // Reference mountains start low at one end, rise gradually
        // through a few peaks, then drop back down. Use a sin-pi
        // envelope so height gates toward zero at the cluster ends
        // and rises to full height near the middle. Hero peak gets
        // the envelope's top boost. Adds per-peak jitter inside the
        // envelope so the profile still reads as hand-drawn.
        heightProfile: (rng, isHero, t) => {
          const envelope = Math.pow(Math.sin(t * Math.PI), 0.85);
          const jitter = 0.85 + rng() * 0.30;
          const base = 0.12 + envelope * 0.85 * jitter;
          return isHero ? base + envelope * 0.25 : base;
        },
        peakSize: 24,
        peakSizeRange: 8,
        peakYJitter: 0.25,
        peakTJitter: 0.6,
      });
    // Dense forest packing to match Mirkwood density in the reference —
    // scattered trees at default density (1.0) read too sparse.
    // Reference Mirkwood is wall-to-wall trees with no visible gaps — push
    // density high and reduce minDist so canopies sit shoulder-to-shoulder
    // the way they do on Tolkien's hand-drawn Wilderland.
    // Density: reference Mirkwood trees pack tightly like scales.
    // wl-76's low density (1.4) was set when the old eye-like glyph
    // couldn't take overlap. The wl-81 canopy+trunk glyph can; bump
    // toward reference packing while staying short of the chaos
    // level that triggered the original "looks like eyes" feedback.
    // wl-96: sparse dark-patch crosshatch inside forest hexes,
    // drawn BEFORE trees so canopies occlude the crosshatch where
    // they overlap. Patches represent "deeper darker parts of the
    // forest" — only a few per hex, kept away from hex edges, and
    // no full-hex coverage.
    this.renderForestDarkPatches(ctx);
    MapCore.renderForestEdgeTrees(ctx, drawTreeCanopy, ["forest", "forested-hills"], { density: 2.2, minDist: 6.5, bleedOut: 1.18, treeSizeMul: 1.6 });
    MapCore.renderFarmlandBiased(ctx, drawFarm);
    // Forest-region tree-line — an ORGANIC boundary that drifts
    // inward and outward from the hex perimeter, with scallops on
    // top. Per user feedback 2026-04-23: the line should run in and
    // out, NOT trace the hex shape. Each hex vertex along the
    // perimeter is displaced by a random offset (inward or outward
    // along the vertex's outward-from-hex-center direction) so the
    // line no longer touches hex corners. Scallops are still emitted
    // along each now-displaced segment.
    this.renderForestTreeLine(ctx);
    // wl-93: removed the mountain-region hex outline. The hex grid
    // overlay alone already shows hex boundaries uniformly — mountain
    // hexes shouldn't get an extra stronger outline.
  },

  // --- wl-96: Dark-patch crosshatch inside forest hexes ---
  // Small crosshatched blobs scattered inside some forest hexes,
  // drawn BEFORE the tree scatter so canopies cover parts of them.
  // Patches represent "deeper darker parts of the forest" visible
  // between trees in the hand-drawn reference.
  renderForestDarkPatches(ctx) {
    const { g, hexTerrain, HINT_SCALE, WIDTH, HEIGHT, mulberry32, seedFromString } = ctx;
    const { INK } = ctx.colors;
    if (!hexTerrain) return;

    const bcCol = 10, bcRow = 10;
    const size = HINT_SCALE / 2;
    const colStep = size * 2 * 0.75;
    const rowStep = size * Math.sqrt(3);
    const matchSet = new Set(["forest", "forested-hills"]);

    const forestHexes = [];
    Object.entries(hexTerrain).forEach(([h, t]) => {
      if (matchSet.has(t)) forestHexes.push(h);
    });
    if (forestHexes.length === 0) return;

    const group = g.append("g").attr("class", "terrain forest-dark-patches");

    forestHexes.forEach(hex => {
      const col = parseInt(hex.substring(0, 2));
      const row = parseInt(hex.substring(2, 4));
      const isShifted = (col % 2) !== (bcCol % 2);
      const hx = (col - bcCol) * colStep + WIDTH / 2;
      const hy = (row - bcRow) * rowStep + (isShifted ? rowStep / 2 : 0) + HEIGHT / 2;
      const rng = mulberry32(seedFromString("forest-dark-" + hex));
      // wl-98: ~70% of forest hexes get dark patches (was ~45%),
      // up to 3 patches each (was 2) — user wanted ~50% more.
      if (rng() > 0.70) return;
      const patchCount = 1 + Math.floor(rng() * 3);
      for (let p = 0; p < patchCount; p++) {
        // Patch centre kept WELL inside the hex so crosshatch
        // lines can't cross into neighbours. Offset up to 40% of
        // hex size from the centre.
        const angle = rng() * Math.PI * 2;
        const dist = rng() * size * 0.40;
        const pcx = hx + Math.cos(angle) * dist;
        const pcy = hy + Math.sin(angle) * dist;
        // Patch shape: small ellipse, axis-aligned with mild
        // rotation. Radii kept ≤ 0.28*size so the outer edge of
        // the patch stays >0.25*size from the hex edge.
        const rxP = size * (0.18 + rng() * 0.10);
        const ryP = size * (0.13 + rng() * 0.08);
        const rot = (rng() - 0.5) * 0.4; // radians
        // Draw crosshatch inside the ellipse — two diagonal
        // families clipped to the ellipse. Approach: emit
        // parallel lines over the ellipse's bounding box, then
        // clip each segment against the ellipse analytically.
        const spacing = 2.2;
        const diag = [Math.PI * 0.25, -Math.PI * 0.25];
        // Rotation from axis-aligned ellipse to the tilted one.
        const cosR = Math.cos(rot), sinR = Math.sin(rot);
        // For each family, sweep along the perpendicular direction.
        diag.forEach(theta => {
          const dirX = Math.cos(theta), dirY = Math.sin(theta);
          const perpX = -dirY, perpY = dirX;
          // Extent along perp direction: diagonal of bounding box.
          const maxExt = Math.max(rxP, ryP) * 1.2;
          const nLines = Math.ceil((maxExt * 2) / spacing);
          for (let k = 0; k <= nLines; k++) {
            const t = -maxExt + k * spacing;
            // Clip line {pcx+perpX*t + dirX*s, pcy+perpY*t + dirY*s}
            // against ellipse centred at (pcx,pcy), radii rxP, ryP,
            // rotated by rot. Work in the ellipse's local frame.
            // Point P(s) in local frame:
            //   Px = cosR*(perpX*t + dirX*s) + sinR*(perpY*t + dirY*s)
            //   Py = -sinR*(perpX*t + dirX*s) + cosR*(perpY*t + dirY*s)
            // and (Px/rxP)^2 + (Py/ryP)^2 = 1 on the boundary.
            const A0 = cosR * perpX + sinR * perpY;
            const A1 = cosR * dirX + sinR * dirY;
            const B0 = -sinR * perpX + cosR * perpY;
            const B1 = -sinR * dirX + cosR * dirY;
            const Px0 = A0 * t, Py0 = B0 * t;
            // Quadratic: ((Px0+A1*s)/rxP)^2 + ((Py0+B1*s)/ryP)^2 = 1
            const a = (A1 * A1) / (rxP * rxP) + (B1 * B1) / (ryP * ryP);
            const b = 2 * ((Px0 * A1) / (rxP * rxP) + (Py0 * B1) / (ryP * ryP));
            const c = (Px0 * Px0) / (rxP * rxP) + (Py0 * Py0) / (ryP * ryP) - 1;
            const disc = b * b - 4 * a * c;
            if (disc <= 0) continue;
            const sqrtD = Math.sqrt(disc);
            const s1 = (-b - sqrtD) / (2 * a);
            const s2 = (-b + sqrtD) / (2 * a);
            const x1 = pcx + perpX * t + dirX * s1;
            const y1 = pcy + perpY * t + dirY * s1;
            const x2 = pcx + perpX * t + dirX * s2;
            const y2 = pcy + perpY * t + dirY * s2;
            const len = Math.hypot(x2 - x1, y2 - y1);
            if (len < 1.0) continue;
            group.append("line")
              .attr("x1", x1.toFixed(2)).attr("y1", y1.toFixed(2))
              .attr("x2", x2.toFixed(2)).attr("y2", y2.toFixed(2))
              .attr("stroke", INK)
              .attr("stroke-width", 0.40 + rng() * 0.15)
              .attr("opacity", 0.32 + rng() * 0.15)
              .attr("stroke-linecap", "round");
          }
        });
      }
    });
  },

  // --- Organic forest tree-line ---
  // Builds the forest perimeter from external hex edges, walks each
  // closed loop to form a polygon, then renders it as a single smooth
  // path with per-vertex inward/outward drift plus outward-bulging
  // scallops. Result: a hand-drawn tree-line that meanders in and
  // out of the hex boundary instead of tracing it.
  renderForestTreeLine(ctx) {
    const { g, hexTerrain, HINT_SCALE, WIDTH, HEIGHT, mulberry32, seedFromString } = ctx;
    const { INK } = ctx.colors;
    if (!hexTerrain) return;

    const bcCol = 10, bcRow = 10;
    const size = HINT_SCALE / 2;
    const colStep = size * 2 * 0.75;
    const rowStep = size * Math.sqrt(3);

    const matchSet = new Set(["forest", "forested-hills"]);
    const forestHexes = new Set();
    Object.entries(hexTerrain).forEach(([h, t]) => {
      if (matchSet.has(t)) forestHexes.add(h);
    });
    if (forestHexes.size === 0) return;

    const vOff = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * 60) * Math.PI / 180;
      vOff.push([size * Math.cos(a), size * Math.sin(a)]);
    }
    const edgeVerts = [[5, 4], [0, 5], [1, 0], [2, 1], [3, 2], [4, 3]];
    const neighborsA = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1]];
    const neighborsB = [[0, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];

    // Collect all external edges as directed segments (p1 → p2) in
    // CCW direction around each hex. When neighboring edges on the
    // same or adjacent hex meet at a shared vertex, they form a
    // continuous boundary walk.
    const edges = [];
    forestHexes.forEach(hex => {
      const col = parseInt(hex.substring(0, 2));
      const row = parseInt(hex.substring(2, 4));
      const isShifted = (col % 2) !== (bcCol % 2);
      const hx = (col - bcCol) * colStep + WIDTH / 2;
      const hy = (row - bcRow) * rowStep + (isShifted ? rowStep / 2 : 0) + HEIGHT / 2;
      const neighbors = isShifted ? neighborsB : neighborsA;
      for (let i = 0; i < 6; i++) {
        const [dc, dr] = neighbors[i];
        const nKey = String(col + dc).padStart(2, "0") + String(row + dr).padStart(2, "0");
        if (forestHexes.has(nKey)) continue;
        const [vi1, vi2] = edgeVerts[i];
        edges.push({
          p1: [hx + vOff[vi1][0], hy + vOff[vi1][1]],
          p2: [hx + vOff[vi2][0], hy + vOff[vi2][1]],
          v1: vi1, v2: vi2, hexCx: hx, hexCy: hy,
        });
      }
    });

    // Walk edges to form closed polygons. Each edge's p2 matches
    // another edge's p1 (continuous perimeter).
    const keyOf = p => p[0].toFixed(2) + "," + p[1].toFixed(2);
    const byStart = new Map();
    edges.forEach((e, idx) => {
      const k = keyOf(e.p1);
      if (!byStart.has(k)) byStart.set(k, []);
      byStart.get(k).push(idx);
    });
    const visited = new Set();
    const polygons = [];
    edges.forEach((startEdge, startIdx) => {
      if (visited.has(startIdx)) return;
      const poly = [];
      let currentIdx = startIdx;
      let safety = 20000;
      while (safety-- > 0) {
        if (visited.has(currentIdx)) break;
        visited.add(currentIdx);
        const e = edges[currentIdx];
        poly.push(e);
        const nextKey = keyOf(e.p2);
        const next = (byStart.get(nextKey) || []).find(i => !visited.has(i));
        if (next === undefined) break;
        currentIdx = next;
      }
      if (poly.length >= 3) polygons.push(poly);
    });

    const rng = mulberry32(seedFromString("forest-tree-line"));
    const treeLineGroup = g.append("g").attr("class", "forest-tree-line");

    // For each polygon, build a smooth path with per-vertex drift
    // and outward scallop bumps along each segment.
    polygons.forEach((poly, polyIdx) => {
      // Deterministic per-vertex INWARD displacement. Each vertex
      // is pulled toward the hex center by a seeded random fraction
      // of hex size, so the tree-line sits INSIDE the forest hex and
      // doesn't cross into non-forest neighbors. Same seed per-key
      // so a vertex shared between two hexes receives the same
      // displacement — polygon stays connected.
      const vertexDrift = {};
      const getDrift = (pt, hexCx, hexCy) => {
        const k = keyOf(pt);
        if (vertexDrift[k] !== undefined) return vertexDrift[k];
        const vx = pt[0] - hexCx, vy = pt[1] - hexCy;
        const vLen = Math.sqrt(vx*vx + vy*vy) || 1;
        const vrng = mulberry32(seedFromString("v" + k));
        // ALWAYS inward (negative outward-direction). Magnitude
        // wl-95: pull the canopy row another 5% toward the hex
        // centre (45-85% of size) — user feedback: feather clumps
        // were still bleeding into neighbouring non-forest hexes.
        const mag = size * (0.45 + vrng() * 0.40);
        const d = { dx: -(vx / vLen) * mag, dy: -(vy / vLen) * mag };
        vertexDrift[k] = d;
        return d;
      };

      // Build the inset polygon path with scallops on each segment.
      // Also collect the bump centers so we can draw a tree canopy
      // glyph at each bump — visually the tree-line IS a row of
      // trees along the perimeter.
      let pathD = "";
      const bumps = [];
      for (let i = 0; i < poly.length; i++) {
        const edge = poly[i];
        const d1 = getDrift(edge.p1, edge.hexCx, edge.hexCy);
        const d2 = getDrift(edge.p2, edge.hexCx, edge.hexCy);
        const ax = edge.p1[0] + d1.dx, ay = edge.p1[1] + d1.dy;
        const bx = edge.p2[0] + d2.dx, by = edge.p2[1] + d2.dy;
        if (i === 0) pathD += `M ${ax.toFixed(2)} ${ay.toFixed(2)}`;
        const dx = bx - ax, dy = by - ay;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len, uy = dy / len;
        const mid = [(ax + bx) / 2, (ay + by) / 2];
        const toMid = [mid[0] - edge.hexCx, mid[1] - edge.hexCy];
        const toMidLen = Math.sqrt(toMid[0] ** 2 + toMid[1] ** 2) || 1;
        const onx = toMid[0] / toMidLen;
        const ony = toMid[1] / toMidLen;
        const inset1 = Math.sqrt(d1.dx ** 2 + d1.dy ** 2);
        const inset2 = Math.sqrt(d2.dx ** 2 + d2.dy ** 2);
        const maxBulge = Math.max(2.0, Math.min(inset1, inset2) * 0.85);
        const scallopSize = 4.5;
        const bumpCount = Math.max(1, Math.round(len / (scallopSize * 1.9)));
        for (let b = 0; b < bumpCount; b++) {
          const t2 = (b + 1) / bumpCount;
          const t1 = b / bumpCount;
          const mx = ax + dx * (t1 + t2) / 2;
          const my = ay + dy * (t1 + t2) / 2;
          // Per-bump bulge varies wildly — some bumps are nearly flat,
          // others protrude nearly to the hex edge. Breaks the regular
          // rhythm that made the line read as hex-shaped.
          const bulgeRoll = rng();
          const bulge = bulgeRoll < 0.25
            ? Math.min(maxBulge, scallopSize * (0.1 + rng() * 0.3))   // flat lobe
            : Math.min(maxBulge, scallopSize * (0.9 + rng() * 1.1));  // deep bump
          const lateral = scallopSize * 0.6 * (rng() - 0.5);
          const cpx = mx + onx * bulge + ux * lateral;
          const cpy = my + ony * bulge + uy * lateral;
          const ex = ax + dx * t2, ey = ay + dy * t2;
          pathD += ` Q ${cpx.toFixed(2)} ${cpy.toFixed(2)} ${ex.toFixed(2)} ${ey.toFixed(2)}`;
          // Record bump peak so we can drop a tree canopy there, with
          // the *local outward* direction and inset-budget so feather
          // clumps can extend outward without crossing the hex edge.
          bumps.push({
            cx: cpx, cy: cpy, onx, ony,
            size: scallopSize,
            outwardBudget: Math.max(0.5, (Math.min(inset1, inset2) + maxBulge) - bulge),
            inwardBudget: Math.min(inset1, inset2) + maxBulge * 0.5,
          });
        }
      }
      pathD += " Z";
      // Scallop path — drawn first so tree canopies sit on top.
      treeLineGroup.append("path")
        .attr("d", pathD)
        .attr("fill", "none")
        .attr("stroke", INK)
        .attr("stroke-width", 1.0)
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round")
        .attr("opacity", 0.88);
      // Per user feedback 2026-04-24: tree line needs more variability
      // and feathered clumps. Emit (1) a canopy at each bump with
      // varied size, (2) 0-3 "feather" canopies scattered around each
      // bump — inward and outward, offset laterally — so the outline
      // reads as irregular tree-clumps rather than a regular wavy
      // scalloped hex boundary.
      const closedLine = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.7));
      const drawCanopy = (cx, cy, r, onx, ony) => {
        // wl-94: trunk drawn FIRST and strictly VERTICAL (pointing
        // straight down). Canopy drawn AFTER so its fill covers the
        // upper portion of the trunk. Previously the trunk emerged
        // along (-onx, -ony), which for south-facing forest edges
        // sent it UPWARD into the sky — read as "radio antennas."
        const trunkX = cx + (rng() - 0.5) * 0.5;
        const trunkTop = cy;                           // covered by canopy
        const trunkBottom = cy + r * (1.05 + rng() * 0.35);
        treeLineGroup.append("line")
          .attr("x1", trunkX).attr("y1", trunkTop)
          .attr("x2", trunkX).attr("y2", trunkBottom)
          .attr("stroke", INK).attr("stroke-width", 0.8)
          .attr("stroke-linecap", "round").attr("opacity", 0.88);
        const samples = 12;
        const canopyPts = [];
        for (let s = 0; s < samples; s++) {
          const a = (s / samples) * Math.PI * 2 - Math.PI / 2;
          const rr = r * (0.90 + rng() * 0.18);
          canopyPts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
        }
        treeLineGroup.append("path")
          .attr("d", closedLine(canopyPts))
          .attr("fill", ctx.colors.PAPER).attr("stroke", INK).attr("stroke-width", 0.8)
          .attr("stroke-linejoin", "round").attr("opacity", 0.95);
        void onx; void ony; // retained for signature compatibility
      };
      // wl-93: collect every canopy (primary + feathered) first,
      // then emit in y-ascending order. Later appends land on top,
      // so lower-on-screen canopies visually occlude those behind
      // and above them — proper painter's-algorithm depth stacking.
      const canopyEmits = [];
      bumps.forEach(b => {
        const rMain = b.size * (0.8 + rng() * 0.9);
        canopyEmits.push({ cx: b.cx, cy: b.cy, r: rMain, onx: b.onx, ony: b.ony });
        // wl-94: more feathered clumps per bump (2-5 vs 1-3).
        // wl-95: tighten outward reach and bias inward so clumps
        // don't bleed into neighbouring non-forest hexes.
        const featherCount = 2 + Math.floor(rng() * 4);
        const tx = -b.ony, ty = b.onx; // along-edge tangent
        for (let f = 0; f < featherCount; f++) {
          // 70% inward / 30% outward (was 55/45) so most clumps
          // land safely inside the hex.
          const dir = rng() < 0.70 ? -1 : 1;
          // Outward clumps limited to ~55% of the budget (was 85%)
          // and capped by canopy radius so they can't run to the
          // hex edge even when the budget is large.
          const maxRad = dir < 0 ? b.inwardBudget * 0.9 : b.outwardBudget * 0.55;
          const rad = (0.3 + rng() * 1.0) * Math.min(maxRad, b.size * 1.6) * dir;
          const lat = (rng() - 0.5) * b.size * 2.2;
          const fx = b.cx + b.onx * rad + tx * lat;
          const fy = b.cy + b.ony * rad + ty * lat;
          const fr = b.size * (0.50 + rng() * 0.55);
          canopyEmits.push({ cx: fx, cy: fy, r: fr, onx: b.onx, ony: b.ony });
        }
      });
      canopyEmits.sort((a, b) => a.cy - b.cy);
      canopyEmits.forEach(c => drawCanopy(c.cx, c.cy, c.r, c.onx, c.ony));
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
    const { INK, INK_LIGHT, BLUE, PARCHMENT } = ctx.colors;

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
        .attr("fill", "none").attr("stroke", BLUE).attr("stroke-width", 0.6).attr("opacity", 0.85);
      g.append("path")
        .attr("d", buildMeanderUnit(ux, meanderBotY, meanderUnitW, meanderStripH, true))
        .attr("fill", "none").attr("stroke", BLUE).attr("stroke-width", 0.6).attr("opacity", 0.85);
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
        .attr("fill", "none").attr("stroke", BLUE).attr("stroke-width", 0.6).attr("opacity", 0.85)
        .attr("transform", `translate(${leftXStart + meanderStripH}, ${uy}) rotate(90)`);
      // Right strip: spiral opens leftward.
      const rightXStart = bx + boxW - 5;
      g.append("path")
        .attr("d", buildMeanderUnit(0, 0, meanderUnitW, meanderStripH, true))
        .attr("fill", "none").attr("stroke", BLUE).attr("stroke-width", 0.6).attr("opacity", 0.85)
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

    // Title text — large small-caps in the style's hand-lettered font.
    // Reference WILDERLAND cartouche title is BLUE, matching the
    // region-label palette convention (blue ink for place names).
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
      .attr("fill", BLUE)
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

    // Left edge — up to three stacked labels from campaign data
    // (NW / W / SW directions in off_map_arrows). If a direction isn't
    // in the data, SKIP the slot — do NOT invent a label (no
    // hallucinated map content, per standing directive 2026-04-23).
    const arrows = offMapArrows || [];
    const byDir = {};
    arrows.forEach(a => { byDir[a.direction] = a.label; });
    const leftEntries = [
      { dir: "NW", frac: 0.22 },
      { dir: "W",  frac: 0.50 },
      { dir: "SW", frac: 0.78 },
    ];
    const leftX = bounds.minX - 20;
    leftEntries.forEach(({ dir, frac }) => {
      const label = byDir[dir];
      if (!label) return; // no data for this direction → skip
      const ly = bounds.minY + (bounds.maxY - bounds.minY) * frac;
      annotGroup.append("text")
        .attr("x", leftX)
        .attr("y", ly)
        .attr("text-anchor", "middle")
        .attr("font-family", font)
        .attr("font-size", "14px")
        .attr("font-style", "italic")
        .attr("fill", ctx.colors.BLUE)
        .attr("opacity", 0.88)
        .attr("transform", `rotate(-90, ${leftX}, ${ly})`)
        .text(label);
    });

    // Top edge — reference shows a large blue spaced-caps "GREY MOUNTAINS"
    // banner stretching across much of the top. Mine was 14px at 4px
    // letter-spacing and barely visible. Bump font to 28px, letter-spacing
    // to 10px, color to BLUE matching the reference's pale-blue label ink.
    const topX = (bounds.minX + bounds.maxX) / 2;
    const topY = bounds.minY - 18;
    const regionName = meta.region || meta.campaign || "";
    const topLabel = byDir.N || regionName.toUpperCase();
    annotGroup.append("text")
      .attr("x", topX)
      .attr("y", topY)
      .attr("text-anchor", "middle")
      .attr("font-family", font)
      .attr("font-size", "28px")
      .attr("font-weight", "500")
      .attr("fill", ctx.colors.BLUE)
      .attr("opacity", 0.85)
      .attr("letter-spacing", "10px")
      .text(topLabel);

    // Bottom edge — S label, if in data; otherwise omit.
    if (byDir.S) {
    const botX = (bounds.minX + bounds.maxX) / 2;
    const botY = bounds.maxY + 25;
    annotGroup.append("text")
      .attr("x", botX)
      .attr("y", botY)
      .attr("text-anchor", "middle")
      .attr("font-family", font)
      .attr("font-size", "14px")
      .attr("font-style", "italic")
      .attr("fill", ctx.colors.BLUE)
      .attr("opacity", 0.88)
      .text(byDir.S);
    }

    // Right edge — NE / E / SE labels when present in data. Skip any
    // direction the campaign data does not provide.
    const rightEntries = [
      { dir: "NE", frac: 0.22 },
      { dir: "E",  frac: 0.50 },
      { dir: "SE", frac: 0.78 },
    ];
    const rightX = bounds.maxX + 20;
    rightEntries.forEach(({ dir, frac }) => {
      const label = byDir[dir];
      if (!label) return;
      const ry = bounds.minY + (bounds.maxY - bounds.minY) * frac;
      annotGroup.append("text")
        .attr("x", rightX)
        .attr("y", ry)
        .attr("text-anchor", "middle")
        .attr("font-family", font)
        .attr("font-size", "14px")
        .attr("font-style", "italic")
        .attr("fill", ctx.colors.BLUE)
        .attr("opacity", 0.88)
        .attr("transform", `rotate(90, ${rightX}, ${ry})`)
        .text(label);
    });
  },
};
