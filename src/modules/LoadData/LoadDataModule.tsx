import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  Save,
  UploadCloud
} from "lucide-react";
import { ThemedSelect } from "@/modules/DataPreprocess/ThemedSelect";
import { validateLoadDataSave } from "@/modules/LoadData/loadDataValidation";
import { useAppStore } from "@/store/useAppStore";
import type { MatrixPreview, SampleGroupRole, SamplePair } from "@/store/useAppStore";

type AssignmentTarget = "unassigned" | "rna" | "ribo";

function buildSamplePairs(rnaSamples: string[], riboSamples: string[]): SamplePair[] {
  const pairCount = Math.min(rnaSamples.length, riboSamples.length);

  return Array.from({ length: pairCount }, (_, index) => ({
    id: crypto.randomUUID(),
    rnaSample: rnaSamples[index],
    riboSample: riboSamples[index],
    groupRole: index < Math.ceil(pairCount / 2) ? "Control" : "Treatment"
  }));
}

function areSamplePairsEqual(left: SamplePair[], right: SamplePair[]) {
  return (
    left.length === right.length &&
    left.every((pair, index) => {
      const other = right[index];
      return (
        Boolean(other) &&
        pair.rnaSample === other.rnaSample &&
        pair.riboSample === other.riboSample &&
        pair.groupRole === other.groupRole
      );
    })
  );
}

function isSavedLoadDataState(
  savedContext: ReturnType<typeof useAppStore.getState>["loadDataContext"],
  matrix: MatrixPreview | null,
  samplePairs: SamplePair[]
) {
  if (!savedContext || !matrix) {
    return false;
  }

  return (
    savedContext.matrix.filePath === matrix.filePath &&
    areSamplePairsEqual(savedContext.samplePairs, samplePairs)
  );
}

