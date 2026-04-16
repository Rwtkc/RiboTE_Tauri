import type { LucideIcon } from "lucide-react";
import {
  BookOpenText,
  ChartNoAxesCombined,
  Dna,
  FolderUp,
  Gauge,
  GitBranchPlus,
  HandHelping,
  HeartPulse,
  LayoutDashboard,
  Network,
  Rows4,
  ScanSearch
} from "lucide-react";

export interface ModuleCardMetric {
  label: string;
  value: string;
}

export interface ModuleSidebarSection {
  title: string;
  items: string[];
}

export interface ModuleDefinition {
  id: string;
  label: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  dependency: string;
  accent: string;
  metrics: ModuleCardMetric[];
  sidebarSections: ModuleSidebarSection[];
  navChildren?: Array<{
    id: string;
    label: string;
  }>;
  canvasTitle: string;
  canvasDescription: string;
}

export interface ModuleGroup {
  id: string;
  label: string;
  modules: string[];
}

export const riboteModuleGroups: ModuleGroup[] = [
  {
    id: "foundation",
    label: "Foundation",
    modules: ["welcome", "load_data", "data_preprocess", "translation_efficiency"]
  },
  {
    id: "interpretation",
    label: "Interpretation",
    modules: ["pca", "clustering", "gsea", "enrichment", "network", "signalp", "codon"]
  },
  {
    id: "support",
    label: "Support",
    modules: ["help"]
  }
];

