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
    const size = HINT_SCALE / 2; // hex radius in px (0.5 inch = 50px so hex is 1" wide)
    const hexW = size * 2;                    // flat-top width
    const hexH = size * Math.sqrt(3);         // flat-top height
    const colStep = hexW * 0.75;              // horizontal distance between column centers
    const rowStep = hexH;                     // vertical distance between row centers

    // BC is at hex 1010 (column 10, row 10)
    const bcCol = 10;
    const bcRow = 10;

    const color = "rgba(120,80,40,0.15)";
    const labelColor = "rgba(120,80,40,0.45)";

    // Draw hexes covering the map
    const colExtent = 19;
    const rowExtent = 22;

    for (let col = 0; col <= colExtent; col++) {
      for (let row = 0; row <= rowExtent; row++) {
        // Pixel position of this hex center
        const hx = originX + (col - bcCol) * colStep;
        const hy = originY + (row - bcRow) * rowStep + (col % 2 !== bcCol % 2 ? rowStep / 2 : 0);

        // Skip if way off screen
        if (hx < -200 || hx > WIDTH + 600 || hy < -200 || hy > HEIGHT + 600) continue;

        // Draw flat-top hexagon
        const points = [];
        for (let k = 0; k < 6; k++) {
          const angle = (Math.PI / 180) * (60 * k);
          points.push((hx + size * Math.cos(angle)) + "," + (hy + size * Math.sin(angle)));
        }
        const isBCHex = (col === bcCol && row === bcRow);
        gridGroup.append("polygon")
          .attr("points", points.join(" "))
          .attr("fill", "none")
          .attr("stroke", isBCHex ? "rgba(180,60,30,0.3)" : color)
          .attr("stroke-width", isBCHex ? 1.5 : 0.6);

        // Canonical hex number: CC.RR (column.row)
        const label = String(col + 1).padStart(2, "0") + "." + String(row + 1).padStart(2, "0");
        gridGroup.append("text")
          .attr("x", hx).attr("y", hy + 3)
          .attr("text-anchor", "middle")
          .attr("font-size", "7px")
          .attr("fill", isBCHex ? "rgba(180,60,30,0.5)" : labelColor)
          .attr("font-family", "'Palatino Linotype', Palatino, serif")
          .text(label);
      }
    }
  }
};
