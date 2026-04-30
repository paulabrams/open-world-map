#!/usr/bin/env python3
"""Extract per-brush metadata from Procreate .brushset archives.

Walks every brush in every brushset the asset builder consumes, reads the
Brush.archive plist (Apple binary property list), and emits structured
metadata that the inventory + renderer use to:

  - know each stamp's original artist-given name ("Mountain Range 2")
  - auto-classify into an archetype ("mountain-range", "small-hill", "marsh",
    "village", "compass", "coastline", …)
  - tag each brush with a `use` (stamp | overlay | decoration | path | pattern)
    so the renderer can cleanly separate placeable stamps from cartouche /
    border / coastline / pattern art
  - suggest a target render height per archetype (painted-scale pixels), then
    nudge it up or down per-brush by the original Shape.png file size relative
    to the archetype median (file size is a strong proxy for visual scale)

Output: viewer/assets/mapeffects/brush-metadata.json
Schema (per src):
  {
    "category": "mountains",        # manifest category (from brushset source)
    "guid": "913D...",              # source GUID
    "brush_name": "Mountains 12",   # artist-given
    "archetype": "mountain",        # auto-classified
    "use": "stamp",                 # how the renderer should consume it
    "suggested_height_px": 102,     # final size, archetype base * size factor
    "size_factor": 0.93,            # multiplier vs archetype median (range ~0.7–1.4)
    "file_kb": 78,
    "paint_size": 0.291,
    "max_size": 16.0
  }
"""
import json
import math
import plistlib
import re
import shutil
import statistics
import subprocess
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC_ROOT = REPO / "resources" / "mapeffects"
OUT_PATH = REPO / "viewer" / "assets" / "mapeffects" / "brush-metadata.json"

FMB = "Fantasy Map Builder - Map Effects/Brushes/Procreate"
HEFF = "History Effects - Mapeffects.co"
BRUSH_TO_CAT = [
    (f"{FMB}/Mountains__Map_Builder.brushset",        "mountains",  999),
    (f"{FMB}/Pine_Forest__Map_Builder.brushset",      "conifer",    999),
    (f"{FMB}/Deciduous_Forest__Map_Builder.brushset", "deciduous",  999),
    (f"{FMB}/Vegetation__Map_Builder_.brushset",      "vegetation", 999),
    (f"{FMB}/Features__Map_Builder.brushset",         "features",   999),
    (f"{FMB}/Lakes__Map_Builder.brushset",            "lakes",      999),
    (f"{FMB}/Terrain__Map_Builder.brushset",          "terrain",    999),
    (f"{FMB}/Brushes__Map_Builder.brushset",          "general",    999),
    (f"{HEFF}/Viking Effects/Brushes/Procreate/Viking_Effects__Map_Effects_1.brushset", "viking",   999),
    (f"{HEFF}/Medieval Effects/Brush Files/1. Procreate/Medieval_Effects__MapEffects.brushset", "medieval", 999),
]

# Archetype patterns. Each row is (regex, archetype, base_height_px, use).
# Order matters — first match wins. Heights are in painted-scale pixels
# (PAINTED_SCALE = 200, so 1 in = 200 px). `use` controls how the renderer
# consumes the stamp: "stamp" placed at hex/node, "overlay" drawn on top of
# a primary, "decoration" map-edge ornament, "path" a stroke brush, "pattern"
# a seamless tile.
# Global scale for every archetype's base height. The PATTERNS table holds
# the *original* spec targets (painted-scale px, PAINTED_SCALE = 200). The
# extractor multiplies every base by GLOBAL_SCALE before writing the
# manifest. Adjust here when the overall stamp size on the rendered map
# looks too big or too small. 0.5 corresponds to "looks 200% too large".
GLOBAL_SCALE = 0.5

