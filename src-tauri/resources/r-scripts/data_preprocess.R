args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) {
  stop("Usage: data_preprocess.R <input_json> <output_json>", call. = FALSE)
}

input_path <- args[[1]]
output_path <- args[[2]]

suppressPackageStartupMessages({
  library(jsonlite)
})

request <- jsonlite::fromJSON(input_path, simplifyVector = FALSE)

detect_delimiter <- function(path) {
  first_lines <- readLines(path, n = 5, warn = FALSE)
  delimiters <- c("\t", ",", ";", "|")
  counts <- vapply(delimiters, function(delimiter) {
    sum(vapply(strsplit(first_lines, delimiter, fixed = TRUE), length, integer(1)) > 1)
  }, integer(1))
  delimiters[[which.max(counts)]]
}

read_count_matrix <- function(path) {
  delimiter <- detect_delimiter(path)
  utils::read.table(
    path,
    header = TRUE,
    sep = delimiter,
    check.names = FALSE,
    stringsAsFactors = FALSE,
    quote = "\"",
    comment.char = ""
  )
}

clean_base_gene_matrix <- function(gene_matrix, na_strategy) {
  gene_matrix <- gene_matrix[!duplicated(gene_matrix[, 1]), , drop = FALSE]
  gene_matrix <- gene_matrix[!is.na(gene_matrix[, 1]), , drop = FALSE]
  rownames(gene_matrix) <- toupper(as.character(gene_matrix[, 1]))
  gene_matrix <- gene_matrix[, -1, drop = FALSE]
  gene_matrix[] <- lapply(gene_matrix, function(column) as.numeric(as.character(column)))
  gene_matrix <- gene_matrix[!apply(is.na(gene_matrix), 1, all), , drop = FALSE]

  zero_only_columns <- vapply(gene_matrix, function(column) all(column == 0, na.rm = TRUE), logical(1))
  if (sum(zero_only_columns) > 0) {
    gene_matrix <- gene_matrix[, !zero_only_columns, drop = FALSE]
  }

  gene_matrix <- gene_matrix[order(-apply(gene_matrix, 1, stats::sd, na.rm = TRUE)), , drop = FALSE]

  if (sum(is.na(gene_matrix)) > 0) {
    if (identical(na_strategy, "Median Imputation")) {
      row_medians <- apply(gene_matrix, 1, stats::median, na.rm = TRUE)
      for (column_index in seq_len(ncol(gene_matrix))) {
        missing_rows <- which(is.na(gene_matrix[, column_index]))
        gene_matrix[missing_rows, column_index] <- row_medians[missing_rows]
      }
    } else {
      gene_matrix[is.na(gene_matrix)] <- 0
    }
  }

  gene_matrix <- gene_matrix[rowSums(gene_matrix, na.rm = TRUE) >= 1, , drop = FALSE]
  gene_matrix
}

apply_cpm_filter <- function(gene_matrix, min_cpm, min_libraries) {
  library_sizes <- colSums(gene_matrix, na.rm = TRUE)
  library_sizes[library_sizes <= 0] <- 1
  cpm_matrix <- sweep(gene_matrix, 2, library_sizes / 1e6, "/")
  keep_rows <- rowSums(cpm_matrix >= min_cpm, na.rm = TRUE) >= min_libraries
  gene_matrix <- gene_matrix[keep_rows, , drop = FALSE]

  processed <- as.data.frame(gene_matrix, check.names = FALSE)
  processed <- data.frame(GeneID = rownames(processed), processed, check.names = FALSE)
  rownames(processed) <- NULL
  processed
}

preprocess_gene_matrix <- function(gene_matrix, na_strategy, min_cpm, min_libraries) {
  apply_cpm_filter(clean_base_gene_matrix(gene_matrix, na_strategy), min_cpm, min_libraries)
}

