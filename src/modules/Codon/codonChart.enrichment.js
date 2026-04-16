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

export function drawCodonShiftEnrichmentChart(container, panel, renderState = {}) {
  const root = d3.select(container);
  root.selectAll("*").remove();
  root.style("position", "relative");

  const points = Array.isArray(panel?.points) ? panel.points : [];
  if (!points.length) {
    root.append("div").attr("class", "ribote-d3-empty").text("No codon enrichment ranking is available.");
    return undefined;
  }

  const width = container.clientWidth || 860;
  const rowHeight = 28;
  const height = Math.max(340, 120 + (points.length * rowHeight));
  const margin = { top: 92, right: 30, bottom: 56, left: 112 };
  const innerWidth = Math.max(220, width - margin.left - margin.right);
  const innerHeight = Math.max(180, height - margin.top - margin.bottom);
  const [xMin, xMax] = buildLinearDomain(points.map((point) => point?.value), {
    fallbackMin: -1,
    fallbackMax: 1,
    lowerPadRatio: 0.12,
    upperPadRatio: 0.04,
    includeZero: true
  });
  const tooltip = createTooltip(container);

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
    .text(panel?.title || "Codon Enrichment in TE-Shifted Genes");

  svg
    .append("text")
    .attr("x", 0)
    .attr("y", 34)
    .attr("text-anchor", "start")
    .attr("class", "ribote-d3-chart-subtitle")
    .text(panel?.subtitle || "Codons are ranked by TE-shift enrichment contrast.");

  const chart = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);
  const xScale = d3.scaleLinear().domain([xMin, xMax]).nice().range([0, innerWidth]);
  const yScale = d3.scaleBand().domain(points.map((point) => point.label)).range([0, innerHeight]).padding(0.32);

  chart
    .append("g")
    .call(d3.axisLeft(yScale))
    .call((axis) => axis.select(".domain").attr("stroke", "#000000").attr("d", `M0,0V${innerHeight}`))
    .call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-tick"))
    .call((axis) => axis.selectAll("line").attr("stroke", "#000000"));

  chart
    .append("g")
    .attr("transform", `translate(0, ${innerHeight})`)
    .call(d3.axisBottom(xScale).ticks(6))
    .call((axis) => axis.select(".domain").attr("stroke", "#000000"))
    .call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-tick"))
    .call((axis) => axis.selectAll("line").attr("stroke", "#000000"));

  chart
    .append("text")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 42)
    .attr("text-anchor", "middle")
    .attr("class", "ribote-d3-axis-label")
    .text(panel?.xLabel || "Enrichment Contrast");

  const shouldAnimate = renderState.animate !== false;
  const rows = chart
    .append("g")
    .selectAll("g")
    .data(points)
    .join("g")
    .attr("transform", (point) => `translate(0, ${yScale(point.label) || 0})`);
  const zeroX = xScale(0);
  const barHeight = Math.max(8, yScale.bandwidth() * 0.68);
  const barY = (yScale.bandwidth() - barHeight) / 2;

  rows
    .append("rect")
    .attr("x", shouldAnimate ? zeroX : (point) => Math.min(zeroX, xScale(point.value)))
    .attr("y", barY)
    .attr("width", shouldAnimate ? 0 : (point) => Math.max(1, Math.abs(xScale(point.value) - zeroX)))
    .attr("height", barHeight)
    .attr("rx", 4)
    .attr("ry", 4)
    .attr("fill", (point) => (point.selected ? "#d45a2a" : "#147782"))
    .attr("fill-opacity", 0.82)
    .attr("stroke", (point) => (point.selected ? "#8f3e20" : "#4f7246"))
    .attr("stroke-width", 0.8)
    .on("mouseenter", function handleMouseEnter(event, point) {
      tooltip
        .html(
          `<div class="ribote-d3-tooltip__title">${point.label}</div>
          <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">Contrast:</span><span class="ribote-d3-tooltip__value">${formatNumber(point.value, 3)}</span></div>
          <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">Shifted Fraction:</span><span class="ribote-d3-tooltip__value">${formatPercent((point.shiftedFraction || 0) * 100)}</span></div>
          <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">Selected:</span><span class="ribote-d3-tooltip__value">${point.selected ? "Yes" : "No"}</span></div>`
        )
        .style("opacity", 1);
      positionTooltip(tooltip, container, event);
      d3.select(this).attr("fill-opacity", 1).attr("stroke-width", 1.2);
    })
    .on("mousemove", (event) => positionTooltip(tooltip, container, event))
    .on("mouseleave", function handleMouseLeave() {
      tooltip.style("opacity", 0);
      d3.select(this).attr("fill-opacity", 0.82).attr("stroke-width", 0.8);
    })
    .transition()
    .duration(420)
    .ease(d3.easeCubicOut)
    .attr("x", (point) => Math.min(zeroX, xScale(point.value)))
    .attr("width", (point) => Math.max(1, Math.abs(xScale(point.value) - zeroX)));

  return () => {
    tooltip.remove();
  };
}

