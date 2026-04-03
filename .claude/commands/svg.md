Export SVG maps for the **$ARGUMENTS** campaign.

**Step 1: Ensure the web server is running.**

Start the web server in the background (kill any existing one on port 8787 first):

```sh
lsof -ti:8787 | xargs kill 2>/dev/null; cd maps && python3 -m http.server 8787 &
```

**Step 2: Export SVGs.**

Use Playwright to open each style in the unified viewer (`map.html`), wait for the map to render, then extract the SVG element and save to disk.

For each style, open the URL, wait 3 seconds, extract `document.querySelector('#map').outerHTML`, and write to disk:

- `http://localhost:8787/map.html?map=$ARGUMENTS&style=hexcrawl&grid=square` → `maps/$ARGUMENTS/$ARGUMENTS-grid.svg`
- `http://localhost:8787/map.html?map=$ARGUMENTS&style=hexcrawl&grid=hex` → `maps/$ARGUMENTS/$ARGUMENTS-hex.svg`
- `http://localhost:8787/map.html?map=$ARGUMENTS&style=moonletters&grid=none` → `maps/$ARGUMENTS/$ARGUMENTS-moonletters.svg`
- `http://localhost:8787/map.html?map=$ARGUMENTS&style=wilderland&grid=none` → `maps/$ARGUMENTS/$ARGUMENTS-wilderland.svg`
- `http://localhost:8787/map.html?map=$ARGUMENTS&style=thirdage&grid=none` → `maps/$ARGUMENTS/$ARGUMENTS-thirdage.svg`

**Step 3: Report.**

List the exported SVG files with their sizes.
