#!/usr/bin/env node
// Build derived Map Effects runtime assets.
//
// Sources in `resources/Dragon isles map painting/` are licensed for use but
// not for redistribution at full resolution. This script extracts brush
// silhouettes from the Procreate .brushset archives, copies pattern/paper/border
// art, downsamples everything, and writes a manifest under viewer/assets/mapeffects/.
//
// Uses only macOS built-ins (unzip, sips) — no npm dependencies.
//
// Usage: node tools/build-mapeffects-assets.mjs [--force]

import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, readdirSync, statSync, cpSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { tmpdir } from "node:os";

const REPO = resolve(new URL("..", import.meta.url).pathname);
const SRC_ROOT = join(REPO, "resources", "mapeffects");
const OUT_ROOT = join(REPO, "viewer", "assets", "mapeffects");
const FORCE = process.argv.includes("--force");
// Take every brush; classification + filtering happens at inventory/render time.
const MAX_PER_CATEGORY = 999;

// Brushsets to extract. `path` is relative to SRC_ROOT.
const BRUSH_TO_CAT = [
  { path: "Fantasy Map Builder - Map Effects/Brushes/Procreate/Mountains__Map_Builder.brushset",        cat: "mountains",  max: 999 },
  { path: "Fantasy Map Builder - Map Effects/Brushes/Procreate/Pine_Forest__Map_Builder.brushset",      cat: "conifer",    max: 999 },
  { path: "Fantasy Map Builder - Map Effects/Brushes/Procreate/Deciduous_Forest__Map_Builder.brushset", cat: "deciduous",  max: 999 },
  { path: "Fantasy Map Builder - Map Effects/Brushes/Procreate/Vegetation__Map_Builder_.brushset",      cat: "vegetation", max: 999 },
  { path: "Fantasy Map Builder - Map Effects/Brushes/Procreate/Features__Map_Builder.brushset",         cat: "features",   max: 999 },
  { path: "Fantasy Map Builder - Map Effects/Brushes/Procreate/Lakes__Map_Builder.brushset",            cat: "lakes",      max: 999 },
  { path: "Fantasy Map Builder - Map Effects/Brushes/Procreate/Terrain__Map_Builder.brushset",          cat: "terrain",    max: 999 },
  { path: "Fantasy Map Builder - Map Effects/Brushes/Procreate/Brushes__Map_Builder.brushset",          cat: "general",    max: 999 },
  { path: "History Effects - Mapeffects.co/Viking Effects/Brushes/Procreate/Viking_Effects__Map_Effects_1.brushset",         cat: "viking",   max: 999 },
  { path: "History Effects - Mapeffects.co/Medieval Effects/Brush Files/1. Procreate/Medieval_Effects__MapEffects.brushset", cat: "medieval", max: 999 },
];

const PATTERNS = [
  { file: "Seamless - Marsh.JPG",       name: "marsh" },
  { file: "Seamless - Grassland.JPG",   name: "grassland" },
  { file: "Seamless - Hatching.JPG",    name: "hatching" },
  { file: "Seamless - Rocky Terrain.JPG", name: "rocky" },
  { file: "Seamless - Cracked Terrain.JPG", name: "cracked" },
];

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: "pipe", ...opts });
}

function sips(args) {
  try {
    sh("sips", args);
  } catch (err) {
    // sips writes to stderr on success; capture its real errors only if the exit is non-zero
    throw new Error("sips failed: " + (err.stderr?.toString() || err.message));
  }
}

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function shouldSkip(outPath) {
  return !FORCE && existsSync(outPath);
}

function resizePng(src, dst, maxEdge) {
  ensureDir(resolve(dst, ".."));
  if (shouldSkip(dst)) return false;
  // sips -Z sets the longest edge; -s format png keeps PNG output
  sips(["-Z", String(maxEdge), "-s", "format", "png", src, "--out", dst]);
  return true;
}

