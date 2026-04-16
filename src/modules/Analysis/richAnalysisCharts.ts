// @ts-nocheck
import * as d3 from "d3";
import { createViewportTooltip, positionViewportTooltip } from "@/utils/chartTooltip";

const teColors = { Up: "#0f6d78", Non: "#8fa1a7", Down: "#d45a2a" };
const sampleColors = { Control: "#0d6c88", Treatment: "#d45a2a" };
const networkLayoutCache = new Map();
const GSEA_TEXT_COLOR = "#17292f";
const GSEA_AXIS_COLOR = "#000000";
const GSEA_FONT_FAMILY = "sans-serif";

function positionTooltip(tooltip, container, event) {
  positionViewportTooltip(tooltip, container, event);
}

function numberValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function fmt(value, digits = 4) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : "NA";
}

function pct(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${(numeric * 100).toFixed(2)}%` : "NA";
}

function pval(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "NA";
  return numeric < 1e-3 ? numeric.toExponential(2) : numeric.toFixed(4);
}

function valueDomain(values) {
  const numeric = values.filter(Number.isFinite);
  if (!numeric.length) return [-1, 0, 1];
  let minValue = d3.min(numeric);
  let maxValue = d3.max(numeric);
  if (minValue === maxValue) {
    const delta = Math.max(Math.abs(minValue) * 0.2, 1);
    minValue -= delta;
    maxValue += delta;
  }
  return minValue < 0 && maxValue > 0 ? [minValue, 0, maxValue] : [minValue, d3.median(numeric), maxValue];
}

function bandSelection(domain, scale, start, end) {
  const min = Math.min(start, end);
  const max = Math.max(start, end);
  const indexes = domain
    .map((label, index) => {
      const cellStart = scale(label);
      if (cellStart === undefined) return null;
      const cellEnd = cellStart + scale.bandwidth();
      return cellEnd >= min && cellStart <= max ? index : null;
    })
    .filter((index) => index !== null);
  if (!indexes.length) return null;
  return { start: d3.min(indexes), end: d3.max(indexes) };
}

function activeCellMatches(activeCell, cell) {
  if (!activeCell) return false;
  return activeCell.gene === cell.gene && activeCell.displaySample === cell.column.displaySample;
}

function drawPlotFrame(target, width, height, strokeWidth = 1.5) {
  [
    { x1: 0, x2: width, y1: 0, y2: 0 },
    { x1: width, x2: width, y1: 0, y2: height },
    { x1: 0, x2: width, y1: height, y2: height },
    { x1: 0, x2: 0, y1: 0, y2: height }
  ].forEach((edge) => {
    target
      .append("line")
      .attr("x1", edge.x1)
      .attr("x2", edge.x2)
      .attr("y1", edge.y1)
      .attr("y2", edge.y2)
      .attr("stroke", "#000000")
      .attr("stroke-width", strokeWidth)
      .attr("stroke-linecap", "square")
      .attr("shape-rendering", "crispEdges")
      .attr("vector-effect", "non-scaling-stroke");
  });
}

export function normalizeHeatmap(input) {
  return {
    title: String(input?.title || ""),
    subtitle: String(input?.subtitle || ""),
    palette: Array.isArray(input?.palette) ? input.palette.map(String) : ["#4b74b6", "#ffffff", "#c23b35"],
    rows: Array.isArray(input?.rowLabels) ? input.rowLabels.map(String) : [],
    columns: Array.isArray(input?.columns) ? input.columns.map((column, index) => ({
      displaySample: String(column?.displaySample || `Sample ${index + 1}`),
      actualSample: String(column?.actualSample || ""),
      actualRna: String(column?.actualRna || ""),
      actualRibo: String(column?.actualRibo || ""),
      group: String(column?.group || "")
    })) : [],
    matrix: Array.isArray(input?.matrix) ? input.matrix.map((row) => (Array.isArray(row) ? row : Object.values(row || {})).map(Number)) : [],
    showRowLabels: Boolean(input?.showRowLabels),
    brushEnabled: input?.brushEnabled !== false,
    emptyMessage: String(input?.emptyMessage || "No heatmap data available.")
  };
}

export function drawClusteringHeatmap(container, heatmap, options = {}) {
  const root = d3.select(container);
  root.selectAll("*").remove();
  root.style("position", "relative");
  if (!heatmap.rows.length || !heatmap.columns.length || !heatmap.matrix.length) {
    root.append("div").attr("class", "ribote-d3-empty").text(heatmap.emptyMessage || options.emptyMessage || "No heatmap data available.");
    return;
  }
  const width = container.clientWidth || 960;
  const longest = d3.max(heatmap.rows, (row) => String(row).length) || 0;
  const left = heatmap.showRowLabels ? Math.min(200, Math.max(94, longest * 7.2)) : 24;
  const height = Number(options.chartHeight) || (heatmap.showRowLabels ? Math.min(980, Math.max(500, heatmap.rows.length * 14 + 240)) : 780);
  const margin = { top: 78, right: 28, bottom: 68, left };
  const innerWidth = Math.max(120, width - margin.left - margin.right);
  const innerHeight = Math.max(180, height - margin.top - margin.bottom);
  const bandHeight = Math.max(120, innerHeight - 28);
  const x = d3.scaleBand().domain(heatmap.columns.map((column) => column.displaySample)).range([0, innerWidth]).paddingInner(0.01);
  const y = d3.scaleBand().domain(heatmap.rows).range([0, bandHeight]);
  const values = heatmap.matrix.flat().map(Number).filter(Number.isFinite);
  const color = d3.scaleLinear().domain(valueDomain(values)).range(heatmap.palette.slice(0, 3)).clamp(true);
  const tooltip = createViewportTooltip(container);
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("class", "ribote-d3-chart");
  const title = heatmap.subtitle ? `${heatmap.title} (${heatmap.subtitle})` : heatmap.title;
  svg.append("text").attr("x", 0).attr("y", 3).attr("class", "ribote-d3-chart-title ribote-d3-chart-title--library").text(title);
  const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const legend = chart.append("g").attr("transform", `translate(${Math.max(0, (innerWidth - 264) / 2)}, -10)`);
  [{ label: "Treatment", color: sampleColors.Treatment }, { label: "Control", color: sampleColors.Control }].forEach((item, index) => {
    const entry = legend.append("g").attr("transform", `translate(${index * 132},0)`);
    entry.append("rect").attr("x", 0).attr("y", -11).attr("width", 16).attr("height", 10).attr("rx", 2).attr("fill", item.color);
    entry.append("text").attr("x", 24).attr("y", -3).attr("class", "ribote-d3-caption ribote-d3-caption--library").text(item.label);
  });
  const sampleMetaHtml = (column) => `
    <div class="ribote-d3-tooltip__title">${column.displaySample}</div>
    <div class="ribote-d3-tooltip__row"><span>Actual:</span><b>${column.actualSample || column.displaySample}</b></div>
    ${column.actualRna ? `<div class="ribote-d3-tooltip__row"><span>Actual RNA:</span><b>${column.actualRna}</b></div>` : ""}
    ${column.actualRibo ? `<div class="ribote-d3-tooltip__row"><span>Actual Ribo:</span><b>${column.actualRibo}</b></div>` : ""}
    <div class="ribote-d3-tooltip__row"><span>Group:</span><b>${column.group || "NA"}</b></div>
  `;
  chart.append("g").selectAll("rect").data(heatmap.columns).enter().append("rect")
    .attr("x", (column) => x(column.displaySample) || 0).attr("y", 0)
    .attr("width", Math.max(1, x.bandwidth())).attr("height", 18).attr("rx", 2)
    .attr("fill", (column) => sampleColors[column.group] || sampleColors.Control).attr("opacity", 0.88)
    .attr("stroke", "rgba(0, 0, 0, 0.18)")
    .attr("stroke-width", 0.5)
    .on("mouseenter", function(event, column) {
      d3.select(this).attr("stroke", "#202020").attr("stroke-width", 1.2);
      tooltip.style("opacity", 1).html(sampleMetaHtml(column));
      positionTooltip(tooltip, container, event);
    })
    .on("mousemove", (event) => positionTooltip(tooltip, container, event))
    .on("mouseleave", function() {
      d3.select(this).attr("stroke", null);
      tooltip.style("opacity", 0);
    });
  const plot = chart.append("g").attr("transform", "translate(0,28)");
  const cells = [];
  heatmap.matrix.forEach((row, rowIndex) => row.forEach((value, colIndex) => {
    if (heatmap.columns[colIndex]) cells.push({ gene: heatmap.rows[rowIndex], column: heatmap.columns[colIndex], value: numberValue(value) });
  }));
  plot.append("rect")
    .attr("width", innerWidth)
    .attr("height", bandHeight)
    .attr("fill", "#fff");
  plot.selectAll("rect.cell").data(cells).enter().append("rect")
    .attr("class", "cell")
    .attr("x", (cell) => x(cell.column.displaySample) || 0)
    .attr("y", (cell) => y(cell.gene) || 0)
    .attr("width", Math.max(1, x.bandwidth()))
    .attr("height", Math.max(1, y.bandwidth()))
    .attr("fill", (cell) => color(cell.value))
    .attr("stroke", (cell) => activeCellMatches(options.activeCell, { ...cell, displaySample: cell.column.displaySample }) ? "#202020" : null)
    .attr("stroke-width", (cell) => activeCellMatches(options.activeCell, { ...cell, displaySample: cell.column.displaySample }) ? 1.4 : null)
    .on("mouseenter", function(event, cell) {
      d3.select(this).attr("stroke", "#202020").attr("stroke-width", 1.2);
      tooltip.style("opacity", 1).html(`<div class="ribote-d3-tooltip__title">${cell.gene}</div><div class="ribote-d3-tooltip__row"><span>Sample:</span><b>${cell.column.displaySample}</b></div><div class="ribote-d3-tooltip__row"><span>Actual:</span><b>${cell.column.actualSample}</b></div><div class="ribote-d3-tooltip__row"><span>Group:</span><b>${cell.column.group}</b></div><div class="ribote-d3-tooltip__row"><span>Value:</span><b>${fmt(cell.value)}</b></div>`);
      positionTooltip(tooltip, container, event);
    })
    .on("mousemove", (event) => positionTooltip(tooltip, container, event))
    .on("mouseleave", function(_event, cell) {
      d3.select(this)
        .attr("stroke", activeCellMatches(options.activeCell, { ...cell, displaySample: cell.column.displaySample }) ? "#202020" : null)
        .attr("stroke-width", activeCellMatches(options.activeCell, { ...cell, displaySample: cell.column.displaySample }) ? 1.4 : null);
      tooltip.style("opacity", 0);
    })
    .on("click", (_event, cell) => options.onCellClick?.(cell));
  const xAxis = plot.append("g").attr("transform", `translate(0,${bandHeight})`);
  xAxis.selectAll("text")
    .data(heatmap.columns)
    .enter()
    .append("text")
    .attr("x", (column) => (x(column.displaySample) || 0) + x.bandwidth() / 2)
    .attr("y", 10)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "hanging")
    .attr("class", "ribote-d3-axis-tick")
    .style("cursor", "help")
    .text((column) => column.displaySample)
    .on("mouseenter", function(event, column) {
      tooltip.style("opacity", 1).html(sampleMetaHtml(column));
      positionTooltip(tooltip, container, event);
    })
    .on("mousemove", (event) => positionTooltip(tooltip, container, event))
    .on("mouseleave", () => {
      tooltip.style("opacity", 0);
    });
  if (heatmap.showRowLabels) {
    plot.append("g").call(d3.axisLeft(y).tickValues(heatmap.rows.filter((_row, index) => index % Math.max(1, Math.ceil(heatmap.rows.length / 42)) === 0))).call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-text"));
  }
  if (typeof options.onBrushSelection === "function" && heatmap.brushEnabled !== false) {
    const brush = d3.brush()
      .extent([[0, 0], [innerWidth, bandHeight]])
      .on("end", ({ selection }) => {
        if (!selection) return;
        const xSelection = bandSelection(heatmap.columns.map((column) => column.displaySample), x, selection[0][0], selection[1][0]);
        const ySelection = bandSelection(heatmap.rows, y, selection[0][1], selection[1][1]);
        if (!xSelection || !ySelection) {
          plot.select(".ribote-clustering-brush").call(brush.move, null);
          return;
        }
        options.onBrushSelection({
          rowStart: ySelection.start,
          rowEnd: ySelection.end,
          colStart: xSelection.start,
          colEnd: xSelection.end,
          nonce: Date.now()
        });
        plot.select(".ribote-clustering-brush").call(brush.move, null);
      });
    const brushGroup = plot.append("g").attr("class", "ribote-clustering-brush");
    brushGroup.call(brush);
    brushGroup.selectAll(".selection")
      .attr("fill", "rgba(29, 110, 98, 0.46)")
      .attr("stroke", "#0a5963")
      .attr("stroke-width", 1.8)
      .attr("shape-rendering", "crispEdges");
    brushGroup.selectAll(".handle").attr("display", "none");
    brushGroup.selectAll(".overlay").style("cursor", "crosshair");
  }
  drawPlotFrame(plot.append("g").attr("class", "ribote-clustering-frame"), innerWidth, bandHeight, 1.5);
  return () => {
    tooltip.remove();
  };
}

export function drawNetworkGraph(container, graph, showLabels = true) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes.map((node) => ({ ...node })) : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges.map((edge) => ({
    source: String(edge?.source || ""),
    target: String(edge?.target || ""),
    weight: Number(edge?.weight)
  })).filter((edge) => edge.source && edge.target && Number.isFinite(edge.weight)) : [];
  const root = d3.select(container);
  root.selectAll("*").remove();
  root.style("position", "relative");
  if (!nodes.length) {
    root.append("div").attr("class", "ribote-d3-empty").text("No network graph is available.");
    return;
  }
  const width = container.clientWidth || 960;
  const nodeMap = new Map(nodes.map((node) => [String(node.id), { ...node, id: String(node.id) }]));
  const linkData = edges.filter((edge) => nodeMap.has(edge.source) && nodeMap.has(edge.target));
  const dense = nodes.length > 60 || linkData.length > 220;
  const veryDense = nodes.length > 100 || linkData.length > 360;
  const calculatedHeight = veryDense
    ? Math.max(860, Math.min(1320, 620 + nodes.length * 5.1))
    : dense
      ? Math.max(700, Math.min(1120, 540 + nodes.length * 4.4))
      : Math.max(520, Math.min(860, 460 + nodes.length * 2));
  const height = Math.max(calculatedHeight, container.clientHeight || 0);
  const tooltip = createViewportTooltip(container);
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("class", "ribote-d3-chart");
  svg.append("text").attr("x", 0).attr("y", 3).attr("class", "ribote-d3-chart-title ribote-d3-chart-title--library").text(graph?.title || "Network Graph");
  const moduleNames = Array.from(new Set(nodes.map((node) => node.module).filter(Boolean)));
  const color = (moduleName) => {
    const probe = document.createElement("span");
    probe.style.color = moduleName || "#147782";
    return probe.style.color || "#147782";
  };
  if (moduleNames.length) {
    const legend = svg.append("g").attr("transform", "translate(0, 30)");
    moduleNames.slice(0, 10).forEach((name, index) => {
      const entry = legend.append("g").attr("transform", `translate(${index * 142},0)`);
      entry.append("circle").attr("r", 7).attr("cx", 7).attr("cy", 0).attr("fill", color(name)).attr("stroke", "rgba(0,0,0,0.16)").attr("stroke-width", 1);
      entry.append("text").attr("x", 22).attr("y", 5).attr("class", "ribote-d3-legend ribote-d3-legend--library").text(name);
    });
  }
  const topOffset = moduleNames.length ? 78 : 28;
  const chart = svg.append("g").attr("transform", `translate(0, ${topOffset})`);
  const visibleHeight = Math.max(320, height - topOffset - 24);
  const clipId = `ribote-network-clip-${Math.round(Math.random() * 1e9)}`;
  svg.append("defs").append("clipPath").attr("id", clipId).append("rect").attr("width", width).attr("height", visibleHeight);
  const viewport = chart.append("g").attr("clip-path", `url(#${clipId})`);
  const interactionRect = viewport.append("rect").attr("width", width).attr("height", visibleHeight).attr("fill", "transparent").style("cursor", "grab");
  const zoomLayer = viewport.append("g").attr("class", "ribote-network-zoom-layer");
  const linkLayer = zoomLayer.append("g");
  const nodeLayer = zoomLayer.append("g");
  const labelLayer = zoomLayer.append("g").style("pointer-events", "none");
  const radius = d3.scaleSqrt().domain([0, d3.max(nodes, (node) => Math.max(node.degree || 0, 1)) || 1]).range([4.2, 9.4]);
  const cacheKey = `${graph?.signature || "network"}::${width}::${height}`;
  const cached = networkLayoutCache.get(cacheKey);
  const simulationNodes = Array.isArray(cached)
    ? cached.map((node) => ({ ...node }))
    : Array.from(nodeMap.values()).map((node, index) => ({
      ...node,
      x: width / 2 + Math.cos((index / Math.max(nodes.length, 1)) * Math.PI * 2) * Math.min(width, visibleHeight) * (veryDense ? 0.16 : dense ? 0.22 : 0.3),
      y: visibleHeight / 2 + Math.sin((index / Math.max(nodes.length, 1)) * Math.PI * 2) * Math.min(width, visibleHeight) * (veryDense ? 0.16 : dense ? 0.22 : 0.3)
    }));
  const nodeById = new Map(simulationNodes.map((node) => [node.id, node]));
  const simulationLinks = linkData.map((edge) => ({ ...edge, source: nodeById.get(edge.source) || edge.source, target: nodeById.get(edge.target) || edge.target }));
  const baseDistance = veryDense ? 164 : dense ? 186 : 212;
  const minDistance = veryDense ? 44 : dense ? 54 : 68;
  const collisionPadding = veryDense ? 9 : dense ? 12 : 20;
  const chargeFloor = veryDense ? -720 : dense ? -860 : -1040;
  const charge = veryDense
    ? Math.max(chargeFloor, -150 - nodes.length * 0.95)
    : dense
      ? Math.max(chargeFloor, -180 - nodes.length * 1.15)
      : Math.max(chargeFloor, -240 - nodes.length * 1.8);
  const simulation = d3.forceSimulation(simulationNodes)
    .force("link", d3.forceLink(simulationLinks).id((node) => node.id).distance((edge) => Math.max(minDistance, baseDistance - Number(edge.weight || 0) * 104)).strength((edge) => Math.max(0.1, Math.min(0.72, Number(edge.weight || 0) * 0.9))))
    .force("charge", d3.forceManyBody().strength(charge))
    .force("center", d3.forceCenter(width / 2, visibleHeight / 2 + 10))
    .force("collision", d3.forceCollide().radius((node) => radius(node.degree || 0) + collisionPadding))
    .stop();
  const tickCount = cached ? 16 : veryDense ? 54 : dense ? 78 : 110;
  for (let i = 0; i < tickCount; i += 1) simulation.tick();
  networkLayoutCache.set(cacheKey, simulationNodes.map((node) => ({ ...node })));
  const weightExtent = d3.extent(simulationLinks, (edge) => Number(edge.weight)) || [0, 1];
  const weight = d3.scaleLinear().domain([Number.isFinite(weightExtent[0]) ? weightExtent[0] : 0, Number.isFinite(weightExtent[1]) ? weightExtent[1] : 1]).range([0.55, 2.6]);
  const opacity = d3.scaleLinear().domain(weight.domain()).range([0.18, 0.72]);
  const links = linkLayer.selectAll("line").data(simulationLinks).enter().append("line")
    .attr("x1", (edge) => edge.source.x).attr("y1", (edge) => edge.source.y).attr("x2", (edge) => edge.target.x).attr("y2", (edge) => edge.target.y)
    .attr("stroke", "rgba(96, 125, 109, 0.75)").attr("stroke-linecap", "round").attr("stroke-opacity", (edge) => opacity(Number(edge.weight))).attr("stroke-width", (edge) => weight(Number(edge.weight)));
  const circles = nodeLayer.selectAll("circle").data(simulationNodes).enter().append("circle")
    .attr("cx", (node) => node.x).attr("cy", (node) => node.y)
    .attr("r", (node) => radius(node.degree || 0)).attr("fill", (node) => color(node.module)).attr("fill-opacity", 0.9)
    .attr("stroke", "rgba(255,255,255,0.92)").attr("stroke-width", 1.6).on("mouseenter", function(event, node) {
    d3.select(this).attr("stroke-width", 2.4);
    tooltip.style("opacity", 1).html(`<div class="ribote-d3-tooltip__title">${node.label || node.id}</div><div class="ribote-d3-tooltip__row"><span>GeneID:</span><b>${node.geneId || node.id}</b></div><div class="ribote-d3-tooltip__row"><span>Gene Name:</span><b>${node.geneName || "unknown"}</b></div><div class="ribote-d3-tooltip__row"><span>Module:</span><b>${node.module || "unassigned"}</b></div><div class="ribote-d3-tooltip__row"><span>Connectivity:</span><b>${fmt(node.connectivity, 4)}</b></div><div class="ribote-d3-tooltip__row"><span>Degree (thresholded):</span><b>${node.degree ?? 0}</b></div><div class="ribote-d3-tooltip__row"><span>Degree (displayed):</span><b>${node.displayDegree ?? 0}</b></div>`);
    positionTooltip(tooltip, container, event);
  }).on("mousemove", (event) => positionTooltip(tooltip, container, event)).on("mouseleave", function() {
    d3.select(this).attr("stroke-width", 1.6);
    tooltip.style("opacity", 0);
  });
  const labeledIds = new Set([...simulationNodes].sort((left, right) => (right.connectivity || 0) - (left.connectivity || 0)).slice(0, nodes.length <= 80 ? nodes.length : 80).map((node) => node.id));
  if (showLabels) {
    labelLayer.selectAll("text").data(simulationNodes.filter((node) => labeledIds.has(node.id))).enter().append("text")
      .attr("x", (node) => node.x + radius(node.degree || 0) + 4).attr("y", (node) => node.y + 3)
      .attr("class", "ribote-network-node-label").text((node) => node.label || node.id);
  }
  const updatePositions = () => {
    links.attr("x1", (edge) => edge.source.x).attr("y1", (edge) => edge.source.y).attr("x2", (edge) => edge.target.x).attr("y2", (edge) => edge.target.y);
    circles.attr("cx", (node) => node.x).attr("cy", (node) => node.y);
    labelLayer.selectAll("text").attr("x", (node) => node.x + radius(node.degree || 0) + 4).attr("y", (node) => node.y + 3);
    networkLayoutCache.set(cacheKey, simulationNodes.map((node) => ({ ...node })));
  };
  if (graph?.dragEnabled !== false) {
    circles.style("cursor", "move").call(d3.drag()
      .container(() => zoomLayer.node())
      .on("start", (event) => {
        event.sourceEvent?.stopPropagation?.();
        interactionRect.style("cursor", "grabbing");
      })
      .on("drag", (event, node) => {
        node.x = event.x;
        node.y = event.y;
        updatePositions();
      })
      .on("end", (event) => {
        event.sourceEvent?.stopPropagation?.();
        interactionRect.style("cursor", "grab");
        updatePositions();
      }));
  }
  const zoom = d3.zoom().scaleExtent([0.05, 12]).on("zoom", (event) => zoomLayer.attr("transform", event.transform));
  svg.call(zoom);
  const xExtent = d3.extent(simulationNodes, (node) => node.x) || [width / 2, width / 2];
  const yExtent = d3.extent(simulationNodes, (node) => node.y) || [visibleHeight / 2, visibleHeight / 2];
  const maxRadius = d3.max(simulationNodes, (node) => radius(node.degree || 0)) || 8;
  const bounds = {
    minX: xExtent[0] - maxRadius - 18,
    maxX: xExtent[1] + maxRadius + (showLabels ? 72 : 18),
    minY: yExtent[0] - maxRadius - 18,
    maxY: yExtent[1] + maxRadius + 18
  };
  const fitScale = Math.max(0.05, Math.min(10, Math.min((width - 36) / Math.max(1, bounds.maxX - bounds.minX), (visibleHeight - 36) / Math.max(1, bounds.maxY - bounds.minY))));
  const fitTransform = d3.zoomIdentity.translate(width / 2 - fitScale * ((bounds.minX + bounds.maxX) / 2), visibleHeight / 2 - fitScale * ((bounds.minY + bounds.maxY) / 2)).scale(fitScale);
  svg.call(zoom.transform, fitTransform);
  const handleFitView = () => svg.transition().duration(220).call(zoom.transform, fitTransform);
  container.addEventListener("ribote:network-fit-view", handleFitView);
  return () => {
    simulation.stop();
    container.removeEventListener("ribote:network-fit-view", handleFitView);
    tooltip.remove();
  };
}

export function drawSignalpOverview(container, rows, options = {}) {
  const root = d3.select(container);
  root.selectAll("*").remove();
  root.style("position", "relative");
  if (!rows.length) {
    root.append("div").attr("class", "ribote-d3-empty").text("No SignalP comparison is available.");
    return;
  }
  const width = container.clientWidth || 960;
  const height = Math.max(480, Math.min(620, 430 + Math.max(0, rows.length - 6) * 18));
  const margin = { top: 100, right: 34, bottom: 76, left: 84 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const methods = Array.from(new Set(rows.map((row) => row.methodLabel)));
  const groups = ["Up", "Non", "Down"];
  const yMax = Math.min(100, (d3.max(rows, (row) => Number(row.percent) * 100) || 0) * 1.18 || 10);
  const tooltip = createViewportTooltip(container);
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("class", "ribote-d3-chart");
  svg.append("text").attr("x", 0).attr("y", 3).attr("class", "ribote-d3-chart-title ribote-d3-chart-title--library").text(options.title || "SignalP Overview");
  svg.append("text").attr("x", 0).attr("y", 28).attr("class", "ribote-d3-chart-subtitle").text(options.subtitle || "Share of annotated genes within each Translation Efficiency group");
  const legend = svg.append("g").attr("transform", `translate(${Math.max(0, (width - 344) / 2)}, 66)`);
  groups.forEach((group, index) => {
    const item = legend.append("g").attr("transform", `translate(${index * 126},0)`);
    item.append("rect").attr("width", 18).attr("height", 18).attr("rx", 4).attr("fill", teColors[group]);
    item.append("text").attr("x", 28).attr("y", 14).attr("class", "ribote-d3-legend ribote-d3-legend--library").text(group);
  });
  const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const x0 = d3.scaleBand().domain(methods).range([0, innerWidth]).padding(0.24);
  const x1 = d3.scaleBand().domain(groups).range([0, x0.bandwidth()]).padding(0.16);
  const y = d3.scaleLinear().domain([0, yMax]).nice().range([innerHeight, 0]);
  chart.append("g").attr("class", "ribote-d3-grid").call(d3.axisLeft(y).ticks(5).tickSize(-innerWidth).tickFormat(() => "")).call((axis) => axis.select(".domain").remove()).call((axis) => axis.selectAll("line").attr("stroke", "#147782").attr("stroke-opacity", 0.14));
  chart.append("g").attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(x0).tickSize(0).tickSizeOuter(0)).call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-tick").attr("dy", "1.25em")).call((axis) => axis.selectAll("path").attr("stroke", "#000"));
  chart.append("g")
    .call(d3.axisLeft(y).ticks(5).tickSize(6).tickSizeOuter(0).tickFormat((value) => `${value}%`))
    .call((axis) => axis.select("path").attr("stroke", "#000"))
    .call((axis) => axis.selectAll(".tick line").attr("x2", -6).attr("stroke", "#000").attr("stroke-width", 1).attr("shape-rendering", "crispEdges"))
    .call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-tick").attr("dx", "-0.45em"));
  chart.append("text").attr("x", innerWidth / 2).attr("y", innerHeight + 56).attr("text-anchor", "middle").attr("class", "ribote-d3-axis-label").text("Annotation Method");
  chart.append("text").attr("transform", "rotate(-90)").attr("x", -innerHeight / 2).attr("y", -56).attr("text-anchor", "middle").attr("class", "ribote-d3-axis-label").text("Annotated Genes Within TE Group (%)");
  const barGroups = chart.append("g").selectAll("g").data(methods).join("g").attr("transform", (label) => `translate(${x0(label)},0)`);
  barGroups.selectAll("rect").data((label) => rows.filter((row) => row.methodLabel === label)).join("rect")
    .attr("x", (row) => x1(row.teGroup) || 0).attr("y", (row) => y(Number(row.percent) * 100)).attr("width", x1.bandwidth()).attr("height", (row) => innerHeight - y(Number(row.percent) * 100)).attr("rx", 5).attr("fill", (row) => teColors[row.teGroup] || "#147782")
    .on("mouseenter", function(event, row) {
      tooltip.style("opacity", 1).html(`<div class="ribote-d3-tooltip__title">${row.methodLabel} | ${row.teGroup}</div><div class="ribote-d3-tooltip__row"><span>Annotated:</span><b>${row.annotatedCount}</b></div><div class="ribote-d3-tooltip__row"><span>Total:</span><b>${row.totalCount}</b></div><div class="ribote-d3-tooltip__row"><span>Percentage:</span><b>${pct(row.percent)}</b></div><div class="ribote-d3-tooltip__row"><span>Up vs Non p:</span><b>${pval(row.upVsNonPValue)}</b></div><div class="ribote-d3-tooltip__row"><span>Down vs Non p:</span><b>${pval(row.downVsNonPValue)}</b></div>`);
      positionTooltip(tooltip, container, event);
      d3.select(this).attr("stroke", "rgba(16,35,42,0.28)");
    }).on("mousemove", (event) => positionTooltip(tooltip, container, event)).on("mouseleave", function() {
      tooltip.style("opacity", 0);
      d3.select(this).attr("stroke", null);
    });
  barGroups.selectAll("text.value").data((label) => rows.filter((row) => row.methodLabel === label)).join("text").attr("x", (row) => (x1(row.teGroup) || 0) + x1.bandwidth() / 2).attr("y", (row) => Math.max(12, y(Number(row.percent) * 100) - 8)).attr("text-anchor", "middle").attr("fill", "rgba(16,35,42,0.78)").style("font-size", "11px").style("font-weight", 700).text((row) => `${(Number(row.percent) * 100).toFixed(1)}%`);
}

export function normalizeGseaCatalog(catalog) {
  const metricPoints = Array.isArray(catalog?.metricPoints) ? catalog.metricPoints.map((point) => ({ x: Number(point?.x), y: Number(point?.y) })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)) : [];
  const pathways = new Map((Array.isArray(catalog?.pathways) ? catalog.pathways : []).map((entry) => ({
    pathwayId: String(entry?.pathwayId || ""),
    hits: Array.isArray(entry?.hits) ? entry.hits.map(Number).filter(Number.isFinite) : []
  })).filter((entry) => entry.pathwayId).map((entry) => [entry.pathwayId, entry]));
  return { maxRank: Number(catalog?.maxRank), metricPoints, pathways };
}

