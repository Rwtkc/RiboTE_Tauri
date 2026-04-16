args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) {
  stop("Usage: analysis_modules.R <input_json> <output_json>", call. = FALSE)
}

suppressPackageStartupMessages({
  library(jsonlite)
})

system_r_library <- "D:/R/R-4.3.0/library"
if (dir.exists(system_r_library)) {
  .libPaths(unique(c(.libPaths(), system_r_library)))
}

input_path <- args[[1]]
output_path <- args[[2]]
request <- jsonlite::fromJSON(input_path, simplifyVector = FALSE)

`%||%` <- function(x, y) if (is.null(x) || length(x) == 0 || identical(x, "")) y else x

session_cache_dir <- request$sessionCacheDir %||% ""
if (nzchar(session_cache_dir)) {
  dir.create(session_cache_dir, recursive = TRUE, showWarnings = FALSE)
}

cache_key <- function(...) {
  text <- paste(..., collapse = "|")
  values <- utf8ToInt(text)
  h1 <- 5381
  h2 <- 0
  if (length(values)) {
    for (value in values) {
      h1 <- (h1 * 33 + value) %% 2147483647
      h2 <- (h2 * 131 + value) %% 2147483629
    }
  }
  sprintf("%010d_%010d", h1, h2)
}

file_cache_path <- function(kind, path) {
  if (!nzchar(session_cache_dir) || is.null(path) || !file.exists(path)) {
    return(NA_character_)
  }
  signature <- cache_key(kind, file_signature(path))
  file.path(session_cache_dir, sprintf("%s_%s.rds", kind, signature))
}

file_signature <- function(path) {
  if (is.null(path) || !file.exists(path)) {
    return(sprintf("%s|missing", as.character(path %||% "")))
  }
  info <- file.info(path)
  paste(
    normalizePath(path, winslash = "/", mustWork = TRUE),
    info$size[[1]],
    as.numeric(info$mtime[[1]]),
    sep = "|"
  )
}

cached_key_value <- function(kind, key_parts, loader) {
  if (!nzchar(session_cache_dir)) {
    return(loader())
  }
  signature <- cache_key(kind, paste(unlist(key_parts, use.names = FALSE), collapse = "|"))
  cache_path <- file.path(session_cache_dir, sprintf("%s_%s.rds", kind, signature))
  if (file.exists(cache_path)) {
    cached <- tryCatch(readRDS(cache_path), error = function(error) NULL)
    if (!is.null(cached)) {
      return(cached)
    }
  }
  value <- loader()
  tryCatch(saveRDS(value, cache_path), error = function(error) NULL)
  value
}

cached_file_value <- function(kind, path, loader) {
  cache_path <- file_cache_path(kind, path)
  if (!is.na(cache_path) && file.exists(cache_path)) {
    cached <- tryCatch(readRDS(cache_path), error = function(error) NULL)
    if (!is.null(cached)) {
      return(cached)
    }
  }
  value <- loader(path)
  if (!is.na(cache_path)) {
    tryCatch(saveRDS(value, cache_path), error = function(error) NULL)
  }
  value
}

cached_read_csv <- function(path, kind = "csv") {
  cached_file_value(kind, path, function(csv_path) {
    utils::read.csv(csv_path, check.names = FALSE, stringsAsFactors = FALSE)
  })
}

cached_read_delim_first_column <- function(path, kind = "delim_first_column") {
  cached_file_value(kind, path, function(resource_path) {
    table <- utils::read.delim(resource_path, header = FALSE, sep = "\t", stringsAsFactors = FALSE, quote = "", comment.char = "")
    if (!nrow(table)) return(character())
    unique(signalp_normalize_gene_key(table[[1]]))
  })
}

num <- function(x, default = 0) {
  if (is.null(x) || length(x) == 0L || identical(x, "")) return(default)
  value <- suppressWarnings(as.numeric(x[[1]]))
  if (!is.finite(value)) default else value
}
int <- function(x, default = 0L) {
  if (is.null(x) || length(x) == 0L || identical(x, "")) return(default)
  value <- suppressWarnings(as.integer(x[[1]]))
  if (!is.finite(value)) default else value
}
csv_rows <- function(df, limit = 10L) {
  if (is.null(df) || !nrow(df)) {
    return(list())
  }
  lapply(seq_len(min(limit, nrow(df))), function(i) as.list(df[i, , drop = FALSE]))
}
table_payload <- function(df, limit = 10L) {
  list(columns = as.list(colnames(df)), rows = csv_rows(df, limit), totalRows = nrow(df))
}
round_numeric_table <- function(df, digits = 4L, exclude = character()) {
  if (is.null(df) || !is.data.frame(df)) {
    return(df)
  }
  numeric_columns <- vapply(df, is.numeric, logical(1))
  numeric_columns[names(numeric_columns) %in% exclude] <- FALSE
  df[numeric_columns] <- lapply(df[numeric_columns], function(column) round(column, digits = digits))
  df
}
metric <- function(label, value) {
  list(label = label, value = as.character(value))
}
safe_log2 <- function(x) log2(pmax(as.numeric(x), 1e-300))
finite_or_na <- function(x) {
  value <- suppressWarnings(as.numeric(x))
  value[!is.finite(value)] <- NA_real_
  value
}
log_ratio <- function(numerator, denominator) {
  value <- suppressWarnings(log2(suppressWarnings(as.numeric(numerator)) / suppressWarnings(as.numeric(denominator))))
  value[is.nan(value)] <- NA_real_
  value
}
classify_logfc <- function(logfc, fold) {
  status <- rep("Non", length(logfc))
  status[!is.na(logfc) & logfc >= fold] <- "Up"
  status[!is.na(logfc) & logfc <= -fold] <- "Down"
  status
}
sample_display_rows <- function(df, limit) {
  limit <- as.integer(limit)
  if (is.null(df)) {
    return(df)
  }
  if (!nrow(df) || !is.finite(limit) || limit <= 0L) {
    return(df[0, , drop = FALSE])
  }
  if (nrow(df) <= limit) {
    return(df)
  }
  indexes <- unique(pmax(1L, pmin(nrow(df), round(seq(1, nrow(df), length.out = limit)))))
  df[indexes, , drop = FALSE]
}
limit_display_points <- function(df, limit = 5000L, status_col = "group", positive = FALSE) {
  if (is.null(df) || !nrow(df)) {
    return(df)
  }
  x <- suppressWarnings(as.numeric(df$x))
  y <- suppressWarnings(as.numeric(df$y))
  valid <- is.finite(x) & is.finite(y)
  if (positive) {
    valid <- valid & x > 0 & y > 0
  }
  df <- df[valid, , drop = FALSE]
  if (nrow(df) <= limit) {
    return(df)
  }
  status <- if (status_col %in% names(df)) as.character(df[[status_col]]) else rep("Non", nrow(df))
  priority <- df[status %in% c("Up", "Down"), , drop = FALSE]
  background <- df[!(status %in% c("Up", "Down")), , drop = FALSE]
  if (nrow(priority) >= limit) {
    return(sample_display_rows(priority, limit))
  }
  rbind(priority, sample_display_rows(background, limit - nrow(priority)))
}
kernel_epanechnikov <- function(value, bandwidth) {
  ratio <- value / bandwidth
  ifelse(abs(ratio) <= 1, 0.75 * (1 - ratio ^ 2) / bandwidth, 0)
}
density_series <- function(df, axis = "x", domain = c(-4, 4), step = 0.1, bandwidth = 0.45) {
  steps <- seq(domain[[1]], domain[[2]], by = step)
  lapply(c("Up", "Non", "Down"), function(status) {
    values <- suppressWarnings(as.numeric(df[df$group == status, axis]))
    values <- values[is.finite(values)]
    density <- if (length(values)) {
      vapply(steps, function(point) mean(kernel_epanechnikov(point - values, bandwidth)), numeric(1))
    } else {
      rep(0, length(steps))
    }
    list(group = status, points = data.frame(value = steps, density = density))
  })
}
read_matrix <- function(path) {
  if (is.null(path) || !file.exists(path)) {
    stop("Filtered count matrix is unavailable. Complete Data Preprocess first.", call. = FALSE)
  }
  df <- cached_read_csv(path, "processed_matrix")
  if (!"GeneID" %in% colnames(df)) {
    colnames(df)[1] <- "GeneID"
  }
  df
}

pair_manifest <- function(pairs) {
  df <- if (is.data.frame(pairs)) {
    pairs
  } else {
    do.call(rbind, lapply(pairs, function(pair) as.data.frame(pair, stringsAsFactors = FALSE)))
  }
  if (!nrow(df)) {
    stop("Sample pairing is required.", call. = FALSE)
  }
  names(df) <- sub("^rnaSample$", "rna_sample", names(df))
  names(df) <- sub("^riboSample$", "ribo_sample", names(df))
  names(df) <- sub("^groupRole$", "group_role", names(df))
  if (!all(c("rna_sample", "ribo_sample", "group_role") %in% names(df))) {
    stop("Sample pairing must include RNA sample, Ribo sample, and group role.", call. = FALSE)
  }
  df
}

script_path <- sub("^--file=", "", commandArgs(FALSE)[grep("^--file=", commandArgs(FALSE))][1])
if (is.character(script_path) && length(script_path) == 1L && nzchar(script_path)) {
  source(file.path(dirname(normalizePath(script_path, winslash = "/", mustWork = TRUE)), "codon_desktop.R"), local = TRUE, encoding = "UTF-8")
}

split_counts <- function(matrix, pairs) {
  controls <- pairs[pairs$group_role == "Control", , drop = FALSE]
  treatments <- pairs[pairs$group_role == "Treatment", , drop = FALSE]
  if (!nrow(controls) || !nrow(treatments)) {
    stop("Control and Treatment RNA/Ribo pairs are required.", call. = FALSE)
  }
  samples <- c(controls$rna_sample, treatments$rna_sample, controls$ribo_sample, treatments$ribo_sample)
  if (!all(samples %in% colnames(matrix))) {
    stop("Saved sample pairing does not match the processed matrix columns.", call. = FALSE)
  }
  list(controls = controls, treatments = treatments)
}

