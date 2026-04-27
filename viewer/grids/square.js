window.MapGrids = window.MapGrids || {};

window.MapGrids.square = {
  name: "Square (1\")",
  render(ctx) {
    const { WIDTH, HEIGHT, HINT_SCALE, nodes } = ctx;
    const gridGroup = ctx.g.append("g").attr("class", "inch-grid");
    const bcNode = nodes.find(n => n.id === "blackwater-crossing");
    const cx = bcNode ? bcNode.x : WIDTH / 2;
    const cy = bcNode ? bcNode.y : HEIGHT / 2;
    const step = HINT_SCALE; // 100px = 1 inch
    const extent = 8; // inches in each direction

    for (let i = -extent; i <= extent; i++) {
      const x = cx + i * step;
      const y = cy + i * step;
      const isMajor = i === 0;
      const color = isMajor ? "rgba(120,80,40,0.3)" : "rgba(120,80,40,0.1)";
      const width = isMajor ? 1.0 : 0.5;

      // Vertical line (full height)
      gridGroup.append("line")
        .attr("x1", x).attr("y1", cy - extent * step)
        .attr("x2", x).attr("y2", cy + extent * step)
        .attr("stroke", color).attr("stroke-width", width);

      // Horizontal line (full width)
      gridGroup.append("line")
        .attr("x1", cx - extent * step).attr("y1", y)
        .attr("x2", cx + extent * step).attr("y2", y)
        .attr("stroke", color).attr("stroke-width", width);

      // Labels (skip 0 — that's BC)
      if (i !== 0) {
        // X-axis labels (along center horizontal)
        gridGroup.append("text")
          .attr("x", x).attr("y", cy + 12)
          .attr("text-anchor", "middle")
          .attr("font-size", "8px")
          .attr("fill", "rgba(120,80,40,0.4)")
          .attr("font-family", "'Palatino Linotype', Palatino, serif")
          .text(i + '"');

        // Y-axis labels (along center vertical)
        gridGroup.append("text")
          .attr("x", cx + 6).attr("y", y + 3)
          .attr("text-anchor", "start")
          .attr("font-size", "8px")
          .attr("fill", "rgba(120,80,40,0.4)")
          .attr("font-family", "'Palatino Linotype', Palatino, serif")
          .text(i + '"');
      }
    }

    // Origin label
    gridGroup.append("text")
      .attr("x", cx + 8).attr("y", cy - 6)
      .attr("text-anchor", "start")
      .attr("font-size", "7px")
      .attr("fill", "rgba(120,80,40,0.5)")
      .attr("font-family", "'Palatino Linotype', Palatino, serif")
      .text("(0,0)");
  }
};
