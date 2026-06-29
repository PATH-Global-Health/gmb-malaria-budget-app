# --------------------------------------------------------------------------------------------------
# Helper functions for `05_run-scenarios.R`
# --------------------------------------------------------------------------------------------------

# Normalize mixed-type ID vectors to clean unique character IDs.
clean_ids <- function(x) {
  as.character(x) |>
    # Drop missing and empty values before matching/filtering.
    (\(y) y[!is.na(y) & nzchar(y)])() |>
    unique()
}

# Sanitize free-text tokens for safe filesystem output names.
sanitize_token <- function(x) {
  x <- as.character(x)
  # Compress repeated whitespace so tokens are predictable.
  x <- stringr::str_squish(x)
  # Keep underscores but replace other separators/punctuation with a hyphen.
  x <- stringr::str_replace_all(x, "[^A-Za-z0-9_]+", "-")
  # Remove leading/trailing hyphens created by replacement.
  x <- stringr::str_replace_all(x, "^-+|-+$", "")
  # Fall back to an explicit placeholder if the token is empty after cleaning.
  x <- ifelse(!nzchar(x), "unknown", x)
  x
}

# Extract `adm1` and `adm2` labels from the parameter filename.
extract_site_metadata <- function(file_name, run_name, ID) {
  stem <- tools::file_path_sans_ext(file_name)
  split_key <- paste0("_", run_name, "_")
  split_parts <- strsplit(stem, split_key, fixed = TRUE)[[1]]

  if (length(split_parts) < 2) {
    stop(sprintf("Could not locate run_name token `%s` in file `%s`.", run_name, file_name))
  }

  prefix <- split_parts[1]
  # Drop country prefix (for example `SEN_`) before parsing remaining tokens.
  prefix_no_country <- sub("^[^_]+_", "", prefix)
  # Drop leading ID token (for example `dist_01_`) to isolate area names.
  prefix_no_id <- sub(paste0("^", ID, "_"), "", prefix_no_country)
  area_parts <- strsplit(prefix_no_id, "_", fixed = TRUE)[[1]]

  if (length(area_parts) < 2) {
    stop(sprintf("Could not derive adm1/adm2 from file `%s`.", file_name))
  }

  list(
    adm1 = area_parts[1],
    # Keep remaining pieces joined so multi-word adm2 labels are preserved.
    adm2 = paste(area_parts[-1], collapse = "_")
  )
}

# Resolve site labels from parameter-list fields when available, otherwise
# fall back to parsing the filename.
resolve_site_metadata <- function(params, file_name, run_name, ID) {
  adm1_from_param <- if ("adm1" %in% names(params)) as.character(params[["adm1"]])[1] else NA_character_
  adm2_from_param <- if ("adm2" %in% names(params)) as.character(params[["adm2"]])[1] else NA_character_

  if (!is.na(adm1_from_param) && nzchar(adm1_from_param) &&
      !is.na(adm2_from_param) && nzchar(adm2_from_param)) {
    return(list(adm1 = adm1_from_param, adm2 = adm2_from_param))
  }

  extract_site_metadata(file_name = file_name, run_name = run_name, ID = ID)
}

# Decide the population size to run for this site based on adm1 rule.
resolve_population_size <- function(
    params,
    adm1,
    high_burden_adm1,
    low_site_population_size,
    default_population_from_param
) {
  base_population <- suppressWarnings(as.numeric(params[["human_population"]])[1])
  if (!is.finite(base_population) || base_population <= 0) {
    base_population <- NA_real_
  }

  is_high_burden <- as.character(adm1) %in% as.character(high_burden_adm1)

  # High-burden sites keep their parameter-list population when configured.
  if (is_high_burden && isTRUE(default_population_from_param) && is.finite(base_population)) {
    return(base_population)
  }

  # All other sites use the elevated low-transmission population size.
  as.numeric(low_site_population_size)[1]
}

# Build a non-colliding file path by adding `_vN` when needed.
build_unique_path <- function(path_no_suffix, extension = ".rds") {
  candidate <- paste0(path_no_suffix, extension)
  if (!file.exists(candidate)) {
    return(candidate)
  }

  version <- 2L
  repeat {
    candidate <- paste0(path_no_suffix, "_v", version, extension)
    if (!file.exists(candidate)) {
      return(candidate)
    }
    version <- version + 1L
  }
}

# Validate high-level inputs before building jobs.
validate_scenario_inputs <- function(
    run_names,
    parameter_dirs,
    fitted_EIR,
    llin_strategy_varying,
    low_site_population_size,
    high_burden_adm1,
    default_population_from_param
) {
  if (length(run_names) != length(parameter_dirs)) {
    stop("`run_names` and `parameter_dirs` must have identical length.")
  }

  if (!all(c("uid", "init_eir") %in% names(fitted_EIR))) {
    stop("`fitted_EIR` must contain `uid` and `init_eir` columns.")
  }

  # if (!("id_79" %in% names(llin_strategy_varying))) {
  #   stop("`llin_strategy_varying` must contain `id_79` column.")
  # }

  for (dir_i in parameter_dirs) {
    if (!dir.exists(dir_i)) {
      stop(sprintf("Parameter directory does not exist: %s", dir_i))
    }
  }

  low_site_population_size <- suppressWarnings(as.numeric(low_site_population_size)[1])
  if (!is.finite(low_site_population_size) || low_site_population_size <= 0) {
    stop("`low_site_population_size` must be one positive numeric value.")
  }

  if (length(high_burden_adm1) == 0) {
    stop("`high_burden_adm1` must include at least one adm1 name.")
  }

  if (!is.logical(default_population_from_param) || length(default_population_from_param) != 1) {
    stop("`default_population_from_param` must be one TRUE/FALSE value.")
  }
}

