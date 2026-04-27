# Map Effects Runtime Assets (derived)

These files are downsampled derivatives of Map Effects' Fantasy Map Builder
and History Effects asset packs, produced by `tools/build-mapeffects-assets.mjs`.

- Originals live under `resources/Dragon isles map painting/` (gitignored).
- Originals are licensed for use but **not for redistribution**. Do not commit
  full-resolution copies of Map Effects files.
- These derived files are compressed and resampled so they are small enough
  to ship with the renderer. They should stay in sync with
  `viewer/renderers/mapeffects.js` and `manifest.json`.

## Stamp shape convention

`symbols/{mountains,conifer,deciduous,vegetation,lakes,features}/shape-NN.png`
are Procreate brush shape maps — 8-bit grayscale where **white = shape**,
**black = transparent**. The runtime converts them to alpha masks at load
time (see `core-raster.js#loadStamp`).

`symbols/extra-egyptian/*.png` and `symbols/extra-mayan/*.png` are the
History Effects PNGs (already transparent RGBA, kept as-is).

## Regenerating

```sh
node tools/build-mapeffects-assets.mjs          # skip files that already exist
node tools/build-mapeffects-assets.mjs --force  # rebuild everything
```

Dependencies: macOS (`unzip`, `sips`) — no npm install needed.