run_deseq_rex <- function(rna, ribo, condition, min_counts, n_min_samples, min_mean_count = 1) {
  if (!requireNamespace("DESeq2", quietly = TRUE) || !requireNamespace("edgeR", quietly = TRUE)) {
    stop("DESeq2 and edgeR are required for Riborex-style TE analysis.", call. = FALSE)
  }

  if (!identical(rownames(rna), rownames(ribo))) {
    stop("RNA-seq and Ribo-seq data must have the same set of genes.", call. = FALSE)
  }

  rna_cond <- data.frame(cond = condition, stringsAsFactors = FALSE)
  ribo_cond <- data.frame(cond = condition, stringsAsFactors = FALSE)
  keep_rna <- rownames(rna)[rowMeans(rna, na.rm = TRUE) >= min_mean_count]
  keep_ribo <- rownames(ribo)[rowMeans(ribo, na.rm = TRUE) >= min_mean_count]
  keep <- intersect(keep_rna, keep_ribo)
  rna <- rna[keep, , drop = FALSE]
  ribo <- ribo[keep, , drop = FALSE]

  num_cond <- ncol(rna_cond)
  num_rna_samples <- nrow(rna_cond)
  num_ribo_samples <- nrow(ribo_cond)
  counts <- round(cbind(rna, ribo), 0)
  coldata <- rbind(rna_cond, ribo_cond)
  coldata <- coldata[, rep(seq_len(ncol(coldata)), 2), drop = FALSE]
  intercept <- c(rep("CONTROL", num_rna_samples), rep("TREATED", num_ribo_samples))
  coldata <- cbind(
    coldata[, seq_len(num_cond), drop = FALSE],
    INTERCEPT = intercept,
    coldata[, (num_cond + 1):ncol(coldata), drop = FALSE]
  )
  for (index in seq.int(num_cond + 2L, ncol(coldata))) {
    coldata[seq_len(num_rna_samples), index] <- coldata[[index]][[1]]
  }
  colnames(coldata)[(num_cond + 2L):ncol(coldata)] <- paste0("EXTRA", seq_len(num_cond))
  rownames(coldata) <- colnames(counts)
  design <- stats::as.formula(paste("~", paste(colnames(coldata), collapse = "+")))

  keep_rows <- apply(edgeR::cpm(edgeR::DGEList(counts = counts)), 1, function(v) sum(v >= min_counts, na.rm = TRUE)) >= n_min_samples
  counts <- counts[keep_rows, , drop = FALSE]

  dds <- DESeq2::DESeqDataSetFromMatrix(countData = counts, colData = coldata, design = design)
  dds <- DESeq2::DESeq(dds, quiet = TRUE)
  res <- as.data.frame(DESeq2::results(dds))
  norm <- as.data.frame(DESeq2::counts(dds, normalized = TRUE))
  res$GeneID <- rownames(res)
  norm$GeneID <- rownames(norm)
  res$baseMean <- NULL
  res$lfcSE <- NULL
  res$stat <- NULL
  res$padj[is.na(res$padj)] <- 1
  merged <- merge(norm, res, by = "GeneID", all.y = TRUE)
  merged[order(merged$padj), , drop = FALSE]
}

run_xtail <- function(rna, ribo, condition, min_counts, n_min_samples) {
  if (!requireNamespace("xtail", quietly = TRUE) || !requireNamespace("DESeq2", quietly = TRUE) || !requireNamespace("edgeR", quietly = TRUE)) {
    stop("xtail, DESeq2, and edgeR are required for Xtail TE analysis.", call. = FALSE)
  }
  count_data <- cbind(rna, ribo)
  keep_rows <- apply(edgeR::cpm(edgeR::DGEList(counts = count_data)), 1, function(v) sum(v >= min_counts, na.rm = TRUE)) >= n_min_samples
  count_data <- count_data[keep_rows, , drop = FALSE]
  sf <- DESeq2::estimateSizeFactorsForMatrix(count_data)
  norm <- as.data.frame(count_data / do.call(rbind, rep(list(sf), nrow(count_data))), check.names = FALSE)
  norm$GeneID <- rownames(norm)
  rna <- rna[apply(rna, 1, function(row) all(row != 0)), , drop = FALSE]
  ribo <- ribo[apply(ribo, 1, function(row) all(row != 0)), , drop = FALSE]
  common <- intersect(rownames(rna), rownames(ribo))
  rna <- rna[common, , drop = FALSE]
  ribo <- ribo[common, , drop = FALSE]
  xt <- xtail::xtail(rna, ribo, condition, threads = 5, bins = 1000)
  res <- as.data.frame(xtail::resultsTable(xt))
  res <- data.frame(GeneID = rownames(res), log2FoldChange = res$log2FC_TE_final, pvalue = res$pvalue_final, padj = res$pvalue.adjust, check.names = FALSE)
  merge(norm, res, by = "GeneID", all.y = TRUE)
}

te_analysis <- function(matrix, pairs, parameters) {
  split <- split_counts(matrix, pairs)
  control <- split$controls
  treatment <- split$treatments
  rna_names <- c(control$rna_sample, treatment$rna_sample)
  ribo_names <- c(control$ribo_sample, treatment$ribo_sample)
  condition <- c(rep("G1", nrow(control)), rep("G2", nrow(treatment)))
  genes <- matrix$GeneID
  rna <- matrix[, rna_names, drop = FALSE]
  ribo <- matrix[, ribo_names, drop = FALSE]
  rownames(rna) <- genes
  rownames(ribo) <- genes
  rna[] <- lapply(rna, as.numeric)
  ribo[] <- lapply(ribo, as.numeric)
  tool <- ifelse(tolower(parameters$teTool %||% parameters$te_tool %||% "Riborex") == "xtail", "Xtail", "Riborex")
  min_cpm <- num(parameters$minCpm, 0.5)
  min_libraries <- int(parameters$minLibraries, 1L)
  normal <- cached_key_value(
    "translation_efficiency_model",
    list(
      file_signature(request$preprocessMatrixPath %||% ""),
      jsonlite::toJSON(request$samplePairs %||% pairs, auto_unbox = TRUE, null = "null"),
      tool,
      min_cpm,
      min_libraries
    ),
    function() {
      if (identical(tool, "Xtail")) {
        run_xtail(rna, ribo, condition, min_cpm, min_libraries)
      } else {
        run_deseq_rex(rna, ribo, condition, min_cpm, min_libraries)
      }
    }
  )
  normal$input1 <- rowMeans(normal[, control$rna_sample, drop = FALSE], na.rm = TRUE)
  normal$input2 <- rowMeans(normal[, treatment$rna_sample, drop = FALSE], na.rm = TRUE)
  normal$logInputFC <- log_ratio(normal$input2, normal$input1)
  normal$RNA_Control_Mean <- normal$input1
  normal$RNA_Treatment_Mean <- normal$input2
  normal$RNA_log2FC <- normal$logInputFC
  normal$rpf1 <- rowMeans(normal[, control$ribo_sample, drop = FALSE], na.rm = TRUE)
  normal$rpf2 <- rowMeans(normal[, treatment$ribo_sample, drop = FALSE], na.rm = TRUE)
  normal$logRPFfc <- log_ratio(normal$rpf2, normal$rpf1)
  normal$Ribo_Control_Mean <- normal$rpf1
  normal$Ribo_Treatment_Mean <- normal$rpf2
  normal$Ribo_log2FC <- normal$logRPFfc
  control_te <- normal[, control$ribo_sample, drop = FALSE] / normal[, control$rna_sample, drop = FALSE]
  treatment_te <- normal[, treatment$ribo_sample, drop = FALSE] / normal[, treatment$rna_sample, drop = FALSE]
  normal$TE_A1 <- round(rowMeans(control_te, na.rm = TRUE), 3)
  normal$TE_A2 <- round(rowMeans(treatment_te, na.rm = TRUE), 3)
  normal$logTEfc <- log_ratio(normal$TE_A2, normal$TE_A1)
  normal$TE_Control_Mean <- normal$TE_A1
  normal$TE_Treatment_Mean <- normal$TE_A2
  normal$TE_log2FC <- normal$logTEfc
  fold <- log2(max(num(parameters$foldChange, 1.5), 1))
  cutoff <- num(parameters$pValue, 0.05)
  p_value_type <- tolower(as.character(parameters$pValueType %||% "Fdr"))
  metric_value <- if (p_value_type %in% c("pvalue", "rawpvalue")) normal$pvalue else normal$padj
  normal$diffExp <- classify_logfc(normal$logInputFC, fold)
  normal$diffRibo <- classify_logfc(normal$logRPFfc, fold)
  normal$diffTE <- "Non"
  normal$diffTE[!is.na(normal$logTEfc) & normal$logTEfc >= fold & metric_value < cutoff] <- "Up"
  normal$diffTE[!is.na(normal$logTEfc) & normal$logTEfc <= -fold & metric_value < cutoff] <- "Down"
  normal$RNA_Expression_Status <- normal$diffExp
  normal$Ribo_Expression_Status <- normal$diffRibo
  normal$TE_Status <- normal$diffTE
  normal$significance <- -log10(pmax(metric_value, 1e-300))
  normal <- normal[order(normal$padj), , drop = FALSE]
  status <- table(factor(normal$TE_Status, levels = c("Up", "Non", "Down")))
  exp_status <- table(factor(normal$RNA_Expression_Status, levels = c("Up", "Non", "Down")))
  volcano_rows <- data.frame(
    GeneID = normal$GeneID,
    x = finite_or_na(normal$log2FoldChange),
    y = finite_or_na(normal$significance),
    group = normal$diffTE,
    pvalue = finite_or_na(normal$pvalue),
    padj = finite_or_na(normal$padj),
    stringsAsFactors = FALSE
  )
  scatter_te_expression <- data.frame(
    GeneID = normal$GeneID,
    x = finite_or_na(normal$TE_A1),
    y = finite_or_na(normal$TE_A2),
    group = normal$diffTE,
    stringsAsFactors = FALSE
  )
  scatter_input <- data.frame(
    GeneID = normal$GeneID,
    x = finite_or_na(normal$input1),
    y = finite_or_na(normal$input2),
    group = normal$diffExp,
    stringsAsFactors = FALSE
  )
  scatter_te <- data.frame(
    GeneID = normal$GeneID,
    x = finite_or_na(normal$logInputFC),
    y = finite_or_na(normal$log2FoldChange),
    group = normal$diffTE,
    te = finite_or_na(normal$log2FoldChange),
    stringsAsFactors = FALSE
  )
  te_display_limit <- 5000L
  volcano_display_rows <- limit_display_points(volcano_rows, te_display_limit)
  scatter_te_expression_display <- limit_display_points(scatter_te_expression, te_display_limit, positive = TRUE)
  scatter_input_display <- limit_display_points(scatter_input, te_display_limit, positive = TRUE)
  scatter_te_display <- limit_display_points(scatter_te, te_display_limit)
  table_rows <- round_numeric_table(normal[, setdiff(colnames(normal), "significance"), drop = FALSE], digits = 4L, exclude = c("pvalue", "padj"))
  list(
    table = table_rows,
    summary = list(metric("TE Up", status[["Up"]]), metric("TE Non", status[["Non"]]), metric("TE Down", status[["Down"]]), metric("Tool", tool)),
    views = list(
      list(id = "data", title = "Data", type = "table"),
      list(id = "volcano", title = "TE Volcano Plot", type = "scatter", x = "log2FoldChange", y = "significance"),
      list(id = "scatter", title = "TE Scatter Plots", type = "scatter", x = "RNA_log2FC", y = "TE_log2FC")
    ),
    charts = list(
      volcano = list(
        id = "volcano",
        title = "Translation Efficiency Volcano Plot",
        xLabel = "log2 Fold Change",
        yLabel = "-log10 Significance",
        height = 600,
        rows = volcano_display_rows,
        displayPointLimit = te_display_limit,
        displayedRows = nrow(volcano_display_rows),
        totalRows = nrow(volcano_rows),
        legendCounts = list(Up = unname(status[["Up"]]), Non = unname(status[["Non"]]), Down = unname(status[["Down"]])),
        yMinFromData = TRUE,
        referenceLines = list(x = c(-fold, fold), y = c(-log10(max(cutoff, 1e-300))))
      ),
      scatter = list(
        list(
          id = "te_expression",
          title = "Translation Efficiency by Group",
          xLabel = "Translation efficiency (Control, log2)",
          yLabel = "Translation efficiency (Treatment, log2)",
          scaleType = "log2",
          height = 600,
          rows = scatter_te_expression_display,
          displayPointLimit = te_display_limit,
          displayedRows = nrow(scatter_te_expression_display),
          totalRows = nrow(scatter_te_expression),
          legendCounts = list(Up = unname(status[["Up"]]), Non = unname(status[["Non"]]), Down = unname(status[["Down"]]))
        ),
        list(
          id = "rna_expression",
          title = "RNA Expression by Group",
          xLabel = "RNA expression (Control, log2)",
          yLabel = "RNA expression (Treatment, log2)",
          scaleType = "log2",
          height = 600,
          rows = scatter_input_display,
          displayPointLimit = te_display_limit,
          displayedRows = nrow(scatter_input_display),
          totalRows = nrow(scatter_input),
          legendCounts = list(Up = unname(exp_status[["Up"]]), Non = unname(exp_status[["Non"]]), Down = unname(exp_status[["Down"]]))
        ),
        list(
          id = "rna_te_fc",
          title = "RNA vs TE Fold Change",
          xLabel = "RNA_log2FC",
          yLabel = "TE_log2FC",
          scaleType = "linear",
          marginalDensity = TRUE,
          xDomain = c(-4, 4),
          yDomain = c(-4, 4),
          densityX = density_series(scatter_te, "x", c(-4, 4)),
          densityY = density_series(scatter_te, "y", c(-4, 4)),
          height = 600,
          rows = scatter_te_display,
          displayPointLimit = te_display_limit,
          displayedRows = nrow(scatter_te_display),
          totalRows = nrow(scatter_te),
          legendCounts = list(Up = unname(status[["Up"]]), Non = unname(status[["Non"]]), Down = unname(status[["Down"]]))
        )
      )
    )
  )
}

