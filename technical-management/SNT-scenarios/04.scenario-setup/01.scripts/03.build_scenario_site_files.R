#---------------------------------------------------------------------------------------------------
# Script to create site files to input into malaria simulation simulation process
# Sites are needed for Senegal > Region > District
# The output of this script is a List object RDS:
#                   $country - Country Name
#                   $update_date - Date site file was created or updated
#                   $sites - data.frame: information of spatial units including $amd0 (counntry) $amd1 (region) $adm2 (district) $uid (unnique ID) and $geometry
#                   $target_incidence - data.frame: information for each spatial unit on the target incidence values used for calibration:
#                                       $adm0 $adm1 $adm2 $uid $target_incidence_years $target_incidence_values
#                   $population - data.frame: Annual population data for each spatial unit $adm0 $amd1 $adm2 $uid $year $population
#                   $demography - data.frame: Malariasimulation demographic set up - taken from the Imperial College London Senegal site files Population demographics (age structure) are defined over time for each site. Demography is obtained using the peeps R package, and are based on data from the UN WPP3 Mortality rates are specified for neonates (0-30 days), young infants (31 days - 1 year), older infants (1 year - 5 years) and then in five year age bands.
#                   $vectors - data.frame: Vector species proportions information - $adm0 $adm1 $adm2 $uid $species $prop and then vector binnomics paramaters: $blood_meal_rates $foraging_time $Q0 $phi_bednets $phi_indoors $mum
#                   $resistance - data.frame: resistance data
#                   $seasonality - data.frame: Seasonality parameters
#                   $interventions - data.frame: Key intervention delivery and coverage information per spatial unit
#                   $malariasim_process - data.frame: Additional parameters to pass to malariasim for model running - population size, burnin period, eir, run_name
#--------------------------------------------------------------------------------------------------------

# refer to 03.calibration/01.scripts/s1-create-site-list.R for full version used for calibration
# future scenarios have been created in 04.scenario-setup/01.scripts/02_prep_scen_dat_for_site_files.R

options(repos = c(
  mrcide = 'https://mrc-ide.r-universe.dev',
  CRAN = 'https://cloud.r-project.org'))

# Install some packages
# install.packages('site')

# key packages
library(tidyverse)
library(site)
library(sf)
library(lubridate)

#-KEY VARIABLES-----------------------------------------------------------------------------------------
country <- "Gambia"
years <- c(2010:2030)
update_date <- Sys.Date()
origin_year <- 2010 # year of first intervention information
origin_date <- as.Date(sprintf("%d-01-01", origin_year))
year <- 365 # number of days in a year for converting age and time units to daily values for malariasim

site_file <- list(country = country, update = update_date)

cali_version = "cali2"

cali_mega_rds <- readRDS(paste0("./03.calibration/01.site-file-create/03.outputs/mega-input-gambia-", cali_version,".rds"))

#-SPATIAL DATA-------------------------------------------------------------------------------------------
site_file$sites <-
  readRDS("02.data-processing/shapefiles/03.data-outputs/dist_shp_fixed_may26.RDS") |>
  sf::st_as_sf() |>
  mutate(adm0 = "Gambia") |>
  select(adm0, adm1, adm2, uid = id_42, geometry)

#-TARGET INCIDENCE---------------------------------------------------------------------------------------
site_file$target_incidence <- cali_mega_rds$target_incidence

#-POPULATION--------------------------------------------------------------------------------------------
growth_rate = 1.024 # median of 2024-2025 growth rates

site_file$population <- cali_mega_rds$population |>
  # append to go up to 2032
  group_by(adm1, adm2) |>
  group_modify(~ {
    last_row <- tail(.x, 1)
    last_year <- last_row$year
    last_pop  <- last_row$population
    new_rows <- tibble(
      year       = last_year + 1:5,
      population = round(last_pop * (growth_rate)^(1:5))
    )
    bind_rows(.x, new_rows)
  }) %>%
  ungroup()

# ggplot(site_file$population, aes(x = year, y = population, color = adm2)) +
#   geom_line() +
#   facet_wrap(vars(adm1)) +
#   theme(legend.position = "none")

#-DEMOGRAPHY--------------------------------------------------------------------------------------------
site_file$demography <- cali_mega_rds$demography

#-VECTORS-----------------------------------------------------------------------------------------------
site_file$vectors$vector_species <- cali_mega_rds$vectors$vector_species

#-RESISTANCE-------------------------------------------------------------------------------------------
site_file$resistance <- cali_mega_rds$resistance

#-SEASONALITY-------------------------------------------------------------------------------------------
site_file$seasonality <-cali_mega_rds$seasonality

#-INTERVENTIONS-----------------------------------------------------------------------------------------