PATTERNS: list[tuple[str, str, int | None, str]] = [
    # ─── overlays / decoration / patterns ────────────────────────────────────
    (r"\|\s*Smoke",                         "smoke-overlay",      None, "overlay"),
    (r"\|\s*Tops",                          "treetops-overlay",   None, "overlay"),
    (r"\|\s*Seamless",                      "seamless-tile",      None, "pattern"),
    (r"^Compass\b",                         "compass",            None, "decoration"),
    (r"^Banner\b",                          "banner",             None, "decoration"),
    (r"^Scale\b",                           "scale-bar",          None, "decoration"),
    (r"^Border\s*Corner",                   "border-corner",      None, "decoration"),
    (r"Weave\s*Border",                     "weave-border",       None, "decoration"),
    (r"Weave\s*Corner",                     "weave-corner",       None, "decoration"),
    (r"Hex\s*Grid",                         "grid-hex",           None, "overlay"),
    (r"Square\s*Grid",                      "grid-square",        None, "overlay"),
    (r"Navigation\s*Rhumb",                 "rhumb-lines",        None, "decoration"),
    (r"Gritty\s*Shader|Blotchy",            "shader",             None, "overlay"),
    # ─── path strokes (rivers / roads / coastlines) ──────────────────────────
    (r"^River\b",                           "river",              None, "path"),
    (r"^Coastline\b|Excavation",            "coastline",          None, "path"),
    (r"^Dot\s*Path|^Dash\s*Path",           "trail",              None, "path"),
    (r"Ocean\s*Hatching",                   "ocean-hatching",     None, "path"),
    # ─── mountains ───────────────────────────────────────────────────────────
    (r"Mountain\s*Range",                   "mountain-range",     160,  "stamp"),
    (r"Mountain\s*Lake",                    "lake-mountain",      90,   "stamp"),
    (r"Volcano",                            "volcano",            120,  "stamp"),
    (r"Caldera",                            "caldera",            120,  "stamp"),
    (r"\bHills?\b",                         "small-hill",         55,   "stamp"),
    (r"\bMountains?\b|Mountain\s*\d",       "mountain",           110,  "stamp"),
    # ─── trees ───────────────────────────────────────────────────────────────
    (r"Forest",                             "tree-clump",         55,   "stamp"),
    (r"Conifer|Pine|Spruce|Fir",            "conifer-single",     32,   "stamp"),
    (r"Deciduous|Oak|Elm|Birch|Maple",      "deciduous-single",   32,   "stamp"),
    (r"Sapling|Young\s*Tree",               "tree-sapling",       22,   "stamp"),
    (r"Sacred\s*Tree",                      "sacred-tree",        32,   "stamp"),
    (r"\bTree\b",                           "tree-single",        32,   "stamp"),
    # ─── vegetation ──────────────────────────────────────────────────────────
    (r"Marsh",                              "marsh",              28,   "stamp"),
    (r"Cattail",                            "cattail",            18,   "stamp"),
    (r"Cacti|Cactus",                       "cactus",             24,   "stamp"),
    (r"Farm",                               "farm",               26,   "stamp"),
    (r"Thorns",                             "thorns",             18,   "stamp"),
    (r"Desert\s*Scrub",                     "desert-scrub",       40,   "stamp"),
    (r"Grass|Reed|Sedge|Fern",              "vegetation-grass",   14,   "stamp"),
    (r"Bush|Shrub|Thicket",                 "vegetation-shrub",   18,   "stamp"),
    (r"Flower|Bloom",                       "vegetation-flower",  14,   "stamp"),
    # ─── settlements / structures ────────────────────────────────────────────
    (r"Walled\s*City|Capital",              "walled-city",        90,   "stamp"),
    (r"\bCity\b",                           "city",               80,   "stamp"),
    (r"Stronghold",                         "stronghold",         80,   "stamp"),
    (r"Castle|Fortress|Keep|Citadel",       "castle",             75,   "stamp"),
    (r"Village|Town|Hamlet|Settlement",     "village",            50,   "stamp"),
    (r"\bTower\b|Watchtower|Beacon",        "tower",              55,   "stamp"),
    (r"Ruin|Crumble",                       "ruin",               50,   "stamp"),
    (r"Sanctuary|Temple|Shrine|Church|Cathedral", "sanctuary",    55,   "stamp"),
    (r"Cave|Lair|Den",                      "lair",               50,   "stamp"),
    (r"Bridge|Crossing",                    "bridge",             40,   "stamp"),
    (r"Ship|Boat|Galleon|Cog",              "ship",               40,   "stamp"),
    (r"Sea\s*Monster|Kraken|Wyrm|Serpent|Mentiri", "sea-monster", 50,   "stamp"),
    (r"Tentacles?",                         "tentacles",          50,   "stamp"),
    (r"Whirlpool|Maelstrom",                "whirlpool",          60,   "stamp"),
    (r"Dragon",                             "dragon",             60,   "stamp"),
    (r"Skull|Bone",                         "ominous-marker",     35,   "stamp"),
    (r"Portal|Gate",                        "portal",             45,   "stamp"),
    # ─── terrain features ────────────────────────────────────────────────────
    (r"Floating\s*Island",                  "floating-island",    90,   "stamp"),
    (r"Canyon",                             "canyon",             80,   "stamp"),
    (r"Dune",                               "dune",               40,   "stamp"),
    (r"Mesa",                               "mesa",               55,   "stamp"),
    (r"Cliff",                              "cliff",              60,   "stamp"),
    (r"Pointed\s*Rock",                     "pointed-rock",       45,   "stamp"),
    (r"Rock\s*Formation",                   "rock-formation",     45,   "stamp"),
    (r"Crater",                             "crater",             50,   "stamp"),
    (r"Crevasse",                           "crevasse",           50,   "stamp"),
    (r"\bRock\b",                           "rock-small",         28,   "stamp"),
    # ─── water ───────────────────────────────────────────────────────────────
    (r"\bLake\b|Pond",                      "lake",               60,   "stamp"),
    (r"Waterfall",                          "waterfall",          50,   "stamp"),
    (r"Estuary|River\s*Mouth",              "estuary",            60,   "stamp"),
]


