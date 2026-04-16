codon_views_payload <- function() {
  config <- codon_module_config()

  lapply(config$views, function(view) {
    list(
      id = as.character(view$id),
      title = as.character(view$title),
      description = as.character(view$description),
      group = as.character(view$group),
      implemented = view$id %in% codon_supported_result_views()
    )
  })
}

codon_view_group <- function(view = "input_summary") {
  active_view <- codon_normalize_result_view(view)
  config <- codon_module_config()
  matched_view <- NULL

  for (view_config in config$views) {
    if (identical(as.character(view_config$id), active_view)) {
      matched_view <- view_config
      break
    }
  }

  if (!is.null(matched_view) && !is.null(matched_view$group) && nzchar(as.character(matched_view$group))) {
    return(as.character(matched_view$group))
  }

  "Input and Usage"
}

codon_sections_for_group <- function(group = "Input and Usage") {
  normalized_group <- trimws(as.character(group))

  if (identical(normalized_group, "Input and Usage")) {
    return(codon_module_config()$sections)
  }

  list()
}

codon_sidebar_profile <- function(group = "Input and Usage") {
  profiles <- list(
    "Input and Usage" = list(
      eyebrow = "Codon Usage and Bias",
      title = "Codon Usage",
      description = paste(
        "Examine selected codon usage and transcript-level codon bias features within",
        "TE-defined gene groups using representative coding sequences and local adaptation",
        "resources for the current species."
      ),
      note = NULL
    ),
    "Codon Bias" = list(
      eyebrow = "Codon Bias and Adaptation",
      title = "Codon Bias",
      description = paste(
        "Compare Codon Bias Index and tRNA adaptation patterns across TE-defined gene groups",
        "using the representative transcripts prepared for the current analysis set."
      ),
      note = "No additional setup is required here. Run Codon Bias to summarize transcript-level codon bias and adaptation metrics from the current TE result set."
    ),
    "TE Shift and Enrichment" = list(
      eyebrow = "TE-Shifted Codon Signals",
      title = "TE Shift and Enrichment",
      description = paste(
        "Inspect how selected codons concentrate in genes with TE increases or decreases,",
        "and relate codon burden to the strength of translational change."
      ),
      note = "Run TE Shift and Enrichment to prepare burden, enrichment, permutation-support, and TE-bias views from the current codon analysis set."
    ),
    "Pattern Views" = list(
      eyebrow = "Codon Pattern Views",
      title = "Pattern Views",
      description = paste(
        "Explore broader codon-usage structures such as co-usage patterns and heatmap-style",
        "views across genes in the current Translation Efficiency result set."
      ),
      note = "Run Pattern Views to prepare clustered codon co-usage and codon-usage z-score heatmaps from the current analysis set."
    ),
    "Codon Runs" = list(
      eyebrow = "Codon Run Analysis",
      title = "Codon Runs",
      description = paste(
        "Assess whether single-, double-, or triple-codon runs track with codon-usage bias",
        "and TE-related gene behavior."
      ),
      note = "Run Codon Runs to summarize selected-codon single, double, and triple run loads across the current representative CDS set."
    )
  )

  resolved_group <- trimws(as.character(group))
  matched <- profiles[[resolved_group]]

  if (is.null(matched)) {
    return(profiles[["Input and Usage"]])
  }

  matched
}

codon_compute_context <- function(base_context, parameters) {
  scope_context <- codon_build_scope_table(base_context, parameters)
  selected_count <- length(parameters$codon_select)
  genes_ready <- nrow(base_context$gene_table)
  genes_in_scope <- nrow(scope_context$gene_table)
  genes_with_selected_codons <- if (selected_count) sum(scope_context$gene_table$selectedCodonCount > 0, na.rm = TRUE) else 0L

  list(
    source_signature = base_context$source_signature,
    parameters = parameters,
    scope_context = scope_context,
    metrics = list(
      list(label = "Codon-Ready Genes", value = format(genes_ready, big.mark = ",")),
      list(label = "Current Scope", value = format(genes_in_scope, big.mark = ",")),
      list(label = "Selected Codons", value = format(selected_count, big.mark = ",")),
      list(label = "Genes With Selected Codons", value = format(genes_with_selected_codons, big.mark = ","))
    ),
    results = list(
      note = scope_context$note,
      selectedCodons = as.list(parameters$codon_select),
      geneScopeLabel = scope_context$label,
      teGroupFocus = parameters$codon_direction,
      views = codon_views_payload(),
      inputSummary = codon_build_input_summary(scope_context, parameters),
      selectedCodonUsage = codon_build_selected_usage(scope_context, base_context, parameters),
      selectedCodonVsRna = codon_build_selected_vs_rna(scope_context, base_context, parameters),
      cbiTaiByGroup = list(),
      cbiAssociations = list()
    )
  )
}

