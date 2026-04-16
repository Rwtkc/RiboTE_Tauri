import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import type { RiboteAnalysisResult } from "@/store/useAppStore";
import type { DensitySeries } from "@/modules/Analysis/analysisCharts";
import { drawScatter, drawSimpleBars, useAnalysisChart } from "@/modules/Analysis/useAnalysisChart";
import {
  buildGseaPlotFromCatalog,
  drawClusteringHeatmap,
  drawEnrichmentOverview,
  drawGseaPlot,
  drawNetworkGraph,
  drawSignalpOverview,
  normalizeGseaCatalog,
  normalizeHeatmap
} from "@/modules/Analysis/richAnalysisCharts";
import {
  exportAnalysisData,
  exportAnalysisFigures,
  normalizeAnalysisExportOptions
} from "@/modules/Analysis/analysisResultExports";
import { PagedCsvTable } from "@/components/PagedCsvTable";
import { DataPreprocessExportDialog, type DataPreprocessExportState } from "@/modules/DataPreprocess/DataPreprocessExportDialog";
import { useLogStore } from "@/store/useLogStore";

interface AnalysisResultWorkspaceProps {
  emptyMessage: string;
  onHeaderActionChange?: (action: ReactNode) => void;
  result: RiboteAnalysisResult | null;
  uiState?: Record<string, unknown>;
}

const exportableFigureViewTypes = new Set([
  "scatter",
  "bar",
  "heatmap",
  "clustering",
  "network",
  "signalp",
  "gsea",
  "enrichment"
]);

type ClusteringViewCache = {
  areaSelection: Record<string, number> | null;
  selectedCell: Record<string, unknown> | null;
};

const clusteringViewCache = new Map<string, ClusteringViewCache>();

export function AnalysisResultWorkspace({ emptyMessage, onHeaderActionChange, result, uiState }: AnalysisResultWorkspaceProps) {
  const [activeView, setActiveView] = useState(result?.views[0]?.id ?? "data");
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportState, setExportState] = useState<DataPreprocessExportState>({
    format: "csv",
    width: "3000",
    height: "1800",
    dpi: "300"
  });
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const addLog = useLogStore((state) => state.addLog);
  const currentView = result?.views.find((view) => view.id === activeView) ?? result?.views[0];
  const figureDisabled = !currentView || !exportableFigureViewTypes.has(currentView.type);
  const exportButton = useMemo(() => {
    if (!result || !currentView) {
      return (
        <button type="button" className="action-button analysis-export-button" disabled>
          <Download size={14} />
          Export
        </button>
      );
    }

    return (
      <button
        type="button"
        className="action-button analysis-export-button"
        onClick={() => {
          setExportState((current) => ({
            ...current,
            format: currentView.type === "table" ? "csv" : current.format === "csv" ? "png" : current.format
          }));
          setIsExportOpen(true);
        }}
      >
        <Download size={14} />
        Export
      </button>
    );
  }, [currentView, result]);

  useEffect(() => {
    onHeaderActionChange?.(exportButton);
    return () => onHeaderActionChange?.(null);
  }, [onHeaderActionChange, exportButton]);

  async function handleExportSubmit() {
    if (!result || !currentView) {
      return;
    }

    try {
      const exported = exportState.format === "csv"
        ? await exportAnalysisData(result)
        : await exportAnalysisFigures(result, currentView, workspaceRef, exportState.format, normalizeAnalysisExportOptions(exportState));
      if (exported) {
        setIsExportOpen(false);
      }
    } catch (error) {
      addLog("error", `[${result.moduleId}] Export failed: ${String(error)}`);
    }
  }

  if (!result || !currentView) {
    return (
      <div className="chart-placeholder__frame analysis-result-placeholder">
        <div className="chart-placeholder__copy">
          <span>{emptyMessage}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="preprocess-results" ref={workspaceRef}>
      {!onHeaderActionChange ? <div className="analysis-result-actions">{exportButton}</div> : null}

      <div className="preprocess-metrics">
        {result.summary.map((item) => (
          <div key={item.label} className="meta-plot-summary-item">
            <span className="meta-plot-summary-item__label">{item.label}</span>
            <span className="meta-plot-summary-item__value">{item.value}</span>
          </div>
        ))}
      </div>

      {result.views.length > 1 ? (
        <div className="preprocess-tabs" role="tablist">
          {result.views.map((view) => (
            <button key={view.id} type="button" className={`preprocess-tab${currentView.id === view.id ? " is-active" : ""}`} onClick={() => setActiveView(view.id)}>
              {view.title}
            </button>
          ))}
        </div>
      ) : null}

      <AnalysisView result={result} uiState={uiState} viewId={currentView.id} viewType={currentView.type} viewTitle={currentView.title} />

      {isExportOpen ? (
        <DataPreprocessExportDialog
          ariaLabel={`${result.moduleId} export`}
          figureDisabled={figureDisabled}
          figureDisabledTitle="Select a chart view before exporting figures"
          onClose={() => setIsExportOpen(false)}
          onStateChange={setExportState}
          onSubmit={() => void handleExportSubmit()}
          state={exportState}
        />
      ) : null}
    </div>
  );
}

