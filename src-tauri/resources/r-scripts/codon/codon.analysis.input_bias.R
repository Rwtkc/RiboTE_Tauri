codon_input_summary_table <- function(scope_context) {
  scope_table <- as.data.frame(scope_context$gene_table, stringsAsFactors = FALSE)

  if (!nrow(scope_table)) {
    summary_table <- scope_table
  } else {
    sort_metric <- if ("TE_log2FC" %in% colnames(scope_table)) abs(as.numeric(scope_table$TE_log2FC)) else seq_len(nrow(scope_table))
    preview_index <- order(sort_metric, decreasing = TRUE, na.last = TRUE)
    summary_table <- scope_table[preview_index, c(
      "GeneID", "gene_name", "TE_Status", "RNA_Control_Mean", "RNA_Treatment_Mean",
      "totalCodons", "selectedCodonCount", "selectedCodonPer1k", "selectedCodonFrequency"
    ), drop = FALSE]
  }

  colnames(summary_table) <- c(
    "GeneID",
    "Gene_Name",
    "TE_Group",
    "RNA_Control_Mean",
    "RNA_Treatment_Mean",
    "Total_Codons",
    "Selected_Codon_Count",
    "Selected_Codon_per_1k",
    "Selected_Codon_Frequency"
  )

  summary_table$Selected_Codon_Frequency <- summary_table$Selected_Codon_Frequency * 100
  summary_table
}

codon_build_input_summary <- function(scope_context, parameters) {
  summary_table <- codon_input_summary_table(scope_context)
  preview_table <- utils::head(summary_table, codon_input_preview_limit())

  list(
    note = paste(
      "Each gene is represented by one protein-coding transcript from the local reference annotation,",
      "so codon usage reflects CDS composition for that representative transcript rather than isoform mixtures."
    ),
    scopeLabel = scope_context$label,
    previewLimit = codon_input_preview_limit(),
    totalRows = nrow(scope_context$gene_table),
    previewRows = nrow(preview_table),
    selectedCodons = as.list(parameters$codon_select),
    rows = codon_rows_payload(preview_table)
  )
}

codon_usage_summary_row <- function(codon_value, codon_table) {
  group_values <- lapply(codon_status_levels(), function(group_label) as.numeric(codon_table$frequency[codon_table$TE_Status == group_label]) * 100)
  names(group_values) <- codon_status_levels()

  stats_by_group <- lapply(group_values, codon_box_stats)
  up_pvalue <- codon_wilcox_pvalue(group_values$Up, group_values$Non)
  down_pvalue <- codon_wilcox_pvalue(group_values$Down, group_values$Non)

  data.frame(
    Codon = codon_value,
    Genes_Measured = nrow(codon_table),
    Up_Median_Percent = stats_by_group$Up$median,
    Non_Median_Percent = stats_by_group$Non$median,
    Down_Median_Percent = stats_by_group$Down$median,
    Up_vs_Non_PValue = up_pvalue,
    Down_vs_Non_PValue = down_pvalue,
    stringsAsFactors = FALSE
  )
}