export function buildGseaPlotFromCatalog(row, collectionLabel, catalog) {
  if (!row || !catalog?.metricPoints?.length || !(catalog.pathways instanceof Map)) return null;
  const entry = catalog.pathways.get(String(row.pathwayId || ""));
  if (!entry?.hits?.length) return null;
  const metricPoints = catalog.metricPoints;
  const geneCount = metricPoints.length;
  const hits = entry.hits.filter((value) => value >= 1 && value <= geneCount);
  const hitSet = new Set(hits);
  const weights = metricPoints.map((point) => Math.abs(point.y));
  const totalWeight = hits.reduce((sum, position) => sum + weights[position - 1], 0);
  if (!hits.length || hits.length >= geneCount || !Number.isFinite(totalWeight) || totalWeight <= 0) return null;
  const missPenalty = -1 / (geneCount - hits.length);
  let running = 0;
  let peakX = 0;
  let peakY = 0;
  let peakAbs = -1;
  const points = metricPoints.map((point, index) => {
    running += hitSet.has(index + 1) ? weights[index] / totalWeight : missPenalty;
    if (Math.abs(running) > peakAbs) {
      peakAbs = Math.abs(running);
      peakX = point.x;
      peakY = running;
    }
    return { x: point.x, y: running };
  });
  return {
    pathwayId: String(row.pathwayId || ""),
    pathway: String(row.pathway || ""),
    collection: collectionLabel,
    nes: Number(row.nes),
    padj: Number(row.padj),
    pvalue: Number(row.pvalue),
    size: Number(row.size),
    leadingEdgeSize: Number(row.leadingEdgeSize),
    peakX,
    peakY,
    maxRank: Number.isFinite(catalog.maxRank) ? catalog.maxRank : geneCount,
    points,
    metricPoints,
    hits
  };
}

