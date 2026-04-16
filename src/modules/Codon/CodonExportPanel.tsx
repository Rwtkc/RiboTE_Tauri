import { useMemo, useState, type RefObject } from "react";
import { Download } from "lucide-react";
import { normalizeAnalysisExportOptions } from "@/modules/Analysis/analysisResultExports";
import { DataPreprocessExportDialog, type DataPreprocessExportState } from "@/modules/DataPreprocess/DataPreprocessExportDialog";
import { exportCodonData, exportCodonFigures } from "@/modules/Codon/codonExport";
import type { RiboteAnalysisResult } from "@/store/useAppStore";
import { useLogStore } from "@/store/useLogStore";

interface CodonExportPanelProps {
  currentViewId: string;
  result: RiboteAnalysisResult | null;
  viewRootRef: RefObject<HTMLDivElement | null>;
}

export function CodonExportPanel({ currentViewId, result, viewRootRef }: CodonExportPanelProps) {
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportState, setExportState] = useState<DataPreprocessExportState>({
    format: "csv",
    width: "3000",
    height: "1800",
    dpi: "300"
  });
  const addLog = useLogStore((state) => state.addLog);
  const exportButton = useMemo(() => (
    <button
      type="button"
      className="action-button analysis-export-button"
      disabled={!result}
      onClick={() => {
        setExportState((current) => ({
          ...current,
          format: current.format === "csv" ? "png" : current.format
        }));
        setIsExportOpen(true);
      }}
    >
      <Download size={14} />
      Export
    </button>
  ), [result]);

  async function handleExportSubmit() {
    if (!result) {
      return;
    }

    try {
      const exported = exportState.format === "csv"
        ? await exportCodonData(result, currentViewId)
        : await exportCodonFigures(
            result,
            currentViewId,
            viewRootRef.current,
            exportState.format,
            normalizeAnalysisExportOptions(exportState)
          );
      if (exported) {
        setIsExportOpen(false);
      }
    } catch (error) {
      addLog("error", `[Codon] Export failed: ${String(error)}`);
    }
  }

  return (
    <>
      {exportButton}
      {isExportOpen ? (
        <DataPreprocessExportDialog
          ariaLabel="Codon export"
          figureDisabled={!result}
          figureDisabledTitle="当前没有可导出的 Codon 结果"
          onClose={() => setIsExportOpen(false)}
          onStateChange={setExportState}
          onSubmit={() => void handleExportSubmit()}
          state={exportState}
        />
      ) : null}
    </>
  );
}
