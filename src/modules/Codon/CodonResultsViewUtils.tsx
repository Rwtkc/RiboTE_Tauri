// @ts-nocheck
import { useEffect, useRef, useState } from "react";

export function useD3Chart(drawChart, deps) {
  const ref = useRef(null);
  const renderedWidthRef = useRef(0);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState(null);

  useEffect(() => {
    if (!ref.current) {
      return undefined;
    }

    let cleanup;
    let frameId = null;
    const chartRoot = ref.current;

    const renderChart = (reason = "data") => {
      if (!chartRoot) {
        setIsRendering(false);
        return;
      }

      try {
        if (typeof cleanup === "function") {
          cleanup();
        }

        renderedWidthRef.current = Math.round(chartRoot.clientWidth || 0);
        cleanup = drawChart(chartRoot, {
          animate: reason !== "resize",
          reason
        });
        setRenderError(null);
      } catch (error) {
        console.error("Codon chart rendering failed.", error);
        setRenderError(error instanceof Error ? error.message : "Unknown codon chart rendering error.");
        if (chartRoot) {
          chartRoot.innerHTML = "";
        }
      } finally {
        setIsRendering(false);
      }
    };

    const scheduleRender = (reason = "data") => {
      setIsRendering(reason !== "resize");

      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

      frameId = requestAnimationFrame(() => {
        frameId = null;
        renderChart(reason);
      });
    };

    scheduleRender("initial");

    let observer;
    const handleWindowResize = () => {
      const nextWidth = Math.round(chartRoot.clientWidth || 0);
      if (nextWidth && nextWidth !== renderedWidthRef.current) {
        scheduleRender("resize");
      }
    };

    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver((entries) => {
        const nextWidth = Math.round(entries[0]?.contentRect?.width || chartRoot.clientWidth || 0);
        if (nextWidth && nextWidth !== renderedWidthRef.current) {
          scheduleRender("resize");
        }
      });
      observer.observe(chartRoot);
    } else {
      window.addEventListener("resize", handleWindowResize);
    }

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

      if (observer) {
        observer.disconnect();
      } else {
        window.removeEventListener("resize", handleWindowResize);
      }

      if (typeof cleanup === "function") {
        cleanup();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, isRendering, renderError };
}

export function buildCondensedPages(totalPages, currentPage = 1) {
  if (totalPages <= 4) {
    return Array.from({ length: totalPages }, (_, index) => ({ type: "page", value: index + 1 }));
  }

  const windowSize = 3;
  const maxStart = Math.max(1, totalPages - windowSize + 1);
  const startPage = Math.min(Math.max(1, currentPage - 2), maxStart);
  const endPage = Math.min(totalPages, startPage + windowSize - 1);
  const items = [];

  for (let page = startPage; page <= endPage; page += 1) {
    items.push({ type: "page", value: page });
  }

  if (endPage < totalPages - 1) {
    items.push({ type: "ellipsis", value: "ellipsis" });
  }

  if (endPage < totalPages) {
    items.push({ type: "page", value: totalPages });
  }

  return items;
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

  return numeric.toLocaleString();
}

export function formatPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "NA";
  }

  return `${numeric.toFixed(2)}%`;
}

export function formatPValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "NA";
  }

  return numeric < 1e-3 ? numeric.toExponential(2) : numeric.toFixed(4);
}

export function normalizeViews(views) {
  if (!Array.isArray(views)) {
    return [];
  }

  return views.map((view, index) => ({
    id: String(view?.id || `view-${index + 1}`),
    title: String(view?.title || `View ${index + 1}`),
    description: String(view?.description || ""),
    group: String(view?.group || "Results"),
    implemented: view?.implemented !== false
  }));
}

export function ensureActiveViewStore() {
  return (window.__riboteActiveViewState ??= {});
}

export function readPersistedActiveView(key) {
  if (!key) {
    return null;
  }

  return ensureActiveViewStore()[key] || null;
}

export function ensureCodonGroupViewStore() {
  return (window.__riboteCodonGroupViewState ??= {});
}

export function ensureCodonViewRequestStore() {
  return (window.__riboteCodonViewRequestState ??= {});
}

export function readPersistedGroupViews(key) {
  if (!key) {
    return {};
  }

  const persisted = ensureCodonGroupViewStore()[key];
  return persisted && typeof persisted === "object" ? { ...persisted } : {};
}

export function readPersistedViewRequests(key) {
  if (!key) {
    return {
      pending: null,
      queued: null,
      nextRequestSeq: 0
    };
  }

  const persisted = ensureCodonViewRequestStore()[key];
  const nextRequestSeq = Number.isFinite(Number(persisted?.nextRequestSeq))
    ? Number(persisted.nextRequestSeq)
    : 0;

  return {
    pending: persisted?.pending ?? null,
    queued: persisted?.queued ?? null,
    nextRequestSeq
  };
}

export function readAnalysisLocked() {
  return Boolean(window.__rnametaAnalysisLocked || window.__rnametaAnalysisOwner);
}