codon_compute_bias_context <- function(base_context, upload_context) {
  list(
    source_signature = base_context$source_signature,
    results = list(
      views = codon_views_payload(),
      cbiTaiByGroup = codon_build_cbi_tai_by_group(base_context, upload_context),
      cbiAssociations = codon_build_cbi_associations(base_context, upload_context)
    )
  )
}

codon_merge_workspace_contexts <- function(
  usage_context = NULL,
  bias_context = NULL,
  shift_context = NULL,
  pattern_context = NULL,
  run_context = NULL
) {
  if (is.null(usage_context) && is.null(bias_context) && is.null(shift_context) && is.null(pattern_context) && is.null(run_context)) {
    return(NULL)
  }

  reference_context <- Filter(Negate(is.null), list(usage_context, bias_context, shift_context, pattern_context, run_context))[[1]]
  parameter_context <- Filter(Negate(is.null), list(usage_context, shift_context, pattern_context, run_context))
  scope_contexts <- Filter(Negate(is.null), list(usage_context, shift_context, pattern_context, run_context))
  merged_context <- list(
    source_signature = reference_context$source_signature,
    parameters = if (length(parameter_context)) parameter_context[[1]]$parameters else NULL,
    scope_context = if (length(scope_contexts)) scope_contexts[[1]]$scope_context else NULL,
    metrics = if (!is.null(usage_context)) usage_context$metrics else list(),
    results = list(
      views = codon_views_payload(),
      selectedCodons = if (!is.null(usage_context)) usage_context$results$selectedCodons else list(),
      geneScopeLabel = if (!is.null(usage_context)) usage_context$results$geneScopeLabel else NULL,
      teGroupFocus = if (!is.null(usage_context)) usage_context$results$teGroupFocus else NULL,
      inputSummary = if (!is.null(usage_context)) usage_context$results$inputSummary else list(),
      selectedCodonUsage = if (!is.null(usage_context)) usage_context$results$selectedCodonUsage else list(),
      selectedCodonVsRna = if (!is.null(usage_context)) usage_context$results$selectedCodonVsRna else list(),
      cbiTaiByGroup = if (!is.null(bias_context)) bias_context$results$cbiTaiByGroup else list(),
      cbiAssociations = if (!is.null(bias_context)) bias_context$results$cbiAssociations else list(),
      selectedCodonBurden = if (!is.null(shift_context)) shift_context$results$selectedCodonBurden else list(),
      codonEnrichmentShifted = if (!is.null(shift_context)) shift_context$results$codonEnrichmentShifted else list(),
      selectedCodonAcrossGroups = if (!is.null(shift_context)) shift_context$results$selectedCodonAcrossGroups else list(),
      permutationSupport = if (!is.null(shift_context)) shift_context$results$permutationSupport else list(),
      teBiasSelectedLoad = if (!is.null(shift_context)) shift_context$results$teBiasSelectedLoad else list(),
      selectedLoadEffect = if (!is.null(shift_context)) shift_context$results$selectedLoadEffect else list(),
      codonClustering = if (!is.null(pattern_context)) pattern_context$results$codonClustering else list(),
      codonUsageHeatmap = if (!is.null(pattern_context)) pattern_context$results$codonUsageHeatmap else list(),
      codonRunZscore = if (!is.null(run_context)) run_context$results$codonRunZscore else list(),
      codonRunEnrichment = if (!is.null(run_context)) run_context$results$codonRunEnrichment else list()
    )
  )

  merged_context
}

codon_view_has_data <- function(context, view = "input_summary") {
  if (is.null(context) || !is.list(context)) {
    return(FALSE)
  }

  active_view <- codon_normalize_result_view(view)

  switch(
    active_view,
    input_summary = !is.null(context$scope_context),
    selected_codon_usage = length(context$results$selectedCodonUsage$rows) > 0L,
    selected_codon_vs_rna = length(context$results$selectedCodonVsRna$rows) > 0L,
    cbi_tai_by_group = length(context$results$cbiTaiByGroup$rows) > 0L,
    cbi_associations = length(context$results$cbiAssociations$rows) > 0L,
    selected_codon_burden = length(context$results$selectedCodonBurden$rows) > 0L,
    codon_enrichment_shifted = length(context$results$codonEnrichmentShifted$rows) > 0L,
    selected_codon_across_groups = length(context$results$selectedCodonAcrossGroups$rows) > 0L,
    permutation_support = length(context$results$permutationSupport$rows) > 0L,
    te_bias_selected_load = length(context$results$teBiasSelectedLoad$rows) > 0L,
    selected_load_effect = length(context$results$selectedLoadEffect$rows) > 0L,
    codon_clustering = length(context$results$codonClustering$rows) > 0L || length(context$results$codonClustering$panels) > 0L,
    codon_usage_heatmap = length(context$results$codonUsageHeatmap$rows) > 0L || length(context$results$codonUsageHeatmap$panels) > 0L,
    codon_run_zscore = length(context$results$codonRunZscore$rows) > 0L,
    codon_run_enrichment = length(context$results$codonRunEnrichment$rows) > 0L,
    FALSE
  )
}

