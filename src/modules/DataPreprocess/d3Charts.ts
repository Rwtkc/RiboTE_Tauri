import { useEffect, type DependencyList, type RefObject } from "react";
import * as d3 from "d3";
import { createViewportTooltip, positionViewportTooltip } from "@/utils/chartTooltip";

export type ChartDatum = {
  key?: string;
  label: string;
  actualLabel?: string;
  value: number;
  group?: string;
  color?: string;
};

export type RrnaDatum = {
  sample: string;
  sampleActual: string;
  category: string;
  totalCount: number;
};

export function useD3Chart(
  ref: RefObject<HTMLDivElement | null>,
  drawChart: (element: HTMLDivElement) => void,
  deps: DependencyList
) {
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return undefined;
    }

    const render = () => drawChart(element);
    render();

    const observer = new ResizeObserver(render);
    observer.observe(element);

    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function drawHorizontalBarChart(
  container: HTMLDivElement,
  data: ChartDatum[],
  options: { title: string; groupLabel: string; xLabel: string }
) {
  const root = d3.select(container);
  root.selectAll("*").remove();
  root.style("position", "relative");

  if (!data.length) {
    root.append("div").attr("class", "ribote-d3-empty").text("No chart data available.");
    return;
  }

  const width = container.clientWidth || 960;
  const barHeight = 34;
  const maxLabelLength = d3.max(data, (item) => item.label.length) || 0;
  const marginLeft = Math.max(105, Math.min(260, maxLabelLength * 9 + 36));
  const legendItems = Array.from(
    new Map(data.map((item) => [item.group || "Sample", item.color || "#147782"])),
    ([label, color]) => ({ label, color })
  );
  const margin = { top: legendItems.length > 1 ? 52 : 24, right: 24, bottom: 46, left: marginLeft };
  const height = margin.top + margin.bottom + barHeight * data.length;
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("class", "ribote-d3-chart");
  const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const tooltip = createViewportTooltip(container);
  const itemKeys = data.map((item, index) => getChartDatumKey(item, index));
  const labelByKey = new Map(data.map((item, index) => [getChartDatumKey(item, index), item.label]));
  const x = d3.scaleLinear().domain([0, d3.max(data, (item) => item.value) || 0]).nice().range([0, innerWidth]);
  const y = d3.scaleBand().domain(itemKeys).range([0, innerHeight]).padding(0.22);

  svg.append("text").attr("x", 0).attr("y", 3).attr("class", "ribote-d3-chart-title").text(options.title);

  chart.selectAll("rect")
    .data(data)
    .enter()
    .append("rect")
    .attr("x", 0)
    .attr("y", (item, index) => y(getChartDatumKey(item, index)) || 0)
    .attr("width", (item) => x(item.value))
    .attr("height", y.bandwidth())
    .attr("fill", (item) => item.color || "#147782")
    .on("mouseenter", function(_event, item) {
      d3.select(this).attr("opacity", 0.86);
      tooltip.style("opacity", 1).html(`
        <div class="ribote-d3-tooltip__title">${item.label}</div>
        ${item.actualLabel ? `<div class="ribote-d3-tooltip__row"><span>Actual:</span><b title="${escapeHtml(item.actualLabel)}">${escapeHtml(item.actualLabel)}</b></div>` : ""}
        <div class="ribote-d3-tooltip__row"><span>${options.groupLabel}:</span><b>${item.group || "Sample"}</b></div>
        <div class="ribote-d3-tooltip__row"><span>Count:</span><b>${formatNumber(item.value)}</b></div>
      `);
    })
    .on("mousemove", (event) => positionTooltip(tooltip, container, event))
    .on("mouseleave", function() {
      d3.select(this).attr("opacity", 1);
      tooltip.style("opacity", 0);
    });

  chart.append("g")
    .call(d3.axisLeft(y).tickSize(0).tickFormat((value) => labelByKey.get(String(value)) || String(value)))
    .call((axis) => axis.select(".domain").attr("stroke", "#000"))
    .call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-label"));

  chart.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(5).tickSizeOuter(0).tickFormat((value) => `${d3.format(",")(Math.round(Number(value) / 1000))}k`))
    .call((axis) => axis.select(".domain").attr("stroke", "#000"))
    .call((axis) => axis.selectAll(".tick line").attr("stroke", "#000"))
    .call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-tick"));

  if (legendItems.length > 1) {
    const legend = svg.append("g").attr("transform", `translate(${Math.max((width - legendItems.length * 168) / 2, margin.left)}, 18)`);
    legendItems.forEach((item, index) => {
      const group = legend.append("g").attr("transform", `translate(${index * 168}, 0)`);
      group.append("rect").attr("width", 16).attr("height", 16).attr("fill", item.color);
      group.append("text").attr("x", 24).attr("y", 13).attr("class", "ribote-d3-legend").text(item.label);
    });
  }

  svg.append("text")
    .attr("x", margin.left + innerWidth / 2)
    .attr("y", height - 4)
    .attr("text-anchor", "middle")
    .attr("class", "ribote-d3-caption")
    .text(options.xLabel);
}