export function drawGseaPlot(container, plot) {
  const root = d3.select(container);
  root.selectAll("*").remove();
  root.style("position", "relative");
  if (!plot?.points?.length) {
    root.append("div").attr("class", "ribote-d3-empty").text("No enrichment plot is available.");
    return;
  }
  const width = container.clientWidth || 920;
  const height = 520;
  const margin = { top: 54, right: 22, bottom: 58, left: 68 };
  const innerWidth = Math.max(120, width - margin.left - margin.right);
  const innerHeight = Math.max(200, height - margin.top - margin.bottom);
  const curveHeight = Math.max(150, Math.round(innerHeight * 0.58));
  const rugHeight = 22;
  const metricHeight = Math.max(90, innerHeight - curveHeight - rugHeight - 28);
  const metricTop = curveHeight + rugHeight + 28;
  const tooltip = createViewportTooltip(container);
  const x = d3.scaleLinear().domain(d3.extent(plot.points, (point) => point.x)).range([0, innerWidth]);
  const yExtent = d3.extent(plot.points, (point) => point.y);
  const yPadding = Math.max(0.05, (Math.max(Math.abs(yExtent[0] || 0), Math.abs(yExtent[1] || 0)) || 0.1) * 0.08);
  const y = d3.scaleLinear().domain([yExtent[0] - yPadding, yExtent[1] + yPadding]).range([curveHeight, 0]);
  const metricPoints = plot.metricPoints?.length ? plot.metricPoints : plot.points.map((point) => ({ x: point.x, y: 0 }));
  const metricExtent = d3.extent(metricPoints, (point) => point.y);
  const metricAbs = Math.max(Math.abs(metricExtent[0] || 0), Math.abs(metricExtent[1] || 0), 0.1);
  const metricY = d3.scaleLinear().domain([-metricAbs, metricAbs]).range([metricHeight, 0]);
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("class", "ribote-d3-chart");
  svg
    .append("text")
    .attr("x", 0)
    .attr("y", 14)
    .attr("text-anchor", "start")
    .attr("class", "ribote-d3-chart-title ribote-d3-chart-title--library")
    .attr("fill", GSEA_TEXT_COLOR)
    .attr("font-family", GSEA_FONT_FAMILY)
    .attr("font-size", 17)
    .attr("font-weight", 800)
    .text(`${plot.pathway} (${plot.collection})`);
  svg
    .append("text")
    .attr("x", 0)
    .attr("y", 34)
    .attr("text-anchor", "start")
    .attr("class", "ribote-d3-chart-subtitle")
    .attr("fill", GSEA_TEXT_COLOR)
    .attr("font-family", GSEA_FONT_FAMILY)
    .attr("font-size", 13)
    .attr("font-weight", 700)
    .text(`NES ${fmt(plot.nes, 3)} | FDR ${fmt(plot.padj, 4)} | Size ${Number.isFinite(plot.size) ? plot.size : "NA"}`);
  const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const baseline = y(0);
  chart.append("line").attr("x1", 0).attr("x2", innerWidth).attr("y1", baseline).attr("y2", baseline).attr("stroke", GSEA_AXIS_COLOR).attr("stroke-width", 1).attr("stroke-dasharray", "4 4");
  const line = d3.line().x((point) => x(point.x)).y((point) => y(point.y)).curve(d3.curveMonotoneX);
  const area = d3.area().x((point) => x(point.x)).y0(baseline).y1((point) => y(point.y)).curve(d3.curveMonotoneX);
  chart.append("path").datum(plot.points).attr("fill", "rgba(75,116,182,0.15)").attr("d", area);
  chart.append("path").datum(plot.points).attr("fill", "none").attr("stroke", "#0d6c88").attr("stroke-width", 2.35).attr("stroke-linejoin", "round").attr("stroke-linecap", "round").attr("d", line);
  chart.append("g").selectAll("line").data(plot.hits).join("line").attr("x1", (value) => x(value)).attr("x2", (value) => x(value)).attr("y1", curveHeight + 14).attr("y2", curveHeight + 14 + rugHeight).attr("stroke", "#d45a2a").attr("stroke-width", 1).attr("opacity", 0.78);
  const metricGroup = chart.append("g").attr("transform", `translate(0,${metricTop})`);
  metricGroup.append("line").attr("x1", 0).attr("x2", innerWidth).attr("y1", metricY(0)).attr("y2", metricY(0)).attr("stroke", GSEA_AXIS_COLOR).attr("stroke-width", 1);
  const metricArea = d3.area().x((point) => x(point.x)).y0(metricY(0)).y1((point) => metricY(point.y)).curve(d3.curveMonotoneX);
  metricGroup.append("path").datum(metricPoints).attr("fill", "rgba(153,153,153,0.45)").attr("stroke", "none").attr("d", metricArea);
  if (Number.isFinite(plot.peakX) && Number.isFinite(plot.peakY)) {
    chart.append("circle").attr("cx", x(plot.peakX)).attr("cy", y(plot.peakY)).attr("r", 4.2).attr("fill", "#d45a2a").attr("stroke", "#f7fbfc").attr("stroke-width", 1.4);
  }
  chart.append("g")
    .attr("transform", `translate(0,${metricTop + metricHeight})`)
    .call(d3.axisBottom(x).ticks(6).tickSizeOuter(0))
    .call((axis) => axis.selectAll("text")
      .attr("class", "ribote-d3-axis-text")
      .attr("fill", GSEA_TEXT_COLOR)
      .attr("font-family", GSEA_FONT_FAMILY)
      .attr("font-size", 12)
      .attr("font-weight", 700))
    .call((axis) => axis.selectAll("line").attr("stroke", GSEA_AXIS_COLOR).attr("stroke-width", 1))
    .call((axis) => axis.select(".domain").attr("stroke", GSEA_AXIS_COLOR).attr("stroke-width", 1));
  chart.append("g")
    .call(d3.axisLeft(y).ticks(6).tickSizeOuter(0))
    .call((axis) => axis.selectAll("text")
      .attr("class", "ribote-d3-axis-text")
      .attr("fill", GSEA_TEXT_COLOR)
      .attr("font-family", GSEA_FONT_FAMILY)
      .attr("font-size", 12)
      .attr("font-weight", 700))
    .call((axis) => axis.selectAll("line").attr("stroke", GSEA_AXIS_COLOR).attr("stroke-width", 1))
    .call((axis) => axis.select(".domain").attr("stroke", GSEA_AXIS_COLOR).attr("stroke-width", 1));
  metricGroup.append("g")
    .call(d3.axisLeft(metricY).ticks(3).tickSizeOuter(0))
    .call((axis) => axis.selectAll("text")
      .attr("class", "ribote-d3-axis-text")
      .attr("fill", GSEA_TEXT_COLOR)
      .attr("font-family", GSEA_FONT_FAMILY)
      .attr("font-size", 12)
      .attr("font-weight", 700))
    .call((axis) => axis.selectAll("line").attr("stroke", GSEA_AXIS_COLOR).attr("stroke-width", 1))
    .call((axis) => axis.select(".domain").attr("stroke", GSEA_AXIS_COLOR).attr("stroke-width", 1));
  chart.append("text")
    .attr("x", innerWidth / 2)
    .attr("y", height - 6)
    .attr("class", "ribote-d3-axis-title")
    .attr("text-anchor", "middle")
    .attr("fill", GSEA_TEXT_COLOR)
    .attr("font-family", GSEA_FONT_FAMILY)
    .attr("font-size", 13)
    .attr("font-weight", 800)
    .text("Rank in TE_log2FC-Ordered Gene List");
  chart.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -(curveHeight / 2))
    .attr("y", -48)
    .attr("class", "ribote-d3-axis-title")
    .attr("text-anchor", "middle")
    .attr("fill", GSEA_TEXT_COLOR)
    .attr("font-family", GSEA_FONT_FAMILY)
    .attr("font-size", 13)
    .attr("font-weight", 800)
    .text("Running Enrichment Score");
  chart.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -(metricTop + metricHeight / 2))
    .attr("y", -48)
    .attr("class", "ribote-d3-axis-title")
    .attr("text-anchor", "middle")
    .attr("fill", GSEA_TEXT_COLOR)
    .attr("font-family", GSEA_FONT_FAMILY)
    .attr("font-size", 13)
    .attr("font-weight", 800)
    .text("Ranked List Metric");
  const overlay = chart.append("rect").attr("width", innerWidth).attr("height", metricTop + metricHeight).attr("fill", "transparent");
  overlay.on("mousemove", (event) => {
    const pointerX = d3.pointer(event, overlay.node())[0];
    const index = d3.bisector((point) => point.x).center(plot.points, x.invert(pointerX));
    const point = plot.points[Math.max(0, Math.min(plot.points.length - 1, index))];
    const metricPoint = metricPoints[Math.max(0, Math.min(metricPoints.length - 1, index))];
    tooltip.html(`<div class="ribote-d3-tooltip__title">${plot.pathway}</div><div class="ribote-d3-tooltip__row"><span>Rank:</span><b>${point.x}</b></div><div class="ribote-d3-tooltip__row"><span>ES:</span><b>${fmt(point.y, 4)}</b></div><div class="ribote-d3-tooltip__row"><span>Metric:</span><b>${fmt(metricPoint?.y, 4)}</b></div>`).style("opacity", 1);
    positionTooltip(tooltip, container, event);
  }).on("mouseleave", () => tooltip.style("opacity", 0));
  return () => tooltip.remove();
}