build_sample_display_index <- function(sample_pairs, sample_names) {
  pair_manifest <- if (is.data.frame(sample_pairs)) {
    sample_pairs
  } else {
    do.call(rbind, lapply(sample_pairs, function(pair) as.data.frame(pair, stringsAsFactors = FALSE)))
  }
  names(pair_manifest) <- sub("^rnaSample$", "rnaSample", names(pair_manifest))
  names(pair_manifest) <- sub("^riboSample$", "riboSample", names(pair_manifest))
  names(pair_manifest) <- sub("^groupRole$", "groupRole", names(pair_manifest))

  if (nrow(pair_manifest) == 0) {
    return(data.frame(
      sample_name = sample_names,
      sample_type = ifelse(grepl("^RPF|^RIBO", sample_names, ignore.case = TRUE), "Ribo-seq", "RNA-seq"),
      sample_display = sample_names,
      group_role = NA_character_,
      stringsAsFactors = FALSE
    ))
  }

  display_map <- list()
  role_counters <- list(Control = 0L, Treatment = 0L)

  for (row_index in seq_len(nrow(pair_manifest))) {
    role <- as.character(pair_manifest$groupRole[[row_index]])
    if (!role %in% c("Control", "Treatment")) {
      next
    }

    role_counters[[role]] <- role_counters[[role]] + 1L
    role_code <- if (identical(role, "Control")) "C" else "T"
    replicate_index <- role_counters[[role]]

    display_map[[as.character(pair_manifest$rnaSample[[row_index]])]] <- list(
      sample_display = sprintf("RNA.%s%d", role_code, replicate_index),
      sample_type = "RNA-seq",
      group_role = role
    )
    display_map[[as.character(pair_manifest$riboSample[[row_index]])]] <- list(
      sample_display = sprintf("RPF.%s%d", role_code, replicate_index),
      sample_type = "Ribo-seq",
      group_role = role
    )
  }

  fallback_counters <- list("RNA-seq" = 0L, "Ribo-seq" = 0L, "Sample" = 0L)
  rows <- lapply(sample_names, function(sample_name) {
    mapped <- display_map[[sample_name]]
    inferred_type <- if (grepl("^RPF|^RIBO", sample_name, ignore.case = TRUE)) "Ribo-seq" else "RNA-seq"

    if (is.null(mapped)) {
      fallback_counters[[inferred_type]] <- fallback_counters[[inferred_type]] + 1L
      prefix <- if (identical(inferred_type, "Ribo-seq")) "RPF.U" else "RNA.U"
      return(data.frame(
        sample_name = sample_name,
        sample_type = inferred_type,
        sample_display = sprintf("%s%d", prefix, fallback_counters[[inferred_type]]),
        group_role = NA_character_,
        stringsAsFactors = FALSE
      ))
    }

    data.frame(
      sample_name = sample_name,
      sample_type = mapped$sample_type,
      sample_display = mapped$sample_display,
      group_role = mapped$group_role,
      stringsAsFactors = FALSE
    )
  })

  do.call(rbind, rows)
}

find_gene_info_db <- function(annotation_dir, species_id = NULL) {
  if (is.null(annotation_dir) || !dir.exists(annotation_dir) || is.null(species_id) || !nzchar(species_id)) {
    return(NA_character_)
  }

  preferred <- file.path(annotation_dir, sprintf("%s.geneInfo.sqlite", species_id))
  if (file.exists(preferred)) {
    return(preferred)
  }

  NA_character_
}

load_gene_biotype_index <- function(org_db_path) {
  if (is.na(org_db_path) || !file.exists(org_db_path)) {
    return(NULL)
  }
  if (!requireNamespace("DBI", quietly = TRUE) || !requireNamespace("RSQLite", quietly = TRUE)) {
    return(NULL)
  }

  con <- DBI::dbConnect(RSQLite::SQLite(), org_db_path)
  on.exit(DBI::dbDisconnect(con), add = TRUE)

  gene_info <- DBI::dbGetQuery(con, "select ensembl_gene_id, gene_biotype, symbol from geneInfo")
  gene_info$ensembl_gene_id <- toupper(as.character(gene_info$ensembl_gene_id))
  gene_info
}

build_barplot_data <- function(processed_matrix, sample_display_index) {
  count_matrix <- processed_matrix[, setdiff(colnames(processed_matrix), "GeneID"), drop = FALSE]
  totals <- colSums(count_matrix, na.rm = TRUE)
  display_lookup <- sample_display_index$sample_display
  names(display_lookup) <- sample_display_index$sample_name
  type_lookup <- sample_display_index$sample_type
  names(type_lookup) <- sample_display_index$sample_name

  data.frame(
    sample = names(totals),
    sample_display = unname(display_lookup[names(totals)]),
    total_count = as.numeric(totals),
    sample_type = unname(type_lookup[names(totals)]),
    stringsAsFactors = FALSE
  )
}

build_biotype_summary <- function(processed_matrix, org_db_path) {
  gene_info <- load_gene_biotype_index(org_db_path)

  if (is.null(gene_info) || nrow(gene_info) == 0) {
    return(data.frame(gene_biotype = "Unknown", genes_retained = nrow(processed_matrix), stringsAsFactors = FALSE))
  }

  biotype_map <- gene_info$gene_biotype
  names(biotype_map) <- gene_info$ensembl_gene_id
  biotypes <- biotype_map[toupper(processed_matrix$GeneID)]
  biotypes[is.na(biotypes) | biotypes == ""] <- "Unknown"
  summary <- sort(table(biotypes), decreasing = TRUE)
  summary_df <- data.frame(
    gene_biotype = names(summary),
    genes_retained = as.integer(summary),
    stringsAsFactors = FALSE
  )

  if (nrow(summary_df) > 8) {
    top_rows <- summary_df[seq_len(7), , drop = FALSE]
    other_count <- sum(summary_df$genes_retained[-seq_len(7)])
    summary_df <- rbind(top_rows, data.frame(gene_biotype = "Other", genes_retained = other_count, stringsAsFactors = FALSE))
  }

  summary_df
}

