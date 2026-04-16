// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import {
  drawCodonBiasAssociationChart,
  drawCodonBiasGroupChart,
  drawCodonHeatmapChart,
  drawCodonRnaScatterChart,
  drawCodonLoadTrendChart,
  drawCodonPermutationHistogramChart,
  drawCodonShiftEnrichmentChart,
  drawCodonUsageGroupChart
} from "./codonChart.js";
import {
  buildCondensedPages,
  formatInteger,
  formatNumber,
  formatPValue,
  formatPercent,
  useD3Chart
} from "./CodonResultsViewUtils";
function PaginatedTable({ title, copy, columns, rows, renderCell, pageSize = 10 }) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const shouldPaginate = rows.length > pageSize;
  const pageStart = (currentPage - 1) * pageSize;
  const paginatedRows = rows.slice(pageStart, pageStart + pageSize);
  const pageItems = useMemo(() => buildCondensedPages(totalPages, currentPage), [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [rows.length, title]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="ribote-d3-card">
      <div className="ribote-gsea-table-header">
        <div>
          <h4 className="ribote-d3-card__title">{title}</h4>
          <p className="ribote-gsea-table-copy">{copy}</p>
        </div>
      </div>

      <div className="ribote-gsea-table-wrap">
        <table className="ribote-enrichment-table ribote-codon-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, index) => (
              <tr key={`${title}-${pageStart + index + 1}`}>
                {renderCell(row, pageStart + index + 1)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shouldPaginate ? (
        <div className="ribote-table-pagination">
          <div className="ribote-table-pagination__meta">
            Showing {pageStart + 1}-{Math.min(pageStart + pageSize, rows.length)} of {rows.length} rows | Page {currentPage} of {totalPages}
          </div>
          <div className="ribote-table-pagination__actions">
            <button type="button" className="ribote-btn ribote-btn--secondary" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>
              Previous
            </button>
            <div className="ribote-table-pagination__pages">
              {pageItems.map((item, index) => (
                item.type === "ellipsis" ? (
                  <span key={`${title}-ellipsis-${index}`} className="ribote-table-pagination__ellipsis">...</span>
                ) : (
                  <button
                    key={item.value}
                    type="button"
                    className={`ribote-btn ribote-btn--secondary ${item.value === currentPage ? "is-active" : ""}`}
                    aria-current={item.value === currentPage ? "page" : undefined}
                    onClick={() => setCurrentPage(item.value)}
                  >
                    {item.value}
                  </button>
                )
              ))}
            </div>
            <button type="button" className="ribote-btn ribote-btn--secondary" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PanelPager({ currentPage, totalPages, onPageChange }) {
  const pageItems = useMemo(() => buildCondensedPages(totalPages, currentPage), [currentPage, totalPages]);

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="ribote-table-pagination">
      <div className="ribote-table-pagination__meta">
        Page {currentPage} of {totalPages}
      </div>
      <div className="ribote-table-pagination__actions">
        <button type="button" className="ribote-btn ribote-btn--secondary" disabled={currentPage <= 1} onClick={() => onPageChange(Math.max(1, currentPage - 1))}>
          Previous
        </button>
        <div className="ribote-table-pagination__pages">
          {pageItems.map((item, index) => (
            item.type === "ellipsis" ? (
              <span key={`panel-ellipsis-${index}`} className="ribote-table-pagination__ellipsis">...</span>
            ) : (
              <button
                key={`panel-${item.value}`}
                type="button"
                className={`ribote-btn ribote-btn--secondary ${item.value === currentPage ? "is-active" : ""}`}
                aria-current={item.value === currentPage ? "page" : undefined}
                onClick={() => onPageChange(item.value)}
              >
                {item.value}
              </button>
            )
          ))}
        </div>
        <button type="button" className="ribote-btn ribote-btn--secondary" disabled={currentPage >= totalPages} onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}>
          Next
        </button>
      </div>
    </div>
  );
}

function CodonUsagePanel({ panel }) {
  const signature = useMemo(() => JSON.stringify(panel), [panel]);
  const { ref, isRendering, renderError } = useD3Chart(
    (element, renderState) => drawCodonUsageGroupChart(element, panel, renderState),
    [signature]
  );

  return (
    <div className="ribote-d3-card">
      {renderError ? (
        <div className="ribote-result-card ribote-result-card--warning">
          <p className="ribote-result-card__copy">Codon usage chart rendering failed: {renderError}</p>
        </div>
      ) : null}
      <div className="ribote-codon-host">
        <div ref={ref} className="ribote-d3-host" />
        {isRendering ? <div className="ribote-network-loading">Rendering codon usage chart...</div> : null}
      </div>
    </div>
  );
}

function CodonRnaPanel({ panel }) {
  const signature = useMemo(() => JSON.stringify(panel), [panel]);
  const { ref, isRendering, renderError } = useD3Chart(
    (element, renderState) => drawCodonRnaScatterChart(element, panel, renderState),
    [signature]
  );

  return (
    <div className="ribote-d3-card">
      {renderError ? (
        <div className="ribote-result-card ribote-result-card--warning">
          <p className="ribote-result-card__copy">Codon-to-RNA chart rendering failed: {renderError}</p>
        </div>
      ) : null}
      <div className="ribote-codon-host">
        <div ref={ref} className="ribote-d3-host" />
        {isRendering ? <div className="ribote-network-loading">Rendering codon-to-RNA chart...</div> : null}
      </div>
    </div>
  );
}

function CodonBiasGroupPanel({ panel }) {
  const signature = useMemo(() => JSON.stringify(panel), [panel]);
  const { ref, isRendering, renderError } = useD3Chart(
    (element, renderState) => drawCodonBiasGroupChart(element, panel, renderState),
    [signature]
  );

  return (
    <div className="ribote-d3-card">
      {renderError ? (
        <div className="ribote-result-card ribote-result-card--warning">
          <p className="ribote-result-card__copy">Codon bias chart rendering failed: {renderError}</p>
        </div>
      ) : null}
      <div className="ribote-codon-host">
        <div ref={ref} className="ribote-d3-host" />
        {isRendering ? <div className="ribote-network-loading">Rendering codon bias chart...</div> : null}
      </div>
    </div>
  );
}

function CodonBiasAssociationPanel({ panel }) {
  const signature = useMemo(() => JSON.stringify(panel), [panel]);
  const { ref, isRendering, renderError } = useD3Chart(
    (element, renderState) => drawCodonBiasAssociationChart(element, panel, renderState),
    [signature]
  );

  return (
    <div className="ribote-d3-card">
      {renderError ? (
        <div className="ribote-result-card ribote-result-card--warning">
          <p className="ribote-result-card__copy">CBI association chart rendering failed: {renderError}</p>
        </div>
      ) : null}
      <div className="ribote-codon-host">
        <div ref={ref} className="ribote-d3-host" />
        {isRendering ? <div className="ribote-network-loading">Rendering CBI association chart...</div> : null}
      </div>
    </div>
  );
}

function CodonShiftEnrichmentPanel({ panel }) {
  const signature = useMemo(() => JSON.stringify(panel), [panel]);
  const { ref, isRendering, renderError } = useD3Chart(
    (element, renderState) => drawCodonShiftEnrichmentChart(element, panel, renderState),
    [signature]
  );

  return (
    <div className="ribote-d3-card">
      {renderError ? (
        <div className="ribote-result-card ribote-result-card--warning">
          <p className="ribote-result-card__copy">Codon enrichment chart rendering failed: {renderError}</p>
        </div>
      ) : null}
      <div className="ribote-codon-host">
        <div ref={ref} className="ribote-d3-host" />
        {isRendering ? <div className="ribote-network-loading">Rendering codon enrichment chart...</div> : null}
      </div>
    </div>
  );
}

function CodonPermutationPanel({ panel }) {
  const signature = useMemo(() => JSON.stringify(panel), [panel]);
  const { ref, isRendering, renderError } = useD3Chart(
    (element) => drawCodonPermutationHistogramChart(element, panel),
    [signature]
  );

  return (
    <div className="ribote-d3-card">
      {renderError ? (
        <div className="ribote-result-card ribote-result-card--warning">
          <p className="ribote-result-card__copy">Permutation-support chart rendering failed: {renderError}</p>
        </div>
      ) : null}
      <div className="ribote-codon-host">
        <div ref={ref} className="ribote-d3-host" />
        {isRendering ? <div className="ribote-network-loading">Rendering permutation-support chart...</div> : null}
      </div>
    </div>
  );
}

function CodonLoadTrendPanel({ panel }) {
  const signature = useMemo(() => JSON.stringify(panel), [panel]);
  const { ref, isRendering, renderError } = useD3Chart(
    (element) => drawCodonLoadTrendChart(element, panel),
    [signature]
  );

  return (
    <div className="ribote-d3-card">
      {renderError ? (
        <div className="ribote-result-card ribote-result-card--warning">
          <p className="ribote-result-card__copy">TE-bias trend chart rendering failed: {renderError}</p>
        </div>
      ) : null}
      <div className="ribote-codon-host">
        <div ref={ref} className="ribote-d3-host" />
        {isRendering ? <div className="ribote-network-loading">Rendering TE-bias trend chart...</div> : null}
      </div>
    </div>
  );
}

function CodonHeatmapPanel({ panel }) {
  const signature = useMemo(() => JSON.stringify(panel), [panel]);
  const { ref, isRendering, renderError } = useD3Chart(
    (element) => drawCodonHeatmapChart(element, panel),
    [signature]
  );

  return (
    <div className="ribote-d3-card">
      {renderError ? (
        <div className="ribote-result-card ribote-result-card--warning">
          <p className="ribote-result-card__copy">Codon heatmap rendering failed: {renderError}</p>
        </div>
      ) : null}
      <div className="ribote-codon-host">
        <div ref={ref} className="ribote-d3-host" />
        {isRendering ? <div className="ribote-network-loading">Rendering codon heatmap...</div> : null}
      </div>
    </div>
  );
}

export function InputSummaryView({ viewConfig }) {
  const rows = Array.isArray(viewConfig?.rows) ? viewConfig.rows : [];
  const selectedCodons = Array.isArray(viewConfig?.selectedCodons) ? viewConfig.selectedCodons : [];
  const copy = `Previewing ${Number(viewConfig?.previewRows || 0).toLocaleString()} of ${Number(viewConfig?.totalRows || 0).toLocaleString()} current-scope genes | Scope: ${viewConfig?.scopeLabel || "Current scope"}${selectedCodons.length ? ` | Selected codons: ${selectedCodons.join(", ")}` : ""}`;

  return (
    <div className="ribote-codon-view">
      {viewConfig?.note ? (
        <div className="ribote-result-card">
          <p className="ribote-result-card__copy">{viewConfig.note}</p>
        </div>
      ) : null}

      {rows.length ? (
        <PaginatedTable
          title="Input Summary"
          copy={copy}
          columns={["No.", "GeneID", "Gene Name", "TE Group", "RNA Control Mean", "RNA Treatment Mean", "Total Codons", "Selected Codon Count", "Selected Codon per 1k", "Selected Codon Frequency"]}
          rows={rows}
          renderCell={(row, index) => (
            <>
              <td>{index}</td>
              <td>{row.GeneID}</td>
              <td>{row.Gene_Name}</td>
              <td>{row.TE_Group}</td>
              <td>{formatNumber(row.RNA_Control_Mean)}</td>
              <td>{formatNumber(row.RNA_Treatment_Mean)}</td>
              <td>{formatInteger(row.Total_Codons)}</td>
              <td>{formatNumber(row.Selected_Codon_Count, 0)}</td>
              <td>{formatNumber(row.Selected_Codon_per_1k)}</td>
              <td>{formatPercent(row.Selected_Codon_Frequency)}</td>
            </>
          )}
        />
      ) : null}
    </div>
  );
}

export function UsageByGroupView({ viewConfig }) {
  const rows = Array.isArray(viewConfig?.rows) ? viewConfig.rows : [];
  const panels = Array.isArray(viewConfig?.panels) ? viewConfig.panels : [];

  return (
    <div className="ribote-codon-view">
      {viewConfig?.note ? (
        <div className="ribote-result-card">
          <p className="ribote-result-card__copy">{viewConfig.note}</p>
        </div>
      ) : null}

      {panels.length ? (
        <div className="ribote-codon-panel-grid">
          {panels.map((panel) => (
            <CodonUsagePanel key={panel.codon} panel={panel} />
          ))}
        </div>
      ) : null}

      {rows.length ? (
        <PaginatedTable
          title="Selected Codon Usage Summary"
          copy={`Scope: ${viewConfig?.scopeLabel || "Current scope"} | Focus: ${viewConfig?.focus || "Up"}`}
          columns={["No.", "Codon", "Genes Measured", "Up Median", "Non Median", "Down Median", "Up vs Non p", "Down vs Non p"]}
          rows={rows}
          renderCell={(row, index) => (
            <>
              <td>{index}</td>
              <td>{row.Codon}</td>
              <td>{formatInteger(row.Genes_Measured)}</td>
              <td>{formatPercent(row.Up_Median_Percent)}</td>
              <td>{formatPercent(row.Non_Median_Percent)}</td>
              <td>{formatPercent(row.Down_Median_Percent)}</td>
              <td>{formatPValue(row.Up_vs_Non_PValue)}</td>
              <td>{formatPValue(row.Down_vs_Non_PValue)}</td>
            </>
          )}
        />
      ) : null}
    </div>
  );
}

export function UsageVsRnaView({ viewConfig }) {
  const panels = Array.isArray(viewConfig?.panels) ? viewConfig.panels : [];
  const [currentPanelPage, setCurrentPanelPage] = useState(1);
  const panelPageSize = 3;
  const totalPanelPages = Math.max(1, Math.ceil(panels.length / panelPageSize));
  const panelStart = (currentPanelPage - 1) * panelPageSize;
  const paginatedPanels = panels.slice(panelStart, panelStart + panelPageSize);

  useEffect(() => {
    setCurrentPanelPage(1);
  }, [panels.length]);

  useEffect(() => {
    if (currentPanelPage > totalPanelPages) {
      setCurrentPanelPage(totalPanelPages);
    }
  }, [currentPanelPage, totalPanelPages]);

  return (
    <div className="ribote-codon-view">
      {viewConfig?.note ? (
        <div className="ribote-result-card">
          <p className="ribote-result-card__copy">{viewConfig.note}</p>
        </div>
      ) : null}

      {panels.length ? (
        <>
          <div className="ribote-codon-panel-grid ribote-codon-panel-grid--stacked">
            {paginatedPanels.map((panel) => (
              <CodonRnaPanel key={panel.codon} panel={panel} />
            ))}
          </div>
          <PanelPager currentPage={currentPanelPage} totalPages={totalPanelPages} onPageChange={setCurrentPanelPage} />
        </>
      ) : null}

    </div>
  );
}

export function BiasByGroupView({ viewConfig }) {
  const rows = Array.isArray(viewConfig?.rows) ? viewConfig.rows : [];
  const panels = Array.isArray(viewConfig?.panels) ? viewConfig.panels : [];

  return (
    <div className="ribote-codon-view">
      {viewConfig?.note ? (
        <div className="ribote-result-card">
          <p className="ribote-result-card__copy">{viewConfig.note}</p>
        </div>
      ) : null}

      {panels.length ? (
        <div className="ribote-codon-panel-grid">
          {panels.map((panel) => (
            <CodonBiasGroupPanel key={panel.metricId} panel={panel} />
          ))}
        </div>
      ) : null}

      {rows.length ? (
        <PaginatedTable
          title="Codon Bias and Adaptation Summary"
          copy="The summary table reports median metric values within each TE group and Wilcoxon comparisons against the unchanged group."
          columns={["No.", "Metric", "Genes Measured", "Up Median", "Non Median", "Down Median", "Up vs Non p", "Down vs Non p"]}
          rows={rows}
          renderCell={(row, index) => (
            <>
              <td>{index}</td>
              <td>{row.Metric}</td>
              <td>{formatInteger(row.Genes_Measured)}</td>
              <td>{formatNumber(row.Up_Median, 4)}</td>
              <td>{formatNumber(row.Non_Median, 4)}</td>
              <td>{formatNumber(row.Down_Median, 4)}</td>
              <td>{formatPValue(row.Up_vs_Non_PValue)}</td>
              <td>{formatPValue(row.Down_vs_Non_PValue)}</td>
            </>
          )}
        />
      ) : null}
    </div>
  );
}

export function CbiAssociationsView({ viewConfig }) {
  const panels = Array.isArray(viewConfig?.panels) ? viewConfig.panels : [];
  const [currentPanelPage, setCurrentPanelPage] = useState(1);
  const panelPageSize = 2;
  const totalPanelPages = Math.max(1, Math.ceil(panels.length / panelPageSize));
  const panelStart = (currentPanelPage - 1) * panelPageSize;
  const paginatedPanels = panels.slice(panelStart, panelStart + panelPageSize);

  useEffect(() => {
    setCurrentPanelPage(1);
  }, [panels.length]);

  useEffect(() => {
    if (currentPanelPage > totalPanelPages) {
      setCurrentPanelPage(totalPanelPages);
    }
  }, [currentPanelPage, totalPanelPages]);

  return (
    <div className="ribote-codon-view">
      {viewConfig?.note ? (
        <div className="ribote-result-card">
          <p className="ribote-result-card__copy">{viewConfig.note}</p>
        </div>
      ) : null}

      {panels.length ? (
        <>
          <div className="ribote-codon-panel-grid ribote-codon-panel-grid--stacked">
            {paginatedPanels.map((panel) => (
              <CodonBiasAssociationPanel key={panel.panelId} panel={panel} />
            ))}
          </div>
          <PanelPager currentPage={currentPanelPage} totalPages={totalPanelPages} onPageChange={setCurrentPanelPage} />
        </>
      ) : null}
    </div>
  );
}

export function SelectedCodonBurdenView({ viewConfig }) {
  const panels = Array.isArray(viewConfig?.panels) ? viewConfig.panels : [];

  return (
    <div className="ribote-codon-view">
      {viewConfig?.note ? (
        <div className="ribote-result-card">
          <p className="ribote-result-card__copy">{viewConfig.note}</p>
        </div>
      ) : null}

      {panels.length ? (
        <div className="ribote-codon-panel-grid ribote-codon-panel-grid--stacked">
          {panels.map((panel) => (
            <CodonBiasAssociationPanel key={panel.panelId} panel={panel} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CodonEnrichmentShiftedView({ viewConfig }) {
  const rows = Array.isArray(viewConfig?.rows) ? viewConfig.rows : [];
  const panels = Array.isArray(viewConfig?.panels) ? viewConfig.panels : [];

  return (
    <div className="ribote-codon-view">
      {viewConfig?.note ? (
        <div className="ribote-result-card">
          <p className="ribote-result-card__copy">{viewConfig.note}</p>
        </div>
      ) : null}

      {panels.length ? (
        <div className="ribote-codon-panel-grid ribote-codon-panel-grid--stacked">
          {panels.map((panel) => (
            <CodonShiftEnrichmentPanel key={panel.panelId} panel={panel} />
          ))}
        </div>
      ) : null}

      {rows.length ? (
        <PaginatedTable
          title="Codon Enrichment in TE-Shifted Genes"
          copy="Rows summarize codon-level hypergeometric enrichment hits across TE groups."
          columns={["No.", "Codon", "Up Hits", "Non Hits", "Down Hits", "Shifted Hits", "Genes With Hits", "log2 Up/Down", "Shifted Fraction", "Selected"]}
          rows={rows}
          pageSize={12}
          renderCell={(row, index) => (
            <>
              <td>{index}</td>
              <td>{row.codon}</td>
              <td>{formatInteger(row.Up_Genes)}</td>
              <td>{formatInteger(row.Non_Genes)}</td>
              <td>{formatInteger(row.Down_Genes)}</td>
              <td>{formatInteger(row.Shifted_Genes)}</td>
              <td>{formatInteger(row.Genes_With_Hits)}</td>
              <td>{formatNumber(row.Log2_Up_vs_Down, 3)}</td>
              <td>{formatPercent(Number(row.Shifted_Fraction) * 100)}</td>
              <td>{String(row.Selected)}</td>
            </>
          )}
        />
      ) : null}
    </div>
  );
}

export function SelectedCodonAcrossGroupsView({ viewConfig }) {
  const rows = Array.isArray(viewConfig?.rows) ? viewConfig.rows : [];
  const panels = Array.isArray(viewConfig?.panels) ? viewConfig.panels : [];

  return (
    <div className="ribote-codon-view">
      {viewConfig?.note ? (
        <div className="ribote-result-card">
          <p className="ribote-result-card__copy">{viewConfig.note}</p>
        </div>
      ) : null}

      {panels.length ? (
        <div className="ribote-codon-panel-grid">
          {panels.map((panel) => (
            <CodonBiasGroupPanel key={panel.metricId} panel={panel} />
          ))}
        </div>
      ) : null}

      {rows.length ? (
        <PaginatedTable
          title="Selected Codon Burden Across TE Groups"
          copy="Wilcoxon tests compare TE Up vs unchanged and TE Down vs unchanged genes."
          columns={["No.", "Metric", "Genes Measured", "Up Median", "Non Median", "Down Median", "Up vs Non p", "Down vs Non p"]}
          rows={rows}
          renderCell={(row, index) => (
            <>
              <td>{index}</td>
              <td>{row.Metric}</td>
              <td>{formatInteger(row.Genes_Measured)}</td>
              <td>{formatNumber(row.Up_Median, 3)}</td>
              <td>{formatNumber(row.Non_Median, 3)}</td>
              <td>{formatNumber(row.Down_Median, 3)}</td>
              <td>{formatPValue(row.Up_vs_Non_PValue)}</td>
              <td>{formatPValue(row.Down_vs_Non_PValue)}</td>
            </>
          )}
        />
      ) : null}
    </div>
  );
}

export function PermutationSupportView({ viewConfig }) {
  const panels = Array.isArray(viewConfig?.panels) ? viewConfig.panels : [];

  return (
    <div className="ribote-codon-view">
      {viewConfig?.note ? (
        <div className="ribote-result-card">
          <p className="ribote-result-card__copy">{viewConfig.note}</p>
        </div>
      ) : null}

      {panels.length ? (
        <div className="ribote-codon-panel-grid">
          {panels.map((panel) => (
            <CodonPermutationPanel key={panel.panelId} panel={panel} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TeBiasSelectedLoadView({ viewConfig }) {
  const panels = Array.isArray(viewConfig?.panels) ? viewConfig.panels : [];

  return (
    <div className="ribote-codon-view">
      {viewConfig?.note ? (
        <div className="ribote-result-card">
          <p className="ribote-result-card__copy">{viewConfig.note}</p>
        </div>
      ) : null}

      {panels.length ? (
        <div className="ribote-codon-panel-grid ribote-codon-panel-grid--stacked">
          {panels.map((panel) => (
            <CodonLoadTrendPanel key={panel.panelId} panel={panel} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SelectedLoadEffectView({ viewConfig }) {
  const panels = Array.isArray(viewConfig?.panels) ? viewConfig.panels : [];

  return (
    <div className="ribote-codon-view">
      {viewConfig?.note ? (
        <div className="ribote-result-card">
          <p className="ribote-result-card__copy">{viewConfig.note}</p>
        </div>
      ) : null}

      {panels.length ? (
        <div className="ribote-codon-panel-grid ribote-codon-panel-grid--stacked">
          {panels.map((panel) => (
            <CodonBiasAssociationPanel key={panel.panelId} panel={panel} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CodonHeatmapView({ viewConfig }) {
  const panels = Array.isArray(viewConfig?.panels) ? viewConfig.panels : [];

  return (
    <div className="ribote-codon-view">
      {viewConfig?.note ? (
        <div className="ribote-result-card">
          <p className="ribote-result-card__copy">{viewConfig.note}</p>
        </div>
      ) : null}

      {panels.length ? (
        <div className="ribote-codon-panel-grid ribote-codon-panel-grid--stacked">
          {panels.map((panel) => (
            <CodonHeatmapPanel key={panel.panelId} panel={panel} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CodonRunEnrichmentView({ viewConfig }) {
  const rows = Array.isArray(viewConfig?.rows) ? viewConfig.rows : [];
  const panels = Array.isArray(viewConfig?.panels) ? viewConfig.panels : [];

  return (
    <div className="ribote-codon-view">
      {viewConfig?.note ? (
        <div className="ribote-result-card">
          <p className="ribote-result-card__copy">{viewConfig.note}</p>
        </div>
      ) : null}

      {panels.length ? (
        <div className="ribote-codon-panel-grid">
          {panels.map((panel) => (
            <CodonBiasGroupPanel key={panel.metricId} panel={panel} />
          ))}
        </div>
      ) : null}

      {rows.length ? (
        <PaginatedTable
          title="Codon Run Enrichment by TE Group"
          copy="Wilcoxon tests compare TE Up vs unchanged and TE Down vs unchanged genes for each run length."
          columns={["No.", "Metric", "Genes Measured", "Up Median", "Non Median", "Down Median", "Up vs Non p", "Down vs Non p"]}
          rows={rows}
          renderCell={(row, index) => (
            <>
              <td>{index}</td>
              <td>{row.Metric}</td>
              <td>{formatInteger(row.Genes_Measured)}</td>
              <td>{formatNumber(row.Up_Median, 3)}</td>
              <td>{formatNumber(row.Non_Median, 3)}</td>
              <td>{formatNumber(row.Down_Median, 3)}</td>
              <td>{formatPValue(row.Up_vs_Non_PValue)}</td>
              <td>{formatPValue(row.Down_vs_Non_PValue)}</td>
            </>
          )}
        />
      ) : null}
    </div>
  );
}

export function CodonRunZscoreView({ viewConfig }) {
  const panels = Array.isArray(viewConfig?.panels) ? viewConfig.panels : [];

  return (
    <div className="ribote-codon-view">
      {viewConfig?.note ? (
        <div className="ribote-result-card">
          <p className="ribote-result-card__copy">{viewConfig.note}</p>
        </div>
      ) : null}

      {panels.length ? (
        <div className="ribote-codon-panel-grid ribote-codon-panel-grid--stacked">
          {panels.map((panel) => (
            <CodonBiasAssociationPanel key={panel.panelId} panel={panel} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
