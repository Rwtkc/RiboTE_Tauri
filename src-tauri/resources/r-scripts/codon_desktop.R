translation_efficiency_result_table_labels <- function(result_table) {
  if (is.null(result_table) || !is.data.frame(result_table)) {
    return(result_table)
  }

  rename_map <- c(
    input1 = "RNA_Control_Mean",
    input2 = "RNA_Treatment_Mean",
    logInputFC = "RNA_log2FC",
    diffExp = "RNA_Expression_Status",
    rpf1 = "Ribo_Control_Mean",
    rpf2 = "Ribo_Treatment_Mean",
    logRPFfc = "Ribo_log2FC",
    diffRibo = "Ribo_Expression_Status",
    TE_A1 = "TE_Control_Mean",
    TE_A2 = "TE_Treatment_Mean",
    logTEfc = "TE_log2FC",
    diffTE = "TE_Status"
  )

  current_names <- colnames(result_table)
  matched <- current_names %in% names(rename_map)
  current_names[matched] <- unname(rename_map[current_names[matched]])
  colnames(result_table) <- current_names
  result_table
}

pca_source_signature <- function(te_context, preprocess_context) {
  preprocess_path <- preprocess_context$matrix_path %||% preprocess_context$matrixPath %||% "preprocess-missing"
  te_signature <- if (!is.null(te_context$table) && is.data.frame(te_context$table)) {
    sprintf("%s::%s", nrow(te_context$table), paste(colnames(te_context$table), collapse = "|"))
  } else {
    "te-missing"
  }
  paste(preprocess_path, te_signature, sep = "::")
}

ribote_species_meta <- function(species) {
  species_value <- as.character(species %||% "")
  if (grepl("hg38|homo", species_value, ignore.case = TRUE)) {
    return(list(acronym = "hg38", tai_name = "hg38.tai", cbi_name = "hg38.cds.m"))
  }
  if (grepl("osa|oryza|irgsp", species_value, ignore.case = TRUE)) {
    return(list(acronym = "osa_IRGSP_1", tai_name = "osa_IRGSP_1.tai", cbi_name = "osa_IRGSP_1.cds.m"))
  }
  list(acronym = species_value, tai_name = sprintf("%s.tai", species_value), cbi_name = sprintf("%s.cds.m", species_value))
}

app_data_path <- function(...) {
  file.path(tempdir(), ...)
}

codon_script_dir <- file.path(dirname(normalizePath(sub("^--file=", "", commandArgs(FALSE)[grep("^--file=", commandArgs(FALSE))][1]), winslash = "/", mustWork = TRUE)))

source(file.path(codon_script_dir, "codon", "module_shell.R"), local = TRUE, encoding = "UTF-8")
source(file.path(codon_script_dir, "codon", "codon.config.R"), local = TRUE, encoding = "UTF-8")
source(file.path(codon_script_dir, "codon", "codon.resources.R"), local = TRUE, encoding = "UTF-8")
source(file.path(codon_script_dir, "codon", "codon.analysis.base.R"), local = TRUE, encoding = "UTF-8")
source(file.path(codon_script_dir, "codon", "codon.analysis.input_bias.R"), local = TRUE, encoding = "UTF-8")
source(file.path(codon_script_dir, "codon", "codon.analysis.shift.R"), local = TRUE, encoding = "UTF-8")
source(file.path(codon_script_dir, "codon", "codon.analysis.pattern.R"), local = TRUE, encoding = "UTF-8")
source(file.path(codon_script_dir, "codon", "codon.analysis.runs.R"), local = TRUE, encoding = "UTF-8")
source(file.path(codon_script_dir, "codon", "codon.payload.R"), local = TRUE, encoding = "UTF-8")

codon_resource_paths_from_request <- function(annotation_dir, species_id) {
  species_meta <- ribote_species_meta(species_id)
  list(
    gff_rda_path = file.path(annotation_dir, sprintf("%s.gff.rda", species_meta$acronym)),
    txlens_path = file.path(annotation_dir, sprintf("%s.txlens.rda", species_meta$acronym)),
    fasta_path = file.path(annotation_dir, sprintf("%s.txdb.fa", species_meta$acronym)),
    tai_path = file.path(annotation_dir, sprintf("%s.tai", species_meta$acronym)),
    cbi_path = file.path(annotation_dir, sprintf("%s.cds.m", species_meta$acronym)),
    gene_info_path = file.path(annotation_dir, sprintf("%s.geneInfo.sqlite", species_meta$acronym))
  )
}