feature_matrix <- function(matrix, pairs, space) {
  split <- split_counts(matrix, pairs)
  control <- split$controls
  treatment <- split$treatments
  if (space == "RNA Abundance") {
    samples <- c(control$rna_sample, treatment$rna_sample)
    mat <- log2(as.matrix(matrix[, samples, drop = FALSE]) + 1)
  } else if (space == "Ribo Abundance") {
    samples <- c(control$ribo_sample, treatment$ribo_sample)
    mat <- log2(as.matrix(matrix[, samples, drop = FALSE]) + 1)
  } else {
    samples <- c(paste0("C", seq_len(nrow(control))), paste0("T", seq_len(nrow(treatment))))
    mat <- cbind(
      as.matrix(matrix[, control$ribo_sample, drop = FALSE]) / pmax(as.matrix(matrix[, control$rna_sample, drop = FALSE]), 1),
      as.matrix(matrix[, treatment$ribo_sample, drop = FALSE]) / pmax(as.matrix(matrix[, treatment$rna_sample, drop = FALSE]), 1)
    )
    mat <- log2(mat + 1)
    colnames(mat) <- samples
  }
  rownames(mat) <- matrix$GeneID
  storage.mode(mat) <- "numeric"
  mat[!is.finite(mat)] <- 0
  mat
}

pca_data_space_code <- function(space) {
  value <- as.character(space %||% "TE")
  if (value %in% c("TE", "RNA", "Ribo")) return(value)
  switch(value, `TE Ratio` = "TE", `RNA Abundance` = "RNA", `Ribo Abundance` = "Ribo", "TE")
}

pca_data_space_label <- function(space) {
  switch(as.character(space), TE = "TE Ratio", RNA = "RNA Abundance", Ribo = "Ribo Abundance", as.character(space))
}

pca_short_names <- function(pairs) {
  counters <- c(Control = 0L, Treatment = 0L)
  entries <- list(rna = list(), ribo = list(), te = list())
  for (index in seq_len(nrow(pairs))) {
    pair_row <- pairs[index, , drop = FALSE]
    role <- as.character(pair_row$group_role[[1]])
    counters[[role]] <- counters[[role]] + 1L
    suffix <- if (identical(role, "Control")) paste0("C", counters[[role]]) else paste0("T", counters[[role]])
    entries$rna[[length(entries$rna) + 1L]] <- data.frame(display_sample = paste0("RNA.", suffix), actual_sample = as.character(pair_row$rna_sample[[1]]), actual_rna = as.character(pair_row$rna_sample[[1]]), actual_ribo = "", group = role, stringsAsFactors = FALSE)
    entries$ribo[[length(entries$ribo) + 1L]] <- data.frame(display_sample = paste0("RPF.", suffix), actual_sample = as.character(pair_row$ribo_sample[[1]]), actual_rna = "", actual_ribo = as.character(pair_row$ribo_sample[[1]]), group = role, stringsAsFactors = FALSE)
    entries$te[[length(entries$te) + 1L]] <- data.frame(display_sample = paste0("TE.", suffix), actual_sample = paste0(as.character(pair_row$ribo_sample[[1]]), " / ", as.character(pair_row$rna_sample[[1]])), actual_rna = as.character(pair_row$rna_sample[[1]]), actual_ribo = as.character(pair_row$ribo_sample[[1]]), group = role, stringsAsFactors = FALSE)
  }
  lapply(entries, function(rows) do.call(rbind, rows))
}

pca_numeric_matrix <- function(data_frame, columns) {
  if (!all(columns %in% colnames(data_frame))) {
    stop("Saved sample pairing does not match the TE result table columns.", call. = FALSE)
  }
  values <- as.matrix(data.frame(lapply(data_frame[, columns, drop = FALSE], as.numeric), check.names = FALSE))
  rownames(values) <- if ("GeneID" %in% colnames(data_frame)) as.character(data_frame$GeneID) else seq_len(nrow(data_frame))
  values
}

pca_prepare_matrix <- function(mat) {
  finite_rows <- apply(mat, 1, function(row) all(is.finite(row)))
  mat <- mat[finite_rows, , drop = FALSE]
  variable_rows <- apply(mat, 1, function(row) stats::var(row, na.rm = TRUE) > 0)
  mat <- mat[variable_rows, , drop = FALSE]
  if (!nrow(mat)) {
    stop("No variable finite features remain after PCA filtering.", call. = FALSE)
  }
  mat
}

pca_axis_labels <- function(method, fit = NULL) {
  if (identical(method, "PCA") && !is.null(fit$sdev)) {
    explained <- round(100 * (fit$sdev^2) / sum(fit$sdev^2), 1)
    return(list(x = sprintf("PC1 (%s%%)", explained[[1]]), y = sprintf("PC2 (%s%%)", explained[[2]])))
  }
  list(x = "Dimension 1", y = "Dimension 2")
}

pca_coordinates <- function(mat, method) {
  if (ncol(mat) < 2L) {
    stop("At least two samples are required for PCA projection.", call. = FALSE)
  }
  if (identical(method, "PCA")) {
    fit <- stats::prcomp(t(mat), center = TRUE, scale. = FALSE)
    return(list(coordinates = fit$x[, 1:2, drop = FALSE], axis = pca_axis_labels(method, fit)))
  }
  if (identical(method, "MDS")) {
    correlation <- suppressWarnings(stats::cor(mat, use = "pairwise.complete.obs", method = "pearson"))
    correlation[!is.finite(correlation)] <- 0
    diag(correlation) <- 1
    distance_matrix <- 1 - correlation
    distance_matrix[distance_matrix < 0] <- 0
    fit <- stats::cmdscale(stats::as.dist(distance_matrix), eig = TRUE, k = 2)
    return(list(coordinates = fit$points[, 1:2, drop = FALSE], axis = pca_axis_labels(method)))
  }
  if (identical(method, "T-SNE")) {
    if (!requireNamespace("Rtsne", quietly = TRUE)) {
      stop("Rtsne is required to run T-SNE projections.", call. = FALSE)
    }
    sample_count <- ncol(mat)
    if (sample_count < 3L) {
      stop("T-SNE requires at least three samples.", call. = FALSE)
    }
    perplexity <- max(1, min(5, floor((sample_count - 1) / 3)))
    perplexity <- min(perplexity, sample_count - 1L)
    set.seed(1)
    fit <- Rtsne::Rtsne(t(mat), dims = 2, perplexity = perplexity, verbose = FALSE, max_iter = 400, check_duplicates = FALSE)
    return(list(coordinates = fit$Y[, 1:2, drop = FALSE], axis = pca_axis_labels(method)))
  }
  stop(sprintf("Unsupported PCA method: %s", method), call. = FALSE)
}

pca_analysis <- function(matrix, pairs, parameters, te_context = NULL) {
  if (is.null(te_context) || is.null(te_context$table) || !is.data.frame(te_context$table)) {
    stop("PCA requires a completed Translation Efficiency result table.", call. = FALSE)
  }
  space <- pca_data_space_code(parameters$dataSpace)
  method <- as.character(parameters$method %||% "PCA")
  if (!method %in% c("PCA", "MDS", "T-SNE")) method <- "PCA"
  base <- analysis_space_contexts(te_context, pairs)
  space_context <- base$spaces[[space]]
  if (is.null(space_context)) stop(sprintf("Unsupported PCA data space: %s", space), call. = FALSE)
  projection <- pca_coordinates(space_context$feature_matrix, method)
  coordinates <- as.data.frame(projection$coordinates, stringsAsFactors = FALSE)
  axis_names <- c(projection$axis$x, projection$axis$y)
  colnames(coordinates) <- axis_names
  display_table <- data.frame(`Display Sample` = space_context$sample_map$display_sample, Group = space_context$sample_map$group, `Data Space` = space_context$label, Method = method, check.names = FALSE, stringsAsFactors = FALSE)
  if (identical(space, "TE")) {
    display_table$`Actual RNA` <- space_context$sample_map$actual_rna
    display_table$`Actual Ribo` <- space_context$sample_map$actual_ribo
    display_table$`Actual Pair` <- space_context$sample_map$actual_sample
  } else {
    display_table$`Actual Sample` <- space_context$sample_map$actual_sample
  }
  table <- cbind(display_table, coordinates)
  points <- data.frame(display_sample = space_context$sample_map$display_sample, actual_sample = space_context$sample_map$actual_sample, actual_rna = space_context$sample_map$actual_rna, actual_ribo = space_context$sample_map$actual_ribo, group = space_context$sample_map$group, x = coordinates[[axis_names[[1]]]], y = coordinates[[axis_names[[2]]]], stringsAsFactors = FALSE)
  list(
    table = table,
    summary = list(metric("Samples Projected", ncol(space_context$feature_matrix)), metric("Genes Used", format(nrow(space_context$feature_matrix), big.mark = ",")), metric("Method", method), metric("Data Space", space_context$label)),
    views = list(list(id = "projection", title = "Projection Plot", type = "scatter")),
    charts = list(projection = list(id = "projection", title = sprintf("%s on %s Space", method, space_context$label), xLabel = projection$axis$x, yLabel = projection$axis$y, rows = points, height = 620, pcaProjection = TRUE, showLegend = TRUE))
  )
}

