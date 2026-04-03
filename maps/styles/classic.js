// classic.js — "Classic" parchment map style for Open World Map viewer
// Extracted from grid.html. All rendering is self-contained; the host
// page supplies a render context (ctx) with shared utilities.

window.MapStyles = window.MapStyles || {};

window.MapStyles.classic = {
  name: "Classic",

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
    this.renderLinks(ctx);
    this.renderTerrainSymbols(ctx);
    this.renderNodes(ctx);
    this.renderLabels(ctx);
    this.renderDayLabels(ctx);
    this.renderCompass(ctx);
    this.renderScaleBar(ctx);
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
          path.attr("stroke-width", 2.5);
          break;
        case "trail":
          path.attr("stroke-width", 1.5).attr("stroke-dasharray", "8 4");
          break;
        case "wilderness":
          path.attr("stroke-width", 1).attr("stroke-dasharray", "3 5");
          break;
        default:
          path.attr("stroke-width", 1.5);
      }
    });
  },

  // --- Terrain symbol placement ---
  renderTerrainSymbols(ctx) {
    const { g, nodes, links } = ctx;
    const { INK } = ctx.colors;
    const mulberry32 = ctx.mulberry32;
    const seedFromString = ctx.seedFromString;

    const terrainGroup = g.append("g").attr("class", "terrain");

    nodes.forEach(node => {
      const rng = mulberry32(seedFromString(node.id));

      // Compute average angle to connected nodes to place symbols on opposite side
      const connected = links.filter(l =>
        (l.source.id || l.source) === node.id || (l.target.id || l.target) === node.id
      );
      let avgAngle = -Math.PI / 2; // default: place above
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
      // Place on opposite side
      const placeAngle = avgAngle + Math.PI;
      const offset = 35;

      if (node.terrain === "mountains") {
        const count = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < count; i++) {
          const spread = (i - (count - 1) / 2) * 18;
          const mx = node.x + Math.cos(placeAngle) * offset + Math.cos(placeAngle + Math.PI / 2) * spread;
          const my = node.y + Math.sin(placeAngle) * offset + Math.sin(placeAngle + Math.PI / 2) * spread;
          this.drawMountain(terrainGroup, mx, my, 12 + rng() * 6, rng, INK);
        }
      } else if (node.terrain === "forest") {
        const count = 3 + Math.floor(rng() * 3);
        for (let i = 0; i < count; i++) {
          const a = placeAngle + (rng() - 0.5) * 1.2;
          const r = offset * (0.7 + rng() * 0.6);
          const tx = node.x + Math.cos(a) * r;
          const ty = node.y + Math.sin(a) * r;
          this.drawTree(terrainGroup, tx, ty, 8 + rng() * 4, rng, INK);
        }
      } else if (node.terrain === "swamp") {
        this.drawSwampReeds(terrainGroup, node.x + Math.cos(placeAngle) * offset, node.y + Math.sin(placeAngle) * offset, 20, rng, INK);
      } else if (node.terrain === "plains") {
        const count = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < count; i++) {
          const a = placeAngle + (rng() - 0.5) * 1.0;
          const r = offset * (0.6 + rng() * 0.5);
          this.drawGrassTuft(terrainGroup, node.x + Math.cos(a) * r, node.y + Math.sin(a) * r, 12, rng, INK);
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

      switch (node.point_type) {
        case "heart":
          ng.append("circle").attr("r", 7).attr("fill", INK).attr("stroke", "none");
          ng.append("circle").attr("r", 9).attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.5);
          break;
        case "fortress":
          ng.append("rect").attr("x", -s).attr("y", -s).attr("width", s*2).attr("height", s*2)
            .attr("fill", INK).attr("stroke", "none");
          // Crenellations
          for (let i = -1; i <= 1; i++) {
            ng.append("rect").attr("x", i * s * 0.7 - 1.5).attr("y", -s - 3).attr("width", 3).attr("height", 3)
              .attr("fill", INK);
          }
          break;
        case "tavern":
          ng.append("rect").attr("x", -3).attr("y", -3).attr("width", 6).attr("height", 6)
            .attr("fill", INK).attr("stroke", "none");
          break;
        case "settlement":
          ng.append("circle").attr("r", s).attr("fill", INK).attr("stroke", "none");
          break;
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
          // Crenellation at top
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

  // --- Red labels ---
  renderLabels(ctx) {
    const { g, nodes, FONT } = ctx;
    const { INK_LIGHT, LABEL_RED, PARCHMENT } = ctx.colors;

    const labelGroup = g.append("g").attr("class", "labels");

    nodes.forEach(node => {
      const isLocal = node.scale === "local";
      const fontSize = isLocal ? 10 : 13;
      const fontWeight = (node.point_type === "heart" || node.point_type === "fortress") ? "bold" : "normal";
      const color = isLocal ? INK_LIGHT : LABEL_RED;
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

  // --- Compass rose ---
  renderCompass(ctx) {
    const { g, bounds, FONT } = ctx;
    const { INK } = ctx.colors;

    const x = bounds.maxX + 60;
    const y = bounds.minY - 20;

    const cg = g.append("g")
      .attr("transform", `translate(${x}, ${y})`)
      .attr("opacity", 0.5);

    const size = 30;
    // North arrow
    cg.append("path")
      .attr("d", `M 0 ${-size} L ${size * 0.15} ${-size * 0.3} L 0 ${-size * 0.15} L ${-size * 0.15} ${-size * 0.3} Z`)
      .attr("fill", INK);
    // South
    cg.append("path")
      .attr("d", `M 0 ${size} L ${size * 0.15} ${size * 0.3} L 0 ${size * 0.15} L ${-size * 0.15} ${size * 0.3} Z`)
      .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.8);
    // East
    cg.append("path")
      .attr("d", `M ${size} 0 L ${size * 0.3} ${-size * 0.15} L ${size * 0.15} 0 L ${size * 0.3} ${size * 0.15} Z`)
      .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.8);
    // West
    cg.append("path")
      .attr("d", `M ${-size} 0 L ${-size * 0.3} ${-size * 0.15} L ${-size * 0.15} 0 L ${-size * 0.3} ${size * 0.15} Z`)
      .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 0.8);

    // N label
    cg.append("text")
      .attr("x", 0).attr("y", -size - 6)
      .attr("text-anchor", "middle")
      .attr("font-family", FONT)
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .attr("fill", INK)
      .text("N");
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

  /* ────────────────────────────────────────────────────────────
     Terrain symbol drawing helpers
     INK is passed explicitly so they stay pure functions.
     ──────────────────────────────────────────────────────────── */

  drawMountain(g, x, y, size, rng, INK) {
    const w = size * (0.8 + rng() * 0.4);
    const h = size * (1.2 + rng() * 0.6);
    const skew = (rng() - 0.5) * w * 0.15;

    // Shadow side (left) - filled
    g.append("path")
      .attr("d", `M ${x - w/2} ${y} L ${x + skew} ${y - h} L ${x} ${y} Z`)
      .attr("fill", INK)
      .attr("stroke", "none");

    // Light side (right) - outline only
    g.append("path")
      .attr("d", `M ${x} ${y} L ${x + skew} ${y - h} L ${x + w/2} ${y}`)
      .attr("fill", "none")
      .attr("stroke", INK)
      .attr("stroke-width", 1.2);
  },

  drawTree(g, x, y, size, rng, INK) {
    // Egg-shaped tree: ellipse with elongated top
    const rx = size * (0.35 + rng() * 0.15);
    const ry = size * (0.5 + rng() * 0.2);
    const points = [];
    for (let a = 0; a < Math.PI * 2; a += 0.2) {
      let r_x = rx;
      let r_y = ry;
      // Elongate the top (negative y in SVG)
      if (Math.sin(a) < 0) {
        r_y *= 1.3;
      }
      points.push([x + Math.cos(a) * r_x, y + Math.sin(a) * r_y]);
    }
    const line = d3.line().curve(d3.curveBasisClosed);
    g.append("path")
      .attr("d", line(points))
      .attr("fill", INK)
      .attr("stroke", "none")
      .attr("opacity", 0.8);

    // Small trunk line
    g.append("line")
      .attr("x1", x).attr("y1", y + ry * 0.6)
      .attr("x2", x).attr("y2", y + ry * 0.6 + size * 0.3)
      .attr("stroke", INK)
      .attr("stroke-width", 0.8);
  },

  drawSwampReeds(g, x, y, size, rng, INK) {
    // Wavy water lines
    for (let i = 0; i < 3; i++) {
      const ly = y + i * size * 0.3;
      const lx = x - size * 0.5;
      const d = `M ${lx} ${ly} Q ${lx + size * 0.25} ${ly - size * 0.1} ${lx + size * 0.5} ${ly} Q ${lx + size * 0.75} ${ly + size * 0.1} ${lx + size} ${ly}`;
      g.append("path")
        .attr("d", d)
        .attr("fill", "none")
        .attr("stroke", INK)
        .attr("stroke-width", 0.8)
        .attr("opacity", 0.5);
    }
    // Reed stalks
    for (let i = 0; i < 3; i++) {
      const rx = x - size * 0.3 + rng() * size * 0.6;
      const ry = y - size * 0.2;
      g.append("line")
        .attr("x1", rx).attr("y1", ry)
        .attr("x2", rx).attr("y2", ry - size * 0.6)
        .attr("stroke", INK)
        .attr("stroke-width", 0.8);
      g.append("circle")
        .attr("cx", rx).attr("cy", ry - size * 0.6 - 2)
        .attr("r", 1.5)
        .attr("fill", INK);
    }
  },

  drawGrassTuft(g, x, y, size, rng, INK) {
    const blades = 3;
    for (let i = 0; i < blades; i++) {
      const angle = -Math.PI / 2 + (i - 1) * 0.4 + (rng() - 0.5) * 0.2;
      const len = size * (0.4 + rng() * 0.3);
      const tx = x + Math.cos(angle) * len;
      const ty = y + Math.sin(angle) * len;
      const cx = x + Math.cos(angle) * len * 0.5 + (rng() - 0.5) * 3;
      const cy = y + Math.sin(angle) * len * 0.5;
      g.append("path")
        .attr("d", `M ${x} ${y} Q ${cx} ${cy} ${tx} ${ty}`)
        .attr("fill", "none")
        .attr("stroke", INK)
        .attr("stroke-width", 0.7)
        .attr("opacity", 0.4);
    }
  },
};