def deref(objs, v):
    if isinstance(v, plistlib.UID):
        return objs[int(v)]
    if isinstance(v, dict) and "CF$UID" in v:
        return objs[int(v["CF$UID"])]
    return v


def read_brush_archive(path: Path) -> dict:
    with open(path, "rb") as f:
        plist = plistlib.load(f)
    objs = plist["$objects"]
    root = objs[1]
    out: dict = {}
    for k in ("paintSize", "maxSize", "minSize", "plotSpacing"):
        v = root.get(k)
        if isinstance(v, (int, float)):
            out[k] = round(float(v), 4)
    nm = deref(objs, root.get("name"))
    out["name"] = str(nm).strip() if isinstance(nm, str) else None
    return out


def classify(name: str | None) -> tuple[str, int | None, str]:
    if not name:
        return "unknown", None, "stamp"
    for pat, archetype, height, use in PATTERNS:
        if re.search(pat, name, re.I):
            return archetype, height, use
    return "unknown", None, "stamp"


def extract_brushset(brushset_path: Path, category: str, max_n: int) -> list[dict]:
    if not brushset_path.exists():
        print(f"  skip (missing): {brushset_path}")
        return []
    tmp = Path(tempfile.mkdtemp(prefix="brushmeta-"))
    try:
        subprocess.run(
            ["unzip", "-q", "-o", str(brushset_path), "-d", str(tmp)],
            check=True,
        )
        guids = sorted(d.name for d in tmp.iterdir() if d.is_dir())
        rows: list[dict] = []
        for i, guid in enumerate(guids[:max_n]):
            shape_path = tmp / guid / "Shape.png"
            archive_path = tmp / guid / "Brush.archive"
            if not (shape_path.exists() and archive_path.exists()):
                continue
            try:
                meta = read_brush_archive(archive_path)
            except Exception as exc:
                meta = {"name": None, "_error": str(exc)}
            archetype, base_h, use = classify(meta.get("name"))
            file_kb = round(shape_path.stat().st_size / 1024)
            rows.append({
                "src": f"symbols/{category}/shape-{i+1:02d}.png",
                "category": category,
                "guid": guid,
                "brush_name": meta.get("name"),
                "archetype": archetype,
                "use": use,
                "_base_h": base_h,
                "file_kb": file_kb,
                "paint_size": meta.get("paintSize"),
                "max_size": meta.get("maxSize"),
            })
        return rows
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def detect_tiling(rows: list[dict]) -> None:
    """Tag stamps with a tiling/pairing hint so the inventory + renderer can
    surface relationships the artist baked into the names.

    Conventions found in the Map Effects naming scheme:
      "Volcano 3 | Smoke"        → overlay on top of "Volcano 3"
      "Forest 18 | Tops"         → overlay on top of "Forest 18"
      "Coastline Double | Reverse" → mirrored partner of "Coastline Double"
      "Mountain Range 1/2/3"     → pre-composed ranges (use whole, not tiled)

    Sets `tiling_role`:
      "primary"        — the base stamp in a pair (has a partner with a |suffix)
      "overlay-partner" — partner overlay (smoke/tops)
      "mirror-partner" — | Reverse partner
      "composed-range" — pre-composed range, treat as a single drop
      "single"         — standalone stamp, no known pairing (default)
    And sets `tiling_partner_name` to the partner's brush name when known.
    """
    name_to_row = {}
    for r in rows:
        nm = r.get("brush_name")
        if nm:
            name_to_row[nm] = r

    for r in rows:
        nm = r.get("brush_name") or ""
        role = "single"
        partner = None

        if "|" in nm:
            base, suffix = (s.strip() for s in nm.split("|", 1))
            sl = suffix.lower()
            if "smoke" in sl or "tops" in sl:
                role = "overlay-partner"
                partner = base if base in name_to_row else None
            elif "reverse" in sl:
                role = "mirror-partner"
                partner = base if base in name_to_row else None
            elif "seamless" in sl:
                role = "single"  # seamless tiles aren't paired stamps
        elif re.match(r"^Mountain\s*Range\b", nm, re.I):
            role = "composed-range"
        else:
            # Look for an overlay partner pointing at us
            for suffix in ("Smoke", "Tops"):
                if f"{nm} | {suffix}" in name_to_row:
                    role = "primary"
                    partner = f"{nm} | {suffix}"
                    break
            if role == "single":
                if f"{nm} | Reverse" in name_to_row:
                    role = "primary"
                    partner = f"{nm} | Reverse"

        r["tiling_role"] = role
        if partner:
            r["tiling_partner_name"] = partner


