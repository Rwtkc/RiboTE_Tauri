import * as d3 from "d3";

type TooltipSelection = d3.Selection<HTMLDivElement, unknown, any, unknown>;

export function createViewportTooltip(_container: HTMLElement): TooltipSelection {
  const existing = d3.select<HTMLDivElement, unknown>("#ribote-d3-global-tooltip");
  if (!existing.empty()) {
    return existing.attr("class", "ribote-d3-tooltip ribote-d3-tooltip--viewport").style("opacity", 0);
  }

  return d3
    .select(document.body)
    .append("div")
    .attr("id", "ribote-d3-global-tooltip")
    .attr("class", "ribote-d3-tooltip ribote-d3-tooltip--viewport")
    .style("opacity", 0);
}

export function positionViewportTooltip(
  tooltip: TooltipSelection,
  _container: HTMLElement,
  event: MouseEvent | PointerEvent
) {
  const tooltipNode = tooltip.node();
  if (!tooltipNode) {
    return;
  }

  const padding = 8;
  const tooltipWidth = tooltipNode.offsetWidth || 0;
  const tooltipHeight = tooltipNode.offsetHeight || 0;
  const maxLeft = Math.max(padding, window.innerWidth - tooltipWidth - padding);
  const maxTop = Math.max(padding, window.innerHeight - tooltipHeight - padding);
  const left = Math.max(padding, Math.min(event.clientX + 14, maxLeft));
  const top = Math.max(padding, Math.min(event.clientY - 10, maxTop));

  tooltip.style("left", `${left}px`).style("top", `${top}px`);
}
