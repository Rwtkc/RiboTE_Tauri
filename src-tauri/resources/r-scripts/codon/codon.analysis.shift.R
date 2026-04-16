codon_effect_score <- function(log2_fc, pvalue = NA_real_, padj = NA_real_) {
  preferred_p <- ifelse(is.finite(padj) & padj > 0, padj, pvalue)
  preferred_p[!is.finite(preferred_p) | preferred_p <= 0] <- 1
  as.numeric(log2_fc) * (-log10(pmax(preferred_p, 1e-300)))
}

codon_group_metric_row <- function(metric_table, value_column, metric_label) {
  group_values <- lapply(codon_status_levels(), function(group_label) {
    as.numeric(metric_table[[value_column]][metric_table$TE_Status == group_label])
  })
  names(group_values) <- codon_status_levels()
  stats_by_group <- lapply(group_values, codon_box_stats)

  data.frame(
    Metric = metric_label,
    Genes_Measured = nrow(metric_table),
    Up_Median = stats_by_group$Up$median,
    Non_Median = stats_by_group$Non$median,
    Down_Median = stats_by_group$Down$median,
    Up_vs_Non_PValue = codon_wilcox_pvalue(group_values$Up, group_values$Non),
    Down_vs_Non_PValue = codon_wilcox_pvalue(group_values$Down, group_values$Non),
    stringsAsFactors = FALSE
  )
}

codon_group_metric_panel <- function(metric_table, value_column, metric_label, y_label, metric_id = NULL) {
  group_values <- lapply(codon_status_levels(), function(group_label) {
    as.numeric(metric_table[[value_column]][metric_table$TE_Status == group_label])
  })
  names(group_values) <- codon_status_levels()
  stats_by_group <- lapply(group_values, codon_box_stats)

  list(
    metricId = if (is.null(metric_id)) codon_safe_filename_token(metric_label, "metric") else metric_id,
    metricLabel = metric_label,
    yLabel = y_label,
    genesMeasured = nrow(metric_table),
    upVsNonPValue = unname(as.numeric(codon_wilcox_pvalue(group_values$Up, group_values$Non))),
    downVsNonPValue = unname(as.numeric(codon_wilcox_pvalue(group_values$Down, group_values$Non))),
    groups = lapply(codon_status_levels(), function(group_label) {
      stats_values <- stats_by_group[[group_label]]
      list(
        teGroup = group_label,
        n = unname(as.integer(stats_values$n)),
        min = unname(as.numeric(stats_values$min)),
        q1 = unname(as.numeric(stats_values$q1)),
        median = unname(as.numeric(stats_values$median)),
        q3 = unname(as.numeric(stats_values$q3)),
        max = unname(as.numeric(stats_values$max)),
        mean = unname(as.numeric(stats_values$mean))
      )
    })
  )
}

codon_gene_scatter_panel <- function(data_frame, panel_id, association_label, condition_label, x_label, y_label, raw_y_label) {
  displayed_table <- data.frame(
    GeneID = as.character(data_frame$GeneID),
    gene_name = as.character(data_frame$gene_name),
    TE_Status = as.character(data_frame$TE_Status),
    x = as.numeric(data_frame$x),
    y = as.numeric(data_frame$y),
    rawY = as.numeric(data_frame$rawY),
    stringsAsFactors = FALSE
  )
  displayed_table <- displayed_table[is.finite(displayed_table$x) & is.finite(displayed_table$y), , drop = FALSE]
  displayed_table <- displayed_table[order(displayed_table$x, displayed_table$y), , drop = FALSE]
  correlation_stats <- codon_correlation_stats(displayed_table$x, displayed_table$y)
  displayed_points <- codon_downsample_rows(displayed_table, limit = codon_scatter_display_limit())

  list(
    panelId = panel_id,
    associationLabel = association_label,
    conditionLabel = condition_label,
    xLabel = x_label,
    yLabel = y_label,
    rawYLabel = raw_y_label,
    geneCount = unname(as.integer(correlation_stats$geneCount)),
    displayedGeneCount = unname(as.integer(nrow(displayed_points))),
    correlation = unname(as.numeric(correlation_stats$correlation)),
    pValue = unname(as.numeric(correlation_stats$pValue)),
    slope = unname(as.numeric(correlation_stats$slope)),
    intercept = unname(as.numeric(correlation_stats$intercept)),
    points = lapply(seq_len(nrow(displayed_points)), function(index) {
      point_row <- displayed_points[index, , drop = FALSE]
      list(
        geneId = as.character(point_row$GeneID[[1]]),
        geneName = as.character(point_row$gene_name[[1]]),
        teGroup = as.character(point_row$TE_Status[[1]]),
        x = unname(as.numeric(point_row$x[[1]])),
        y = unname(as.numeric(point_row$y[[1]])),
        rawY = unname(as.numeric(point_row$rawY[[1]]))
      )
    })
  )
}

