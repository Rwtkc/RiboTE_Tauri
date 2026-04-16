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

export function drawCodonRnaScatterChart(container, panel, renderState = {}) {
  const root = d3.select(container);
  root.selectAll("*").remove();
  root.style("position", "relative");

  const comparisons = Array.isArray(panel?.comparisons) ? panel.comparisons : [];
  if (!comparisons.length) {
    root.append("div").attr("class", "ribote-d3-empty").text("No codon-to-RNA scatter summary is available.");
    return undefined;
  }

  const width = container.clientWidth || 900;
  const height = 460;
  const outerMargin = { top: 92, right: 30, bottom: 64, left: 36 };
  const innerGap = 36;
  const plotWidth = Math.max(180, (width - outerMargin.left - outerMargin.right - innerGap) / 2);
  const plotHeight = Math.max(180, height - outerMargin.top - outerMargin.bottom);
  const maxX = d3.max(comparisons.flatMap((comparison) => comparison.points || []), (point) => Number(point.x)) || 0;
  const maxY = d3.max(comparisons.flatMap((comparison) => comparison.points || []), (point) => Number(point.y)) || 0;
  const minY = d3.min(comparisons.flatMap((comparison) => comparison.points || []), (point) => Number(point.y)) || 0;
  const tooltip = createTooltip(container);
  const shouldAnimate = renderState.animate !== false;

  const svg = root
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("class", "ribote-d3-chart");

  svg
    .append("text")
    .attr("x", 0)
    .attr("y", 12)
    .attr("text-anchor", "start")
    .attr("class", "ribote-d3-chart-title ribote-d3-chart-title--library")
    .text(`${panel?.codon || "Codon"} Usage vs RNA Abundance`);

  const controlCount = Number(comparisons[0]?.displayedGeneCount || 0).toLocaleString();
  const treatmentCount = Number(comparisons[1]?.displayedGeneCount || 0).toLocaleString();
  svg
    .append("text")
    .attr("x", 0)
    .attr("y", 34)
    .attr("text-anchor", "start")
    .attr("class", "ribote-d3-chart-subtitle")
    .text(`Displayed genes | Control: ${controlCount} | Treatment: ${treatmentCount}`);

  const legend = svg.append("g").attr("transform", `translate(${Math.max(0, width - 260)}, 14)`);
  CODON_GROUP_ORDER.forEach((group, index) => {
    const item = legend.append("g").attr("transform", `translate(${index * 86}, 0)`);
    item.append("circle").attr("cx", 7).attr("cy", 0).attr("r", 6).attr("fill", CODON_GROUP_COLORS[group]);
    item.append("text").attr("x", 19).attr("y", 4).attr("class", "ribote-d3-legend ribote-d3-legend--library").text(group);
  });

  const [xMin, xMax] = buildLinearDomain(
    comparisons.flatMap((comparison) => (comparison.points || []).map((point) => point?.x)),
    { fallbackMin: 0, fallbackMax: 1, lowerPadRatio: 0.02, upperPadRatio: 0.06, minFloor: 0 }
  );
  const [yMin, yMax] = buildLinearDomain(
    comparisons.flatMap((comparison) => (comparison.points || []).map((point) => point?.y)),
    { fallbackMin: minY, fallbackMax: maxY > minY ? maxY : minY + 1, lowerPadRatio: 0.05, upperPadRatio: 0.08 }
  );
  const xScale = d3.scaleLinear().domain([xMin, xMax]).nice().range([0, plotWidth]).clamp(true);
  const yScale = d3.scaleLinear().domain([yMin, yMax]).nice().range([plotHeight, 0]).clamp(true);

  comparisons.forEach((comparison, index) => {
    const left = outerMargin.left + (index * (plotWidth + innerGap));
    const chart = svg.append("g").attr("transform", `translate(${left}, ${outerMargin.top})`);
    const clipId = nextClipId("ribote-codon-rna-scatter-clip");

    appendPlotClip(svg, clipId, plotWidth, plotHeight);

    drawAxisWithGrid(chart, yScale, plotWidth);

    const xAxis = chart.append("g").attr("transform", `translate(0, ${plotHeight})`).call(d3.axisBottom(xScale).ticks(5));
    xAxis.select(".domain").attr("stroke", "#000000");
    xAxis.selectAll("text").attr("class", "ribote-d3-axis-tick");
    xAxis.selectAll("line").attr("stroke", "#000000");

    const yAxis = chart.append("g").call(d3.axisLeft(yScale).ticks(5));
    yAxis.select(".domain").attr("stroke", "#000000");
    yAxis.selectAll("text").attr("class", "ribote-d3-axis-tick");
    yAxis.selectAll("line").attr("stroke", "#000000");

    chart
      .append("text")
      .attr("x", plotWidth / 2)
      .attr("y", -18)
      .attr("text-anchor", "middle")
      .attr("class", "ribote-d3-caption ribote-d3-caption--library")
      .text(`${comparison.condition} | r=${formatNumber(comparison.correlation, 3)} | p=${formatPValue(comparison.pValue)}`);

    const points = Array.isArray(comparison.points) ? comparison.points : [];
    const plotLayer = chart.append("g").attr("clip-path", `url(#${clipId})`);
    const pointLayer = plotLayer.append("g");

    const circles = pointLayer
      .selectAll("circle")
      .data(points)
      .join("circle")
      .attr("cx", (point) => xScale(point.x))
      .attr("cy", (point) => yScale(point.y))
      .attr("r", shouldAnimate ? 0 : 3.2)
      .attr("fill", (point) => CODON_GROUP_COLORS[point.teGroup] || "#147782")
      .attr("fill-opacity", 0.74)
      .attr("stroke", "rgba(255,255,255,0.75)")
      .attr("stroke-width", 0.7)
      .on("mouseenter", function handleMouseEnter(event, point) {
        tooltip
          .html(
            `<div class="ribote-d3-tooltip__title">${point.geneName && point.geneName !== "unknown" ? point.geneName : point.geneId}</div>
            <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">GeneID:</span><span class="ribote-d3-tooltip__value">${point.geneId}</span></div>
            <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">TE Group:</span><span class="ribote-d3-tooltip__value">${point.teGroup}</span></div>
            <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">Codon Usage:</span><span class="ribote-d3-tooltip__value">${formatPercent(point.x)}</span></div>
            <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">RNA Mean:</span><span class="ribote-d3-tooltip__value">${formatNumber(point.rawRna, 3)}</span></div>`
          )
          .style("opacity", 1);
        positionTooltip(tooltip, container, event);
        d3.select(this).attr("stroke-width", 1.2);
      })
      .on("mousemove", (event) => {
        positionTooltip(tooltip, container, event);
      })
      .on("mouseleave", function handleMouseLeave() {
        tooltip.style("opacity", 0);
        d3.select(this).attr("stroke-width", 0.7);
      });

    if (shouldAnimate) {
      circles.transition().duration(420).ease(d3.easeCubicOut).attr("r", 3.2);
    }

    if (Number.isFinite(comparison?.slope) && Number.isFinite(comparison?.intercept)) {
      const lineX = xScale.domain();
      const linePoints = lineX.map((value) => ({
        x: value,
        y: (comparison.slope * value) + comparison.intercept
      }));

      plotLayer
        .append("line")
        .attr("x1", xScale(linePoints[0].x))
        .attr("y1", yScale(linePoints[0].y))
        .attr("x2", xScale(linePoints[1].x))
        .attr("y2", yScale(linePoints[1].y))
        .attr("stroke", "#17292f")
        .attr("stroke-width", 1.6)
        .attr("stroke-dasharray", "6 4");
    }

    chart
      .append("text")
      .attr("x", plotWidth / 2)
      .attr("y", plotHeight + 48)
      .attr("text-anchor", "middle")
      .attr("class", "ribote-d3-axis-label")
      .text("Selected Codon Usage in CDS (%)");

    if (index === 0) {
      chart
        .append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -plotHeight / 2)
        .attr("y", -52)
        .attr("text-anchor", "middle")
        .attr("class", "ribote-d3-axis-label")
        .text("log2 Mean RNA Abundance + 1");
    }
  });

  return () => {
    tooltip.remove();
  };
}

