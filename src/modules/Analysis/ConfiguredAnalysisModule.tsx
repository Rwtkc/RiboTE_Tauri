import { useMemo, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, Play, Settings2 } from "lucide-react";
import type { ModuleDefinition } from "@/data/moduleCatalog";
import { SPECIES_OPTIONS } from "@/data/species";
import { AnalysisResultWorkspace } from "@/modules/Analysis/AnalysisResultWorkspace";
import { ThemedSelect } from "@/modules/DataPreprocess/ThemedSelect";
import { getAnalysisModuleConfig, type AnalysisFieldConfig, type AnalysisModuleConfig } from "@/modules/Analysis/analysisModuleConfigs";
import { useTransientRuntimeError } from "@/hooks/useTransientRuntimeError";
import { useAppStore } from "@/store/useAppStore";
import type { RiboteAnalysisResult } from "@/store/useAppStore";
import { useLogStore } from "@/store/useLogStore";

interface ConfiguredAnalysisModuleProps {
  module: ModuleDefinition;
}

type FieldValue = string | boolean;

export function ConfiguredAnalysisModule({ module }: ConfiguredAnalysisModuleProps) {
  const annotationReady = useAppStore((state) => Boolean(state.annotationValidation?.isValid));
  const annotationDir = useAppStore((state) => state.annotationDir);
  const species = useAppStore((state) => state.species);
  const loadDataSaved = useAppStore((state) => Boolean(state.loadDataContext));
  const loadDataContext = useAppStore((state) => state.loadDataContext);
  const preprocessResult = useAppStore((state) => state.dataPreprocessResult);
  const teResult = useAppStore((state) => state.analysisResults.translation_efficiency);
  const result = useAppStore((state) => state.analysisResults[module.id] ?? null);
  const setAnalysisResult = useAppStore((state) => state.setAnalysisResult);
  const setEngineBusy = useAppStore((state) => state.setEngineBusy);
  const addLog = useLogStore((state) => state.addLog);
  const setConsoleExpanded = useLogStore((state) => state.setExpanded);
  const incrementProcess = useLogStore((state) => state.incrementProcess);
  const decrementProcess = useLogStore((state) => state.decrementProcess);
  const [fieldValues, setFieldValues] = useState<Record<string, FieldValue>>({});
  const [appliedClusteringGeneIds, setAppliedClusteringGeneIds] = useState("");
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
  const canRunAnalysis = annotationReady && loadDataSaved && preprocessMatchesCurrentReference && Boolean(teResult);
  const config = useMemo(
    () => getAnalysisModuleConfig(module.id, annotationSpecies?.id),
    [module.id, annotationSpecies?.id]
  );
  const disabledReasons = [
    !annotationReady ? "Reference annotation files are incomplete" : null,
    !loadDataSaved ? "RNA/Ribo count matrix is not confirmed" : null,
    !preprocessResult ? "Count matrix preprocessing is not complete" : null,
    preprocessResult && !preprocessMatchesCurrentReference ? "Count matrix preprocessing is not current for the selected reference" : null,
    !teResult ? "Translation efficiency analysis is not complete" : null
  ].filter(Boolean);
  const disabledReasonText = disabledReasons.join(" / ");

  if (!config) {
    return null;
  }

  function handleFieldValuesChange(nextValues: Record<string, FieldValue>) {
    if (String(nextValues.clustering_detail_mode ?? "") !== String(fieldValues.clustering_detail_mode ?? "")) {
      setAppliedClusteringGeneIds("");
    }
    setFieldValues(nextValues);
  }

  async function runAnalysis() {
    if (!config || !loadDataContext || !preprocessResult || !teResult || !canRunAnalysis) {
      return;
    }

    setIsRunning(true);
    setEngineBusy(true);
    setErrorMessage("");
    setConsoleExpanded(true);
    incrementProcess();
    addLog("command", `[${module.label}] 0% Starting ${module.label} analysis.`);

    const progressSteps = getAnalysisProgressSteps(module.id);
    let progressIndex = 0;
    const logNextProgress = () => {
      if (progressIndex >= progressSteps.length) {
        return;
      }
      addLog("info", `[${module.label}] ${progressSteps[progressIndex]}`);
      progressIndex += 1;
    };
    logNextProgress();
    const progressTimer = window.setInterval(() => {
      if (progressIndex >= progressSteps.length) {
        window.clearInterval(progressTimer);
        return;
      }
      logNextProgress();
    }, 1200);

    try {
      const nextResult = await invoke<RiboteAnalysisResult>("run_ribote_analysis", {
        moduleId: module.id,
        request: {
          preprocessMatrixPath: preprocessResult.matrixPath,
          annotationDir,
          speciesId: annotationSpecies?.id ?? "",
          speciesLabel: annotationSpecies?.label ?? species,
          teResultPath: teResult.resultPath,
          samplePairs: loadDataContext.samplePairs,
          parameters: normalizeAnalysisParameters(fieldValues, config)
        }
      });
      setAnalysisResult(module.id, nextResult);
      addLog("success", `[${module.label}] 100% Analysis results are ready.`);
    } catch (error) {
      const message = String(error);
      setErrorMessage(message);
      addLog("error", `[${module.label}] 100% Failed: ${message}`);
    } finally {
      window.clearInterval(progressTimer);
      setIsRunning(false);
      setEngineBusy(false);
      decrementProcess();
      setConsoleExpanded(false);
    }
  }

  return (
    <section className="module-page analysis-module-page">
      <div className="module-page__hero module-page__hero--with-action">
        <div className="module-page__hero-copy">
          <h1>{module.title}</h1>
          <p>{module.description}</p>
        </div>
        <button
          type="button"
          className="action-button action-button--primary"
          disabled={!canRunAnalysis || isRunning}
          title={canRunAnalysis ? config.runLabel : disabledReasonText}
          onClick={() => void runAnalysis()}
        >
          <Play size={14} />
          {isRunning ? "Running" : config.runLabel}
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
            <h3>{config.parameterTitle}</h3>
            <p>{config.parameterDescription}</p>
          </div>
        </div>
        <AnalysisParameterPanel
          config={config}
          onApplyClusteringGeneIds={(geneIds) => setAppliedClusteringGeneIds(geneIds)}
          onValuesChange={handleFieldValuesChange}
          values={fieldValues}
        />
      </article>

      <article className="config-card">
        <div className="config-card__head config-card__head--with-action">
          <div className="config-card__copy">
            <h3>Analysis Results</h3>
            <p>{config.resultDescription}</p>
          </div>
          {resultAction}
        </div>
        <AnalysisResultWorkspace
          result={result}
          uiState={{ ...fieldValues, clustering_detail_gene_ids_applied: appliedClusteringGeneIds }}
          emptyMessage={canRunAnalysis ? `${config.runLabel} to generate results.` : "Complete the required upstream analyses to unlock this result set."}
          onHeaderActionChange={setResultAction}
        />
      </article>
    </section>
  );
}

