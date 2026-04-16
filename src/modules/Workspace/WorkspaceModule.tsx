import { AlertTriangle, Play, Settings2 } from "lucide-react";
import type { ModuleDefinition } from "@/data/moduleCatalog";
import { useAppStore } from "@/store/useAppStore";

interface WorkspaceModuleProps {
  module: ModuleDefinition;
}

export function WorkspaceModule({ module }: WorkspaceModuleProps) {
  const Icon = module.icon;
  const annotationReady = useAppStore((state) => Boolean(state.annotationValidation?.isValid));
  const loadDataSaved = useAppStore((state) => Boolean(state.loadDataContext));
  const canRunAnalysis = annotationReady && loadDataSaved;
  const disabledReasons = [
    !annotationReady ? "Reference annotation files are incomplete" : null,
    !loadDataSaved ? "RNA/Ribo count matrix is not confirmed" : null
  ].filter(Boolean);
  const disabledReasonText = disabledReasons.join(" / ");

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
          title={canRunAnalysis ? `Run ${module.label}` : disabledReasonText}
        >
          <Play size={14} />
          Run {module.label}
        </button>
      </div>

      {!canRunAnalysis ? (
        <div className="analysis-gate" role="status">
          <AlertTriangle size={14} />
          <span>Analysis locked: {disabledReasonText}.</span>
        </div>
      ) : null}

      <div className="module-grid module-grid--two">
        <article className="config-card">
          <div className="config-card__head">
            <div className="config-card__icon">
              <Settings2 size={20} />
            </div>
            <div className="config-card__copy">
              <h3>{module.eyebrow}</h3>
              <p>{module.dependency}</p>
            </div>
          </div>
          <div className="ribote-replica-chip-grid">
            {module.sidebarSections.flatMap((section) =>
              section.items.map((item) => (
                <span key={`${section.title}-${item}`} className="static-field">
                  {item}
                </span>
              ))
            )}
          </div>
        </article>

        <article className="config-card">
          <div className="config-card__head">
            <div className="config-card__icon">
              <Icon size={20} />
            </div>
            <div className="config-card__copy">
              <h3>{module.canvasTitle}</h3>
              <p>{module.canvasDescription}</p>
            </div>
          </div>
          <div className="meta-plot-summary-grid gene-matrix-summary-grid">
            {module.metrics.map((metric) => (
              <div key={metric.label} className="meta-plot-summary-item">
                <span className="meta-plot-summary-item__label">{metric.label}</span>
                <span className="meta-plot-summary-item__value">{metric.value}</span>
              </div>
            ))}
          </div>
        </article>
      </div>

      <article className="config-card">
        <div className="config-card__head">
          <div className="config-card__icon">
            <Icon size={20} />
          </div>
          <div className="config-card__copy">
            <h3>Analysis Results</h3>
            <p>Results for this biological analysis will appear here after the required inputs are complete.</p>
          </div>
        </div>
        <div className="chart-placeholder__frame" />
      </article>
    </section>
  );
}