analysis_space_contexts <- function(te_context, pairs) {
  if (is.null(te_context) || is.null(te_context$table) || !is.data.frame(te_context$table)) {
    stop("This module requires a completed Translation Efficiency result table.", call. = FALSE)
  }
  cached_key_value(
    "analysis_space_contexts",
    list(file_signature(request$teResultPath %||% ""), jsonlite::toJSON(request$samplePairs %||% pairs, auto_unbox = TRUE, null = "null")),
    function() {
      sample_map <- pca_short_names(pairs)
      result_table <- te_context$table
      rna_matrix <- pca_numeric_matrix(result_table, sample_map$rna$actual_sample)
      ribo_matrix <- pca_numeric_matrix(result_table, sample_map$ribo$actual_sample)
      te_matrix <- sapply(seq_len(nrow(sample_map$te)), function(index) {
        log2((as.numeric(result_table[[sample_map$te$actual_ribo[[index]]]]) + 1) / (as.numeric(result_table[[sample_map$te$actual_rna[[index]]]]) + 1))
      })
      if (is.null(dim(te_matrix))) te_matrix <- base::matrix(te_matrix, ncol = 1L)
      rownames(te_matrix) <- if ("GeneID" %in% colnames(result_table)) as.character(result_table$GeneID) else seq_len(nrow(result_table))
      colnames(te_matrix) <- sample_map$te$display_sample
      log_rna_matrix <- log2(rna_matrix + 1)
      colnames(log_rna_matrix) <- sample_map$rna$display_sample
      log_ribo_matrix <- log2(ribo_matrix + 1)
      colnames(log_ribo_matrix) <- sample_map$ribo$display_sample
      list(
        gene_info = data.frame(
          GeneID = as.character(result_table$GeneID),
          gene_name = if ("gene_name" %in% colnames(result_table)) as.character(result_table$gene_name) else rep("unknown", nrow(result_table)),
          stringsAsFactors = FALSE
        ),
        spaces = list(
          TE = list(label = pca_data_space_label("TE"), feature_matrix = pca_prepare_matrix(te_matrix), sample_map = sample_map$te),
          RNA = list(label = pca_data_space_label("RNA"), feature_matrix = pca_prepare_matrix(log_rna_matrix), sample_map = sample_map$rna),
          Ribo = list(label = pca_data_space_label("Ribo"), feature_matrix = pca_prepare_matrix(log_ribo_matrix), sample_map = sample_map$ribo)
        )
      )
    }
  )
}

clustering_select_top_rows <- function(mat, top_genes) {
  gene_count <- min(max(10L, int(top_genes, 2000L)), nrow(mat))
  row_sd <- apply(mat, 1, stats::sd, na.rm = TRUE)
  row_sd[!is.finite(row_sd)] <- -Inf
  mat[order(row_sd, decreasing = TRUE)[seq_len(gene_count)], , drop = FALSE]
}

clustering_clip_matrix <- function(mat, zscore_max) {
  values <- as.numeric(mat[is.finite(mat)])
  if (!length(values)) return(mat)
  global_median <- stats::median(values)
  global_sd <- stats::sd(values)
  if (!is.finite(global_sd) || global_sd <= 0) return(mat)
  upper <- global_median + zscore_max * global_sd
  lower <- global_median - zscore_max * global_sd
  mat[mat > upper] <- upper
  mat[mat < lower] <- lower
  mat
}

clustering_distance_object <- function(mat, method = "Pearson", axis = c("rows", "columns")) {
  axis <- match.arg(axis)
  matrix_data <- if (identical(axis, "columns")) t(mat) else mat
  if (!is.matrix(matrix_data) || nrow(matrix_data) < 2L) return(NULL)
  if (identical(method, "Euclidean")) return(stats::dist(matrix_data))
  correlation <- suppressWarnings(stats::cor(t(matrix_data), method = "pearson", use = "pairwise.complete.obs"))
  correlation[!is.finite(correlation)] <- 0
  diag(correlation) <- 1
  distance <- if (identical(method, "Absolute_Pearson")) 1 - abs(correlation) else 1 - correlation
  distance[!is.finite(distance)] <- 1
  distance[distance < 0] <- 0
  stats::as.dist(distance)
}

clustering_hclust_order <- function(mat, method, linkage, axis = c("rows", "columns")) {
  axis <- match.arg(axis)
  count <- if (identical(axis, "columns")) ncol(mat) else nrow(mat)
  if (!is.numeric(count) || count <= 1L) return(seq_len(max(1L, count)))
  distance <- clustering_distance_object(mat, method, axis)
  if (is.null(distance)) return(seq_len(count))
  stats::hclust(distance, method = linkage)$order
}

heatmap_columns_payload <- function(sample_map) {
  lapply(seq_len(nrow(sample_map)), function(index) {
    row <- sample_map[index, , drop = FALSE]
    list(
      displaySample = as.character(row$display_sample[[1]]),
      actualSample = as.character(row$actual_sample[[1]]),
      actualRna = as.character(row$actual_rna[[1]]),
      actualRibo = as.character(row$actual_ribo[[1]]),
      group = as.character(row$group[[1]])
    )
  })
}

heatmap_matrix_payload <- function(mat) {
  lapply(seq_len(nrow(mat)), function(index) as.list(unname(as.numeric(mat[index, ]))))
}

heatmap_payload <- function(mat, sample_map, title, show_row_labels = FALSE, empty_message = NULL, brush_enabled = TRUE) {
  if (is.null(mat) || !is.matrix(mat) || !nrow(mat) || !ncol(mat)) {
    return(list(title = title, subtitle = "", palette = list("#4b74b6", "#ffffff", "#c23b35"), rowLabels = list(), columns = list(), matrix = list(), showRowLabels = FALSE, brushEnabled = isTRUE(brush_enabled), emptyMessage = empty_message %||% "No heatmap data available."))
  }
  list(
    title = title,
    subtitle = sprintf("%s genes x %s samples", format(nrow(mat), big.mark = ","), ncol(mat)),
    palette = list("#4b74b6", "#ffffff", "#c23b35"),
    rowLabels = as.list(rownames(mat)),
    columns = heatmap_columns_payload(sample_map),
    matrix = heatmap_matrix_payload(mat),
    showRowLabels = isTRUE(show_row_labels),
    brushEnabled = isTRUE(brush_enabled),
    emptyMessage = empty_message %||% ""
  )
}

clustering_export_table <- function(mat, sample_map) {
  if (is.null(mat) || !is.matrix(mat) || !nrow(mat) || !ncol(mat)) return(data.frame())
  rows <- lapply(seq_len(ncol(mat)), function(index) {
    data.frame(
      GeneID = rownames(mat),
      `Display Sample` = sample_map$display_sample[[index]],
      `Actual Sample` = sample_map$actual_sample[[index]],
      `Actual RNA` = sample_map$actual_rna[[index]],
      `Actual Ribo` = sample_map$actual_ribo[[index]],
      Group = sample_map$group[[index]],
      Value = as.numeric(mat[, index]),
      check.names = FALSE,
      stringsAsFactors = FALSE
    )
  })
  do.call(rbind, rows)
}

clustering_analysis <- function(matrix, pairs, parameters, te_context = NULL) {
  base <- analysis_space_contexts(te_context, pairs)
  space <- pca_data_space_code(parameters$dataSpace)
  space_context <- base$spaces[[space]]
  if (is.null(space_context)) stop(sprintf("Unsupported clustering data space: %s", space), call. = FALSE)
  distance <- as.character(parameters$distance %||% "Pearson")
  if (!distance %in% c("Pearson", "Euclidean", "Absolute_Pearson")) distance <- "Pearson"
  linkage <- as.character(parameters$linkage %||% "average")
  if (!linkage %in% c("average", "complete", "single", "median", "centroid", "mcquitty")) linkage <- "average"
  mat <- clustering_select_top_rows(space_context$feature_matrix, parameters$topGenes)
  if (isTRUE(parameters$geneCentricity)) {
    mat <- mat - rowMeans(mat, na.rm = TRUE)
  }
  mat <- clustering_clip_matrix(mat, num(parameters$zscoreMax, 3))
  row_order <- clustering_hclust_order(mat, distance, linkage, "rows")
  col_order <- clustering_hclust_order(mat, distance, linkage, "columns")
  ordered <- mat[row_order, col_order, drop = FALSE]
  sample_map <- space_context$sample_map[col_order, , drop = FALSE]
  detail_mode <- as.character(parameters$detailMode %||% "Select Area")
  gene_ids <- trimws(as.character(parameters$detailGeneIds %||% ""))
  detail <- NULL
  detail_message <- "Select an area in the main heatmap or enter Gene IDs to show a detail heatmap."
  if (grepl("gene", detail_mode, ignore.case = TRUE) && nzchar(gene_ids)) {
    requested <- unique(unlist(strsplit(gene_ids, "[,，\\s]+", perl = TRUE), use.names = FALSE))
    requested <- requested[nzchar(requested)]
    matched <- which(rownames(ordered) %in% requested)
    if (length(matched)) {
      detail <- ordered[matched, , drop = FALSE]
      detail_message <- sprintf("%s matched genes x %s samples", format(nrow(detail), big.mark = ","), ncol(detail))
    } else {
      detail_message <- "None of the requested Gene IDs are present in the clustered matrix."
    }
  }
  table <- clustering_export_table(ordered, sample_map)
  list(
    table = table,
    summary = list(metric("Genes Clustered", format(nrow(ordered), big.mark = ",")), metric("Samples Clustered", ncol(ordered)), metric("Data Space", space_context$label), metric("Distance", distance)),
    views = list(list(id = "clustering", title = "Clustering", type = "clustering")),
    charts = list(clustering = list(
      main = heatmap_payload(ordered, sample_map, sprintf("Clustered %s Heatmap", space_context$label), show_row_labels = FALSE, brush_enabled = !grepl("gene", detail_mode, ignore.case = TRUE)),
      detail = heatmap_payload(detail, sample_map, "Detail Heatmap", show_row_labels = !is.null(detail) && nrow(detail) <= 80L, empty_message = detail_message, brush_enabled = FALSE),
      detailModeLabel = if (grepl("gene", detail_mode, ignore.case = TRUE)) "Gene IDs" else "Select Area",
      detailSummary = if (!is.null(detail)) detail_message else "",
      detailEmptyMessage = if (is.null(detail)) detail_message else ""
    ))
  )
}

gene_set_collection_code <- function(collection, default = "go_bp") {
  normalized <- tolower(trimws(as.character(collection %||% default)))
  normalized <- gsub("[^a-z0-9]+", "_", normalized)
  switch(normalized,
    hallmark = "hallmark",
    h_all = "hallmark",
    reactome = "reactome",
    go_biological_process = "go_bp",
    go_bp = "go_bp",
    biological_process = "go_bp",
    go_molecular_function = "go_mf",
    go_mf = "go_mf",
    molecular_function = "go_mf",
    go_cellular_component = "go_cc",
    go_cc = "go_cc",
    cellular_component = "go_cc",
    kegg = "kegg",
    kegg_medicus = "kegg",
    default
  )
}

gene_set_collection_label <- function(collection) {
  switch(as.character(collection),
    hallmark = "Hallmark",
    reactome = "Reactome",
    go_bp = "GO Biological Process",
    go_mf = "GO Molecular Function",
    go_cc = "GO Cellular Component",
    kegg = "KEGG",
    as.character(collection)
  )
}