function AnalysisView({ result, uiState, viewId, viewType, viewTitle }: {
  result: RiboteAnalysisResult;
  uiState?: Record<string, unknown>;
  viewId: string;
  viewType: string;
  viewTitle: string;
}) {
  if (viewType === "scatter") {
    return <ScatterView data={result.charts[viewId] ?? result.charts.volcano ?? result.charts.projection ?? result.charts.scatter} title={viewTitle} />;
  }
  if (viewType === "bar") {
    return <BarView data={result.charts[viewId] ?? result.charts.bar} title={viewTitle} />;
  }
  if (viewType === "heatmap") {
    return <HeatmapView data={result.charts[viewId] ?? result.charts.heatmap} />;
  }
  if (viewType === "clustering") {
    return <ClusteringView data={result.charts[viewId] ?? result.charts.clustering} uiState={uiState} />;
  }
  if (viewType === "network") {
    return <NetworkView data={result.charts[viewId] ?? result.charts.network} />;
  }
  if (viewType === "signalp") {
    return <SignalpView data={result.charts[viewId] ?? result.charts.signalp} />;
  }
  if (viewType === "gsea") {
    return <GseaView data={result.charts[viewId] ?? result.charts.gsea} />;
  }
  if (viewType === "enrichment") {
    return <EnrichmentView data={result.charts[viewId] ?? result.charts.enrichment} />;
  }
  return <AnalysisTable result={result} />;
}

function ScatterView({ data, title }: { data: unknown; title: string }) {
  const panels = useMemo(() => normalizeScatterPanels(data, title), [data, title]);

  if (panels.length > 1) {
    return (
      <div className="analysis-scatter-stack">
        {panels.map((panel) => (
          <ScatterPanel key={panel.id} panel={panel} />
        ))}
      </div>
    );
  }

  return <ScatterPanel panel={panels[0] ?? emptyScatterPanel(title)} />;
}

function ScatterPanel({ panel }: { panel: ScatterPanelData }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const rows = useMemo(() => panel.rows.map((row) => ({
    GeneID: stringValue(row.GeneID),
    actualRibo: stringValue(row.actual_ribo || row.actualRibo),
    actualRna: stringValue(row.actual_rna || row.actualRna),
    actualSample: stringValue(row.actual_sample || row.actualSample),
    displaySample: stringValue(row.display_sample || row.displaySample),
    gene: stringValue(row.gene),
    sample: stringValue(row.sample || row.display_sample),
    x: plotNumber(row.x),
    y: plotNumber(row.y),
    group: stringValue(row.group || row.status),
    pvalue: optionalNumber(row.pvalue),
    padj: optionalNumber(row.padj),
    te: optionalNumber(row.te)
  })), [panel.rows]);
  useAnalysisChart(ref, (element) => drawScatter(element, rows, {
    displayPointLimit: panel.displayPointLimit,
    displayedRows: panel.displayedRows,
    densityX: panel.densityX,
    densityY: panel.densityY,
    height: panel.height,
    legendCounts: panel.legendCounts,
    marginalDensity: panel.marginalDensity,
    pointColor: panel.pointColor,
    pcaProjection: panel.pcaProjection,
    referenceLines: panel.referenceLines,
    scaleType: panel.scaleType,
    showCorrelation: panel.showCorrelation,
    showLegend: panel.showLegend,
    title: panel.title,
    totalRows: panel.totalRows,
    xDomain: panel.xDomain,
    xLabel: panel.xLabel,
    yDomain: panel.yDomain,
    yMinFromData: panel.yMinFromData,
    yLabel: panel.yLabel
  }), [rows, panel]);
  return <div ref={ref} className="ribote-d3-host" />;
}

