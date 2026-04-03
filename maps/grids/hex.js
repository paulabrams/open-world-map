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

    const color = "rgba(120,80,40,0.15)";
    const labelColor = "rgba(120,80,40,0.45)";

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

    // Expand by 1 ring of neighbors (hex flower) for context
    const hexesToDraw = new Set(contentHexes);
    contentHexes.forEach(key => {
      const [col, row] = key.split(",").map(Number);
      // 6 flat-top hex neighbors
      const even = col % 2 === 0;
      const neighbors = [
        [col + 1, even ? row - 1 : row], [col + 1, even ? row : row + 1],
        [col - 1, even ? row - 1 : row], [col - 1, even ? row : row + 1],
        [col, row - 1], [col, row + 1]
      ];
      neighbors.forEach(([c, r]) => hexesToDraw.add(c + "," + r));
    });

    // Draw only the relevant hexes
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
      const hasContent = contentHexes.has(key);
      const isBCHex = (col === bcCol && row === bcRow);
      gridGroup.append("polygon")
        .attr("points", points.join(" "))
        .attr("fill", "none")
        .attr("stroke", isBCHex ? "rgba(180,60,30,0.3)" : hasContent ? "rgba(120,80,40,0.25)" : color)
        .attr("stroke-width", isBCHex ? 1.5 : hasContent ? 0.8 : 0.4);

      // Label: CCRR format (no dot)
      const label = String(col + 1).padStart(2, "0") + String(row + 1).padStart(2, "0");
      gridGroup.append("text")
        .attr("x", hx).attr("y", hy + 3)
        .attr("text-anchor", "middle")
        .attr("font-size", hasContent ? "7px" : "6px")
        .attr("fill", isBCHex ? "rgba(180,60,30,0.5)" : hasContent ? "rgba(120,80,40,0.55)" : labelColor)
        .attr("font-family", "'Palatino Linotype', Palatino, serif")
        .text(label);
    });
  }
};
