codon_sense_values <- function() {
  c(
    "AAA", "AAC", "AAG", "AAT", "ACA", "ACC", "ACG", "ACT",
    "AGA", "AGC", "AGG", "AGT", "ATA", "ATC", "ATG", "ATT",
    "CAA", "CAC", "CAG", "CAT", "CCA", "CCC", "CCG", "CCT",
    "CGA", "CGC", "CGG", "CGT", "CTA", "CTC", "CTG", "CTT",
    "GAA", "GAC", "GAG", "GAT", "GCA", "GCC", "GCG", "GCT",
    "GGA", "GGC", "GGG", "GGT", "GTA", "GTC", "GTG", "GTT",
    "TAC", "TAT", "TCA", "TCC", "TCG", "TCT", "TGC", "TGG",
    "TGT", "TTA", "TTC", "TTG", "TTT"
  )
}

codon_sense_options <- function() {
  lapply(codon_sense_values(), ribote_choice)
}

codon_status_levels <- function() {
  c("Up", "Non", "Down")
}

codon_input_preview_limit <- function() {
  500L
}

codon_scatter_display_limit <- function() {
  1500L
}

codon_max_visualized_codons <- function() {
  8L
}

codon_heatmap_gene_limit <- function() {
  180L
}

codon_permutation_iterations <- function() {
  2000L
}

codon_export_defaults <- function() {
  list(
    format = "png",
    width = 3000,
    height = 2200,
    dpi = 300,
    data_format = "csv"
  )
}

codon_export_config <- function(id) {
  ns <- NS(id)
  defaults <- codon_export_defaults()

  list(
    ids = list(
      format = ns("export_format"),
      width = ns("export_width"),
      height = ns("export_height"),
      dpi = ns("export_dpi"),
      trigger = ns("export_plot"),
      dataFormat = ns("data_export_format"),
      dataTrigger = ns("data_export")
    ),
    defaults = defaults,
    choices = list(
      format = list(
        list(label = "PNG", value = "png"),
        list(label = "PDF", value = "pdf")
      ),
      dataFormat = list(
        list(label = "CSV", value = "csv"),
        list(label = "TXT (tab-delimited)", value = "txt")
      )
    )
  )
}

codon_export_settings <- function(input) {
  defaults <- codon_export_defaults()
  width <- suppressWarnings(as.numeric(input$export_width))
  height <- suppressWarnings(as.numeric(input$export_height))
  dpi <- suppressWarnings(as.numeric(input$export_dpi))
  format <- tolower(if (is.null(input$export_format) || identical(input$export_format, "")) defaults$format else input$export_format)
  data_format <- tolower(if (is.null(input$data_export_format) || identical(input$data_export_format, "")) defaults$data_format else input$data_export_format)

  list(
    format = if (format %in% c("png", "pdf")) format else defaults$format,
    width = if (is.finite(width) && width > 0) width else defaults$width,
    height = if (is.finite(height) && height > 0) height else defaults$height,
    dpi = if (is.finite(dpi) && dpi > 0) dpi else defaults$dpi,
    data_format = if (data_format %in% c("csv", "txt")) data_format else defaults$data_format
  )
}

codon_safe_filename_token <- function(value, fallback = "codon") {
  normalized <- tolower(as.character(value))
  normalized <- gsub("[^a-z0-9]+", "_", normalized)
  normalized <- gsub("^_+|_+$", "", normalized)

  if (!nzchar(normalized)) {
    fallback
  } else {
    normalized
  }
}

codon_figure_filename <- function(view = "current_view", extension = "png") {
  sprintf(
    "codon_%s_%s.%s",
    codon_safe_filename_token(view, fallback = "current_view"),
    format(Sys.Date(), "%Y%m%d"),
    extension
  )
}

codon_archive_filename <- function(kind = "data") {
  sprintf(
    "codon_%s_%s.zip",
    codon_safe_filename_token(kind, fallback = "data"),
    format(Sys.Date(), "%Y%m%d")
  )
}

codon_data_filename <- function(kind = "summary", extension = "csv") {
  sprintf(
    "codon_%s_%s.%s",
    codon_safe_filename_token(kind, fallback = "summary"),
    format(Sys.Date(), "%Y%m%d"),
    extension
  )
}

codon_supported_result_views <- function() {
  c(
    "input_summary",
    "selected_codon_usage",
    "selected_codon_vs_rna",
    "cbi_tai_by_group",
    "cbi_associations",
    "selected_codon_burden",
    "codon_enrichment_shifted",
    "selected_codon_across_groups",
    "permutation_support",
    "te_bias_selected_load",
    "selected_load_effect",
    "codon_clustering",
    "codon_usage_heatmap",
    "codon_run_zscore",
    "codon_run_enrichment"
  )
}

codon_all_result_views <- function() {
  vapply(codon_module_config()$views, function(view) as.character(view$id), character(1))
}

