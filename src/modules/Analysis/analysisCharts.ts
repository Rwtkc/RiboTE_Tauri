import * as d3 from "d3";
import { createViewportTooltip, positionViewportTooltip } from "@/utils/chartTooltip";

export interface ScatterPoint {
  GeneID?: string;
  actualRibo?: string;
  actualRna?: string;
  actualSample?: string;
  displaySample?: string;
  gene?: string;
  sample?: string;
  x: number;
  y: number;
  group?: string;
  pvalue?: number;
  padj?: number;
  te?: number;
}

export interface BarPoint {
  label: string;
  value: number;
  group?: string;
}

export interface DensitySeries {
  group: string;
  points: Array<{
    density: number;
    value: number;
  }>;
}

const groupColors: Record<string, string> = {
  Up: "#d45a2a",
  Down: "#147782",
  Non: "#8fa1a7",
  Control: "#0d6c88",
  Treatment: "#d45a2a"
};

interface ScatterDrawOptions {
  displayPointLimit?: number;
  displayedRows?: number;
  densityX?: DensitySeries[];
  densityY?: DensitySeries[];
  height?: number;
  legendCounts?: Record<string, number>;
  marginalDensity?: boolean;
  pointColor?: string;
  pcaProjection?: boolean;
  referenceLines?: {
    x?: number[];
    y?: number[];
  };
  scaleType?: "linear" | "log2";
  showCorrelation?: boolean;
  showLegend?: boolean;
  title: string;
  totalRows?: number;
  xDomain?: [number, number];
  xLabel?: string;
  yDomain?: [number, number];
  yMinFromData?: boolean;
  yLabel?: string;
}