build_rrna_summary <- function(processed_matrix, org_db_path, sample_display_index) {
  gene_info <- load_gene_biotype_index(org_db_path)
  count_matrix <- as.matrix(processed_matrix[, setdiff(colnames(processed_matrix), "GeneID"), drop = FALSE])
  display_lookup <- sample_display_index$sample_display
  names(display_lookup) <- sample_display_index$sample_name

  if (is.null(gene_info) || nrow(gene_info) == 0) {
    rrna_totals <- rep(0, ncol(count_matrix))
  } else {
    biotype_map <- gene_info$gene_biotype
    names(biotype_map) <- gene_info$ensembl_gene_id
    biotypes <- biotype_map[toupper(processed_matrix$GeneID)]
    rrna_mask <- grepl("rrna", biotypes, ignore.case = TRUE)
    rrna_mask[is.na(rrna_mask)] <- FALSE
    rrna_totals <- if (any(rrna_mask)) colSums(count_matrix[rrna_mask, , drop = FALSE], na.rm = TRUE) else rep(0, ncol(count_matrix))
  }

  total_counts <- colSums(count_matrix, na.rm = TRUE)
  non_rrna_totals <- pmax(total_counts - rrna_totals, 0)

  data.frame(
    sample = rep(colnames(count_matrix), each = 2),
    sample_display = rep(unname(display_lookup[colnames(count_matrix)]), each = 2),
    category = rep(c("rRNA", "Non-rRNA"), times = ncol(count_matrix)),
    total_count = as.numeric(as.vector(rbind(rrna_totals, non_rrna_totals))),
    stringsAsFactors = FALSE
  )
}

matrix_path <- request$matrixPath
annotation_dir <- request$annotationDir
species_id <- if (is.null(request$speciesId) || !nzchar(request$speciesId)) NA_character_ else request$speciesId
na_strategy <- if (is.null(request$naStrategy) || !nzchar(request$naStrategy)) "Zero Imputation" else request$naStrategy
min_cpm <- suppressWarnings(as.numeric(request$minCpm))
min_libraries <- suppressWarnings(as.integer(request$minLibraries))

if (is.na(min_cpm)) {
  min_cpm <- 0.5
}
if (is.na(min_libraries) || min_libraries < 1) {
  min_libraries <- 1L
}
if (is.null(matrix_path) || !file.exists(matrix_path)) {
  stop("Saved matrix file does not exist.", call. = FALSE)
}

base_cache_path <- if (!is.null(request$baseCachePath) && nzchar(request$baseCachePath)) {
  request$baseCachePath
} else {
  NA_character_
}
base_matrix <- NULL
if (!is.na(base_cache_path) && file.exists(base_cache_path)) {
  base_matrix <- readRDS(base_cache_path)
}
if (is.null(base_matrix)) {
  raw_matrix <- read_count_matrix(matrix_path)
  base_matrix <- clean_base_gene_matrix(raw_matrix, na_strategy)
  if (!is.na(base_cache_path)) {
    dir.create(dirname(base_cache_path), recursive = TRUE, showWarnings = FALSE)
    saveRDS(base_matrix, base_cache_path)
  }
}
processed_matrix <- apply_cpm_filter(base_matrix, min_cpm, min_libraries)

if (nrow(processed_matrix) == 0 || ncol(processed_matrix) <= 1) {
  stop("No genes passed the current preprocessing thresholds.", call. = FALSE)
}

sample_names <- setdiff(colnames(processed_matrix), "GeneID")
sample_display_index <- build_sample_display_index(request$samplePairs, sample_names)
org_db_path <- find_gene_info_db(annotation_dir, species_id)
cache_path <- if (!is.null(request$cachePath) && nzchar(request$cachePath)) {
  request$cachePath
} else {
  tempfile(pattern = "ribote_preprocess_matrix_", tmpdir = tempdir(), fileext = ".csv")
}
dir.create(dirname(cache_path), recursive = TRUE, showWarnings = FALSE)
utils::write.csv(processed_matrix, cache_path, row.names = FALSE, quote = TRUE)

preview_limit <- min(10L, nrow(processed_matrix))
preview <- processed_matrix[seq_len(preview_limit), , drop = FALSE]
preview_rows <- lapply(seq_len(nrow(preview)), function(row_index) {
  as.list(preview[row_index, , drop = FALSE])
})

result <- list(
  matrixPath = normalizePath(cache_path, winslash = "/", mustWork = TRUE),
  speciesId = species_id,
  annotationDir = annotation_dir,
  inputMatrixPath = matrix_path,
  matrixStats = list(
    genes = nrow(processed_matrix),
    samples = length(sample_names)
  ),
  parameters = list(
    naStrategy = na_strategy,
    minCpm = min_cpm,
    minLibraries = min_libraries
  ),
  table = list(
    columns = colnames(processed_matrix),
    rows = preview_rows,
    totalRows = nrow(processed_matrix)
  ),
  charts = list(
    barplot = build_barplot_data(processed_matrix, sample_display_index),
    biotype = build_biotype_summary(processed_matrix, org_db_path),
    rrna = build_rrna_summary(processed_matrix, org_db_path, sample_display_index)
  )
)

jsonlite::write_json(result, output_path, auto_unbox = TRUE, dataframe = "rows", na = "null", digits = 12)