codon_build_enriched_codon_table <- function(base_context) {
  codon_table <- as.data.frame(base_context$codon_table, stringsAsFactors = FALSE)

  if (!nrow(codon_table)) {
    return(codon_table)
  }

  codon_dt <- data.table::as.data.table(codon_table)
  metric_columns <- c("count", "totalCodons", "frequency", "per1k")
  for (metric_name in metric_columns) {
    codon_dt[[metric_name]] <- as.numeric(codon_dt[[metric_name]])
  }

  gene_metrics <- as.data.frame(base_context$gene_table, stringsAsFactors = FALSE)[, c("GeneKey", "TE_log2FC", "pvalue", "padj"), drop = FALSE]
  codon_dt <- merge(codon_dt, gene_metrics, by = "GeneKey", all.x = TRUE)

  codon_stats <- codon_dt[, .(
    meanPer1k = mean(per1k, na.rm = TRUE),
    sdPer1k = stats::sd(per1k, na.rm = TRUE),
    totalCount = sum(count, na.rm = TRUE)
  ), by = "codon"]
  codon_dt <- merge(codon_dt, codon_stats, by = "codon", all.x = TRUE)

  total_codon_count <- sum(codon_stats$totalCount, na.rm = TRUE)
  codon_dt[, zscore := ifelse(is.finite(sdPer1k) & sdPer1k > 0, (per1k - meanPer1k) / sdPer1k, 0)]
  codon_dt[, enrichmentPValue := stats::phyper(
    q = pmax(count, 0),
    m = pmax(totalCount, 0),
    n = pmax(total_codon_count - totalCount, 0),
    k = pmax(totalCodons, 0),
    lower.tail = FALSE
  )]

  as.data.frame(codon_dt, stringsAsFactors = FALSE)
}

codon_build_selected_codon_burden <- function(scope_context, parameters) {
  scope_table <- as.data.frame(scope_context$gene_table, stringsAsFactors = FALSE)
  scope_table <- scope_table[is.finite(scope_table$selectedCodonPer1k) & is.finite(scope_table$TE_log2FC), , drop = FALSE]

  if (!nrow(scope_table)) {
    return(list(note = "No genes with selected-codon burden and TE-change measurements were available in the current scope.", panels = list(), rows = list()))
  }

  scope_table$x <- as.numeric(scope_table$selectedCodonPer1k)
  scope_table$y <- as.numeric(scope_table$TE_log2FC)
  scope_table$rawY <- scope_table$y
  panel <- codon_gene_scatter_panel(
    scope_table,
    panel_id = "selected_codon_burden",
    association_label = "Selected Codon Burden",
    condition_label = "Current Scope",
    x_label = "Selected Codon Load per 1k Codons",
    y_label = "TE log2 Fold Change",
    raw_y_label = "TE log2FC"
  )

  grouped_rows <- lapply(codon_status_levels(), function(group_label) {
    group_table <- scope_table[scope_table$TE_Status == group_label, , drop = FALSE]
    if (!nrow(group_table)) {
      return(NULL)
    }
    stats_values <- codon_correlation_stats(group_table$x, group_table$y)
    data.frame(
      Scope = scope_context$label,
      TE_Group = group_label,
      Genes_Measured = stats_values$geneCount,
      Displayed_Genes = min(stats_values$geneCount, codon_scatter_display_limit()),
      Pearson_R = stats_values$correlation,
      P_Value = stats_values$pValue,
      stringsAsFactors = FALSE
    )
  })
  grouped_rows <- Filter(Negate(is.null), grouped_rows)

  summary_rows <- rbind(
    data.frame(
      Scope = scope_context$label,
      TE_Group = "All",
      Genes_Measured = panel$geneCount,
      Displayed_Genes = panel$displayedGeneCount,
      Pearson_R = panel$correlation,
      P_Value = panel$pValue,
      stringsAsFactors = FALSE
    ),
    if (length(grouped_rows)) do.call(rbind, grouped_rows) else NULL
  )

  list(
    note = paste(
      sprintf("Current gene scope: %s.", scope_context$label),
      "Each point is one gene and selected-codon burden is summarized as total selected-codon counts per 1,000 CDS codons.",
      sprintf(
        "When more than %s genes are available, the plotted points are a deterministic display subset, but Pearson correlations still use the full gene set.",
        format(codon_scatter_display_limit(), big.mark = ",")
      )
    ),
    panels = list(panel),
    rows = codon_rows_payload(summary_rows)
  )
}