export function drawStackedFractionChart(container: HTMLDivElement, data: RrnaDatum[]) {
  const root = d3.select(container);
  root.selectAll("*").remove();
  root.style("position", "relative");

  if (!data.length) {
    root.append("div").attr("class", "ribote-d3-empty").text("No chart data available.");
    return;
  }

  const sampleEntries = Array.from(
    new Map(
      data.map((item) => {
        const key = item.sampleActual || item.sample;
        return [key, { key, label: item.sample || key, actual: item.sampleActual || key }];
      })
    ).values()
  );
  const samples = sampleEntries.map((item) => item.key);
  const labelBySample = new Map(sampleEntries.map((item) => [item.key, item.label]));
  const actualBySample = new Map(sampleEntries.map((item) => [item.key, item.actual]));
  const categories = Array.from(new Set(data.map((item) => item.category)));
  const categoryColors: Record<string, string> = { "rRNA": "#d45a2a", "Non-rRNA": "#147782" };
  const totalsBySample = new Map(samples.map((sample) => [sample, d3.sum(data.filter((item) => getRrnaSampleKey(item) === sample), (item) => item.totalCount)]));
  const rows = samples.map((sample) => {
    const row: Record<string, number | string> = {
      sample,
      sampleLabel: labelBySample.get(sample) || sample,
      sampleActual: actualBySample.get(sample) || sample
    };
    categories.forEach((category) => {
      const value = data.find((item) => getRrnaSampleKey(item) === sample && item.category === category)?.totalCount || 0;
      const total = totalsBySample.get(sample) || 1;
      row[`${category}__count`] = value;
      row[category] = value / total;
    });
    return row;
  });

  const width = container.clientWidth || 960;
  const height = 400;
  const margin = { top: 42, right: 28, bottom: 82, left: 72 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("class", "ribote-d3-chart");
  const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const tooltip = createViewportTooltip(container);
  const x = d3.scaleBand().domain(samples).range([0, innerWidth]).padding(0.24);
  const y = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);
  const stackedSeries = d3.stack<Record<string, number | string>>().keys(categories)(rows);

  svg.append("text").attr("x", 0).attr("y", 3).attr("class", "ribote-d3-chart-title").text("rRNA Fraction by Sample");

  chart.selectAll(".ribote-d3-stack")
    .data(stackedSeries)
    .enter()
    .append("g")
    .attr("fill", (series) => categoryColors[series.key] || "#8fa1a7")
    .selectAll("rect")
    .data((series) => series.map((item) => ({ ...item, category: series.key })))
    .enter()
    .append("rect")
    .attr("x", (item) => x(String(item.data.sample)) || 0)
    .attr("y", (item) => y(item[1]))
    .attr("height", (item) => y(item[0]) - y(item[1]))
    .attr("width", x.bandwidth())
    .on("mouseenter", function(_event, item) {
      const fraction = Math.max(0, item[1] - item[0]);
      d3.select(this).attr("opacity", 0.86);
      tooltip.style("opacity", 1).html(`
        <div class="ribote-d3-tooltip__title">${item.data.sampleLabel}</div>
        <div class="ribote-d3-tooltip__row"><span>Actual:</span><b title="${escapeHtml(String(item.data.sampleActual))}">${escapeHtml(String(item.data.sampleActual))}</b></div>
        <div class="ribote-d3-tooltip__row"><span>Category:</span><b>${item.category}</b></div>
        <div class="ribote-d3-tooltip__row"><span>Fraction:</span><b>${d3.format(".1%")(fraction)}</b></div>
        <div class="ribote-d3-tooltip__row"><span>Count:</span><b>${formatNumber(Number(item.data[`${item.category}__count`]) || 0)}</b></div>
      `);
    })
    .on("mousemove", (event) => positionTooltip(tooltip, container, event))
    .on("mouseleave", function() {
      d3.select(this).attr("opacity", 1);
      tooltip.style("opacity", 0);
    });

  chart.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickSizeOuter(0).tickFormat((value) => labelBySample.get(String(value)) || String(value)))
    .call((axis) => axis.select(".domain").attr("stroke", "#000"))
    .call((axis) =>
      axis
        .selectAll("text")
        .attr("class", "ribote-d3-axis-tick")
        .attr("text-anchor", "middle")
        .attr("dx", "0")
        .attr("dy", "1.1em")
    );
  chart.append("g")
    .call(d3.axisLeft(y).ticks(5).tickFormat((value) => `${Math.round(Number(value) * 100)}%`))
    .call((axis) => axis.select(".domain").attr("stroke", "#000"))
    .call((axis) => axis.selectAll("text").attr("class", "ribote-d3-axis-tick"));

  const legend = svg.append("g").attr("transform", `translate(${Math.max((width - categories.length * 168) / 2, margin.left)}, ${height - 24})`);
  categories.forEach((category, index) => {
    const group = legend.append("g").attr("transform", `translate(${index * 168}, 0)`);
    group.append("rect").attr("width", 16).attr("height", 16).attr("fill", categoryColors[category] || "#8fa1a7");
    group.append("text").attr("x", 24).attr("y", 13).attr("class", "ribote-d3-legend").text(category);
  });
}

function positionTooltip(tooltip: d3.Selection<HTMLDivElement, unknown, HTMLElement, unknown>, container: HTMLElement, event: MouseEvent) {
  positionViewportTooltip(tooltip, container, event);
}

function getRrnaSampleKey(item: RrnaDatum) {
  return item.sampleActual || item.sample;
}

function getChartDatumKey(item: ChartDatum, index: number) {
  return item.key || item.actualLabel || `${item.label}-${index}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}
