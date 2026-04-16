ribote_choice <- function(label, value = label) {
  list(label = label, value = value)
}

ribote_field <- function(key, label, type = "text", default = "", ...) {
  utils::modifyList(
    list(
      key = key,
      label = label,
      type = type,
      default = default
    ),
    list(...)
  )
}

ribote_standard_exports <- function() {
  list(
    list(key = "export_data", label = "Export Data"),
    list(key = "export_pdf", label = "Export PDF"),
    list(key = "export_png", label = "Export PNG")
  )
}

ribote_build_module_config <- function(
  key,
  title,
  eyebrow,
  description,
  requires = "none",
  run_label = "Run Analysis",
  sections = list(),
  views = list(),
  exports = ribote_standard_exports(),
  result_metrics = list(),
  empty_message = "Run this module to populate the result panel.",
  success_message = "Placeholder result is ready.",
  marks_te_ready = FALSE,
  wide_sidebar = FALSE,
  show_export_panel = TRUE,
  show_analysis_panel = TRUE,
  blank_analysis_panel = FALSE,
  snapshot_columns = NULL,
  show_snapshot_panel = TRUE,
  show_parameter_snapshot = TRUE,
  show_analysis_summary = TRUE,
  show_canvas_status = TRUE,
  show_view_badge = TRUE,
  show_placeholder_view_content = TRUE,
  intro_copy = "Configure the required biological inputs, then run the selected analysis to populate the result panel."
) {
  list(
    key = key,
    title = title,
    eyebrow = eyebrow,
    description = description,
    requires = requires,
    run_label = run_label,
    sections = sections,
    views = views,
    exports = exports,
    result_metrics = result_metrics,
    empty_message = empty_message,
    success_message = success_message,
    marks_te_ready = marks_te_ready,
    wide_sidebar = wide_sidebar,
    show_export_panel = show_export_panel,
    show_analysis_panel = show_analysis_panel,
    blank_analysis_panel = blank_analysis_panel,
    snapshot_columns = snapshot_columns,
    show_snapshot_panel = show_snapshot_panel,
    show_parameter_snapshot = show_parameter_snapshot,
    show_analysis_summary = show_analysis_summary,
    show_canvas_status = show_canvas_status,
    show_view_badge = show_view_badge,
    show_placeholder_view_content = show_placeholder_view_content,
    intro_copy = intro_copy
  )
}

ribote_requirement_message <- function(requires) {
  switch(
    requires,
    none = NULL,
    upload = "Confirm species and RNA/Ribo count matrix in Load Data first.",
    te = "Run Translation Efficiency first to unlock this analysis.",
    NULL
  )
}

ribote_requirement_met <- function(session_state, requires) {
  switch(
    requires,
    none = TRUE,
    upload = ribote_has_upload(session_state),
    te = ribote_has_te(session_state),
    FALSE
  )
}

ribote_client_sections <- function(session, sections) {
  lapply(sections, function(section) {
    list(
      title = section$title,
      collapsible = isTRUE(section$collapsible),
      defaultExpanded = if (is.null(section$default_expanded)) TRUE else isTRUE(section$default_expanded),
      fields = lapply(section$fields, function(field) {
        field$id <- session$ns(field$key)
        field
      })
    )
  })
}

ribote_snapshot_items <- function(input, config) {
  items <- list()

  for (section in config$sections) {
    for (field in section$fields) {
      value <- input[[field$key]]

      if (is.null(value) || identical(value, "")) {
        value <- field$default
      }

      if (is.logical(value)) {
        value <- if (isTRUE(value)) "Yes" else "No"
      }

      if (is.list(value)) {
        value <- paste(unlist(value), collapse = ", ")
      } else if (length(value) > 1) {
        value <- paste(as.character(value), collapse = ", ")
      }

      items[[length(items) + 1]] <- list(
        label = field$label,
        value = as.character(value)[[1]]
      )
    }
  }

  items
}

ribote_summary_ui <- function(items, extra_class = NULL) {
  if (length(items) == 0) {
    return(
      tags$p(
        class = "ribote-summary-empty",
        "No parameter snapshot is available for this placeholder module."
      )
    )
  }

  tags$div(
    class = paste(c("ribote-summary-grid", extra_class), collapse = " "),
    lapply(items, function(item) {
      tags$div(
        class = "ribote-summary-item",
        tags$span(class = "ribote-summary-item__label", item$label),
        tags$span(class = "ribote-summary-item__value", item$value)
      )
    })
  )
}

