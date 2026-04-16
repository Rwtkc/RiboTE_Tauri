import * as d3 from "d3";
import {
  CODON_GROUP_COLORS,
  CODON_GROUP_ORDER,
  appendPlotClip,
  buildLinearDomain,
  createTooltip,
  drawAxisWithGrid,
  formatInteger,
  formatNumber,
  formatPValue,
  formatPercent,
  nextClipId,
  positionTooltip
} from "./codonChart.shared.js";

export function drawCodonLoadTrendChart(container, panel) {
  const root = d3.select(container);
  root.selectAll("*").remove();
  root.style("position", "relative");

  const bins = Array.isArray(panel?.bins) ? panel.bins : [];
  if (!bins.length) {
    root.append("div").attr("class", "ribote-d3-empty").text("No TE-bias trend is available.");
    return undefined;
  }

  const width = container.clientWidth || 860;
  const height = 380;
  const margin = { top: 92, right: 30, bottom: 64, left: 60 };
  const innerWidth = Math.max(220, width - margin.left - margin.right);
  const innerHeight = Math.max(180, height - margin.top - margin.bottom);
  const xScale = d3.scalePoint().domain(bins.map((bin) => bin.label)).range([0, innerWidth]).padding(0.35);
  const yScale = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);
  const tooltip = createTooltip(container);

  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("class", "ribote-d3-chart");
  svg.append("text").attr("x", 0).attr("y", 12).attr("text-anchor", "start").attr("class", "ribote-d3-chart-title ribote-d3-chart-title--library").text(panel?.title || "TE Bias Across Selected Codon Load");
  svg.append("text").attr("x", 0).attr("y", 34).attr("text-anchor", "start").attr("class", "ribote-d3-chart-subtitle").text(panel?.subtitle || "TE-group fractions are tracked across selected-codon load bins.");
  const topLegend = svg.append("g").attr("transform", `translate(${Math.max(0, width - 278)}, 22)`);
  CODON_GROUP_ORDER.forEach((group, index) => {
    const item = topLegend.append("g").attr("transform", `translate(${index * 86}, 0)`);
    item.append("line")
      .attr("x1", 0)
      .attr("x2", 18)
      .attr("y1", 0)
      .attr("y2", 0)
      .attr("stroke", CODON_GROUP_COLORS[group])
      .attr("stroke-width", 2.4);
    item.append("circle")
      .attr("cx", 9)
      .attr("cy", 0)
      .attr("r", 4.2)
      .attr("fill", CODON_GROUP_COLORS[group]);
    item.append("text")
      .attr("x", 24)
      .attr("y", 4)
      .attr("class", "ribote-d3-legend ribote-d3-legend--library")
      .text(group);
  });
  const chart = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

  drawAxisWithGrid(chart, yScale, innerWidth);
  chart.append("g").attr("transform", `translate(0, ${innerHeight})`).call(d3.axisBottom(xScale))
    .call((axis) => axis.select(".domain").attr("stroke", "#000000"))
    .call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-tick"));
  chart.append("g").call(d3.axisLeft(yScale).ticks(5).tickFormat((value) => `${Math.round(value * 100)}%`))
    .call((axis) => axis.select(".domain").attr("stroke", "#000000"))
    .call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-tick"));
  chart.append("text").attr("x", innerWidth / 2).attr("y", innerHeight + 46).attr("text-anchor", "middle").attr("class", "ribote-d3-axis-label").text(panel?.xLabel || "Load Bins");
  chart.append("text").attr("transform", "rotate(-90)").attr("x", -innerHeight / 2).attr("y", -44).attr("text-anchor", "middle").attr("class", "ribote-d3-axis-label").text(panel?.yLabel || "Fraction of Genes");

  CODON_GROUP_ORDER.forEach((group) => {
    const line = d3.line()
      .x((bin) => xScale(bin.label))
      .y((bin) => yScale((bin.fractions || []).find((entry) => entry.group === group)?.value || 0));

    chart.append("path")
      .datum(bins)
      .attr("fill", "none")
      .attr("stroke", CODON_GROUP_COLORS[group])
      .attr("stroke-width", 2.4)
      .attr("d", line);

    chart.append("g")
      .selectAll("circle")
      .data(bins)
      .join("circle")
      .attr("cx", (bin) => xScale(bin.label))
      .attr("cy", (bin) => yScale((bin.fractions || []).find((entry) => entry.group === group)?.value || 0))
      .attr("r", 4.2)
      .attr("fill", CODON_GROUP_COLORS[group])
      .on("mouseenter", function handleMouseEnter(event, bin) {
        const up = (bin.fractions || []).find((entry) => entry.group === "Up")?.value || 0;
        const non = (bin.fractions || []).find((entry) => entry.group === "Non")?.value || 0;
        const down = (bin.fractions || []).find((entry) => entry.group === "Down")?.value || 0;
        tooltip
          .html(
            `<div class="ribote-d3-tooltip__title">${bin.label}</div>
            <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">Load Range:</span><span class="ribote-d3-tooltip__value">${bin.loadRange || "NA"}</span></div>
            <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">Genes:</span><span class="ribote-d3-tooltip__value">${formatInteger(bin.genes)}</span></div>
            <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">Median Load:</span><span class="ribote-d3-tooltip__value">${formatNumber(bin.medianLoad, 3)}</span></div>
            <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">Up:</span><span class="ribote-d3-tooltip__value">${formatPercent(up * 100)}</span></div>
            <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">Non:</span><span class="ribote-d3-tooltip__value">${formatPercent(non * 100)}</span></div>
            <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">Down:</span><span class="ribote-d3-tooltip__value">${formatPercent(down * 100)}</span></div>`
          )
          .style("opacity", 1);
        positionTooltip(tooltip, container, event);
      })
      .on("mousemove", (event) => positionTooltip(tooltip, container, event))
      .on("mouseleave", () => tooltip.style("opacity", 0));
  });


  return () => {
    tooltip.remove();
  };
}