function BarView({ data, title }: { data: unknown; title: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const rows = useMemo(() => normalizeRows(data).map((row) => ({
    label: stringValue(row.label || row.pathway || row.method || row.status),
    value: numberValue(row.value || row.score || row.fraction),
    group: stringValue(row.group)
  })), [data]);
  useAnalysisChart(ref, (element) => drawSimpleBars(element, rows, title), [rows, title]);
  return <div ref={ref} className="ribote-d3-host" />;
}

function HeatmapView({ data }: { data: unknown }) {
  const rows = normalizeRows(data).slice(0, 80);
  const columns = Object.keys(rows[0] ?? {}).filter((column) => column !== "GeneID").slice(0, 16);
  return (
    <div className="analysis-heatmap">
      {rows.map((row, rowIndex) => columns.map((column) => (
        <span key={`${rowIndex}-${column}`} title={`${stringValue(row.GeneID)} ${column}: ${row[column]}`} style={{ background: heatColor(numberValue(row[column])) }} />
      )))}
    </div>
  );
}

function ClusteringView({ data, uiState }: { data: unknown; uiState?: Record<string, unknown> }) {
  const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const mainHeatmap = useMemo(() => normalizeHeatmap(record.main), [record.main]);
  const serverDetailHeatmap = useMemo(() => normalizeHeatmap(record.detail), [record.detail]);
  const cacheKey = useMemo(() => buildClusteringCacheKey(mainHeatmap), [mainHeatmap]);
  const cachedState = clusteringViewCache.get(cacheKey);
  const mainRef = useRef<HTMLDivElement | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const [selectedCell, setSelectedCell] = useState<Record<string, unknown> | null>(cachedState?.selectedCell ?? null);
  const [areaSelection, setAreaSelection] = useState<Record<string, number> | null>(cachedState?.areaSelection ?? null);
  const currentDetailMode = stringValue(uiState?.clustering_detail_mode) || stringValue(record.detailModeLabel) || "Select Area";
  const isGeneIdsMode = /gene/i.test(currentDetailMode);
  const appliedGeneIds = stringValue(uiState?.clustering_detail_gene_ids_applied);
  const previousModeRef = useRef(currentDetailMode);
  const previousAppliedGeneIdsRef = useRef(appliedGeneIds);
  const areaDetailHeatmap = useMemo(() => buildSelectedHeatmap(mainHeatmap, areaSelection), [areaSelection, mainHeatmap]);
  const geneIdDetailHeatmap = useMemo(() => buildGeneIdHeatmap(mainHeatmap, appliedGeneIds), [appliedGeneIds, mainHeatmap]);
  const geneIdsEmptyMessage = appliedGeneIds.trim()
    ? "No matching Gene IDs are present in the clustered matrix."
    : "Enter Gene IDs and click Apply to render a detail heatmap.";
  const detailHeatmap = isGeneIdsMode ? (geneIdDetailHeatmap ?? normalizeHeatmap({ emptyMessage: geneIdsEmptyMessage })) : (areaDetailHeatmap ?? serverDetailHeatmap);
  const detailSummary = areaDetailHeatmap
    ? `${areaDetailHeatmap.rows.length.toLocaleString()} selected genes x ${areaDetailHeatmap.columns.length} samples`
    : stringValue(record.detailSummary || record.detailEmptyMessage);

  useEffect(() => {
    const cached = clusteringViewCache.get(cacheKey);
    setAreaSelection(cached?.areaSelection ?? null);
    setSelectedCell(cached?.selectedCell ?? null);
  }, [cacheKey]);

  useEffect(() => {
    const modeChanged = previousModeRef.current !== currentDetailMode;
    const appliedGeneIdsChanged = previousAppliedGeneIdsRef.current !== appliedGeneIds;
    previousModeRef.current = currentDetailMode;
    previousAppliedGeneIdsRef.current = appliedGeneIds;
    if (!modeChanged && !appliedGeneIdsChanged) {
      return;
    }
    setAreaSelection(null);
    setSelectedCell(null);
    writeClusteringCache(cacheKey, { areaSelection: null, selectedCell: null });
  }, [appliedGeneIds, cacheKey, currentDetailMode]);

  function handleCellClick(cell: Record<string, unknown>) {
    setSelectedCell(cell);
    writeClusteringCache(cacheKey, { selectedCell: cell });
  }

  function handleBrushSelection(selection: Record<string, number>) {
    setAreaSelection(selection);
    writeClusteringCache(cacheKey, { areaSelection: selection });
  }

  useAnalysisChart(mainRef, (element) => drawClusteringHeatmap(element, mainHeatmap, {
    chartHeight: 700,
    activeCell: selectedCell,
    onCellClick: handleCellClick,
    onBrushSelection: isGeneIdsMode ? undefined : handleBrushSelection
  }), [mainHeatmap, selectedCell, isGeneIdsMode, cacheKey]);
  useAnalysisChart(detailRef, (element) => drawClusteringHeatmap(element, detailHeatmap, {
    chartHeight: 700,
    activeCell: selectedCell,
    onCellClick: handleCellClick
  }), [detailHeatmap, selectedCell, cacheKey]);

  return (
    <div className="ribote-clustering-results">
      <div className="ribote-clustering-grid">
        <div className="ribote-clustering-panel ribote-clustering-panel--main">
          <div className="ribote-d3-card">
            <div className="ribote-clustering-host">
              <div ref={mainRef} className="ribote-d3-host" />
            </div>
          </div>
        </div>
        <div className="ribote-clustering-panel ribote-clustering-panel--detail">
          <div className="ribote-d3-card">
            <div className="ribote-clustering-host">
              <div ref={detailRef} className="ribote-d3-host" />
            </div>
          </div>
        </div>
      </div>

      <div className="ribote-clustering-detail">
        <div className="ribote-clustering-detail__header">
          <div>
            <h4>Detail Selection</h4>
            <p>
              {currentDetailMode ? `${currentDetailMode}. ` : ""}
              {isGeneIdsMode ? (geneIdDetailHeatmap?.subtitle || geneIdsEmptyMessage) : (detailSummary || "Drag across the main heatmap to stage a detail view.")}
            </p>
          </div>
        </div>
        {selectedCell ? (
          <div className="ribote-clustering-detail__grid">
            <DetailValue label="Gene ID" value={stringValue(selectedCell.gene)} />
            <DetailValue label="Sample" value={stringValue((selectedCell.column as Record<string, unknown>)?.displaySample)} />
            <DetailValue label="Actual" value={stringValue((selectedCell.column as Record<string, unknown>)?.actualSample)} />
            <DetailValue label="Group" value={stringValue((selectedCell.column as Record<string, unknown>)?.group)} />
            <DetailValue label="Value" value={fmtNumber(numberValue(selectedCell.value))} />
          </div>
        ) : (
          <p className="ribote-clustering-detail__empty">Click a cell in the main or detail heatmap to inspect its value and sample mapping.</p>
        )}
      </div>
    </div>
  );
}

function NetworkView({ data }: { data: unknown }) {
  const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const graph = record.graph && typeof record.graph === "object" ? record.graph as Record<string, unknown> : record;
  const nodes = normalizeRows(graph.nodes);
  const edges = normalizeRows(graph.edges);
  const ref = useRef<HTMLDivElement | null>(null);
  const [showLabels, setShowLabels] = useState(!Boolean(graph.autoHideLabels));
  const signature = `${stringValue(graph.signature)}::${showLabels ? "labels" : "hidden"}::${nodes.length}::${edges.length}`;
  useAnalysisChart(ref, (element) => drawNetworkGraph(element, { ...graph, nodes, edges }, showLabels), [signature]);

  return (
    <div className="ribote-network-results">
      {stringValue(record.note) ? (
        <div className="ribote-result-card">
          <p className="ribote-result-card__copy">{stringValue(record.note)}</p>
        </div>
      ) : null}
      <div className="ribote-network-panel ribote-network-panel--graph">
        <div className="ribote-d3-card">
          <div className="ribote-network-host">
            {nodes.length ? (
              <div className="ribote-network-actions">
                <button type="button" className="ribote-btn ribote-btn--secondary ribote-network-toggle" onClick={() => ref.current?.dispatchEvent(new CustomEvent("ribote:network-fit-view"))}>
                  Fit View
                </button>
                <button type="button" className="ribote-btn ribote-btn--secondary ribote-network-toggle" onClick={() => setShowLabels((current) => !current)}>
                  {showLabels ? "Hide Labels" : "Show Labels"}
                </button>
              </div>
            ) : null}
            <div ref={ref} className="ribote-d3-host" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SignalpView({ data }: { data: unknown }) {
  const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const plot = record.plot && typeof record.plot === "object" ? record.plot as Record<string, unknown> : {};
  const table = record.table && typeof record.table === "object" ? record.table as Record<string, unknown> : {};
  const rows = normalizeRows(table.rows);
  const plotRows = normalizeRows(plot.rows);
  const ref = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  useAnalysisChart(ref, (element) => drawSignalpOverview(element, plotRows, {
    title: `${stringValue(record.methodLabel) || "SignalP"} Overview`
  }), [plotRows, record.methodLabel]);

  return (
    <div className="ribote-signalp-results">
      {stringValue(record.note) ? (
        <div className="ribote-result-card">
          <p className="ribote-result-card__copy">{stringValue(record.note)}</p>
        </div>
      ) : null}
      <div className="ribote-signalp-grid">
        <div className="ribote-signalp-panel ribote-signalp-panel--plot">
          <div className="ribote-d3-card">
            <div className="ribote-signalp-host">
              <div ref={ref} className="ribote-d3-host" />
            </div>
          </div>
        </div>
        <div className="ribote-signalp-panel ribote-signalp-panel--table">
          <div className="ribote-d3-card">
            <div className="ribote-gsea-table-header">
              <div>
                <h4 className="ribote-d3-card__title">SignalP Table</h4>
                <p className="ribote-gsea-table-copy">{stringValue(record.methodLabel) || "SignalP"} | {numberValue(table.comparisonCount)} Fisher comparisons</p>
              </div>
            </div>
            <div className="ribote-gsea-table-wrap">
              <table className="ribote-enrichment-table ribote-signalp-table">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Method</th>
                    <th>TE Group</th>
                    <th>Annotated Genes</th>
                    <th>Total Genes</th>
                    <th>Percentage</th>
                    <th>Up vs Non p</th>
                    <th>Down vs Non p</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, index) => (
                    <tr key={`${row.method}-${row.teGroup}-${index}`}>
                      <td>{(page - 1) * pageSize + index + 1}</td>
                      <td>{stringValue(row.methodLabel)}</td>
                      <td>{stringValue(row.teGroup)}</td>
                      <td>{numberValue(row.annotatedCount).toLocaleString()}</td>
                      <td>{numberValue(row.totalCount).toLocaleString()}</td>
                      <td>{`${(numberValue(row.percent) * 100).toFixed(2)}%`}</td>
                      <td>{formatPValue(row.upVsNonPValue)}</td>
                      <td>{formatPValue(row.downVsNonPValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > pageSize ? (
              <div className="ribote-table-pagination">
                <span className="ribote-table-pagination__meta">Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, rows.length)} of {rows.length} rows | Page {page} of {totalPages}</span>
                <div className="ribote-table-pagination__actions">
                  <button type="button" className="ribote-btn ribote-btn--secondary" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
                  <button type="button" className="ribote-btn ribote-btn--secondary" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function GseaView({ data }: { data: unknown }) {
  const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const table = record.table && typeof record.table === "object" ? record.table as Record<string, unknown> : {};
  const rows = normalizeRows(table.rows);
  const catalog = useMemo(() => normalizeGseaCatalog(record.plotCatalog), [record.plotCatalog]);
  const [selectedId, setSelectedId] = useState(() => stringValue(rows[0]?.pathwayId));
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const activeRow = rows.find((row) => stringValue(row.pathwayId) === selectedId) ?? rows[0] ?? null;
  const plot = useMemo(() => buildGseaPlotFromCatalog(activeRow, stringValue(record.collectionLabel) || "GSEA", catalog), [activeRow, catalog, record.collectionLabel]);
  const ref = useRef<HTMLDivElement | null>(null);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (!selectedId && rows[0]) {
      setSelectedId(stringValue(rows[0].pathwayId));
    }
  }, [rows, selectedId]);
  useAnalysisChart(ref, (element) => drawGseaPlot(element, plot), [plot]);

  return (
    <div className="ribote-gsea-results">
      {stringValue(record.note) ? <div className="ribote-result-card"><p className="ribote-result-card__copy">{stringValue(record.note)}</p></div> : null}
      <div className="ribote-d3-card">
        <div ref={ref} className="ribote-d3-host ribote-gsea-host" />
      </div>
      <div className="ribote-d3-card">
        <div className="ribote-gsea-table-header">
          <div>
            <h4 className="ribote-d3-card__title">Pathway Table</h4>
            <p className="ribote-gsea-table-copy">{stringValue(record.collectionLabel)} | {numberValue(table.significantCount)} significant of {numberValue(table.totalTested)} tested</p>
          </div>
        </div>
        <div className="ribote-gsea-table-wrap">
          <table className="ribote-enrichment-table ribote-signalp-table">
            <thead>
              <tr>
                <th>Pathway</th>
                <th>Direction</th>
                <th>NES</th>
                <th>FDR</th>
                <th>P value</th>
                <th>Size</th>
                <th>Leading Edge</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={stringValue(row.pathwayId)} className={stringValue(row.pathwayId) === stringValue(activeRow?.pathwayId) ? "is-selected" : ""} onClick={() => setSelectedId(stringValue(row.pathwayId))}>
                  <td>{stringValue(row.pathway)}</td>
                  <td>{stringValue(row.direction)}</td>
                  <td>{fmtNumber(row.nes, 3)}</td>
                  <td>{formatPValue(row.padj)}</td>
                  <td>{formatPValue(row.pvalue)}</td>
                  <td>{numberValue(row.size).toLocaleString()}</td>
                  <td>{numberValue(row.leadingEdgeSize).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > pageSize ? <SimplePagination page={page} totalPages={totalPages} totalRows={rows.length} pageSize={pageSize} onPageChange={setPage} /> : null}
      </div>
    </div>
  );
}

function EnrichmentView({ data }: { data: unknown }) {
  const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const table = record.table && typeof record.table === "object" ? record.table as Record<string, unknown> : {};
  const plot = record.plot && typeof record.plot === "object" ? record.plot as Record<string, unknown> : {};
  const rows = normalizeRows(table.rows);
  const plotRows = normalizeRows(plot.rows);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const ref = useRef<HTMLDivElement | null>(null);
  useAnalysisChart(ref, (element) => drawEnrichmentOverview(element, plotRows, {
    title: `${stringValue(record.collectionLabel) || "Enrichment"} Overview`
  }), [plotRows, record.collectionLabel]);

  return (
    <div className="ribote-enrichment-results">
      {stringValue(record.note) ? <div className="ribote-result-card"><p className="ribote-result-card__copy">{stringValue(record.note)}</p></div> : null}
      <div className="ribote-d3-card">
        <div ref={ref} className="ribote-d3-host ribote-enrichment-host" />
      </div>
      <div className="ribote-d3-card">
        <div className="ribote-gsea-table-header">
          <div>
            <h4 className="ribote-d3-card__title">Enrichment Table</h4>
            <p className="ribote-gsea-table-copy">{stringValue(record.collectionLabel)} | Background: {stringValue(record.backgroundLabel)}</p>
          </div>
        </div>
        <div className="ribote-gsea-table-wrap">
          <table className="ribote-enrichment-table ribote-signalp-table">
            <thead>
              <tr>
                <th>Group</th>
                <th>Pathway</th>
                <th>FDR</th>
                <th>P value</th>
                <th>Fold</th>
                <th>Overlap</th>
                <th>Pathway Size</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, index) => (
                <tr key={`${row.group}-${row.pathwayId}-${index}`}>
                  <td>{stringValue(row.group)}</td>
                  <td>{stringValue(row.pathway)}</td>
                  <td>{formatPValue(row.padj)}</td>
                  <td>{formatPValue(row.pvalue)}</td>
                  <td>{fmtNumber(row.fold, 2)}</td>
                  <td>{numberValue(row.overlap).toLocaleString()} / {numberValue(row.querySize).toLocaleString()}</td>
                  <td>{numberValue(row.pathwaySize).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > pageSize ? <SimplePagination page={page} totalPages={totalPages} totalRows={rows.length} pageSize={pageSize} onPageChange={setPage} /> : null}
      </div>
    </div>
  );
}

function SimplePagination({ page, totalPages, totalRows, pageSize, onPageChange }: {
  onPageChange: (page: number) => void;
  page: number;
  pageSize: number;
  totalPages: number;
  totalRows: number;
}) {
  const pageButtons = buildPageButtons(page, totalPages);

  return (
    <div className="matrix-preview__pager ribote-table-pagination">
      <span className="matrix-preview__note ribote-table-pagination__meta">
        Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalRows)} of {totalRows} rows | Page {page} of {totalPages}
      </span>
      <div className="matrix-preview__pager-actions ribote-table-pagination__actions">
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>Previous</button>
        {pageButtons.map((button, index) => button === "ellipsis" ? (
          <span key={`ellipsis-${index}`} className="matrix-preview__pager-ellipsis">...</span>
        ) : (
          <button key={button} type="button" className={button === page ? "is-active" : ""} onClick={() => onPageChange(button)}>{button}</button>
        ))}
        <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))}>Next</button>
      </div>
    </div>
  );
}