export function drawScatter(container: HTMLDivElement, rows: ScatterPoint[], titleOrOptions: string | ScatterDrawOptions, xLabel = "X", yLabel = "Y") {
  const options: ScatterDrawOptions = typeof titleOrOptions === "string"
    ? { title: titleOrOptions, xLabel, yLabel }
    : titleOrOptions;
  if (options.marginalDensity) {
    drawMarginalDensityScatter(container, rows, options, xLabel, yLabel);
    return;
  }
  if (options.pcaProjection) {
    drawPcaProjection(container, rows, options, xLabel, yLabel);
    return;
  }
  const resolvedXLabel = options.xLabel || xLabel;
  const resolvedYLabel = options.yLabel || yLabel;
  const scaleType = options.scaleType || "linear";
  const root = d3.select(container);
  root.selectAll("*").remove();
  root.style("position", "relative");

  const finiteRows = rows.filter((row) => Number.isFinite(row.x) && Number.isFinite(row.y));
  const validRows = scaleType === "log2" ? finiteRows.filter((row) => row.x > 0 && row.y > 0) : finiteRows;
  const displaySubset = buildDisplaySubset(validRows, options);
  const plotRows = displaySubset.rows;

  if (!plotRows.length) {
    root.append("div").attr("class", "ribote-d3-empty").text("No chart data available.");
    return;
  }

  const width = container.clientWidth || 960;
  const height = options.height || 520;
  const margin = {
    top: 58,
    right: 28,
    bottom: 62,
    left: scaleType === "log2" ? 104 : 76
  };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("class", "ribote-d3-chart");
  const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const tooltip = createViewportTooltip(container);
  const xDomain = ensureDomain(validRows.map((row) => row.x), scaleType);
  const yDomain = ensureDomain(validRows.map((row) => row.y), scaleType);
  if (options.xDomain) {
    xDomain[0] = options.xDomain[0];
    xDomain[1] = options.xDomain[1];
  }
  if (options.yDomain) {
    yDomain[0] = options.yDomain[0];
    yDomain[1] = options.yDomain[1];
  }
  const rawYMin = d3.min(validRows, (row) => row.y);
  if (scaleType === "linear" && options.yMinFromData === true && rawYMin !== undefined && Number.isFinite(rawYMin)) {
    yDomain[0] = rawYMin;
  }
  const x = scaleType === "log2" ? d3.scaleLog().base(2).domain(xDomain).range([0, innerWidth]) : d3.scaleLinear().domain(xDomain).nice().range([0, innerWidth]);
  const y = scaleType === "log2" ? d3.scaleLog().base(2).domain(yDomain).range([innerHeight, 0]) : linearYScale(yDomain, options.yMinFromData === true).range([innerHeight, 0]);
  const xTickValues = scaleType === "log2" ? logTickValues(xDomain) : undefined;
  const yTickValues = scaleType === "log2" ? logTickValues(yDomain) : undefined;

  svg.append("text").attr("x", 0).attr("y", 3).attr("class", "ribote-d3-chart-title").text(options.title);

  if (scaleType !== "log2" && x(0) >= 0 && x(0) <= innerWidth) {
    chart.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", innerHeight).attr("stroke", "#b6c8cf").attr("stroke-dasharray", "6 6");
  }
  if (scaleType !== "log2" && y(0) >= 0 && y(0) <= innerHeight) {
    chart.append("line").attr("x1", 0).attr("x2", innerWidth).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "#b6c8cf").attr("stroke-dasharray", "6 6");
  }
  (options.referenceLines?.x || []).forEach((value) => {
    if (Number.isFinite(value) && x(value) >= 0 && x(value) <= innerWidth) {
      chart.append("line").attr("x1", x(value)).attr("x2", x(value)).attr("y1", 0).attr("y2", innerHeight).attr("stroke", "#8fa1a7").attr("stroke-width", 1.2).attr("stroke-dasharray", "6 6");
    }
  });
  (options.referenceLines?.y || []).forEach((value) => {
    if (Number.isFinite(value) && y(value) >= 0 && y(value) <= innerHeight) {
      chart.append("line").attr("x1", 0).attr("x2", innerWidth).attr("y1", y(value)).attr("y2", y(value)).attr("stroke", "#8fa1a7").attr("stroke-width", 1.2).attr("stroke-dasharray", "6 6");
    }
  });

  chart.selectAll("circle")
    .data(plotRows)
    .enter()
    .append("circle")
    .attr("cx", (d) => x(d.x))
    .attr("cy", (d) => y(d.y))
    .attr("r", 4.2)
    .attr("fill", (d) => options.pointColor || groupColors[d.group || ""] || "#147782")
    .attr("opacity", 0.78)
    .on("mouseenter", function(_event, d) {
      d3.select(this).attr("opacity", 1).attr("r", 5.6);
      tooltip.style("opacity", 1).html(`
        <div class="ribote-d3-tooltip__title">${escapeHtml(d.GeneID || d.gene || d.sample || "Point")}</div>
        ${d.group ? `<div class="ribote-d3-tooltip__row"><span>Status:</span><b>${escapeHtml(d.group)}</b></div>` : ""}
        <div class="ribote-d3-tooltip__row"><span>${escapeHtml(resolvedXLabel)}:</span><b>${formatNumber(d.x)}</b></div>
        <div class="ribote-d3-tooltip__row"><span>${escapeHtml(resolvedYLabel)}:</span><b>${formatNumber(d.y)}</b></div>
        ${Number.isFinite(d.pvalue) ? `<div class="ribote-d3-tooltip__row"><span>pvalue:</span><b>${formatNumber(d.pvalue || 0)}</b></div>` : ""}
        ${Number.isFinite(d.padj) ? `<div class="ribote-d3-tooltip__row"><span>padj:</span><b>${formatNumber(d.padj || 0)}</b></div>` : ""}
        ${Number.isFinite(d.te) ? `<div class="ribote-d3-tooltip__row"><span>TE_log2FC:</span><b>${formatNumber(d.te || 0)}</b></div>` : ""}
      `);
    })
    .on("mousemove", (event) => positionTooltip(tooltip, container, event))
    .on("mouseleave", function() {
      d3.select(this).attr("opacity", 0.78).attr("r", 4.2);
      tooltip.style("opacity", 0);
    });

  const xAxis = d3.axisBottom(x).ticks(6).tickSizeOuter(0);
  const yAxis = d3.axisLeft(y).ticks(6).tickSizeOuter(0);
  if (scaleType === "log2") {
    xAxis.tickValues(xTickValues as number[]).tickFormat(formatLogTick);
    yAxis.tickValues(yTickValues as number[]).tickFormat(formatLogTick);
  }

  chart.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(xAxis)
    .call((axis) => axis.select(".domain").attr("stroke", "#000"))
    .call((axis) => axis.selectAll(".tick line").attr("stroke", "#000"))
    .call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-tick"));
  chart.append("g")
    .call(yAxis)
    .call((axis) => axis.select(".domain").attr("stroke", "#000"))
    .call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-tick"));

  svg.append("text").attr("x", margin.left + innerWidth / 2).attr("y", height - 8).attr("text-anchor", "middle").attr("class", "ribote-d3-caption").text(resolvedXLabel);
  svg.append("text").attr("transform", "rotate(-90)").attr("x", -(margin.top + innerHeight / 2)).attr("y", 18).attr("text-anchor", "middle").attr("class", "ribote-d3-caption").text(resolvedYLabel);

  if (options.showLegend !== false) {
    const statuses = ["Up", "Non", "Down"].filter((status) => plotRows.some((row) => row.group === status));
    const legendItems = statuses.length ? statuses : Array.from(new Set(plotRows.map((row) => row.group).filter(Boolean))) as string[];
    const legendItemWidth = 126;
    const legend = svg.append("g").attr("transform", `translate(${Math.max((width - legendItemWidth * legendItems.length) / 2, margin.left)}, 32)`);
    legendItems.forEach((item, index) => {
      const count = plotRows.filter((row) => row.group === item).length;
      const group = legend.append("g").attr("transform", `translate(${index * legendItemWidth}, 0)`);
      group.append("rect").attr("width", 14).attr("height", 14).attr("rx", 5).attr("fill", groupColors[item] || "#147782");
      group.append("text").attr("x", 22).attr("y", 12).attr("class", "ribote-d3-legend").text(`${item} (${options.legendCounts?.[item] ?? count})`);
    });
  }

  if (options.showCorrelation) {
    const correlation = pearson(plotRows);
    if (Number.isFinite(correlation)) {
      svg.append("text").attr("x", width - margin.right).attr("y", 15).attr("text-anchor", "end").attr("class", "ribote-d3-caption").text(`Pearson r = ${formatNumber(correlation || 0)}`);
    }
  }

  appendDisplaySubsetNotice(root, displaySubset);
}

