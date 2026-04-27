#!/usr/bin/env python3
"""Build derived Map Effects runtime assets.

Extracts brush silhouettes from Procreate .brushset zips, copies/downsamples
patterns and paper, and writes a manifest under viewer/assets/mapeffects/.

Each brush Shape.png is a Procreate brush canvas (typically 2048×2048) with
the inked artwork in the center surrounded by transparent/white pixels. The
script trims to the artwork's content bbox FIRST, then resizes the trimmed
art to a sensible draw-time pixel size. This avoids the prior tool's
"resize then trim" order, which crushed small artwork during downsample.

Dependencies: Python 3 + Pillow (`python3 -m pip install Pillow`).
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import zipfile
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.stderr.write("Pillow not installed. Run: python3 -m pip install --user Pillow\n")
    sys.exit(1)

REPO = Path(__file__).resolve().parent.parent
SRC_ROOT = REPO / "resources" / "Dragon isles map painting"
OUT_ROOT = REPO / "viewer" / "assets" / "mapeffects"

# Per-category TARGET HEIGHT in pixels. Procreate brush Shape.png files
# don't carry meaningful relative size — the artist sizes them in the app.
# So we normalize: every stamp in a category is resized so its trimmed
# height equals the value below (preserving each stamp's aspect ratio).
# Width then varies naturally — a single tree stamp ends up narrow, a
# tree-cluster stamp ends up wide, but both are the same height. The runtime
# draws at scale=1.0 so all stamps in a category are visually consistent.
#
# Rough hierarchy: mountains (largest) > settlements > trees > vegetation.
TARGET_HEIGHT_DEFAULT = 80
TARGET_HEIGHT_PER_CATEGORY = {
    "mountains":      80,   # mountain peaks — tallest terrain feature
    "conifer":        32,   # single tree height
    "deciduous":      30,   # slightly shorter than conifers
    "vegetation":     16,   # grass tufts
    "features":       64,   # sea creatures / ships
    "lakes":          48,
    "terrain":        56,   # generic terrain features
    "general":        64,
    "medieval-icons": 56,   # single buildings — hut, tower
    "medieval":       72,   # multi-tower castles, slightly larger
    "viking":         64,   # Viking longhouses, fortified holds, stones
    "apprentice":     64,
    "coastliner":     64,
    "extra-egyptian": 40,
    "extra-mayan":    40,
}

# (relative path under SRC_ROOT, manifest category key, default anchor)
# Every Map Effects brushset that ships with the assets pack is enumerated
# here; the build extracts every Shape.png inside (skipping the Reset/
# subfolders Procreate uses for original-brush copies).
BRUSHSETS = [
    # Fantasy Map Builder pack (the core)
    ("Fantasy Map Builder - Map Effects/Brushes/Procreate/Mountains__Map_Builder.brushset",        "mountains",  (0.5, 0.9)),
    ("Fantasy Map Builder - Map Effects/Brushes/Procreate/Pine_Forest__Map_Builder.brushset",      "conifer",    (0.5, 0.9)),
    ("Fantasy Map Builder - Map Effects/Brushes/Procreate/Deciduous_Forest__Map_Builder.brushset", "deciduous",  (0.5, 0.9)),
    ("Fantasy Map Builder - Map Effects/Brushes/Procreate/Vegetation__Map_Builder_.brushset",      "vegetation", (0.5, 0.5)),
    ("Fantasy Map Builder - Map Effects/Brushes/Procreate/Features__Map_Builder.brushset",         "features",   (0.5, 0.5)),
    ("Fantasy Map Builder - Map Effects/Brushes/Procreate/Lakes__Map_Builder.brushset",            "lakes",      (0.5, 0.5)),
    ("Fantasy Map Builder - Map Effects/Brushes/Procreate/Terrain__Map_Builder.brushset",          "terrain",    (0.5, 0.5)),
    ("Fantasy Map Builder - Map Effects/Brushes/Procreate/Brushes__Map_Builder.brushset",          "general",    (0.5, 0.5)),
    # Add-on packs
    ("Apprentice Brushes - MapEffects.co/Brush Files/Procreate/Apprentice__MapEffects.brushset",   "apprentice", (0.5, 0.5)),
    ("Coastliner Brush/Brush File/Procreate/Coastliner_-_MapEffects.brushset",                     "coastliner", (0.5, 0.5)),
    # History Effects brushsets
    ("History Effects - Mapeffects.co/Viking Effects/Brushes/Procreate/Viking_Effects__Map_Effects_1.brushset", "viking",         (0.5, 0.5)),
    ("History Effects - Mapeffects.co/Medieval Effects/Brush Files/1. Procreate/Medieval_Effects__MapEffects.brushset", "medieval",       (0.5, 0.5)),
    ("History Effects - Mapeffects.co/Medieval Effects/Brush Files/Original Brush Files/Procreate/Medieval_Icons__MapEffects.brushset",   "medieval-icons", (0.5, 0.5)),
]

PATTERNS = [
    ("Seamless - Marsh.JPG",            "marsh"),
    ("Seamless - Grassland.JPG",        "grassland"),
    ("Seamless - Hatching.JPG",         "hatching"),
    ("Seamless - Rocky Terrain.JPG",    "rocky"),
    ("Seamless - Cracked Terrain.JPG",  "cracked"),
]


def ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True)


def shape_to_alpha(img: Image.Image) -> Image.Image:
    """Convert a Procreate Shape.png (typically 8-bit grayscale, no alpha,
    black-ink-on-white) into an RGBA stamp where black=opaque ink and
    white=transparent. If the source already has meaningful alpha, keep it.
    """
    if img.mode == "RGBA":
        # Already transparent — see if alpha is meaningful.
        alpha = img.getchannel("A")
        if alpha.getextrema()[0] < 250:
            return img
        # alpha is opaque-everywhere; fall through to luminance treatment.
        img = img.convert("L")
    elif img.mode != "L":
        img = img.convert("L")

    # Auto-detect convention: if the corners are bright, it's black-on-white
    # (the Map Effects convention) — invert so ink becomes alpha.
    w, h = img.size
    corners = [img.getpixel((0, 0)), img.getpixel((w - 1, 0)),
               img.getpixel((0, h - 1)), img.getpixel((w - 1, h - 1))]
    bright = sum(1 for c in corners if c > 200)
    invert = bright >= 3
    if invert:
        from PIL import ImageOps
        alpha = ImageOps.invert(img)
    else:
        alpha = img

    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    # RGB = black, A = grayscale ink intensity
    out.putalpha(alpha)
    return out


def trim_to_content(img: Image.Image, threshold: int = 12, pad: int = 4) -> Image.Image:
    """Crop an RGBA image to the bounding box of its non-transparent pixels."""
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    alpha = img.getchannel("A")
    bbox = alpha.point(lambda v: 255 if v > threshold else 0).getbbox()
    if not bbox:
        return img  # empty
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(img.width, x1 + pad)
    y1 = min(img.height, y1 + pad)
    return img.crop((x0, y0, x1, y1))


def resize_max_edge(img: Image.Image, max_edge: int) -> Image.Image:
    w, h = img.size
    if max(w, h) <= max_edge:
        return img
    if w >= h:
        nw, nh = max_edge, max(1, round(h * max_edge / w))
    else:
        nw, nh = max(1, round(w * max_edge / h)), max_edge
    return img.resize((nw, nh), Image.LANCZOS)


def resize_to_height(img: Image.Image, target_h: int, max_aspect: float = 5.0) -> Image.Image:
    """Resize so the height equals target_h, preserving aspect ratio.
    Clamps the resulting width to target_h * max_aspect to prevent
    extremely wide cluster brushes from blowing out across the canvas.
    Both upscale and downscale are allowed — every stamp in a category
    ends up at the same pixel height.
    """
    w, h = img.size
    if h == 0:
        return img
    nh = target_h
    nw = max(1, round(w * target_h / h))
    cap = round(target_h * max_aspect)
    if nw > cap:
        # Width-clamped — happens for very wide cluster brushes; scale them
        # down further so they don't dwarf single-stamp variants.
        nh = max(1, round(nh * cap / nw))
        nw = cap
    return img.resize((nw, nh), Image.LANCZOS)


def extract_brushset(brushset_path: Path, out_dir: Path, force: bool, target_h: int) -> list[str]:
    ensure_dir(out_dir)
    written: list[str] = []
    with zipfile.ZipFile(brushset_path) as zf:
        # Find Shape.png entries that are NOT under a "Reset/" subdir.
        shape_entries = sorted(
            n for n in zf.namelist()
            if n.endswith("/Shape.png") and "/Reset/" not in n
        )
        for idx, name in enumerate(shape_entries):
            n_str = f"{idx + 1:02d}"
            dst = out_dir / f"shape-{n_str}.png"
            if dst.exists() and not force:
                written.append(dst.name)
                continue
            with zf.open(name) as f:
                img = Image.open(f).copy()
            stamp = shape_to_alpha(img)
            stamp = trim_to_content(stamp)
            stamp = resize_to_height(stamp, target_h)
            stamp.save(dst, "PNG", optimize=True)
            written.append(dst.name)
    return written


def copy_fallback_pngs(src_dir: Path, out_dir: Path, force: bool, target_h: int) -> list[str]:
    if not src_dir.exists():
        return []
    ensure_dir(out_dir)
    pngs = sorted(p for p in src_dir.iterdir() if p.suffix.lower() == ".png")
    written: list[str] = []
    for idx, src in enumerate(pngs):
        n_str = f"{idx + 1:02d}"
        dst = out_dir / f"extra-{n_str}.png"
        if dst.exists() and not force:
            written.append(dst.name)
            continue
        img = Image.open(src).convert("RGBA")
        img = trim_to_content(img)
        img = resize_to_height(img, target_h)
        img.save(dst, "PNG", optimize=True)
        written.append(dst.name)
    return written


def resize_jpeg(src: Path, dst: Path, max_edge: int, quality: int = 80, force: bool = False):
    if dst.exists() and not force:
        return
    ensure_dir(dst.parent)
    img = Image.open(src).convert("RGB")
    img = resize_max_edge(img, max_edge)
    img.save(dst, "JPEG", quality=quality, optimize=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="rebuild outputs even if present")
    args = ap.parse_args()
    force = args.force

    print(f"Map Effects asset build → {OUT_ROOT}")
    ensure_dir(OUT_ROOT)

    cats: dict[str, list[dict]] = {}

    # Brushset stamps (every available Procreate brushset under SRC_ROOT)
    for rel_path, key, anchor in BRUSHSETS:
        bs = SRC_ROOT / rel_path
        if not bs.exists():
            print(f"  skip (missing): {rel_path}")
            continue
        out_dir = OUT_ROOT / "symbols" / key
        target_h = TARGET_HEIGHT_PER_CATEGORY.get(key, TARGET_HEIGHT_DEFAULT)
        files = extract_brushset(bs, out_dir, force, target_h)
        cats[key] = [
            {"src": f"symbols/{key}/{name}", "weight": 1.0, "anchor": list(anchor)}
            for name in files
        ]
        print(f"  brushset → {key} ({len(files)} stamps)")

    # Egyptian + Mayan already ship as transparent PNG fallbacks.
    for sub in ("Egyptian Effects", "Mayan Effects"):
        cat = "extra-" + sub.split()[0].lower()
        png_dir = SRC_ROOT / "History Effects - Mapeffects.co" / sub / "Brush Shapes" / "PNG"
        target_h = TARGET_HEIGHT_PER_CATEGORY.get(cat, TARGET_HEIGHT_DEFAULT)
        files = copy_fallback_pngs(png_dir, OUT_ROOT / "symbols" / cat, force, target_h)
        if files:
            cats[cat] = [
                {"src": f"symbols/{cat}/{name}", "weight": 1.0, "anchor": [0.5, 0.5]}
                for name in files
            ]
            print(f"  fallback → {cat} ({len(files)} stamps)")

    # Patterns
    extra_assets = SRC_ROOT / "Fantasy Map Builder - Map Effects" / "Extra Assets"
    pattern_manifest: dict[str, str] = {}
    for fname, key in PATTERNS:
        src = extra_assets / fname
        if not src.exists():
            continue
        dst = OUT_ROOT / "patterns" / f"{key}.jpg"
        resize_jpeg(src, dst, 1024, 80, force=force)
        pattern_manifest[key] = f"patterns/{key}.jpg"
        print(f"  pattern → {key}")

    # Paper
    paper_src = SRC_ROOT / "Fantasy Map Builder - Map Effects" / "Paper Textures" / "Paper 1.jpg"
    if paper_src.exists():
        resize_jpeg(paper_src, OUT_ROOT / "paper.jpg", 2048, 80, force=force)
        print("  paper → paper.jpg")

    # Border
    border_src = SRC_ROOT / "Fantasy Map Builder - Map Effects" / "Border Templates" / "8x10 Border Template.png"
    if border_src.exists():
        dst = OUT_ROOT / "border.png"
        if force or not dst.exists():
            ensure_dir(dst.parent)
            img = Image.open(border_src).convert("RGBA")
            img = resize_max_edge(img, 2400)
            img.save(dst, "PNG", optimize=True)
        print("  border → border.png")

    manifest = {
        "paper": "paper.jpg",
        "border": "border.png",
        "patterns": pattern_manifest,
        "categories": cats,
    }
    (OUT_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print("  manifest.json written")
    print("Done.")


if __name__ == "__main__":
    main()
