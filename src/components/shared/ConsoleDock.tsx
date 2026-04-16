import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, ChevronUp, SquareTerminal, X } from "lucide-react";
import { useLogStore } from "@/store/useLogStore";

export function ConsoleDock() {
  const { logs, isExpanded, activeProcessCount, addLog, setExpanded } = useLogStore();
  const [isStopping, setIsStopping] = useState(false);
  const isBusy = activeProcessCount > 0;

  async function handleTerminate() {
    if (!isBusy || isStopping) {
      return;
    }

    setIsStopping(true);
    addLog("command", "[Progress] Stop requested for the active analysis.");

    try {
      const terminatedCount = await invoke<number>("terminate_active_r_processes");
      if (terminatedCount > 0) {
        addLog("info", `[Progress] Stop signal sent to ${terminatedCount} active analysis task${terminatedCount === 1 ? "" : "s"}.`);
      } else {
        addLog("info", "[Progress] No active analysis task was found.");
      }
    } catch (error) {
      addLog("error", `[Progress] Stop failed: ${String(error)}`);
    } finally {
      setIsStopping(false);
    }
  }

  return (
    <section className={`console-shell ${isExpanded ? "is-expanded" : ""}`}>
      <div
        className="console-shell__head"
        onClick={() => setExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded(!isExpanded);
          }
        }}
      >
        <div className="console-shell__title">
          <SquareTerminal size={14} />
          <span>Progress {isBusy ? `(${activeProcessCount})` : ""}</span>
        </div>
        <div className="console-shell__actions">
          {isBusy ? (
            <div className="console-shell__engine">
              <span className="status-dot is-busy" />
              <span>Analysis Running</span>
            </div>
          ) : null}
          {isBusy ? (
            <button
              type="button"
              className="console-shell__terminate"
              disabled={isStopping}
              onClick={(event) => {
                event.stopPropagation();
                void handleTerminate();
              }}
            >
              <X size={12} />
              <span>{isStopping ? "Stopping" : "Stop"}</span>
            </button>
          ) : null}
          <span className="console-shell__chevron" aria-hidden="true">
            {isExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </span>
        </div>
      </div>

      {isExpanded ? (
        <div className="console-shell__body">
          {logs.length > 0 ? (
            logs.map((log) => (
              <div key={log.id} className={`console-line console-line--${log.type}`}>
                <span className="console-line__time">[{log.timestamp}]</span>
                <span className="console-line__type">{log.type}</span>
                <span className="console-line__message">{log.message}</span>
              </div>
            ))
          ) : (
            <div className="console-shell__empty">
              RiboTE analysis progress will appear here.
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