export function drawEnrichmentOverview(container, rows, options = {}) {
  const root = d3.select(container);
  root.selectAll("*").remove();
  root.style("position", "relative");
  if (!rows.length) {
    root.append("div").attr("class", "ribote-d3-empty").text("No enrichment plot is available.");
    return;
  }
  const plottedRows = rows.map((row) => ({ ...row, signedScore: (row.group === "Down" ? -1 : 1) * Math.max(0, -Math.log10(Math.max(Number(row.padj) || 1, 1e-300))) }));
  const width = container.clientWidth || 980;
  const rowHeight = 40;
  const groupGap = 30;
  const margin = { top: 56, right: 100, bottom: 72, left: 100 };
  let runningY = 0;
  const layoutRows = plottedRows.map((row, index) => {
    if (index > 0 && row.group !== plottedRows[index - 1].group) runningY += groupGap;
    const next = { ...row, yCenter: runningY + rowHeight / 2 };
    runningY += rowHeight;
    return next;
  });
  const height = Math.max(400, runningY + margin.top + margin.bottom + 24);
  const innerWidth = Math.max(360, width - margin.left - margin.right);
  const innerHeight = Math.max(220, runningY);
  const maxAbs = Math.max(d3.max(layoutRows, (row) => Math.abs(row.signedScore)) || 1, 1);
  const x = d3.scaleLinear().domain([-maxAbs * 1.12, maxAbs * 1.12]).range([0, innerWidth]);
  const zeroX = x(0);
  const tooltip = createViewportTooltip(container);
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("class", "ribote-d3-chart");
  svg.append("text").attr("x", 0).attr("y", 3).attr("class", "ribote-d3-chart-title ribote-d3-chart-title--library").text(options.title || "Enrichment Overview");
  const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  chart.append("line").attr("x1", zeroX).attr("x2", zeroX).attr("y1", -10).attr("y2", innerHeight).attr("stroke", "rgba(0,0,0,0.2)").attr("stroke-width", 1.6).attr("stroke-dasharray", "6 7");
  chart.append("g").attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(x).ticks(6).tickSizeOuter(0).tickFormat((value) => { const numeric = Number(value); return Math.abs(numeric) < 1e-9 ? "0" : d3.format("~g")(numeric); })).call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-tick")).call((axis) => axis.selectAll("path,line").attr("stroke", "#000"));
  const rowGroups = chart.append("g").selectAll("g").data(layoutRows).enter().append("g").attr("transform", (row) => `translate(0,${row.yCenter})`);
  rowGroups.append("rect").attr("x", (row) => Math.min(zeroX, x(row.signedScore))).attr("y", -12).attr("height", 24).attr("width", (row) => Math.abs(x(row.signedScore) - zeroX)).attr("fill", (row) => row.group === "Down" ? "#bfe4e8" : "#f3b18c").attr("opacity", 0.96).on("mouseenter", function(event, row) {
    tooltip.html(`<div class="ribote-d3-tooltip__title">${row.pathway}</div><div class="ribote-d3-tooltip__row"><span>Group:</span><b>${row.group}</b></div><div class="ribote-d3-tooltip__row"><span>FDR:</span><b>${pval(row.padj)}</b></div><div class="ribote-d3-tooltip__row"><span>Fold:</span><b>${fmt(row.fold, 2)}</b></div><div class="ribote-d3-tooltip__row"><span>Overlap:</span><b>${row.overlap} / ${row.querySize}</b></div>`).style("opacity", 1);
    positionTooltip(tooltip, container, event);
    d3.select(this).attr("opacity", 1);
  }).on("mousemove", (event) => positionTooltip(tooltip, container, event)).on("mouseleave", function() {
    tooltip.style("opacity", 0);
    d3.select(this).attr("opacity", 0.96);
  });
  rowGroups.append("text").attr("x", (row) => row.group === "Down" ? zeroX + 14 : zeroX - 14).attr("y", 1).attr("text-anchor", (row) => row.group === "Down" ? "start" : "end").attr("dominant-baseline", "middle").attr("class", "ribote-d3-axis-tick").text((row) => row.pathway);
  chart.append("text").attr("x", innerWidth / 2).attr("y", innerHeight + 52).attr("text-anchor", "middle").attr("class", "ribote-d3-axis-label").text("-log10(FDR)");
  return () => tooltip.remove();
}
