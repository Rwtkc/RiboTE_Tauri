import { useCallback, useEffect, useMemo, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import { CodonExportPanel } from "@/modules/Codon/CodonExportPanel";
import { CODON_VIEW_RENDERERS, camelChartKey } from "@/modules/Codon/CodonModuleConfig";
import {
  ensureActiveViewStore,
  ensureCodonGroupViewStore,
  readPersistedActiveView,
  readPersistedGroupViews
} from "@/modules/Codon/CodonResultsViewUtils";
import type { RiboteAnalysisResult } from "@/store/useAppStore";

const CODON_PERSIST_KEY = "codon-results";

interface CodonResultsWorkspaceProps {
  activeGroup: string;
  activeViewId: string;
  groupViews: Array<Record<string, any>>;
  payload: Record<string, any> | null;
  result: RiboteAnalysisResult | null;
  setActiveViewId: Dispatch<SetStateAction<string>>;
  viewRootRef: RefObject<HTMLDivElement | null>;
}

export function CodonResultsWorkspace({
  activeGroup,
  activeViewId,
  groupViews,
  payload,
  result,
  setActiveViewId,
  viewRootRef
}: CodonResultsWorkspaceProps) {
  const groupViewSelectionsRef = useRef<Record<string, string>>(readPersistedGroupViews(CODON_PERSIST_KEY));
  const groupViewIds = useMemo(() => new Set(groupViews.map((view) => String(view.id))), [groupViews]);
  const rememberedViewId = groupViewSelectionsRef.current[activeGroup] || readPersistedActiveView(CODON_PERSIST_KEY) || "";
  const resolvedActiveViewId = useMemo(() => {
    if (activeViewId && groupViewIds.has(activeViewId)) {
      return activeViewId;
    }
    if (rememberedViewId && groupViewIds.has(rememberedViewId)) {
      return rememberedViewId;
    }
    return String(groupViews[0]?.id ?? "");
  }, [activeViewId, groupViewIds, groupViews, rememberedViewId]);
  const currentView = useMemo(
    () => groupViews.find((view) => String(view.id) === resolvedActiveViewId) ?? groupViews[0] ?? null,
    [groupViews, resolvedActiveViewId]
  );

  const persistViewSelection = useCallback((group: string, viewId: string) => {
    if (!group || !viewId) {
      return;
    }

    const nextGroupViews = {
      ...groupViewSelectionsRef.current,
      [group]: viewId
    };
    groupViewSelectionsRef.current = nextGroupViews;
    ensureCodonGroupViewStore()[CODON_PERSIST_KEY] = nextGroupViews;
    ensureActiveViewStore()[CODON_PERSIST_KEY] = viewId;
  }, []);

  useEffect(() => {
    groupViewSelectionsRef.current = readPersistedGroupViews(CODON_PERSIST_KEY);
  }, []);

  useEffect(() => {
    if (resolvedActiveViewId && resolvedActiveViewId !== activeViewId) {
      setActiveViewId(resolvedActiveViewId);
    }
  }, [activeViewId, resolvedActiveViewId, setActiveViewId]);

  useEffect(() => {
    if (!activeGroup || !resolvedActiveViewId || !groupViewIds.has(resolvedActiveViewId)) {
      return;
    }

    persistViewSelection(activeGroup, resolvedActiveViewId);
  }, [activeGroup, groupViewIds, persistViewSelection, resolvedActiveViewId]);

  const handleViewChange = (nextViewId: string) => {
    if (!nextViewId || nextViewId === resolvedActiveViewId) {
      return;
    }

    persistViewSelection(activeGroup, nextViewId);
    setActiveViewId(nextViewId);
  };

  const renderer = currentView ? CODON_VIEW_RENDERERS[String(currentView.id)] : null;
  const viewConfig = currentView ? payload?.[camelChartKey(String(currentView.id))] : null;

  return (
    <>
      <div className="config-card__head config-card__head--with-action codon-results-head">
        <div className="config-card__copy">
          <h3>Analysis Results</h3>
          <p>Codon usage, bias, TE-shift, pattern, and run views are grouped by the current Codon sidebar section.</p>
        </div>
        <CodonExportPanel currentViewId={resolvedActiveViewId} result={result} viewRootRef={viewRootRef} />
      </div>

      {result?.summary?.length ? (
        <div className="preprocess-metrics">
          {result.summary.map((item) => (
            <div key={item.label} className="meta-plot-summary-item">
              <span className="meta-plot-summary-item__label">{item.label}</span>
              <span className="meta-plot-summary-item__value">{item.value}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="ribote-codon-results" ref={viewRootRef}>
        <div className="ribote-canvas-tab-stack">
          <div className="ribote-canvas-view-tab-panel">
            <div className="ribote-canvas-view-tab-panel__header">
              <span className="ribote-canvas-view-tab-panel__eyebrow">{activeGroup}</span>
              <span className="ribote-canvas-view-tab-panel__title">{String(currentView?.title ?? "Results")}</span>
            </div>
            <div className="ribote-canvas-view-tab-panel__divider" />
            <div className="ribote-canvas-tabs ribote-canvas-tabs--results codon-results-tabs" role="tablist">
              {groupViews.map((view) => {
                const viewId = String(view.id);
                return (
                  <button
                    key={viewId}
                    type="button"
                    className={`ribote-canvas-tab codon-results-tab${resolvedActiveViewId === viewId ? " is-active" : ""}`}
                    onClick={() => handleViewChange(viewId)}
                  >
                    {String(view.title)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {renderer && viewConfig ? renderer(viewConfig) : (
          <div className="ribote-result-card">
            <p className="ribote-result-card__copy">This codon result view is not available yet for the current dataset.</p>
          </div>
        )}
      </div>
    </>
  );
}