codon_normalize_result_view <- function(view = NULL) {
  normalized <- if (is.null(view)) "" else tolower(trimws(as.character(view)))

  if (normalized %in% codon_all_result_views()) {
    normalized
  } else {
    "input_summary"
  }
}

codon_species_key <- function(upload_context) {
  species_meta <- upload_context$species_meta

  if (is.list(species_meta) && !is.null(species_meta$acronym) && nzchar(as.character(species_meta$acronym))) {
    return(as.character(species_meta$acronym))
  }

  if (!is.null(upload_context$species) && nzchar(as.character(upload_context$species))) {
    species_meta <- ribote_species_meta(upload_context$species)
    if (!is.null(species_meta$acronym) && nzchar(as.character(species_meta$acronym))) {
      return(as.character(species_meta$acronym))
    }
  }

  NULL
}

codon_has_local_resources <- function(upload_context) {
  if (is.null(upload_context) || is.null(upload_context$resource_paths)) {
    return(FALSE)
  }

  paths <- upload_context$resource_paths
  required_paths <- c(paths$gff_rda_path, paths$txlens_path, paths$fasta_path)

  length(required_paths) == 3L &&
    all(vapply(required_paths, function(path) !is.null(path) && file.exists(path), logical(1)))
}

codon_first_existing_path <- function(...) {
  candidates <- list(...)

  for (candidate in candidates) {
    if (!is.null(candidate) && nzchar(as.character(candidate)) && file.exists(candidate)) {
      return(normalizePath(candidate, winslash = "/", mustWork = TRUE))
    }
  }

  NULL
}

codon_bias_resource_name <- function(upload_context, kind = c("tai", "cbi")) {
  kind <- match.arg(kind)
  species_meta <- upload_context$species_meta
  species_key <- codon_species_key(upload_context)

  if (identical(kind, "tai")) {
    explicit_name <- if (is.list(species_meta)) species_meta$tai_name else NULL
    fallback_name <- if (!is.null(species_key)) sprintf("%s.tai", species_key) else NULL
  } else {
    explicit_name <- if (is.list(species_meta)) species_meta$cbi_name else NULL
    fallback_name <- if (!is.null(species_key)) sprintf("%s.cds.m", species_key) else NULL
  }

  if (!is.null(explicit_name) && nzchar(as.character(explicit_name))) {
    return(as.character(explicit_name))
  }

  fallback_name
}

codon_resolve_bias_resource_path <- function(upload_context, kind = c("tai", "cbi")) {
  kind <- match.arg(kind)

  if (is.null(upload_context)) {
    return(NULL)
  }

  resource_paths <- upload_context$resource_paths
  resource_name <- codon_bias_resource_name(upload_context, kind = kind)

  embedded_path <- if (!is.null(resource_name) && nzchar(resource_name)) {
    app_data_path("cds", resource_name)
  } else {
    NULL
  }

  if (identical(kind, "tai")) {
    codon_first_existing_path(
      if (is.list(resource_paths)) resource_paths$tai_path else NULL,
      embedded_path
    )
  } else {
    codon_first_existing_path(
      if (is.list(resource_paths)) resource_paths$cbi_path else NULL,
      embedded_path
    )
  }
}

codon_has_bias_resources <- function(upload_context) {
  !is.null(codon_resolve_bias_resource_path(upload_context, kind = "tai")) &&
    !is.null(codon_resolve_bias_resource_path(upload_context, kind = "cbi"))
}

codon_normalize_gene_key <- function(values) {
  normalized <- trimws(as.character(values))
  normalized <- toupper(normalized)
  sub("\\.\\d+$", "", normalized)
}

codon_normalize_transcript_id <- function(values) {
  normalized <- trimws(as.character(values))
  normalized <- sub("\\s.*$", "", normalized)
  sub("\\.\\d+$", "", normalized)
}

codon_source_signature <- function(te_context, preprocess_context, upload_context) {
  paste(
    pca_source_signature(te_context, preprocess_context),
    codon_species_key(upload_context),
    sep = "::"
  )
}

codon_normalize_parameters <- function(
  codon_select = NULL,
  codon_direction = NULL,
  codon_display = NULL
) {
  selected_codons <- unique(toupper(trimws(as.character(unlist(codon_select, use.names = FALSE)))))
  selected_codons <- selected_codons[nzchar(selected_codons)]
  selected_codons <- intersect(selected_codons, codon_sense_values())

  direction_value <- if (is.null(codon_direction) || !nzchar(as.character(codon_direction))) {
    "Up"
  } else {
    as.character(codon_direction)
  }

  if (!direction_value %in% c("Up", "Down", "Up and Down")) {
    direction_value <- "Up"
  }

  display_value <- if (identical(as.character(codon_display), "All")) "All" else "Obj"

  list(
    codon_select = selected_codons,
    codon_direction = direction_value,
    codon_display = display_value
  )
}

codon_parameters_key <- function(parameters) {
  paste(
    paste(parameters$codon_select, collapse = ","),
    parameters$codon_direction,
    parameters$codon_display,
    sep = "::"
  )
}

