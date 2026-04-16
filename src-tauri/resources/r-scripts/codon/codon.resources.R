codon_extract_te_gene_table <- function(te_context) {
  result_table <- translation_efficiency_result_table_labels(
    te_context$result_table %||% te_context$table
  )
  stopifnot(is.data.frame(result_table))
  stopifnot("GeneID" %in% colnames(result_table))

  gene_name <- if ("gene_name" %in% colnames(result_table)) {
    as.character(result_table$gene_name)
  } else {
    rep("unknown", nrow(result_table))
  }

  gene_name[is.na(gene_name) | !nzchar(trimws(gene_name))] <- "unknown"

  te_status <- if ("TE_Status" %in% colnames(result_table)) {
    as.character(result_table$TE_Status)
  } else if ("diffTE" %in% colnames(result_table)) {
    as.character(result_table$diffTE)
  } else {
    rep("Non", nrow(result_table))
  }

  te_status[!te_status %in% codon_status_levels()] <- "Non"

  data.frame(
    GeneID = as.character(result_table$GeneID),
    GeneKey = codon_normalize_gene_key(result_table$GeneID),
    gene_name = gene_name,
    TE_Status = te_status,
    RNA_Control_Mean = if ("RNA_Control_Mean" %in% colnames(result_table)) as.numeric(result_table$RNA_Control_Mean) else NA_real_,
    RNA_Treatment_Mean = if ("RNA_Treatment_Mean" %in% colnames(result_table)) as.numeric(result_table$RNA_Treatment_Mean) else NA_real_,
    TE_Control_Mean = if ("TE_Control_Mean" %in% colnames(result_table)) as.numeric(result_table$TE_Control_Mean) else NA_real_,
    TE_Treatment_Mean = if ("TE_Treatment_Mean" %in% colnames(result_table)) as.numeric(result_table$TE_Treatment_Mean) else NA_real_,
    TE_log2FC = if ("TE_log2FC" %in% colnames(result_table)) as.numeric(result_table$TE_log2FC) else NA_real_,
    pvalue = if ("pvalue" %in% colnames(result_table)) as.numeric(result_table$pvalue) else NA_real_,
    padj = if ("padj" %in% colnames(result_table)) as.numeric(result_table$padj) else NA_real_,
    stringsAsFactors = FALSE
  )
}

codon_require_packages <- function() {
  required_packages <- c("data.table", "Biostrings")
  missing_packages <- required_packages[!vapply(required_packages, requireNamespace, quietly = TRUE, logical(1))]

  if (length(missing_packages)) {
    stop(
      sprintf("Codon analysis requires missing packages: %s", paste(missing_packages, collapse = ", ")),
      call. = FALSE
    )
  }

  invisible(TRUE)
}

codon_load_rda_object <- function(rda_path, object_name = NULL) {
  if (is.null(rda_path) || !file.exists(rda_path)) {
    stop(sprintf("Missing codon resource file: %s", rda_path), call. = FALSE)
  }

  object_env <- new.env(parent = emptyenv())
  load(rda_path, envir = object_env)
  object_names <- ls(object_env, all.names = TRUE)

  if (!length(object_names)) {
    stop(sprintf("No objects were found in %s.", basename(rda_path)), call. = FALSE)
  }

  if (is.null(object_name) || !nzchar(as.character(object_name))) {
    stop(sprintf("An explicit object name is required for %s.", basename(rda_path)), call. = FALSE)
  }

  if (!object_name %in% object_names) {
    stop(sprintf("Expected object '%s' was not found in %s.", object_name, basename(rda_path)), call. = FALSE)
  }

  get(object_name, envir = object_env, inherits = FALSE)
}

codon_load_gene_annotation_table <- function(gff_rda_path) {
  gff_table <- codon_load_rda_object(gff_rda_path, "gff")
  gff_dt <- data.table::as.data.table(gff_table)

  type_column <- NULL
  preferred_columns <- c("transcript_type", "transcript_biotype", "transcript_bio_type")
  preferred_columns <- preferred_columns[preferred_columns %in% colnames(gff_dt)]

  if (length(preferred_columns)) {
    type_column <- preferred_columns[[1]]
  } else {
    candidate_columns <- colnames(gff_dt)[vapply(
      gff_dt,
      function(column) any(as.character(column) == "protein_coding", na.rm = TRUE),
      logical(1)
    )]
    candidate_columns <- candidate_columns[grepl("^transcript", candidate_columns, ignore.case = TRUE)]
    if (length(candidate_columns)) {
      type_column <- candidate_columns[[1]]
    }
  }

  if (is.null(type_column)) {
    stop("Unable to locate a transcript biotype column in the local gene annotation resource.", call. = FALSE)
  }

  required_columns <- c("transcript_id", "gene_id", "gene_name")
  if (!all(required_columns %in% colnames(gff_dt))) {
    stop("The local gene annotation resource is missing transcript or gene identifiers.", call. = FALSE)
  }

  transcript_dt <- gff_dt[
    type == "transcript" & as.character(get(type_column)) == "protein_coding",
    .(
      transcript_id = codon_normalize_transcript_id(transcript_id),
      GeneKey = codon_normalize_gene_key(gene_id),
      GeneIDResource = as.character(gene_id),
      gene_name_resource = as.character(gene_name)
    )
  ]

  transcript_dt$gene_name_resource[is.na(transcript_dt$gene_name_resource) | !nzchar(trimws(transcript_dt$gene_name_resource))] <- "unknown"
  unique(transcript_dt, by = c("transcript_id", "GeneKey"))
}