gene_set_collection_values <- function(module_id, species_id) {
  species_key <- trimws(as.character(species_id %||% ""))
  module_key <- trimws(as.character(module_id %||% ""))
  if (identical(module_key, "gsea")) {
    return(switch(species_key,
      hg38 = c("hallmark", "reactome", "go_bp"),
      osa_IRGSP_1 = c("go_bp", "go_mf", "go_cc", "kegg"),
      character()
    ))
  }
  if (identical(module_key, "enrichment")) {
    return(switch(species_key,
      hg38 = c("go_bp", "go_mf", "go_cc", "kegg"),
      osa_IRGSP_1 = c("go_bp", "go_mf", "go_cc", "kegg"),
      character()
    ))
  }
  character()
}

gene_set_default_collection <- function(module_id, species_id) {
  values <- gene_set_collection_values(module_id, species_id)
  if (length(values)) unname(values[1]) else if (identical(as.character(module_id), "gsea")) "hallmark" else "go_bp"
}

gene_set_normalize_collection <- function(value, module_id, species_id) {
  default <- gene_set_default_collection(module_id, species_id)
  collection <- gene_set_collection_code(value, default)
  supported <- gene_set_collection_values(module_id, species_id)
  if (!length(supported) || !collection %in% supported) default else collection
}

gene_set_pattern <- function(collection, species_id, module_id) {
  species_key <- trimws(as.character(species_id %||% ""))
  collection <- as.character(collection)
  module_key <- as.character(module_id %||% "")

  if (identical(species_key, "hg38") && identical(module_key, "gsea")) {
    return(switch(collection,
      hallmark = "^h\\.all\\..*\\.Hs\\.symbols\\.gmt$",
      reactome = "^c2\\.cp\\.reactome\\..*\\.Hs\\.symbols\\.gmt$",
      go_bp = "^c5\\.go\\.bp\\..*\\.Hs\\.symbols\\.gmt$",
      NULL
    ))
  }
  if (identical(species_key, "hg38") && identical(module_key, "enrichment")) {
    return(switch(collection,
      go_bp = "^c5\\.go\\.bp\\..*\\.Hs\\.symbols\\.gmt$",
      go_mf = "^c5\\.go\\.mf\\..*\\.Hs\\.symbols\\.gmt$",
      go_cc = "^c5\\.go\\.cc\\..*\\.Hs\\.symbols\\.gmt$",
      kegg = "^c2\\.cp\\.kegg_medicus\\..*\\.Hs\\.symbols\\.gmt$",
      NULL
    ))
  }
  if (identical(species_key, "osa_IRGSP_1")) {
    return(switch(collection,
      go_bp = "^osa_IRGSP_1\\.go\\.bp\\.gmt$",
      go_mf = "^osa_IRGSP_1\\.go\\.mf\\.gmt$",
      go_cc = "^osa_IRGSP_1\\.go\\.cc\\.gmt$",
      kegg = "^osa_IRGSP_1\\.kegg\\.gmt$",
      NULL
    ))
  }
  NULL
}

gene_set_resource_path <- function(annotation_dir, collection, species_id, module_id) {
  species_key <- trimws(as.character(species_id %||% ""))
  if (!nzchar(species_key)) return(NULL)
  root <- file.path(annotation_dir %||% "", species_key)
  pattern <- gene_set_pattern(collection, species_key, module_id)
  if (is.null(pattern) || !dir.exists(root)) return(NULL)
  candidates <- sort(list.files(root, pattern = pattern, full.names = TRUE, ignore.case = TRUE))
  if (length(candidates) == 1L) {
    candidate <- unname(candidates)
    return(normalizePath(candidate, winslash = "/", mustWork = TRUE))
  }
  if (length(candidates) > 1L) {
    stop(sprintf(
      "Multiple %s gene-set files were found for species %s. Keep one matching file in %s.",
      gene_set_collection_label(collection),
      species_key,
      normalizePath(root, winslash = "/", mustWork = TRUE)
    ), call. = FALSE)
  }
  NULL
}

read_gmt_resource <- function(path) {
  cached_file_value("gmt_resource", path, function(resource_path) {
    lines <- readLines(resource_path, warn = FALSE, encoding = "UTF-8")
    parsed <- lapply(lines, function(line) {
      fields <- strsplit(line, "\t", fixed = TRUE)[[1]]
      if (length(fields) < 3L) return(NULL)
      genes <- unique(toupper(trimws(fields[-c(1, 2)])))
      genes <- genes[nzchar(genes)]
      if (!length(genes)) return(NULL)
      list(pathway_id = as.character(fields[[1]]), memo = as.character(fields[[2]]), genes = genes)
    })
    parsed <- Filter(Negate(is.null), parsed)
    list(
      pathways = stats::setNames(lapply(parsed, `[[`, "genes"), vapply(parsed, `[[`, character(1), "pathway_id")),
      metadata = data.frame(pathway_id = vapply(parsed, `[[`, character(1), "pathway_id"), memo = vapply(parsed, `[[`, character(1), "memo"), stringsAsFactors = FALSE)
    )
  })
}

gene_symbol_map <- function(annotation_dir, species_id) {
  species_key <- trimws(as.character(species_id %||% ""))
  if (is.null(annotation_dir) || !dir.exists(annotation_dir) || !nzchar(species_key)) {
    return(setNames(character(0), character(0)))
  }
  sqlite_path <- file.path(annotation_dir, sprintf("%s.geneInfo.sqlite", species_key))
  if (!file.exists(sqlite_path) || !requireNamespace("DBI", quietly = TRUE) || !requireNamespace("RSQLite", quietly = TRUE)) {
    return(setNames(character(0), character(0)))
  }
  cached_file_value("gene_symbol_map", sqlite_path, function(resource_path) {
    con <- DBI::dbConnect(RSQLite::SQLite(), resource_path)
    on.exit(DBI::dbDisconnect(con), add = TRUE)
    if (!"geneInfo" %in% DBI::dbListTables(con)) return(setNames(character(0), character(0)))
    info <- DBI::dbReadTable(con, "geneInfo")
    if (!all(c("ensembl_gene_id", "symbol") %in% colnames(info))) return(setNames(character(0), character(0)))
    symbols <- toupper(trimws(as.character(info$symbol)))
    ids <- sub("\\.\\d+$", "", trimws(as.character(info$ensembl_gene_id)))
    keep <- nzchar(ids) & nzchar(symbols)
    stats::setNames(symbols[keep], ids[keep])
  })
}

te_gene_symbols <- function(result_table, annotation_dir, species_id) {
  if (identical(as.character(species_id %||% ""), "osa_IRGSP_1")) {
    for (column_name in c("GeneID", "gene_id", "gene_name", "GeneSymbol", "SYMBOL", "symbol")) {
      if (column_name %in% colnames(result_table)) {
        identifiers <- toupper(trimws(as.character(result_table[[column_name]])))
        return(sub("\\.\\d+$", "", identifiers))
      }
    }
  }
  symbol <- rep("", nrow(result_table))
  for (column_name in c("gene_name", "GeneSymbol", "SYMBOL", "symbol")) {
    if (column_name %in% colnames(result_table)) {
      symbol <- toupper(trimws(as.character(result_table[[column_name]])))
      break
    }
  }
  missing <- !nzchar(symbol) | is.na(symbol) | symbol == "UNKNOWN"
  if (any(missing) && "GeneID" %in% colnames(result_table)) {
    map <- gene_symbol_map(annotation_dir, species_id)
    ids <- sub("\\.\\d+$", "", trimws(as.character(result_table$GeneID)))
    mapped <- unname(map[ids])
    symbol[missing & !is.na(mapped) & nzchar(mapped)] <- mapped[missing & !is.na(mapped) & nzchar(mapped)]
  }
  if ("GeneID" %in% colnames(result_table)) {
    fallback <- toupper(trimws(as.character(result_table$GeneID)))
    symbol[!nzchar(symbol) | is.na(symbol)] <- fallback[!nzchar(symbol) | is.na(symbol)]
  }
  symbol
}

te_rank_column <- function(result_table) {
  for (column_name in c("TE_log2FC", "log2FoldChange", "logTEfc")) {
    if (column_name %in% colnames(result_table)) return(column_name)
  }
  NULL
}

gsea_prepare_ranked_stats <- function(result_table, annotation_dir, species_id) {
  score_column <- te_rank_column(result_table)
  if (is.null(score_column)) stop("Translation Efficiency results do not include a TE log2 fold-change column for GSEA ranking.", call. = FALSE)
  ranked <- data.frame(gene_id = te_gene_symbols(result_table, annotation_dir, species_id), score = suppressWarnings(as.numeric(result_table[[score_column]])), stringsAsFactors = FALSE)
  ranked <- ranked[nzchar(ranked$gene_id) & !is.na(ranked$gene_id) & is.finite(ranked$score), , drop = FALSE]
  if (!nrow(ranked)) stop("No finite gene identifiers remain after preparing the ranked TE list for GSEA.", call. = FALSE)
  ranked <- ranked[order(abs(ranked$score), decreasing = TRUE), , drop = FALSE]
  ranked <- ranked[!duplicated(ranked$gene_id), , drop = FALSE]
  ranked <- ranked[order(-ranked$score, ranked$gene_id), , drop = FALSE]
  stats <- ranked$score - (seq_len(nrow(ranked)) * 1e-12)
  names(stats) <- ranked$gene_id
  stats
}

pretty_pathway_name <- function(pathway_id, collection) {
  display_name <- as.character(pathway_id)
  display_name <- switch(as.character(collection),
    hallmark = sub("^HALLMARK_", "", display_name),
    reactome = sub("^REACTOME_", "", display_name),
    go_bp = sub("^GOBP_", "", display_name),
    go_mf = sub("^GOMF_", "", display_name),
    go_cc = sub("^GOCC_", "", display_name),
    kegg = sub("^KEGG_MEDICUS_|^KEGG_", "", display_name),
    display_name
  )
  gsub("_", " ", display_name)
}

gsea_metric_points_payload <- function(stats) {
  ranked_stats <- sort(stats, decreasing = TRUE)
  lapply(seq_along(ranked_stats), function(index) list(x = unname(as.integer(index)), y = unname(as.numeric(ranked_stats[[index]]))))
}

gsea_hits_for_pathway <- function(stats, pathway_genes) {
  ranked_names <- names(sort(stats, decreasing = TRUE))
  as.list(as.integer(which(ranked_names %in% unique(toupper(pathway_genes)))))
}

gsea_rows_payload <- function(df) {
  if (is.null(df) || !is.data.frame(df) || !nrow(df)) return(list())
  lapply(seq_len(nrow(df)), function(index) {
    row <- df[index, , drop = FALSE]
    list(pathwayId = as.character(row$pathway_id[[1]]), pathway = as.character(row$pathway[[1]]), nes = unname(as.numeric(row$NES[[1]])), pvalue = unname(as.numeric(row$pval[[1]])), padj = unname(as.numeric(row$padj[[1]])), size = unname(as.integer(row$size[[1]])), leadingEdgeSize = unname(as.integer(row$leading_edge_size[[1]])), direction = as.character(row$direction[[1]]), significant = isTRUE(row$significant[[1]]))
  })
}

