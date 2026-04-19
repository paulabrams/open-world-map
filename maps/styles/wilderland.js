// wilderland.js — "Wilderland" hand-drawn map style for Open World Map viewer
// Extracted from wilderland.html. All rendering is self-contained; the host
// page supplies a render context (ctx) with shared utilities.

window.MapStyles = window.MapStyles || {};

window.MapStyles.wilderland = {
  name: "Wilderland",

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
    MapCore.renderRiver(ctx, ctx.colors.BLUE, 4);
    MapCore.renderRiverLabel(ctx, { color: ctx.colors.BLUE, strokeColor: ctx.colors.PARCHMENT });
    MapCore.renderBridges(ctx, { color: ctx.colors.INK, strokeWidth: 1.0, bridgeLen: 14 });
    MapCore.renderRoad(ctx, ctx.colors.INK, 2);
    MapCore.renderCrevasse(ctx, "#2a1f14", 3);
    this.renderLinks(ctx);
    this.renderTerrainSymbols(ctx);
    MapCore.renderRegionLabels(ctx, {
      color: ctx.colors.INK,
      strokeColor: ctx.colors.PARCHMENT,
      fontSize: 22,
      letterSpacing: "6px",
      opacity: 0.6,
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
        .attr("stroke", INK)
        .attr("stroke-linecap", "round");

      switch (link.path_type) {
        case "road":
          path.attr("stroke-width", 1.8).attr("opacity", 0.9);
          break;
        case "trail":
          path.attr("stroke-width", 1.1).attr("stroke-dasharray", "6 4").attr("opacity", 0.8);
          break;
        case "wilderness":
          path.attr("stroke-width", 0.8).attr("stroke-dasharray", "3 5").attr("opacity", 0.65);
          break;
        default:
          path.attr("stroke-width", 1.2);
      }
    });
  },

  // --- Terrain symbol placement ---
  renderTerrainSymbols(ctx) {
    const { g, nodes, links } = ctx;
    const { INK, BLUE } = ctx.colors;
    const mulberry32 = ctx.mulberry32;
    const seedFromString = ctx.seedFromString;

    const terrainGroup = g.append("g").attr("class", "terrain");

    // --- Local terrain symbol helper functions ---

    function drawMountain(tg, x, y, size, rng) {
      // Ridge of 1-2 narrow peaks, sorted tallest-back to shortest-front
      const peakCount = 1 + Math.floor(rng() * 2);
      const spacing = size * 0.6;
      const peaks = [];
      for (let i = 0; i < peakCount; i++) {
        const offsetX = (i - (peakCount - 1) / 2) * spacing + (rng() - 0.5) * size * 0.12;
        const hMul = 0.75 + rng() * 0.45;
        peaks.push({ cx: x + offsetX, h: size * (0.9 + rng() * 0.25) * hMul });
      }
      peaks.sort((a, b) => b.h - a.h);
      peaks.forEach(p => {
        const w = size * (0.6 + rng() * 0.25);
        const skew = (rng() - 0.5) * w * 0.08;
        const peakX = p.cx + skew;
        const peakY = y - p.h;
        // Straight-line slopes with a small mid-slope kink — Tolkien's
        // Wilderland peaks are angular, not smoothly curved.
        const leftKinkX = p.cx - w / 2 + (peakX - (p.cx - w / 2)) * 0.55 + (rng() - 0.5) * 0.8;
        const leftKinkY = y + (peakY - y) * 0.55 + (rng() - 0.5) * 0.8;
        const rightKinkX = peakX + ((p.cx + w / 2) - peakX) * 0.4 + (rng() - 0.5) * 0.8;
        const rightKinkY = peakY + (y - peakY) * 0.4 + (rng() - 0.5) * 0.8;
        tg.append("path")
          .attr("d", `M ${p.cx - w/2} ${y} L ${leftKinkX} ${leftKinkY} L ${peakX} ${peakY} L ${rightKinkX} ${rightKinkY} L ${p.cx + w/2} ${y}`)
          .attr("fill", "none")
          .attr("stroke", INK)
          .attr("stroke-width", 0.9)
          .attr("stroke-linecap", "round")
          .attr("stroke-linejoin", "round");
        // 1-2 short texture dashes on right side
        const dashCount = 1 + Math.floor(rng() * 2);
        for (let i = 0; i < dashCount; i++) {
          const t = 0.3 + i * 0.2 + rng() * 0.1;
          const dx = peakX + (p.cx + w/2 - peakX) * t;
          const dy = peakY + (y - peakY) * t;
          const dashLen = w * 0.12;
          tg.append("line")
            .attr("x1", dx).attr("y1", dy)
            .attr("x2", dx + dashLen).attr("y2", dy)
            .attr("stroke", INK)
            .attr("stroke-width", 0.5)
            .attr("opacity", 0.5);
        }
      });
    }

    function drawTreeCanopy(tg, x, y, size, rng) {
      // Very faint green-tinged wash behind the canopy cluster — forest-floor hint
      tg.append("ellipse")
        .attr("cx", x).attr("cy", y)
        .attr("rx", size * 0.7).attr("ry", size * 0.5)
        .attr("fill", INK).attr("opacity", 0.05);
      // Small cluster of 1-3 canopy blobs — modest overlap, not dense blanket
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
        const steps = 8;
        const points = [];
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const wr = c.cr + (rng() - 0.5) * wobble * 2;
          points.push([c.cx + Math.cos(a) * wr, c.cy + Math.sin(a) * wr]);
        }
        // Parchment fill to mask overlapping blobs, then ink outline.
        // Use the style's actual PARCHMENT so tree interiors blend with the map.
        tg.append("path")
          .attr("d", lineGen(points))
          .attr("fill", ctx.colors.PARCHMENT)
          .attr("stroke", INK)
          .attr("stroke-width", 0.8)
          .attr("opacity", 0.95);
        // Tiny interior mark — crow's-foot / tuft
        if (rng() > 0.4) {
          const markLen = c.cr * 0.25;
          tg.append("line")
            .attr("x1", c.cx - markLen).attr("y1", c.cy)
            .attr("x2", c.cx + markLen).attr("y2", c.cy)
            .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.55);
          tg.append("line")
            .attr("x1", c.cx).attr("y1", c.cy - markLen * 0.6)
            .attr("x2", c.cx).attr("y2", c.cy + markLen * 0.6)
            .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.55);
        }
        // Thin shadow stroke just below the canopy — grounds the tree on the map
        tg.append("line")
          .attr("x1", c.cx - c.cr * 0.55).attr("y1", c.cy + c.cr * 0.92)
          .attr("x2", c.cx + c.cr * 0.55).attr("y2", c.cy + c.cr * 0.92)
          .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.35);
      });
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
          .attr("opacity", 0.5);
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
            .attr("opacity", 0.5);
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
      // Gentle cluster of 1-2 rounded hillocks — Wilderland style
      const count = 1 + Math.floor(rng() * 2);
      const spacing = size * 0.75;
      const humps = [];
      for (let i = 0; i < count; i++) {
        humps.push({
          cx: x + (i - (count - 1) / 2) * spacing + (rng() - 0.5) * size * 0.15,
          w: size * (0.85 + rng() * 0.4),
          h: size * (0.4 + rng() * 0.25),
        });
      }
      humps.sort((a, b) => b.h - a.h);
      humps.forEach(({ cx, w, h }) => {
        const peakOff = (rng() - 0.5) * w * 0.12;
        tg.append("path")
          .attr("d", `M ${cx - w/2} ${y} Q ${cx - w/4 + peakOff} ${y - h} ${cx + peakOff} ${y - h} Q ${cx + w/4 + peakOff} ${y - h} ${cx + w/2} ${y}`)
          .attr("fill", "none")
          .attr("stroke", INK)
          .attr("stroke-width", 0.8)
          .attr("opacity", 0.55);
        // Tolkien's rolling-downs detail: 2-3 short curved strokes along the
        // hill's crown, each suggesting the next ridge behind.
        const crownStrokes = 2 + Math.floor(rng() * 2);
        for (let s = 0; s < crownStrokes; s++) {
          const t = (s + 1) / (crownStrokes + 1);
          const sx0 = cx - w * 0.32 + t * w * 0.15 + (rng() - 0.5) * 1;
          const sy0 = y - h * (0.55 + t * 0.2);
          const sx1 = sx0 + w * 0.22;
          const sy1 = sy0 - 1;
          tg.append("path")
            .attr("d", `M ${sx0} ${sy0} Q ${(sx0 + sx1) / 2} ${sy0 - 1.5} ${sx1} ${sy1}`)
            .attr("fill", "none")
            .attr("stroke", INK)
            .attr("stroke-width", 0.45)
            .attr("opacity", 0.4);
        }
      });
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
    MapCore.renderMountainsWithElevation(ctx, drawMountain, drawHill);
    MapCore.renderForestEdgeTrees(ctx, drawTreeCanopy, ["forest", "forested-hills"]);
    MapCore.renderFarmlandBiased(ctx, drawFarm);
    MapCore.renderTerrainEdges(ctx, ["forest", "forested-hills"], {
      color: INK, strokeWidth: 1.0, opacity: 0.5, wobble: 2.2, className: "forest-edges",
    });
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

      // Farm override — outlined farmhouse for any farm-named node
      if (node.name && node.name.toLowerCase().includes("farm")) {
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
          // Main town — larger building cluster with a slim central tower
          const hs = 4.5;
          const positions = [{x:0, y:0}, {x:-hs*1.3, y:hs*0.2}, {x:hs*1.3, y:hs*0.1}, {x:-hs*0.5, y:-hs*0.8}, {x:hs*0.6, y:-hs*0.7}];
          positions.forEach((p, idx) => {
            ng.append("rect").attr("x", p.x - hs*0.5).attr("y", p.y - hs*0.2).attr("width", hs).attr("height", hs*0.7)
              .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.9);
            ng.append("path")
              .attr("d", `M ${p.x - hs*0.6} ${p.y - hs*0.2} L ${p.x} ${p.y - hs*0.8} L ${p.x + hs*0.6} ${p.y - hs*0.2}`)
              .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.9);
            // Smoke plumes from the two outer flanking houses
            if (idx === 1 || idx === 2) {
              const sx = p.x + hs * 0.18;
              const sy = p.y - hs * 0.8;
              ng.append("path")
                .attr("d", `M ${sx} ${sy} C ${sx - hs * 0.25} ${sy - hs * 0.4}, ${sx + hs * 0.25} ${sy - hs * 0.7}, ${sx - hs * 0.05} ${sy - hs * 1.1}`)
                .attr("fill", "none").attr("stroke", INK)
                .attr("stroke-width", 0.55).attr("stroke-linecap", "round")
                .attr("opacity", 0.5);
            }
          });
          // Central tower rising above the cluster + triangular pennant
          const tX = 0, tTop = -hs * 1.6, tBase = -hs * 0.8;
          ng.append("rect").attr("x", tX - 1).attr("y", tTop).attr("width", 2).attr("height", tBase - tTop)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.9);
          ng.append("line")
            .attr("x1", tX).attr("y1", tTop).attr("x2", tX).attr("y2", tTop - hs * 0.55)
            .attr("stroke", INK).attr("stroke-width", 0.6);
          ng.append("path")
            .attr("d", `M ${tX} ${tTop - hs * 0.55} L ${tX + hs * 0.55} ${tTop - hs * 0.42} L ${tX} ${tTop - hs * 0.29} Z`)
            .attr("fill", INK).attr("opacity", 0.85);
          // Faint walled-town oval — consistent capital marker
          ng.append("ellipse")
            .attr("cx", 0).attr("cy", 0)
            .attr("rx", hs * 2.3).attr("ry", hs * 1.75)
            .attr("fill", "none")
            .attr("stroke", INK)
            .attr("stroke-width", 0.7)
            .attr("opacity", 0.35);
          break;
        }
        case "fortress": {
          const hs = 5;
          // Faint ground halo — suggests built-up area around the castle
          ng.append("ellipse")
            .attr("cx", 0).attr("cy", hs * 0.4)
            .attr("rx", hs * 1.6).attr("ry", hs * 0.45)
            .attr("fill", INK).attr("opacity", 0.06);
          // Main wall
          ng.append("rect").attr("x", -hs).attr("y", -hs*0.4).attr("width", hs*2).attr("height", hs*0.9)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.9);
          // Left tower (taller, narrower)
          ng.append("rect").attr("x", -hs - hs*0.3).attr("y", -hs).attr("width", hs*0.6).attr("height", hs*1.5)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.9);
          // Right tower
          ng.append("rect").attr("x", hs - hs*0.3).attr("y", -hs).attr("width", hs*0.6).attr("height", hs*1.5)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.9);
          // Crenellations on left tower
          for (let ci = 0; ci < 2; ci++) {
            ng.append("rect").attr("x", -hs - hs*0.2 + ci * hs*0.3).attr("y", -hs - hs*0.2).attr("width", hs*0.2).attr("height", hs*0.2)
              .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.6);
          }
          // Crenellations on right tower
          for (let ci = 0; ci < 2; ci++) {
            ng.append("rect").attr("x", hs - hs*0.2 + ci * hs*0.3).attr("y", -hs - hs*0.2).attr("width", hs*0.2).attr("height", hs*0.2)
              .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.6);
          }
          // Gate arch
          ng.append("path")
            .attr("d", `M ${-hs*0.25} ${hs*0.5} L ${-hs*0.25} ${hs*0.1} A ${hs*0.25} ${hs*0.25} 0 0 1 ${hs*0.25} ${hs*0.1} L ${hs*0.25} ${hs*0.5}`)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.7);
          // Flag on the right tower — triangular pennant on a short pole
          const flagX = hs, flagTop = -hs - hs * 0.55;
          ng.append("line")
            .attr("x1", flagX).attr("y1", -hs - hs * 0.2)
            .attr("x2", flagX).attr("y2", flagTop)
            .attr("stroke", INK).attr("stroke-width", 0.6);
          ng.append("path")
            .attr("d", `M ${flagX} ${flagTop} L ${flagX + hs * 0.55} ${flagTop + hs * 0.13} L ${flagX} ${flagTop + hs * 0.26} Z`)
            .attr("fill", INK).attr("opacity", 0.85);
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
      const color = isLocal ? INK_LIGHT : (isBlue ? BLUE : INK);
      const yOffset = isLocal ? 14 : 18;

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

  // --- Compass rose (Wilderland style — subtle decorative arrow in a circle) ---
  renderCompass(ctx) {
    const { g, bounds } = ctx;
    const { INK } = ctx.colors;

    const x = bounds.maxX + 30;
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
  renderCartouche(ctx) {
    const { g, bounds, meta } = ctx;
    const { INK, INK_LIGHT, PARCHMENT } = ctx.colors;

    const boxW = 180;
    const boxH = 50;
    const bx = bounds.maxX - boxW + 20;
    const by = bounds.maxY - boxH + 20;

    // Box background
    g.append("rect")
      .attr("x", bx).attr("y", by)
      .attr("width", boxW).attr("height", boxH)
      .attr("fill", PARCHMENT)
      .attr("stroke", INK)
      .attr("stroke-width", 2.0);

    // Inner border
    g.append("rect")
      .attr("x", bx + 3).attr("y", by + 3)
      .attr("width", boxW - 6).attr("height", boxH - 6)
      .attr("fill", "none")
      .attr("stroke", INK)
      .attr("stroke-width", 0.8);

    // Small corner pointers — classic Tolkien atlas cartouche flourish
    const cps = 7; // corner-pointer size
    const pts = [
      [bx + 3, by + 3, 1, 1],
      [bx + boxW - 3, by + 3, -1, 1],
      [bx + 3, by + boxH - 3, 1, -1],
      [bx + boxW - 3, by + boxH - 3, -1, -1],
    ];
    pts.forEach(([cx, cy, sx, sy]) => {
      g.append("path")
        .attr("d", `M ${cx + cps * sx} ${cy} L ${cx} ${cy} L ${cx} ${cy + cps * sy}`)
        .attr("fill", "none")
        .attr("stroke", INK).attr("stroke-width", 0.7).attr("opacity", 0.7);
    });

    // Title text
    g.append("text")
      .attr("x", bx + boxW / 2)
      .attr("y", by + boxH / 2 - 4)
      .attr("text-anchor", "middle")
      .attr("font-family", "'Palatino Linotype', 'Book Antiqua', Palatino, serif")
      .attr("font-size", "18px")
      .attr("font-weight", "bold")
      .attr("letter-spacing", "4px")
      .attr("fill", INK)
      .text(meta.region ? meta.region.toUpperCase() : meta.campaign.toUpperCase());

    // Subtitle
    if (meta.world) {
      g.append("text")
        .attr("x", bx + boxW / 2)
        .attr("y", by + boxH / 2 + 12)
        .attr("text-anchor", "middle")
        .attr("font-family", "'Palatino Linotype', 'Book Antiqua', Palatino, serif")
        .attr("font-size", "9px")
        .attr("font-style", "italic")
        .attr("fill", INK_LIGHT)
        .text(meta.world + (meta.era ? " \u2014 " + meta.era : ""));
    }
  },

  // --- Edge annotations ---
  renderEdgeAnnotations(ctx) {
    const { g, bounds, meta } = ctx;
    const { INK_LIGHT } = ctx.colors;
    const font = "'Palatino Linotype', 'Book Antiqua', Palatino, serif";

    const annotGroup = g.append("g").attr("class", "edge-annotations");

    // Left edge — "Western Lands" rotated vertically
    const leftX = bounds.minX - 20;
    const leftY = (bounds.minY + bounds.maxY) / 2;
    annotGroup.append("text")
      .attr("x", leftX)
      .attr("y", leftY)
      .attr("text-anchor", "middle")
      .attr("font-family", font)
      .attr("font-size", "10px")
      .attr("font-style", "italic")
      .attr("fill", INK_LIGHT)
      .attr("opacity", 0.5)
      .attr("transform", `rotate(-90, ${leftX}, ${leftY})`)
      .text("Western Lands");

    // Top edge — region name in loose arching style
    const topX = (bounds.minX + bounds.maxX) / 2;
    const topY = bounds.minY - 15;
    const regionName = meta.region || meta.campaign || "";
    annotGroup.append("text")
      .attr("x", topX)
      .attr("y", topY)
      .attr("text-anchor", "middle")
      .attr("font-family", font)
      .attr("font-size", "14px")
      .attr("fill", INK_LIGHT)
      .attr("opacity", 0.5)
      .attr("letter-spacing", "4px")
      .text(regionName.toUpperCase());

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
      .attr("opacity", 0.5)
      .text("to the South\u2026");

    // Right edge — "Eastward" rotated vertically, mirroring the left edge
    const rightX = bounds.maxX + 20;
    const rightY = (bounds.minY + bounds.maxY) / 2;
    annotGroup.append("text")
      .attr("x", rightX)
      .attr("y", rightY)
      .attr("text-anchor", "middle")
      .attr("font-family", font)
      .attr("font-size", "10px")
      .attr("font-style", "italic")
      .attr("fill", INK_LIGHT)
      .attr("opacity", 0.5)
      .attr("transform", `rotate(90, ${rightX}, ${rightY})`)
      .text("Eastern Reaches");
  },
};
