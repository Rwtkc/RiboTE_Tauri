import { invoke } from "@tauri-apps/api/core";
import JSZip from "jszip";
import type { RefObject } from "react";
import type { RiboteAnalysisResult } from "@/store/useAppStore";
import type { DataPreprocessExportState } from "@/modules/DataPreprocess/DataPreprocessExportDialog";
import { createSvgPdfBlob, createSvgPngBlob, type SvgExportOptions } from "@/modules/DataPreprocess/exportSvg";
import { saveBlobWithDialog, saveTextWithDialog } from "@/modules/DataPreprocess/saveDialogExport";

interface AnalysisViewLike {
  id: string;
  title: string;
  type: string;
}

export function normalizeAnalysisExportOptions(state: DataPreprocessExportState): SvgExportOptions {
  return {
    dpi: Number.parseInt(state.dpi, 10) || 300,
    height: Number.parseInt(state.height, 10) || undefined,
    width: Number.parseInt(state.width, 10) || undefined,
    exportPadding: { top: 10, right: 34, bottom: 18, left: 34 }
  };
}

export async function exportAnalysisData(result: RiboteAnalysisResult) {
  const content = result.resultPath
    ? await invoke<string>("read_text_file", { path: result.resultPath }).catch(() => serializeTable(result))
    : serializeTable(result);

  return saveTextWithDialog(
    `${safeName(result.moduleId)}_results.csv`,
    [{ name: "CSV", extensions: ["csv"] }],
    content
  );
}

export async function exportAnalysisFigures(
  result: RiboteAnalysisResult,
  view: AnalysisViewLike,
  workspaceRef: RefObject<HTMLDivElement | null>,
  format: "png" | "pdf",
  options: SvgExportOptions
) {
  const svgs = Array.from(workspaceRef.current?.querySelectorAll(".ribote-d3-host svg") ?? []) as SVGSVGElement[];
  if (!svgs.length) {
    throw new Error("Current result view does not contain an exportable figure.");
  }

  const filters = format === "png"
    ? [{ name: "PNG", extensions: ["png"] }]
    : [{ name: "PDF", extensions: ["pdf"] }];
  const baseName = `${safeName(result.moduleId)}_${safeName(view.id || view.title)}`;

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

function serializeTable(result: RiboteAnalysisResult) {
  const columns = result.table.columns;
  const lines = [
    columns.map(escapeCsvCell).join(","),
    ...result.table.rows.map((row) => columns.map((column) => escapeCsvCell(row[column])).join(","))
  ];
  return `${lines.join("\n")}\n`;
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