gsea_analysis <- function(te, annotation_dir, parameters, species_id) {
  if (is.null(te) || is.null(te$table) || !is.data.frame(te$table)) stop("GSEA requires a completed Translation Efficiency result table.", call. = FALSE)
  if (!requireNamespace("fgsea", quietly = TRUE)) stop("GSEA requires the fgsea R package.", call. = FALSE)
  collection <- gene_set_normalize_collection(parameters$collection, "gsea", species_id)
  path <- gene_set_resource_path(annotation_dir, collection, species_id, "gsea")
  if (is.null(path)) stop(sprintf("GSEA gene-set file for %s was not found under the selected annotation directory.", gene_set_collection_label(collection)), call. = FALSE)
  resource <- read_gmt_resource(path)
  ranked_stats <- gsea_prepare_ranked_stats(te$table, annotation_dir, species_id)
  fgsea_result <- if (requireNamespace("BiocParallel", quietly = TRUE)) {
    fgsea::fgseaMultilevel(pathways = resource$pathways, stats = ranked_stats, minSize = int(parameters$genesetMin, 5L), maxSize = int(parameters$genesetMax, 500L), eps = 0, BPPARAM = BiocParallel::SerialParam())
  } else {
    fgsea::fgseaMultilevel(pathways = resource$pathways, stats = ranked_stats, minSize = int(parameters$genesetMin, 5L), maxSize = int(parameters$genesetMax, 500L), eps = 0)
  }
  fgsea_df <- as.data.frame(fgsea_result, stringsAsFactors = FALSE)
  if (!nrow(fgsea_df)) stop("No gene sets remained after applying the selected GSEA size filters.", call. = FALSE)
  fgsea_df$leading_edge_size <- lengths(fgsea_result$leadingEdge)
  fgsea_df$direction <- ifelse(fgsea_df$NES >= 0, "Up", "Down")
  fgsea_df$pathway_raw <- fgsea_df$pathway
  fgsea_df$pathway <- vapply(fgsea_df$pathway_raw, pretty_pathway_name, character(1), collection = collection)
  fgsea_df$pathway_id <- fgsea_df$pathway_raw
  fgsea_df <- fgsea_df[is.finite(fgsea_df$NES) & is.finite(fgsea_df$pval) & is.finite(fgsea_df$padj), , drop = FALSE]
  if (!nrow(fgsea_df)) stop("No finite GSEA statistics were produced for the selected gene-set collection.", call. = FALSE)
  fgsea_df$significant <- is.finite(fgsea_df$padj) & fgsea_df$padj <= num(parameters$fdrCutoff, 0.05)
  ordered <- fgsea_df[order(fgsea_df$padj, -abs(fgsea_df$NES), fgsea_df$pval), , drop = FALSE]
  significant <- ordered[ordered$significant, , drop = FALSE]
  show_n <- min(max(5L, int(parameters$showN, 20L)), nrow(ordered))
  displayed <- utils::head(if (nrow(significant)) significant else ordered, show_n)
  plot_catalog <- list(
    maxRank = as.integer(length(ranked_stats)),
    metricPoints = gsea_metric_points_payload(ranked_stats),
    pathways = lapply(seq_len(nrow(displayed)), function(index) {
      pathway_id <- as.character(displayed$pathway_id[[index]])
      list(pathwayId = pathway_id, hits = gsea_hits_for_pathway(ranked_stats, resource$pathways[[pathway_id]]))
    })
  )
  export_table <- data.frame(pathway = ordered$pathway, pathway_id = ordered$pathway_id, NES = ordered$NES, pvalue = ordered$pval, padj = ordered$padj, size = ordered$size, leading_edge_size = ordered$leading_edge_size, direction = ordered$direction, significant = ordered$significant, stringsAsFactors = FALSE)
  list(
    table = export_table,
    summary = list(metric("Collection", gene_set_collection_label(collection)), metric("Terms Tested", format(nrow(ordered), big.mark = ",")), metric("Displayed", nrow(displayed)), metric("FDR < Cutoff", nrow(significant))),
    views = list(list(id = "gsea", title = "GSEA", type = "gsea")),
    charts = list(gsea = list(collectionLabel = gene_set_collection_label(collection), table = list(rows = gsea_rows_payload(displayed), totalTested = nrow(ordered), significantCount = nrow(significant), displayedCount = nrow(displayed), fdrCutoff = num(parameters$fdrCutoff, 0.05)), plotCatalog = plot_catalog, note = if (!nrow(significant)) "No pathways met the current FDR cutoff; showing the top tested pathways." else NULL))
  )
}

enrichment_rows_payload <- function(df) {
  if (is.null(df) || !is.data.frame(df) || !nrow(df)) return(list())
  lapply(seq_len(nrow(df)), function(index) {
    row <- df[index, , drop = FALSE]
    list(pathwayId = as.character(row$pathway_id[[1]]), pathway = as.character(row$pathway[[1]]), rawPathway = as.character(row$pathway_id[[1]]), group = as.character(row$group[[1]]), pvalue = unname(as.numeric(row$pval[[1]])), padj = unname(as.numeric(row$padj[[1]])), fold = unname(as.numeric(row$fold[[1]])), overlap = unname(as.integer(row$overlap[[1]])), pathwaySize = unname(as.integer(row$pathway_size[[1]])), querySize = unname(as.integer(row$query_size[[1]])), backgroundSize = unname(as.integer(row$background_size[[1]])))
  })
}

enrichment_gene_table <- function(result_table, annotation_dir, species_id) {
  score_column <- te_rank_column(result_table)
  if (is.null(score_column) || !"padj" %in% colnames(result_table)) stop("Translation Efficiency results do not include the gene identifier, TE log2FC, and padj columns required for Enrichment.", call. = FALSE)
  table <- data.frame(gene_symbol = te_gene_symbols(result_table, annotation_dir, species_id), log2fc = suppressWarnings(as.numeric(result_table[[score_column]])), padj = suppressWarnings(as.numeric(result_table$padj)), stringsAsFactors = FALSE)
  table <- table[nzchar(table$gene_symbol) & !is.na(table$gene_symbol) & is.finite(table$log2fc) & is.finite(table$padj), , drop = FALSE]
  table <- table[order(abs(table$log2fc), decreasing = TRUE), , drop = FALSE]
  table <- table[!duplicated(table$gene_symbol), , drop = FALSE]
  if (!nrow(table)) stop("No valid gene symbols remain after preparing Enrichment inputs.", call. = FALSE)
  table
}

enrichment_overlap_rows <- function(query_genes, background_genes, resource, collection, sort_by = "FDR", remove_redundant = FALSE, top_pathways = 10L) {
  query_genes <- intersect(unique(query_genes), unique(background_genes))
  if (!length(query_genes)) return(list(tested = data.frame(), significant = data.frame(), displayed = data.frame()))
  rows <- lapply(names(resource$pathways), function(pathway_id) {
    pathway_genes <- intersect(resource$pathways[[pathway_id]], background_genes)
    overlap_genes <- intersect(query_genes, pathway_genes)
    if (!length(overlap_genes) || !length(pathway_genes)) return(NULL)
    p_value <- stats::phyper(length(overlap_genes) - 1L, length(pathway_genes), length(background_genes) - length(pathway_genes), length(query_genes), lower.tail = FALSE)
    fold <- (length(overlap_genes) / length(query_genes)) / (length(pathway_genes) / length(background_genes))
    data.frame(pathway_id = pathway_id, pathway = pretty_pathway_name(pathway_id, collection), overlap = length(overlap_genes), query_size = length(query_genes), pathway_size = length(pathway_genes), background_size = length(background_genes), fold = fold, pval = p_value, genes = paste(sort(overlap_genes), collapse = ";"), stringsAsFactors = FALSE)
  })
  tested <- do.call(rbind, Filter(Negate(is.null), rows))
  if (is.null(tested) || !nrow(tested)) return(list(tested = data.frame(), significant = data.frame(), displayed = data.frame()))
  tested$padj <- stats::p.adjust(tested$pval, method = "fdr")
  significant <- tested[is.finite(tested$padj) & tested$padj < 0.1, , drop = FALSE]
  orderer <- function(df) if (identical(sort_by, "Fold")) df[order(df$fold, decreasing = TRUE), , drop = FALSE] else df[order(df$padj, -df$fold, df$pval), , drop = FALSE]
  significant <- orderer(significant)
  tested <- orderer(tested)
  if (isTRUE(remove_redundant) && nrow(significant) > 5L) {
    keep <- !duplicated(tolower(sub("\\s+.*$", "", significant$pathway)))
    significant <- significant[keep, , drop = FALSE]
  }
  list(tested = tested, significant = significant, displayed = utils::head(if (nrow(significant)) significant else tested, as.integer(top_pathways)))
}

enrichment_analysis <- function(te, annotation_dir, parameters, species_id) {
  if (is.null(te) || is.null(te$table) || !is.data.frame(te$table)) stop("Enrichment requires a completed Translation Efficiency result table.", call. = FALSE)
  collection <- gene_set_normalize_collection(parameters$collection, "enrichment", species_id)
  path <- gene_set_resource_path(annotation_dir, collection, species_id, "enrichment")
  if (is.null(path)) stop(sprintf("Enrichment gene-set file for %s was not found under the selected annotation directory.", gene_set_collection_label(collection)), call. = FALSE)
  resource <- read_gmt_resource(path)
  gene_table <- enrichment_gene_table(te$table, annotation_dir, species_id)
  gene_lists <- list(Up = unique(gene_table$gene_symbol[gene_table$log2fc > log2(2) & gene_table$padj < 0.1]), Down = unique(gene_table$gene_symbol[gene_table$log2fc < -log2(2) & gene_table$padj < 0.1]))
  background <- if (isTRUE(parameters$filteredBackground)) unique(gene_table$gene_symbol) else unique(unlist(resource$pathways, use.names = FALSE))
  sort_by <- if (identical(toupper(as.character(parameters$sortBy %||% "FDR")), "FOLD")) "Fold" else "FDR"
  grouped <- lapply(gene_lists, enrichment_overlap_rows, background_genes = background, resource = resource, collection = collection, sort_by = sort_by, remove_redundant = isTRUE(parameters$removeRedundant), top_pathways = min(30L, max(1L, int(parameters$topPathways, 10L))))
  combine <- function(scope) {
    parts <- lapply(names(grouped), function(group_name) {
      df <- grouped[[group_name]][[scope]]
      if (is.null(df) || !nrow(df)) return(NULL)
      df$group <- group_name
      df
    })
    out <- do.call(rbind, Filter(Negate(is.null), parts))
    if (is.null(out)) data.frame() else out
  }
  displayed <- combine("displayed")
  significant <- combine("significant")
  tested <- combine("tested")
  if (!nrow(tested)) stop("No overlapping pathways were found for the current Enrichment query genes.", call. = FALSE)
  export_table <- tested[, c("group", "pathway", "pathway_id", "overlap", "query_size", "pathway_size", "background_size", "fold", "pval", "padj", "genes"), drop = FALSE]
  list(
    table = export_table,
    summary = list(metric("Collection", gene_set_collection_label(collection)), metric("Terms Tested", format(nrow(tested), big.mark = ",")), metric("Displayed", nrow(displayed)), metric("FDR < 0.10", nrow(significant))),
    views = list(list(id = "enrichment", title = "Enrichment", type = "enrichment")),
    charts = list(enrichment = list(collectionLabel = gene_set_collection_label(collection), backgroundLabel = if (isTRUE(parameters$filteredBackground)) "Filtered Genes" else "Full Collection", note = if (!nrow(significant)) "No pathways met the default enrichment FDR threshold of 0.10; showing top tested terms." else NULL, plot = list(rows = enrichment_rows_payload(displayed)), table = list(rows = enrichment_rows_payload(displayed), totalRows = nrow(displayed), testedCount = nrow(tested), significantCount = nrow(significant))))
  )
}

