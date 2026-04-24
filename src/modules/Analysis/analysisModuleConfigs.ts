export type AnalysisFieldType = "select" | "number" | "text" | "checkbox";

export interface AnalysisFieldConfig {
  id: string;
  label: string;
  type: AnalysisFieldType;
  value: string | boolean;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

export interface AnalysisSectionConfig {
  title: string;
  fields: AnalysisFieldConfig[];
}

export interface AnalysisModuleConfig {
  id: string;
  parameterTitle: string;
  parameterDescription: string;
  resultDescription: string;
  runLabel: string;
  sections: AnalysisSectionConfig[];
  resultViews: string[];
}

const dataSpaces = ["TE Ratio", "RNA Abundance", "Ribo Abundance"];
const humanGseaCollections = ["Hallmark", "Reactome", "GO Biological Process"];
const mouseGseaCollections = ["Hallmark", "Reactome", "GO Biological Process", "KEGG"];
const functionalCollections = ["GO Biological Process", "GO Molecular Function", "GO Cellular Component", "KEGG"];

const gseaCollectionsBySpecies: Record<string, string[]> = {
  hg38: humanGseaCollections,
  mm10: mouseGseaCollections,
  osa_IRGSP_1: functionalCollections
};

const enrichmentCollectionsBySpecies: Record<string, string[]> = {
  hg38: functionalCollections,
  mm10: functionalCollections,
  osa_IRGSP_1: functionalCollections
};

export const analysisModuleConfigs: Record<string, AnalysisModuleConfig> = {
  pca: {
    id: "pca",
    parameterTitle: "Projection Controls",
    parameterDescription: "Compare how Control and Treatment samples separate in TE ratio, RNA abundance, or Ribo abundance space.",
    resultDescription: "Projection results will appear here after PCA, MDS, or T-SNE analysis completes.",
    runLabel: "Run PCA",
    sections: [
      {
        title: "Projection Controls",
        fields: [
          { id: "pca_data_space", label: "Data Space", type: "select", value: "TE Ratio", options: dataSpaces },
          { id: "pca_method", label: "Method", type: "select", value: "PCA", options: ["PCA", "MDS", "T-SNE"] }
        ]
      }
    ],
    resultViews: ["Projection Plot"]
  },
  clustering: {
    id: "clustering",
    parameterTitle: "Clustering Controls",
    parameterDescription: "Group genes with similar patterns and configure the main heatmap plus detail heatmap source.",
    resultDescription: "Main and detail heatmaps will appear here after clustering completes.",
    runLabel: "Run Clustering",
    sections: [
      {
        title: "",
        fields: [
          { id: "clustering_detail_mode", label: "Source", type: "select", value: "Select Area", options: ["Select Area", "Gene IDs"] },
          { id: "clustering_detail_gene_ids", label: "Gene IDs", type: "text", value: "", placeholder: "Enter Gene IDs when Source = Gene IDs" }
        ]
      },
      {
        title: "",
        fields: [
          { id: "clustering_data_space", label: "Data Space", type: "select", value: "TE Ratio", options: dataSpaces },
          { id: "clustering_top_genes", label: "Top Genes", type: "number", value: "2000", min: 10, step: 100 },
          { id: "clustering_zscore_max", label: "Max Z Score", type: "number", value: "3", min: 1, step: 1 },
          { id: "clustering_gene_centricity", label: "Gene Centricity (subtract mean)", type: "select", value: "true", options: ["true", "false"] }
        ]
      },
      {
        title: "",
        fields: [
          { id: "clustering_distance", label: "Distance", type: "select", value: "Pearson", options: ["Pearson", "Euclidean", "Absolute_Pearson"] },
          { id: "clustering_linkage", label: "Linkage", type: "select", value: "average", options: ["average", "complete", "single", "median", "centroid", "mcquitty"] }
        ]
      }
    ],
    resultViews: ["Main Heatmap", "Detail Heatmap"]
  },
  gsea: {
    id: "gsea",
    parameterTitle: "GSEA Controls",
    parameterDescription: "Rank TE-associated genes and test enrichment against the selected gene-set database.",
    resultDescription: "The ranked pathway table and enrichment curve viewer will appear here after GSEA completes.",
    runLabel: "Run GSEA",
    sections: [
      {
        title: "Gene Set Database",
        fields: [{ id: "gsea_collection", label: "Collection", type: "select", value: "Hallmark", options: humanGseaCollections }]
      },
      {
        title: "Analysis Filters",
        fields: [
          { id: "gsea_geneset_min", label: "Geneset Size Min", type: "number", value: "5", min: 5, step: 1 },
          { id: "gsea_geneset_max", label: "Geneset Size Max", type: "number", value: "500", min: 10, step: 10 },
          { id: "gsea_fdr_cutoff", label: "FDR Cutoff", type: "number", value: "0.05", min: 0.001, max: 1, step: 0.01 },
          { id: "gsea_show_n", label: "Pathways to Show", type: "number", value: "20", min: 5, step: 1 }
        ]
      }
    ],
    resultViews: ["Pathway Table", "Enrichment Curve"]
  },
  enrichment: {
    id: "enrichment",
    parameterTitle: "Enrichment Controls",
    parameterDescription: "Summarize biological functions and pathways enriched among TE Up and TE Down gene sets.",
    resultDescription: "Term-level enrichment results for Up and Down gene sets will appear here.",
    runLabel: "Run Enrichment",
    sections: [
      {
        title: "Gene Set Database",
        fields: [{ id: "enrichment_collection", label: "Collection", type: "select", value: "GO Biological Process", options: functionalCollections }]
      },
      {
        title: "Analysis Filters",
        fields: [
          { id: "enrichment_top_pathways", label: "Top Pathways", type: "number", value: "10", min: 1, max: 30, step: 1 },
          { id: "enrichment_sort_by", label: "Sort By", type: "select", value: "FDR", options: ["FDR", "Fold"] },
          { id: "enrichment_filtered_background", label: "Use Filtered Genes as Background", type: "select", value: "true", options: ["true", "false"] },
          { id: "enrichment_show_pathway_id", label: "Show Pathway IDs", type: "select", value: "false", options: ["true", "false"] },
          { id: "enrichment_remove_redundant", label: "Remove Redundant Gene Sets", type: "select", value: "false", options: ["true", "false"] }
        ]
      }
    ],
    resultViews: ["Enrichment Table"]
  },
  network: {
    id: "network",
    parameterTitle: "Network Settings",
    parameterDescription: "Explore coordinated gene patterns and configure the co-expression network canvas.",
    resultDescription: "The module graph and network summary will appear here after analysis completes.",
    runLabel: "Run Network",
    sections: [
      {
        title: "Network Settings",
        fields: [
          { id: "network_data_space", label: "Data Space", type: "select", value: "TE Ratio", options: dataSpaces },
          { id: "network_edge_threshold", label: "Edge Threshold", type: "number", value: "0.4", min: 0, max: 1, step: 0.05 },
          { id: "network_top_genes", label: "Top Genes", type: "number", value: "10", min: 10, max: 1000, step: 10 },
          { id: "network_variable_genes", label: "Most Variable Genes", type: "number", value: "1000", min: 50, max: 3000, step: 50 },
          { id: "network_module", label: "Module", type: "select", value: "Entire Network", options: ["Entire Network"] },
          { id: "network_soft_power", label: "Soft Threshold", type: "number", value: "5", min: 1, max: 20, step: 1 },
          { id: "network_min_module_size", label: "Min Module Size", type: "number", value: "20", min: 10, max: 100, step: 1 }
        ]
      }
    ],
    resultViews: ["Network Graph", "Module Summary"]
  },
  signalp: {
    id: "signalp",
    parameterTitle: "Annotation Source",
    parameterDescription: "Compare TE-defined gene groups against SignalP, TMHMM, and Phobius annotation resources.",
    resultDescription: "Signal peptide and membrane annotation summaries will appear here after analysis completes.",
    runLabel: "Run SignalP",
    sections: [
      {
        title: "Annotation Source",
        fields: [{ id: "signal_method", label: "Method", type: "select", value: "All", options: ["All", "SignalP", "TMHMM", "Phobius"] }]
      }
    ],
    resultViews: ["Group Comparison", "Annotation Table"]
  }
};

function collectionOptionsForSpecies(moduleId: string, speciesId?: string) {
  const optionsBySpecies = moduleId === "gsea" ? gseaCollectionsBySpecies : moduleId === "enrichment" ? enrichmentCollectionsBySpecies : null;
  if (!optionsBySpecies) {
    return null;
  }
  return optionsBySpecies[speciesId ?? ""] ?? optionsBySpecies.hg38;
}

function withSpeciesCollectionOptions(config: AnalysisModuleConfig, speciesId?: string): AnalysisModuleConfig {
  const options = collectionOptionsForSpecies(config.id, speciesId);
  if (!options) {
    return config;
  }

  return {
    ...config,
    sections: config.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => {
        const isCollectionField = field.id === "gsea_collection" || field.id === "enrichment_collection";
        if (!isCollectionField) {
          return field;
        }
        return {
          ...field,
          value: options[0] ?? String(field.value),
          options
        };
      })
    }))
  };
}

export function getAnalysisModuleConfig(moduleId: string, speciesId?: string) {
  const config = analysisModuleConfigs[moduleId] ?? null;
  return config ? withSpeciesCollectionOptions(config, speciesId) : null;
}