# Source-to-canvas scale per archetype. The trimmed PNG height is the
# artist's source-canvas height of the ink (after our build-time trim);
# multiplying it by this scale gives the on-canvas render height.
#
# Calibration: pick the scale so a *typical* stamp in the archetype renders
# at the spec target height (post-GLOBAL_SCALE). E.g. mountain typical
# trimmed_h ≈ 200 px, target ≈ 55 px → scale 0.275.
#
# Single-tree stamps then naturally render small (trimmed_h ≈ 80 px → 24 px),
# clump stamps naturally render larger (trimmed_h ≈ 250 px → 75 px), with
# every tree-inside-clump appearing at the same world size as a single tree.
ARCHETYPE_SCALE = {
    # mountains family
    "mountain":           0.27,
    "small-hill":         0.32,
    "volcano":            0.27,
    "caldera":            0.27,
    "mountain-range":     0.18,
    "lake-mountain":      0.27,
    # trees: every tree-inside-stamp aims for ~14 canvas px tall.
    "tree-clump":         0.16,
    "conifer-single":     0.16,
    "deciduous-single":   0.16,
    "tree-single":        0.16,
    "tree-sapling":       0.16,
    "treetops-overlay":   0.16,
    # vegetation: smaller — typical tuft trimmed_h ~80, target ~10 px.
    "vegetation-grass":   0.024,  # ÷5 — grass tufts were rendering far too large
    "vegetation-shrub":   0.14,
    "vegetation-flower":  0.12,
    "marsh":              0.16,
    "cattail":            0.14,
    "cactus":             0.18,
    "farm":               0.18,
    "thorns":             0.14,
    "desert-scrub":       0.18,
    # settlements / structures
    "walled-city":        0.32,
    "city":               0.30,
    "stronghold":         0.30,
    "castle":             0.28,
    "village":            0.24,
    "tower":              0.26,
    "ruin":               0.22,
    "sanctuary":          0.24,
    "lair":               0.22,
    "bridge":             0.22,
    "ship":               0.22,
    "sea-monster":        0.24,
    "tentacles":          0.24,
    "whirlpool":          0.26,
    "dragon":             0.26,
    "ominous-marker":     0.20,
    "portal":             0.22,
    # terrain features
    "floating-island":    0.30,
    "canyon":             0.28,
    "dune":               0.20,
    "mesa":               0.24,
    "cliff":              0.24,
    "pointed-rock":       0.20,
    "rock-formation":     0.20,
    "crater":             0.22,
    "crevasse":           0.22,
    "rock-small":         0.16,
    # water
    "lake":               0.24,
    "waterfall":          0.22,
    "estuary":            0.24,
}
DEFAULT_ARCHETYPE_SCALE = 0.20


def read_trimmed_dims(src_relpath: str):
    """Return (w, h) of the already-built trimmed PNG, or None if missing."""
    p = OUT_PATH.parent / src_relpath
    if not p.exists():
        return None
    try:
        from PIL import Image
        with Image.open(p) as im:
            return im.size
    except Exception:
        return None


