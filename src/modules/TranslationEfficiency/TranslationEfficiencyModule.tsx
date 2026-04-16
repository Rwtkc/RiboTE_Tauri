import { useMemo, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, Play, Settings2 } from "lucide-react";
import type { ModuleDefinition } from "@/data/moduleCatalog";
import { SPECIES_OPTIONS } from "@/data/species";
import { AnalysisResultWorkspace } from "@/modules/Analysis/AnalysisResultWorkspace";
import { ThemedSelect } from "@/modules/DataPreprocess/ThemedSelect";
import { useTransientRuntimeError } from "@/hooks/useTransientRuntimeError";
import { useAppStore } from "@/store/useAppStore";
import type { RiboteAnalysisResult } from "@/store/useAppStore";
import { useLogStore } from "@/store/useLogStore";

const pValueTypeOptions = [
  { value: "Fdr", label: "padj" },
  { value: "RawPvalue", label: "pvalue" }
];

interface TranslationEfficiencyModuleProps {
  module: ModuleDefinition;
}

export function TranslationEfficiencyModule({ module }: TranslationEfficiencyModuleProps) {
  const annotationReady = useAppStore((state) => Boolean(state.annotationValidation?.isValid));
  const annotationDir = useAppStore((state) => state.annotationDir);
  const species = useAppStore((state) => state.species);
  const loadDataSaved = useAppStore((state) => Boolean(state.loadDataContext));
  const loadDataContext = useAppStore((state) => state.loadDataContext);
  const preprocessResult = useAppStore((state) => state.dataPreprocessResult);
  const result = useAppStore((state) => state.analysisResults.translation_efficiency ?? null);
  const setAnalysisResult = useAppStore((state) => state.setAnalysisResult);
  const setEngineBusy = useAppStore((state) => state.setEngineBusy);
  const addLog = useLogStore((state) => state.addLog);
  const setConsoleExpanded = useLogStore((state) => state.setExpanded);
  const incrementProcess = useLogStore((state) => state.incrementProcess);
  const decrementProcess = useLogStore((state) => state.decrementProcess);
  const [teTool, setTeTool] = useState("Riborex");
  const [foldChange, setFoldChange] = useState("1.5");
  const [pValue, setPValue] = useState("0.05");
  const [pValueType, setPValueType] = useState("Fdr");
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useTransientRuntimeError();
  const [resultAction, setResultAction] = useState<ReactNode>(null);
  const annotationSpecies = useMemo(
    () => SPECIES_OPTIONS.find((option) => option.label === species),
    [species]
  );
  const preprocessMatchesCurrentReference = Boolean(
    preprocessResult &&
    annotationSpecies &&
    preprocessResult.speciesId === annotationSpecies.id &&
    preprocessResult.annotationDir === annotationDir
  );
  const canRunAnalysis = annotationReady && loadDataSaved && preprocessMatchesCurrentReference;
  const disabledReasons = [
    !annotationReady ? "Reference annotation files are incomplete" : null,
    !loadDataSaved ? "RNA/Ribo count matrix is not confirmed" : null,
    !preprocessResult ? "Count matrix preprocessing is not complete" : null,
    preprocessResult && !preprocessMatchesCurrentReference ? "Count matrix preprocessing is not current for the selected reference" : null
  ].filter(Boolean);
  const disabledReasonText = disabledReasons.join(" / ");

  async function runAnalysis() {
    if (!loadDataContext || !preprocessResult || !annotationSpecies || !canRunAnalysis) {
      return;
    }

    setIsRunning(true);
    setEngineBusy(true);
    setErrorMessage("");
    setConsoleExpanded(true);
    incrementProcess();
    addLog("command", "[Translation Efficiency] 0% Starting translation efficiency analysis.");

    const progressSteps = [
      "15% Loading filtered matrix and RNA/Ribo sample pairs.",
      "35% Preparing normalized RNA-seq and Ribo-seq count tables.",
      "60% Running differential translation efficiency model.",
      "80% Applying fold-change and p-value thresholds.",
      "92% Building TE table, volcano plot, and scatter plot payloads."
    ];
    let progressIndex = 0;
    const progressTimer = window.setInterval(() => {
      if (progressIndex >= progressSteps.length) {
        window.clearInterval(progressTimer);
        return;
      }
      addLog("info", `[Translation Efficiency] ${progressSteps[progressIndex]}`);
      progressIndex += 1;
    }, 1400);

    try {
      const nextResult = await invoke<RiboteAnalysisResult>("run_ribote_analysis", {
        moduleId: "translation_efficiency",
        request: {
          preprocessMatrixPath: preprocessResult.matrixPath,
          annotationDir,
          speciesId: annotationSpecies.id,
          speciesLabel: annotationSpecies.label,
          analysisVersion: "te_pvalue_precision_v2",
          samplePairs: loadDataContext.samplePairs,
          parameters: {
            teTool,
            foldChange,
            pValue,
            pValueType,
            minCpm: preprocessResult.parameters.minCpm,
            minLibraries: preprocessResult.parameters.minLibraries
          }
        }
      });
      setAnalysisResult("translation_efficiency", nextResult);
      addLog("success", "[Translation Efficiency] 100% TE results are ready.");
    } catch (error) {
      const message = String(error);
      setErrorMessage(message);
      addLog("error", `[Translation Efficiency] 100% Failed: ${message}`);
    } finally {
      window.clearInterval(progressTimer);
      setIsRunning(false);
      setEngineBusy(false);
      decrementProcess();
      setConsoleExpanded(false);
    }
  }

  return (
    <section className="module-page translation-efficiency-page">
      <div className="module-page__hero module-page__hero--with-action">
        <div className="module-page__hero-copy">
          <h1>{module.title}</h1>
          <p>{module.description}</p>
        </div>
        <button
          type="button"
          className="action-button action-button--primary"
          disabled={!canRunAnalysis || isRunning}
          title={canRunAnalysis ? "Run TE Analysis" : disabledReasonText}
          onClick={() => void runAnalysis()}
        >
          <Play size={14} />
          {isRunning ? "Running" : "Run TE Analysis"}
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

      <article className="config-card">
        <div className="config-card__head">
          <div className="config-card__icon">
            <Settings2 size={20} />
          </div>
          <div className="config-card__copy">
            <h3>TE Controls</h3>
            <p>Estimate translation efficiency differences between Control and Treatment samples.</p>
          </div>
        </div>
        <TranslationEfficiencyParameters
          foldChange={foldChange}
          onFoldChange={setFoldChange}
          onPValue={setPValue}
          onPValueType={setPValueType}
          onTeTool={setTeTool}
          pValue={pValue}
          pValueType={pValueType}
          teTool={teTool}
        />
      </article>

      <article className="config-card">
        <div className="config-card__head config-card__head--with-action">
          <div className="config-card__copy">
            <h3>Analysis Results</h3>
            <p>Review the TE result table, volcano signal, and RNA/Ribo/TE expression comparisons after analysis completes.</p>
          </div>
          {resultAction}
        </div>

        <AnalysisResultWorkspace
          result={result}
          emptyMessage={canRunAnalysis ? "Run TE Analysis to generate results." : "Complete the required upstream analyses to unlock TE analysis."}
          onHeaderActionChange={setResultAction}
        />
      </article>
    </section>
  );
}