codon_usage_panel_payload <- function(codon_value, codon_table) {
  group_values <- lapply(codon_status_levels(), function(group_label) as.numeric(codon_table$frequency[codon_table$TE_Status == group_label]) * 100)
  names(group_values) <- codon_status_levels()

  stats_by_group <- lapply(group_values, codon_box_stats)
  up_pvalue <- codon_wilcox_pvalue(group_values$Up, group_values$Non)
  down_pvalue <- codon_wilcox_pvalue(group_values$Down, group_values$Non)

  list(
    codon = codon_value,
    genesMeasured = nrow(codon_table),
    upVsNonPValue = unname(up_pvalue),
    downVsNonPValue = unname(down_pvalue),
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

codon_build_selected_usage <- function(scope_context, base_context, parameters) {
  if (!length(parameters$codon_select)) {
    return(list(note = "Select one or more codons to compare their CDS usage across Translation Efficiency groups.", scopeLabel = scope_context$label, focus = parameters$codon_direction, panels = list(), rows = list()))
  }

  scope_table <- scope_context$gene_table
  if (!nrow(scope_table)) {
    return(list(note = "No genes are available in the current scope for the selected codons.", scopeLabel = scope_context$label, focus = parameters$codon_direction, panels = list(), rows = list()))
  }

  usage_table <- as.data.frame(
    data.table::as.data.table(base_context$codon_table)[
      codon %in% parameters$codon_select & GeneKey %in% as.character(scope_table$GeneKey)
    ],
    stringsAsFactors = FALSE
  )

  if (!nrow(usage_table)) {
    return(list(note = "The selected codons were not observed in the current gene scope.", scopeLabel = scope_context$label, focus = parameters$codon_direction, panels = list(), rows = list()))
  }

  usage_split <- split(usage_table, usage_table$codon)
  summary_rows <- do.call(rbind, lapply(parameters$codon_select, function(codon_value) {
    if (!codon_value %in% names(usage_split)) {
      return(NULL)
    }
    codon_usage_summary_row(codon_value, usage_split[[codon_value]])
  }))
  if (is.null(summary_rows)) {
    summary_rows <- data.frame()
  }

  if (nrow(summary_rows)) {
    sort_metric <- if (identical(parameters$codon_direction, "Up")) {
      summary_rows$Up_vs_Non_PValue
    } else if (identical(parameters$codon_direction, "Down")) {
      summary_rows$Down_vs_Non_PValue
    } else {
      pmin(summary_rows$Up_vs_Non_PValue, summary_rows$Down_vs_Non_PValue, na.rm = TRUE)
    }
    sort_metric[!is.finite(sort_metric)] <- Inf
    summary_rows <- summary_rows[order(sort_metric, summary_rows$Codon), , drop = FALSE]
  }

  visualized_codons <- parameters$codon_select
  visual_limit <- codon_max_visualized_codons()
  if (length(visualized_codons) > visual_limit) {
    visualized_codons <- visualized_codons[seq_len(visual_limit)]
  }

  panels <- lapply(visualized_codons, function(codon_value) {
    codon_usage_panel_payload(codon_value, usage_split[[codon_value]])
  })

  list(
    note = paste(
      sprintf("Current gene scope: %s.", scope_context$label),
      "Values show the fraction of codons within each gene CDS that match the selected codon.",
      "Wilcoxon tests compare Up vs Non and Down vs Non within the same current scope."
    ),
    scopeLabel = scope_context$label,
    focus = parameters$codon_direction,
    panels = panels,
    rows = codon_rows_payload(summary_rows)
  )
}

codon_scatter_panel_payload <- function(codon_value, codon_table) {
  build_condition_payload <- function(condition_label, column_name) {
    raw_rna <- as.numeric(codon_table[[column_name]])
    frequency_percent <- as.numeric(codon_table$frequency) * 100
    log2_rna <- log2(pmax(raw_rna, 0) + 1)
    displayed_table <- data.frame(
      GeneID = as.character(codon_table$GeneID),
      gene_name = as.character(codon_table$gene_name),
      TE_Status = as.character(codon_table$TE_Status),
      x = frequency_percent,
      y = log2_rna,
      rawRna = raw_rna,
      stringsAsFactors = FALSE
    )
    displayed_table <- displayed_table[order(displayed_table$x, displayed_table$y, decreasing = FALSE), , drop = FALSE]
    correlation_stats <- codon_correlation_stats(frequency_percent, log2_rna)
    displayed_points <- codon_downsample_rows(displayed_table, limit = codon_scatter_display_limit())

    list(
      condition = condition_label,
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
          rawRna = unname(as.numeric(point_row$rawRna[[1]]))
        )
      })
    )
  }

  list(
    codon = codon_value,
    comparisons = list(
      build_condition_payload("Control", "RNA_Control_Mean"),
      build_condition_payload("Treatment", "RNA_Treatment_Mean")
    )
  )
}