export const riboteModuleCatalog: ModuleDefinition[] = [
  {
    id: "welcome",
    label: "Project Configuration",
    icon: LayoutDashboard,
    eyebrow: "Project Setup",
    title: "Project Configuration",
    description: "Select the RiboTE species entry and verify the local annotation bundle before analysis begins.",
    dependency: "Start here",
    accent: "teal",
    metrics: [
      { label: "Primary Mode", value: "RNA + Ribo paired analysis" },
      { label: "Reference Data", value: "Species-specific annotations" },
      { label: "Analysis Scope", value: "Local RNA/Ribo study" }
    ],
    sidebarSections: [
      { title: "Quick Start", items: ["Select species", "Confirm count matrix", "Proceed to TE analysis"] },
      { title: "Priority Modules", items: ["Translation Efficiency", "GSEA", "Codon"] }
    ],
    canvasTitle: "Reference preparation",
    canvasDescription: "Confirm the species reference and annotation files before starting RNA/Ribo-based translation efficiency analysis."
  },
  {
    id: "load_data",
    label: "Load Data",
    icon: FolderUp,
    eyebrow: "Data Import",
    title: "Load Data",
    description: "Select species resources, inspect matrix previews, and preserve RNA-seq / Ribo-seq pairing context for the rest of the analysis chain.",
    dependency: "Requires reference species",
    accent: "teal",
    metrics: [
      { label: "Required Inputs", value: "Species + count matrix" },
      { label: "Pairing Model", value: "RNA-seq <-> Ribo-seq" },
      { label: "Analysis Input", value: "Local count matrix" }
    ],
    sidebarSections: [
      { title: "Input Setup", items: ["Species selector", "Count matrix", "Sample preview"] },
      { title: "Sample Pairing", items: ["RNA-seq samples", "Ribo-seq samples", "Control/Treatment groups"] }
    ],
    canvasTitle: "Expression matrix preview",
    canvasDescription: "Inspect the count matrix and confirm matched RNA-seq/Ribo-seq samples before preprocessing."
  },
  {
    id: "data_preprocess",
    label: "Data Preprocess",
    icon: ScanSearch,
    eyebrow: "Filtering and QC",
    title: "Data Preprocess",
    description: "Prepare the count matrix through filtering, CPM thresholds, library-size inspection, and QC summaries before TE analysis.",
    dependency: "Requires confirmed RNA/Ribo samples",
    accent: "teal",
    metrics: [
      { label: "Output", value: "Processed matrix" },
      { label: "QC Views", value: "Library size + composition" },
      { label: "Downstream Effect", value: "Refreshes TE-derived analyses" }
    ],
    sidebarSections: [
      { title: "Parameters", items: ["NA strategy", "Minimum CPM", "Minimum libraries"] },
      { title: "Result Views", items: ["Filtered matrix", "Library size", "Composition QC"] }
    ],
    canvasTitle: "Count matrix preprocessing",
    canvasDescription: "Filter low-abundance genes, inspect library size, and summarize gene biotype and rRNA fractions."
  },
  {
    id: "translation_efficiency",
    label: "Translation Efficiency",
    icon: Gauge,
    eyebrow: "Differential TE Estimation",
    title: "Translation Efficiency",
    description: "Run Riborex or Xtail and compare RNA, Ribo, and TE fold changes to classify genes into Up, Down, and Non TE groups.",
    dependency: "Requires Data Preprocess",
    accent: "warm",
    metrics: [
      { label: "Methods", value: "Riborex / Xtail" },
      { label: "Primary Outputs", value: "Data + volcano + scatter" },
      { label: "Gene Classes", value: "Up / Down / Non" }
    ],
    sidebarSections: [
      { title: "Controls", items: ["TE tool", "Fold threshold", "P-value cutoff", "P-value type"] },
      { title: "Result Surfaces", items: ["Summary cards", "Volcano figure", "Scatter comparison"] }
    ],
    canvasTitle: "Translation efficiency results",
    canvasDescription: "Classify genes by TE change and inspect RNA, Ribo, and TE fold-change behavior."
  },
  {
    id: "pca",
    label: "PCA",
    icon: ChartNoAxesCombined,
    eyebrow: "Projection",
    title: "PCA",
    description: "Project TE-derived sample spaces with PCA, MDS, or T-SNE to assess separation between conditions and data spaces.",
    dependency: "Requires Translation Efficiency",
    accent: "teal",
    metrics: [
      { label: "Data Spaces", value: "TE / RNA / Ribo" },
      { label: "Methods", value: "PCA / MDS / T-SNE" },
      { label: "Primary Output", value: "Sample projection" }
    ],
    sidebarSections: [
      { title: "Analysis Controls", items: ["Data space", "Projection method", "Sample groups"] },
      { title: "Export Scope", items: ["Current figure", "All methods", "All spaces"] }
    ],
    canvasTitle: "Projection viewer",
    canvasDescription: "Compare sample separation across TE ratio, RNA abundance, and Ribo abundance spaces."
  },
  {
    id: "clustering",
    label: "Clustering",
    icon: Rows4,
    eyebrow: "Heatmaps",
    title: "Clustering",
    description: "Cluster TE-associated genes into heatmap views with configurable gene counts, distance metrics, and detail-heatmap selection.",
    dependency: "Requires Translation Efficiency",
    accent: "teal",
    metrics: [
      { label: "Heatmap Stack", value: "Main + detail" },
      { label: "Color Series", value: "Blue-White-Red" },
      { label: "Selection Mode", value: "Brush or Gene IDs" }
    ],
    sidebarSections: [
      { title: "Primary Controls", items: ["Top genes", "Distance", "Linkage", "Max z-score"] },
      { title: "Heatmap Views", items: ["Main heatmap", "Detail heatmap", "Export"] }
    ],
    canvasTitle: "Hierarchical clustering stage",
    canvasDescription: "Cluster TE-associated genes and inspect selected gene subsets in matched heatmap views."
  },
  {
    id: "gsea",
    label: "GSEA",
    icon: GitBranchPlus,
    eyebrow: "Ranked Enrichment",
    title: "GSEA",
    description: "Rank TE-associated genes and run fgsea-based pathway analysis across hallmark, GO, Reactome, or KEGG collections.",
    dependency: "Requires Translation Efficiency",
    accent: "warm",
    metrics: [
      { label: "Method", value: "fgseaMultilevel" },
      { label: "Collections", value: "Human + rice presets" },
      { label: "Primary Output", value: "Pathway table + curve" }
    ],
    sidebarSections: [
      { title: "Pathway Settings", items: ["Collection", "Geneset size min/max", "FDR cutoff"] },
      { title: "Outputs", items: ["Displayed pathways", "Selected curve", "Data export"] }
    ],
    canvasTitle: "Ranked pathway surface",
    canvasDescription: "Rank TE-associated genes and inspect pathway enrichment strength across selected gene-set collections."
  },
  {
    id: "enrichment",
    label: "Enrichment",
    icon: BookOpenText,
    eyebrow: "Term Summaries",
    title: "Enrichment",
    description: "Summarize Up and Down TE gene sets with over-representation analysis against curated pathway collections.",
    dependency: "Requires Translation Efficiency",
    accent: "warm",
    metrics: [
      { label: "Gene Sets", value: "Up / Down TE groups" },
      { label: "Background", value: "Filtered or full" },
      { label: "Primary Output", value: "Term-level enrichment" }
    ],
    sidebarSections: [
      { title: "Configuration", items: ["Collection", "Top terms", "Sort mode"] },
      { title: "Display Options", items: ["Filtered background", "Remove redundancy", "Show pathway ID"] }
    ],
    canvasTitle: "Enrichment comparison board",
    canvasDescription: "Prioritize enriched biological functions and pathways for TE Up and TE Down gene groups."
  },
  {
    id: "network",
    label: "Network",
    icon: Network,
    eyebrow: "Co-expression",
    title: "Network",
    description: "Construct WGCNA-based module networks on TE-derived expression spaces and inspect module-specific topology in a graph canvas.",
    dependency: "Requires Translation Efficiency",
    accent: "teal",
    metrics: [
      { label: "Method", value: "WGCNA" },
      { label: "Views", value: "Module graph + summaries" },
      { label: "Primary Output", value: "Co-expression graph" }
    ],
    sidebarSections: [
      { title: "Graph Inputs", items: ["Data space", "Top genes", "Soft power", "Min module size"] },
      { title: "Network Views", items: ["Module selector", "Gene graph", "Module summary"] }
    ],
    canvasTitle: "Network exploration canvas",
    canvasDescription: "Inspect coordinated gene patterns and module-specific topology across TE-derived expression spaces."
  },
  {
    id: "signalp",
    label: "SignalP",
    icon: HeartPulse,
    eyebrow: "Signal Peptides",
    title: "SignalP",
    description: "Compare TE-defined gene groups against local SignalP, TMHMM, and Phobius annotations to inspect secretory and membrane-related context.",
    dependency: "Requires Translation Efficiency",
    accent: "teal",
    metrics: [
      { label: "Annotation Sources", value: "SignalP / TMHMM / Phobius" },
      { label: "Species Support", value: "Resource-dependent" },
      { label: "Primary Output", value: "Annotation comparison" }
    ],
    sidebarSections: [
      { title: "Method Controls", items: ["Available methods", "Run trigger", "Figure export"] },
      { title: "Expected Outputs", items: ["Group comparison", "Annotation summaries", "Export table"] }
    ],
    canvasTitle: "Signal peptide summary",
    canvasDescription: "Compare secretory and membrane annotation frequencies across TE-defined gene groups."
  },
  {
    id: "codon",
    label: "Codon",
    icon: Dna,
    eyebrow: "Codon-Centric Analysis",
    title: "Codon",
    description: "Analyze codon usage, codon bias, run enrichment, and load relationships with multiple view groups derived from TE outputs.",
    dependency: "Requires Translation Efficiency",
    accent: "warm",
    metrics: [
      { label: "Analysis Families", value: "Usage / Bias / Runs / Shift" },
      { label: "Resource Inputs", value: "FASTA + txlens + bias tables" },
      { label: "Primary Output", value: "Codon usage families" }
    ],
    navChildren: [
      { id: "input_and_usage", label: "Input and Usage" },
      { id: "codon_bias", label: "Codon Bias" },
      { id: "te_shift_and_enrichment", label: "Te Shift and Enrichment" },
      { id: "pattern_views", label: "Pattern Views" },
      { id: "codon_runs", label: "Codon Runs" }
    ],
    sidebarSections: [
      { title: "View Families", items: ["Input and usage", "Codon bias", "Pattern views", "Codon runs"] },
      { title: "Result Views", items: ["View switcher", "Codon charts", "Export"] }
    ],
    canvasTitle: "Codon analysis stack",
    canvasDescription: "Inspect codon usage, bias, enrichment, patterns, and codon-run behavior in TE-defined gene groups."
  },
  {
    id: "help",
    label: "Help",
    icon: HandHelping,
    eyebrow: "Guidance",
    title: "Help",
    description: "Provide analysis guidance, module-by-module notes, and result export guidance.",
    dependency: "Available anytime",
    accent: "teal",
    metrics: [
      { label: "Audience", value: "New and returning users" },
      { label: "Scope", value: "Analysis guidance" },
      { label: "Output", value: "Result export notes" }
    ],
    sidebarSections: [
      { title: "Topics", items: ["Recommended analysis order", "Required inputs", "Export behavior"] },
      { title: "Notes", items: ["Reference annotations", "RNA/Ribo count data", "TE-dependent analyses"] }
    ],
    canvasTitle: "Support hub",
    canvasDescription: "Review the recommended analysis order and prerequisites for RiboTE modules."
  }
];

export function findModuleDefinition(moduleId: string) {
  return riboteModuleCatalog.find((module) => module.id === moduleId) ?? riboteModuleCatalog[0];
}