codon_results_payload <- function(context) {
  context$results
}

codon_module_config <- function() {
  ribote_build_module_config(
    key = "codon",
    title = "Codon Usage",
    eyebrow = "Codon Usage and Bias",
    description = paste(
      "Examine selected codon usage and transcript-level codon bias features within TE-defined gene groups",
      "using representative coding sequences and local adaptation resources for the current species."
    ),
    requires = "te",
    run_label = "Run Input and Usage",
    sections = list(
      list(
        title = "Codon Analysis Setup",
        fields = list(
          ribote_field("codon_select", "Selected Codons", "codon_picker", list(), options = codon_sense_options(), placeholder = "Select codons"),
          ribote_field(
            "codon_direction",
            "TE Group Focus",
            "select",
            "Up",
            options = list(
              ribote_choice("TE Up", "Up"),
              ribote_choice("TE Down", "Down"),
              ribote_choice("Both TE Groups", "Up and Down")
            )
          ),
          ribote_field(
            "codon_display",
            "Gene Scope",
            "select",
            "Obj",
            options = list(
              ribote_choice("Selected-Codon Genes", "Obj"),
              ribote_choice("All Genes", "All")
            )
          )
        )
      )
    ),
    views = list(
      list(id = "input_summary", title = "Input Summary", description = "Preview the codon-ready gene table prepared from the current Translation Efficiency result set.", group = "Input and Usage"),
      list(id = "selected_codon_usage", title = "Selected Codon Usage by TE Group", description = "Compare how the selected codons are used across TE-up, unchanged, and TE-down gene groups.", group = "Input and Usage"),
      list(id = "selected_codon_vs_rna", title = "Selected Codon Usage vs RNA Abundance", description = "Inspect how selected codon usage relates to RNA abundance across the current samples.", group = "Input and Usage"),
      list(id = "cbi_tai_by_group", title = "Codon Bias and Adaptation by TE Group", description = "Summarize codon bias index and tRNA adaptation trends across TE-defined gene groups.", group = "Codon Bias"),
      list(id = "cbi_associations", title = "CBI Associations", description = "Relate codon bias index values to RNA abundance or translation efficiency measurements.", group = "Codon Bias"),
      list(id = "selected_codon_burden", title = "Selected Codon Burden vs TE Change", description = "Compare selected codon burden metrics against the magnitude of TE change.", group = "TE Shift and Enrichment"),
      list(id = "codon_enrichment_shifted", title = "Codon Enrichment in TE-Shifted Genes", description = "Highlight codons that are more strongly represented among genes with TE increases or decreases.", group = "TE Shift and Enrichment"),
      list(id = "selected_codon_across_groups", title = "Selected Codon Burden Across TE Groups", description = "Compare the overall frequency of the selected codons between TE-up, unchanged, and TE-down genes.", group = "TE Shift and Enrichment"),
      list(id = "codon_clustering", title = "Codon Co-usage Clustering", description = "Group codons by similar usage patterns across genes using a codon-usage clustering view.", group = "Pattern Views"),
      list(id = "permutation_support", title = "Permutation Support for Codon Enrichment", description = "Compare observed codon enrichment patterns against random background sampling.", group = "TE Shift and Enrichment"),
      list(id = "te_bias_selected_load", title = "TE Bias Across Selected Codon Load", description = "Track how TE-group bias changes as the burden of the selected codons increases.", group = "TE Shift and Enrichment"),
      list(id = "selected_load_effect", title = "Selected Codon Load vs TE Effect Score", description = "Relate selected codon load to a combined score reflecting TE-change magnitude and significance.", group = "TE Shift and Enrichment"),
      list(id = "codon_run_zscore", title = "Codon Run Load vs Usage Z-score", description = "Examine whether single-, double-, and triple-codon runs track with codon-usage z-score behavior.", group = "Codon Runs"),
      list(id = "codon_run_enrichment", title = "Codon Run Enrichment by TE Group", description = "Compare codon-run abundance patterns across TE-up, unchanged, and TE-down gene groups.", group = "Codon Runs"),
      list(id = "codon_usage_heatmap", title = "Codon Usage Z-score Heatmap", description = "Show a codon-by-gene heatmap of codon-usage z-score patterns.", group = "Pattern Views")
    ),
    result_metrics = list(),
    empty_message = "",
    success_message = NULL,
    wide_sidebar = TRUE,
    show_export_panel = TRUE,
    blank_analysis_panel = TRUE,
    show_snapshot_panel = TRUE,
    show_parameter_snapshot = FALSE,
    show_analysis_summary = FALSE,
    show_canvas_status = FALSE,
    show_view_badge = FALSE,
    show_placeholder_view_content = FALSE,
    intro_copy = ""
  )
}