codon_build_selected_vs_rna <- function(scope_context, base_context, parameters) {
  if (!length(parameters$codon_select)) {
    return(list(note = "Select one or more codons to relate codon usage to RNA abundance.", scopeLabel = scope_context$label, panels = list(), rows = list()))
  }

  scope_table <- scope_context$gene_table
  if (!nrow(scope_table)) {
    return(list(note = "No genes are available in the current scope for the selected codons.", scopeLabel = scope_context$label, panels = list(), rows = list()))
  }

  scatter_source <- as.data.frame(
    data.table::as.data.table(base_context$codon_table)[
      codon %in% parameters$codon_select & GeneKey %in% as.character(scope_table$GeneKey)
    ],
    stringsAsFactors = FALSE
  )

  if (!nrow(scatter_source)) {
    return(list(note = "The selected codons were not observed in the current gene scope.", scopeLabel = scope_context$label, panels = list(), rows = list()))
  }

  scatter_split <- split(scatter_source, scatter_source$codon)
  summary_rows <- do.call(rbind, lapply(parameters$codon_select, function(codon_value) {
    if (!codon_value %in% names(scatter_split)) {
      return(NULL)
    }

    codon_table <- scatter_split[[codon_value]]
    control_stats <- codon_correlation_stats(as.numeric(codon_table$frequency) * 100, log2(pmax(as.numeric(codon_table$RNA_Control_Mean), 0) + 1))
    treatment_stats <- codon_correlation_stats(as.numeric(codon_table$frequency) * 100, log2(pmax(as.numeric(codon_table$RNA_Treatment_Mean), 0) + 1))

    rbind(
      data.frame(Codon = codon_value, RNA_Group = "Control", Genes_Measured = control_stats$geneCount, Displayed_Genes = min(control_stats$geneCount, codon_scatter_display_limit()), Pearson_R = control_stats$correlation, P_Value = control_stats$pValue, stringsAsFactors = FALSE),
      data.frame(Codon = codon_value, RNA_Group = "Treatment", Genes_Measured = treatment_stats$geneCount, Displayed_Genes = min(treatment_stats$geneCount, codon_scatter_display_limit()), Pearson_R = treatment_stats$correlation, P_Value = treatment_stats$pValue, stringsAsFactors = FALSE)
    )
  }))
  if (is.null(summary_rows)) {
    summary_rows <- data.frame()
  }

  visualized_codons <- parameters$codon_select
  visual_limit <- codon_max_visualized_codons()
  if (length(visualized_codons) > visual_limit) {
    visualized_codons <- visualized_codons[seq_len(visual_limit)]
  }

  panels <- lapply(visualized_codons, function(codon_value) {
    codon_scatter_panel_payload(codon_value, scatter_split[[codon_value]])
  })

  list(
    note = paste(
      sprintf("Current gene scope: %s.", scope_context$label),
      "Each point is one gene, and RNA abundance is shown as log2(mean normalized abundance + 1) to keep wide abundance ranges readable.",
      sprintf(
        "When more than %s genes are available for a codon-condition pair, the plotted points are a deterministic display subset, but Pearson correlations still use the full gene set.",
        format(codon_scatter_display_limit(), big.mark = ",")
      )
    ),
    scopeLabel = scope_context$label,
    panels = panels,
    rows = codon_rows_payload(summary_rows)
  )
}

codon_bias_group_summary_row <- function(metric_key, metric_label, gene_bias_table) {
  metric_table <- gene_bias_table[is.finite(as.numeric(gene_bias_table[[metric_key]])), , drop = FALSE]
  group_values <- lapply(codon_status_levels(), function(group_label) as.numeric(metric_table[[metric_key]][metric_table$TE_Status == group_label]))
  names(group_values) <- codon_status_levels()

  stats_by_group <- lapply(group_values, codon_box_stats)
  up_pvalue <- codon_wilcox_pvalue(group_values$Up, group_values$Non)
  down_pvalue <- codon_wilcox_pvalue(group_values$Down, group_values$Non)

  data.frame(
    Metric = metric_label,
    Genes_Measured = nrow(metric_table),
    Up_Median = stats_by_group$Up$median,
    Non_Median = stats_by_group$Non$median,
    Down_Median = stats_by_group$Down$median,
    Up_vs_Non_PValue = up_pvalue,
    Down_vs_Non_PValue = down_pvalue,
    stringsAsFactors = FALSE
  )
}