codon_load_txlens_table <- function(txlens_path) {
  txlens_table <- codon_load_rda_object(txlens_path, "txlens")
  txlens_dt <- data.table::as.data.table(txlens_table)

  transcript_column <- if ("tx_name" %in% colnames(txlens_dt)) {
    "tx_name"
  } else if ("transcript_id" %in% colnames(txlens_dt)) {
    "transcript_id"
  } else {
    stop("The local transcript length resource is missing transcript identifiers.", call. = FALSE)
  }

  required_columns <- c("gene_id", "cds_len", "utr5_len")
  if (!all(required_columns %in% colnames(txlens_dt))) {
    stop("The local transcript length resource is missing CDS fields required for codon analysis.", call. = FALSE)
  }

  txlens_dt[, transcript_id := codon_normalize_transcript_id(get(transcript_column))]
  txlens_dt[, GeneKey := codon_normalize_gene_key(gene_id)]
  txlens_dt <- txlens_dt[!is.na(transcript_id) & nzchar(transcript_id)]

  unique(
    txlens_dt[cds_len > 0 & !is.na(cds_len), .(
      transcript_id,
      GeneKey,
      cds_len = as.numeric(cds_len),
      utr5_len = as.numeric(utr5_len)
    )],
    by = "GeneKey"
  )
}

codon_read_fasta_sequences <- function(fasta_path) {
  fasta_records <- suppressPackageStartupMessages(Biostrings::readDNAStringSet(fasta_path))
  data.table::data.table(
    transcript_id = codon_normalize_transcript_id(names(fasta_records)),
    seq = as.character(fasta_records)
  )
}

codon_sequence_from_cds <- function(cds_sequence) {
  codon_count <- nchar(cds_sequence) %/% 3L
  if (!is.finite(codon_count) || codon_count <= 0L) {
    return("")
  }

  codon_start <- seq.int(1L, by = 3L, length.out = codon_count)
  codons <- substring(cds_sequence, codon_start, codon_start + 2L)
  codons <- codons[nchar(codons) == 3L]
  codons <- codons[!codons %in% c("TAG", "TAA", "TGA")]
  paste(codons, collapse = " ")
}

codon_build_resource_context_biostrings <- function(upload_context, annotation_table, txlens_table) {
  resource_paths <- upload_context$resource_paths
  fasta_records <- suppressPackageStartupMessages(Biostrings::readDNAStringSet(resource_paths$fasta_path))
  fasta_table <- data.table::data.table(
    transcript_id = codon_normalize_transcript_id(names(fasta_records)),
    seq_index = seq_along(fasta_records)
  )

  transcript_table <- merge(txlens_table, annotation_table, by = c("transcript_id", "GeneKey"), all.x = TRUE)
  transcript_table <- merge(transcript_table, fasta_table, by = "transcript_id", all.x = TRUE)
  transcript_table <- transcript_table[!is.na(seq_index) & !is.na(cds_len) & !is.na(utr5_len) & cds_len > 0 & cds_len %% 3 == 0]

  if (!nrow(transcript_table)) {
    stop("No protein-coding CDS sequences were available for codon analysis.", call. = FALSE)
  }

  cds_set <- Biostrings::subseq(
    fasta_records[transcript_table$seq_index],
    start = as.integer(transcript_table$utr5_len) + 1L,
    width = as.integer(transcript_table$cds_len)
  )
  codon_counts <- Biostrings::oligonucleotideFrequency(cds_set, width = 3L, step = 3L)
  codon_columns <- setdiff(colnames(codon_counts), c("TAG", "TAA", "TGA"))
  total_codons <- rowSums(codon_counts[, codon_columns, drop = FALSE], na.rm = TRUE)

  transcript_dt <- data.table::as.data.table(transcript_table)
  transcript_dt[, row_index := .I]
  transcript_dt[, totalCodons := as.numeric(total_codons)]
  transcript_dt <- transcript_dt[is.finite(totalCodons) & totalCodons > 0]

  if (!nrow(transcript_dt)) {
    stop("No protein-coding CDS sequences were available for codon analysis.", call. = FALSE)
  }

  counts_dt <- data.table::as.data.table(codon_counts[, codon_columns, drop = FALSE])
  counts_dt[, row_index := .I]
  codon_long <- data.table::melt(
    counts_dt,
    id.vars = "row_index",
    variable.name = "codon",
    value.name = "count",
    variable.factor = FALSE
  )
  codon_long <- codon_long[count > 0]
  data.table::setorder(codon_long, row_index, codon)
  codon_long <- merge(
    codon_long,
    transcript_dt[, .(row_index, transcript_id, GeneKey, GeneIDResource, gene_name_resource, totalCodons)],
    by = "row_index",
    all = FALSE,
    sort = TRUE
  )
  codon_long[, count := as.numeric(count)]
  codon_long[, totalCodons := as.numeric(totalCodons)]
  codon_long[, frequency := count / totalCodons]
  codon_long[, per1k := (count * 1000) / totalCodons]
  data.table::setcolorder(codon_long, c(
    "transcript_id", "GeneKey", "GeneIDResource", "gene_name_resource",
    "codon", "count", "totalCodons", "frequency", "per1k"
  ))
  codon_long[, row_index := NULL]

  cds_sequences <- as.character(cds_set)
  transcript_sequences <- transcript_dt[, .(
    transcript_id = as.character(transcript_id),
    GeneKey = as.character(GeneKey),
    GeneIDResource = as.character(GeneIDResource),
    gene_name_resource = as.character(gene_name_resource),
    totalCodons = as.numeric(totalCodons),
    codonSequence = vapply(cds_sequences[row_index], codon_sequence_from_cds, character(1))
  )]

  gene_summary <- unique(
    transcript_sequences[, c("GeneKey", "GeneIDResource", "gene_name_resource", "transcript_id", "totalCodons", "codonSequence")],
    by = "GeneKey"
  )

  list(
    species_key = codon_species_key(upload_context),
    gene_summary = as.data.frame(gene_summary, stringsAsFactors = FALSE),
    codon_long = as.data.frame(codon_long, stringsAsFactors = FALSE),
    transcript_sequences = as.data.frame(transcript_sequences, stringsAsFactors = FALSE)
  )
}

