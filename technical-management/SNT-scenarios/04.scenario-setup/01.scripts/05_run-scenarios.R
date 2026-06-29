# --------------------------------------------------------------------------------------------------
# Script: 05_run-scenarios.R
# Purpose:
#   Run Gambia scenario simulations in parallel from site-level parameter lists.
#
# What this script does:
#   1) Builds scenario/site jobs from existing parameter-list files
#   2) Applies scenario-specific site filtering
#      - First run uses all `uid`s from fitted EIR values
#      - Remaining runs use only districts with varying LLIN strategy
#   3) Runs one simulation per job in parallel with per-job error capture
#   4) Saves successful simulation outputs to:
#      `04.scenario-setup/06.simulation-outputs-preprocessed/<batch_root>/<run_name>/`
#   5) Writes a batch run log CSV to:
#      `04.scenario-setup/06.simulation-outputs-preprocessed/<batch_root>/`
#
# Output file naming:
#   sim_<run_name>_<ID>_<adm1>_<adm2>.rds
#   If the target exists, the script appends `_v2`, `_v3`, ... to avoid overwrite.
# Output `.rds` content:
#   Simulation dataframe with identifier columns appended:
#   `run_name`, `ID`, `adm1`, `adm2`, `population_size`
# --------------------------------------------------------------------------------------------------

rm(list = ls())

suppressPackageStartupMessages({
  library(dplyr)
  library(furrr)
  library(future)
  library(readr)
})

# ---- User-editable inputs ------------------------------------------------------------------------
cali_version = "cali2"
scen_names <- c("bau", "nsp", "optimistic", "realistic", "pessimistic")

run_names = paste0("GMB_run1_", scen_names, "_", cali_version)
parameter_dirs <- file.path("./04.scenario-setup/04.parameter-lists", run_names, "sites")

# User-defined batch label to keep outputs grouped for a given execution campaign.
batch_root <- "batch-1"
output_root <- file.path("./04.scenario-setup/05.simulation-outputs-preprocessed", batch_root)

# Population override rule for low-transmission sites:
# - High-burden adm1 keep their original parameter-list population (when TRUE below)
# - All other adm1 are forced to `low_site_population_size`
low_site_population_size <- 175000
high_burden_adm1 <- "Upper River"
default_population_from_param <- TRUE



llin_strategy_varying <- readr::read_csv(
  "04.scenario-setup/02.data-outputs/district_with_varying_llin_strategy.csv",
  show_col_types = FALSE
)
# llin_strategy_varying <- tibble(id_79 = paste0("dist_", sprintf("%02d", 1:79)))

fitted_EIR <- readr::read_csv(
  "03.calibration/04.final-eir-values/gmb-final-eir-values-2026.csv",
  show_col_types = FALSE
)

# ---- Source helper functions ---------------------------------------------------------------------
helpers_script <- "./04.scenario-setup/01.scripts/functions/f1-scenario-run-helpers.R"
source(helpers_script)

# ---- Input validation ----------------------------------------------------------------------------
# This fails fast before any parallel workers start.
# No console output means:
#   - `run_names` and `parameter_dirs` have the same length
#   - `fitted_EIR` has columns `uid` and `init_eir`
#   - `llin_strategy_varying` has column `id_79`
#   - every scenario `sites/` directory exists
#   - population override inputs are valid
# console output:
#   - script stops here with a clear `stop(...)` message describing the missing/invalid input.
validate_scenario_inputs(
  run_names = run_names,
  parameter_dirs = parameter_dirs,
  fitted_EIR = fitted_EIR,
  llin_strategy_varying = llin_strategy_varying,
  low_site_population_size = low_site_population_size,
  high_burden_adm1 = high_burden_adm1,
  default_population_from_param = default_population_from_param
)

# Create the batch output root once; scenario subfolders are created after jobs are built.
dir.create(output_root, recursive = TRUE, showWarnings = FALSE)

# ---- Build job table -----------------------------------------------------------------------------
# Expands scenarios into one row per simulation job.
# Expected columns in `jobs`: run_name, param_file_path, file_name, ID.
# "Good" means `nrow(jobs) > 0`; each row is one simulation call.
jobs <- build_scenario_jobs(
  run_names = run_names,
  parameter_dirs = parameter_dirs,
  fitted_EIR = fitted_EIR,
  llin_strategy_varying = llin_strategy_varying
)


# remove yesterdays jobs
jobs <- jobs %>% 
  filter(!str_detect(file_name, "2026-06-12"))

# run only jobs created today
jobs <- jobs %>% 
  filter(str_detect(file_name, "2026-06-18"))