codon_build_selected_codon_across_groups <- function(scope_context) {
  scope_table <- as.data.frame(scope_context$gene_table, stringsAsFactors = FALSE)
  scope_table <- scope_table[is.finite(scope_table$selectedCodonPer1k), , drop = FALSE]

  if (!nrow(scope_table)) {
    return(list(note = "No selected-codon burden values were available in the current scope.", panels = list(), rows = list()))
  }

  summary_rows <- codon_group_metric_row(scope_table, "selectedCodonPer1k", "Selected Codon Load per 1k Codons")
  panel <- codon_group_metric_panel(
    scope_table,
    value_column = "selectedCodonPer1k",
    metric_label = "Selected Codon Load per 1k Codons",
    y_label = "Selected Codon Load per 1k Codons",
    metric_id = "selected_codon_across_groups"
  )

  list(
    note = paste(
      sprintf("Current gene scope: %s.", scope_context$label),
      "The distribution compares total selected-codon burden per gene across TE Up, unchanged, and TE Down groups."
    ),
    panels = list(panel),
    rows = codon_rows_payload(summary_rows)
  )
}

codon_build_selected_load_effect <- function(scope_context) {
  scope_table <- as.data.frame(scope_context$gene_table, stringsAsFactors = FALSE)
  scope_table$effectScore <- codon_effect_score(scope_table$TE_log2FC, scope_table$pvalue, scope_table$padj)
  scope_table <- scope_table[is.finite(scope_table$selectedCodonPer1k) & is.finite(scope_table$effectScore), , drop = FALSE]

  if (!nrow(scope_table)) {
    return(list(note = "No selected-codon load and TE effect-score pairs were available in the current scope.", panels = list(), rows = list()))
  }

  scope_table$x <- as.numeric(scope_table$selectedCodonPer1k)
  scope_table$y <- as.numeric(scope_table$effectScore)
  scope_table$rawY <- scope_table$y
  panel <- codon_gene_scatter_panel(
    scope_table,
    panel_id = "selected_load_effect",
    association_label = "Selected Codon Load",
    condition_label = "TE Effect Score",
    x_label = "Selected Codon Load per 1k Codons",
    y_label = "TE Effect Score",
    raw_y_label = "TE Effect Score"
  )

  summary_rows <- data.frame(
    Scope = scope_context$label,
    Genes_Measured = panel$geneCount,
    Displayed_Genes = panel$displayedGeneCount,
    Pearson_R = panel$correlation,
    P_Value = panel$pValue,
    stringsAsFactors = FALSE
  )

  list(
    note = paste(
      sprintf("Current gene scope: %s.", scope_context$label),
      "TE effect score is defined as TE log2 fold change multiplied by -log10(adjusted p-value), with raw p-value used only when adjusted p-values are unavailable.",
      sprintf(
        "When more than %s genes are available, the plotted points are a deterministic display subset, but Pearson correlations still use the full gene set.",
        format(codon_scatter_display_limit(), big.mark = ",")
      )
    ),
    panels = list(panel),
    rows = codon_rows_payload(summary_rows)
  )
}

