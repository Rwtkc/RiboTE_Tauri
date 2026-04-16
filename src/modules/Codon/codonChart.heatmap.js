import * as d3 from "d3";
import {
  CODON_GROUP_COLORS,
  CODON_GROUP_ORDER,
  appendPlotClip,
  buildLinearDomain,
  createTooltip,
  drawAxisWithGrid,
  drawGroupLegend,
  formatInteger,
  formatNumber,
  formatPValue,
  formatPercent,
  nextClipId,
  positionTooltip
} from "./codonChart.shared.js";

export function drawCodonHeatmapChart(container, panel) {
  const root = d3.select(container);
  root.selectAll("*").remove();
  root.style("position", "relative");

  const rows = Array.isArray(panel?.rows) ? panel.rows : [];
  const columns = Array.isArray(panel?.columns) ? panel.columns : [];
  const values = Array.isArray(panel?.values) ? panel.values : [];
  if (!rows.length || !columns.length || !values.length) {
    root.append("div").attr("class", "ribote-d3-empty").text("No codon heatmap matrix is available.");
    return undefined;
  }

  const width = container.clientWidth || 920;
  const height = Math.max(760, 140 + rows.length * 3.4);
  const margin = { top: 120, right: 20, bottom: 82, left: 72 };
  const innerWidth = Math.max(260, width - margin.left - margin.right);
  const innerHeight = Math.max(180, height - margin.top - margin.bottom);
  const xScale = d3.scaleBand().domain(columns.map((column) => column.label)).range([0, innerWidth]).padding(0.02);
  const yScale = d3.scaleBand().domain(rows).range([0, innerHeight]).padding(0.02);
  const colorMax = Number(panel?.colorMax) > 0 ? Number(panel.colorMax) : 1;
  const colorScale = d3.scaleLinear().domain([-colorMax, 0, colorMax]).range(["#0d6c88", "#eef6f8", "#d45a2a"]);
  const tooltip = createTooltip(container);

  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("class", "ribote-d3-chart");
  svg.append("text").attr("x", 0).attr("y", 12).attr("text-anchor", "start").attr("class", "ribote-d3-chart-title ribote-d3-chart-title--library").text(panel?.title || "Codon Heatmap");
  svg.append("text").attr("x", 0).attr("y", 34).attr("text-anchor", "start").attr("class", "ribote-d3-chart-subtitle").text(panel?.subtitle || "Clustered codon matrix");

  const chart = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);
  const matrixRows = rows.map((rowLabel, rowIndex) => columns.map((column, columnIndex) => ({
    row: rowLabel,
    column: column.label,
    selected: Boolean(column.selected),
    value: Number(values[rowIndex]?.[columnIndex] || 0)
  }))).flat();

  chart.append("g")
    .selectAll("rect")
    .data(matrixRows)
    .join("rect")
    .attr("x", (cell) => xScale(cell.column))
    .attr("y", (cell) => yScale(cell.row))
    .attr("width", xScale.bandwidth())
    .attr("height", yScale.bandwidth())
    .attr("fill", (cell) => colorScale(cell.value))
    .on("mouseenter", function handleMouseEnter(event, cell) {
      tooltip
        .html(
          `<div class="ribote-d3-tooltip__title">${cell.column} | ${cell.row}</div>
          <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">Value:</span><span class="ribote-d3-tooltip__value">${formatNumber(cell.value, 3)}</span></div>
          <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">Selected Codon:</span><span class="ribote-d3-tooltip__value">${cell.selected ? "Yes" : "No"}</span></div>`
        )
        .style("opacity", 1);
      positionTooltip(tooltip, container, event);
    })
    .on("mousemove", (event) => positionTooltip(tooltip, container, event))
    .on("mouseleave", () => tooltip.style("opacity", 0));

  chart.append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", innerWidth)
    .attr("height", innerHeight)
    .attr("fill", "none")
    .attr("stroke", "#000000")
    .attr("stroke-width", 1)
    .attr("pointer-events", "none");

  chart.append("g")
    .attr("transform", `translate(0, ${innerHeight})`)
    .call(d3.axisBottom(xScale))
    .call((axis) => axis.select(".domain").attr("stroke", "#000000").attr("d", `M0,0H${innerWidth}`))
    .call((axis) => axis.selectAll("line").attr("stroke", "#000000"))
    .call((axis) => axis.selectAll("text")
      .attr("class", "ribote-d3-axis-tick")
      .attr("transform", "rotate(-90)")
      .attr("text-anchor", "end")
      .attr("dx", "-0.55em")
      .attr("dy", "-0.2em")
      .style("fill", (_, index) => (columns[index]?.selected ? "#d45a2a" : null)));

  if (rows.length <= 48) {
    chart.append("g")
      .call(d3.axisLeft(yScale))
      .call((axis) => axis.select(".domain").attr("stroke", "#000000").attr("d", `M0,0V${innerHeight}`))
      .call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-tick"))
      .call((axis) => axis.selectAll("line").attr("stroke", "#000000"));
  } else {
    chart.append("text")
      .attr("x", -innerHeight / 2)
      .attr("y", -52)
      .attr("transform", "rotate(-90)")
      .attr("text-anchor", "middle")
      .attr("class", "ribote-d3-axis-label")
      .text(panel?.rowAxisLabel || `Rows (${rows.length})`);
  }

  return () => {
    tooltip.remove();
  };
}