# Build one row per simulation job across all scenario runs.
build_scenario_jobs <- function(run_names, parameter_dirs, fitted_EIR, llin_strategy_varying) {
  scenario_specs <- tibble::tibble(
    scenario_index = seq_along(run_names),
    run_name = run_names,
    parameter_dir = parameter_dirs
  )

  purrr::pmap_dfr(
    scenario_specs,
    function(scenario_index, run_name, parameter_dir) {
      # Scenario rule from legacy loop:
      # first scenario uses all fitted IDs; remaining scenarios use LLIN-varying IDs.
      run_ids <- if (scenario_index == 1L) {
        clean_ids(fitted_EIR$uid)
      } else {
        clean_ids(llin_strategy_varying$uid)
      }

      parameter_files <- list.files(parameter_dir, pattern = "\\.rds$", full.names = TRUE)
      parameter_files <- normalizePath(parameter_files, winslash = "/", mustWork = TRUE)

      if (length(parameter_files) == 0) {
        stop(sprintf("No parameter-list `.rds` files found in: %s", parameter_dir))
      }

      run_jobs <- tibble::tibble(
        run_name = run_name,
        param_file_path = parameter_files,
        file_name = basename(parameter_files),
        # Site token expected in filename (for example `dist_01`).
        ID = stringr::str_extract(file_name, "dist_\\d+")
      )

      if (any(is.na(run_jobs$ID) | !nzchar(run_jobs$ID))) {
        bad_files <- run_jobs$file_name[is.na(run_jobs$ID) | !nzchar(run_jobs$ID)]
        stop(sprintf(
          "Unable to derive site IDs from parameter filename(s): %s",
          paste(bad_files, collapse = ", ")
        ))
      }

      run_jobs |>
        dplyr::filter(ID %in% run_ids) |>
        dplyr::arrange(ID)
    }
  )
}

# Run one simulation job and return a single log-ready result row.
run_scenario_job <- function(
    run_name,
    param_file_path,
    file_name,
    ID,
    fitted_EIR,
    output_root,
    low_site_population_size,
    high_burden_adm1,
    default_population_from_param
) {
  start_time <- Sys.time()

  job_result <- tryCatch(
    {
      # Step 1: load parameters and resolve area labels.
      params <- readRDS(param_file_path)
      original_population_size <- suppressWarnings(as.numeric(params[["human_population"]])[1])
      if (!is.finite(original_population_size) || original_population_size <= 0) {
        original_population_size <- NA_real_
      }
      site_meta <- resolve_site_metadata(
        params = params,
        file_name = file_name,
        run_name = run_name,
        ID = ID
      )

      # Step 2: resolve one initial EIR value for this district ID.
      init_eir_value <- fitted_EIR |>
        dplyr::filter(uid == ID) |>
        dplyr::pull(init_eir)

      if (length(init_eir_value) == 0) {
        stop(sprintf("No `init_eir` value found for ID `%s`.", ID))
      }
      if (length(init_eir_value) > 1) {
        stop(sprintf("Multiple `init_eir` values found for ID `%s`.", ID))
      }

      # Step 3: derive and apply scenario-run population size override.
      population_size <- resolve_population_size(
        params = params,
        adm1 = site_meta$adm1,
        high_burden_adm1 = high_burden_adm1,
        low_site_population_size = low_site_population_size,
        default_population_from_param = default_population_from_param
      )
      params$human_population <- population_size

      # Step 4: set equilibrium and run simulation.
      params <- malariasimulation::set_equilibrium(
        parameters = params,
        init_EIR = init_eir_value
      )
      simulation <- malariasimulation::run_simulation(
        timesteps = params$timesteps,
        parameters = params
      )

      # Step 5: append run identifiers directly into the saved simulation dataframe.
      simulation <- as.data.frame(simulation)
      simulation$run_name <- as.character(run_name)
      simulation$ID <- as.character(ID)
      simulation$adm1 <- as.character(site_meta$adm1)
      simulation$adm2 <- as.character(site_meta$adm2)
      simulation$population_size <- as.numeric(population_size)

      # Step 6: create deterministic output name and collision-safe path.
      file_stem <- paste(
        "sim",
        sanitize_token(run_name),
        sanitize_token(ID),
        sanitize_token(site_meta$adm1),
        sanitize_token(site_meta$adm2),
        sep = "_"
      )
      scenario_dir <- file.path(output_root, run_name)
      output_path <- build_unique_path(file.path(scenario_dir, file_stem), extension = ".rds")

      # Step 7: persist simulation and report success fields.
      saveRDS(simulation, output_path)

      list(
        status = "success",
        error_message = NA_character_,
        adm1 = site_meta$adm1,
        adm2 = site_meta$adm2,
        population_size = population_size,
        population_override_applied = isTRUE(
          is.finite(original_population_size) && (population_size != original_population_size)
        ),
        simulation_output_path = output_path
      )
    },
    # Return structured failure details so the full batch can continue.
    error = function(e) {
      list(
        status = "failed",
        error_message = conditionMessage(e),
        adm1 = NA_character_,
        adm2 = NA_character_,
        population_size = NA_real_,
        population_override_applied = NA,
        simulation_output_path = NA_character_
      )
    }
  )

  elapsed_seconds <- as.numeric(difftime(Sys.time(), start_time, units = "secs"))

  list(
    run_name = run_name,
    ID = ID,
    param_file_path = param_file_path,
    adm1 = job_result$adm1,
    adm2 = job_result$adm2,
    population_size = job_result$population_size,
    population_override_applied = job_result$population_override_applied,
    status = job_result$status,
    error_message = job_result$error_message,
    elapsed_seconds = elapsed_seconds,
    simulation_output_path = job_result$simulation_output_path
  )
}