codon_load_quantile_bins <- function(values, bin_count = 5L) {
  values <- as.numeric(values)
  finite_values <- values[is.finite(values)]

  if (!length(finite_values)) {
    return(rep(NA_character_, length(values)))
  }

  quantiles <- unique(stats::quantile(finite_values, probs = seq(0, 1, length.out = bin_count + 1L), na.rm = TRUE, names = FALSE))
  if (length(quantiles) < 2L) {
    return(rep("Load Bin 1", length(values)))
  }

  bin_ids <- cut(values, breaks = quantiles, include.lowest = TRUE, labels = FALSE)
  if (all(is.na(bin_ids))) {
    return(rep("Load Bin 1", length(values)))
  }

  paste("Load Bin", bin_ids)
}

codon_build_te_bias_selected_load <- function(scope_context) {
  scope_table <- as.data.frame(scope_context$gene_table, stringsAsFactors = FALSE)
  scope_table <- scope_table[is.finite(scope_table$selectedCodonPer1k), , drop = FALSE]

  if (nrow(scope_table) < 6L) {
    return(list(note = "At least six scoped genes are needed to summarize TE bias across selected-codon load bins.", panels = list(), rows = list()))
  }

  scope_table$loadBin <- codon_load_quantile_bins(scope_table$selectedCodonPer1k, bin_count = 5L)
  scope_table <- scope_table[!is.na(scope_table$loadBin), , drop = FALSE]
  load_bins <- unique(scope_table$loadBin)
  row_table <- do.call(rbind, lapply(load_bins, function(bin_label) {
    bin_table <- scope_table[scope_table$loadBin == bin_label, , drop = FALSE]
    if (!nrow(bin_table)) {
      return(NULL)
    }

    data.frame(
      Load_Bin = bin_label,
      Genes = nrow(bin_table),
      Min_Selected_Load = min(bin_table$selectedCodonPer1k, na.rm = TRUE),
      Max_Selected_Load = max(bin_table$selectedCodonPer1k, na.rm = TRUE),
      Median_Selected_Load = stats::median(bin_table$selectedCodonPer1k, na.rm = TRUE),
      Mean_TE_log2FC = mean(bin_table$TE_log2FC, na.rm = TRUE),
      Up_Fraction = mean(bin_table$TE_Status == "Up", na.rm = TRUE),
      Non_Fraction = mean(bin_table$TE_Status == "Non", na.rm = TRUE),
      Down_Fraction = mean(bin_table$TE_Status == "Down", na.rm = TRUE),
      stringsAsFactors = FALSE
    )
  }))
  if (is.null(row_table)) {
    row_table <- data.frame()
  }
  if (nrow(row_table)) {
    row_table <- row_table[order(row_table$Median_Selected_Load, row_table$Load_Bin), , drop = FALSE]
    row_table$Display_Label <- sprintf(
      "Q%s %s-%s",
      seq_len(nrow(row_table)),
      formatC(row_table$Min_Selected_Load, format = "f", digits = 1, big.mark = ","),
      formatC(row_table$Max_Selected_Load, format = "f", digits = 1, big.mark = ",")
    )
  }

  panel <- list(
    panelId = "te_bias_selected_load",
    title = "TE Bias Across Selected Codon Load",
    subtitle = sprintf("Current gene scope: %s | Genes binned by selected-codon load quantiles", scope_context$label),
    xLabel = "Selected Codon Load Bins",
    yLabel = "Fraction of Genes",
    bins = lapply(seq_len(nrow(row_table)), function(index) {
      row_values <- row_table[index, , drop = FALSE]
      list(
        label = as.character(row_values$Display_Label[[1]]),
        loadBin = as.character(row_values$Load_Bin[[1]]),
        loadRange = sprintf(
          "%s to %s per 1k codons",
          formatC(row_values$Min_Selected_Load[[1]], format = "f", digits = 1, big.mark = ","),
          formatC(row_values$Max_Selected_Load[[1]], format = "f", digits = 1, big.mark = ",")
        ),
        genes = unname(as.integer(row_values$Genes[[1]])),
        medianLoad = unname(as.numeric(row_values$Median_Selected_Load[[1]])),
        meanTeLog2Fc = unname(as.numeric(row_values$Mean_TE_log2FC[[1]])),
        fractions = list(
          list(group = "Up", value = unname(as.numeric(row_values$Up_Fraction[[1]]))),
          list(group = "Non", value = unname(as.numeric(row_values$Non_Fraction[[1]]))),
          list(group = "Down", value = unname(as.numeric(row_values$Down_Fraction[[1]])))
        )
      )
    })
  )

  list(
    note = paste(
      sprintf("Current gene scope: %s.", scope_context$label),
      "Genes are divided into quantile bins by selected-codon load per 1,000 CDS codons, and the line chart shows how TE-group composition changes across those bins."
    ),
    panels = list(panel),
    rows = codon_rows_payload(row_table)
  )
}