network_prepare_feature_matrix <- function(mat, variable_genes = 1000L) {
  if (!is.matrix(mat) || !nrow(mat) || !ncol(mat)) stop("No feature matrix is available for Network analysis.", call. = FALSE)
  if (ncol(mat) < 4L) stop("Network analysis requires at least four samples.", call. = FALSE)
  mat <- mat[apply(mat, 1, function(row) all(is.finite(row))), , drop = FALSE]
  mat <- mat[apply(mat, 1, function(row) stats::sd(row, na.rm = TRUE) > 0), , drop = FALSE]
  if (nrow(mat) < 50L) stop("At least 50 variable genes are required for Network analysis.", call. = FALSE)
  requested <- min(max(50L, int(variable_genes, 1000L)), nrow(mat), 3000L)
  row_sd <- apply(mat, 1, stats::sd, na.rm = TRUE)
  row_sd[!is.finite(row_sd)] <- -Inf
  mat[order(row_sd, decreasing = TRUE)[seq_len(requested)], , drop = FALSE]
}

network_require_packages <- function() {
  missing <- c("WGCNA", "dynamicTreeCut")[!vapply(c("WGCNA", "dynamicTreeCut"), requireNamespace, quietly = TRUE, logical(1))]
  if (length(missing)) {
    stop(sprintf("Network analysis requires missing packages: %s", paste(missing, collapse = ", ")), call. = FALSE)
  }
}

network_space_contexts <- function(te_context, pairs) {
  if (is.null(te_context) || is.null(te_context$table) || !is.data.frame(te_context$table)) {
    stop("Network requires a completed Translation Efficiency result table.", call. = FALSE)
  }
  cached_key_value(
    "network_space_contexts",
    list(file_signature(request$teResultPath %||% ""), jsonlite::toJSON(request$samplePairs %||% pairs, auto_unbox = TRUE, null = "null")),
    function() {
      sample_map <- pca_short_names(pairs)
      result_table <- te_context$table
      rna_matrix <- pca_numeric_matrix(result_table, sample_map$rna$actual_sample)
      ribo_matrix <- pca_numeric_matrix(result_table, sample_map$ribo$actual_sample)
      te_ratio_matrix <- sapply(seq_len(nrow(sample_map$te)), function(index) {
        actual_rna <- sample_map$te$actual_rna[[index]]
        actual_ribo <- sample_map$te$actual_ribo[[index]]
        if (!all(c(actual_rna, actual_ribo) %in% colnames(result_table))) {
          stop("TE result table is missing RNA or Ribo sample columns required for Network.", call. = FALSE)
        }
        as.numeric(result_table[[actual_ribo]]) / as.numeric(result_table[[actual_rna]])
      })
      if (is.null(dim(te_ratio_matrix))) te_ratio_matrix <- base::matrix(te_ratio_matrix, ncol = 1L)
      rownames(te_ratio_matrix) <- if ("GeneID" %in% colnames(result_table)) as.character(result_table$GeneID) else seq_len(nrow(result_table))
      colnames(te_ratio_matrix) <- sample_map$te$display_sample
      log_rna_matrix <- log2(rna_matrix + 1)
      colnames(log_rna_matrix) <- sample_map$rna$display_sample
      log_ribo_matrix <- log2(ribo_matrix + 1)
      colnames(log_ribo_matrix) <- sample_map$ribo$display_sample
      list(
        gene_info = data.frame(
          GeneID = as.character(result_table$GeneID),
          gene_name = if ("gene_name" %in% colnames(result_table)) as.character(result_table$gene_name) else rep("unknown", nrow(result_table)),
          stringsAsFactors = FALSE
        ),
        spaces = list(
          TE = list(label = pca_data_space_label("TE"), feature_matrix = te_ratio_matrix, sample_map = sample_map$te),
          RNA = list(label = pca_data_space_label("RNA"), feature_matrix = log_rna_matrix, sample_map = sample_map$rna),
          Ribo = list(label = pca_data_space_label("Ribo"), feature_matrix = log_ribo_matrix, sample_map = sample_map$ribo)
        )
      )
    }
  )
}

network_render_limits <- function(node_count) {
  node_count <- max(1L, as.integer(node_count))
  if (node_count <= 20L) return(list(display_edge_cap = 900L, max_edges_per_node = 12L))
  if (node_count <= 40L) return(list(display_edge_cap = 700L, max_edges_per_node = 10L))
  if (node_count <= 80L) return(list(display_edge_cap = 500L, max_edges_per_node = 8L))
  list(display_edge_cap = 360L, max_edges_per_node = 6L)
}

network_edge_table <- function(adjacency_matrix, display_edge_cap = Inf, max_edges_per_node = Inf) {
  edge_index <- which(upper.tri(adjacency_matrix) & adjacency_matrix > 0, arr.ind = TRUE)
  if (!nrow(edge_index)) return(list(edges = data.frame(), total_edges = 0L, capped = FALSE))
  edges <- data.frame(source = rownames(adjacency_matrix)[edge_index[, 1]], target = colnames(adjacency_matrix)[edge_index[, 2]], weight = adjacency_matrix[edge_index], stringsAsFactors = FALSE)
  edges <- edges[order(edges$weight, decreasing = TRUE), , drop = FALSE]
  total_edges <- nrow(edges)
  displayed <- edges
  if (is.finite(max_edges_per_node)) {
    degree_cap <- setNames(integer(0), character(0))
    keep <- logical(total_edges)
    for (index in seq_len(total_edges)) {
      source <- edges$source[[index]]
      target <- edges$target[[index]]
      source_degree <- if (source %in% names(degree_cap)) degree_cap[[source]] else 0L
      target_degree <- if (target %in% names(degree_cap)) degree_cap[[target]] else 0L
      if (source_degree >= max_edges_per_node || target_degree >= max_edges_per_node) next
      keep[[index]] <- TRUE
      degree_cap[[source]] <- source_degree + 1L
      degree_cap[[target]] <- target_degree + 1L
    }
    displayed <- edges[keep, , drop = FALSE]
  }
  if (is.finite(display_edge_cap) && nrow(displayed) > display_edge_cap) displayed <- displayed[seq_len(display_edge_cap), , drop = FALSE]
  list(edges = displayed, total_edges = total_edges, capped = nrow(displayed) < total_edges)
}

network_nodes_payload <- function(node_table) {
  lapply(seq_len(nrow(node_table)), function(index) {
    row <- node_table[index, , drop = FALSE]
    list(id = as.character(row$id[[1]]), label = as.character(row$label[[1]]), geneId = as.character(row$GeneID[[1]]), geneName = as.character(row$GeneName[[1]]), module = as.character(row$Module[[1]]), moduleIndex = unname(as.numeric(row$ModuleIndex[[1]])), connectivity = unname(as.numeric(row$Connectivity[[1]])), degree = unname(as.integer(row$Degree[[1]])), displayDegree = unname(as.integer(row$DisplayDegree[[1]])))
  })
}

network_edges_payload <- function(edge_table) {
  if (is.null(edge_table) || !is.data.frame(edge_table) || !nrow(edge_table)) return(list())
  lapply(seq_len(nrow(edge_table)), function(index) {
    row <- edge_table[index, , drop = FALSE]
    list(source = as.character(row$source[[1]]), target = as.character(row$target[[1]]), weight = unname(as.numeric(row$weight[[1]])))
  })
}

network_analysis <- function(matrix, pairs, parameters, te_context = NULL) {
  network_require_packages()
  base <- network_space_contexts(te_context, pairs)
  space <- pca_data_space_code(parameters$dataSpace)
  space_context <- base$spaces[[space]]
  if (is.null(space_context)) stop(sprintf("Unsupported Network data space: %s", space), call. = FALSE)
  params <- list(
    edge_threshold = num(parameters$edgeThreshold, 0.4),
    top_genes = min(max(10L, int(parameters$topGenes, 10L)), 1000L),
    variable_genes = min(max(50L, int(parameters$variableGenes, 1000L)), 3000L),
    module_name = as.character(parameters$networkModule %||% "Entire Network"),
    soft_power = min(max(1L, int(parameters$softPower, 5L)), 20L),
    min_module_size = min(max(10L, int(parameters$minModuleSize, 20L)), 100L)
  )
  feature <- network_prepare_feature_matrix(space_context$feature_matrix, params$variable_genes)
  dat_expr <- t(feature)
  gene_ids <- colnames(dat_expr)
  tom <- WGCNA::TOMsimilarityFromExpr(dat_expr, networkType = "unsigned", TOMType = "unsigned", power = params$soft_power)
  colnames(tom) <- gene_ids
  rownames(tom) <- gene_ids
  gene_tree <- stats::hclust(stats::as.dist(1 - tom), method = "average")
  dynamic_mods <- dynamicTreeCut::cutreeDynamic(dendro = gene_tree, method = "tree", minClusterSize = params$min_module_size, verbose = 0)
  dynamic_colors <- WGCNA::labels2colors(dynamic_mods)
  gene_info <- base$gene_info[match(gene_ids, base$gene_info$GeneID), , drop = FALSE]
  gene_info$gene_name[is.na(gene_info$gene_name) | !nzchar(gene_info$gene_name)] <- "unknown"
  module_info <- data.frame(GeneID = gene_ids, gene_name = gene_info$gene_name, module_color = dynamic_colors, module_index = dynamic_mods, stringsAsFactors = FALSE)
  selected <- module_info
  if (!params$module_name %in% c("Entire Network", "Entire network", "entire_network")) {
    selected <- module_info[module_info$module_color == params$module_name, , drop = FALSE]
  }
  if (!nrow(selected)) stop("The selected module does not contain any genes.", call. = FALSE)
  mod_probes <- selected$GeneID
  connectivity <- WGCNA::softConnectivity(dat_expr[, mod_probes, drop = FALSE])
  connectivity[!is.finite(connectivity)] <- 0
  top_gene_count <- min(params$top_genes, length(mod_probes), 1000L)
  top_mask <- rank(-connectivity, ties.method = "first") <= top_gene_count
  top_genes <- mod_probes[top_mask]
  adjacency <- tom[top_genes, top_genes, drop = FALSE]
  adjacency[adjacency <= params$edge_threshold] <- 0
  diag(adjacency) <- 0
  limits <- network_render_limits(length(top_genes))
  threshold_edges <- network_edge_table(adjacency, Inf, Inf)
  display_edges <- network_edge_table(adjacency, limits$display_edge_cap, limits$max_edges_per_node)
  selected <- selected[match(top_genes, selected$GeneID), , drop = FALSE]
  selected$gene_name[is.na(selected$gene_name) | !nzchar(selected$gene_name) | selected$gene_name == "unknown"] <- selected$GeneID
  degree_values <- setNames(integer(length(top_genes)), top_genes)
  display_degree_values <- setNames(integer(length(top_genes)), top_genes)
  if (nrow(threshold_edges$edges)) {
    degree_table <- table(c(threshold_edges$edges$source, threshold_edges$edges$target))
    degree_values[names(degree_table)] <- as.integer(degree_table)
  }
  if (nrow(display_edges$edges)) {
    display_degree_table <- table(c(display_edges$edges$source, display_edges$edges$target))
    display_degree_values[names(display_degree_table)] <- as.integer(display_degree_table)
  }
  node_table <- data.frame(id = top_genes, label = selected$gene_name, GeneID = selected$GeneID, GeneName = selected$gene_name, Module = selected$module_color, ModuleIndex = selected$module_index, Connectivity = as.numeric(connectivity[top_mask]), Degree = as.integer(degree_values[top_genes]), DisplayDegree = as.integer(display_degree_values[top_genes]), stringsAsFactors = FALSE)
  module_label <- if (params$module_name %in% c("Entire Network", "Entire network", "entire_network")) "Entire network" else params$module_name
  note <- NULL
  if (!nrow(threshold_edges$edges)) {
    note <- sprintf("No edges passed the current threshold of %.2f. Lower the threshold or choose a denser module.", params$edge_threshold)
  } else if (isTRUE(display_edges$capped)) {
    note <- sprintf("For performance, the on-page graph shows the strongest %s of %s threshold-passed edges.", format(nrow(display_edges$edges), big.mark = ","), format(threshold_edges$total_edges, big.mark = ","))
  }
  graph <- list(
    title = sprintf("Co-expression Network | %s", module_label),
    subtitle = sprintf("%s | %s nodes | %s threshold-passed edges | %s displayed edges | threshold >= %s", space_context$label, format(nrow(node_table), big.mark = ","), format(threshold_edges$total_edges, big.mark = ","), format(nrow(display_edges$edges), big.mark = ","), format(round(params$edge_threshold, 2), nsmall = 2)),
    signature = paste(space, params$variable_genes, params$soft_power, params$min_module_size, params$top_genes, params$edge_threshold, module_label, sep = "::"),
    moduleLabel = module_label,
    displayCapped = isTRUE(display_edges$capped),
    totalEdges = unname(as.integer(threshold_edges$total_edges)),
    displayedEdges = unname(as.integer(nrow(display_edges$edges))),
    autoHideLabels = isTRUE(nrow(node_table) > 60L || nrow(display_edges$edges) > 320L),
    dragEnabled = !isTRUE(nrow(node_table) > 90L || nrow(display_edges$edges) > 420L),
    nodes = network_nodes_payload(node_table),
    edges = network_edges_payload(display_edges$edges)
  )
  list(
    table = if (nrow(threshold_edges$edges)) threshold_edges$edges else display_edges$edges,
    summary = list(metric("Nodes Drawn", format(nrow(node_table), big.mark = ",")), metric("Edges Passed Threshold", format(threshold_edges$total_edges, big.mark = ",")), metric("Edges Drawn", format(nrow(display_edges$edges), big.mark = ",")), metric("Data Space", space_context$label), metric("Module", module_label), metric("Genes Used", format(nrow(feature), big.mark = ","))),
    views = list(list(id = "network", title = "Network Graph", type = "network")),
    charts = list(network = list(note = note, graph = graph))
  )
}