// Trim a brush Shape.png to its visible-ink bbox, then downsample if needed.
//
// Procreate brushes store their shape as a 2048×2048 image. There are two
// conventions in this asset pack:
//   1. Procreate brushset shapes: opaque RGBA, BLACK ink on WHITE background.
//      Alpha is uniformly 255, so we must derive the mask from luminance
//      (dark pixels = ink). We additionally bake the alpha mask into the
//      saved PNG so the runtime sees a proper transparent stamp without
//      having to re-detect the convention at load time.
//   2. History Effects fallback PNGs: already-transparent RGBA. Use the
//      alpha channel as-is.
//
// Either way the bbox is the tightest rectangle around visible-ink pixels.
// Threshold the inked-pixel mask at 24/255 so very-faint dab pixels at the
// canvas corners don't keep the bbox at full size.
function trimAndResizePng(src, dst, maxEdge) {
  ensureDir(resolve(dst, ".."));
  if (shouldSkip(dst)) return false;
  const py = `
import sys
from PIL import Image
src, dst, maxe = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src)

# Two source conventions in this asset pack:
#   1. Procreate brushset shapes: 8-bit grayscale ("L" mode), white = empty
#      canvas, dark pixels = ink. There is no alpha channel.
#   2. History Effects fallback PNGs: RGBA with real transparency.
#
# In both cases derive an "ink mask" — bright where ink is, dark where
# canvas is empty — and use its bbox for trimming.
if im.mode == "L":
    # White background, dark ink → invert so ink is bright.
    L = im
    ink = L.point(lambda v: 255 - v)
elif im.mode == "LA":
    L, A = im.split()
    ink = A.point(lambda v: v)  # alpha is the mask
elif im.mode == "RGBA":
    r, g, b, a = im.split()
    if a.getextrema()[0] >= 250:
        # Opaque RGBA — fall back to inverted luminance.
        L = im.convert("L")
        ink = L.point(lambda v: 255 - v)
    else:
        ink = a
else:
    L = im.convert("L")
    ink = L.point(lambda v: 255 - v)

# Threshold and bbox. 24/255 drops near-empty pixels but keeps faint edges.
mask = ink.point(lambda v: 255 if v >= 24 else 0)
bbox = mask.getbbox()
if bbox:
    im = im.crop(bbox)
    ink = ink.crop(bbox)

# Always emit RGBA with proper alpha so the runtime can drawImage directly.
# RGB stays black (the ink is monochrome line art); alpha comes from the
# ink mask so anti-aliased edges read properly when composited.
black = Image.new("L", im.size, 0)
out = Image.merge("RGBA", (black, black, black, ink))

w, h = out.size
m = max(w, h)
if m > maxe:
    s = maxe / m
    out = out.resize((max(1, int(round(w*s))), max(1, int(round(h*s)))), Image.LANCZOS)
out.save(dst, optimize=True)
`;
  sh("python3", ["-c", py, src, dst, String(maxEdge)]);
  return true;
}

// Per-category target output size CAP after trim. Stamps end up at min(ink
// bbox, SHAPE_MAX_EDGE). 1024 gives ~4× headroom over typical render sizes
// (14–60 canvas px) so CSS-scaled views (pan/zoom on the painted page,
// inventory PREVIEW_ZOOM, etc.) stay sharp without visible pixelation.
const SHAPE_MAX_EDGE = 1024;

function resizeJpg(src, dst, maxEdge, quality = 80) {
  ensureDir(resolve(dst, ".."));
  if (shouldSkip(dst)) return false;
  sips(["-Z", String(maxEdge), "-s", "format", "jpeg", "-s", "formatOptions", String(quality), src, "--out", dst]);
  return true;
}

function copyFile(src, dst) {
  ensureDir(resolve(dst, ".."));
  if (shouldSkip(dst)) return false;
  cpSync(src, dst);
  return true;
}

