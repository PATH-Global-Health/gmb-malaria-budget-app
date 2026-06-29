# --------------------------------------------------------------------------------------------------
# Script: 04b_parrallel-param-list-generation.R
# Purpose:
#   Batch-create parameter list artifacts for all (or selected) site `uid`s from
#   the mega site file using `future` + `furrr`.
#
# What this script does:
#   1) Sources modular parameter sub-functions + generator function
#   2) Loads one mega site-file object
#   3) Builds a uid run list (all by default, optional subset override)
#   4) Runs per-site generation in parallel with per-site error capture
#   5) Writes a batch run log CSV in output_root/metadata
# --------------------------------------------------------------------------------------------------

rm(list = ls())

suppressPackageStartupMessages({
  # purrr: map helpers for list/data-frame transformations
  library(purrr)
  # furrr/future: parallel mapping backend
  library(furrr)
  library(future)
  # tibble: clean run-log table construction
  library(tibble)
})

# site_file_path <- "./04.scenario-setup/04.scenario-site-file/mega-scen1_NSP.rds"
# output_root <- "./04.scenario-setup/05.parameter-lists/sim1_nsp_cali_v2"
cali_version = "cali2"
scen_names <- c("bau", "nsp", "optimistic", "realistic", "pessimistic")

run_names = paste0("GMB_run1_", scen_names, "_", cali_version)
mega_rds_names = paste0("mega_NSP_itn_scen_",scen_names)


for(i in 1:5){
  print(i)
make_param_lists(site_file_path = paste0("./04.scenario-setup/03.scenario-site-file/",mega_rds_names[i],".rds"),
                 output_root = paste0("./04.scenario-setup/04.parameter-lists/", run_names[i]))
}


