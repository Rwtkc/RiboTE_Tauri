codon_count_selected_runs <- function(codon_sequence_string, selected_codons, run_length = 1L) {
  if (is.null(codon_sequence_string) || !nzchar(as.character(codon_sequence_string)) || run_length <= 0L) {
    return(0)
  }

  codon_values <- strsplit(as.character(codon_sequence_string), " ", fixed = TRUE)[[1]]
  codon_values <- codon_values[nzchar(codon_values)]
  if (length(codon_values) < run_length) {
    return(0)
  }

  max_start <- length(codon_values) - run_length + 1L
  sum(vapply(seq_len(max_start), function(start_index) {
    all(codon_values[start_index:(start_index + run_length - 1L)] %in% selected_codons)
  }, logical(1)))
}

codon_count_selected_runs_all_lengths <- function(codon_sequence_string, selected_codons, max_run_length = 3L) {
  if (is.null(codon_sequence_string) || !nzchar(as.character(codon_sequence_string)) || max_run_length <= 0L) {
    return(rep(0, max_run_length))
  }

  codon_values <- strsplit(as.character(codon_sequence_string), " ", fixed = TRUE)[[1]]
  codon_values <- codon_values[nzchar(codon_values)]
  if (!length(codon_values)) {
    return(rep(0, max_run_length))
  }

  run_lengths <- rep(0, max_run_length)
  selected_mask <- codon_values %in% selected_codons
  if (!any(selected_mask)) {
    return(run_lengths)
  }

  mask_runs <- rle(selected_mask)
  true_lengths <- mask_runs$lengths[mask_runs$values]
  if (!length(true_lengths)) {
    return(run_lengths)
  }

  for (run_length in seq_len(max_run_length)) {
    run_lengths[[run_length]] <- sum(pmax(true_lengths - run_length + 1L, 0L))
  }

  run_lengths
}

codon_build_run_load_table <- function(scope_context, parameters) {
  if (!length(parameters$codon_select)) {
    return(data.frame())
  }

  scope_table <- as.data.frame(scope_context$gene_table, stringsAsFactors = FALSE)
  if (!nrow(scope_table) || !"codonSequence" %in% colnames(scope_table)) {
    return(data.frame())
  }

  run_count_matrix <- t(vapply(
    scope_table$codonSequence,
    codon_count_selected_runs_all_lengths,
    numeric(3),
    selected_codons = parameters$codon_select,
    max_run_length = 3L
  ))

  build_length_table <- function(run_length) {
    run_counts <- as.numeric(run_count_matrix[, run_length])
    total_codons <- pmax(as.numeric(scope_table$totalCodons), 1)
    run_per1k <- (run_counts * 1000) / total_codons
    mean_run <- mean(run_per1k, na.rm = TRUE)
    sd_run <- stats::sd(run_per1k, na.rm = TRUE)
    run_zscore <- if (is.finite(sd_run) && sd_run > 0) (run_per1k - mean_run) / sd_run else rep(0, length(run_per1k))

    data.frame(
      Run_Length = run_length,
      Run_Label = c("Single", "Double", "Triple")[run_length],
      GeneID = as.character(scope_table$GeneID),
      gene_name = as.character(scope_table$gene_name),
      TE_Status = as.character(scope_table$TE_Status),
      selectedRunCount = run_counts,
      selectedRunPer1k = run_per1k,
      selectedRunZScore = run_zscore,
      stringsAsFactors = FALSE
    )
  }

  do.call(rbind, lapply(1:3, build_length_table))
}

