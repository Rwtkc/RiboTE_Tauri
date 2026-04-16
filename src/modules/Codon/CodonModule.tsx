import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, Download, Play, Settings2 } from "lucide-react";
import type { ModuleDefinition } from "@/data/moduleCatalog";
import { SPECIES_OPTIONS } from "@/data/species";
import { ThemedSelect } from "@/modules/DataPreprocess/ThemedSelect";
import {
  CODON_CHILD_REQUIRES_SELECTED_CODONS,
  CODON_CHILD_RUN_LABEL,
  CODON_GROUP_BY_CHILD,
  SENSE_CODONS,
  normalizeDirection,
  normalizeDisplayScope
} from "@/modules/Codon/CodonModuleConfig";
import { CodonResultsWorkspace } from "@/modules/Codon/CodonResultsWorkspace";
import { useTransientRuntimeError } from "@/hooks/useTransientRuntimeError";
import { useAppStore, type RiboteAnalysisResult } from "@/store/useAppStore";
import { useLogStore } from "@/store/useLogStore";

interface CodonModuleProps {
  module: ModuleDefinition;
}

export function CodonModule({ module }: CodonModuleProps) {
  const annotationReady = useAppStore((state) => Boolean(state.annotationValidation?.isValid));
  const annotationDir = useAppStore((state) => state.annotationDir);
  const species = useAppStore((state) => state.species);
  const loadDataSaved = useAppStore((state) => Boolean(state.loadDataContext));
  const loadDataContext = useAppStore((state) => state.loadDataContext);
  const preprocessResult = useAppStore((state) => state.dataPreprocessResult);
  const teResult = useAppStore((state) => state.analysisResults.translation_efficiency);
  const analysisResults = useAppStore((state) => state.analysisResults);
  const activeChild = useAppStore((state) => state.activeModuleNavChildren.codon ?? "input_and_usage");
  const setAnalysisResult = useAppStore((state) => state.setAnalysisResult);
  const setEngineBusy = useAppStore((state) => state.setEngineBusy);
  const addLog = useLogStore((state) => state.addLog);
  const setConsoleExpanded = useLogStore((state) => state.setExpanded);
  const incrementProcess = useLogStore((state) => state.incrementProcess);
  const decrementProcess = useLogStore((state) => state.decrementProcess);
  const [selectedCodons, setSelectedCodons] = useState<string[]>([]);
  const [direction, setDirection] = useState("TE Up");
  const [displayScope, setDisplayScope] = useState("Selected-Codon Genes");
  const [activeViewId, setActiveViewId] = useState("input_summary");
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useTransientRuntimeError();
  const [isCodonModalOpen, setIsCodonModalOpen] = useState(false);
  const [codonQuery, setCodonQuery] = useState("");
  const resultWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const annotationSpecies = useMemo(
    () => SPECIES_OPTIONS.find((option) => option.label === species),
    [species]
  );
  const activeResultKey = `codon.${activeChild}`;
  const result = analysisResults[activeResultKey] ?? null;
  const codonPayload = (result?.charts?.codon ?? null) as Record<string, any> | null;
  const allViews = Array.isArray(codonPayload?.views) ? codonPayload.views : [];
  const activeGroup = CODON_GROUP_BY_CHILD[activeChild] ?? "Input and Usage";
  const showParameterPanel = activeGroup === "Input and Usage";
  const groupViews = allViews.filter((view) => String(view?.group) === activeGroup);
  const hasSelectedCodons = selectedCodons.length > 0;
  const requiresSelectedCodons = CODON_CHILD_REQUIRES_SELECTED_CODONS[activeChild] ?? true;
  const preprocessMatchesCurrentReference = Boolean(
    preprocessResult &&
    annotationSpecies &&
    preprocessResult.speciesId === annotationSpecies.id &&
    preprocessResult.annotationDir === annotationDir
  );
  const canRunAnalysis = annotationReady && loadDataSaved && preprocessMatchesCurrentReference && Boolean(teResult);
  const canRunCurrentAnalysis = canRunAnalysis && (!requiresSelectedCodons || hasSelectedCodons);
  const runLabel = CODON_CHILD_RUN_LABEL[activeChild] ?? "Run Codon";
  const disabledReasons = [
    !annotationReady ? "Reference annotation files are incomplete" : null,
    !loadDataSaved ? "RNA/Ribo count matrix is not confirmed" : null,
    !preprocessResult ? "Count matrix preprocessing is not complete" : null,
    preprocessResult && !preprocessMatchesCurrentReference ? "Count matrix preprocessing is not current for the selected reference" : null,
    !teResult ? "Translation efficiency analysis is not complete" : null,
    requiresSelectedCodons && !hasSelectedCodons ? "Select at least one codon first" : null
  ].filter(Boolean);
  const disabledReasonText = disabledReasons.join(" / ");
  const codonSummaryText = useMemo(() => {
    if (!selectedCodons.length) {
      return "";
    }
    if (selectedCodons.length <= 8) {
      return selectedCodons.join(", ");
    }
    return `${selectedCodons.slice(0, 8).join(", ")} +${selectedCodons.length - 8} more`;
  }, [selectedCodons]);
  const filteredCodons = useMemo(() => {
    const normalizedQuery = codonQuery.trim().toUpperCase();
    if (!normalizedQuery) {
      return SENSE_CODONS;
    }
    return SENSE_CODONS.filter((codon) => codon.includes(normalizedQuery));
  }, [codonQuery]);

  useEffect(() => {
    const payloadCodons = Array.isArray(codonPayload?.selectedCodons)
      ? codonPayload.selectedCodons.map((value) => String(value))
      : [];
    if (payloadCodons.length) {
      setSelectedCodons(payloadCodons);
    }
  }, [codonPayload?.selectedCodons]);

  function toggleCodon(codon: string) {
    setSelectedCodons((current) => {
      if (current.includes(codon)) {
        return current.filter((value) => value !== codon);
      }
      return [...current, codon].sort();
    });
  }

  function clearSelectedCodons() {
    setSelectedCodons([]);
  }

  async function runAnalysis() {
    if (!canRunCurrentAnalysis || !loadDataContext || !preprocessResult || !teResult || !annotationSpecies) {
      return;
    }

    setIsRunning(true);
    setEngineBusy(true);
    setErrorMessage("");
    setConsoleExpanded(true);
    incrementProcess();
    addLog("command", `[Codon] 0% Starting ${runLabel.toLowerCase()} analysis.`);

    const progressSteps = [
      "10% Loading TE result table and local codon resources.",
      "24% Resolving representative CDS sequences and transcript lengths.",
      "42% Building gene-level codon usage tables.",
      "58% Computing codon bias, shift, pattern, and run contexts.",
      "74% Preparing grouped codon result panels and summaries.",
      "90% Preparing codon charts and result tables."
    ];

    let progressIndex = 0;
    const progressTimer = window.setInterval(() => {
      if (progressIndex >= progressSteps.length) {
        window.clearInterval(progressTimer);
        return;
      }
      addLog("info", `[Codon] ${progressSteps[progressIndex]}`);
      progressIndex += 1;
    }, 1400);

    try {
      const nextResult = await invoke<RiboteAnalysisResult>("run_ribote_analysis", {
        moduleId: "codon",
        request: {
          preprocessMatrixPath: preprocessResult.matrixPath,
          annotationDir,
          speciesId: annotationSpecies.id,
          speciesLabel: annotationSpecies.label,
          teResultPath: teResult.resultPath,
          samplePairs: loadDataContext.samplePairs,
          parameters: {
            codonSelect: selectedCodons,
            codonDirection: normalizeDirection(direction),
            codonDisplay: normalizeDisplayScope(displayScope),
            codonSection: activeChild
          }
        }
      });
      setAnalysisResult(activeResultKey, nextResult);
      addLog("success", "[Codon] 100% Codon results are ready.");
    } catch (error) {
      const message = String(error);
      setErrorMessage(message);
      addLog("error", `[Codon] 100% Failed: ${message}`);
    } finally {
      window.clearInterval(progressTimer);
      setIsRunning(false);
      setEngineBusy(false);
      decrementProcess();
      setConsoleExpanded(false);
    }
  }

  return (
    <section className="module-page codon-module-page">
      <div className="module-page__hero module-page__hero--with-action">
        <div className="module-page__hero-copy">
          <h1>{module.title}</h1>
          <p>{module.description}</p>
          {canRunAnalysis && requiresSelectedCodons && !hasSelectedCodons ? (
            <div className="analysis-gate codon-module__hero-hint" role="status">
              <AlertTriangle size={14} />
              <span>Open the codon panel to choose codons for downstream views.</span>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="action-button action-button--primary"
          disabled={!canRunCurrentAnalysis || isRunning}
          title={canRunCurrentAnalysis ? runLabel : disabledReasonText}
          onClick={() => void runAnalysis()}
        >
          <Play size={14} />
          {isRunning ? "Running" : runLabel}
        </button>
      </div>

      {!canRunAnalysis ? (
        <div className="analysis-gate" role="status">
          <AlertTriangle size={14} />
          <span>Analysis locked: {disabledReasonText}.</span>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="inline-alert inline-alert--danger">
          <AlertTriangle size={14} />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      {showParameterPanel ? (
        <article className="config-card">
          <div className="config-card__head">
            <div className="config-card__icon">
              <Settings2 size={20} />
            </div>
            <div className="config-card__copy">
              <h3>{activeGroup}</h3>
              <p>Select codons, TE-group focus, and gene scope for codon usage analysis.</p>
            </div>
          </div>
          <div className="analysis-parameter-sections">
            <section className="analysis-parameter-section">
              <div className="analysis-parameter-sections">
                <div className="ribote-field ribote-field--sample-config">
                  <span className="module-parameter-field__label">Selected Codons</span>
                  <div className="ribote-sample-config ribote-codon-picker">
                    <button
                      type="button"
                      className="ribote-btn ribote-btn--secondary ribote-btn--block"
                      onClick={() => setIsCodonModalOpen(true)}
                    >
                      Choose Codons
                    </button>
                    {selectedCodons.length ? (
                      <div className="ribote-sample-config__summary">
                        {selectedCodons.length} codons selected | {codonSummaryText}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="module-parameter-list analysis-parameter-grid">
                  <label className="module-parameter-field">
                    <span className="module-parameter-field__label">TE Group Focus</span>
                    <ThemedSelect options={["TE Up", "TE Down", "Both TE Groups"]} value={direction} onChange={setDirection} />
                  </label>
                  <label className="module-parameter-field">
                    <span className="module-parameter-field__label">Gene Scope</span>
                    <ThemedSelect options={["Selected-Codon Genes", "All Genes"]} value={displayScope} onChange={setDisplayScope} />
                  </label>
                </div>
              </div>
            </section>
          </div>
        </article>
      ) : null}

      {isCodonModalOpen ? (
        <div className="ribote-sample-modal">
          <div className="ribote-sample-modal__backdrop" onClick={() => setIsCodonModalOpen(false)} />
          <div className="ribote-sample-modal__dialog" role="dialog" aria-modal="true" aria-label="Choose codons">
            <div className="ribote-sample-modal__dialog-header">
              <div>
                <h3>Choose Codons</h3>
                <p>Select from the 61 sense codons used for codon-usage analysis. Stop codons (TAA, TAG, TGA) are excluded.</p>
              </div>
              <button
                type="button"
                className="ribote-sample-modal__close"
                onClick={() => setIsCodonModalOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="ribote-sample-modal__body">
              <label className="module-parameter-field codon-modal-search">
                <span className="module-parameter-field__label">Search Codons</span>
                <input
                  className="ribote-input codon-modal-search__input"
                  type="text"
                  value={codonQuery}
                  placeholder="Filter codons"
                  onChange={(event) => setCodonQuery(event.target.value)}
                />
              </label>

              <div className="ribote-codon-picker__grid ribote-codon-picker__grid--modal">
                {filteredCodons.map((codon) => (
                  <button
                    key={codon}
                    type="button"
                    className={`ribote-codon-card${selectedCodons.includes(codon) ? " is-active" : ""}`}
                    onClick={() => toggleCodon(codon)}
                  >
                    {codon}
                  </button>
                ))}
              </div>

              {filteredCodons.length === 0 ? (
                <div className="ribote-sample-modal__empty">No codons match the current filter.</div>
              ) : null}

              <div className="ribote-sample-modal__hint">
                {selectedCodons.length
                  ? `Current selection: ${codonSummaryText}`
                  : "No codons selected yet."}
              </div>
            </div>

            <div className="ribote-sample-modal__footer">
              <button
                type="button"
                className="ribote-btn ribote-btn--secondary"
                onClick={clearSelectedCodons}
              >
                Clear Selection
              </button>
              <button
                type="button"
                className="ribote-btn ribote-btn--primary"
                onClick={() => setIsCodonModalOpen(false)}
              >
                Use Selected Codons
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <article className="config-card">
        {result && allViews.length ? (
          <CodonResultsWorkspace
            activeGroup={activeGroup}
            activeViewId={activeViewId}
            groupViews={groupViews}
            payload={codonPayload}
            result={result}
            setActiveViewId={setActiveViewId}
            viewRootRef={resultWorkspaceRef}
          />
        ) : (
          <>
            <div className="config-card__head config-card__head--with-action codon-results-head">
              <div className="config-card__copy">
                <h3>Analysis Results</h3>
                <p>Codon usage, bias, TE-shift, pattern, and run views are grouped by the current Codon sidebar section.</p>
              </div>
              <button type="button" className="action-button analysis-export-button" disabled>
                <Download size={14} />
                Export
              </button>
            </div>
            <div className="chart-placeholder__frame analysis-result-placeholder">
              <div className="chart-placeholder__copy">
                <span>
                  {canRunAnalysis
                    ? !requiresSelectedCodons || hasSelectedCodons
                      ? `${runLabel} to generate codon results.`
                      : "Choose at least one codon to generate codon results."
                    : "Complete the required upstream analyses to unlock codon results."}
                </span>
              </div>
            </div>
          </>
        )}
      </article>
    </section>
  );
}
