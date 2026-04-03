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
    this.renderLinks(ctx);
    this.renderTerrainSymbols(ctx);
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
      .attr("stroke-width", 1.2);

    // Inner ruled line
    g.append("rect")
      .attr("x", x + 4).attr("y", y + 4)
      .attr("width", w - 8).attr("height", h - 8)
      .attr("fill", "none")
      .attr("stroke", INK)
      .attr("stroke-width", 0.6);

    // Corner decorative marks — small cross/tick at each corner
    const cm = 8; // corner mark length
    const corners = [
      [x, y], [x + w, y], [x, y + h], [x + w, y + h]
    ];
    corners.forEach(([cx, cy]) => {
      // Small diagonal cross marks at each corner
      g.append("line")
        .attr("x1", cx - cm).attr("y1", cy - cm)
        .attr("x2", cx + cm).attr("y2", cy + cm)
        .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.6);
      g.append("line")
        .attr("x1", cx + cm).attr("y1", cy - cm)
        .attr("x2", cx - cm).attr("y2", cy + cm)
        .attr("stroke", INK).attr("stroke-width", 0.5).attr("opacity", 0.6);
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
          path.attr("stroke-width", 2.0);
          break;
        case "trail":
          path.attr("stroke-width", 1.2).attr("stroke-dasharray", "6 4");
          break;
        case "wilderness":
          path.attr("stroke-width", 0.8).attr("stroke-dasharray", "3 5");
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
      const w = size * (0.5 + rng() * 0.3);  // Narrower than before
      const h = size * (1.8 + rng() * 0.8);  // Taller, more peaked
      const skew = (rng() - 0.5) * w * 0.08;

      // Slight wobble on the peak
      const peakX = x + skew;
      const peakY = y - h;
      const wobble = w * 0.03;

      // Left slope — slight curve for hand-drawn feel
      tg.append("path")
        .attr("d", `M ${x - w/2} ${y} Q ${x - w/4 + (rng()-0.5)*wobble} ${y - h*0.5} ${peakX} ${peakY}`)
        .attr("fill", "none")
        .attr("stroke", INK)
        .attr("stroke-width", 0.9)
        .attr("stroke-linecap", "round");

      // Right slope
      tg.append("path")
        .attr("d", `M ${peakX} ${peakY} Q ${x + w/4 + (rng()-0.5)*wobble} ${y - h*0.5} ${x + w/2} ${y}`)
        .attr("fill", "none")
        .attr("stroke", INK)
        .attr("stroke-width", 0.9)
        .attr("stroke-linecap", "round");

      // 2-3 very short texture dashes on the right side
      const dashCount = 1 + Math.floor(rng() * 2);
      for (let i = 0; i < dashCount; i++) {
        const t = 0.3 + i * 0.2 + rng() * 0.1;
        const dx = peakX + (x + w/2 - peakX) * t;
        const dy = peakY + (y - peakY) * t;
        const dashLen = w * 0.12;
        tg.append("line")
          .attr("x1", dx).attr("y1", dy)
          .attr("x2", dx + dashLen).attr("y2", dy)
          .attr("stroke", INK)
          .attr("stroke-width", 0.5)
          .attr("opacity", 0.5);
      }
    }

    function drawTreeCanopy(tg, x, y, size, rng) {
      // Round canopy blob — top-down view, like in the Wilderland map
      const r = size * (0.45 + rng() * 0.25);
      // Slightly irregular circle using a few control points
      const wobble = r * 0.15;
      const points = [];
      const steps = 8;
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const wr = r + (rng() - 0.5) * wobble * 2;
        points.push([x + Math.cos(a) * wr, y + Math.sin(a) * wr]);
      }
      const line = d3.line().curve(d3.curveBasisClosed);

      // Outlined canopy circle — distinct open circles like the Wilderland reference
      tg.append("path")
        .attr("d", line(points))
        .attr("fill", "none")
        .attr("stroke", INK)
        .attr("stroke-width", 0.8)
        .attr("opacity", 0.8);

      // Tiny center dot for texture
      tg.append("circle")
        .attr("cx", x).attr("cy", y)
        .attr("r", 1)
        .attr("fill", INK)
        .attr("opacity", 0.6);
    }

    function drawSwampReeds(tg, x, y, size, rng) {
      // Wavy blue water lines
      for (let i = 0; i < 3; i++) {
        const ly = y + i * size * 0.3;
        const lx = x - size * 0.5;
        const d = `M ${lx} ${ly} Q ${lx + size * 0.25} ${ly - size * 0.12} ${lx + size * 0.5} ${ly} Q ${lx + size * 0.75} ${ly + size * 0.12} ${lx + size} ${ly}`;
        tg.append("path")
          .attr("d", d)
          .attr("fill", "none")
          .attr("stroke", BLUE)
          .attr("stroke-width", 0.8)
          .attr("opacity", 0.6);
      }
      // Reed stalks in ink
      for (let i = 0; i < 3; i++) {
        const rx = x - size * 0.3 + rng() * size * 0.6;
        const ry = y - size * 0.2;
        tg.append("line")
          .attr("x1", rx).attr("y1", ry)
          .attr("x2", rx + (rng() - 0.5) * 2).attr("y2", ry - size * 0.6)
          .attr("stroke", INK)
          .attr("stroke-width", 0.7);
        // Small oval bulrush top
        tg.append("ellipse")
          .attr("cx", rx + (rng() - 0.5) * 1).attr("cy", ry - size * 0.6 - 2)
          .attr("rx", 1.2).attr("ry", 2)
          .attr("fill", INK)
          .attr("opacity", 0.8);
      }
    }

    function drawGrassTuft(tg, x, y, size, rng) {
      // Looser, more organic grass strokes
      const blades = 4 + Math.floor(rng() * 2);
      for (let i = 0; i < blades; i++) {
        const angle = -Math.PI / 2 + (i - blades/2) * 0.35 + (rng() - 0.5) * 0.3;
        const len = size * (0.3 + rng() * 0.35);
        const tx = x + Math.cos(angle) * len;
        const ty = y + Math.sin(angle) * len;
        const cx = x + Math.cos(angle) * len * 0.5 + (rng() - 0.5) * 4;
        const cy = y + Math.sin(angle) * len * 0.5;
        tg.append("path")
          .attr("d", `M ${x} ${y} Q ${cx} ${cy} ${tx} ${ty}`)
          .attr("fill", "none")
          .attr("stroke", INK)
          .attr("stroke-width", 0.6)
          .attr("opacity", 0.35);
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

    // --- Terrain symbol placement ---

    nodes.forEach(node => {
      const rng = mulberry32(seedFromString(node.id));

      // Compute average angle to connected nodes to place symbols on opposite side
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
      const offset = 35;

      if (node.terrain === "mountains") {
        // Front row of peaks
        const count = 5 + Math.floor(rng() * 3);
        for (let i = 0; i < count; i++) {
          const spread = (i - (count - 1) / 2) * 14;
          const mx = node.x + Math.cos(placeAngle) * offset + Math.cos(placeAngle + Math.PI / 2) * spread;
          const my = node.y + Math.sin(placeAngle) * offset + Math.sin(placeAngle + Math.PI / 2) * spread;
          drawMountain(terrainGroup, mx, my, 13 + rng() * 6, rng);
        }
        // Back row of peaks for depth
        const backCount = 3 + Math.floor(rng() * 3);
        const backOffset = offset + 18;
        for (let i = 0; i < backCount; i++) {
          const spread = (i - (backCount - 1) / 2) * 16;
          const mx = node.x + Math.cos(placeAngle) * backOffset + Math.cos(placeAngle + Math.PI / 2) * spread;
          const my = node.y + Math.sin(placeAngle) * backOffset + Math.sin(placeAngle + Math.PI / 2) * spread;
          drawMountain(terrainGroup, mx, my, 11 + rng() * 5, rng);
        }
        // Add scattered rocks at mountain base — more pebbles, wider spread
        drawRocks(terrainGroup,
          node.x + Math.cos(placeAngle) * (offset + 28),
          node.y + Math.sin(placeAngle) * (offset + 28),
          25, rng);
        drawRocks(terrainGroup,
          node.x + Math.cos(placeAngle) * (offset + 10) + Math.cos(placeAngle + Math.PI / 2) * 20,
          node.y + Math.sin(placeAngle) * (offset + 10) + Math.sin(placeAngle + Math.PI / 2) * 20,
          18, rng);
        // Dense rock/pebble field on opposite side from mountains
        const rockFieldAngle = placeAngle + Math.PI; // opposite side from peaks
        const rockFieldCount = 25 + Math.floor(rng() * 16); // 25-40 rocks
        const rockFieldRadius = offset * 1.5;
        for (let i = 0; i < rockFieldCount; i++) {
          // Spread across opposite side with some lateral scatter
          const a = rockFieldAngle + (rng() - 0.5) * 2.0;
          const r = 8 + rng() * rockFieldRadius;
          const rx = node.x + Math.cos(a) * r;
          const ry = node.y + Math.sin(a) * r;
          // Varying sizes: mix of tiny pebbles and medium rocks
          const circleR = 1.5 + rng() * 2.5; // 1.5 to 4px
          const opacity = 0.4 + rng() * 0.2; // 0.4 to 0.6
          terrainGroup.append("circle")
            .attr("cx", rx).attr("cy", ry).attr("r", circleR)
            .attr("fill", "none")
            .attr("stroke", INK)
            .attr("stroke-width", 0.5)
            .attr("opacity", opacity);
        }
        // Birds circling above the peaks
        const mtnBirdCount = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < mtnBirdCount; i++) {
          const bx = node.x + Math.cos(placeAngle) * (offset * 0.5) + (rng() - 0.5) * 50;
          const by = node.y + Math.sin(placeAngle) * (offset * 0.3) - 20 - rng() * 20;
          drawBird(terrainGroup, bx, by, 6, rng);
        }
      } else if (node.terrain === "forest") {
        // Dense packed wall of round canopy circles — Mirkwood density, tightly overlapping
        const count = 20 + Math.floor(rng() * 12);
        for (let i = 0; i < count; i++) {
          const a = placeAngle + (rng() - 0.5) * 2.2;
          const r = offset * (0.15 + rng() * 0.5);
          const tx = node.x + Math.cos(a) * r;
          const ty = node.y + Math.sin(a) * r;
          drawTreeCanopy(terrainGroup, tx, ty, 13 + rng() * 5, rng);
        }
        // Second cluster — deeper forest layer at larger radius
        const count2 = 10 + Math.floor(rng() * 6);
        for (let i = 0; i < count2; i++) {
          const a = placeAngle + (rng() - 0.5) * 2.2;
          const r = offset * (0.8 + rng() * 0.4);
          const tx = node.x + Math.cos(a) * r;
          const ty = node.y + Math.sin(a) * r;
          drawTreeCanopy(terrainGroup, tx, ty, 13 + rng() * 5, rng);
        }
        // Spiderwebs scattered among the trees
        const webCount = 1 + Math.floor(rng() * 2);
        for (let i = 0; i < webCount; i++) {
          const a = placeAngle + (rng() - 0.5) * 1.8;
          const r = offset * (0.3 + rng() * 0.5);
          drawSpiderweb(terrainGroup, node.x + Math.cos(a) * r, node.y + Math.sin(a) * r, 10, rng);
        }
        // Birds above the canopy
        const forestBirdCount = 1 + Math.floor(rng() * 2);
        for (let i = 0; i < forestBirdCount; i++) {
          const bx = node.x + Math.cos(placeAngle) * (offset * 0.3) + (rng() - 0.5) * 40;
          const by = node.y + Math.sin(placeAngle) * (offset * 0.3) - 20 - rng() * 20;
          drawBird(terrainGroup, bx, by, 6, rng);
        }
      } else if (node.terrain === "swamp") {
        drawSwampReeds(terrainGroup,
          node.x + Math.cos(placeAngle) * offset,
          node.y + Math.sin(placeAngle) * offset, 20, rng);
      } else if (node.terrain === "plains") {
        const count = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < count; i++) {
          const a = placeAngle + (rng() - 0.5) * 1.0;
          const r = offset * (0.6 + rng() * 0.5);
          drawGrassTuft(terrainGroup, node.x + Math.cos(a) * r, node.y + Math.sin(a) * r, 14, rng);
        }
      }
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
          // Main town — larger building cluster
          const hs = 4.5;
          const positions = [{x:0, y:0}, {x:-hs*1.3, y:hs*0.2}, {x:hs*1.3, y:hs*0.1}, {x:-hs*0.5, y:-hs*0.8}, {x:hs*0.6, y:-hs*0.7}];
          positions.forEach(p => {
            // House body
            ng.append("rect").attr("x", p.x - hs*0.5).attr("y", p.y - hs*0.2).attr("width", hs).attr("height", hs*0.7)
              .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.9);
            // Roof
            ng.append("path")
              .attr("d", `M ${p.x - hs*0.6} ${p.y - hs*0.2} L ${p.x} ${p.y - hs*0.8} L ${p.x + hs*0.6} ${p.y - hs*0.2}`)
              .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.9);
          });
          break;
        }
        case "fortress": {
          const hs = 5;
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
          // Hanging sign (small rectangle on a line)
          ng.append("line").attr("x1", hs*0.7).attr("y1", -hs*0.1).attr("x2", hs*1.2).attr("y2", -hs*0.1)
            .attr("stroke", INK).attr("stroke-width", 0.5);
          ng.append("rect").attr("x", hs*1.0).attr("y", -hs*0.1).attr("width", hs*0.5).attr("height", hs*0.4)
            .attr("fill", INK).attr("stroke", "none").attr("opacity", 0.6);
          break;
        }
        case "settlement": {
          // Cluster of 2-3 tiny outlined houses
          const hs = isLocal ? 2.5 : 4;
          const houseCount = isLocal ? 2 : 3;
          for (let hi = 0; hi < houseCount; hi++) {
            const hx = (hi - (houseCount-1)/2) * hs * 1.4;
            const hy = (hi % 2) * hs * 0.3;
            // House body
            ng.append("rect").attr("x", hx - hs*0.6).attr("y", hy - hs*0.3).attr("width", hs*1.2).attr("height", hs*0.9)
              .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.8);
            // Roof
            ng.append("path")
              .attr("d", `M ${hx - hs*0.7} ${hy - hs*0.3} L ${hx} ${hy - hs} L ${hx + hs*0.7} ${hy - hs*0.3}`)
              .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.8);
          }
          break;
        }
        case "wilderness":
          ng.append("circle").attr("r", s).attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.2);
          break;
        case "dungeon": {
          const dd = s * 1.3;
          ng.append("path")
            .attr("d", `M 0 ${-dd} L ${dd} 0 L 0 ${dd} L ${-dd} 0 Z`)
            .attr("fill", INK).attr("stroke", "none");
          break;
        }
        case "sanctuary":
          ng.append("circle").attr("r", s).attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.2);
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
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.0)
            .attr("stroke-dasharray", "2 2");
          break;
        case "waypoint":
          ng.append("path")
            .attr("d", `M 0 ${-s} L ${s} ${s} L ${-s} ${s} Z`)
            .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.0);
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
      const fontSize = isLocal ? 10 : (isBlue ? 14 : 13);
      const fontWeight = (node.point_type === "heart" || node.point_type === "fortress") ? "bold" : "normal";
      const color = isLocal ? INK_LIGHT : (isBlue ? BLUE : INK);
      const yOffset = isLocal ? 14 : 18;

      labelGroup.append("text")
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
    });
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
        .attr("font-style", "italic")
        .attr("fill", INK_LIGHT)
        .attr("stroke", PARCHMENT)
        .attr("stroke-width", 2.5)
        .attr("paint-order", "stroke")
        .text(text);
    });
  },

  // --- Compass (simpler, Wilderland style — just an arrow and N) ---
  renderCompass(ctx) {
    const { g, bounds } = ctx;
    const { INK } = ctx.colors;

    const x = bounds.maxX + 20;
    const y = bounds.minY - 10;

    const cg = g.append("g")
      .attr("transform", `translate(${x}, ${y})`)
      .attr("opacity", 0.6);

    const size = 20;
    // Simple north arrow
    cg.append("line")
      .attr("x1", 0).attr("y1", size * 0.5)
      .attr("x2", 0).attr("y2", -size)
      .attr("stroke", INK)
      .attr("stroke-width", 1.0);

    // Arrowhead
    cg.append("path")
      .attr("d", `M 0 ${-size} L ${size * 0.2} ${-size * 0.6} L ${-size * 0.2} ${-size * 0.6} Z`)
      .attr("fill", INK);

    // N label
    cg.append("text")
      .attr("x", 0).attr("y", -size - 6)
      .attr("text-anchor", "middle")
      .attr("font-family", "'Palatino Linotype', serif")
      .attr("font-size", "11px")
      .attr("fill", INK)
      .text("N");

    // Small tick marks for E, W, S
    cg.append("line").attr("x1", -size * 0.3).attr("y1", 0).attr("x2", size * 0.3).attr("y2", 0)
      .attr("stroke", INK).attr("stroke-width", 0.6);
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
  },
};