function buildPageButtons(currentPage: number, pageCount: number): Array<number | "ellipsis"> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = new Set([1, pageCount, currentPage - 1, currentPage, currentPage + 1]);
  const sorted = Array.from(pages)
    .filter((pageNumber) => pageNumber >= 1 && pageNumber <= pageCount)
    .sort((left, right) => left - right);
  const buttons: Array<number | "ellipsis"> = [];

  sorted.forEach((pageNumber, index) => {
    const previous = sorted[index - 1];
    if (previous && pageNumber - previous > 1) {
      buttons.push("ellipsis");
    }
    buttons.push(pageNumber);
  });

  return buttons;
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="ribote-clustering-detail__item">
      <span className="ribote-clustering-detail__label">{label}</span>
      <span className="ribote-clustering-detail__value">{value || "NA"}</span>
    </div>
  );
}

function writeClusteringCache(cacheKey: string, patch: Partial<ClusteringViewCache>) {
  const current = clusteringViewCache.get(cacheKey) ?? { areaSelection: null, selectedCell: null };
  clusteringViewCache.set(cacheKey, { ...current, ...patch });
  if (clusteringViewCache.size > 12) {
    const oldestKey = clusteringViewCache.keys().next().value;
    if (oldestKey) {
      clusteringViewCache.delete(oldestKey);
    }
  }
}