codon_build_resource_context <- function(upload_context) {
  codon_require_packages()

  if (!codon_has_local_resources(upload_context)) {
    stop("Local CDS and transcript resources are not installed for the current species.", call. = FALSE)
  }

  resource_paths <- upload_context$resource_paths
  annotation_table <- codon_load_gene_annotation_table(resource_paths$gff_rda_path)
  txlens_table <- codon_load_txlens_table(resource_paths$txlens_path)
  codon_build_resource_context_biostrings(upload_context, annotation_table, txlens_table)
}

codon_box_stats <- function(values) {
  finite_values <- sort(as.numeric(values)[is.finite(values)])

  if (!length(finite_values)) {
    return(list(n = 0L, min = NA_real_, q1 = NA_real_, median = NA_real_, q3 = NA_real_, max = NA_real_, mean = NA_real_))
  }

  quantiles <- stats::quantile(finite_values, probs = c(0, 0.25, 0.5, 0.75, 1), na.rm = TRUE, names = FALSE, type = 7)

  list(
    n = length(finite_values),
    min = unname(quantiles[[1]]),
    q1 = unname(quantiles[[2]]),
    median = unname(quantiles[[3]]),
    q3 = unname(quantiles[[4]]),
    max = unname(quantiles[[5]]),
    mean = mean(finite_values)
  )
}

codon_wilcox_pvalue <- function(case_values, reference_values) {
  finite_case <- as.numeric(case_values)[is.finite(case_values)]
  finite_reference <- as.numeric(reference_values)[is.finite(reference_values)]

  if (!length(finite_case) || !length(finite_reference)) {
    return(NA_real_)
  }

  suppressWarnings(
    tryCatch(stats::wilcox.test(finite_case, finite_reference)$p.value, error = function(...) NA_real_)
  )
}

codon_correlation_stats <- function(x_values, y_values) {
  finite_mask <- is.finite(x_values) & is.finite(y_values)
  x_values <- as.numeric(x_values[finite_mask])
  y_values <- as.numeric(y_values[finite_mask])

  if (length(x_values) < 3L) {
    return(list(geneCount = length(x_values), correlation = NA_real_, pValue = NA_real_, slope = NA_real_, intercept = NA_real_))
  }

  correlation_test <- tryCatch(stats::cor.test(x_values, y_values, method = "pearson"), error = function(...) NULL)
  linear_model <- tryCatch(stats::lm(y_values ~ x_values), error = function(...) NULL)
  coefficients <- if (!is.null(linear_model)) stats::coef(linear_model) else c(NA_real_, NA_real_)

  list(
    geneCount = length(x_values),
    correlation = if (!is.null(correlation_test)) unname(as.numeric(correlation_test$estimate)) else NA_real_,
    pValue = if (!is.null(correlation_test)) unname(as.numeric(correlation_test$p.value)) else NA_real_,
    slope = if (length(coefficients) >= 2L) unname(as.numeric(coefficients[[2]])) else NA_real_,
    intercept = if (length(coefficients) >= 1L) unname(as.numeric(coefficients[[1]])) else NA_real_
  )
}

codon_downsample_rows <- function(data_frame, limit = codon_scatter_display_limit()) {
  if (!is.data.frame(data_frame) || nrow(data_frame) <= limit) {
    return(data_frame)
  }

  keep_index <- unique(floor(seq(1, nrow(data_frame), length.out = limit)))
  data_frame[keep_index, , drop = FALSE]
}