ribote_result_ui <- function(result) {
  items <- result$metrics

  if (!is.null(result$completed_at) && nzchar(as.character(result$completed_at))) {
    items <- c(
      items,
      list(list(label = "Updated", value = result$completed_at))
    )
  }

  tags$div(
    class = "ribote-summary-grid ribote-summary-grid--result",
    lapply(items, function(item) {
      tags$div(
        class = "ribote-summary-item",
        tags$span(class = "ribote-summary-item__label", item$label),
        tags$span(class = "ribote-summary-item__value", item$value)
      )
    })
  )
}

ribote_placeholder_module_ui <- function(id, config) {
  ns <- NS(id)

  div(
    class = paste("page-shell ribote-page-shell", paste0("ribote-page-shell--", config$key)),
    div(
      class = paste(c("ribote-workspace", if (isTRUE(config$wide_sidebar)) "ribote-workspace--wide-sidebar"), collapse = " "),
      tags$aside(
        class = "ribote-sidebar",
        div(
          class = "ribote-panel ribote-panel--sidebar",
          div(class = "ribote-panel__eyebrow", config$eyebrow),
          tags$h2(class = "ribote-panel__title", config$title),
          tags$p(class = "ribote-panel__copy", config$description),
          div(
            class = "ribote-sidebar__action",
            actionButton(
              inputId = ns("run_analysis"),
              label = config$run_label,
              class = "ribote-btn ribote-btn--primary",
              `data-rnameta-analysis-trigger` = "true",
              `data-rnameta-analysis-owner` = ns("progress_slot")
            )
          ),
          uiOutput(ns("run_hint")),
          if (isTRUE(config$show_export_panel) && length(config$exports) > 0) {
            div(
              class = "ribote-sidebar__export",
              react_control_host(
                id = ns("export_host"),
                control_type = "ribote-module-export",
                class = "ribote-export-root",
                ready_input_id = ns("export_ready")
              )
            )
          },
          div(
            class = "ribote-controls",
            react_control_host(
              id = ns("controls_host"),
              control_type = "ribote-module-controls",
              class = "ribote-controls-root",
              ready_input_id = ns("controls_ready")
            )
          )
        )
      ),
      tags$section(
        class = "ribote-main",
        if (isTRUE(config$show_snapshot_panel)) {
          div(
            class = "ribote-panel ribote-panel--intro",
            div(class = "ribote-panel__eyebrow", "Module Snapshot"),
            tags$h3(class = "ribote-main__title", paste(config$title, "Results")),
            tags$p(
              class = "ribote-main__copy",
              config$intro_copy
            ),
            if (isTRUE(config$show_parameter_snapshot)) {
              uiOutput(ns("parameter_snapshot"))
            }
          )
        },
        if (isTRUE(config$show_analysis_panel)) {
          div(
            class = "ribote-panel ribote-panel--canvas",
            div(class = "ribote-panel__eyebrow", "Analysis Flow"),
            tagList(
              div(
                class = "ribote-progress-slot",
                `data-rnameta-progress-slot` = ns("progress_slot")
              ),
              uiOutput(ns("analysis_notice")),
              uiOutput(ns("analysis_summary")),
              react_control_host(
                id = ns("chart_host"),
                control_type = "ribote-module-canvas",
                class = "ribote-canvas-root",
                ready_input_id = ns("chart_ready")
              )
            )
          )
        }
      )
    )
  )
}