function drawPcaProjection(container: HTMLDivElement, rows: ScatterPoint[], options: ScatterDrawOptions, xLabel = "X", yLabel = "Y") {
  const resolvedXLabel = options.xLabel || xLabel;
  const resolvedYLabel = options.yLabel || yLabel;
  const root = d3.select(container);
  root.selectAll("*").remove();
  root.style("position", "relative");

  const plotRows = rows.filter((row) => Number.isFinite(row.x) && Number.isFinite(row.y));
  if (!plotRows.length) {
    root.append("div").attr("class", "ribote-d3-empty").text("No chart data available.");
    return;
  }

  const width = container.clientWidth || 960;
  const height = options.height || 600;
  const margin = { top: 68, right: 28, bottom: 74, left: 82 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("class", "ribote-d3-chart ribote-pca-chart");
  const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const tooltip = createViewportTooltip(container);
  const x = d3.scaleLinear().domain(paddedLinearDomain(plotRows.map((row) => row.x))).nice().range([0, innerWidth]);
  const y = d3.scaleLinear().domain(paddedLinearDomain(plotRows.map((row) => row.y))).nice().range([innerHeight, 0]);
  const xAxis = d3.axisBottom(x).ticks(6);
  const yAxis = d3.axisLeft(y).ticks(6);

  svg.append("text").attr("x", 0).attr("y", 3).attr("text-anchor", "start").attr("class", "ribote-d3-chart-title ribote-d3-chart-title--qc").text(options.title);

  chart.append("g")
    .attr("class", "ribote-d3-grid ribote-d3-grid--x")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickSize(-innerHeight).tickFormat(() => ""));
  chart.append("g")
    .attr("class", "ribote-d3-grid ribote-d3-grid--y")
    .call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(() => ""));

  chart.append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", innerWidth)
    .attr("height", innerHeight)
    .attr("fill", "none")
    .attr("class", "ribote-pca-frame");

  if (x(0) >= 0 && x(0) <= innerWidth) {
    chart.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", innerHeight).attr("class", "ribote-d3-zero-line");
  }
  if (y(0) >= 0 && y(0) <= innerHeight) {
    chart.append("line").attr("x1", 0).attr("x2", innerWidth).attr("y1", y(0)).attr("y2", y(0)).attr("class", "ribote-d3-zero-line");
  }

  chart.append("g")
    .attr("class", "ribote-pca-axis ribote-pca-axis--bottom")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(xAxis)
    .call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-tick"));
  chart.append("g")
    .attr("class", "ribote-pca-axis ribote-pca-axis--left")
    .call(yAxis)
    .call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-tick"));

  const points = chart.selectAll("g.ribote-pca-point")
    .data(plotRows)
    .enter()
    .append("g")
    .attr("class", "ribote-pca-point")
    .attr("transform", (d) => `translate(${x(d.x)},${y(d.y)})`);

  points.append("circle")
    .attr("r", 8)
    .attr("fill", (d) => groupColors[d.group || ""] || "#147782")
    .attr("fill-opacity", 0.9)
    .attr("stroke", "rgba(255, 255, 255, 0.92)")
    .attr("stroke-width", 1.5)
    .on("mouseenter", function(_event, d) {
      d3.select(this).attr("stroke-width", 2.5);
      const sample = d.displaySample || d.sample || "Sample";
      tooltip.style("opacity", 1).html(`
        <div class="ribote-d3-tooltip__title">${escapeHtml(sample)}</div>
        ${d.group ? `<div class="ribote-d3-tooltip__row"><span>Group:</span><b>${escapeHtml(d.group)}</b></div>` : ""}
        ${d.actualSample ? `<div class="ribote-d3-tooltip__row"><span>Actual:</span><b>${escapeHtml(d.actualSample)}</b></div>` : ""}
        ${d.actualRna ? `<div class="ribote-d3-tooltip__row"><span>RNA:</span><b>${escapeHtml(d.actualRna)}</b></div>` : ""}
        ${d.actualRibo ? `<div class="ribote-d3-tooltip__row"><span>Ribo:</span><b>${escapeHtml(d.actualRibo)}</b></div>` : ""}
        <div class="ribote-d3-tooltip__row"><span>${escapeHtml(resolvedXLabel)}:</span><b>${formatNumber(d.x)}</b></div>
        <div class="ribote-d3-tooltip__row"><span>${escapeHtml(resolvedYLabel)}:</span><b>${formatNumber(d.y)}</b></div>
      `);
    })
    .on("mousemove", (event) => positionTooltip(tooltip, container, event))
    .on("mouseleave", function() {
      d3.select(this).attr("stroke-width", 1.5);
      tooltip.style("opacity", 0);
    });

  points.append("text")
    .attr("x", 12)
    .attr("y", 4)
    .attr("class", "ribote-pca-point-label")
    .text((d) => d.displaySample || d.sample || "");

  chart.append("text").attr("x", innerWidth / 2).attr("y", innerHeight + 54).attr("text-anchor", "middle").attr("class", "ribote-d3-axis-label").text(resolvedXLabel);
  chart.append("text").attr("transform", "rotate(-90)").attr("x", -innerHeight / 2).attr("y", -56).attr("text-anchor", "middle").attr("class", "ribote-d3-axis-label").text(resolvedYLabel);

  const legendItems = ["Control", "Treatment"].filter((group) => plotRows.some((row) => row.group === group));
  const legendItemWidth = 172;
  const legendWidth = legendItemWidth * legendItems.length;
  const legendX = margin.left + Math.max(0, (innerWidth - legendWidth) / 2);
  const legend = svg.append("g").attr("transform", `translate(${legendX}, 28)`);
  legendItems.forEach((item, index) => {
    const group = legend.append("g").attr("transform", `translate(${index * legendItemWidth}, 0)`);
    group.append("circle").attr("r", 10).attr("cx", 10).attr("cy", 0).attr("fill", groupColors[item] || "#147782");
    group.append("text").attr("x", 30).attr("y", 6).attr("class", "ribote-d3-legend ribote-d3-legend--library").text(item);
  });
}