##-Treatment coverage----------------------
treatment_coverage <- 
  read_csv("02.data-processing/treatment/02.data-outputs/treatment_data_2000_2024_cali.csv") |>
  # include district by joining to regioal level data - all districts in a region are assigned the same treatment coverage value
  left_join(site_file$sites |> st_drop_geometry() |> select(adm0, adm1, adm2, uid), by = c("adm1", "adm2")) |>
  select(adm0, adm1, adm2, uid, year, trt_seeking ) |>
  #ensure year is numeric
  mutate(year = as.numeric(year)) |>
  # append to go up to 2030
  group_by(adm0, uid,adm1, adm2) |>
  arrange(adm1, adm2, year) |>
   group_modify(~ {
    last_row <- tail(.x, 1)
    last_year <- last_row$year
    last_tx  <- last_row$trt_seeking 
    new_rows <- tibble(
      year       = last_year + 1:6,
      trt_seeking = last_tx)
    bind_rows(.x, new_rows)
  }) %>%
  ungroup() %>% 
  rename(tx_cov = trt_seeking)

##-SMC--------------------------------------

smc_bau <- readRDS("04.scenario-setup/02.data-outputs/site_file_prep_dat/SMC_scen_bau.RDS") %>% mutate(year = year(smc_start_date))
smc_nsp <- readRDS("04.scenario-setup/02.data-outputs/site_file_prep_dat/SMC_scen_nsp.RDS") %>% mutate(year = year(smc_start_date))
smc_optimistic <- readRDS("04.scenario-setup/02.data-outputs/site_file_prep_dat/SMC_scen_optimistic.RDS") %>% mutate(year = year(smc_start_date))
smc_realistic <- readRDS("04.scenario-setup/02.data-outputs/site_file_prep_dat/SMC_scen_realistic.RDS") %>% mutate(year = year(smc_start_date))
smc_pessimistic <- readRDS("04.scenario-setup/02.data-outputs/site_file_prep_dat/SMC_scen_pessimistic.RDS") %>% mutate(year = year(smc_start_date))

##-Vector control---------------------------

###-ITNs------------------------------------
llin_bau <- readRDS("04.scenario-setup/02.data-outputs/site_file_prep_dat/LLIN_scen_bau.RDS")
llin_nsp <- readRDS("04.scenario-setup/02.data-outputs/site_file_prep_dat/LLIN_scen_nsp.RDS")
llin_optimistic <- readRDS("04.scenario-setup/02.data-outputs/site_file_prep_dat/LLIN_scen_optimistic.RDS")
llin_realistic <- readRDS("04.scenario-setup/02.data-outputs/site_file_prep_dat/LLIN_scen_realistic.RDS")
llin_pessimistic <- readRDS("04.scenario-setup/02.data-outputs/site_file_prep_dat/LLIN_scen_pessimistic.RDS")


# itn <- readRDS("04.scenario-setup/02.data-outputs/itn_nsp_scen.RDS")

#-Vaccine
vacc_bau <- readRDS("04.scenario-setup/02.data-outputs/site_file_prep_dat/vacc_scen_bau.RDS")
vacc_nsp <- readRDS("04.scenario-setup/02.data-outputs/site_file_prep_dat/vacc_scen_nsp.RDS")
vacc_optimistic <- readRDS("04.scenario-setup/02.data-outputs/site_file_prep_dat/vacc_scen_optimistic.RDS")
vacc_realistic <- readRDS("04.scenario-setup/02.data-outputs/site_file_prep_dat/vacc_scen_realistic.RDS")
vacc_pessimistic <- readRDS("04.scenario-setup/02.data-outputs/site_file_prep_dat/vacc_scen_pessimistic.RDS")


#-IRS
irs_bau <- readRDS("04.scenario-setup/02.data-outputs/site_file_prep_dat/irs_scen_bau.RDS")
irs_nsp <- readRDS("04.scenario-setup/02.data-outputs/site_file_prep_dat/irs_scen_nsp.RDS")
irs_optimistic <- readRDS("04.scenario-setup/02.data-outputs/site_file_prep_dat/irs_scen_optimistic.RDS")
irs_realistic <- readRDS("04.scenario-setup/02.data-outputs/site_file_prep_dat/irs_scen_realistic.RDS")
irs_pessimistic <- readRDS("04.scenario-setup/02.data-outputs/site_file_prep_dat/irs_scen_pessimistic.RDS")


#-UNUSED INTERVENTIONS IN SENEGAL THAT COULD BE IN FUTURE SCENARIOS SO WILL INCLUDE BLANK TEMPLATES FOR THESE IN THE SITE FILE


#-COMBINE ALL INTERVENTION DATAFRAMES INTO ONE INTERVENTION DATAFRAME TO JOIN TO SITE FILE

# outputs from this function are written to
# "./04.scenario-setup/04.scenario-site-file/"