codon_build_codon_run_zscore <- function(scope_context, parameters) {
  run_table <- codon_build_run_load_table(scope_context, parameters)
  run_table <- run_table[is.finite(run_table$selectedRunPer1k) & is.finite(run_table$selectedRunZScore), , drop = FALSE]

  if (!nrow(run_table)) {
    return(list(note = "Selected codon runs could not be summarized from the current representative CDS set.", panels = list(), rows = list()))
  }

  panels <- lapply(split(run_table, run_table$Run_Label), function(run_subset) {
    run_subset$x <- run_subset$selectedRunPer1k
    run_subset$y <- run_subset$selectedRunZScore
    run_subset$rawY <- run_subset$selectedRunZScore
    codon_gene_scatter_panel(
      run_subset,
      panel_id = sprintf("codon_run_zscore_%s", codon_safe_filename_token(run_subset$Run_Label[[1]], "run")),
      association_label = sprintf("%s Selected-codon Runs", run_subset$Run_Label[[1]]),
      condition_label = "Load vs Usage Z-score",
      x_label = "Selected-codon Run Load per 1k Codons",
      y_label = "Selected-codon Run Z-score",
      raw_y_label = "Run Z-score"
    )
  })
  panels <- unname(panels)

  summary_rows <- do.call(rbind, lapply(split(run_table, run_table$Run_Label), function(run_subset) {
    correlation_stats <- codon_correlation_stats(run_subset$selectedRunPer1k, run_subset$selectedRunZScore)
    data.frame(
      Run_Length = run_subset$Run_Label[[1]],
      Genes_Measured = correlation_stats$geneCount,
      Displayed_Genes = min(correlation_stats$geneCount, codon_scatter_display_limit()),
      Pearson_R = correlation_stats$correlation,
      P_Value = correlation_stats$pValue,
      stringsAsFactors = FALSE
    )
  }))

  list(
    note = paste(
      sprintf("Current gene scope: %s.", scope_context$label),
      "Single, double, and triple selected-codon runs are counted directly from the representative CDS sequence of each gene.",
      sprintf(
        "When more than %s genes are available for one run-length panel, the plotted points are a deterministic display subset, but Pearson correlations still use the full gene set.",
        format(codon_scatter_display_limit(), big.mark = ",")
      )
    ),
    panels = panels,
    rows = codon_rows_payload(summary_rows)
  )
}

codon_build_codon_run_enrichment <- function(scope_context, parameters) {
  run_table <- codon_build_run_load_table(scope_context, parameters)
  run_table <- run_table[is.finite(run_table$selectedRunPer1k), , drop = FALSE]

  if (!nrow(run_table)) {
    return(list(note = "Selected codon runs could not be summarized from the current representative CDS set.", panels = list(), rows = list()))
  }

  panels <- lapply(split(run_table, run_table$Run_Label), function(run_subset) {
    codon_group_metric_panel(
      run_subset,
      value_column = "selectedRunPer1k",
      metric_label = sprintf("%s Selected-codon Run Load per 1k Codons", run_subset$Run_Label[[1]]),
      y_label = "Selected-codon Run Load per 1k Codons",
      metric_id = sprintf("codon_run_enrichment_%s", codon_safe_filename_token(run_subset$Run_Label[[1]], "run"))
    )
  })
  panels <- unname(panels)

  summary_rows <- do.call(rbind, lapply(split(run_table, run_table$Run_Label), function(run_subset) {
    codon_group_metric_row(
      run_subset,
      value_column = "selectedRunPer1k",
      metric_label = sprintf("%s Selected-codon Run Load per 1k Codons", run_subset$Run_Label[[1]])
    )
  }))

  list(
    note = paste(
      sprintf("Current gene scope: %s.", scope_context$label),
      "Run load distributions compare the total abundance of single-, double-, and triple-selected-codon runs across TE groups."
    ),
    panels = panels,
    rows = codon_rows_payload(summary_rows)
  )
}

codon_compute_shift_context <- function(base_context, parameters) {
  scope_context <- codon_build_scope_table(base_context, parameters)

  list(
    source_signature = base_context$source_signature,
    parameters = parameters,
    scope_context = scope_context,
    results = list(
      views = codon_views_payload(),
      selectedCodonBurden = codon_build_selected_codon_burden(scope_context, parameters),
      codonEnrichmentShifted = codon_build_codon_enrichment_shifted(base_context, parameters),
      selectedCodonAcrossGroups = codon_build_selected_codon_across_groups(scope_context),
      permutationSupport = codon_build_permutation_support(base_context, scope_context, parameters),
      teBiasSelectedLoad = codon_build_te_bias_selected_load(scope_context),
      selectedLoadEffect = codon_build_selected_load_effect(scope_context)
    )
  )
}

codon_compute_pattern_context <- function(base_context, parameters) {
  scope_context <- codon_build_scope_table(base_context, parameters)

  list(
    source_signature = base_context$source_signature,
    parameters = parameters,
    scope_context = scope_context,
    results = list(
      views = codon_views_payload(),
      codonClustering = codon_build_codon_clustering(base_context, scope_context, parameters),
      codonUsageHeatmap = codon_build_codon_usage_heatmap(base_context, scope_context, parameters)
    )
  )
}

codon_compute_run_context <- function(base_context, parameters) {
  scope_context <- codon_build_scope_table(base_context, parameters)

  list(
    source_signature = base_context$source_signature,
    parameters = parameters,
    scope_context = scope_context,
    results = list(
      views = codon_views_payload(),
      codonRunZscore = codon_build_codon_run_zscore(scope_context, parameters),
      codonRunEnrichment = codon_build_codon_run_enrichment(scope_context, parameters)
    )
  )
}