function drawMarginalDensityScatter(container: HTMLDivElement, rows: ScatterPoint[], options: ScatterDrawOptions, xLabel = "X", yLabel = "Y") {
  const resolvedXLabel = options.xLabel || xLabel;
  const resolvedYLabel = options.yLabel || yLabel;
  const root = d3.select(container);
  root.selectAll("*").remove();
  root.style("position", "relative");

  const validRows = rows.filter((row) => Number.isFinite(row.x) && Number.isFinite(row.y));
  const displaySubset = buildDisplaySubset(validRows, options);
  const plotRows = displaySubset.rows;
  if (!plotRows.length) {
    root.append("div").attr("class", "ribote-d3-empty").text("No chart data available.");
    return;
  }

  const width = container.clientWidth || 960;
  const height = options.height || 600;
  const margin = { top: 58, right: 60, bottom: 62, left: 76 };
  const topHeight = 96;
  const rightWidth = 96;
  const scatterWidth = width - margin.left - margin.right - rightWidth;
  const scatterHeight = height - margin.top - margin.bottom - topHeight;
  const xDomain = options.xDomain || [-4, 4];
  const yDomain = options.yDomain || [-4, 4];
  const x = d3.scaleLinear().domain(xDomain).range([0, scatterWidth]);
  const y = d3.scaleLinear().domain(yDomain).range([scatterHeight, 0]);
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("class", "ribote-d3-chart");
  const scatter = svg.append("g").attr("transform", `translate(${margin.left},${margin.top + topHeight})`);
  const topChart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const rightChart = svg.append("g").attr("transform", `translate(${margin.left + scatterWidth},${margin.top + topHeight})`);
  const tooltip = createViewportTooltip(container);
  const clipId = `ribote-te-marginal-${Date.now()}-${Math.round(Math.random() * 100000)}`;

  svg.append("defs")
    .append("clipPath")
    .attr("id", clipId)
    .append("rect")
    .attr("width", scatterWidth)
    .attr("height", scatterHeight);

  svg.append("text").attr("x", 0).attr("y", 3).attr("class", "ribote-d3-chart-title").text(options.title);

  const legendItems = ["Up", "Non", "Down"];
  const densitySteps = d3.range(xDomain[0], xDomain[1] + 0.001, 0.1);
  const densityBandwidth = 0.45;
  const densityX = options.densityX?.length ? options.densityX : legendItems.map((group) => ({
    group,
    points: kernelDensityEstimator(kernelEpanechnikov(densityBandwidth), densitySteps, plotRows.filter((row) => row.group === group).map((row) => row.x))
  }));
  const densityY = options.densityY?.length ? options.densityY : legendItems.map((group) => ({
    group,
    points: kernelDensityEstimator(kernelEpanechnikov(densityBandwidth), densitySteps, plotRows.filter((row) => row.group === group).map((row) => row.y))
  }));
  const topMax = d3.max(densityX.flatMap((entry) => entry.points.map((point) => point.density))) || 1;
  const rightMax = d3.max(densityY.flatMap((entry) => entry.points.map((point) => point.density))) || 1;
  const topScale = d3.scaleLinear().domain([0, topMax]).range([topHeight, 0]);
  const rightScale = d3.scaleLinear().domain([0, rightMax]).range([0, rightWidth]);
  const topArea = d3.area<DensitySeries["points"][number]>().curve(d3.curveBasis).x((point) => x(point.value)).y0(topHeight).y1((point) => topScale(point.density));
  const rightArea = d3.area<DensitySeries["points"][number]>().curve(d3.curveBasis).y((point) => y(point.value)).x0(0).x1((point) => rightScale(point.density));

  densityX.forEach(({ group, points }) => {
    topChart.append("path")
      .datum(points)
      .attr("d", topArea)
      .attr("fill", groupColors[group] || "#8fa1a7")
      .attr("opacity", 0.45)
      .attr("stroke", "#111")
      .attr("stroke-width", 0.9);
  });
  densityY.forEach(({ group, points }) => {
    rightChart.append("path")
      .datum(points)
      .attr("d", rightArea)
      .attr("fill", groupColors[group] || "#8fa1a7")
      .attr("opacity", 0.45)
      .attr("stroke", "#111")
      .attr("stroke-width", 0.9);
  });

  scatter.append("g")
    .attr("clip-path", `url(#${clipId})`)
    .selectAll("circle")
    .data(plotRows)
    .enter()
    .append("circle")
    .attr("cx", (row) => x(row.x))
    .attr("cy", (row) => y(row.y))
    .attr("r", 4.2)
    .attr("fill", (row) => groupColors[row.group || ""] || "#8fa1a7")
    .attr("opacity", 0.72)
    .on("mouseenter", function(_event, row) {
      d3.select(this).attr("opacity", 1).attr("stroke", "#17292f").attr("stroke-width", 1.2);
      tooltip.style("opacity", 1).html(`
        <div class="ribote-d3-tooltip__title">${escapeHtml(row.GeneID || row.gene || "Point")}</div>
        ${row.group ? `<div class="ribote-d3-tooltip__row"><span>Status:</span><b>${escapeHtml(row.group)}</b></div>` : ""}
        <div class="ribote-d3-tooltip__row"><span>${escapeHtml(resolvedXLabel)}:</span><b>${formatNumber(row.x)}</b></div>
        <div class="ribote-d3-tooltip__row"><span>${escapeHtml(resolvedYLabel)}:</span><b>${formatNumber(row.y)}</b></div>
        ${Number.isFinite(row.te) ? `<div class="ribote-d3-tooltip__row"><span>TE_log2FC:</span><b>${formatNumber(row.te || 0)}</b></div>` : ""}
      `);
    })
    .on("mousemove", (event) => positionTooltip(tooltip, container, event))
    .on("mouseleave", function() {
      d3.select(this).attr("opacity", 0.72).attr("stroke", "none");
      tooltip.style("opacity", 0);
    });

  scatter.append("g")
    .attr("transform", `translate(0,${scatterHeight})`)
    .call(d3.axisBottom(x).tickValues([-4, -2, 0, 2, 4]).tickSizeOuter(0))
    .call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-tick"));
  scatter.append("g")
    .call(d3.axisLeft(y).tickValues([-4, -2, 0, 2, 4]).tickSizeOuter(0))
    .call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-tick"));
  scatter.append("rect").attr("width", scatterWidth).attr("height", scatterHeight).attr("fill", "none").attr("stroke", "#000").attr("stroke-width", 1);
  topChart.append("g").attr("transform", `translate(0,${topHeight})`).call(d3.axisBottom(x).tickValues([]).tickSize(0)).call((axis) => axis.select(".domain").attr("stroke", "#000"));
  rightChart.append("g").call(d3.axisLeft(y).tickValues([]).tickSize(0)).call((axis) => axis.select(".domain").attr("stroke", "#000"));

  svg.append("text").attr("x", margin.left + scatterWidth / 2).attr("y", height - 8).attr("text-anchor", "middle").attr("class", "ribote-d3-caption").text(resolvedXLabel);
  svg.append("text").attr("transform", `translate(18, ${margin.top + topHeight + scatterHeight / 2}) rotate(-90)`).attr("text-anchor", "middle").attr("class", "ribote-d3-caption").text(resolvedYLabel);

  const legendItemWidth = 136;
  const legend = svg.append("g").attr("transform", `translate(${Math.max((width - legendItemWidth * legendItems.length) / 2, margin.left)}, 32)`);
  legendItems.forEach((item, index) => {
    const group = legend.append("g").attr("transform", `translate(${index * legendItemWidth}, 0)`);
    group.append("rect").attr("width", 16).attr("height", 16).attr("rx", 6).attr("fill", groupColors[item] || "#8fa1a7");
    group.append("text").attr("x", 24).attr("y", 13).attr("class", "ribote-d3-legend").text(`${item} (${options.legendCounts?.[item] ?? plotRows.filter((row) => row.group === item).length})`);
  });

  appendDisplaySubsetNotice(root, displaySubset);
}