function TranslationEfficiencyParameters({
  foldChange,
  onFoldChange,
  onPValue,
  onPValueType,
  onTeTool,
  pValue,
  pValueType,
  teTool
}: {
  foldChange: string;
  onFoldChange: (value: string) => void;
  onPValue: (value: string) => void;
  onPValueType: (value: string) => void;
  onTeTool: (value: string) => void;
  pValue: string;
  pValueType: string;
  teTool: string;
}) {
  return (
    <div className="module-parameter-list translation-parameter-list">
      <label className="module-parameter-field">
        <span className="module-parameter-field__label">TE Tool</span>
        <ThemedSelect options={["Riborex", "Xtail"]} value={teTool} onChange={onTeTool} />
      </label>
      <label className="module-parameter-field">
        <span className="module-parameter-field__label">Fold Change</span>
        <input className="module-parameter-field__control" type="number" min="1" step="0.1" value={foldChange} onChange={(event) => onFoldChange(event.target.value)} />
      </label>
      <label className="module-parameter-field">
        <span className="module-parameter-field__label">P-value</span>
        <input className="module-parameter-field__control" type="number" min="0" step="0.01" value={pValue} onChange={(event) => onPValue(event.target.value)} />
      </label>
      <label className="module-parameter-field">
        <span className="module-parameter-field__label">P-value Type</span>
        <ThemedSelect options={pValueTypeOptions} value={pValueType} onChange={onPValueType} />
      </label>
    </div>
  );
}
