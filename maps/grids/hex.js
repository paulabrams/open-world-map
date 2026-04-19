window.MapGrids = window.MapGrids || {};

window.MapGrids.hex = {
  name: "Hex",
  render(ctx) {
    const { WIDTH, HEIGHT, HINT_SCALE, nodes } = ctx;
    const gridGroup = ctx.g.append("g").attr("class", "hex-grid");
    const bcNode = nodes.find(n => n.id === "blackwater-crossing");
    const originX = bcNode ? bcNode.x : WIDTH / 2;
    const originY = bcNode ? bcNode.y : HEIGHT / 2;

    // Hex geometry: flat-top, 1 inch = 6 miles per hex
    const size = HINT_SCALE / 2;
    const hexW = size * 2;
    const hexH = size * Math.sqrt(3);
    const colStep = hexW * 0.75;
    const rowStep = hexH;

    // BC is at hex 1010 (column 10, row 10)
    const bcCol = 10;
    const bcRow = 10;

    // Very soft baseline outline — the darker outline only appears on mouse
    // over (see renderHexHover in core.js). BC and content hexes are NOT
    // distinguished by stroke weight here — all hexes read as quiet guides.
    const color = "rgba(120,80,40,0.08)";
    const labelColor = "rgba(120,80,40,0.35)";

    // Get flat-top hex neighbors for a given col,row
    function getNeighbors(col, row) {
      const even = col % 2 === 0;
      return [
        [col + 1, even ? row - 1 : row], [col + 1, even ? row : row + 1],
        [col - 1, even ? row - 1 : row], [col - 1, even ? row : row + 1],
        [col, row - 1], [col, row + 1]
      ];
    }

    // Convert a node's pixel position to hex col,row
    function pixelToHex(px, py) {
      const colFloat = (px - originX) / colStep + bcCol;
      const col = Math.round(colFloat);
      const rowOffset = (col % 2 !== bcCol % 2) ? rowStep / 2 : 0;
      const rowFloat = (py - originY - rowOffset) / rowStep + bcRow;
      const row = Math.round(rowFloat);
      return { col, row };
    }

    // Find all hexes that contain a node
    const contentHexes = new Set();
    nodes.forEach(n => {
      if (n.x === undefined || n.y === undefined) return;
      const { col, row } = pixelToHex(n.x, n.y);
      contentHexes.add(col + "," + row);
    });

    // Expand by 1 ring of neighbors (hex flower)
    const hexesToDraw = new Set(contentHexes);
    contentHexes.forEach(key => {
      const [col, row] = key.split(",").map(Number);
      getNeighbors(col, row).forEach(([c, r]) => hexesToDraw.add(c + "," + r));
    });

    // Fill gaps: check hexes just outside the current set.
    // If a hex has 2+ neighbors already in hexesToDraw, add it.
    // Only do ONE pass to avoid runaway expansion.
    const snapshot = new Set(hexesToDraw);
    let minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity;
    snapshot.forEach(key => {
      const [c, r] = key.split(",").map(Number);
      minCol = Math.min(minCol, c); maxCol = Math.max(maxCol, c);
      minRow = Math.min(minRow, r); maxRow = Math.max(maxRow, r);
    });
    for (let col = minCol - 1; col <= maxCol + 1; col++) {
      for (let row = minRow - 1; row <= maxRow + 1; row++) {
        const key = col + "," + row;
        if (snapshot.has(key)) continue;
        const neighbors = getNeighbors(col, row);
        const filledNeighbors = neighbors.filter(([c, r]) => snapshot.has(c + "," + r)).length;
        if (filledNeighbors >= 3) {
          hexesToDraw.add(key);
        }
      }
    }

    // Draw the hexes
    hexesToDraw.forEach(key => {
      const [col, row] = key.split(",").map(Number);
      const hx = originX + (col - bcCol) * colStep;
      const hy = originY + (row - bcRow) * rowStep + (col % 2 !== bcCol % 2 ? rowStep / 2 : 0);

      // Draw flat-top hexagon
      const points = [];
      for (let k = 0; k < 6; k++) {
        const angle = (Math.PI / 180) * (60 * k);
        points.push((hx + size * Math.cos(angle)) + "," + (hy + size * Math.sin(angle)));
      }
      gridGroup.append("polygon")
        .attr("points", points.join(" "))
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 0.4);

      // Small hex coordinate label tucked at the top of each hex — the
      // classic tactical-crawl convention. Kept faint so it reads only when
      // the eye is looking for it.
      const label = String(col).padStart(2, "0") + String(row).padStart(2, "0");
      const inscribed = size * Math.sqrt(3) / 2;
      gridGroup.append("text")
        .attr("x", hx).attr("y", hy - inscribed * 0.82)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "hanging")
        .attr("font-size", "6.5px")
        .attr("fill", labelColor)
        .attr("font-family", "'SF Mono', 'Monaco', 'Menlo', monospace")
        .attr("letter-spacing", "0.5px")
        .text(label);
    });
  }
};