export function drawSimpleBars(container: HTMLDivElement, rows: BarPoint[], title: string) {
  const root = d3.select(container);
  root.selectAll("*").remove();
  if (!rows.length) {
    root.append("div").attr("class", "ribote-d3-empty").text("No chart data available.");
    return;
  }

  const width = container.clientWidth || 960;
  const barHeight = 30;
  const height = 62 + rows.length * barHeight;
  const margin = { top: 32, right: 24, bottom: 34, left: 190 };
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("class", "ribote-d3-chart");
  const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const x = d3.scaleLinear().domain([0, d3.max(rows, (d) => d.value) || 1]).nice().range([0, innerWidth]);
  const y = d3.scaleBand().domain(rows.map((d) => d.label)).range([0, innerHeight]).padding(0.22);

  svg.append("text").attr("x", 0).attr("y", 3).attr("class", "ribote-d3-chart-title").text(title);
  chart.selectAll("rect").data(rows).enter().append("rect").attr("x", 0).attr("y", (d) => y(d.label) || 0).attr("width", (d) => x(d.value)).attr("height", y.bandwidth()).attr("fill", "#147782");
  chart.append("g").call(d3.axisLeft(y).tickSize(0)).call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-label"));
  chart.append("g").attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(x).ticks(5)).call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-tick"));
}