// --- Brush extraction ---
function extractBrushset(srcBrushset, outDir, maxShapes) {
  const tmpDir = join(tmpdir(), "mapeffects-brushset-" + basename(srcBrushset) + "-" + Date.now());
  ensureDir(tmpDir);
  try {
    sh("unzip", ["-q", "-o", srcBrushset, "-d", tmpDir]);
    const shapes = [];
    for (const guid of readdirSync(tmpDir)) {
      const guidPath = join(tmpDir, guid);
      if (!statSync(guidPath).isDirectory()) continue;
      const shapePath = join(guidPath, "Shape.png");
      if (existsSync(shapePath)) shapes.push(shapePath);
    }
    shapes.sort(); // deterministic ordering
    const pick = shapes.slice(0, maxShapes);
    const written = [];
    ensureDir(outDir);
    pick.forEach((src, i) => {
      const n = String(i + 1).padStart(2, "0");
      const dst = join(outDir, `shape-${n}.png`);
      if (!shouldSkip(dst)) {
        trimAndResizePng(src, dst, SHAPE_MAX_EDGE);
      }
      written.push(basename(dst));
    });
    return written;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// --- History Effects fallback (already transparent PNGs) ---
function copyFallbackStamps(srcDir, outDir, maxN) {
  if (!existsSync(srcDir)) return [];
  ensureDir(outDir);
  const files = readdirSync(srcDir).filter(f => /\.(png|PNG)$/.test(f)).sort().slice(0, maxN);
  const written = [];
  files.forEach((f, i) => {
    const n = String(i + 1).padStart(2, "0");
    const dst = join(outDir, `extra-${n}.png`);
    if (!shouldSkip(dst)) {
      trimAndResizePng(join(srcDir, f), dst, 512);
    }
    written.push(basename(dst));
  });
  return written;
}

// --- Main ---
console.log("Map Effects asset build → " + OUT_ROOT);
ensureDir(OUT_ROOT);

// Brushset stamps
const manifestCategories = {};
for (const { path: rel, cat, max } of BRUSH_TO_CAT) {
  const srcBrushset = join(SRC_ROOT, rel);
  if (!existsSync(srcBrushset)) {
    console.warn("  skip (missing): " + srcBrushset);
    continue;
  }
  const outDir = join(OUT_ROOT, "symbols", cat);
  console.log(`  brushset → ${cat}`);
  const files = extractBrushset(srcBrushset, outDir, max);
  manifestCategories[cat] = files.map(name => ({
    src: `symbols/${cat}/${name}`,
    weight: 1.0,
    anchor: cat === "mountains" || cat === "conifer" || cat === "deciduous" ? [0.5, 0.9] : [0.5, 0.5],
  }));
}

// Fallback Egyptian + Mayan stamps
const eg = copyFallbackStamps(
  join(SRC_ROOT, "History Effects - Mapeffects.co", "Egyptian Effects", "Brush Shapes", "PNG"),
  join(OUT_ROOT, "symbols", "extra-egyptian"),
  16,
);
if (eg.length) {
  manifestCategories["extra-egyptian"] = eg.map(n => ({ src: `symbols/extra-egyptian/${n}`, weight: 1.0, anchor: [0.5, 0.5] }));
}
const my = copyFallbackStamps(
  join(SRC_ROOT, "History Effects - Mapeffects.co", "Mayan Effects", "Brush Shapes", "PNG"),
  join(OUT_ROOT, "symbols", "extra-mayan"),
  16,
);
if (my.length) {
  manifestCategories["extra-mayan"] = my.map(n => ({ src: `symbols/extra-mayan/${n}`, weight: 1.0, anchor: [0.5, 0.5] }));
}

// Since brushsets don't ship with named settlement/tower stamps, we alias
// features → settlement & feature slots. The renderer picks from these via
// the manifest category keys; downstream curation can rewire later.
if (manifestCategories.features) {
  const f = manifestCategories.features;
  manifestCategories["settlements/village"]     = [f[0], f[1], f[2]].filter(Boolean);
  manifestCategories["settlements/castle"]      = [f[3], f[4], f[5]].filter(Boolean);
  manifestCategories["settlements/walled-city"] = [f[6], f[7], f[8]].filter(Boolean);
  manifestCategories["features/tower"]          = [f[9], f[10]].filter(Boolean);
  manifestCategories["features/ruin"]           = [f[11], f[12]].filter(Boolean);
  manifestCategories["features/lair"]           = [f[13], f[14]].filter(Boolean);
  manifestCategories["features/sanctuary"]      = [f[15], f[16]].filter(Boolean);
}

// Patterns
const extraAssets = join(SRC_ROOT, "Fantasy Map Builder - Map Effects", "Extra Assets");
const patternManifest = {};
for (const { file, name } of PATTERNS) {
  const src = join(extraAssets, file);
  if (!existsSync(src)) continue;
  const dst = join(OUT_ROOT, "patterns", `${name}.jpg`);
  console.log(`  pattern → ${name}`);
  resizeJpg(src, dst, 1024, 80);
  patternManifest[name] = `patterns/${name}.jpg`;
}

// Paper
const paperSrc = join(SRC_ROOT, "Fantasy Map Builder - Map Effects", "Paper Textures", "Paper 1.jpg");
if (existsSync(paperSrc)) {
  const dst = join(OUT_ROOT, "paper.jpg");
  console.log(`  paper → paper.jpg`);
  resizeJpg(paperSrc, dst, 2048, 80);
}

// Border (8x10 template has the right aspect for our viewport)
const borderSrc = join(SRC_ROOT, "Fantasy Map Builder - Map Effects", "Border Templates", "8x10 Border Template.png");
if (existsSync(borderSrc)) {
  const dst = join(OUT_ROOT, "border.png");
  console.log(`  border → border.png`);
  resizePng(borderSrc, dst, 2400);
}

// Manifest
const manifest = {
  paper: "paper.jpg",
  border: "border.png",
  patterns: patternManifest,
  categories: manifestCategories,
};
writeFileSync(join(OUT_ROOT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("  manifest.json written");

// README
const readme = `# Map Effects Runtime Assets (derived)

These files are downsampled derivatives of Map Effects' Fantasy Map Builder
and History Effects asset packs, produced by \`tools/build-mapeffects-assets.mjs\`.

- Originals live under \`resources/Dragon isles map painting/\` (gitignored).
- Originals are licensed for use but **not for redistribution**. Do not commit
  full-resolution copies of Map Effects files.
- These derived files are compressed and resampled so they are small enough
  to ship with the renderer. They should stay in sync with
  \`viewer/renderers/mapeffects.js\` and \`manifest.json\`.

## Stamp shape convention

\`symbols/{mountains,conifer,deciduous,vegetation,lakes,features}/shape-NN.png\`
are Procreate brush shape maps — 8-bit grayscale where **white = shape**,
**black = transparent**. The runtime converts them to alpha masks at load
time (see \`core-raster.js#loadStamp\`).

\`symbols/extra-egyptian/*.png\` and \`symbols/extra-mayan/*.png\` are the
History Effects PNGs (already transparent RGBA, kept as-is).

## Regenerating

\`\`\`sh
node tools/build-mapeffects-assets.mjs          # skip files that already exist
node tools/build-mapeffects-assets.mjs --force  # rebuild everything
\`\`\`

Dependencies: macOS (\`unzip\`, \`sips\`) — no npm install needed.
`;
writeFileSync(join(OUT_ROOT, "README.md"), readme);

console.log("Done.");