make_param_lists <- function(site_file_path, output_root){


  # ---- User-editable inputs ------------------------------------------------------------------------

  # Optional overrides passed through to malariasimulation::get_parameters().
  parameter_overrides <- list()

  # Run all uids when NULL; otherwise pass a character vector of uids to run.
  uids_to_run <- NULL
  # Example:
  # uids_to_run <- c("dist_01", "dist_02")

  # ---- Source function files -----------------------------------------------------------------------
  sub_functions_dir <- "./03.calibration/02.parameter-list-create/01.scripts/functions/parameter-list-sub-functions"
  sub_function_files <- list.files(sub_functions_dir, pattern = "\\.R$", full.names = TRUE)
  generator_script <- "./03.calibration/02.parameter-list-create/01.scripts/functions/f2-generate-parameter-lists.R"

  if (length(sub_function_files) == 0) {
    stop(sprintf("No sub-function scripts found in: %s", sub_functions_dir))
  }

  invisible(lapply(sub_function_files, source))
  # Source the single-site builder (`generate_site_parameter_list`).
  source(generator_script)

  # ---- Load site file and derive run uids ----------------------------------------------------------
  site_file <- readRDS(site_file_path)

  if (!is.list(site_file) || is.null(site_file$malariasim_process) || !is.data.frame(site_file$malariasim_process)) {
    stop("`site_file` must be a list containing a data.frame at `site_file$malariasim_process`.")
  }
  if (!("uid" %in% names(site_file$malariasim_process))) {
    stop("`site_file$malariasim_process` must contain a `uid` column.")
  }

  all_uids <- site_file$malariasim_process$uid |>
    as.character() |>
    # Remove missing/empty uid entries before batching.
    (\(x) x[!is.na(x) & nzchar(x)])() |>
    unique()

  if (length(all_uids) == 0) {
    stop("No usable uids found in `site_file$malariasim_process$uid`.")
  }

  run_uids <- if (is.null(uids_to_run)) {
    # Default behavior: run the full site list.
    all_uids
  } else {
    as.character(uids_to_run) |>
      # User-provided subset (cleaned for NA/blank values).
      (\(x) x[!is.na(x) & nzchar(x)])() |>
      unique()
  }

  if (length(run_uids) == 0) {
    stop("`run_uids` is empty after filtering. Provide at least one uid.")
  }

  workers <- max(1L, future::availableCores() - 1L)
  # Keep one core free to avoid locking up the local machine.
  message("Starting parallel parameter generation")
  message("Total uids requested: ", length(run_uids))
  message("Workers: ", workers)

  # ---- Parallel plan setup -------------------------------------------------------------------------
  # Use multisession for cross-platform local parallelism.
  future::plan(future::multisession, workers = workers)
  # Always reset plan after script exits (success or failure).
  on.exit(future::plan(future::sequential), add = TRUE)

  # ---- Batch execution (continue on error) ---------------------------------------------------------
  batch_results <- furrr::future_map(
    run_uids,
    function(uid_i) {
      # Runtime-dispatched helpers (e.g., add_treatment called by name inside
      # add_interventions) are not always captured by static globals detection.
      # Re-source function files inside worker sessions so each worker has the
      # full function set in its own search environment.
      if (!exists("generate_site_parameter_list", mode = "function", inherits = TRUE)) {
        invisible(lapply(sub_function_files, source))
        source(generator_script)
      }
      if (!exists("add_treatment", mode = "function", inherits = TRUE)) {
        invisible(lapply(sub_function_files, source))
      }

      site_result <- tryCatch(
        generate_site_parameter_list(
          site_file = site_file,
          uid = uid_i,
          output_root = output_root,
          overrides = parameter_overrides
        ),
        # Return the error object instead of stopping the whole batch.
        error = function(e) e
      )

      if (inherits(site_result, "error")) {
        return(list(
          uid = uid_i,
          status = "failed",
          error_message = conditionMessage(site_result),
          parameter_path = NA_character_,
          metadata_path = NA_character_,
          diagnostics_plot_path = NA_character_,
          result = NULL
        ))
      }

      list(
        uid = uid_i,
        status = "success",
        error_message = NA_character_,
        parameter_path = site_result$paths$parameter,
        metadata_path = site_result$paths$metadata,
        diagnostics_plot_path = site_result$paths$diagnostics_plot,
        result = site_result
      )
    },
    # Set deterministic seed handling for any stochastic behavior in workers.
    .options = furrr::furrr_options(seed = TRUE)
  )

  # ---- Summarize + write run log -------------------------------------------------------------------
  run_log <- purrr::map_dfr(
    batch_results,
    # Flatten one per-uid result record into one log row.
    ~ tibble::tibble(
      uid = .x$uid,
      status = .x$status,
      error_message = .x$error_message,
      parameter_path = .x$parameter_path,
      metadata_path = .x$metadata_path,
      diagnostics_plot_path = .x$diagnostics_plot_path
    )
  )

  total_n <- nrow(run_log)
  success_n <- sum(run_log$status == "success", na.rm = TRUE)
  failed_n <- sum(run_log$status == "failed", na.rm = TRUE)

  message("Batch complete")
  message("  Total: ", total_n)
  message("  Success: ", success_n)
  message("  Failed: ", failed_n)

  metadata_dir <- file.path(output_root, "metadata")
  # Ensure metadata folder exists for run-log CSV output.
  dir.create(metadata_dir, recursive = TRUE, showWarnings = FALSE)

  timestamp <- format(Sys.time(), "%Y%m%d-%H%M%S")
  run_log_path <- file.path(
    metadata_dir,
    sprintf("parallel-param-list-run-%s.csv", timestamp)
  )

  utils::write.csv(run_log, run_log_path, row.names = FALSE, na = "")
  message("Run log written to: ", run_log_path)

  if (failed_n > 0) {
    # Print quick debugging summary for failed uids.
    message("Failed uid summary:")
    print(run_log[run_log$status == "failed", c("uid", "error_message"), drop = FALSE])
  }

}
