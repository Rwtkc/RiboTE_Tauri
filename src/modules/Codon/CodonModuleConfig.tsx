import type { ReactElement } from "react";
import {
  BiasByGroupView,
  CbiAssociationsView,
  CodonEnrichmentShiftedView,
  CodonHeatmapView,
  CodonRunEnrichmentView,
  CodonRunZscoreView,
  InputSummaryView,
  PermutationSupportView,
  SelectedCodonAcrossGroupsView,
  SelectedCodonBurdenView,
  SelectedLoadEffectView,
  TeBiasSelectedLoadView,
  UsageByGroupView,
  UsageVsRnaView
} from "@/modules/Codon/CodonResultsViews";

export const CODON_GROUP_BY_CHILD: Record<string, string> = {
  input_and_usage: "Input and Usage",
  codon_bias: "Codon Bias",
  te_shift_and_enrichment: "TE Shift and Enrichment",
  pattern_views: "Pattern Views",
  codon_runs: "Codon Runs"
};

export const CODON_CHILD_RUN_LABEL: Record<string, string> = {
  input_and_usage: "Run Input and Usage",
  codon_bias: "Run Codon Bias",
  te_shift_and_enrichment: "Run TE Shift and Enrichment",
  pattern_views: "Run Pattern Views",
  codon_runs: "Run Codon Runs"
};

export const CODON_CHILD_REQUIRES_SELECTED_CODONS: Record<string, boolean> = {
  input_and_usage: true,
  codon_bias: false,
  te_shift_and_enrichment: true,
  pattern_views: true,
  codon_runs: true
};

export const CODON_VIEW_RENDERERS: Record<string, (viewConfig: any) => ReactElement> = {
  input_summary: (viewConfig) => <InputSummaryView viewConfig={viewConfig} />,
  selected_codon_usage: (viewConfig) => <UsageByGroupView viewConfig={viewConfig} />,
  selected_codon_vs_rna: (viewConfig) => <UsageVsRnaView viewConfig={viewConfig} />,
  cbi_tai_by_group: (viewConfig) => <BiasByGroupView viewConfig={viewConfig} />,
  cbi_associations: (viewConfig) => <CbiAssociationsView viewConfig={viewConfig} />,
  selected_codon_burden: (viewConfig) => <SelectedCodonBurdenView viewConfig={viewConfig} />,
  codon_enrichment_shifted: (viewConfig) => <CodonEnrichmentShiftedView viewConfig={viewConfig} />,
  selected_codon_across_groups: (viewConfig) => <SelectedCodonAcrossGroupsView viewConfig={viewConfig} />,
  permutation_support: (viewConfig) => <PermutationSupportView viewConfig={viewConfig} />,
  te_bias_selected_load: (viewConfig) => <TeBiasSelectedLoadView viewConfig={viewConfig} />,
  selected_load_effect: (viewConfig) => <SelectedLoadEffectView viewConfig={viewConfig} />,
  codon_clustering: (viewConfig) => <CodonHeatmapView viewConfig={viewConfig} />,
  codon_usage_heatmap: (viewConfig) => <CodonHeatmapView viewConfig={viewConfig} />,
  codon_run_zscore: (viewConfig) => <CodonRunZscoreView viewConfig={viewConfig} />,
  codon_run_enrichment: (viewConfig) => <CodonRunEnrichmentView viewConfig={viewConfig} />
};

export const SENSE_CODONS = [
  "AAA", "AAC", "AAG", "AAT", "ACA", "ACC", "ACG", "ACT",
  "AGA", "AGC", "AGG", "AGT", "ATA", "ATC", "ATG", "ATT",
  "CAA", "CAC", "CAG", "CAT", "CCA", "CCC", "CCG", "CCT",
  "CGA", "CGC", "CGG", "CGT", "CTA", "CTC", "CTG", "CTT",
  "GAA", "GAC", "GAG", "GAT", "GCA", "GCC", "GCG", "GCT",
  "GGA", "GGC", "GGG", "GGT", "GTA", "GTC", "GTG", "GTT",
  "TAC", "TAT", "TCA", "TCC", "TCG", "TCT", "TGC", "TGG",
  "TGT", "TTA", "TTC", "TTG", "TTT"
];

export function camelChartKey(viewId: string) {
  return viewId.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function normalizeDirection(value: string) {
  if (value === "TE Down") {
    return "Down";
  }
  if (value === "Both TE Groups") {
    return "Up and Down";
  }
  return "Up";
}

export function normalizeDisplayScope(value: string) {
  return value === "All Genes" ? "All" : "Obj";
}