function buildClusteringCacheKey(heatmap: ReturnType<typeof normalizeHeatmap>) {
  const rows = heatmap.rows;
  const columns = heatmap.columns.map((column: { displaySample: string; actualSample: string; group: string }) => `${column.displaySample}:${column.actualSample}:${column.group}`);
  const sampleValues = [
    heatmap.matrix[0]?.[0],
    heatmap.matrix[Math.floor(heatmap.matrix.length / 2)]?.[Math.floor((heatmap.columns.length || 1) / 2)],
    heatmap.matrix[heatmap.matrix.length - 1]?.[heatmap.columns.length - 1]
  ].map((value) => Number.isFinite(Number(value)) ? Number(value).toPrecision(6) : "NA");

  return [
    heatmap.title,
    heatmap.subtitle,
    rows.length,
    heatmap.columns.length,
    rows.slice(0, 4).join(","),
    rows.slice(-4).join(","),
    columns.join(","),
    sampleValues.join(",")
  ].join("::");
}

function buildSelectedHeatmap(heatmap: ReturnType<typeof normalizeHeatmap>, selection: Record<string, number> | null) {
  if (!selection || !heatmap.rows.length || !heatmap.columns.length || !heatmap.matrix.length) {
    return null;
  }
  const rowStart = Math.max(0, Math.min(selection.rowStart, selection.rowEnd));
  const rowEnd = Math.min(heatmap.rows.length - 1, Math.max(selection.rowStart, selection.rowEnd));
  const colStart = Math.max(0, Math.min(selection.colStart, selection.colEnd));
  const colEnd = Math.min(heatmap.columns.length - 1, Math.max(selection.colStart, selection.colEnd));
  const rows = heatmap.rows.slice(rowStart, rowEnd + 1);
  const columns = heatmap.columns.slice(colStart, colEnd + 1);
  const matrix = heatmap.matrix.slice(rowStart, rowEnd + 1).map((row: number[]) => row.slice(colStart, colEnd + 1));
  if (!rows.length || !columns.length || !matrix.length) {
    return null;
  }
  return {
    ...heatmap,
    title: "Detail Heatmap",
    subtitle: `${rows.length.toLocaleString()} selected genes x ${columns.length} samples`,
    rows,
    columns,
    matrix,
    showRowLabels: rows.length <= 80,
    emptyMessage: ""
  };
}

