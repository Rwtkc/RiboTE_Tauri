codon_build_base_context <- function(te_context, preprocess_context, upload_context, resource_context) {
  te_gene_table <- data.table::as.data.table(codon_extract_te_gene_table(te_context))
  resource_gene_table <- data.table::as.data.table(resource_context$gene_summary)
  resource_codon_table <- data.table::as.data.table(resource_context$codon_long)

  gene_table <- merge(te_gene_table, resource_gene_table, by = "GeneKey", all = FALSE, sort = TRUE)

  if (!nrow(gene_table)) {
    stop("The current Translation Efficiency result set does not overlap with the local CDS annotation set.", call. = FALSE)
  }

  replacement_mask <- is.na(gene_table$gene_name) | !nzchar(trimws(gene_table$gene_name)) | gene_table$gene_name == "unknown"
  resource_name_mask <- !is.na(gene_table$gene_name_resource) & nzchar(trimws(gene_table$gene_name_resource))
  gene_table$gene_name[replacement_mask & resource_name_mask] <- gene_table$gene_name_resource[replacement_mask & resource_name_mask]

  gene_table <- gene_table[, .(
    GeneKey,
    GeneID,
    gene_name,
    TE_Status,
    RNA_Control_Mean,
    RNA_Treatment_Mean,
    TE_Control_Mean,
    TE_Treatment_Mean,
    TE_log2FC,
    pvalue,
    padj,
    transcript_id,
    totalCodons,
    codonSequence
  )]

  codon_table <- merge(
    resource_codon_table,
    gene_table[, .(GeneKey, GeneID, gene_name, TE_Status, RNA_Control_Mean, RNA_Treatment_Mean)],
    by = "GeneKey",
    all = FALSE,
    sort = TRUE
  )

  list(
    source_signature = codon_source_signature(te_context, preprocess_context, upload_context),
    species_key = resource_context$species_key,
    gene_table = as.data.frame(gene_table, stringsAsFactors = FALSE),
    codon_table = as.data.frame(codon_table, stringsAsFactors = FALSE),
    transcript_sequences = as.data.frame(resource_context$transcript_sequences, stringsAsFactors = FALSE)
  )
}

codon_load_bias_resource_table <- function(upload_context) {
  codon_require_packages()

  tai_path <- codon_resolve_bias_resource_path(upload_context, kind = "tai")
  cbi_path <- codon_resolve_bias_resource_path(upload_context, kind = "cbi")

  if (is.null(tai_path) || is.null(cbi_path)) {
    stop("Local Codon Bias resources are not installed for the current species.", call. = FALSE)
  }

  tai_dt <- data.table::as.data.table(data.table::fread(tai_path, data.table = FALSE))
  cbi_dt <- data.table::as.data.table(data.table::fread(cbi_path, data.table = FALSE))

  if (!"transcript_id" %in% colnames(tai_dt)) {
    stop("The local tAI resource is missing transcript identifiers.", call. = FALSE)
  }

  if ("title" %in% colnames(cbi_dt) && !"transcript_id" %in% colnames(cbi_dt)) {
    data.table::setnames(cbi_dt, "title", "transcript_id")
  }

  if (!"transcript_id" %in% colnames(cbi_dt)) {
    stop("The local CBI resource is missing transcript identifiers.", call. = FALSE)
  }

  tai_value_column <- if ("tai" %in% colnames(tai_dt)) {
    "tai"
  } else {
    candidate_columns <- setdiff(colnames(tai_dt), "transcript_id")
    if (length(candidate_columns)) candidate_columns[[1]] else NULL
  }

  cbi_value_column <- if ("CBI" %in% colnames(cbi_dt)) {
    "CBI"
  } else {
    candidate_columns <- setdiff(colnames(cbi_dt), c("transcript_id", "CAI"))
    if (length(candidate_columns)) candidate_columns[[1]] else NULL
  }

  if (is.null(tai_value_column) || !nzchar(tai_value_column)) {
    stop("The local tAI resource is missing the tAI value column.", call. = FALSE)
  }

  if (is.null(cbi_value_column) || !nzchar(cbi_value_column)) {
    stop("The local CBI resource is missing the CBI value column.", call. = FALSE)
  }

  tai_table <- unique(
    tai_dt[, .(
      transcript_id = codon_normalize_transcript_id(transcript_id),
      tAI = suppressWarnings(as.numeric(get(tai_value_column)))
    )],
    by = "transcript_id"
  )
  cbi_table <- unique(
    cbi_dt[, .(
      transcript_id = codon_normalize_transcript_id(transcript_id),
      CBI = suppressWarnings(as.numeric(get(cbi_value_column)))
    )],
    by = "transcript_id"
  )

  as.data.frame(merge(cbi_table, tai_table, by = "transcript_id", all = TRUE), stringsAsFactors = FALSE)
}

