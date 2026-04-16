import { useEffect, type DependencyList, type RefObject } from "react";
import { drawScatter, drawSimpleBars } from "@/modules/Analysis/analysisCharts";

export { drawScatter, drawSimpleBars };

export function useAnalysisChart(
  ref: RefObject<HTMLDivElement | null>,
  drawChart: (element: HTMLDivElement) => void | (() => void),
  deps: DependencyList
) {
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return undefined;
    }

    let cleanupChart: void | (() => void);
    const render = () => {
      if (typeof cleanupChart === "function") {
        cleanupChart();
      }
      cleanupChart = drawChart(element);
    };
    render();

    const observer = new ResizeObserver(render);
    observer.observe(element);

    return () => {
      observer.disconnect();
      if (typeof cleanupChart === "function") {
        cleanupChart();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