function buildGeneIdHeatmap(heatmap: ReturnType<typeof normalizeHeatmap>, geneIds: string) {
  const requested = parseGeneIds(geneIds);
  if (!requested.length || !heatmap.rows.length || !heatmap.columns.length || !heatmap.matrix.length) {
    return null;
  }
  const rowIndexByGene = new Map(heatmap.rows.map((row: string, index: number) => [row, index]));
  const rowIndexes = requested
    .map((geneId) => rowIndexByGene.get(geneId))
    .filter((index): index is number => typeof index === "number");
  if (!rowIndexes.length) {
    return null;
  }
  const rows = rowIndexes.map((index) => heatmap.rows[index]);
  const matrix = rowIndexes.map((index) => heatmap.matrix[index]);
  return {
    ...heatmap,
    title: "Detail Heatmap",
    subtitle: `${rows.length.toLocaleString()} matched genes x ${heatmap.columns.length} samples`,
    rows,
    matrix,
    showRowLabels: rows.length <= 80,
    emptyMessage: ""
  };
}

function parseGeneIds(value: string) {
  return Array.from(new Set(value.split(/[,，\s]+/u).map((item) => item.trim()).filter(Boolean)));
}

function AnalysisTable({ result }: { result: RiboteAnalysisResult }) {
  return (
    <PagedCsvTable
      columns={result.table.columns}
      fallbackRows={result.table.rows}
      sourcePath={result.resultPath}
      totalRows={result.table.totalRows}
    />
  );
}