codon_bias_group_panel_payload <- function(metric_key, metric_label, y_label, gene_bias_table) {
  metric_table <- gene_bias_table[is.finite(as.numeric(gene_bias_table[[metric_key]])), , drop = FALSE]
  group_values <- lapply(codon_status_levels(), function(group_label) as.numeric(metric_table[[metric_key]][metric_table$TE_Status == group_label]))
  names(group_values) <- codon_status_levels()

  stats_by_group <- lapply(group_values, codon_box_stats)
  up_pvalue <- codon_wilcox_pvalue(group_values$Up, group_values$Non)
  down_pvalue <- codon_wilcox_pvalue(group_values$Down, group_values$Non)

  list(
    metricId = metric_key,
    metricLabel = metric_label,
    yLabel = y_label,
    genesMeasured = nrow(metric_table),
    upVsNonPValue = unname(as.numeric(up_pvalue)),
    downVsNonPValue = unname(as.numeric(down_pvalue)),
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

codon_build_cbi_tai_by_group <- function(base_context, upload_context) {
  gene_bias_table <- codon_build_bias_gene_table(base_context, upload_context)
  panel_specs <- list(
    list(metric = "CBI", title = "Codon Bias Index (CBI)", y_label = "Codon Bias Index"),
    list(metric = "tAI", title = "tRNA Adaptation Index (tAI)", y_label = "tRNA Adaptation Index")
  )

  panels <- list()
  rows <- list()
  missing_metrics <- character()

  for (panel_spec in panel_specs) {
    finite_count <- sum(is.finite(as.numeric(gene_bias_table[[panel_spec$metric]])), na.rm = TRUE)

    if (!finite_count) {
      missing_metrics <- c(missing_metrics, panel_spec$title)
      next
    }

    panels[[length(panels) + 1L]] <- codon_bias_group_panel_payload(
      metric_key = panel_spec$metric,
      metric_label = panel_spec$title,
      y_label = panel_spec$y_label,
      gene_bias_table = gene_bias_table
    )
    rows[[length(rows) + 1L]] <- codon_bias_group_summary_row(
      metric_key = panel_spec$metric,
      metric_label = panel_spec$title,
      gene_bias_table = gene_bias_table
    )
  }

  note_parts <- c(
    paste(
      "CBI and tAI are taken from local transcript-level reference resources and linked to the same representative protein-coding transcript",
      "used for the current codon analysis set."
    ),
    "Wilcoxon tests compare TE Up vs Non and TE Down vs Non for each metric."
  )

  if (length(missing_metrics)) {
    note_parts <- c(
      note_parts,
      sprintf("The following metric resources were not available for the current representative transcript set: %s.", paste(missing_metrics, collapse = ", "))
    )
  }

  summary_rows <- if (length(rows)) do.call(rbind, rows) else data.frame(
    Metric = character(),
    Genes_Measured = numeric(),
    Up_Median = numeric(),
    Non_Median = numeric(),
    Down_Median = numeric(),
    Up_vs_Non_PValue = numeric(),
    Down_vs_Non_PValue = numeric(),
    stringsAsFactors = FALSE
  )

  list(
    note = paste(note_parts, collapse = " "),
    panels = panels,
    rows = codon_rows_payload(summary_rows)
  )
}

codon_bias_association_panel_payload <- function(gene_bias_table, association_label, condition_label, column_name, transform = c("identity", "log2p1"), y_label, raw_y_label) {
  transform <- match.arg(transform)
  raw_values <- as.numeric(gene_bias_table[[column_name]])
  x_values <- as.numeric(gene_bias_table$CBI)
  y_values <- if (identical(transform, "log2p1")) log2(pmax(raw_values, 0) + 1) else raw_values

  displayed_table <- data.frame(
    GeneID = as.character(gene_bias_table$GeneID),
    gene_name = as.character(gene_bias_table$gene_name),
    TE_Status = as.character(gene_bias_table$TE_Status),
    x = x_values,
    y = y_values,
    rawY = raw_values,
    stringsAsFactors = FALSE
  )
  displayed_table <- displayed_table[is.finite(displayed_table$x) & is.finite(displayed_table$y), , drop = FALSE]
  displayed_table <- displayed_table[order(displayed_table$x, displayed_table$y, decreasing = FALSE), , drop = FALSE]

  correlation_stats <- codon_correlation_stats(displayed_table$x, displayed_table$y)
  displayed_points <- codon_downsample_rows(displayed_table, limit = codon_scatter_display_limit())

  list(
    panelId = sprintf("%s_%s", codon_safe_filename_token(association_label, "association"), codon_safe_filename_token(condition_label, "condition")),
    metricLabel = "Codon Bias Index (CBI)",
    associationLabel = association_label,
    conditionLabel = condition_label,
    xLabel = "Codon Bias Index (CBI)",
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

codon_build_cbi_associations <- function(base_context, upload_context) {
  gene_bias_table <- codon_build_bias_gene_table(base_context, upload_context)
  gene_bias_table <- gene_bias_table[is.finite(as.numeric(gene_bias_table$CBI)), , drop = FALSE]

  if (!nrow(gene_bias_table)) {
    return(list(
      note = "No representative transcripts with Codon Bias Index values were available in the current analysis set.",
      panels = list(),
      rows = list()
    ))
  }

  panel_specs <- list(
    list(association = "RNA Abundance", condition = "Control", column = "RNA_Control_Mean", transform = "log2p1", y_label = "log2 Mean RNA Abundance + 1", raw_y_label = "RNA Mean"),
    list(association = "RNA Abundance", condition = "Treatment", column = "RNA_Treatment_Mean", transform = "log2p1", y_label = "log2 Mean RNA Abundance + 1", raw_y_label = "RNA Mean"),
    list(association = "TE Ratio", condition = "Control", column = "TE_Control_Mean", transform = "identity", y_label = "Mean Translation Efficiency Ratio", raw_y_label = "TE Ratio Mean"),
    list(association = "TE Ratio", condition = "Treatment", column = "TE_Treatment_Mean", transform = "identity", y_label = "Mean Translation Efficiency Ratio", raw_y_label = "TE Ratio Mean")
  )

  panels <- list()
  rows <- list()

  for (panel_spec in panel_specs) {
    if (!panel_spec$column %in% colnames(gene_bias_table)) {
      next
    }

    panel_payload <- codon_bias_association_panel_payload(
      gene_bias_table = gene_bias_table,
      association_label = panel_spec$association,
      condition_label = panel_spec$condition,
      column_name = panel_spec$column,
      transform = panel_spec$transform,
      y_label = panel_spec$y_label,
      raw_y_label = panel_spec$raw_y_label
    )

    if (!panel_payload$geneCount) {
      next
    }

    panels[[length(panels) + 1L]] <- panel_payload
    rows[[length(rows) + 1L]] <- data.frame(
      Association = panel_spec$association,
      Condition = panel_spec$condition,
      Genes_Measured = panel_payload$geneCount,
      Displayed_Genes = panel_payload$displayedGeneCount,
      Pearson_R = panel_payload$correlation,
      P_Value = panel_payload$pValue,
      stringsAsFactors = FALSE
    )
  }

  summary_rows <- if (length(rows)) do.call(rbind, rows) else data.frame(
    Association = character(),
    Condition = character(),
    Genes_Measured = numeric(),
    Displayed_Genes = numeric(),
    Pearson_R = numeric(),
    P_Value = numeric(),
    stringsAsFactors = FALSE
  )

  list(
    note = paste(
      "CBI is read from the local reference resource for each representative transcript in the current analysis set.",
      "RNA abundance panels show log2(mean normalized abundance + 1), while TE panels show mean TE ratio on the original scale.",
      sprintf(
        "When more than %s genes are available for one panel, the plotted points are a deterministic display subset, but Pearson correlations still use the full gene set.",
        format(codon_scatter_display_limit(), big.mark = ",")
      )
    ),
    panels = panels,
    rows = codon_rows_payload(summary_rows)
  )
}