codon_build_codon_enrichment_shifted <- function(base_context, parameters) {
  enriched_table <- codon_build_enriched_codon_table(base_context)

  if (!nrow(enriched_table)) {
    return(list(note = "No codon enrichment statistics were available for the current analysis set.", panels = list(), rows = list()))
  }

  enriched_hits <- enriched_table[is.finite(enriched_table$enrichmentPValue) & enriched_table$enrichmentPValue < 0.01, , drop = FALSE]
  if (!nrow(enriched_hits)) {
    return(list(note = "No codon-level hypergeometric enrichment hits passed the current significance threshold in the representative CDS set.", panels = list(), rows = list()))
  }

  codon_summary <- data.table::as.data.table(enriched_hits)[, .(
    Up_Genes = sum(TE_Status == "Up", na.rm = TRUE),
    Non_Genes = sum(TE_Status == "Non", na.rm = TRUE),
    Down_Genes = sum(TE_Status == "Down", na.rm = TRUE),
    Shifted_Genes = sum(TE_Status %in% c("Up", "Down"), na.rm = TRUE),
    Genes_With_Hits = data.table::uniqueN(GeneKey)
  ), by = "codon"]
  codon_summary[, Log2_Up_vs_Down := log2((Up_Genes + 1) / (Down_Genes + 1))]
  codon_summary[, Shifted_Fraction := Shifted_Genes / pmax(Genes_With_Hits, 1)]
  codon_summary[, Selected := codon %in% parameters$codon_select]
  codon_summary <- codon_summary[order(-abs(Log2_Up_vs_Down), -Shifted_Fraction, codon)]

  display_rows <- utils::head(codon_summary, 18L)
  panel <- list(
    panelId = "codon_enrichment_shifted",
    title = "Codon Enrichment in TE-Shifted Genes",
    subtitle = "Codons are ranked by the absolute TE Up vs TE Down enrichment contrast among codon-level hypergeometric hits.",
    xLabel = "log2(TE Up hits / TE Down hits)",
    points = lapply(seq_len(nrow(display_rows)), function(index) {
      row_values <- display_rows[index, , drop = FALSE]
      list(
        label = as.character(row_values$codon[[1]]),
        value = unname(as.numeric(row_values$Log2_Up_vs_Down[[1]])),
        shiftedFraction = unname(as.numeric(row_values$Shifted_Fraction[[1]])),
        selected = isTRUE(row_values$Selected[[1]])
      )
    })
  )

  list(
    note = paste(
      "Codon-level enrichment is tested per gene using a hypergeometric model over CDS codon counts.",
      "This view ranks codons by how strongly their significant hits tilt toward TE Up or TE Down genes; selected codons are highlighted."
    ),
    panels = list(panel),
    rows = codon_rows_payload(as.data.frame(codon_summary, stringsAsFactors = FALSE))
  )
}

