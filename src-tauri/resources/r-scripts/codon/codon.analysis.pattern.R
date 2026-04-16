codon_build_zscore_matrix <- function(base_context, gene_keys = NULL) {
  zscore_table <- codon_build_enriched_codon_table(base_context)

  if (!is.null(gene_keys)) {
    zscore_table <- zscore_table[zscore_table$GeneKey %in% gene_keys, , drop = FALSE]
  }

  if (!nrow(zscore_table)) {
    return(NULL)
  }

  zscore_table$GeneID <- as.character(zscore_table$GeneID)
  zscore_table$codon <- as.character(zscore_table$codon)
  zscore_table$zscore[!is.finite(zscore_table$zscore)] <- 0
  matrix_values <- xtabs(zscore ~ GeneID + codon, data = zscore_table)
  as.matrix(matrix_values)
}

codon_cluster_order <- function(matrix_values) {
  if (is.null(matrix_values) || !is.matrix(matrix_values)) {
    return(list(row_order = integer(), column_order = integer()))
  }

  row_order <- seq_len(nrow(matrix_values))
  column_order <- seq_len(ncol(matrix_values))

  if (nrow(matrix_values) > 1L) {
    row_order <- stats::hclust(stats::dist(matrix_values), method = "complete")$order
  }

  if (ncol(matrix_values) > 1L) {
    column_order <- stats::hclust(stats::dist(t(matrix_values)), method = "complete")$order
  }

  list(row_order = row_order, column_order = column_order)
}

codon_heatmap_panel_payload <- function(matrix_values,
                                        panel_id,
                                        title,
                                        subtitle,
                                        selected_codons = character(),
                                        row_axis_label = NULL) {
  if (is.null(matrix_values) || !is.matrix(matrix_values) || !nrow(matrix_values) || !ncol(matrix_values)) {
    return(list())
  }

  orders <- codon_cluster_order(matrix_values)
  ordered_matrix <- matrix_values[orders$row_order, orders$column_order, drop = FALSE]
  max_abs <- max(abs(ordered_matrix), na.rm = TRUE)
  if (!is.finite(max_abs) || max_abs <= 0) {
    max_abs <- 1
  }

  list(
    panelId = panel_id,
    title = title,
    subtitle = subtitle,
    colorMax = unname(as.numeric(max_abs)),
    rowAxisLabel = if (is.null(row_axis_label) || !nzchar(as.character(row_axis_label))) {
      sprintf("Rows (%s)", format(nrow(ordered_matrix), big.mark = ","))
    } else {
      as.character(row_axis_label)
    },
    rows = as.list(rownames(ordered_matrix)),
    columns = lapply(colnames(ordered_matrix), function(column_name) {
      list(label = as.character(column_name), selected = column_name %in% selected_codons)
    }),
    values = lapply(seq_len(nrow(ordered_matrix)), function(row_index) {
      as.list(unname(as.numeric(ordered_matrix[row_index, ])))
    })
  )
}

codon_build_codon_clustering <- function(base_context, scope_context, parameters) {
  matrix_values <- codon_build_zscore_matrix(base_context, gene_keys = scope_context$gene_table$GeneKey)

  if (is.null(matrix_values) || ncol(matrix_values) < 2L) {
    return(list(note = "At least two codons with z-score information are required to build the codon co-usage clustering view.", panels = list(), rows = list()))
  }

  codon_similarity <- stats::cor(matrix_values, use = "pairwise.complete.obs")
  codon_similarity[!is.finite(codon_similarity)] <- 0
  diag(codon_similarity) <- 1

  panel <- codon_heatmap_panel_payload(
    codon_similarity,
    panel_id = "codon_clustering",
    title = "Codon Co-usage Clustering",
    subtitle = "Pairwise codon similarity is based on gene-level codon-usage z-score profiles and clustered hierarchically.",
    selected_codons = parameters$codon_select,
    row_axis_label = sprintf("Codons (%s)", format(nrow(codon_similarity), big.mark = ","))
  )

  summary_rows <- data.frame(
    Codon = colnames(codon_similarity),
    Mean_Correlation = rowMeans(codon_similarity, na.rm = TRUE),
    Selected = colnames(codon_similarity) %in% parameters$codon_select,
    stringsAsFactors = FALSE
  )

  list(
    note = "Each heatmap cell reports Pearson similarity between two codon z-score profiles after hierarchical clustering. Selected codons are highlighted in the column strip.",
    panels = list(panel),
    rows = codon_rows_payload(summary_rows)
  )
}

codon_build_codon_usage_heatmap <- function(base_context, scope_context, parameters) {
  matrix_values <- codon_build_zscore_matrix(base_context, gene_keys = scope_context$gene_table$GeneKey)

  if (is.null(matrix_values) || !nrow(matrix_values) || !ncol(matrix_values)) {
    return(list(note = "No codon-usage z-score matrix could be assembled for the current scope.", panels = list(), rows = list()))
  }

  row_variance <- apply(matrix_values, 1, stats::var, na.rm = TRUE)
  row_variance[!is.finite(row_variance)] <- 0
  selected_rows <- order(row_variance, decreasing = TRUE)
  selected_rows <- selected_rows[seq_len(min(length(selected_rows), codon_heatmap_gene_limit()))]
  heatmap_matrix <- matrix_values[selected_rows, , drop = FALSE]

  panel <- codon_heatmap_panel_payload(
    heatmap_matrix,
    panel_id = "codon_usage_heatmap",
    title = "Codon Usage Z-score Heatmap",
    subtitle = sprintf("Top %s variable genes are displayed to keep the heatmap legible.", format(nrow(heatmap_matrix), big.mark = ",")),
    selected_codons = parameters$codon_select,
    row_axis_label = sprintf("Genes (%s)", format(nrow(heatmap_matrix), big.mark = ","))
  )

  summary_rows <- data.frame(
    Displayed_Genes = nrow(heatmap_matrix),
    Available_Genes = nrow(matrix_values),
    Codons = ncol(heatmap_matrix),
    stringsAsFactors = FALSE
  )

  list(
    note = paste(
      sprintf("Current gene scope: %s.", scope_context$label),
      sprintf("The heatmap shows the top %s genes by codon-usage z-score variance to keep the matrix readable.", format(codon_heatmap_gene_limit(), big.mark = ",")),
      "Selected codons are highlighted in the column strip."
    ),
    panels = list(panel),
    rows = codon_rows_payload(summary_rows)
  )
}

