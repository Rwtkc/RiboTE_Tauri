import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, ArrowRight, CheckCircle2, Database, Settings2 } from "lucide-react";
import { SPECIES_OPTIONS } from "@/data/species";
import { SpeciesSearchSelector } from "@/modules/Welcome/SpeciesSearchSelector";
import { useAppStore } from "@/store/useAppStore";
import type { AnnotationValidation } from "@/store/useAppStore";

interface WelcomeModuleProps {
  onNavigate: (moduleId: string) => void;
}

export function WelcomeModule({ onNavigate }: WelcomeModuleProps) {
  const [isValidating, setIsValidating] = useState(false);
  const validationRunId = useRef(0);
  const {
    species,
    setSpecies,
    annotationDir,
    annotationValidation,
    setAnnotationDir,
    setAnnotationValidation
  } = useAppStore();
  const selectedSpecies =
    SPECIES_OPTIONS.find((option) => option.label === species) ?? SPECIES_OPTIONS[0];
  const isSetupReady = Boolean(annotationValidation?.isValid);
  const annotationStatusTone = annotationValidation?.isValid
    ? "success"
    : annotationValidation
      ? "danger"
      : "warning";
  const annotationStatusText = annotationValidation?.isValid
    ? "Reference annotation files matched"
    : annotationValidation
      ? "Reference annotation files are incomplete"
      : "Choose a directory to validate";
  const shouldShowAnnotationStatus = Boolean(annotationDir && annotationValidation);

  const runAnnotationValidation = useCallback(async (path: string, showPending = true) => {
    const runId = validationRunId.current + 1;
    validationRunId.current = runId;

    if (showPending) {
      setIsValidating(true);
    }

    try {
      const result = await invoke<AnnotationValidation>("validate_annotation_directory", {
        path,
        expectedFiles: selectedSpecies.expectedFiles
      });
      if (runId === validationRunId.current) {
        setAnnotationValidation(result);
      }
    } catch {
      if (runId === validationRunId.current) {
        setAnnotationValidation({
          exists: false,
          isValid: false,
          rootPath: path,
          missingItems: ["annotation directory"],
          speciesFiles: []
        });
      }
    } finally {
      if (runId === validationRunId.current && showPending) {
        setIsValidating(false);
      }
    }
  }, [selectedSpecies.expectedFiles, setAnnotationValidation]);

  async function chooseAnnotationDirectory() {
    const selected = await open({
      directory: true,
      multiple: false
    });

    if (typeof selected !== "string" || !selected) {
      return;
    }

    setAnnotationDir(selected);
    if (selected === annotationDir) {
      await runAnnotationValidation(selected);
    }
  }

  useEffect(() => {
    if (!annotationDir) {
      setAnnotationValidation(null);
      return;
    }

    void runAnnotationValidation(annotationDir);
    const runSilentValidation = () => {
      void runAnnotationValidation(annotationDir, false);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        runSilentValidation();
      }
    };

    const intervalId = window.setInterval(runSilentValidation, 2500);
    window.addEventListener("focus", runSilentValidation);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", runSilentValidation);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      validationRunId.current += 1;
    };
  }, [annotationDir, runAnnotationValidation, setAnnotationValidation]);

  function prettyFileLabel(item: string) {
    const trimmed = item.trim().replace(/[\\/]+$/, "");
    if (!trimmed) {
      return item;
    }

    const parts = trimmed.split(/[/\\]/);
    return parts[parts.length - 1] || trimmed;
  }

  return (
    <section className="module-page">
      <div className="module-page__hero">
        <h1>Project Configuration</h1>
        <p>
          Select the species reference and verify the annotation files required for RiboTE analysis.
        </p>
      </div>

      <div className="setup-stack">
        <ConfigCard
          icon={<Settings2 size={18} />}
          title="Reference Genome"
          desc="Select the species entry used to match RiboTE gene information, GFF, transcript length, codon, and signal annotation resources."
        >
          <SpeciesSearchSelector selectedValue={species} onSelect={setSpecies} />
        </ConfigCard>

        <ConfigCard
          icon={<Database size={18} />}
          title="Annotation Library"
          desc="RiboTE checks the selected species against local gene information, transcript, codon, and signal annotation files before analysis begins."
        >
          <PathRow
            placeholder="Select annotation directory..."
            value={annotationDir}
            buttonLabel={annotationDir ? "Change" : "Browse"}
            onBrowse={() => void chooseAnnotationDirectory()}
          />

          {shouldShowAnnotationStatus ? (
            <div className={`inline-alert inline-alert--${annotationStatusTone}`}>
              {annotationValidation?.isValid ? (
                <CheckCircle2 size={14} />
              ) : (
                <AlertTriangle size={14} />
              )}
              <span>
                {isValidating
                  ? "Checking annotation files..."
                  : annotationStatusText}
              </span>
            </div>
          ) : null}

          {annotationValidation?.speciesFiles.length ? (
            <div className="summary-list summary-list--tight">
              {annotationValidation.speciesFiles.map((file) => (
                <div key={file} className="summary-list__item">
                  Found: {prettyFileLabel(file)}
                </div>
              ))}
            </div>
          ) : null}

          {annotationValidation?.missingItems.length ? (
            <div className="summary-list summary-list--tight">
              {annotationValidation.missingItems.map((file) => (
                <div key={file} className="summary-list__item summary-list__item--danger">
                  Missing: {prettyFileLabel(file)}
                </div>
              ))}
            </div>
          ) : null}
        </ConfigCard>
      </div>

      <div className="module-status">
        <div className={`module-status__copy${isSetupReady ? " is-ready" : ""}`}>
          {isSetupReady ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>
            {isSetupReady
              ? "Project Status: reference annotations are ready, analysis can begin"
              : "Project Status: waiting for complete reference annotations"}
          </span>
        </div>
        <button
          type="button"
          className={`module-status__action${isSetupReady ? " is-ready" : ""}`}
          disabled={!isSetupReady}
          onClick={() => onNavigate("load_data")}
        >
          {isSetupReady ? "Start Analysis" : "Locked"}
          {isSetupReady ? <ArrowRight size={14} /> : null}
        </button>
      </div>
    </section>
  );
}

function ConfigCard({
  icon,
  title,
  desc,
  children
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="config-card">
      <div className="config-card__head">
        <div className="config-card__icon">{icon}</div>
        <div className="config-card__copy">
          <h3>{title}</h3>
          <p>{desc}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function PathRow({
  placeholder,
  value,
  buttonLabel,
  onBrowse
}: {
  placeholder: string;
  value?: string;
  buttonLabel: string;
  onBrowse?: () => void;
}) {
  return (
    <div className="path-row">
      <div className="path-row__input">{value || placeholder}</div>
      <button type="button" className="path-row__button" onClick={onBrowse}>
        {buttonLabel}
      </button>
    </div>
  );
}