ribote_placeholder_module_server <- function(id, config, session_state, analysis_lock = NULL) {
  moduleServer(id, function(input, output, session) {
    analysis_result <- reactiveVal(NULL)
    module_lock_id <- session$ns("analysis_lock")

    current_lock_owner <- reactive({
      if (is.null(analysis_lock)) {
        return(NULL)
      }

      analysis_lock()
    })

    is_analysis_locked <- reactive({
      !is.null(current_lock_owner())
    })

    requirement_met <- reactive({
      ribote_requirement_met(session_state, config$requires)
    })

    publish_controls <- function() {
      send_control_payload(
        session = session,
        id = session$ns("controls_host"),
        control = "ribote-module-controls",
        config = list(
          title = config$title,
          sections = ribote_client_sections(session, config$sections)
        )
      )
    }

    publish_export <- function() {
      if (!isTRUE(config$show_export_panel) || length(config$exports) == 0) {
        return(invisible(NULL))
      }

      send_control_payload(
        session = session,
        id = session$ns("export_host"),
        control = "ribote-module-export",
        config = list(
          title = config$title,
          buttons = lapply(config$exports, function(button) {
            list(
              label = button$label,
              inputId = session$ns(button$key)
            )
          })
        )
      )
    }

    publish_canvas <- function() {
      if (!isTRUE(config$show_analysis_panel)) {
        return(invisible(NULL))
      }

      result <- analysis_result()

      if (isTRUE(config$blank_analysis_panel) && is.null(result)) {
        clear_control_payload(session = session, id = session$ns("chart_host"))
        return(invisible(NULL))
      }

      send_control_payload(
        session = session,
        id = session$ns("chart_host"),
        control = "ribote-module-canvas",
        config = list(
          title = config$title,
          status = if (is.null(result)) "idle" else "ready",
                  emptyMessage = config$empty_message,
                  summary = if (is.null(result)) NULL else result$message,
                  views = config$views,
                  showStatus = isTRUE(config$show_canvas_status),
                  showViewBadge = isTRUE(config$show_view_badge),
                  showPlaceholderViewContent = isTRUE(config$show_placeholder_view_content)
                )
      )
    }

    session$onFlushed(function() {
      isolate({
        publish_controls()
        if (isTRUE(config$show_export_panel) && length(config$exports) > 0) publish_export()
        if (isTRUE(config$show_analysis_panel)) publish_canvas()
      })
    }, once = TRUE)

    observeEvent(input$controls_ready, {
      publish_controls()
    }, ignoreInit = TRUE)

    if (isTRUE(config$show_export_panel) && length(config$exports) > 0) {
      observeEvent(input$export_ready, {
        publish_export()
      }, ignoreInit = TRUE)
    }

    if (isTRUE(config$show_analysis_panel)) {
      observeEvent(input$chart_ready, {
        publish_canvas()
      }, ignoreInit = TRUE)
    }

    observeEvent(input$run_analysis, {
      req(requirement_met())
      req(!is_analysis_locked())

      if (!is.null(analysis_lock)) {
        analysis_lock(module_lock_id)
      }

      on.exit({
        if (!is.null(analysis_lock) && identical(analysis_lock(), module_lock_id)) {
          analysis_lock(NULL)
        }
      }, add = TRUE)

      withProgress(message = sprintf("Running %s", config$title), value = 0, {
        incProgress(0.45)
        Sys.sleep(0.05)
        incProgress(0.55)
      })

      analysis_result(list(
        message = config$success_message,
        metrics = config$result_metrics,
        completed_at = format(Sys.time(), "%Y-%m-%d %H:%M:%S")
      ))

      session_state$last_module <- config$key

      if (isTRUE(config$marks_te_ready)) {
        session_state$te_ready <- TRUE
      }
    })

    if (isTRUE(config$show_export_panel) && length(config$exports) > 0) {
      for (button in config$exports) {
        local({
          button_key <- button$key
          button_label <- button$label

          observeEvent(input[[button_key]], {
            showNotification(
              paste(button_label, "is wired and will export real content after analysis migration."),
              type = "message",
              duration = 2
            )
          }, ignoreInit = TRUE)
        })
      }
    }

    observe({
      set_native_button_state(
        session = session,
        id = session$ns("run_analysis"),
        disabled = !requirement_met() || is_analysis_locked()
      )
    })

    if (isTRUE(config$show_analysis_panel)) {
      observe({
        analysis_result()
        publish_canvas()
      })
    }

    output$run_hint <- renderUI({
      message <- ribote_requirement_message(config$requires)

      if (is.null(message) || requirement_met()) {
        return(NULL)
      }

      div(class = "ribote-hint", message)
    })

    if (isTRUE(config$show_snapshot_panel) && isTRUE(config$show_parameter_snapshot)) {
      output$parameter_snapshot <- renderUI({
        extra_class <- if (!is.null(config$snapshot_columns)) {
          paste0("ribote-summary-grid--cols-", config$snapshot_columns)
        } else {
          NULL
        }

        ribote_summary_ui(ribote_snapshot_items(input, config), extra_class = extra_class)
      })
    }

    if (isTRUE(config$show_analysis_panel)) {
      output$analysis_notice <- renderUI({
        if (isTRUE(config$blank_analysis_panel) && is.null(analysis_result())) {
          return(NULL)
        }

        if (!requirement_met()) {
          return(
            div(
              class = "ribote-result-card ribote-result-card--warning",
              tags$p(class = "ribote-result-card__copy", ribote_requirement_message(config$requires))
            )
          )
        }

        if (is.null(analysis_result())) {
          return(
            div(
              class = "ribote-result-card",
              tags$p(class = "ribote-result-card__copy", config$empty_message)
            )
          )
        }

        NULL
      })

      output$analysis_summary <- renderUI({
        if (!isTRUE(config$show_analysis_summary)) {
          return(NULL)
        }

        result <- analysis_result()
        if (is.null(result)) {
          return(NULL)
        }

        ribote_result_ui(result)
      })
    }

    outputOptions(output, "run_hint", suspendWhenHidden = FALSE)
  })
}