codon_build_bias_gene_table <- function(base_context, upload_context) {
  bias_table <- codon_load_bias_resource_table(upload_context)
  gene_table <- as.data.frame(base_context$gene_table, stringsAsFactors = FALSE)

  merged_table <- merge(
    gene_table[, c(
      "GeneKey", "GeneID", "gene_name", "TE_Status",
      "RNA_Control_Mean", "RNA_Treatment_Mean",
      "TE_Control_Mean", "TE_Treatment_Mean",
      "transcript_id"
    ), drop = FALSE],
    bias_table,
    by = "transcript_id",
    all = FALSE
  )

  merged_table$gene_name[is.na(merged_table$gene_name) | !nzchar(trimws(merged_table$gene_name))] <- "unknown"
  merged_table
}

codon_rows_payload <- function(data_frame) {
  if (is.null(data_frame) || !is.data.frame(data_frame) || nrow(data_frame) == 0L) {
    return(list())
  }

  lapply(seq_len(nrow(data_frame)), function(index) {
    row_values <- data_frame[index, , drop = FALSE]
    payload <- as.list(row_values)

    for (name in names(payload)) {
      value <- payload[[name]]
      if (is.numeric(value)) {
        payload[[name]] <- unname(value)
      } else {
        payload[[name]] <- as.character(value)
      }
    }

    payload
  })
}

codon_build_scope_table <- function(base_context, parameters) {
  gene_table <- data.table::as.data.table(base_context$gene_table)

  selected_summary <- if (length(parameters$codon_select)) {
    codon_table <- data.table::as.data.table(base_context$codon_table)
    selected_rows <- codon_table[codon %in% parameters$codon_select]
    if (nrow(selected_rows)) {
      selected_rows[, .(
        selectedCodonCount = sum(as.numeric(count), na.rm = TRUE),
        selectedCodonFrequency = sum(as.numeric(frequency), na.rm = TRUE),
        selectedCodonPer1k = sum(as.numeric(per1k), na.rm = TRUE)
      ), by = GeneKey]
    } else {
      data.table::data.table(GeneKey = character(), selectedCodonCount = numeric(), selectedCodonFrequency = numeric(), selectedCodonPer1k = numeric())
    }
  } else {
    data.table::data.table(GeneKey = character(), selectedCodonCount = numeric(), selectedCodonFrequency = numeric(), selectedCodonPer1k = numeric())
  }

  gene_scope <- merge(gene_table, selected_summary, by = "GeneKey", all.x = TRUE, sort = TRUE)
  gene_scope$selectedCodonCount[is.na(gene_scope$selectedCodonCount)] <- 0
  gene_scope$selectedCodonFrequency[is.na(gene_scope$selectedCodonFrequency)] <- 0
  gene_scope$selectedCodonPer1k[is.na(gene_scope$selectedCodonPer1k)] <- 0

  effective_scope <- if (identical(parameters$codon_display, "Obj") && length(parameters$codon_select)) "Obj" else "All"
  if (identical(effective_scope, "Obj")) {
    gene_scope <- gene_scope[gene_scope$selectedCodonCount > 0, , drop = FALSE]
  }

  list(
    effective_scope = effective_scope,
    label = if (identical(effective_scope, "Obj")) "Selected-codon genes" else "All codon-ready genes",
    note = if (identical(parameters$codon_display, "Obj") && !length(parameters$codon_select)) {
      "No codons are selected yet, so the current gene scope falls back to all codon-ready genes."
    } else {
      NULL
    },
    gene_table = as.data.frame(gene_scope, stringsAsFactors = FALSE)
  )
}
