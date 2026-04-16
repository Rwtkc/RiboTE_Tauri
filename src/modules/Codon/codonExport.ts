import JSZip from "jszip";
import { invoke } from "@tauri-apps/api/core";
import { createSvgPdfBlob, createSvgPngBlob, type SvgExportOptions } from "@/modules/DataPreprocess/exportSvg";
import { saveBlobWithDialog, saveTextWithDialog } from "@/modules/DataPreprocess/saveDialogExport";
import type { RiboteAnalysisResult } from "@/store/useAppStore";

export async function exportCodonData(result: RiboteAnalysisResult, viewId: string) {
  const normalizedViewId = String(viewId || "input_summary");
  const content = normalizedViewId === "input_summary"
    ? await readFullInputSummary(result)
    : serializeCurrentViewRows(result, normalizedViewId);

  return saveTextWithDialog(
    `codon_${safeName(normalizedViewId)}_results.csv`,
    [{ name: "CSV", extensions: ["csv"] }],
    content
  );
}

export async function exportCodonFigures(
  result: RiboteAnalysisResult,
  viewId: string,
  viewRoot: HTMLElement | null,
  format: "png" | "pdf",
  options: SvgExportOptions
) {
  const svgs = Array.from(viewRoot?.querySelectorAll(".ribote-d3-host svg") ?? []) as SVGSVGElement[];
  if (!svgs.length) {
    throw new Error("当前 Codon 视图没有可导出的图表。");
  }

  const filters = format === "png"
    ? [{ name: "PNG", extensions: ["png"] }]
    : [{ name: "PDF", extensions: ["pdf"] }];
  const baseName = `${safeName(result.moduleId)}_${safeName(viewId)}`;

  if (svgs.length === 1) {
    const blob = format === "png"
      ? await createSvgPngBlob(svgs[0], options)
      : await createSvgPdfBlob(svgs[0], options);
    return saveBlobWithDialog(`${baseName}.${format}`, filters, blob);
  }

  const zip = new JSZip();
  for (let index = 0; index < svgs.length; index += 1) {
    const blob = format === "png"
      ? await createSvgPngBlob(svgs[index], options)
      : await createSvgPdfBlob(svgs[index], options);
    zip.file(`${baseName}_${index + 1}.${format}`, blob);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  return saveBlobWithDialog(
    `${baseName}_figures.zip`,
    [{ name: "ZIP", extensions: ["zip"] }],
    zipBlob
  );
}

const POINT_PANEL_VIEW_IDS = new Set([
  "cbi_associations",
  "selected_codon_burden",
  "selected_load_effect",
  "codon_run_zscore"
]);

const HEATMAP_PANEL_VIEW_IDS = new Set([
  "codon_clustering",
  "codon_usage_heatmap"
]);
async function readFullInputSummary(result: RiboteAnalysisResult) {
  if (!result.resultPath) {
    return serializeTable(result);
  }

  return invoke<string>("read_text_file", { path: result.resultPath }).catch(() => serializeTable(result));
}

function serializeCurrentViewRows(result: RiboteAnalysisResult, viewId: string) {
  const viewConfig = (result.charts?.codon as Record<string, any> | undefined)?.[camelChartKey(viewId)];

  if (viewId === "selected_codon_vs_rna") {
    return serializeSelectedCodonVsRnaPlotData(viewConfig, viewId);
  }

  if (POINT_PANEL_VIEW_IDS.has(viewId)) {
    return serializePointPanelPlotData(viewConfig, viewId);
  }

  if (viewId === "permutation_support") {
    return serializeHistogramPanelPlotData(viewConfig, viewId);
  }

  if (viewId === "te_bias_selected_load") {
    return serializeLoadTrendPlotData(viewConfig, viewId);
  }

  if (HEATMAP_PANEL_VIEW_IDS.has(viewId)) {
    return serializeHeatmapPanelPlotData(viewConfig, viewId);
  }

  const rows = Array.isArray(viewConfig?.rows) ? viewConfig.rows : [];

  if (!rows.length) {
    return serializeRows([{
      view: viewId,
      note: String(viewConfig?.note || "No tabular rows are available for the current Codon view.")
    }]);
  }

  return serializeRows(rows);
}

function serializeSelectedCodonVsRnaPlotData(viewConfig: any, viewId: string) {
  const panels = Array.isArray(viewConfig?.panels) ? viewConfig.panels : [];
  const plotRows: Array<Record<string, unknown>> = [];

  panels.forEach((panel: any) => {
    const comparisons = Array.isArray(panel?.comparisons) ? panel.comparisons : [];

    comparisons.forEach((comparison: any) => {
      const points = Array.isArray(comparison?.points) ? comparison.points : [];

      points.forEach((point: any, pointIndex: number) => {
        plotRows.push({
          view: viewId,
          codon: panel?.codon,
          condition: comparison?.condition,
          pointIndex: pointIndex + 1,
          geneId: point?.geneId,
          geneName: point?.geneName,
          teGroup: point?.teGroup,
          codonUsagePercent: point?.x,
          rnaAbundanceLog2MeanPlus1: point?.y,
          rawRnaMean: point?.rawRna,
          genesMeasured: comparison?.geneCount,
          displayedGenes: comparison?.displayedGeneCount,
          pearsonR: comparison?.correlation,
          pValue: comparison?.pValue,
          slope: comparison?.slope,
          intercept: comparison?.intercept
        });
      });
    });
  });

  if (!plotRows.length) {
    return serializeRows([{
      view: viewId,
      note: String(viewConfig?.note || "No plotted points are available for the selected Codon view.")
    }]);
  }

  return serializeRows(plotRows, [
    "view",
    "codon",
    "condition",
    "pointIndex",
    "geneId",
    "geneName",
    "teGroup",
    "codonUsagePercent",
    "rnaAbundanceLog2MeanPlus1",
    "rawRnaMean",
    "genesMeasured",
    "displayedGenes",
    "pearsonR",
    "pValue",
    "slope",
    "intercept"
  ]);
}

function serializePointPanelPlotData(viewConfig: any, viewId: string) {
  const panels = Array.isArray(viewConfig?.panels) ? viewConfig.panels : [];
  const plotRows: Array<Record<string, unknown>> = [];

  panels.forEach((panel: any) => {
    const points = Array.isArray(panel?.points) ? panel.points : [];

    points.forEach((point: any, pointIndex: number) => {
      plotRows.push({
        view: viewId,
        panelId: panel?.panelId,
        association: panel?.associationLabel,
        condition: panel?.conditionLabel,
        pointIndex: pointIndex + 1,
        geneId: point?.geneId,
        geneName: point?.geneName,
        teGroup: point?.teGroup,
        xLabel: panel?.xLabel,
        x: point?.x,
        yLabel: panel?.yLabel,
        y: point?.y,
        rawYLabel: panel?.rawYLabel,
        rawY: point?.rawY,
        genesMeasured: panel?.geneCount,
        displayedGenes: panel?.displayedGeneCount,
        pearsonR: panel?.correlation,
        pValue: panel?.pValue,
        slope: panel?.slope,
        intercept: panel?.intercept
      });
    });
  });

  if (!plotRows.length) {
    return serializeNoPlotRows(viewConfig, viewId);
  }

  return serializeRows(plotRows, [
    "view",
    "panelId",
    "association",
    "condition",
    "pointIndex",
    "geneId",
    "geneName",
    "teGroup",
    "xLabel",
    "x",
    "yLabel",
    "y",
    "rawYLabel",
    "rawY",
    "genesMeasured",
    "displayedGenes",
    "pearsonR",
    "pValue",
    "slope",
    "intercept"
  ]);
}

function serializeHistogramPanelPlotData(viewConfig: any, viewId: string) {
  const panels = Array.isArray(viewConfig?.panels) ? viewConfig.panels : [];
  const plotRows: Array<Record<string, unknown>> = [];

  panels.forEach((panel: any) => {
    const bins = Array.isArray(panel?.bins) ? panel.bins : [];

    bins.forEach((bin: any, binIndex: number) => {
      plotRows.push({
        view: viewId,
        panelId: panel?.panelId,
        title: panel?.title,
        xLabel: panel?.xLabel,
        observedValue: panel?.observedValue,
        binIndex: binIndex + 1,
        x0: bin?.x0,
        x1: bin?.x1,
        count: bin?.count
      });
    });
  });

  if (!plotRows.length) {
    return serializeNoPlotRows(viewConfig, viewId);
  }

  return serializeRows(plotRows, [
    "view",
    "panelId",
    "title",
    "xLabel",
    "observedValue",
    "binIndex",
    "x0",
    "x1",
    "count"
  ]);
}

function serializeLoadTrendPlotData(viewConfig: any, viewId: string) {
  const panels = Array.isArray(viewConfig?.panels) ? viewConfig.panels : [];
  const plotRows: Array<Record<string, unknown>> = [];

  panels.forEach((panel: any) => {
    const bins = Array.isArray(panel?.bins) ? panel.bins : [];

    bins.forEach((bin: any, binIndex: number) => {
      const fractions = Array.isArray(bin?.fractions) ? bin.fractions : [];

      fractions.forEach((fraction: any) => {
        plotRows.push({
          view: viewId,
          panelId: panel?.panelId,
          title: panel?.title,
          xLabel: panel?.xLabel,
          yLabel: panel?.yLabel,
          binIndex: binIndex + 1,
          label: bin?.label,
          loadBin: bin?.loadBin,
          loadRange: bin?.loadRange,
          genes: bin?.genes,
          medianLoad: bin?.medianLoad,
          meanTeLog2Fc: bin?.meanTeLog2Fc,
          group: fraction?.group,
          fraction: fraction?.value
        });
      });
    });
  });

  if (!plotRows.length) {
    return serializeNoPlotRows(viewConfig, viewId);
  }

  return serializeRows(plotRows, [
    "view",
    "panelId",
    "title",
    "xLabel",
    "yLabel",
    "binIndex",
    "label",
    "loadBin",
    "loadRange",
    "genes",
    "medianLoad",
    "meanTeLog2Fc",
    "group",
    "fraction"
  ]);
}

function serializeHeatmapPanelPlotData(viewConfig: any, viewId: string) {
  const panels = Array.isArray(viewConfig?.panels) ? viewConfig.panels : [];
  const plotRows: Array<Record<string, unknown>> = [];

  panels.forEach((panel: any) => {
    const rowLabels = Array.isArray(panel?.rows) ? panel.rows : [];
    const columns = Array.isArray(panel?.columns) ? panel.columns : [];
    const values = Array.isArray(panel?.values) ? panel.values : [];

    rowLabels.forEach((rowLabel: any, rowIndex: number) => {
      const rowValues = Array.isArray(values[rowIndex]) ? values[rowIndex] : [];

      columns.forEach((column: any, columnIndex: number) => {
        plotRows.push({
          view: viewId,
          panelId: panel?.panelId,
          title: panel?.title,
          rowIndex: rowIndex + 1,
          row: rowLabel,
          columnIndex: columnIndex + 1,
          column: column?.label,
          columnSelected: column?.selected,
          value: rowValues[columnIndex],
          colorMax: panel?.colorMax
        });
      });
    });
  });

  if (!plotRows.length) {
    return serializeNoPlotRows(viewConfig, viewId);
  }

  return serializeRows(plotRows, [
    "view",
    "panelId",
    "title",
    "rowIndex",
    "row",
    "columnIndex",
    "column",
    "columnSelected",
    "value",
    "colorMax"
  ]);
}

function serializeNoPlotRows(viewConfig: any, viewId: string) {
  return serializeRows([{
    view: viewId,
    note: String(viewConfig?.note || "No plotted data are available for the selected Codon view.")
  }]);
}
function serializeTable(result: RiboteAnalysisResult) {
  const columns = result.table.columns;
  return serializeRows(result.table.rows, columns);
}

function serializeRows(rows: Array<Record<string, unknown>>, preferredColumns?: string[]) {
  const columns = preferredColumns?.length ? preferredColumns : collectColumns(rows);
  const lines = [
    columns.map(escapeCsvCell).join(","),
    ...rows.map((row) => columns.map((column) => escapeCsvCell(row[column])).join(","))
  ];
  return `${lines.join("\n")}\n`;
}

function collectColumns(rows: Array<Record<string, unknown>>) {
  const columns: string[] = [];
  rows.forEach((row) => {
    Object.keys(row).forEach((column) => {
      if (!columns.includes(column)) {
        columns.push(column);
      }
    });
  });
  return columns;
}

function camelChartKey(viewId: string) {
  return viewId.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function escapeCsvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function safeName(value: string) {
  return String(value || "analysis")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "analysis";
}