function getAnalysisProgressSteps(moduleId: string) {
  if (moduleId === "pca") {
    return [
      "12% Loading TE result table and sample pairing context.",
      "28% Resolving the selected data space and projection method.",
      "45% Filtering finite and variable feature rows.",
      "63% Building the sample-level projection matrix.",
      "78% Calculating PCA/MDS/T-SNE sample projections.",
      "92% Preparing projection table and D3 chart payload."
    ];
  }

  if (moduleId === "clustering") {
    return [
      "12% Loading TE result table and sample pairing context.",
      "26% Resolving TE/RNA/Ribo feature space.",
      "42% Selecting variable genes and applying gene-centric normalization.",
      "58% Computing row and sample distances.",
      "74% Ordering clustered heatmap matrix.",
      "90% Preparing main/detail heatmap payloads."
    ];
  }

  if (moduleId === "network") {
    return [
      "10% Loading TE result table and sample pairing context.",
      "22% Resolving Network data space and variable genes.",
      "36% Checking WGCNA and dynamicTreeCut availability.",
      "52% Computing TOM similarity matrix.",
      "68% Detecting WGCNA modules.",
      "84% Selecting graph nodes and thresholded edges.",
      "94% Preparing D3 network payload."
    ];
  }

  if (moduleId === "signalp") {
    return [
      "14% Loading TE result table and annotation directory.",
      "30% Locating SignalP/TMHMM/Phobius resource files.",
      "52% Matching TE groups to annotation gene IDs.",
      "72% Running Fisher enrichment comparisons.",
      "90% Preparing SignalP chart and summary table."
    ];
  }

  return [
    "20% Loading upstream preprocess and TE context.",
    "45% Preparing module parameters and analysis matrix.",
    "70% Calculating module-specific summaries.",
    "90% Building result tables and chart payloads."
  ];
}

