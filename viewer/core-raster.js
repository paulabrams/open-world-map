// === Open World Map — Raster (Canvas) Core ===
// AssetCache + paintCtx factory for canvas-based renderers.
//
// Depends on window.MapData (core-data.js).

(function () {
  "use strict";

  const D = window.MapData;
  if (!D) throw new Error("core-raster.js requires core-data.js to be loaded first");

  // ---------------------------------------------------------------------
  // Asset cache: loads the manifest, fetches every image, converts Procreate
  // grayscale shape maps to transparent-alpha canvases on load, caches
  // createPattern results per ctx.
  // ---------------------------------------------------------------------
  const AssetCache = {
    manifest: null,
    manifestBase: null,
    paper: null,
    border: null,
    patterns: {},           // { name: HTMLImageElement }
    _patternCache: new WeakMap(), // ctx2d → { name: CanvasPattern }
    categories: {},         // { key: [{ img, anchor, weight }] }

    async preload(manifestUrl) {
      const base = manifestUrl.replace(/[^/]+$/, "");
      this.manifestBase = base;
      const resp = await fetch(manifestUrl);
      const manifest = await resp.json();
      this.manifest = manifest;

      // Optional sidecar: per-stamp brush metadata (archetype, use, tiling_role,
      // file_kb, suggested_height_px). Missing file is non-fatal — picks just
      // skip archetype filtering in that case.
      let brushMeta = {};
      try {
        const r = await fetch(base + "brush-metadata.json");
        if (r.ok) brushMeta = await r.json();
      } catch (e) { /* sidecar absent — okay */ }
      this.brushMeta = brushMeta;

      const loads = [];
      if (manifest.paper) {
        loads.push(loadRawImage(base + manifest.paper).then(img => { this.paper = img; }));
      }
      if (manifest.border) {
        loads.push(loadRawImage(base + manifest.border).then(img => { this.border = img; }));
      }
      for (const [name, src] of Object.entries(manifest.patterns || {})) {
        loads.push(loadRawImage(base + src).then(img => { this.patterns[name] = img; }));
      }
      for (const [cat, items] of Object.entries(manifest.categories || {})) {
        // Pre-allocate so the array order matches the manifest order
        // regardless of which async stamp load finishes first. Required for
        // deterministic rendering (see acceptance criterion #7).
        this.categories[cat] = new Array(items.length);
        items.forEach((item, idx) => {
          const m = brushMeta[item.src] || {};
          loads.push(
            loadStamp(base + item.src).then(canvas => {
              this.categories[cat][idx] = {
                img: canvas,
                anchor: item.anchor || [0.5, 0.9],
                weight: item.weight || 1.0,
                w: canvas.width,
                h: canvas.height,
                src: item.src,
                // Brush metadata (may be undefined if sidecar absent for this src)
                brush_name: m.brush_name,
                archetype: m.archetype || "unknown",
                use: m.use || "stamp",
                tiling_role: m.tiling_role || "single",
                tiling_partner_name: m.tiling_partner_name || null,
                file_kb: m.file_kb,
                suggested_height_px: m.suggested_height_px,
                size_factor: m.size_factor,
              };
            })
          );
        });
      }

      await Promise.all(loads);
    },

    // Look up a single stamp by its manifest src path (e.g. "symbols/viking/shape-33.png").
    bySrc(src) {
      if (!src) return null;
      for (const pool of Object.values(this.categories)) {
        if (!pool) continue;
        for (const it of pool) {
          if (it && it.src === src) return it;
        }
      }
      return null;
    },

    // Pick a weighted-random stamp from the given category via rng().
    // Plain `pick` excludes overlays/decorations/paths/patterns and composed
    // ranges by default — these are not standalone placements.
    pick(category, rng) {
      return this.pickWhere(category, rng);
    },

    // Filtered pick. Options:
    //   archetypes:        array of allowed archetype strings (default: any)
    //   archetypeWeights:  { archetype: multiplier } applied on top of weight
    //   excludeUses:       Set of `use` values to skip (default: overlay,
    //                      decoration, path, pattern — non-stamp art)
    //   excludeRoles:      Set of tiling_role values to skip (default:
    //                      composed-range — too large to drop randomly).
    //                      Pass an empty Set to NOT exclude composed-range.
    //   includeRoles:      Set of tiling_role values that MUST match.
    //                      Use this when you specifically want composed-range
    //                      stamps (e.g. forest interior clumps).
    pickWhere(category, rng, options) {
      options = options || {};
      const pool = this.categories[category];
      if (!pool || !pool.length) return null;
      const archAllow = options.archetypes ? new Set(options.archetypes) : null;
      const archWeights = options.archetypeWeights || null;
      const excludeUses = options.excludeUses
        || new Set(["overlay", "decoration", "path", "pattern"]);
      const excludeRoles = options.excludeRoles
        || new Set(["composed-range"]);
      const includeRoles = options.includeRoles
        ? new Set(options.includeRoles)
        : null;

      const filtered = [];
      let total = 0;
      for (const it of pool) {
        if (!it) continue;
        if (archAllow && !archAllow.has(it.archetype)) continue;
        if (it.use && excludeUses.has(it.use)) continue;
        if (it.tiling_role && excludeRoles.has(it.tiling_role)) continue;
        if (includeRoles && !includeRoles.has(it.tiling_role)) continue;
        let w = it.weight || 1.0;
        if (archWeights && archWeights[it.archetype] != null) {
          w *= archWeights[it.archetype];
        }
        if (w <= 0) continue;
        filtered.push({ it, w });
        total += w;
      }
      if (total <= 0) return null;
      let r = rng() * total;
      for (const { it, w } of filtered) {
        r -= w;
        if (r <= 0) return it;
      }
      return filtered[filtered.length - 1].it;
    },

    // List all loaded stamps in a category, after the same default filters
    // as pick(). Useful for renderer logic that wants to inspect candidates.
    candidatesIn(category, options) {
      const out = [];
      const pool = this.categories[category];
      if (!pool) return out;
      const opts = options || {};
      const excludeUses = opts.excludeUses
        || new Set(["overlay", "decoration", "path", "pattern"]);
      const excludeRoles = opts.excludeRoles
        || new Set(["composed-range"]);
      const archAllow = opts.archetypes ? new Set(opts.archetypes) : null;
      for (const it of pool) {
        if (!it) continue;
        if (archAllow && !archAllow.has(it.archetype)) continue;
        if (it.use && excludeUses.has(it.use)) continue;
        if (it.tiling_role && excludeRoles.has(it.tiling_role)) continue;
        out.push(it);
      }
      return out;
    },

    pattern(ctx, name) {
      let cache = this._patternCache.get(ctx);
      if (!cache) { cache = {}; this._patternCache.set(ctx, cache); }
      if (!cache[name]) {
        const img = this.patterns[name];
        if (!img) return null;
        cache[name] = ctx.createPattern(img, "repeat");
      }
      return cache[name];
    },
  };

  // Fetch a plain image (paper, patterns, border, already-transparent PNGs).
  function loadRawImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load " + url));
      img.src = url;
    });
  }

  // Load a Procreate-style brush shape. Shape.png files are 8-bit grayscale
  // (no alpha channel) where whiter pixels = more paint. Convert to an RGBA
  // canvas with black pigment and alpha = grayscale value, trimmed to the
  // non-transparent bounding box so anchor math is predictable.
  async function loadStamp(url) {
    const img = await loadRawImage(url);
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    const src = document.createElement("canvas");
    src.width = w0; src.height = h0;
    const sctx = src.getContext("2d", { willReadFrequently: true });
    sctx.drawImage(img, 0, 0);
    const data = sctx.getImageData(0, 0, w0, h0);
    const px = data.data;

    // Detect whether the source already has meaningful alpha (e.g. History
    // Effects PNGs are already transparent RGBA). If any pixel has alpha < 250
    // we treat alpha as authoritative; otherwise we derive alpha from luminance.
    let hasRealAlpha = false;
    for (let i = 3; i < px.length; i += 4) {
      if (px[i] < 250) { hasRealAlpha = true; break; }
    }

    // For grayscale Shape.png with no alpha, decide ink-on-white vs white-on-black
    // by sampling the four corners — if they're mostly bright, the artwork is
    // black ink on a white sheet (the Map Effects convention) and we invert
    // luminance to get the alpha mask.
    let invertLum = false;
    if (!hasRealAlpha) {
      const samples = [
        (0 * w0 + 0) * 4,
        (0 * w0 + (w0 - 1)) * 4,
        ((h0 - 1) * w0 + 0) * 4,
        ((h0 - 1) * w0 + (w0 - 1)) * 4,
      ];
      let bright = 0;
      for (const s of samples) {
        const lum = (px[s] * 0.299 + px[s + 1] * 0.587 + px[s + 2] * 0.114);
        if (lum > 200) bright++;
      }
      invertLum = bright >= 3;
    }

    let minX = w0, minY = h0, maxX = -1, maxY = -1;
    for (let y = 0; y < h0; y++) {
      for (let x = 0; x < w0; x++) {
        const i = (y * w0 + x) * 4;
        let a;
        if (hasRealAlpha) {
          a = px[i + 3];
          // keep original RGB — these are finished stamps with ink color baked in
        } else {
          // Procreate shape map: derive alpha from luminance. Black-on-white
          // brushes get inverted so the inked artwork stays visible.
          const lum = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
          a = invertLum ? 255 - lum : lum;
          px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = a;
        }
        if (a > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!hasRealAlpha) sctx.putImageData(data, 0, 0);

    if (maxX < minX || maxY < minY) {
      // Empty stamp — return the untrimmed source.
      return src;
    }
    // Pad 1px to avoid cutting anti-aliased edges on trim.
    minX = Math.max(0, minX - 1);
    minY = Math.max(0, minY - 1);
    maxX = Math.min(w0 - 1, maxX + 1);
    maxY = Math.min(h0 - 1, maxY + 1);

    const tw = maxX - minX + 1;
    const th = maxY - minY + 1;
    const trimmed = document.createElement("canvas");
    trimmed.width = tw; trimmed.height = th;
    trimmed.getContext("2d").drawImage(src, minX, minY, tw, th, 0, 0, tw, th);
    return trimmed;
  }

  // ---------------------------------------------------------------------
  // paintCtx factory: build the render context passed to a raster renderer.
  // ---------------------------------------------------------------------
  function buildPaintCtx({ canvas, graphData, campaign, assets, width, height }) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const WIDTH = width  != null ? width  : canvas.clientWidth;
    const HEIGHT = height != null ? height : canvas.clientHeight;
    canvas.width = Math.round(WIDTH * dpr);
    canvas.height = Math.round(HEIGHT * dpr);
    canvas.style.width = WIDTH + "px";
    canvas.style.height = HEIGHT + "px";
    const ctx2d = canvas.getContext("2d");
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.imageSmoothingEnabled = true;
    ctx2d.imageSmoothingQuality = "high";

    const hexTerrain = graphData.hex_terrain || {};
    const riverPath = graphData.river_path || [];
    const roadPath = graphData.road_path || [];

    return {
      canvas, ctx2d,
      WIDTH, HEIGHT, dpr,
      campaign,
      graphData,
      meta: graphData.meta || {},
      nodes: (graphData.nodes || []).slice(),
      allNodes: (graphData.nodes || []).slice(),
      links: (graphData.links || []).slice(),
      hexTerrain,
      riverPath,
      roadPath,
      rng: D.mulberry32(D.seedFromString(campaign + ":paint")),
      HINT_SCALE: D.HINT_SCALE,
      assets,
      // Bound math helpers to this canvas dimension.
      hexCenterXY: hex => D.hexCenterXY(hex, WIDTH, HEIGHT),
      hexPolygon:  hex => D.hexPolygon(hex, WIDTH, HEIGHT),
      xyToHex:     (x, y) => D.xyToHex(x, y, WIDTH, HEIGHT),
      nodeXY:      n => D.nodeXY(n, WIDTH, HEIGHT),
      landBounds:  (pad) => D.landBounds(hexTerrain, WIDTH, HEIGHT, pad),
    };
  }

  // ---------------------------------------------------------------------
  // Small canvas drawing helpers used across renderers.
  // ---------------------------------------------------------------------

  // Draw a stamp anchored at (x, y) with scale, rotation, optional flipX.
  function drawStamp(ctx, stamp, x, y, scale, opts = {}) {
    if (!stamp || !stamp.img) return;
    const { anchor, w, h } = stamp;
    const rotation = opts.rotation || 0;
    const flipX = opts.flipX ? -1 : 1;
    const alpha = opts.alpha != null ? opts.alpha : 1;
    const sw = w * scale;
    const sh = h * scale;
    ctx.save();
    if (opts.blend) ctx.globalCompositeOperation = opts.blend;
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);
    if (flipX !== 1) ctx.scale(flipX, 1);

    // Knockout: paint a paper-colored silhouette of the stamp first at FULL
    // opacity so any ink underneath is fully masked out, regardless of the
    // stamp's own alpha. Without this, a translucent foreground stamp lets
    // background ink (e.g. a hill behind a keep) bleed through the gaps in
    // its line-art at (1 − alpha) intensity.
    if (opts.knockout) {
      const paper = opts.knockoutColor || "#ffffff";
      const buf = getKnockoutBuffer(stamp, paper);
      if (buf) {
        ctx.globalAlpha = 1;  // full mask, regardless of opts.alpha
        ctx.drawImage(buf, -sw * anchor[0], -sh * anchor[1], sw, sh);
      }
    }

    ctx.globalAlpha = alpha;
    ctx.drawImage(stamp.img, -sw * anchor[0], -sh * anchor[1], sw, sh);
    ctx.restore();
  }

  // Per-(stamp, color) cache of "paper-silhouette" canvases — the stamp's
  // alpha mask, dilated and thresholded so internal hollow regions in
  // line-art stamps (e.g. the empty space between a keep's walls) are
  // filled in, then recoloured to the paper colour.
  //
  // Without this dilation step the knockout only covered the inked outline
  // pixels, so anything painted BEHIND a keep would show through the
  // transparent interior of its walls (the Thornespire Keep "hill bleeding
  // through the keep" bug).
  const _knockoutCache = new WeakMap();
  function getKnockoutBuffer(stamp, color) {
    let byColor = _knockoutCache.get(stamp);
    if (!byColor) { byColor = new Map(); _knockoutCache.set(stamp, byColor); }
    let buf = byColor.get(color);
    if (!buf) {
      const w = stamp.img.width || stamp.w;
      const h = stamp.img.height || stamp.h;
      if (!w || !h) return null;
      buf = document.createElement("canvas");
      buf.width = w; buf.height = h;
      const c = buf.getContext("2d");
      // Step 1: blur the stamp into the buffer. Blur radius is proportional
      // to the stamp's longest edge so the dilation amount tracks size.
      const blurRadius = Math.max(4, Math.round(Math.max(w, h) * 0.025));
      try {
        c.filter = "blur(" + blurRadius + "px)";
      } catch (e) { /* very old browsers */ }
      c.drawImage(stamp.img, 0, 0);
      c.filter = "none";
      // Step 2: threshold the alpha — any pixel above ~10% becomes fully
      // opaque, everything else fully transparent. Closes interior gaps in
      // line-art (the inside of a keep, the space between tower walls).
      try {
        const imgData = c.getImageData(0, 0, w, h);
        const px = imgData.data;
        for (let i = 3; i < px.length; i += 4) {
          px[i] = px[i] > 24 ? 255 : 0;
        }
        c.putImageData(imgData, 0, 0);
      } catch (e) { /* CORS issue — fall through with un-thresholded mask */ }
      // Step 3: recolour the resulting silhouette to the paper colour.
      c.globalCompositeOperation = "source-in";
      c.fillStyle = color;
      c.fillRect(0, 0, w, h);
      byColor.set(color, buf);
    }
    return buf;
  }

  // Draw a stamp scaled so its rendered height equals `targetHeight` canvas
  // pixels, preserving the source aspect ratio. This is the right path for
  // metadata-driven sizing — disk PNGs are cropped tight to ink, the brush
  // metadata's `suggested_height_px` decides how large each stamp should
  // appear on the map. Optional `mult` is a per-call multiplier (e.g. ±15%
  // jitter applied by the caller).
  function drawStampAtHeight(ctx, stamp, x, y, targetHeight, opts) {
    if (!stamp || !stamp.img) return;
    opts = opts || {};
    const mult = opts.mult != null ? opts.mult : 1;
    const h = stamp.h || 1;
    const scale = (targetHeight * mult) / h;
    drawStamp(ctx, stamp, x, y, scale, opts);
  }

  // Resolve the target render height for a stamp from its metadata, with
  // category-based fallbacks and a final fallback to native pixel height.
  // PAINTED_SCALE (200 px/in) targets — see docs/painted-renderer.md.
  // Halved from the spec's painted-scale targets to match the calibration
  // baked into extract-brush-metadata.py's GLOBAL_SCALE = 0.5.
  const CATEGORY_FALLBACK_HEIGHT = {
    mountains: 55,
    conifer:   16,
    deciduous: 16,
    vegetation: 7,
    lakes:     30,
    features:  30,
    terrain:   25,
    general:   25,
  };
  function targetHeightFor(stamp, category) {
    if (!stamp) return 50;
    if (stamp.suggested_height_px) return stamp.suggested_height_px;
    if (category && CATEGORY_FALLBACK_HEIGHT[category]) return CATEGORY_FALLBACK_HEIGHT[category];
    return stamp.h || 50;
  }

  // Trace a hex polygon on the current path.
  function tracePolygon(ctx, points, closed = true) {
    if (!points.length) return;
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    if (closed) ctx.closePath();
  }

  // Build a clip path covering all land hexes (used to sum all stamp bounds).
  function landClipPath(paintCtx) {
    const { hexTerrain, hexPolygon } = paintCtx;
    const path = new Path2D();
    Object.keys(hexTerrain).forEach(h => {
      const pts = hexPolygon(h);
      path.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
      path.closePath();
    });
    return path;
  }

  // Seeded Poisson-disk sampler restricted to the given (convex) polygon.
  // Points are returned in insertion order; callers typically sort by y.
  function poissonInPolygon(polygon, radius, rng, k = 20) {
    const xs = polygon.map(p => p[0]);
    const ys = polygon.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const cellSize = radius / Math.SQRT2;
    const cols = Math.ceil((maxX - minX) / cellSize) + 1;
    const rows = Math.ceil((maxY - minY) / cellSize) + 1;
    const grid = new Array(cols * rows).fill(null);
    const active = [];
    const points = [];

    function gridIndex(x, y) {
      const c = Math.floor((x - minX) / cellSize);
      const r = Math.floor((y - minY) / cellSize);
      return r * cols + c;
    }
    function farEnough(x, y) {
      const c = Math.floor((x - minX) / cellSize);
      const r = Math.floor((y - minY) / cellSize);
      for (let dr = -2; dr <= 2; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= rows) continue;
        for (let dc = -2; dc <= 2; dc++) {
          const cc = c + dc;
          if (cc < 0 || cc >= cols) continue;
          const p = grid[rr * cols + cc];
          if (!p) continue;
          const dx = p[0] - x, dy = p[1] - y;
          if (dx * dx + dy * dy < radius * radius) return false;
        }
      }
      return true;
    }

    // Seed with polygon center.
    const seedX = xs.reduce((s, v) => s + v, 0) / xs.length;
    const seedY = ys.reduce((s, v) => s + v, 0) / ys.length;
    if (pointInPolygon(seedX, seedY, polygon)) {
      grid[gridIndex(seedX, seedY)] = [seedX, seedY];
      active.push([seedX, seedY]);
      points.push([seedX, seedY]);
    }

    let guard = 5000;
    while (active.length && guard-- > 0) {
      const idx = Math.floor(rng() * active.length);
      const [ax, ay] = active[idx];
      let placed = false;
      for (let i = 0; i < k; i++) {
        const ang = rng() * Math.PI * 2;
        const r = radius * (1 + rng());
        const nx = ax + Math.cos(ang) * r;
        const ny = ay + Math.sin(ang) * r;
        if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
        if (!pointInPolygon(nx, ny, polygon)) continue;
        if (!farEnough(nx, ny)) continue;
        grid[gridIndex(nx, ny)] = [nx, ny];
        active.push([nx, ny]);
        points.push([nx, ny]);
        placed = true;
        break;
      }
      if (!placed) active.splice(idx, 1);
    }
    return points;
  }

  function pointInPolygon(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Save the current canvas as PNG download.
  function exportCanvasPNG(canvas, filename) {
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "map.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  window.MapRaster = {
    AssetCache,
    buildPaintCtx,
    drawStamp,
    drawStampAtHeight,
    targetHeightFor,
    tracePolygon,
    landClipPath,
    poissonInPolygon,
    pointInPolygon,
    exportCanvasPNG,
  };
})();