def count_skyline_peaks(src_relpath: str, threshold: int = 24):
    """Detect the number of peaks in the top silhouette of a stamp.

    For mountain/hill stamps the silhouette is a single connected blob
    (peaks share a baseline) so connected-components is useless for counting.
    Instead, walk the top edge per column to build a 1-D height profile,
    smooth it lightly, and count local maxima (skyline summits) with a
    prominence filter so noise/saddles don't get mistaken for peaks.

    Returns (peak_count, trimmed_w_inked) — peak_count ≥ 1 when the stamp
    has any ink. trimmed_w_inked is the horizontal span containing ink,
    which is what should be divided by peak_count to get per-peak width.
    """
    p = OUT_PATH.parent / src_relpath
    if not p.exists():
        return 0, 0
    try:
        from PIL import Image
        im = Image.open(p).convert("RGBA")
    except Exception:
        return 0, 0
    w, h = im.size
    a = im.split()[-1].load()

    # Top-edge profile: smallest y per column where alpha ≥ threshold.
    # h means "no ink in this column".
    profile = [h] * w
    for x in range(w):
        col = profile
        for y in range(h):
            if a[x, y] >= threshold:
                col[x] = y
                break

    # Identify the inked horizontal span.
    inked_xs = [x for x in range(w) if profile[x] < h]
    if not inked_xs:
        return 0, 0
    x_lo, x_hi = inked_xs[0], inked_xs[-1]
    span_w = x_hi - x_lo + 1

    # Smooth profile with a small box filter so single-pixel noise doesn't
    # produce phantom peaks.
    radius = max(1, span_w // 60)
    smooth = [h] * w
    for x in range(x_lo, x_hi + 1):
        s = 0; n = 0
        for xn in range(max(x_lo, x - radius), min(x_hi + 1, x + radius + 1)):
            if profile[xn] < h:
                s += profile[xn]; n += 1
        smooth[x] = s / n if n else h

    # Find local minima in y (high points in the silhouette). Apply a
    # prominence filter: a peak is only counted if the silhouette rises by
    # at least min_prom from a neighbouring valley to that peak.
    silhouette_ys = [smooth[x] for x in range(x_lo, x_hi + 1) if smooth[x] < h]
    if not silhouette_ys:
        return 0, 0
    profile_range = max(silhouette_ys) - min(silhouette_ys)
    # Prominence: peak must rise at least this many pixels above adjacent
    # valley to count. Lower threshold catches the subtle saddle dips
    # between adjacent peaks in a tightly-packed ridge (Hills 2 etc.).
    min_prom = max(3, profile_range * 0.08)

    peaks = []
    last_valley_y = None
    rising = False
    pending_peak = None
    for x in range(x_lo, x_hi + 1):
        y = smooth[x]
        if y >= h:
            continue
        if pending_peak is None:
            pending_peak = (x, y)
            last_valley_y = y
            continue
        if y < pending_peak[1]:  # higher in silhouette
            pending_peak = (x, y)
            rising = True
        elif y > pending_peak[1]:  # descending after a peak
            if rising:
                # End of an upward run → confirm peak if prominent.
                valley_y = last_valley_y if last_valley_y is not None else y
                if valley_y - pending_peak[1] >= min_prom:
                    peaks.append(pending_peak)
                last_valley_y = y
                rising = False
            else:
                # In a valley — track lowest valley reached.
                if last_valley_y is None or y > last_valley_y:
                    last_valley_y = y
            pending_peak = (x, y)
    # Tail: if we ended on a rising run, count its peak.
    if rising and pending_peak is not None:
        valley_y = last_valley_y if last_valley_y is not None else pending_peak[1]
        if valley_y - pending_peak[1] >= min_prom:
            peaks.append(pending_peak)

    return max(1, len(peaks)), span_w


def measure_blobs(src_relpath: str, threshold: int = 24, min_pixels: int = 30):
    """Return list of (height, width, area) tuples for connected ink blobs.

    Used by tree stamps to find "one tree's source-pixel height." The artist's
    different brushes draw trees at different source sizes — densely-packed
    clumps may use 10 px trees, single-tree stamps may use 200 px trees.
    Without per-brush detection, no single shared scale produces consistent
    on-canvas tree sizes. Counting the separate ink blobs and taking the
    median blob height gives "typical tree height in this particular brush."

    Pure Python iterative BFS — no scipy dependency. ~5 ms per 256×256 image,
    totalling ~2 s across the full ~340 stamps.
    """
    p = OUT_PATH.parent / src_relpath
    if not p.exists():
        return []
    try:
        from PIL import Image
        im = Image.open(p).convert("RGBA")
    except Exception:
        return []
    w, h = im.size
    a = im.split()[-1].load()
    visited = bytearray(w * h)
    blobs = []
    for y0 in range(h):
        for x0 in range(w):
            idx0 = y0 * w + x0
            if visited[idx0] or a[x0, y0] < threshold:
                continue
            stack = [(x0, y0)]
            visited[idx0] = 1
            mnx = mxx = x0
            mny = mxy = y0
            area = 0
            while stack:
                x, y = stack.pop()
                area += 1
                if x < mnx: mnx = x
                if x > mxx: mxx = x
                if y < mny: mny = y
                if y > mxy: mxy = y
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        ni = ny * w + nx
                        if not visited[ni] and a[nx, ny] >= threshold:
                            visited[ni] = 1
                            stack.append((nx, ny))
            if area >= min_pixels:
                blobs.append((mxy - mny + 1, mxx - mnx + 1, area))
    return blobs


# Per-blob target heights for TREE archetypes. Trees vary wildly in source-
# pixel size between brushes (single-tree might be 200 px, clump-tree might
# be 30 px), so blob detection per brush is essential to normalise.
TREE_BLOB_TARGET_PX = {
    "tree-clump":          14,
    "conifer-single":      14,
    "deciduous-single":    14,
    "tree-single":         14,
    "tree-sapling":        10,
    "treetops-overlay":    14,
    "sacred-tree":         21,   # +50% — single iconic feature stamp
}

# Category-level override applied on top of the archetype target. The
# Map Effects pack draws conifers as tall narrow silhouettes and deciduous
# trees as shorter rounder shapes — at equal canvas height, conifers read
# as thinner / smaller. Boosting conifer's per-tree target equalises the
# visual mass.
TREE_TARGET_BY_CATEGORY = {
    "conifer":   18,
    "deciduous": 14,
}

# Per-archetype source-to-canvas scale for MOUNTAIN archetypes. Hills and
# mountains aren't blob-normalised because each silhouette is one connected
# blob (peaks share a baseline) and the artist drew internal hills/peaks at
# consistent source sizes across brushes. A shared scale per archetype keeps
# a single hill the same size as one hill in a multi-hill ridge.
MOUNTAIN_SCALE = {
    "small-hill":          0.11,   # short, gentle (~30% smaller than mountains)
    "mountain":            0.36,   # full peaks
    "volcano":             0.34,   # taller than ordinary peak (smoke column)
    "caldera":             0.30,
    "mountain-range":      0.36,   # multiple peaks composed
    "lake-mountain":       0.30,
}
# Cap for single-peak mountain stamps. A few outlier brushes (e.g.
# "Mountains 18" shape-20, "Volcano 2" shape-50) have trimmed heights
# nearly 2x the typical peak; multiplying through the archetype scale
# made them render 4–5× too large on the map. Cap clamps those outliers
# without affecting the well-behaved majority.
MOUNTAIN_MAX_HEIGHT_PX = 50

# Per-peak target *width* in canvas pixels — used for multi-peak stamps so
# each individual peak in a ridge ends up the same canvas width as a single
# peak from a lone-peak brush. Single-peak stamps just use MOUNTAIN_SCALE
# above; multi-peak stamps get scaled by inked_w / peak_count to hit this
# target per peak instead.
MOUNTAIN_PEAK_WIDTH_TARGET = {
    "small-hill":          18,
    "mountain":            34,
    "volcano":             34,
    "caldera":             32,
    "mountain-range":      30,
    "lake-mountain":       32,
}

TREE_ARCHETYPES = {
    "tree-clump", "conifer-single", "deciduous-single",
    "tree-single", "tree-sapling", "treetops-overlay", "sacred-tree",
}
MOUNTAIN_ARCHETYPES = {
    "mountain", "small-hill", "volcano", "caldera",
    "mountain-range", "lake-mountain",
}
# Archetypes whose brushes often contain multiple distinct instances of the
# same feature (a dune brush draws several dune ridges, a marsh brush draws
# several marsh tufts, a rock-formation draws a cluster of rocks). These get
# blob-detection so we can auto-promote multi-instance brushes to
# composed-range. Single-feature archetypes (castle, lake, dragon, etc.) are
# deliberately excluded — one of them is just one of them.
MULTI_INSTANCE_ARCHETYPES = {
    # terrain
    "dune", "mesa", "cliff", "pointed-rock", "rock-formation",
    "rock-small", "crevasse", "crater",
    # vegetation
    "marsh", "cactus", "farm", "thorns", "cattail", "desert-scrub",
    "vegetation-grass", "vegetation-shrub", "vegetation-flower",
}
# Per-archetype blob-count threshold for composed-range promotion.
# Lower numbers tag more brushes as composed-range.
COMPOSED_RANGE_THRESHOLD = {
    "tree-clump": 5,
    "conifer-single": 5,
    "deciduous-single": 5,
    "tree-single": 5,
    "marsh": 4,           # marsh brushes usually have 5–10 reed tufts
    "vegetation-grass": 4,
    "thorns": 4,
    "farm": 3,            # farm rows are 3+ furrows
    "cactus": 3,
    "cattail": 3,
    "dune": 3,            # dune brushes draw 3+ ridges
    "rock-small": 3,
    "rock-formation": 3,
    "pointed-rock": 3,
    # mountains/hills use peak count instead — handled separately.
}
COMPOSED_RANGE_DEFAULT_THRESHOLD = 3


def classify_aspect_class(w: int, h: int) -> str:
    if not w or not h:
        return "single"
    aspect = w / h
    if aspect < 0.7:
        return "single"
    if aspect < 1.0:
        return "small-cluster"
    return "clump"


def apply_size_factor(rows: list[dict]) -> None:
    """Set suggested_height_px from each stamp's actual trimmed dimensions.

    Two paths:

    1. Tree archetypes — use the trimmed aspect ratio to classify each stamp
       as single / small-cluster / clump and target a fixed canvas height
       per class. This makes a single tree match a tree-inside-clump because
       the clump is rendered taller in proportion to its multiple trees,
       not because each clump-tree is rendered larger.

    2. Non-tree archetypes — render at trimmed_h × per-archetype scale.
       Single mountains naturally render small, mountain-range stamps
       naturally render large, with the same "1 source px → N canvas px"
       relationship throughout.
    """
    # First pass: read every stamp's trimmed dimensions, classify aspect.
    # Trees → connected-components for median blob height (per-brush
    # normalisation). Mountains/hills → skyline peak detection (their
    # silhouettes are one connected blob anyway, but the top-edge profile
    # reveals how many peaks the artist drew).
    for r in rows:
        dims = read_trimmed_dims(r["src"])
        if not dims:
            continue
        tw, th = dims
        r["trimmed_w"] = tw
        r["trimmed_h"] = th
        r["aspect_class"] = classify_aspect_class(tw, th)
        arch = r.get("archetype")
        use = r.get("use")
        if (arch in TREE_ARCHETYPES or arch in MULTI_INSTANCE_ARCHETYPES) and use == "stamp":
            blobs = measure_blobs(r["src"])
            if blobs:
                largest_area = max(b[2] for b in blobs)
                heights = [b[0] for b in blobs if b[2] >= largest_area * 0.25]
                if heights:
                    r["blob_count"] = len(heights)
                    r["blob_median_h"] = int(statistics.median(heights))
        if arch in MOUNTAIN_ARCHETYPES and use == "stamp":
            peak_count, span_w = count_skyline_peaks(r["src"])
            if peak_count:
                r["peak_count"] = peak_count
                r["inked_w"] = span_w

    # Auto-promote to composed-range when a stamp's silhouette shows the
    # artist drew multiple distinct instances of the feature as a single
    # composed scene. These are meant to be dropped as a unit, not used as
    # random scatter.
    #
    # Important caveat for mountains: a single mountain stamp may show 2–3
    # peaks (foothills in profile), but it's still ONE mountain meant to be
    # dropped as random scatter. Only `small-hill` gets peak-count auto-
    # promotion — hills are drawn as groups of small humps, so 2+ peaks IS
    # a composed scene. Other mountain archetypes rely on name-only
    # detection (Mountain Range stamps).
    for r in rows:
        if r.get("tiling_role") == "composed-range":
            continue  # already tagged by name pattern
        arch = r.get("archetype") or "unknown"
        if arch == "small-hill" and (r.get("peak_count") or 0) >= 2:
            r["tiling_role"] = "composed-range"
        elif arch in TREE_ARCHETYPES or arch in MULTI_INSTANCE_ARCHETYPES:
            threshold = COMPOSED_RANGE_THRESHOLD.get(arch, COMPOSED_RANGE_DEFAULT_THRESHOLD)
            if (r.get("blob_count") or 0) >= threshold:
                r["tiling_role"] = "composed-range"

    for r in rows:
        arch = r.get("archetype") or "unknown"
        if r.get("use") in ("decoration", "path", "pattern"):
            r["suggested_height_px"] = None
            r["size_factor"] = None
            r.pop("_base_h", None)
            continue
        th = r.get("trimmed_h")
        if th:
            if arch in TREE_ARCHETYPES:
                # Per-brush blob normalisation. TARGET / median_blob_h so each
                # tree-internal lands at the same on-canvas size whether
                # standalone or part of a clump. Per-category override
                # (conifer/deciduous) compensates for the artist drawing
                # conifers tall-narrow and deciduous shorter-rounder.
                target = (TREE_TARGET_BY_CATEGORY.get(r.get("category"))
                          or TREE_BLOB_TARGET_PX.get(arch, 14))
                blob_h = r.get("blob_median_h") or th
                scale = target / blob_h
                r["suggested_height_px"] = max(6, round(th * scale))
                r["size_factor"] = round(scale, 4)
            elif arch in MOUNTAIN_ARCHETYPES:
                # Two paths:
                #   single-peak stamps → render at trimmed_h × archetype scale
                #   multi-peak stamps  → scale so each peak's source-width
                #     matches MOUNTAIN_PEAK_WIDTH_TARGET on canvas
                # This makes a single hill the same size as one hill in a
                # multi-hill ridge, even when the artist drew the singles
                # at much wider source-pixel widths than the grouped peaks.
                pc = r.get("peak_count") or 1
                if pc >= 2 and r.get("inked_w"):
                    target_w = MOUNTAIN_PEAK_WIDTH_TARGET.get(arch, 30)
                    per_peak_src_w = r["inked_w"] / pc
                    scale = target_w / per_peak_src_w
                else:
                    scale = MOUNTAIN_SCALE.get(arch, 0.28)
                # Cap single-peak mountain stamps so outlier brushes with
                # exceptionally tall trimmed_h don't render giant.
                r["suggested_height_px"] = max(6, min(MOUNTAIN_MAX_HEIGHT_PX, round(th * scale)))
                r["size_factor"] = round(scale, 4)
            else:
                scale = ARCHETYPE_SCALE.get(arch, DEFAULT_ARCHETYPE_SCALE) * GLOBAL_SCALE
                r["suggested_height_px"] = max(6, round(th * scale))
                r["size_factor"] = round(scale, 4)
        else:
            base = r.get("_base_h")
            r["suggested_height_px"] = max(6, round(base * GLOBAL_SCALE)) if base else None
            r["size_factor"] = None
        r.pop("_base_h", None)


def main() -> None:
    out: dict[str, dict] = {}
    rows: list[dict] = []
    for relpath, category, max_n in BRUSH_TO_CAT:
        cat_rows = extract_brushset(SRC_ROOT / relpath, category, max_n)
        rows.extend(cat_rows)

    detect_tiling(rows)
    apply_size_factor(rows)

    for r in rows:
        out[r["src"]] = {k: v for k, v in r.items() if k != "src"}

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(out, f, indent=2)
    print(f"Wrote {OUT_PATH} ({len(out)} entries)")

    # Summary
    by_cat_arch: dict = {}
    use_counts: dict = {}
    for r in rows:
        by_cat_arch.setdefault(r["category"], {}).setdefault(r["archetype"], 0)
        by_cat_arch[r["category"]][r["archetype"]] += 1
        use_counts[r["use"]] = use_counts.get(r["use"], 0) + 1
    print("\nArchetype counts by category:")
    for cat, counts in by_cat_arch.items():
        print(f"  {cat}:")
        for arch, n in sorted(counts.items(), key=lambda x: -x[1]):
            print(f"    {arch}: {n}")
    print(f"\nUse counts: {use_counts}")


if __name__ == "__main__":
    main()
