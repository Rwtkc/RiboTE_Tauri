import { useMemo, useRef, useState, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, Download, Play, Settings2 } from "lucide-react";
import { SPECIES_OPTIONS } from "@/data/species";
import type { ModuleDefinition } from "@/data/moduleCatalog";
import { useAppStore } from "@/store/useAppStore";
import type { DataPreprocessResult } from "@/store/useAppStore";
import { useLogStore } from "@/store/useLogStore";
import {
  drawHorizontalBarChart,
  drawStackedFractionChart,
  useD3Chart,
  type ChartDatum,
  type RrnaDatum
} from "@/modules/DataPreprocess/d3Charts";
import { DataPreprocessExportDialog, type DataPreprocessExportState } from "@/modules/DataPreprocess/DataPreprocessExportDialog";
import {
  exportPreprocessData,
  exportPreprocessFigures,
  normalizeExportOptions
} from "@/modules/DataPreprocess/dataPreprocessExports";
import { ThemedSelect } from "@/modules/DataPreprocess/ThemedSelect";
import { PagedCsvTable } from "@/components/PagedCsvTable";
import { useTransientRuntimeError } from "@/hooks/useTransientRuntimeError";

interface DataPreprocessModuleProps {
  module: ModuleDefinition;
}

export function DataPreprocessModule({ module }: DataPreprocessModuleProps) {
  const annotationReady = useAppStore((state) => Boolean(state.annotationValidation?.isValid));
  const annotationDir = useAppStore((state) => state.annotationDir);
  const species = useAppStore((state) => state.species);
  const loadDataContext = useAppStore((state) => state.loadDataContext);
  const result = useAppStore((state) => state.dataPreprocessResult);
  const setResult = useAppStore((state) => state.setDataPreprocessResult);
  const setEngineBusy = useAppStore((state) => state.setEngineBusy);
  const addLog = useLogStore((state) => state.addLog);
  const setConsoleExpanded = useLogStore((state) => state.setExpanded);
  const incrementProcess = useLogStore((state) => state.incrementProcess);
  const decrementProcess = useLogStore((state) => state.decrementProcess);
  const [naStrategy, setNaStrategy] = useState("Zero Imputation");
  const [minCpm, setMinCpm] = useState("0.5");
  const [minLibraries, setMinLibraries] = useState("1");
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useTransientRuntimeError();
  const [activeView, setActiveView] = useState<"data" | "barplot" | "qc">("data");
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportState, setExportState] = useState<DataPreprocessExportState>({
    format: "csv",
    width: "3000",
    height: "1800",
    dpi: "300"
  });
  const barplotRef = useRef<HTMLDivElement | null>(null);
  const biotypeRef = useRef<HTMLDivElement | null>(null);
  const rrnaRef = useRef<HTMLDivElement | null>(null);
  const canRunAnalysis = annotationReady && Boolean(loadDataContext) && !isRunning;
  const disabledReasons = [
    !annotationReady ? "Reference annotation files are incomplete" : null,
    !loadDataContext ? "RNA/Ribo count matrix is not confirmed" : null
  ].filter(Boolean);
  const annotationSpecies = SPECIES_OPTIONS.find((option) => option.label === species) ?? null;

  async function runPreprocess() {
    if (!loadDataContext || !annotationReady) {
      return;
    }

    setIsRunning(true);
    setEngineBusy(true);
    setErrorMessage("");
    setConsoleExpanded(true);
    incrementProcess();
    addLog("command", "[Data Preprocess] 0% Starting count matrix preprocessing.");

    const progressSteps = [
      "25% Reading count matrix and RNA/Ribo sample pairs.",
      "55% Applying missing-value handling and CPM filtering.",
      "80% Building library-size and QC summary tables."
    ];
    let progressIndex = 0;
    const progressTimer = window.setInterval(() => {
      if (progressIndex >= progressSteps.length) {
        window.clearInterval(progressTimer);
        return;
      }
      addLog("info", `[Data Preprocess] ${progressSteps[progressIndex]}`);
      progressIndex += 1;
    }, 1200);

    try {
      const nextResult = await invoke<DataPreprocessResult>("run_data_preprocess", {
        matrixPath: loadDataContext.matrix.filePath,
        annotationDir,
        speciesId: annotationSpecies?.id ?? "",
        naStrategy,
        minCpm: Number(minCpm),
        minLibraries: Number.parseInt(minLibraries, 10),
        samplePairs: loadDataContext.samplePairs
      });
      setResult(nextResult);
      setActiveView("data");
      addLog("success", "[Data Preprocess] 100% Processed matrix and QC summaries are ready.");
    } catch (error) {
      const message = String(error);
      setErrorMessage(message);
      addLog("error", `[Data Preprocess] 100% Failed: ${message}`);
    } finally {
      window.clearInterval(progressTimer);
      setIsRunning(false);
      setEngineBusy(false);
      decrementProcess();
      setConsoleExpanded(false);
    }
  }

  async function handleExportSubmit() {
    if (!result) {
      return;
    }

    try {
      let exported = false;
      if (exportState.format === "csv") {
        exported = await exportPreprocessData(result, activeView);
      } else {
        exported = await exportPreprocessFigures(exportState.format, activeView, { barplotRef, biotypeRef, rrnaRef }, normalizeExportOptions(exportState));
      }
      if (exported) {
        setIsExportOpen(false);
      }
    } catch (error) {
      const message = String(error);
      setErrorMessage(message);
      addLog("error", `[Data Preprocess] Export failed: ${message}`);
    }
  }

  return (
    <section className="module-page">
      <div className="module-page__hero module-page__hero--with-action">
        <div className="module-page__hero-copy">
          <h1>{module.title}</h1>
          <p>{module.description}</p>
        </div>
        <button
          type="button"
          className="action-button action-button--primary"
          disabled={!canRunAnalysis}
          title={canRunAnalysis ? "Run Data Preprocess" : disabledReasons.join(" / ")}
          onClick={() => void runPreprocess()}
        >
          <Play size={14} />
          {isRunning ? "Running" : "Run Preprocess"}
        </button>
      </div>

      {!canRunAnalysis && !isRunning ? (
        <div className="analysis-gate" role="status">
          <AlertTriangle size={14} />
          <span>Analysis locked: {disabledReasons.join(" / ")}.</span>
        </div>
      ) : null}

      <article className="config-card">
        <div className="config-card__head">
          <div className="config-card__icon">
            <Settings2 size={20} />
          </div>
          <div className="config-card__copy">
            <h3>Preprocessing Parameters</h3>
            <p>Set missing-value handling and CPM thresholds for RNA/Ribo count filtering.</p>
          </div>
        </div>

        <div className="module-parameter-list module-parameter-list--inline">
          <label className="module-parameter-field">
            <span className="module-parameter-field__label">Missing Value Estimation</span>
            <ThemedSelect options={["Zero Imputation", "Median Imputation"]} value={naStrategy} onChange={setNaStrategy} />
          </label>
          <label className="module-parameter-field">
            <span className="module-parameter-field__label">Min. CPM</span>
            <input className="module-parameter-field__control" type="number" min="0" step="0.1" value={minCpm} onChange={(event) => setMinCpm(event.target.value)} />
          </label>
          <label className="module-parameter-field">
            <span className="module-parameter-field__label">n Libraries</span>
            <input className="module-parameter-field__control" type="number" min="1" step="1" value={minLibraries} onChange={(event) => setMinLibraries(event.target.value)} />
          </label>
        </div>
      </article>

      {errorMessage ? (
        <div className="inline-alert inline-alert--danger">
          <AlertTriangle size={14} />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      <article className="config-card">
        <div className="config-card__head config-card__head--with-action">
          <div className="config-card__copy">
            <h3>Analysis Results</h3>
            <p>Review the filtered count matrix, library-size summary, gene biotype composition, and rRNA fraction QC.</p>
          </div>
          <ExportPanel
            result={result}
            onOpen={() => {
              setExportState((current) => ({
                ...current,
                format: activeView === "data" ? "csv" : current.format === "csv" ? "png" : current.format
              }));
              setIsExportOpen(true);
            }}
          />
        </div>

        {result ? (
          <PreprocessResults result={result} activeView={activeView} onActiveViewChange={setActiveView} barplotRef={barplotRef} biotypeRef={biotypeRef} rrnaRef={rrnaRef} />
        ) : (
          <div className="chart-placeholder__frame">
            <div className="chart-placeholder__copy">
              <span>{isRunning ? "Preprocessing RNA/Ribo counts..." : "Run preprocessing to generate results."}</span>
            </div>
          </div>
        )}
      </article>

      {isExportOpen ? (
        <DataPreprocessExportDialog
          figureDisabled={activeView === "data"}
          onClose={() => setIsExportOpen(false)}
          onStateChange={setExportState}
          onSubmit={() => void handleExportSubmit()}
          state={exportState}
        />
      ) : null}
    </section>
  );
}

function PreprocessResults({
  result,
  activeView,
  onActiveViewChange,
  barplotRef,
  biotypeRef,
  rrnaRef
}: {
  result: DataPreprocessResult;
  activeView: "data" | "barplot" | "qc";
  onActiveViewChange: (view: "data" | "barplot" | "qc") => void;
  barplotRef: RefObject<HTMLDivElement | null>;
  biotypeRef: RefObject<HTMLDivElement | null>;
  rrnaRef: RefObject<HTMLDivElement | null>;
}) {
  const barplotData = useMemo(() => mapBarPlotData(result.charts.barplot), [result.charts.barplot]);
  const biotypeData = useMemo(() => mapBiotypeData(result.charts.biotype), [result.charts.biotype]);
  const rrnaData = useMemo(() => mapRrnaData(result.charts.rrna), [result.charts.rrna]);

  useD3Chart(barplotRef, (element) => drawHorizontalBarChart(element, barplotData, { title: "Library Size by Sample", groupLabel: "Type", xLabel: "Counts (k)" }), [barplotData, activeView]);
  useD3Chart(biotypeRef, (element) => drawHorizontalBarChart(element, biotypeData, { title: "Gene Biotype Composition", groupLabel: "Class", xLabel: "Retained genes" }), [biotypeData, activeView]);
  useD3Chart(rrnaRef, (element) => drawStackedFractionChart(element, rrnaData), [rrnaData, activeView]);

  return (
    <div className="preprocess-results">
      <div className="preprocess-metrics">
        <Metric label="Genes Retained" value={formatNumber(result.matrixStats.genes)} />
        <Metric label="Samples Retained" value={formatNumber(result.matrixStats.samples)} />
      </div>

      <div className="preprocess-tabs" role="tablist">
        {[
          ["data", "Data"],
          ["barplot", "Library Size"],
          ["qc", "QC"]
        ].map(([view, label]) => (
          <button key={view} type="button" className={`preprocess-tab${activeView === view ? " is-active" : ""}`} onClick={() => onActiveViewChange(view as "data" | "barplot" | "qc")}>
            {label}
          </button>
        ))}
      </div>

      {activeView === "data" ? <PreviewTable result={result} /> : null}
      {activeView === "barplot" ? <div ref={barplotRef} className="ribote-d3-host" /> : null}
      {activeView === "qc" ? (
        <div className="preprocess-qc-grid">
          <div ref={biotypeRef} className="ribote-d3-host" />
          <div ref={rrnaRef} className="ribote-d3-host" />
        </div>
      ) : null}
    </div>
  );
}

function ExportPanel({ result, onOpen }: {
  result: DataPreprocessResult | null;
  onOpen: () => void;
}) {
  return (
    <div className="preprocess-export">
      <button type="button" className="action-button" disabled={!result} onClick={onOpen}>
        <Download size={14} />
        Export
      </button>
    </div>
  );
}

function PreviewTable({ result }: { result: DataPreprocessResult }) {
  return (
    <PagedCsvTable
      columns={result.table.columns}
      fallbackRows={result.table.rows}
      rowLabel="processed rows"
      sourcePath={result.matrixPath}
      totalRows={result.table.totalRows}
    />
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="meta-plot-summary-item">
      <span className="meta-plot-summary-item__label">{label}</span>
      <span className="meta-plot-summary-item__value">{value}</span>
    </div>
  );
}

function mapBarPlotData(data: Array<Record<string, string | number | null>>): ChartDatum[] {
  return data.map((item) => {
      const sampleType = String(item.sample_type || "Sample");
    const actualLabel = String(item.sample || "");
    return {
      key: actualLabel,
      label: String(item.sample_display || item.sample || ""),
      actualLabel,
      value: Number(item.total_count) || 0,
      group: sampleType,
      color: sampleType === "Ribo-seq" ? "#d45a2a" : sampleType === "RNA-seq" ? "#147782" : "#8fa1a7"
    };
  });
}

function mapBiotypeData(data: Array<Record<string, string | number | null>>): ChartDatum[] {
  return data.map((item) => ({
    label: String(item.gene_biotype || "Unknown"),
    value: Number(item.genes_retained) || 0,
    group: "Gene Biotype",
    color: "#147782"
  }));
}

function mapRrnaData(data: Array<Record<string, string | number | null>>): RrnaDatum[] {
  return data.map((item) => ({
    sample: String(item.sample_display || item.sample || ""),
    sampleActual: String(item.sample || ""),
    category: String(item.category || ""),
    totalCount: Number(item.total_count) || 0
  }));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}