export function drawCodonBiasAssociationChart(container, panel, renderState = {}) {
  const root = d3.select(container);
  root.selectAll("*").remove();
  root.style("position", "relative");

  const points = Array.isArray(panel?.points) ? panel.points : [];
  if (!points.length) {
    root.append("div").attr("class", "ribote-d3-empty").text("No CBI association points are available.");
    return undefined;
  }

  const width = container.clientWidth || 860;
  const height = 420;
  const margin = { top: 92, right: 30, bottom: 92, left: 78 };
  const innerWidth = Math.max(220, width - margin.left - margin.right);
  const innerHeight = Math.max(180, height - margin.top - margin.bottom);
  const [xMin, xMax] = buildLinearDomain(
    points.map((point) => point?.x),
    { fallbackMin: 0, fallbackMax: 1, lowerPadRatio: 0.03, upperPadRatio: 0.05, minFloor: 0 }
  );
  const [yMin, yMax] = buildLinearDomain(
    points.map((point) => point?.y),
    { fallbackMin: 0, fallbackMax: 1, lowerPadRatio: 0.06, upperPadRatio: 0.08 }
  );
  const tooltip = createTooltip(container);
  const shouldAnimate = renderState.animate !== false;

  const svg = root
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("class", "ribote-d3-chart");

  svg
    .append("text")
    .attr("x", 0)
    .attr("y", 12)
    .attr("text-anchor", "start")
    .attr("class", "ribote-d3-chart-title ribote-d3-chart-title--library")
    .text(`${panel?.associationLabel || "Association"} | ${panel?.conditionLabel || "Condition"}`);

  svg
    .append("text")
    .attr("x", 0)
    .attr("y", 34)
    .attr("text-anchor", "start")
    .attr("class", "ribote-d3-chart-subtitle")
    .text(`Genes measured: ${Number(panel?.geneCount || 0).toLocaleString()} | Displayed: ${Number(panel?.displayedGeneCount || 0).toLocaleString()} | r=${formatNumber(panel?.correlation, 3)} | p=${formatPValue(panel?.pValue)}`);

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
  const clipId = nextClipId("ribote-codon-cbi-association-clip");
  const xScale = d3.scaleLinear().domain([xMin, xMax]).nice().range([0, innerWidth]).clamp(true);
  const yScale = d3.scaleLinear().domain([yMin, yMax]).nice().range([innerHeight, 0]).clamp(true);

  appendPlotClip(svg, clipId, innerWidth, innerHeight);

  drawAxisWithGrid(chart, yScale, innerWidth);

  const xAxis = chart.append("g").attr("transform", `translate(0, ${innerHeight})`).call(d3.axisBottom(xScale).ticks(5));
  xAxis.select(".domain").attr("stroke", "#000000");
  xAxis.selectAll("text").attr("class", "ribote-d3-axis-tick");
  xAxis.selectAll("line").attr("stroke", "#000000");

  const yAxis = chart.append("g").call(d3.axisLeft(yScale).ticks(5));
  yAxis.select(".domain").attr("stroke", "#000000");
  yAxis.selectAll("text").attr("class", "ribote-d3-axis-tick");
  yAxis.selectAll("line").attr("stroke", "#000000");

  chart
    .append("text")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 48)
    .attr("text-anchor", "middle")
    .attr("class", "ribote-d3-axis-label")
    .text(panel?.xLabel || "Codon Bias Index (CBI)");

  chart
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerHeight / 2)
    .attr("y", -56)
    .attr("text-anchor", "middle")
    .attr("class", "ribote-d3-axis-label")
    .text(panel?.yLabel || "Associated Measurement");

  const plotLayer = chart.append("g").attr("clip-path", `url(#${clipId})`);
  const pointLayer = plotLayer.append("g");
  const circles = pointLayer
    .selectAll("circle")
    .data(points)
    .join("circle")
    .attr("cx", (point) => xScale(point.x))
    .attr("cy", (point) => yScale(point.y))
    .attr("r", shouldAnimate ? 0 : 3.2)
    .attr("fill", (point) => CODON_GROUP_COLORS[point.teGroup] || "#147782")
    .attr("fill-opacity", 0.74)
    .attr("stroke", "rgba(255,255,255,0.75)")
    .attr("stroke-width", 0.7)
    .on("mouseenter", function handleMouseEnter(event, point) {
      tooltip
        .html(
          `<div class="ribote-d3-tooltip__title">${point.geneName && point.geneName !== "unknown" ? point.geneName : point.geneId}</div>
          <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">${panel?.pointIdLabel || "GeneID"}:</span><span class="ribote-d3-tooltip__value">${point.geneId}</span></div>
          <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">TE Group:</span><span class="ribote-d3-tooltip__value">${point.teGroup}</span></div>
          <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">${panel?.xLabel || "CBI"}:</span><span class="ribote-d3-tooltip__value">${formatNumber(point.x, 4)}</span></div>
          <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">${panel?.rawYLabel || "Raw Value"}:</span><span class="ribote-d3-tooltip__value">${formatNumber(point.rawY, 4)}</span></div>
          <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">Plotted Y:</span><span class="ribote-d3-tooltip__value">${formatNumber(point.y, 4)}</span></div>`
        )
        .style("opacity", 1);
      positionTooltip(tooltip, container, event);
      d3.select(this).attr("stroke-width", 1.2);
    })
    .on("mousemove", (event) => {
      positionTooltip(tooltip, container, event);
    })
    .on("mouseleave", function handleMouseLeave() {
      tooltip.style("opacity", 0);
      d3.select(this).attr("stroke-width", 0.7);
    });

  if (shouldAnimate) {
    circles.transition().duration(420).ease(d3.easeCubicOut).attr("r", 3.2);
  }

  if (Number.isFinite(panel?.slope) && Number.isFinite(panel?.intercept)) {
    const lineX = xScale.domain();
    const linePoints = lineX.map((value) => ({
      x: value,
      y: (panel.slope * value) + panel.intercept
    }));

    plotLayer
      .append("line")
      .attr("x1", xScale(linePoints[0].x))
      .attr("y1", yScale(linePoints[0].y))
      .attr("x2", xScale(linePoints[1].x))
      .attr("y2", yScale(linePoints[1].y))
      .attr("stroke", "#17292f")
      .attr("stroke-width", 1.6)
      .attr("stroke-dasharray", "6 4");
  }

  return () => {
    tooltip.remove();
  };
}
