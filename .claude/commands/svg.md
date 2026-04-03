Export SVG maps for the **$ARGUMENTS** campaign.

**Step 1: Ensure the web server is running.**
Start the web server in the background (kill any existing one on port 8787 first):

```sh
lsof -ti:8787 | xargs kill 2>/dev/null; cd maps && python3 -m http.server 8787 &
```

**Step 2: Export SVGs.**
Use Playwright to open each of the four map styles in a headless browser, wait for the map to render, then extract the SVG and save it to the `maps/$ARGUMENTS/` directory (create it if it doesn't exist). The filename should be `{campaign}-{style}.svg`.

For each style, use the `exportSVG()` function built into the page — or extract the SVG element directly — and write the result to disk:

- `http://localhost:8787/original.html?map=$ARGUMENTS` → `maps/$ARGUMENTS/$ARGUMENTS-original.svg`
- `http://localhost:8787/treasuremap.html?map=$ARGUMENTS` → `maps/$ARGUMENTS/$ARGUMENTS-treasuremap.svg`
- `http://localhost:8787/wilderland.html?map=$ARGUMENTS` → `maps/$ARGUMENTS/$ARGUMENTS-wilderland.svg`
- `http://localhost:8787/world.html?map=$ARGUMENTS` → `maps/$ARGUMENTS/$ARGUMENTS-world.svg`

**Step 3: Report.**
List the exported SVG files with their sizes.