# run_names = paste0("NSP_itn_scen", LETTERS[1:6],"_noMDA_", cali_version)
# mega_rds_names = paste0("mega_NSP_itn_scen", LETTERS[1:6], "_noMDA_", cali_version)
# itn_scen_names = paste0("itn_scen", LETTERS[1:6])

scen_names <- c("bau", "nsp", "optimistic", "realistic", "pessimistic")

run_combos <- tibble(itn_scen_names = paste0("llin_", scen_names),
                     smc_scen_names = paste0("smc_", scen_names),
                     irs_scen_names = paste0("irs_", scen_names),
                     vax_scen_names = paste0("vacc_", scen_names),
                     run_names = paste0("Strategy_", scen_names),
                     mega_rds_names = paste0("mega_NSP_itn_scen_",scen_names))


for(i in 1:5){

make_future_mega_rds(sf = site_file,
                     itn_scen = run_combos$itn_scen_names[i],
                     treatment_coverage_scen = treatment_coverage,
                     smc_scen = run_combos$smc_scen_names[i],
                     irs_scen = run_combos$irs_scen_names[i],
                     vaccine_scen = run_combos$vax_scen_names[i],
                     run_name = run_combos$run_names[i],
                     mega_rds_name = run_combos$mega_rds_names[i])
  print(i)

}

# debugging
sf = site_file
itn_scen = llin_bau
treatment_coverage_scen = treatment_coverage
smc_scen = smc_bau
irs_scen = irs_bau
vaccine_scen = vacc_bau

make_future_mega_rds <- function(sf,
                                 itn_scen,
                                 treatment_coverage_scen,
                                 smc_scen,
                                 irs_scen,
                                 vaccine_scen,
                                 run_name,
                                 mega_rds_name){

  itn_scen = get(itn_scen)
  smc_scen = get(smc_scen)
  irs_scen = get(irs_scen)
  vaccine_scen = get(vaccine_scen)

  sf$interventions <-
    sf$sites |>
    st_drop_geometry() |>
    select(adm1, adm2, uid) |>
    crossing(year = years)

  itn_scen_nested <-
    itn_scen |>
    arrange(adm1, adm2, year, itn_dist_timestep) |>
    group_by(adm1, adm2, year) |>
    nest(itn = -c(adm1, adm2, year)) |>
    ungroup()

  sf$interventions <-
    sf$interventions |>
    # treatment
    left_join(
      treatment_coverage_scen |>
        select(adm1, adm2, year, tx_cov)
    ) |>
    # ITN monthly distributions nested per district-year
    left_join(
      itn_scen_nested,
      select(-uid),
      by = c("adm1", "adm2", "year")
    ) |>
    # SMC
    left_join(
      smc_scen |>
        select(-uid),
      by = c("adm1", "adm2", "year")
    ) |>
    # IRS
    left_join(
      irs_scen |>
        select(-uid),
      by = c("adm1", "adm2", "year")
    ) |>
    left_join(
      vaccine_scen |>
      select(-uid),
      by = c("adm1", "adm2", "year")
    ) |>
    arrange(adm1, adm2, year)

  rm(itn_scen_nested)

  sf$malariasim_process <-
    sf$sites |>
    st_drop_geometry() |>
    select(adm1, adm2, uid) |>
    mutate(
      population = 100000,     # population size default
      burnin_period_timesteps = 6 * 365, # value in time steps (years * 365)
      burnin_baseline_year = origin_year - (burnin_period_timesteps / 365), # year to use for baseline parameter values during burnin period
      eir = NA_real_, # placeholder for EIR values to input into malariasim after calibration,
      run_name = paste0("GMB_", uid, "_", adm1, "_", adm2, "_",run_name,"_", update_date), # will be used to store sites parameter lists and calibration outputs
      # Default calibration rendering setup:
      # - Age-group and clinical incidence: all ages
      # - Severe incidence: disabled
      # - Prevalence: 2-10 years
      age_group_rendering_min_ages = list(c(0)),
      age_group_rendering_max_ages = list(c(73000)),
      clinical_incidence_rendering_min_ages = list(c(0.001, 0.001)),
      clinical_incidence_rendering_max_ages = list(c(73000, 5*365)),
      severe_incidence_rendering_min_ages = list(c(0.001, 0.001)),
      severe_incidence_rendering_max_ages = list(c(73000, 5*365)),
      prevalence_rendering_min_ages = list(c(0 * year)),
      prevalence_rendering_max_ages = list(c(5 * year)),
      # Treatment drug mapping - this will be used to set the drug type in malariasim
      # we assume AL - artemether-lumefantrine is used throughout
      # other options: DHA-PQP or SP
      treatment_drug = "AL"
    )




  #-EXPORT SITE FILE-----------------------------------------------------------------------------------------
  saveRDS(sf, paste0("./04.scenario-setup/03.scenario-site-file/", mega_rds_name,".rds"))

}