if (nrow(jobs) == 0) {
  # No matching IDs survived scenario filters, so there is nothing to run.
  stop("No scenario jobs remain after applying scenario filters.")
}

# ---- Prepare output folders ----------------------------------------------------------------------
# One folder per scenario run name under the chosen batch root.
scenario_output_dirs <- file.path(output_root, unique(jobs$run_name))
invisible(lapply(scenario_output_dirs, dir.create, recursive = TRUE, showWarnings = FALSE))

# Worker count is capped by both job count and available cores (leave one core free).
workers <- min(nrow(jobs), max(1L, future::availableCores() - 1L))
message("Starting parallel scenario run")
message("Total jobs requested: ", nrow(jobs))
message("Workers: ", workers)

# ---- Parallel plan setup -------------------------------------------------------------------------
future::plan(future::multisession, workers = workers)
on.exit(future::plan(future::sequential), add = TRUE)

# ---- Batch execution (continue on error) ---------------------------------------------------------
# `future_pmap` sends one job-row to one worker call.
# "Good" job result: status == "success" and an `.rds` path in `simulation_output_path`.
# "Bad" job result: status == "failed" plus `error_message`; batch still continues.
batch_results <- furrr::future_pmap(
  jobs,
  function(run_name, param_file_path, file_name, ID) {
    run_scenario_job(
      run_name = run_name,
      param_file_path = param_file_path,
      file_name = file_name,
      ID = ID,
      fitted_EIR = fitted_EIR,
      output_root = output_root,
      low_site_population_size = low_site_population_size,
      high_burden_adm1 = high_burden_adm1,
      default_population_from_param = default_population_from_param
    )
  },
  .options = furrr::furrr_options(seed = TRUE)
)

# ---- Summarize + write run log -------------------------------------------------------------------
# Flatten per-job records into one row per job for monitoring and audit.
run_log <- dplyr::bind_rows(batch_results)

# Batch health summary from per-job status flags.
total_n <- nrow(run_log)
success_n <- sum(run_log$status == "success", na.rm = TRUE)
failed_n <- sum(run_log$status == "failed", na.rm = TRUE)

message("Scenario batch complete")
message("  Total: ", total_n)
message("  Success: ", success_n)
message("  Failed: ", failed_n)

run_log_base <- file.path(output_root, "parallel-scenario-run-log")
# Keep prior logs by using `_v2`, `_v3`, ... if a log file already exists.
run_log_path <- build_unique_path(run_log_base, extension = ".csv")
utils::write.csv(run_log, run_log_path, row.names = FALSE, na = "")
message("Run log written to: ", run_log_path)

if (failed_n > 0) {
  # Quick console triage table so you can inspect failing IDs immediately.
  message("Failed job summary:")
  print(run_log[run_log$status == "failed", c("run_name", "ID", "population_size", "error_message"), drop = FALSE])
}

failed = run_log[run_log$status == "failed", c("run_name", "ID", "population_size", "error_message"), drop = FALSE]

#### rerun failed sims ####

jobs_rerun <- jobs %>% semi_join(failed, by = c("run_name", "ID"))

batch_results <- furrr::future_pmap(
  jobs_rerun,
  function(run_name, param_file_path, file_name, ID) {
    run_scenario_job(
      run_name = run_name,
      param_file_path = param_file_path,
      file_name = file_name,
      ID = ID,
      fitted_EIR = fitted_EIR,
      output_root = output_root,
      low_site_population_size = low_site_population_size,
      high_burden_adm1 = high_burden_adm1,
      default_population_from_param = default_population_from_param
    )
  },
  .options = furrr::furrr_options(seed = TRUE)
)

# ---- Summarize + write run log -------------------------------------------------------------------
# Flatten per-job records into one row per job for monitoring and audit.
run_log <- dplyr::bind_rows(batch_results)

# Batch health summary from per-job status flags.
total_n <- nrow(run_log)
success_n <- sum(run_log$status == "success", na.rm = TRUE)
failed_n <- sum(run_log$status == "failed", na.rm = TRUE)

message("Scenario batch complete")
message("  Total: ", total_n)
message("  Success: ", success_n)
message("  Failed: ", failed_n)

run_log_base <- file.path(output_root, "parallel-scenario-run-log")
# Keep prior logs by using `_v2`, `_v3`, ... if a log file already exists.
run_log_path <- build_unique_path(run_log_base, extension = ".csv")
utils::write.csv(run_log, run_log_path, row.names = FALSE, na = "")
message("Run log written to: ", run_log_path)