function positionTooltip(tooltip: d3.Selection<HTMLDivElement, unknown, HTMLElement, unknown>, container: HTMLElement, event: MouseEvent) {
  positionViewportTooltip(tooltip, container, event);
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toFixed(4).replace(/\.?0+$/, "") : "";
}

function ensureDomain(values: number[], scaleType: "linear" | "log2"): [number, number] {
  const finite = values.filter((value) => Number.isFinite(value) && (scaleType === "linear" || value > 0));
  if (!finite.length) {
    return scaleType === "log2" ? [1, 2] : [-1, 1];
  }
  const minValue = d3.min(finite) ?? 0;
  const maxValue = d3.max(finite) ?? 1;
  if (minValue === maxValue) {
    const delta = scaleType === "log2" ? Math.max(minValue * 0.5, 1e-6) : Math.max(Math.abs(minValue) * 0.15, 1);
    return [Math.max(scaleType === "log2" ? 1e-12 : -Infinity, minValue - delta), maxValue + delta];
  }
  if (scaleType === "log2") {
    return [Math.max(minValue, 1e-12), maxValue];
  }
  const padding = (maxValue - minValue) * 0.06;
  return [minValue - padding, maxValue + padding];
}

function paddedLinearDomain(values: number[]): [number, number] {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) {
    return [-1, 1];
  }
  const minValue = d3.min(finite) ?? -1;
  const maxValue = d3.max(finite) ?? 1;
  if (minValue === maxValue) {
    const delta = Math.max(Math.abs(minValue) * 0.18, 1);
    return [minValue - delta, maxValue + delta];
  }
  const padding = (maxValue - minValue) * 0.16;
  return [minValue - padding, maxValue + padding];
}