signalp_method_label <- function(method) {
  switch(tolower(as.character(method)), all = "All Methods", signalp = "SignalP", tmhmm = "TMHMM", phobius = "Phobius", as.character(method))
}

signalp_normalize_gene_key <- function(values) {
  sub("\\.\\d+$", "", toupper(trimws(as.character(values))))
}

signalp_read_resource <- function(path) {
  cached_read_delim_first_column(path, "signalp_resource")
}

signalp_find_resources <- function(annotation_dir, species_id) {
  if (is.null(annotation_dir) || !dir.exists(annotation_dir)) return(list())
  species_key <- trimws(as.character(species_id %||% ""))
  if (!nzchar(species_key)) return(list())
  expected_files <- c(
    signalp = sprintf("%s.pep.signalP.txt", species_key),
    tmhmm = sprintf("%s.pep.tmhmm.txt", species_key),
    phobius = sprintf("%s.pep.phobius.txt", species_key)
  )
  resources <- list()
  for (method in names(expected_files)) {
    resource_path <- file.path(annotation_dir, expected_files[[method]])
    if (file.exists(resource_path)) resources[[method]] <- signalp_read_resource(resource_path)
  }
  resources
}

signalp_fisher_pvalue <- function(yes_case, no_case, yes_non, no_non) {
  values <- matrix(c(yes_case, no_case, yes_non, no_non), nrow = 2, byrow = TRUE)
  if (any(rowSums(values) == 0) || any(colSums(values) == 0)) return(NA_real_)
  stats::fisher.test(values)$p.value
}

signalp_method_context <- function(gene_table, method, annotation_keys) {
  levels <- c("Up", "Non", "Down")
  annotated_mask <- gene_table$GeneKey %in% annotation_keys
  total_counts <- table(factor(gene_table$TE_Status, levels = levels))
  yes_counts <- table(factor(gene_table$TE_Status[annotated_mask], levels = levels))
  no_counts <- total_counts - yes_counts
  total <- as.integer(total_counts[levels])
  yes <- as.integer(yes_counts[levels])
  no <- as.integer(no_counts[levels])
  up_p <- signalp_fisher_pvalue(yes[[1]], no[[1]], yes[[2]], no[[2]])
  down_p <- signalp_fisher_pvalue(yes[[3]], no[[3]], yes[[2]], no[[2]])
  summary <- data.frame(method = method, methodLabel = signalp_method_label(method), teGroup = levels, annotatedCount = yes, nonAnnotatedCount = no, totalCount = total, percent = ifelse(total > 0, yes / total, 0), upVsNonPValue = up_p, downVsNonPValue = down_p, stringsAsFactors = FALSE)
  tests <- data.frame(method = c(method, method), methodLabel = c(signalp_method_label(method), signalp_method_label(method)), comparison = c("Up vs Non", "Down vs Non"), rawPValue = c(up_p, down_p), annotatedInTestGroup = c(yes[[1]], yes[[3]]), nonAnnotatedInTestGroup = c(no[[1]], no[[3]]), annotatedInNonGroup = c(yes[[2]], yes[[2]]), nonAnnotatedInNonGroup = c(no[[2]], no[[2]]), stringsAsFactors = FALSE)
  list(summary = summary, tests = tests)
}

signalp_analysis <- function(te, annotation_dir, parameters, species_id) {
  if (is.null(te) || is.null(te$table) || !is.data.frame(te$table)) {
    stop("SignalP requires a completed Translation Efficiency result table.", call. = FALSE)
  }
  result_table <- te$table
  status <- if ("TE_Status" %in% colnames(result_table)) as.character(result_table$TE_Status) else rep("Non", nrow(result_table))
  status[!status %in% c("Up", "Non", "Down")] <- "Non"
  gene_table <- data.frame(GeneID = as.character(result_table$GeneID), GeneKey = signalp_normalize_gene_key(result_table$GeneID), gene_name = if ("gene_name" %in% colnames(result_table)) as.character(result_table$gene_name) else rep("unknown", nrow(result_table)), TE_Status = status, stringsAsFactors = FALSE)
  resources <- signalp_find_resources(annotation_dir, species_id)
  method <- tolower(as.character(parameters$method %||% "all"))
  if (!method %in% c("all", "signalp", "tmhmm", "phobius")) method <- "all"
  requested <- if (identical(method, "all")) c("signalp", "tmhmm", "phobius") else method
  selected <- intersect(requested, names(resources))
  if (!length(selected)) {
    empty <- data.frame(Message = "No local SignalP/TMHMM/Phobius annotation files were found.", stringsAsFactors = FALSE)
    return(list(table = empty, summary = list(metric("Genes Assessed", nrow(gene_table)), metric("Annotated Genes", 0), metric("Methods Compared", 0), metric("Raw p < 0.05", 0)), views = list(list(id = "signalp", title = "SignalP", type = "signalp")), charts = list(signalp = list(note = "No local SignalP/TMHMM/Phobius annotation files were found.", methodLabel = signalp_method_label(method), plot = list(rows = list()), table = list(rows = list(), totalRows = 0, comparisonCount = 0)))))
  }
  contexts <- lapply(selected, function(name) signalp_method_context(gene_table, name, resources[[name]]))
  group_summary <- do.call(rbind, lapply(contexts, `[[`, "summary"))
  test_summary <- do.call(rbind, lapply(contexts, `[[`, "tests"))
  rownames(group_summary) <- NULL
  rownames(test_summary) <- NULL
  union_keys <- unique(unlist(resources[selected], use.names = FALSE))
  note <- if (length(setdiff(requested, names(resources)))) {
    sprintf("Unavailable for the current species: %s.", paste(vapply(setdiff(requested, names(resources)), signalp_method_label, character(1)), collapse = ", "))
  } else {
    NULL
  }
  export_table <- group_summary
  export_table$percent <- export_table$percent * 100
  list(
    table = export_table,
    summary = list(metric("Genes Assessed", format(nrow(gene_table), big.mark = ",")), metric("Annotated Genes", format(sum(gene_table$GeneKey %in% union_keys), big.mark = ",")), metric("Methods Compared", length(selected)), metric("Raw p < 0.05", sum(test_summary$rawPValue < 0.05, na.rm = TRUE))),
    views = list(list(id = "signalp", title = "SignalP", type = "signalp")),
    charts = list(signalp = list(note = note, methodLabel = if (identical(method, "all")) "All Methods" else signalp_method_label(method), plot = list(rows = group_summary), table = list(rows = group_summary, totalRows = nrow(group_summary), comparisonCount = nrow(test_summary))))
  )
}

module_id <- request$moduleId
parameters <- request$parameters %||% list()
matrix <- read_matrix(request$preprocessMatrixPath)
pairs <- pair_manifest(request$samplePairs)

te_context <- NULL
if (!is.null(request$teResultPath) && file.exists(request$teResultPath)) {
  te_result_table <- cached_read_csv(request$teResultPath, "te_result_table")
  te_context <- list(
    table = te_result_table,
    result_table = te_result_table
  )
}

result <- switch(
  module_id,
  translation_efficiency = te_analysis(matrix, pairs, parameters),
  pca = pca_analysis(matrix, pairs, parameters, te_context),
  clustering = clustering_analysis(matrix, pairs, parameters, te_context),
  gsea = gsea_analysis(te_context, request$annotationDir, parameters, request$speciesId),
  enrichment = enrichment_analysis(te_context, request$annotationDir, parameters, request$speciesId),
  network = network_analysis(matrix, pairs, parameters, te_context),
  signalp = signalp_analysis(te_context, request$annotationDir, parameters, request$speciesId),
  codon = codon_analysis(te_context = te_context, matrix = matrix, pairs = pairs, parameters = parameters, annotation_dir = request$annotationDir, species_id = request$speciesId, species_label = request$speciesLabel),
  stop(sprintf("Unsupported module: %s", module_id), call. = FALSE)
)

if (!is.null(request$resultPath) && !is.null(result$table) && is.data.frame(result$table)) {
  dir.create(dirname(request$resultPath), recursive = TRUE, showWarnings = FALSE)
  utils::write.csv(result$table, request$resultPath, row.names = FALSE, quote = TRUE)
}

payload <- list(
  moduleId = module_id,
  resultPath = request$resultPath,
  summary = result$summary,
  table = table_payload(result$table),
  views = result$views,
  charts = result$charts,
  message = sprintf("%s analysis completed.", module_id)
)

jsonlite::write_json(payload, output_path, auto_unbox = TRUE, dataframe = "rows", na = "null", digits = 12)
