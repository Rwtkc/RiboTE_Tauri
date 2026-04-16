import type { RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import JSZip from "jszip";
import type { DataPreprocessResult } from "@/store/useAppStore";
import type { DataPreprocessExportState } from "@/modules/DataPreprocess/DataPreprocessExportDialog";
import { createSvgPdfBlob, createSvgPngBlob, type SvgExportOptions } from "@/modules/DataPreprocess/exportSvg";
import { saveBlobWithDialog, saveTextWithDialog } from "@/modules/DataPreprocess/saveDialogExport";

type PreprocessView = "data" | "barplot" | "qc";
type CsvValue = string | number | null | undefined;

export async function exportPreprocessData(result: DataPreprocessResult, activeView: PreprocessView) {
  if (activeView === "barplot") {
    return saveTextWithDialog(
      "data_preprocess_library_size.csv",
      [{ name: "CSV", extensions: ["csv"] }],
      recordsToCsv(result.charts.barplot, ["sample", "sample_display", "total_count", "sample_type"])
    );
  }

  if (activeView === "qc") {
    const archive = new JSZip();
    archive.file(
      "gene_biotype_composition.csv",
      recordsToCsv(result.charts.biotype, ["gene_biotype", "genes_retained"])
    );
    archive.file(
      "rrna_fraction_by_sample.csv",
      recordsToCsv(result.charts.rrna, ["sample", "sample_display", "category", "total_count"])
    );
    const zipBlob = await archive.generateAsync({ type: "blob" });
    return saveBlobWithDialog("data_preprocess_qc_data.zip", [{ name: "ZIP", extensions: ["zip"] }], zipBlob);
  }

  try {
    const content = await invoke<string>("read_text_file", { path: result.matrixPath });
    return saveTextWithDialog("data_preprocess_data.csv", [{ name: "CSV", extensions: ["csv"] }], content);
  } catch (error) {
    throw new Error(`Filtered count matrix is unavailable. Re-run Data Preprocess before exporting the Data table. ${String(error)}`);
  }
}

export async function exportPreprocessFigures(
  format: "png" | "pdf",
  activeView: PreprocessView,
  refs: {
    barplotRef: RefObject<HTMLDivElement | null>;
    biotypeRef: RefObject<HTMLDivElement | null>;
    rrnaRef: RefObject<HTMLDivElement | null>;
  },
  options: SvgExportOptions
) {
  if (activeView === "data") {
    throw new Error("Select Library Size or QC before exporting figures.");
  }

  const targets = activeView === "barplot"
    ? [{ suffix: "library_size", node: refs.barplotRef.current, exportPadding: { top: 10, right: 34, bottom: 18, left: 34 } }]
    : [
        { suffix: "qc_biotype", node: refs.biotypeRef.current, exportPadding: { top: 10, right: 34, bottom: 18, left: 34 } },
        { suffix: "qc_rrna", node: refs.rrnaRef.current, exportPadding: { top: 10, right: 34, bottom: 18, left: 26 } }
      ];

  if (targets.length > 1) {
    const archive = new JSZip();
    let fileCount = 0;

    for (const target of targets) {
      const svg = target.node?.querySelector("svg");
      if (!svg) {
        continue;
      }
      const exportOptions = { ...options, exportPadding: target.exportPadding };
      const blob = format === "png"
        ? await createSvgPngBlob(svg, exportOptions)
        : await createSvgPdfBlob(svg, exportOptions);
      archive.file(`${target.suffix}.${format}`, blob);
      fileCount += 1;
    }

    if (fileCount === 0) {
      return false;
    }

    const zipBlob = await archive.generateAsync({ type: "blob" });
    return saveBlobWithDialog(
      `data_preprocess_qc_export.zip`,
      [{ name: "ZIP", extensions: ["zip"] }],
      zipBlob
    );
  }

  let exported = false;
  for (const target of targets) {
    const svg = target.node?.querySelector("svg");
    if (!svg) {
      continue;
    }
    const filename = `data_preprocess_${target.suffix}.${format}`;
    const filters = [{ name: format.toUpperCase(), extensions: [format] }];
    const exportOptions = { ...options, exportPadding: target.exportPadding };
    if (format === "png") {
      const blob = await createSvgPngBlob(svg, exportOptions);
      exported = (await saveBlobWithDialog(filename, filters, blob)) || exported;
    } else {
      const blob = await createSvgPdfBlob(svg, exportOptions);
      exported = (await saveBlobWithDialog(filename, filters, blob)) || exported;
    }
  }
  return exported;
}

export function normalizeExportOptions(state: DataPreprocessExportState): SvgExportOptions {
  return {
    width: clampNumber(state.width, 320, 6000, 1200),
    height: clampNumber(state.height, 240, 6000, 720),
    dpi: clampNumber(state.dpi, 72, 1200, 300)
  };
}

function clampNumber(value: string, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function recordsToCsv(records: Array<Record<string, CsvValue>>, preferredColumns: string[]) {
  const columns = collectColumns(records, preferredColumns);
  const lines = [
    columns.map(escapeCsvValue).join(","),
    ...records.map((record) => columns.map((column) => escapeCsvValue(record[column])).join(","))
  ];
  return `${lines.join("\r\n")}\r\n`;
}

function collectColumns(records: Array<Record<string, CsvValue>>, preferredColumns: string[]) {
  const seen = new Set(preferredColumns);
  const columns = [...preferredColumns];

  for (const record of records) {
    for (const column of Object.keys(record)) {
      if (!seen.has(column)) {
        seen.add(column);
        columns.push(column);
      }
    }
  }

  return columns;
}

function escapeCsvValue(value: CsvValue) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  if (!/[",\r\n]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll("\"", "\"\"")}"`;
}