function buildDisplaySubset(rows: ScatterPoint[], options: ScatterDrawOptions) {
  const plotRows = limitScatterRows(rows, options.displayPointLimit ?? 5000);
  const displayedCount = options.displayedRows ?? plotRows.length;
  const originalCount = options.totalRows ?? rows.length;
  return {
    displayedCount,
    isSubset: originalCount > displayedCount || rows.length > plotRows.length,
    originalCount,
    rows: plotRows
  };
}

function appendDisplaySubsetNotice(
  root: d3.Selection<HTMLDivElement, unknown, null, undefined>,
  displaySubset: { displayedCount: number; isSubset: boolean; originalCount: number }
) {
  if (!displaySubset.isSubset) {
    return;
  }
  root.append("div")
    .attr("class", "ribote-chart-subset-note")
    .text(`Only a deterministic display subset is drawn (${displaySubset.displayedCount.toLocaleString()} of ${displaySubset.originalCount.toLocaleString()} points); table values and data exports still use the full result set.`);
}

function kernelEpanechnikov(bandwidth: number) {
  return (value: number) => {
    const ratio = value / bandwidth;
    return Math.abs(ratio) <= 1 ? 0.75 * (1 - ratio ** 2) / bandwidth : 0;
  };
}

function kernelDensityEstimator(kernel: (value: number) => number, thresholds: number[], values: number[]) {
  const finiteValues = values.filter(Number.isFinite);
  if (!finiteValues.length) {
    return thresholds.map((threshold) => ({ density: 0, value: threshold }));
  }
  return thresholds.map((threshold) => ({
    density: d3.mean(finiteValues, (value) => kernel(threshold - value)) || 0,
    value: threshold
  }));
}