codon_rows_to_data_frame <- function(rows) {
  if (!length(rows)) {
    return(data.frame())
  }
  as.data.frame(do.call(rbind, lapply(rows, function(row) as.data.frame(row, stringsAsFactors = FALSE))), stringsAsFactors = FALSE)
}

codon_safe_compute <- function(expr) {
  tryCatch(expr, error = function(error) {
    list(
      source_signature = NULL,
      results = list(
        views = codon_views_payload(),
        note = as.character(error$message)
      )
    )
  })
}

codon_desktop_file_signature <- function(path) {
  if (exists("file_signature", mode = "function")) {
    return(file_signature(path))
  }
  as.character(path %||% "")
}

codon_desktop_cached_value <- function(kind, key_parts, loader) {
  if (exists("cached_key_value", mode = "function")) {
    return(cached_key_value(kind, key_parts, loader))
  }
  loader()
}

codon_analysis <- function(matrix, pairs, parameters, te_context, annotation_dir, species_id, species_label = NULL) {
  if (is.null(te_context) || is.null(te_context$table) || !is.data.frame(te_context$table)) {
    stop("Codon analysis requires a completed Translation Efficiency result table.", call. = FALSE)
  }

  normalized_parameters <- codon_normalize_parameters(
    codon_select = parameters$codonSelect %||% parameters$codon_select,
    codon_direction = parameters$codonDirection %||% parameters$codon_direction,
    codon_display = parameters$codonDisplay %||% parameters$codon_display
  )

  species_meta <- ribote_species_meta(species_id %||% species_label)
  upload_context <- list(
    species = species_label %||% species_id,
    species_meta = species_meta,
    resource_paths = codon_resource_paths_from_request(annotation_dir, species_meta$acronym)
  )
  preprocess_context <- list(matrix_path = request$preprocessMatrixPath %||% "")

  resource_signature <- paste(
    vapply(upload_context$resource_paths, codon_desktop_file_signature, character(1)),
    collapse = "||"
  )
  resource_context <- codon_desktop_cached_value(
    "codon_resource_context",
    list(species_meta$acronym, resource_signature),
    function() codon_build_resource_context(upload_context)
  )
  base_context <- codon_desktop_cached_value(
    "codon_base_context",
    list(
      species_meta$acronym,
      resource_signature,
      codon_desktop_file_signature(request$teResultPath %||% ""),
      codon_desktop_file_signature(request$preprocessMatrixPath %||% "")
    ),
    function() codon_build_base_context(
      te_context = te_context,
      preprocess_context = preprocess_context,
      upload_context = upload_context,
      resource_context = resource_context
    )
  )

  usage_context <- codon_compute_context(base_context, normalized_parameters)
  bias_context <- codon_safe_compute(codon_desktop_cached_value(
    "codon_bias_context",
    list(base_context$source_signature, resource_signature),
    function() codon_compute_bias_context(base_context, upload_context)
  ))
  shift_context <- codon_safe_compute(codon_compute_shift_context(base_context, normalized_parameters))
  pattern_context <- codon_safe_compute(codon_compute_pattern_context(base_context, normalized_parameters))
  run_context <- codon_safe_compute(codon_compute_run_context(base_context, normalized_parameters))
  merged_context <- codon_merge_workspace_contexts(
    usage_context = usage_context,
    bias_context = bias_context,
    shift_context = shift_context,
    pattern_context = pattern_context,
    run_context = run_context
  )
  payload <- codon_results_payload(merged_context)
  export_table <- codon_input_summary_table(merged_context$scope_context)

  list(
    table = export_table,
    summary = usage_context$metrics,
    views = lapply(payload$views, function(view) list(id = as.character(view$id), title = as.character(view$title), type = "codon")),
    charts = list(codon = payload)
  )
}
