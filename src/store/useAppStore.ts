import { create } from "zustand";

interface AppState {
  activeModule: string;
  activeModuleNavChildren: Record<string, string>;
  engineBusy: boolean;
  species: string;
  annotationDir: string;
  annotationValidation: AnnotationValidation | null;
  loadDataDraft: LoadDataDraft;
  loadDataContext: LoadDataContext | null;
  dataPreprocessResult: DataPreprocessResult | null;
  analysisResults: Record<string, RiboteAnalysisResult | null>;
  setActiveModule: (moduleId: string) => void;
  setActiveModuleNavChild: (moduleId: string, childId: string) => void;
  setEngineBusy: (busy: boolean) => void;
  setSpecies: (value: string) => void;
  setAnnotationDir: (path: string) => void;
  setAnnotationValidation: (value: AnnotationValidation | null) => void;
  setLoadDataDraft: (value: LoadDataDraft) => void;
  setLoadDataContext: (value: LoadDataContext | null) => void;
  setDataPreprocessResult: (value: DataPreprocessResult | null) => void;
  setAnalysisResult: (moduleId: string, value: RiboteAnalysisResult | null) => void;
}

export interface AnnotationValidation {
  exists: boolean;
  isValid: boolean;
  rootPath: string;
  missingItems: string[];
  speciesFiles: string[];
}

export interface MatrixPreview {
  filePath: string;
  fileName: string;
  delimiter: string;
  columns: string[];
  rows: string[][];
  sampleNames: string[];
}

export type SampleGroupRole = "Control" | "Treatment";

export interface SamplePair {
  id: string;
  rnaSample: string;
  riboSample: string;
  groupRole: SampleGroupRole;
}

export interface LoadDataContext {
  matrix: MatrixPreview;
  samplePairs: SamplePair[];
  savedAt: string;
}

export interface LoadDataDraft {
  matrix: MatrixPreview | null;
  rnaSamples: string[];
  riboSamples: string[];
  samplePairs: SamplePair[];
}

export interface DataPreprocessResult {
  matrixPath: string;
  speciesId?: string;
  annotationDir?: string;
  inputMatrixPath?: string;
  matrixStats: {
    genes: number;
    samples: number;
  };
  parameters: {
    naStrategy: string;
    minCpm: number;
    minLibraries: number;
  };
  table: {
    columns: string[];
    rows: Array<Record<string, string | number | null>>;
    totalRows: number;
  };
  charts: {
    barplot: Array<Record<string, string | number | null>>;
    biotype: Array<Record<string, string | number | null>>;
    rrna: Array<Record<string, string | number | null>>;
  };
}

export interface RiboteAnalysisResult {
  moduleId: string;
  resultPath: string;
  message: string;
  summary: Array<{
    label: string;
    value: string;
  }>;
  table: {
    columns: string[];
    rows: Array<Record<string, string | number | null>>;
    totalRows: number;
  };
  views: Array<{
    id: string;
    title: string;
    type: "table" | "scatter" | "heatmap" | "bar" | "network" | "gsea" | "enrichment" | "clustering" | "signalp" | "codon";
  }>;
  charts: Record<string, unknown>;
}

const teDependentResultKeys = new Set(["pca", "clustering", "gsea", "enrichment", "network", "signalp"]);

function isTeDependentResultKey(moduleId: string) {
  return teDependentResultKeys.has(moduleId) || moduleId === "codon" || moduleId.startsWith("codon.");
}

export const useAppStore = create<AppState>((set) => ({
  activeModule: "welcome",
  activeModuleNavChildren: {
    codon: "input_and_usage"
  },
  engineBusy: false,
  species: "Homo sapiens (hg38)",
  annotationDir: "",
  annotationValidation: null,
  loadDataDraft: {
    matrix: null,
    rnaSamples: [],
    riboSamples: [],
    samplePairs: []
  },
  loadDataContext: null,
  dataPreprocessResult: null,
  analysisResults: {},
  setActiveModule: (moduleId) => set({ activeModule: moduleId }),
  setActiveModuleNavChild: (moduleId, childId) => set((state) => ({
    activeModuleNavChildren: {
      ...state.activeModuleNavChildren,
      [moduleId]: childId
    }
  })),
  setEngineBusy: (engineBusy) => set({ engineBusy }),
  setSpecies: (species) => set({ species, annotationValidation: null, dataPreprocessResult: null, analysisResults: {} }),
  setAnnotationDir: (annotationDir) => set({ annotationDir, annotationValidation: null, dataPreprocessResult: null, analysisResults: {} }),
  setAnnotationValidation: (annotationValidation) => set({ annotationValidation }),
  setLoadDataDraft: (loadDataDraft) => set({ loadDataDraft }),
  setLoadDataContext: (loadDataContext) => set({ loadDataContext, dataPreprocessResult: null, analysisResults: {} }),
  setDataPreprocessResult: (dataPreprocessResult) => set({ dataPreprocessResult, analysisResults: {} }),
  setAnalysisResult: (moduleId, value) => set((state) => {
    if (moduleId === "translation_efficiency") {
      return {
        analysisResults: Object.fromEntries(
          Object.entries({
            ...state.analysisResults,
            [moduleId]: value
          }).filter(([key]) => !isTeDependentResultKey(key))
        )
      };
    }

    return {
      analysisResults: {
        ...state.analysisResults,
        [moduleId]: value
      }
    };
  })
}));