function linearYScale(domain: [number, number], preserveMin: boolean) {
  const scale = d3.scaleLinear().domain(domain);
  if (!preserveMin) {
    return scale.nice();
  }
  const upperDomain = d3.scaleLinear().domain(domain).nice().domain();
  return scale.domain([domain[0], upperDomain[1]]);
}

function limitScatterRows(rows: ScatterPoint[], limit: number) {
  if (!Number.isFinite(limit) || limit <= 0 || rows.length <= limit) {
    return rows;
  }
  const roundedLimit = Math.floor(limit);
  const priorityRows = rows.filter((row) => row.group && row.group !== "Non");
  const backgroundRows = rows.filter((row) => !row.group || row.group === "Non");
  if (priorityRows.length >= roundedLimit) {
    return sampleRows(priorityRows, roundedLimit);
  }
  return [...priorityRows, ...sampleRows(backgroundRows, roundedLimit - priorityRows.length)];
}

function sampleRows(rows: ScatterPoint[], limit: number) {
  if (limit <= 0) {
    return [];
  }
  if (rows.length <= limit) {
    return rows;
  }
  const sampled: ScatterPoint[] = [];
  const seen = new Set<number>();
  for (let index = 0; index < limit; index += 1) {
    const sourceIndex = Math.min(rows.length - 1, Math.round(index * (rows.length - 1) / Math.max(limit - 1, 1)));
    if (!seen.has(sourceIndex)) {
      seen.add(sourceIndex);
      sampled.push(rows[sourceIndex]);
    }
  }
  return sampled;
}

function logTickValues(domain: [number, number]) {
  const minValue = Math.max(domain[0], 1e-12);
  const maxValue = Math.max(domain[1], minValue * 2);
  const minExponent = Math.floor(Math.log2(minValue));
  const maxExponent = Math.ceil(Math.log2(maxValue));
  const span = Math.max(maxExponent - minExponent, 1);
  const step = Math.max(1, Math.ceil(span / 4));
  const ticks: number[] = [];
  for (let exponent = minExponent; exponent <= maxExponent; exponent += step) {
    ticks.push(2 ** exponent);
  }
  const maxTick = 2 ** maxExponent;
  if (!ticks.includes(maxTick)) {
    ticks.push(maxTick);
  }
  return ticks.filter((value) => value >= minValue && value <= maxValue);
}

function formatLogTick(value: d3.NumberValue, _index?: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }
  if (numeric >= 10000 || numeric < 0.1) {
    return d3.format(".4e")(numeric);
  }
  if (numeric >= 100) {
    return d3.format(",.0f")(numeric);
  }
  if (numeric >= 1) {
    return d3.format("~g")(numeric);
  }
  return d3.format(".4f")(numeric);
}

function pearson(rows: ScatterPoint[]) {
  if (rows.length < 2) {
    return null;
  }
  const meanX = d3.mean(rows, (row) => row.x) || 0;
  const meanY = d3.mean(rows, (row) => row.y) || 0;
  const numerator = d3.sum(rows, (row) => (row.x - meanX) * (row.y - meanY));
  const denominatorX = Math.sqrt(d3.sum(rows, (row) => (row.x - meanX) ** 2));
  const denominatorY = Math.sqrt(d3.sum(rows, (row) => (row.y - meanY) ** 2));
  return denominatorX && denominatorY ? numerator / (denominatorX * denominatorY) : null;
}