codon_build_permutation_support <- function(base_context, scope_context, parameters) {
  enriched_table <- codon_build_enriched_codon_table(base_context)
  scope_genes <- as.data.frame(scope_context$gene_table, stringsAsFactors = FALSE)

  if (!nrow(enriched_table) || !nrow(scope_genes) || !length(parameters$codon_select)) {
    return(list(note = "Permutation support requires selected codons plus scoped genes with codon-enrichment statistics.", panels = list(), rows = list()))
  }

  selected_hits <- enriched_table[
    enriched_table$GeneKey %in% scope_genes$GeneKey &
      enriched_table$codon %in% parameters$codon_select &
      is.finite(enriched_table$enrichmentPValue) &
      enriched_table$enrichmentPValue < 0.01,
    ,
    drop = FALSE
  ]
  selected_gene_keys <- unique(as.character(selected_hits$GeneKey))

  if (!length(selected_gene_keys)) {
    return(list(note = "No scoped genes passed the selected-codon enrichment threshold, so permutation support could not be summarized.", panels = list(), rows = list()))
  }

  sampled_scope <- scope_genes[match(selected_gene_keys, scope_genes$GeneKey), , drop = FALSE]
  sampled_scope <- sampled_scope[!is.na(sampled_scope$GeneKey), , drop = FALSE]
  sample_size <- nrow(sampled_scope)
  status_vector <- as.character(scope_genes$TE_Status)

  observed_up_down <- (sum(sampled_scope$TE_Status == "Up", na.rm = TRUE) + 1) / (sum(sampled_scope$TE_Status == "Down", na.rm = TRUE) + 1)
  observed_shifted <- mean(sampled_scope$TE_Status %in% c("Up", "Down"), na.rm = TRUE)

  set.seed(abs(stats::na.omit(c(
    nchar(base_context$source_signature),
    sample_size,
    sum(utf8ToInt(paste(parameters$codon_select, collapse = "")))
  ))[1]))
  permutation_values <- replicate(codon_permutation_iterations(), {
    sampled_status <- sample(status_vector, size = sample_size, replace = FALSE)
    c(
      upDownRatio = (sum(sampled_status == "Up", na.rm = TRUE) + 1) / (sum(sampled_status == "Down", na.rm = TRUE) + 1),
      shiftedFraction = mean(sampled_status %in% c("Up", "Down"), na.rm = TRUE)
    )
  })
  permutation_table <- data.frame(
    upDownRatio = as.numeric(permutation_values["upDownRatio", ]),
    shiftedFraction = as.numeric(permutation_values["shiftedFraction", ])
  )

  summary_rows <- data.frame(
    Metric = c("Up vs Down Ratio", "Shifted Gene Fraction"),
    Observed = c(observed_up_down, observed_shifted),
    Permutation_Mean = c(mean(permutation_table$upDownRatio, na.rm = TRUE), mean(permutation_table$shiftedFraction, na.rm = TRUE)),
    Empirical_PValue = c(
      mean(permutation_table$upDownRatio >= observed_up_down, na.rm = TRUE),
      mean(permutation_table$shiftedFraction >= observed_shifted, na.rm = TRUE)
    ),
    Iterations = codon_permutation_iterations(),
    stringsAsFactors = FALSE
  )

  build_hist_panel <- function(metric_name, values, observed_value, x_label) {
    breaks <- pretty(values, n = 24)
    bins <- hist(values, breaks = breaks, plot = FALSE)
    list(
      panelId = codon_safe_filename_token(metric_name, "permutation_support"),
      title = metric_name,
      subtitle = sprintf("Observed value is shown against %s deterministic permutations.", format(codon_permutation_iterations(), big.mark = ",")),
      xLabel = x_label,
      observedValue = observed_value,
      bins = lapply(seq_along(bins$counts), function(index) {
        list(
          x0 = unname(as.numeric(bins$breaks[[index]])),
          x1 = unname(as.numeric(bins$breaks[[index + 1L]])),
          count = unname(as.integer(bins$counts[[index]]))
        )
      })
    )
  }

  list(
    note = paste(
      sprintf("Current gene scope: %s.", scope_context$label),
      "Observed selected-codon enrichment hits are compared with deterministic random gene sets of the same size drawn from the current scope."
    ),
    panels = list(
      build_hist_panel("Permutation Support for Up vs Down Ratio", permutation_table$upDownRatio, observed_up_down, "Randomized Up vs Down Ratio"),
      build_hist_panel("Permutation Support for Shifted Gene Fraction", permutation_table$shiftedFraction, observed_shifted, "Randomized Shifted Gene Fraction")
    ),
    rows = codon_rows_payload(summary_rows)
  )
}
