import * as d3 from "d3";
import { createViewportTooltip, positionViewportTooltip } from "@/utils/chartTooltip";

export const CODON_GROUP_COLORS = {
  Up: "#d45a2a",
  Non: "#8fa1a7",
  Down: "#147782"
};

export const CODON_GROUP_ORDER = ["Up", "Non", "Down"];
export const CODON_GRID_STROKE = "#147782";
export const CODON_GRID_OPACITY = 0.14;
let codonClipSequence = 0;

export function createTooltip(container) {
  return createViewportTooltip(container);
}

export function positionTooltip(tooltip, container, event) {
  positionViewportTooltip(tooltip, container, event);
}

export function formatPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "NA";
  }

  return `${numeric.toFixed(2)}%`;
}

export function formatNumber(value, digits = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "NA";
  }

  return numeric.toFixed(digits);
}

export function formatInteger(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "NA";
  }

  return Math.round(numeric).toLocaleString();
}

export function formatPValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "NA";
  }

  return numeric < 1e-3 ? numeric.toExponential(2) : numeric.toFixed(4);
}

export function drawAxisWithGrid(chart, yScale, innerWidth) {
  chart
    .append("g")
    .attr("class", "ribote-d3-grid")
    .call(d3.axisLeft(yScale).ticks(5).tickSize(-innerWidth).tickFormat(() => ""))
    .call((axis) => axis.select(".domain").remove())
    .call((axis) => axis
      .selectAll("line")
      .attr("stroke", CODON_GRID_STROKE)
      .attr("stroke-opacity", CODON_GRID_OPACITY));
}

export function drawGroupLegend(chart, innerWidth, yPosition, options = {}) {
  const legendItems = CODON_GROUP_ORDER.map((group) => ({
    group,
    color: CODON_GROUP_COLORS[group] || "#147782"
  }));
  const legendSpacing = 88;
  const legendWidth = Math.max(0, (legendItems.length - 1) * legendSpacing);
  const centerX = Number.isFinite(options.centerX) ? Number(options.centerX) : innerWidth / 2;
  const legend = chart
    .append("g")
    .attr("transform", `translate(${Math.max(0, centerX - legendWidth / 2)}, ${yPosition})`);

  legendItems.forEach((item, index) => {
    const legendItem = legend.append("g").attr("transform", `translate(${index * legendSpacing}, 0)`);
    legendItem
      .append("circle")
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("r", 5.5)
      .attr("fill", item.color)
      .attr("stroke", "rgba(16, 35, 42, 0.24)")
      .attr("stroke-width", 0.8);
    legendItem
      .append("text")
      .attr("x", 12)
      .attr("y", 4)
      .attr("class", "ribote-d3-legend ribote-d3-legend--library")
      .text(item.group);
  });
}

export function nextClipId(prefix = "ribote-codon-clip") {
  codonClipSequence += 1;
  return `${prefix}-${codonClipSequence}`;
}

export function appendPlotClip(svg, clipId, width, height) {
  svg
    .append("defs")
    .append("clipPath")
    .attr("id", clipId)
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", width)
    .attr("height", height);
}

export function buildLinearDomain(
  values,
  {
    fallbackMin = 0,
    fallbackMax = 1,
    lowerPadRatio = 0.05,
    upperPadRatio = 0.05,
    minFloor = null,
    includeZero = false
  } = {}
) {
  const numericValues = (values || []).map((value) => Number(value)).filter((value) => Number.isFinite(value));

  if (!numericValues.length) {
    return [fallbackMin, fallbackMax];
  }

  let minValue = d3.min(numericValues);
  let maxValue = d3.max(numericValues);

  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return [fallbackMin, fallbackMax];
  }

  if (includeZero) {
    minValue = Math.min(minValue, 0);
    maxValue = Math.max(maxValue, 0);
  }

  if (maxValue === minValue) {
    const baseline = Math.max(Math.abs(maxValue), Math.abs(fallbackMax - fallbackMin), 1);
    minValue -= baseline * lowerPadRatio;
    maxValue += baseline * upperPadRatio;
  } else {
    const span = maxValue - minValue;
    minValue -= span * lowerPadRatio;
    maxValue += span * upperPadRatio;
  }

  if (Number.isFinite(minFloor)) {
    minValue = Math.max(minFloor, minValue);
  }

  if (!(maxValue > minValue)) {
    maxValue = minValue + 1;
  }

  return [minValue, maxValue];
}