export function LoadDataModule() {
  const species = useAppStore((state) => state.species);
  const draft = useAppStore((state) => state.loadDataDraft);
  const savedContext = useAppStore((state) => state.loadDataContext);
  const setLoadDataDraft = useAppStore((state) => state.setLoadDataDraft);
  const setLoadDataContext = useAppStore((state) => state.setLoadDataContext);
  const matrix = draft.matrix ?? savedContext?.matrix ?? null;
  const rnaSamples =
    draft.matrix || !savedContext
      ? draft.rnaSamples
      : savedContext.samplePairs.map((pair) => pair.rnaSample);
  const riboSamples =
    draft.matrix || !savedContext
      ? draft.riboSamples
      : savedContext.samplePairs.map((pair) => pair.riboSample);
  const samplePairs =
    draft.matrix || !savedContext ? draft.samplePairs : savedContext.samplePairs;
  const [isReading, setIsReading] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  function updateDraft(nextDraft: {
    matrix: MatrixPreview | null;
    rnaSamples: string[];
    riboSamples: string[];
    samplePairs: SamplePair[];
  }) {
    setLoadDataDraft(nextDraft);
  }

  const saveValidation = validateLoadDataSave({
    matrix,
    rnaSamples,
    riboSamples,
    samplePairs
  });
  const canSave = saveValidation.canSave;
  const hasSavedCurrentSelection = isSavedLoadDataState(savedContext, matrix, samplePairs);
  const alertStatus = status === "error" ? "error" : hasSavedCurrentSelection ? "saved" : "idle";

  async function chooseExpressionMatrix() {
    setStatus("idle");
    setErrorMessage("");

    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Expression Matrix",
          extensions: ["txt", "tsv", "csv"]
        }
      ]
    });

    if (typeof selected !== "string" || !selected) {
      return;
    }

    setIsReading(true);
    try {
      const preview = await invoke<MatrixPreview>("read_matrix_preview", {
        path: selected,
        maxRows: 10
      });
      updateDraft({
        matrix: preview,
        rnaSamples: [],
        riboSamples: [],
        samplePairs: []
      });
    } catch (error) {
      updateDraft({
        matrix: null,
        rnaSamples: [],
        riboSamples: [],
        samplePairs: []
      });
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsReading(false);
    }
  }

  function updatePair(pairId: string, patch: Partial<SamplePair>) {
    setStatus("idle");
    setErrorMessage("");
    updateDraft({
      matrix,
      rnaSamples,
      riboSamples,
      samplePairs: samplePairs.map((pair) => (pair.id === pairId ? { ...pair, ...patch } : pair))
    });
  }

  function assignSamples(samplesToAssign: string[], target: AssignmentTarget) {
    setStatus("idle");
    setErrorMessage("");
    const uniqueSamples = [...new Set(samplesToAssign)];
    const movingSamples = matrix
      ? matrix.sampleNames.filter((sample) => uniqueSamples.includes(sample))
      : uniqueSamples;
    const nextRnaSamples = rnaSamples.filter((item) => !uniqueSamples.includes(item));
    const nextRiboSamples = riboSamples.filter((item) => !uniqueSamples.includes(item));

    if (target === "rna") {
      nextRnaSamples.push(...movingSamples);
    }

    if (target === "ribo") {
      nextRiboSamples.push(...movingSamples);
    }

    updateDraft({
      matrix,
      rnaSamples: nextRnaSamples,
      riboSamples: nextRiboSamples,
      samplePairs: buildSamplePairs(nextRnaSamples, nextRiboSamples)
    });
  }

  function assignSample(sample: string, target: AssignmentTarget) {
    assignSamples([sample], target);
  }

  function saveLoadDataContext() {
    if (!matrix || !canSave) {
      setStatus("error");
      setErrorMessage(saveValidation.message || "Complete sample pairing before saving.");
      return;
    }

    setLoadDataContext({
      matrix,
      samplePairs,
      savedAt: new Date().toISOString()
    });
    updateDraft({
      matrix,
      rnaSamples,
      riboSamples,
      samplePairs
    });
    setStatus("saved");
    setErrorMessage("");
  }

  return (
    <section className="module-page load-data-page">
      <div className="module-page__hero">
        <div className="module-page__hero-copy">
          <h1>Load Data</h1>
          <p>
            Choose a count matrix and pair RNA-seq with Ribo-seq samples for the selected species.
          </p>
        </div>
      </div>

      <div className="setup-stack">
        <section className="config-card load-data-step">
          <div className="config-card__head">
            <div className="config-card__icon">1</div>
            <div className="config-card__copy">
              <h3>Expression Matrix</h3>
              <p>Select a local RNA-seq / Ribo-seq count matrix for the active species.</p>
            </div>
          </div>

          <div className="path-row">
            <div className="path-row__input">
              {matrix?.filePath ?? "Select expression matrix file..."}
            </div>
            <button
              type="button"
              className="path-row__button"
              disabled={isReading}
              onClick={() => void chooseExpressionMatrix()}
            >
              <UploadCloud size={14} />
              {matrix ? "Change" : "Choose File"}
            </button>
          </div>

          <div className="load-data-meta">
            <span>Species: {species || "None selected"}</span>
            <span>Format: TXT / TSV / CSV</span>
          </div>
        </section>

        {matrix ? (
          <>
            <section className="config-card load-data-step">
              <div className="config-card__head config-card__head--with-action">
                <div className="config-card__icon">2</div>
                <div className="config-card__copy">
                  <h3>Matrix Preview</h3>
                  <p>First 10 rows from {matrix.fileName}.</p>
                </div>
              </div>
              <PreviewTable matrix={matrix} />
            </section>

            <section className="config-card load-data-step">
              <div className="config-card__head config-card__head--with-action">
                <div className="config-card__icon">3</div>
                <div className="config-card__copy">
                  <h3>Sample Pairing</h3>
                  <p>Drag sample cards into RNA-seq and Ribo-seq. The two groups must have the same number of cards.</p>
                </div>
                <button
                  type="button"
                  className="action-button action-button--primary"
                  disabled={!canSave}
                  onClick={saveLoadDataContext}
                >
                  <Save size={14} />
                  Save
                </button>
              </div>

              <SampleAssignmentBoard
                samples={matrix.sampleNames}
                rnaSamples={rnaSamples}
                riboSamples={riboSamples}
                onAssign={assignSample}
                onAssignMany={assignSamples}
              />

              {!canSave && saveValidation.message ? (
                <div className="pairing-hint">{saveValidation.message}</div>
              ) : null}

              <div className="pairing-table">
                <div className="pairing-table__head">
                  <span>RNA-seq</span>
                  <span>Ribo-seq</span>
                  <span>Group Role</span>
                </div>
                {samplePairs.map((pair) => (
                  <div key={pair.id} className="pairing-table__row">
                    <span className="pairing-table__sample">{pair.rnaSample}</span>
                    <span className="pairing-table__sample">{pair.riboSample}</span>
                    <div className="load-data-role-select">
                      <ThemedSelect
                        options={["Control", "Treatment"]}
                        value={pair.groupRole}
                        onChange={(value) =>
                          updatePair(pair.id, {
                            groupRole: value as SampleGroupRole
                          })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}

        {alertStatus !== "idle" ? (
          <div className={`inline-alert inline-alert--${alertStatus === "saved" ? "success" : "danger"}`}>
            {alertStatus === "saved" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            <span>
            {alertStatus === "saved"
                ? "RNA/Ribo sample pairing confirmed"
                : errorMessage || "Unable to confirm RNA/Ribo sample pairing"}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SampleAssignmentBoard({
  samples,
  rnaSamples,
  riboSamples,
  onAssign,
  onAssignMany
}: {
  samples: string[];
  rnaSamples: string[];
  riboSamples: string[];
  onAssign: (sample: string, target: AssignmentTarget) => void;
  onAssignMany: (samples: string[], target: AssignmentTarget) => void;
}) {
  const [dragTarget, setDragTarget] = useState<AssignmentTarget | null>(null);
  const [dragState, setDragState] = useState<{
    samples: string[];
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [selectedSamples, setSelectedSamples] = useState<string[]>([]);
  const assignedSamples = new Set([...rnaSamples, ...riboSamples]);
  const unassignedSamples = samples.filter((sample) => !assignedSamples.has(sample));
  const visibleSamples = [...unassignedSamples, ...rnaSamples, ...riboSamples];

  useEffect(() => {
    setSelectedSamples((current) => current.filter((sample) => visibleSamples.includes(sample)));
  }, [visibleSamples.join("\u0000")]);

  function getTargetFromPoint(x: number, y: number) {
    const element = document
      .elementFromPoint(x, y)
      ?.closest("[data-assignment-target]") as HTMLElement | null;
    const target = element?.dataset.assignmentTarget;

    return target === "unassigned" || target === "rna" || target === "ribo" ? target : null;
  }

  function startDrag(event: React.PointerEvent<HTMLDivElement>, sample: string) {
    event.preventDefault();
    event.stopPropagation();

    if (event.ctrlKey || event.metaKey) {
      setSelectedSamples((current) =>
        current.includes(sample)
          ? current.filter((item) => item !== sample)
          : [...current, sample]
      );
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const samplesToDrag = selectedSamples.includes(sample)
      ? visibleSamples.filter((item) => selectedSamples.includes(item))
      : [sample];

    if (!selectedSamples.includes(sample)) {
      setSelectedSamples([]);
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      samples: samplesToDrag,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    });
    setDragTarget(getTargetFromPoint(event.clientX, event.clientY));
  }

  const draggedSamples = dragState?.samples ?? [];

  useEffect(() => {
    if (!draggedSamples.length) {
      return;
    }

    const activeSamples = draggedSamples;

    function handlePointerMove(event: PointerEvent) {
      event.preventDefault();
      setDragState((current) =>
        current ? { ...current, x: event.clientX, y: event.clientY } : current
      );
      setDragTarget(getTargetFromPoint(event.clientX, event.clientY));
    }

    function handlePointerUp(event: PointerEvent) {
      event.preventDefault();
      const target = getTargetFromPoint(event.clientX, event.clientY);

      if (target) {
        if (activeSamples.length > 1) {
          onAssignMany(activeSamples, target);
        } else {
          onAssign(activeSamples[0], target);
        }
      }

      setDragState(null);
      setDragTarget(null);
      setSelectedSamples([]);
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp, { passive: false });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [draggedSamples, onAssign, onAssignMany]);

  const draggedSampleSet = new Set(draggedSamples);
  const selectedSampleSet = new Set(selectedSamples);

  return (
    <div className={`assignment-board${dragState ? " is-dragging" : ""}`}>
      <SampleBucket
        title="Sample Cards"
        target="unassigned"
        samples={unassignedSamples}
        active={dragTarget === "unassigned"}
        draggedSamples={draggedSampleSet}
        selectedSamples={selectedSampleSet}
        onSamplePointerDown={startDrag}
      />
      <SampleBucket
        title="RNA-seq"
        target="rna"
        samples={rnaSamples}
        active={dragTarget === "rna"}
        draggedSamples={draggedSampleSet}
        selectedSamples={selectedSampleSet}
        onSamplePointerDown={startDrag}
      />
      <SampleBucket
        title="Ribo-seq"
        target="ribo"
        samples={riboSamples}
        active={dragTarget === "ribo"}
        draggedSamples={draggedSampleSet}
        selectedSamples={selectedSampleSet}
        onSamplePointerDown={startDrag}
      />
      {dragState ? (
        <div
          className="sample-drag-ghost"
          style={{
            left: dragState.x - dragState.offsetX,
            top: dragState.y - dragState.offsetY
          }}
        >
          {dragState.samples.length > 1 ? `${dragState.samples.length} samples` : dragState.samples[0]}
        </div>
      ) : null}
    </div>
  );
}

function SampleBucket({
  title,
  target,
  samples,
  active,
  draggedSamples,
  selectedSamples,
  onSamplePointerDown
}: {
  title: string;
  target: AssignmentTarget;
  samples: string[];
  active: boolean;
  draggedSamples: Set<string>;
  selectedSamples: Set<string>;
  onSamplePointerDown: (event: React.PointerEvent<HTMLDivElement>, sample: string) => void;
}) {
  return (
    <div
      className={`sample-bucket${active ? " is-active" : ""}`}
      data-assignment-target={target}
    >
      <div className="sample-bucket__title">
        <span>{title}</span>
        <strong>{samples.length} assigned</strong>
      </div>
      <div className="sample-bucket__items">
        {samples.length ? (
          samples.map((sample) => (
            <div
              key={sample}
              className={`sample-chip${draggedSamples.has(sample) ? " is-dragging" : ""}${selectedSamples.has(sample) ? " is-selected" : ""}`}
              onPointerDown={(event) => onSamplePointerDown(event, sample)}
            >
              {sample}
            </div>
          ))
        ) : (
          <div className="sample-bucket__empty">Drop sample cards here</div>
        )}
      </div>
    </div>
  );
}

function PreviewTable({ matrix }: { matrix: MatrixPreview }) {
  return (
    <div className="preview-table-shell">
      <table className="preview-table">
        <thead>
          <tr>
            {matrix.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row, rowIndex) => (
            <tr key={`${matrix.fileName}-${rowIndex}`}>
              {matrix.columns.map((column, columnIndex) => (
                <td key={`${column}-${columnIndex}`}>{row[columnIndex] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