#
# # create intervention dataframe for all sites and all years
# # this will be joined with the specific intervention dataframes for each intervention type
# # and then any missing values for interventions that are not implemented in a given district-year
# # will be filled with 0 coverage values in the final site file.
# site_file$interventions <-
#   site_file$sites |>
#   st_drop_geometry() |>
#   select(adm1, adm2, uid) |>
#   crossing(year = years)
#
#
# # ITN needs to be nested because we have monthly data with routine net distributions
# itn_nested <-
#   itn |>
#   arrange(adm1, adm2, year, itn_dist_timestep) |>
#   group_by(adm1, adm2, year) |>
#   nest(itn = -c(adm1, adm2, year)) |>
#   ungroup()
#
# # Build intervention dataframe
# site_file$interventions <-
#   site_file$interventions |>
#   # treatment
#   left_join(
#     treatment_coverage |>
#       select(adm1, adm2, year, tx_cov)
#   ) |>
#   # ITN monthly distributions nested per district-year
#   left_join(
#     itn_nested,
#     by = c("adm1", "adm2", "year")
#   ) |>
#   # SMC
#   left_join(
#     smc |>
#       select(-uid),
#     by = c("adm1", "adm2", "year")
#   ) |>
#   # MDA
#   left_join(
#     mda |>
#     select(-uid),
#     by = c("adm1", "adm2", "year")
#   ) |>
#   # # IRS
#   # left_join(
#   #   irs,
#   #   by = c("adm1", "adm2", "year")
#   # ) |>
#   # placeholders for interventions not currently implemented
#   # left_join(
#   #   lsm,
#   #   by = c("adm1", "adm2", "year")
#   # ) |>
#   left_join(
#     vaccine,
#     by = c("adm1", "adm2", "year")
#   ) |>
#   # left_join(
#   #   pmc,
#   #   by = c("adm1", "adm2", "year")
#   # ) |>
#   arrange(adm1, adm2, year)
#
# rm(itn_nested)
#
# #-MALARIASIM PROCESS PARAMETERS--------------------------------------------------------------------------------
# # This dataframe includes additional parameters to pass to malariasim for model running - population size, burnin period
# # EIR once the model has been calibrated to the target incidence values
# # For model runs we would ensure that these values get updated for the specific run
# # Age rendering schema notes:
# # - Rendering values are stored as list-columns so each site can define one or
# #   many age bands per output.
# # - All age values are in DAYS (malariasimulation timesteps).
# # - Each output uses paired min/max vectors that are read directly by
# #   set_age_outputs():
# #     * age_group_rendering_min_ages / age_group_rendering_max_ages
# #     * clinical_incidence_rendering_min_ages / clinical_incidence_rendering_max_ages
# #     * severe_incidence_rendering_min_ages / severe_incidence_rendering_max_ages
# #     * prevalence_rendering_min_ages / prevalence_rendering_max_ages
# # - Use numeric(0) in both min/max columns to disable a given output cleanly.
#
# run_name = "NSP_scenario_1"
#
# site_file$malariasim_process <-
#   site_file$sites |>
#   st_drop_geometry() |>
#   select(adm1, adm2, uid) |>
#   mutate(
#     population = 100000,     # population size default
#     burnin_period_timesteps = 6 * 365, # value in time steps (years * 365)
#     burnin_baseline_year = origin_year - (burnin_period_timesteps / 365), # year to use for baseline parameter values during burnin period
#     eir = NA_real_, # placeholder for EIR values to input into malariasim after calibration,
#     run_name = paste0("SEN_", uid, "_", adm1, "_", adm2, "_",run_name,"_", update_date), # will be used to store sites parameter lists and calibration outputs
#     # Default calibration rendering setup:
#     # - Age-group and clinical incidence: all ages
#     # - Severe incidence: disabled
#     # - Prevalence: 2-10 years
#     age_group_rendering_min_ages = list(c(0)),
#     age_group_rendering_max_ages = list(c(73000)),
#     clinical_incidence_rendering_min_ages = list(c(0.001)),
#     clinical_incidence_rendering_max_ages = list(c(73000)),
#     severe_incidence_rendering_min_ages = list(numeric(0)),
#     severe_incidence_rendering_max_ages = list(numeric(0)),
#     prevalence_rendering_min_ages = list(c(2 * year)),
#     prevalence_rendering_max_ages = list(c(10 * year)),
#   # Treatment drug mapping - this will be used to set the drug type in malariasim
#     # we assume AL - artemether-lumefantrine is used throughout
#     # other options: DHA-PQP or SP
#     treatment_drug = "AL"
#   )
#
#
#
#
# #-EXPORT SITE FILE-----------------------------------------------------------------------------------------
# saveRDS(site_file, "./04.scenario-setup/04.scenario-site-file/mega-scen1_NSP.rds")