export function drawCodonPermutationHistogramChart(container, panel) {
  const root = d3.select(container);
  root.selectAll("*").remove();
  root.style("position", "relative");

  const bins = Array.isArray(panel?.bins) ? panel.bins : [];
  if (!bins.length) {
    root.append("div").attr("class", "ribote-d3-empty").text("No permutation-support histogram is available.");
    return undefined;
  }

  const width = container.clientWidth || 820;
  const height = 360;
  const margin = { top: 92, right: 24, bottom: 58, left: 64 };
  const innerWidth = Math.max(220, width - margin.left - margin.right);
  const innerHeight = Math.max(180, height - margin.top - margin.bottom);
  const observedValue = Number.isFinite(Number(panel?.observedValue)) ? Number(panel.observedValue) : 0;
  const binValues = bins.flatMap((bin) => [bin?.x0, bin?.x1]);
  const finiteBinValues = binValues.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  const binMin = finiteBinValues.length ? d3.min(finiteBinValues) : 0;
  const binMax = finiteBinValues.length ? d3.max(finiteBinValues) : 1;
  const binSpan = Math.max(binMax - binMin, Math.abs(binMax), 1);
  const observedOffset = observedValue < binMin
    ? binMin - observedValue
    : observedValue > binMax
      ? observedValue - binMax
      : 0;
  const observedIsTruncated = observedOffset > binSpan * 0.2;
  const [mainXMin, mainXMax] = buildLinearDomain(
    binValues,
    { fallbackMin: 0, fallbackMax: 1, lowerPadRatio: 0.04, upperPadRatio: 0.04 }
  );
  const [fullXMin, fullXMax] = buildLinearDomain(
    binValues.concat([observedValue]),
    { fallbackMin: 0, fallbackMax: 1, lowerPadRatio: 0.04, upperPadRatio: 0.04 }
  );
  const observedTickSpan = Math.max(Math.abs(d3.tickStep(binMin, binMax, 6)) || 0, binSpan / 8, Math.abs(observedValue) * 0.02, 0.001);
  const observedDomain = [observedValue - observedTickSpan, observedValue + observedTickSpan];
  const breakGap = observedIsTruncated ? Math.min(44, Math.max(30, innerWidth * 0.055)) : 0;
  const observedRangeWidth = observedIsTruncated ? Math.min(Math.max(innerWidth * 0.16, 96), innerWidth * 0.24) : 0;
  const observedOnLeft = observedValue < binMin;
  const mainRangeStart = observedIsTruncated && observedOnLeft ? observedRangeWidth + breakGap : 0;
  const mainRangeEnd = observedIsTruncated && !observedOnLeft ? innerWidth - observedRangeWidth - breakGap : innerWidth;
  const observedRangeStart = observedIsTruncated && observedOnLeft ? 0 : innerWidth - observedRangeWidth;
  const observedRangeEnd = observedIsTruncated && observedOnLeft ? observedRangeWidth : innerWidth;
  const breakCenterX = observedIsTruncated
    ? (observedOnLeft ? observedRangeWidth + (breakGap / 2) : mainRangeEnd + (breakGap / 2))
    : null;
  const xScale = d3.scaleLinear()
    .domain(observedIsTruncated ? [mainXMin, mainXMax] : [fullXMin, fullXMax])
    .nice()
    .range([mainRangeStart, mainRangeEnd]);
  const observedScale = observedIsTruncated
    ? d3.scaleLinear().domain(observedDomain).nice().range([observedRangeStart, observedRangeEnd])
    : xScale;
  const yScale = d3.scaleLinear()
    .domain([0, d3.max(bins, (bin) => Number(bin.count)) || 1])
    .nice()
    .range([innerHeight, 0]);
  const tooltip = createTooltip(container);

  const svg = root
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("class", "ribote-d3-chart");

  svg.append("text").attr("x", 0).attr("y", 12).attr("text-anchor", "start").attr("class", "ribote-d3-chart-title ribote-d3-chart-title--library").text(panel?.title || "Permutation Support");
  svg.append("text").attr("x", 0).attr("y", 34).attr("text-anchor", "start").attr("class", "ribote-d3-chart-subtitle").text(panel?.subtitle || "Observed value is compared against a deterministic permutation background.");

  const chart = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);
  drawAxisWithGrid(chart, yScale, innerWidth);

  if (observedIsTruncated) {
    chart.append("g").attr("transform", `translate(0, ${innerHeight})`).call(d3.axisBottom(xScale).ticks(5))
      .call((axis) => axis.select(".domain").attr("stroke", "#000000"))
      .call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-tick"))
      .call((axis) => axis.selectAll("line").attr("stroke", "#000000"));
    chart.append("g").attr("transform", `translate(0, ${innerHeight})`).call(d3.axisBottom(observedScale).ticks(2))
      .call((axis) => axis.select(".domain").attr("stroke", "#000000"))
      .call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-tick"))
      .call((axis) => axis.selectAll("line").attr("stroke", "#000000"));
    chart.append("g")
      .attr("transform", `translate(${breakCenterX}, ${innerHeight})`)
      .selectAll("line")
      .data([-4, 4])
      .join("line")
      .attr("x1", (offset) => offset - 2.5)
      .attr("x2", (offset) => offset + 2.5)
      .attr("y1", 3)
      .attr("y2", -7)
      .attr("stroke", "#000000")
      .attr("stroke-width", 1.1);
  } else {
    chart.append("g").attr("transform", `translate(0, ${innerHeight})`).call(d3.axisBottom(xScale).ticks(6))
      .call((axis) => axis.select(".domain").attr("stroke", "#000000"))
      .call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-tick"))
      .call((axis) => axis.selectAll("line").attr("stroke", "#000000"));
  }
  chart.append("g").call(d3.axisLeft(yScale).ticks(5))
    .call((axis) => axis.select(".domain").attr("stroke", "#000000"))
    .call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-tick"))
    .call((axis) => axis.selectAll("line").attr("stroke", "#000000"));

  chart.append("text").attr("x", innerWidth / 2).attr("y", innerHeight + 44).attr("text-anchor", "middle").attr("class", "ribote-d3-axis-label").text(panel?.xLabel || "Permutation Metric");
  chart.append("text").attr("transform", "rotate(-90)").attr("x", -innerHeight / 2).attr("y", -48).attr("text-anchor", "middle").attr("class", "ribote-d3-axis-label").text("Permutation Count");

  chart.append("g")
    .selectAll("rect")
    .data(bins)
    .join("rect")
    .attr("x", (bin) => xScale(bin.x0))
    .attr("width", (bin) => Math.max(1, xScale(bin.x1) - xScale(bin.x0) - 1))
    .attr("y", (bin) => yScale(bin.count))
    .attr("height", (bin) => innerHeight - yScale(bin.count))
    .attr("fill", "#147782")
    .attr("fill-opacity", 0.72)
    .on("mouseenter", function handleMouseEnter(event, bin) {
      tooltip
        .html(
          `<div class="ribote-d3-tooltip__title">Permutation Bin</div>
          <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">Range:</span><span class="ribote-d3-tooltip__value">${formatNumber(bin.x0, 3)} to ${formatNumber(bin.x1, 3)}</span></div>
          <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">Count:</span><span class="ribote-d3-tooltip__value">${formatInteger(bin.count)}</span></div>`
        )
        .style("opacity", 1);
      positionTooltip(tooltip, container, event);
      d3.select(this).attr("fill-opacity", 0.92);
    })
    .on("mousemove", (event) => positionTooltip(tooltip, container, event))
    .on("mouseleave", function handleMouseLeave() {
      tooltip.style("opacity", 0);
      d3.select(this).attr("fill-opacity", 0.72);
    });

  const observedX = observedIsTruncated
    ? observedScale(observedValue)
    : xScale(observedValue);
  const observedPositionLabel = observedIsTruncated
    ? "shown on a truncated x-axis segment"
    : "inside the displayed x-axis range";

  const observedLine = chart.append("line")
    .attr("x1", observedX)
    .attr("x2", observedX)
    .attr("y1", 0)
    .attr("y2", innerHeight)
    .attr("stroke", "#d45a2a")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "6 4");

  chart.append("line")
    .attr("x1", observedX)
    .attr("x2", observedX)
    .attr("y1", 0)
    .attr("y2", innerHeight)
    .attr("stroke", "transparent")
    .attr("stroke-width", 14)
    .attr("cursor", "default")
    .on("mouseenter", function handleObservedMouseEnter(event) {
      tooltip
        .html(
          `<div class="ribote-d3-tooltip__title">Observed Value</div>
          <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">Metric:</span><span class="ribote-d3-tooltip__value">${panel?.xLabel || "Permutation Metric"}</span></div>
          <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">Value:</span><span class="ribote-d3-tooltip__value">${formatNumber(observedValue, 3)}</span></div>
          <div class="ribote-d3-tooltip__row"><span class="ribote-d3-tooltip__key">Position:</span><span class="ribote-d3-tooltip__value">${observedPositionLabel}</span></div>`
        )
        .style("opacity", 1);
      positionTooltip(tooltip, container, event);
      observedLine.attr("stroke-width", 3);
    })
    .on("mousemove", (event) => positionTooltip(tooltip, container, event))
    .on("mouseleave", function handleObservedMouseLeave() {
      tooltip.style("opacity", 0);
      observedLine.attr("stroke-width", 2);
    });

  return () => {
    tooltip.remove();
  };
}