function AnalysisParameterPanel({ config, onApplyClusteringGeneIds, values, onValuesChange }: {
  config: AnalysisModuleConfig;
  onApplyClusteringGeneIds?: (geneIds: string) => void;
  values: Record<string, FieldValue>;
  onValuesChange: (values: Record<string, FieldValue>) => void;
}) {
  const defaults = useMemo(() => {
    const entries = config.sections.flatMap((section) => section.fields.map((field) => [field.id, field.value] as const));
    return Object.fromEntries(entries) as Record<string, FieldValue>;
  }, [config]);
  const mergedValues = sanitizeAnalysisFieldValues(config, { ...defaults, ...values });

  function updateField(fieldId: string, value: FieldValue) {
    onValuesChange({ ...mergedValues, [fieldId]: value });
  }

  return (
    <div className="analysis-parameter-sections">
      {config.sections.map((section, index) => (
        <section key={`${config.id}-section-${index}`} className="analysis-parameter-section" data-module-id={config.id} data-section-title={section.title}>
          <div className="module-parameter-list analysis-parameter-grid">
            {section.fields.map((field) => (
              <AnalysisField
                key={field.id}
                action={config.id === "clustering" && field.id === "clustering_detail_gene_ids" ? (
                  <button
                    type="button"
                    className="analysis-apply-button"
                    disabled={!/gene/i.test(String(mergedValues.clustering_detail_mode || "")) || !String(mergedValues.clustering_detail_gene_ids || "").trim()}
                    onClick={() => onApplyClusteringGeneIds?.(String(mergedValues.clustering_detail_gene_ids || ""))}
                  >
                    Apply
                  </button>
                ) : null}
                field={field}
                isDisabled={config.id === "clustering" && field.id === "clustering_detail_gene_ids" && !/gene/i.test(String(mergedValues.clustering_detail_mode || ""))}
                value={mergedValues[field.id] ?? field.value}
                onChange={(value) => updateField(field.id, value)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function sanitizeAnalysisFieldValues(config: AnalysisModuleConfig, values: Record<string, FieldValue>) {
  const sanitized = { ...values };
  for (const section of config.sections) {
    for (const field of section.fields) {
      if (field.type !== "select" || !field.options?.length) {
        continue;
      }
      const value = sanitized[field.id];
      if (typeof value !== "string" || !field.options.includes(value)) {
        sanitized[field.id] = field.value;
      }
    }
  }
  return sanitized;
}
function normalizeAnalysisParameters(values: Record<string, FieldValue>, config: AnalysisModuleConfig) {
  const defaults = Object.fromEntries(config.sections.flatMap((section) => section.fields.map((field) => [field.id, field.value] as const)));
  const merged = sanitizeAnalysisFieldValues(config, { ...defaults, ...values });
  const pick = (id: string) => Object.prototype.hasOwnProperty.call(defaults, id) ? merged[id] : undefined;
  const booleanSelect = (id: string) => {
    const value = pick(id);
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      return value.toLowerCase() === "true";
    }
    return undefined;
  };

  return {
    dataSpace: pick("pca_data_space") ?? pick("clustering_data_space") ?? pick("network_data_space"),
    method: pick("pca_method") ?? pick("signal_method"),
    topGenes: pick("clustering_top_genes") ?? pick("network_top_genes"),
    zscoreMax: pick("clustering_zscore_max"),
    geneCentricity: booleanSelect("clustering_gene_centricity"),
    detailMode: pick("clustering_detail_mode"),
    detailGeneIds: pick("clustering_detail_gene_ids"),
    distance: pick("clustering_distance"),
    linkage: pick("clustering_linkage"),
    collection: pick("gsea_collection") ?? pick("enrichment_collection"),
    genesetMin: pick("gsea_geneset_min"),
    genesetMax: pick("gsea_geneset_max"),
    fdrCutoff: pick("gsea_fdr_cutoff"),
    showN: pick("gsea_show_n"),
    topPathways: pick("enrichment_top_pathways"),
    sortBy: pick("enrichment_sort_by"),
    filteredBackground: booleanSelect("enrichment_filtered_background"),
    removeRedundant: booleanSelect("enrichment_remove_redundant"),
    showPathwayId: booleanSelect("enrichment_show_pathway_id"),
    edgeThreshold: pick("network_edge_threshold"),
    variableGenes: pick("network_variable_genes"),
    networkModule: pick("network_module"),
    softPower: pick("network_soft_power"),
    minModuleSize: pick("network_min_module_size")
  };
}

function AnalysisField({ action, field, isDisabled, value, onChange }: {
  action?: ReactNode;
  field: AnalysisFieldConfig;
  isDisabled?: boolean;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
}) {
  if (field.type === "checkbox") {
    return (
      <label className="module-parameter-field module-parameter-field--checkbox">
        <span className="module-parameter-field__label">{field.label}</span>
        <span className={`analysis-checkbox-field${Boolean(value) ? " is-checked" : ""}`}>
          <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
          <span className="analysis-checkbox-field__text">{Boolean(value) ? "Enabled" : "Disabled"}</span>
        </span>
      </label>
    );
  }

  const control = field.type === "select" ? (
        <ThemedSelect options={field.options ?? []} value={String(value)} onChange={onChange} />
      ) : (
        <input
          className="module-parameter-field__control"
          type={field.type}
          min={field.min}
          max={field.max}
          step={field.step}
          placeholder={field.placeholder}
          disabled={isDisabled}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      );

  return (
    <label className={`module-parameter-field module-parameter-field--${field.id}${action ? " module-parameter-field--with-action" : ""}`}>
      <span className="module-parameter-field__label">{field.label}</span>
      {action ? (
        <span className="module-parameter-field__control-row">
          {control}
          {action}
        </span>
      ) : control}
    </label>
  );
}