function normalizeRows(data: unknown): Array<Record<string, string | number | null>> {
  return Array.isArray(data) ? data as Array<Record<string, string | number | null>> : [];
}

interface ScatterPanelData {
  displayPointLimit?: number;
  displayedRows?: number;
  densityX?: DensitySeries[];
  densityY?: DensitySeries[];
  height?: number;
  id: string;
  legendCounts?: Record<string, number>;
  marginalDensity?: boolean;
  pointColor?: string;
  pcaProjection?: boolean;
  referenceLines?: {
    x?: number[];
    y?: number[];
  };
  rows: Array<Record<string, string | number | null>>;
  scaleType?: "linear" | "log2";
  showCorrelation?: boolean;
  showLegend?: boolean;
  title: string;
  totalRows?: number;
  xDomain?: [number, number];
  xLabel: string;
  yDomain?: [number, number];
  yMinFromData?: boolean;
  yLabel: string;
}

function normalizeScatterPanels(data: unknown, fallbackTitle: string): ScatterPanelData[] {
  if (Array.isArray(data) && data.some((item) => item && typeof item === "object" && "rows" in item)) {
    return data.map((item, index) => panelFromRecord(item as Record<string, unknown>, `${fallbackTitle}-${index}`, fallbackTitle));
  }

  if (data && typeof data === "object" && "rows" in data) {
    return [panelFromRecord(data as Record<string, unknown>, fallbackTitle, fallbackTitle)];
  }

  return [{
    id: fallbackTitle,
    rows: normalizeRows(data),
    title: fallbackTitle,
    xLabel: fallbackTitle.toLowerCase().includes("volcano") ? "log2 Fold Change" : "X",
    yLabel: fallbackTitle.toLowerCase().includes("volcano") ? "-log10 Significance" : "Y"
  }];
}

