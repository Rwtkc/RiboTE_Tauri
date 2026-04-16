import type { Dispatch, SetStateAction } from "react";
import { Download, X } from "lucide-react";

export type DataPreprocessExportFormat = "csv" | "png" | "pdf";

export interface DataPreprocessExportState {
  format: DataPreprocessExportFormat;
  width: string;
  height: string;
  dpi: string;
}

interface DataPreprocessExportDialogProps {
  ariaLabel?: string;
  figureDisabled: boolean;
  figureDisabledTitle?: string;
  onClose: () => void;
  onStateChange: Dispatch<SetStateAction<DataPreprocessExportState>>;
  onSubmit: () => void;
  state: DataPreprocessExportState;
}

const exportFormats: DataPreprocessExportFormat[] = ["csv", "png", "pdf"];

export function DataPreprocessExportDialog({
  ariaLabel = "Result export",
  figureDisabled,
  figureDisabledTitle = "Select a figure view before exporting figures",
  onClose,
  onStateChange,
  onSubmit,
  state
}: DataPreprocessExportDialogProps) {
  const isFigureFormat = state.format !== "csv";
  const submitDisabled = isFigureFormat && figureDisabled;
  const description = state.format === "csv"
    ? "Export the data behind the currently selected result view."
    : "Export the currently selected D3 figure.";

  return (
    <div className="export-modal" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <div className="export-modal__backdrop" onClick={onClose} />
      <div className="export-modal__panel">
        <div className="export-modal__head">
          <div className="export-modal__title-row">
            <div className="export-modal__badge">
              <Download size={17} />
            </div>
            <div>
              <h3>{state.format === "csv" ? "Data Export" : "Figure Export"}</h3>
              <p>{description}</p>
            </div>
          </div>
          <button type="button" className="export-modal__close" onClick={onClose} aria-label="Close export dialog">
            <X size={18} />
          </button>
        </div>

        <div className="export-modal__body">
          <div className="export-menu__field export-menu__field--full">
            <span>Format</span>
            <div className="export-modal__format-grid">
              {exportFormats.map((format) => {
                const disabled = format !== "csv" && figureDisabled;
                return (
                  <button
                    key={format}
                    type="button"
                    className={`export-modal__format-option${state.format === format ? " is-active" : ""}`}
                    disabled={disabled}
                    title={disabled ? figureDisabledTitle : undefined}
                    onClick={() =>
                      onStateChange((current) => ({
                        ...current,
                        format
                      }))
                    }
                  >
                    {format.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          {isFigureFormat ? (
            <div className="export-modal__grid">
              <label className="export-menu__field">
                <span>Width (px)</span>
                <input
                  className="module-parameter-field__control export-menu__input"
                  type="number"
                  min="320"
                  value={state.width}
                  onChange={(event) => onStateChange((current) => ({ ...current, width: event.target.value }))}
                />
              </label>
              <label className="export-menu__field">
                <span>Height (px)</span>
                <input
                  className="module-parameter-field__control export-menu__input"
                  type="number"
                  min="240"
                  value={state.height}
                  onChange={(event) => onStateChange((current) => ({ ...current, height: event.target.value }))}
                />
              </label>
              <label className="export-menu__field export-menu__field--full">
                <span>DPI</span>
                <input
                  className="module-parameter-field__control export-menu__input"
                  type="number"
                  min="72"
                  value={state.dpi}
                  onChange={(event) => onStateChange((current) => ({ ...current, dpi: event.target.value }))}
                />
              </label>
            </div>
          ) : null}
        </div>

        <div className="export-modal__actions">
          <button type="button" className="export-modal__submit" disabled={submitDisabled} onClick={onSubmit}>
            {state.format === "csv" ? "Download Data" : "Download Figure"}
          </button>
        </div>
      </div>
    </div>
  );
}