function panelFromRecord(record: Record<string, unknown>, fallbackId: string, fallbackTitle: string): ScatterPanelData {
  return {
    displayPointLimit: numberValue(record.displayPointLimit) || undefined,
    displayedRows: numberValue(record.displayedRows) || undefined,
    densityX: normalizeDensitySeries(record.densityX),
    densityY: normalizeDensitySeries(record.densityY),
    height: numberValue(record.height) || undefined,
    id: stringValue(record.id) || fallbackId,
    legendCounts: normalizeLegendCounts(record.legendCounts),
    marginalDensity: record.marginalDensity === true,
    pointColor: stringValue(record.pointColor) || undefined,
    pcaProjection: record.pcaProjection === true,
    referenceLines: normalizeReferenceLines(record.referenceLines),
    rows: normalizeRows(record.rows),
    scaleType: record.scaleType === "log2" ? "log2" : "linear",
    showCorrelation: typeof record.showCorrelation === "boolean" ? record.showCorrelation : undefined,
    showLegend: typeof record.showLegend === "boolean" ? record.showLegend : undefined,
    title: stringValue(record.title) || fallbackTitle,
    totalRows: numberValue(record.totalRows) || undefined,
    xDomain: normalizeDomain(record.xDomain),
    xLabel: stringValue(record.xLabel) || "X",
    yDomain: normalizeDomain(record.yDomain),
    yMinFromData: record.yMinFromData === true,
    yLabel: stringValue(record.yLabel) || "Y"
  };
}

function emptyScatterPanel(title: string): ScatterPanelData {
  return {
    id: title,
    rows: [],
    title,
    xLabel: "X",
    yLabel: "Y"
  };
}

function normalizeReferenceLines(data: unknown): ScatterPanelData["referenceLines"] {
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const record = data as Record<string, unknown>;
  return {
    x: normalizeNumberArray(record.x),
    y: normalizeNumberArray(record.y)
  };
}

function normalizeNumberArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map(Number).filter(Number.isFinite);
}

function normalizeDomain(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length < 2) {
    return undefined;
  }
  const start = Number(value[0]);
  const end = Number(value[1]);
  return Number.isFinite(start) && Number.isFinite(end) && start < end ? [start, end] : undefined;
}

function normalizeLegendCounts(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const counts = Object.fromEntries(Object.entries(record).map(([key, item]) => [key, numberValue(item)]));
  return Object.keys(counts).length ? counts : undefined;
}

function normalizeDensitySeries(value: unknown): DensitySeries[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const series = value.map((entry) => {
    const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const points = Array.isArray(record.points) ? record.points.map((point) => {
      const pointRecord = point && typeof point === "object" ? point as Record<string, unknown> : {};
      return {
        density: numberValue(pointRecord.density),
        value: numberValue(pointRecord.value)
      };
    }).filter((point) => Number.isFinite(point.density) && Number.isFinite(point.value)) : [];
    return {
      group: stringValue(record.group),
      points
    };
  }).filter((entry) => entry.group && entry.points.length);
  return series.length ? series : undefined;
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length ? JSON.stringify(value) : "";
  }
  return String(value);
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmtNumber(value: unknown, digits = 4) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "NA";
}

function formatPValue(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "NA";
  }
  return parsed < 0.001 ? parsed.toExponential(2) : parsed.toFixed(4);
}

function optionalNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function plotNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function heatColor(value: number) {
  const clamped = Math.max(-3, Math.min(3, value));
  if (clamped >= 0) {
    return `rgba(212, 90, 42, ${0.16 + Math.abs(clamped) / 4})`;
  }
  return `rgba(20, 119, 130, ${0.16 + Math.abs(clamped) / 4})`;
}
