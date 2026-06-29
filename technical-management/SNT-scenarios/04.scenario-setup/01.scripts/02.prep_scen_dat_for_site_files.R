
# key packages
library(tidyverse)
library(site)
library(sf)
library(lubridate)
rm(list = ls())


cali_version = "cali2"

cali_mega_rds <- readRDS(paste0("./03.calibration/01.site-file-create/03.outputs/mega-input-gambia-", cali_version,".rds"))


origin_year <- 2017 # year of first intervention information
origin_date <- as.Date(sprintf("%d-01-01", origin_year))

all_llin <- readRDS("04.scenario-setup/02.data-outputs/llin_scens_v1.RDS")
all_routine <- readRDS("04.scenario-setup/02.data-outputs/routine_llin_scens_v1.RDS")
all_smc <- readRDS("04.scenario-setup/02.data-outputs/smc_scens_v1.RDS")
all_iptsc <- readRDS("04.scenario-setup/02.data-outputs/iptsc_scens_v1.RDS")
all_vax <- readRDS("04.scenario-setup/02.data-outputs/vax_scens_v1.RDS")
all_irs <- readRDS("04.scenario-setup/02.data-outputs/irs_scens_v1.RDS")

#### SMC ####

# combine SMC and IPTsc into one intervention

smc_clean <- all_smc %>% pivot_longer(nsp:pessimistic, 
                                      names_to = "strategy",
                                      values_to = "smc_strat") %>% 
  dplyr::select(adm1, adm2, uid = id_42,
                                       strategy, smc_strat) %>%
  mutate(smc_n_rounds = str_extract(smc_strat, "\\d+"),
         smc_n_rounds = as.numeric(smc_n_rounds))


iptp_clean <- all_iptsc %>% pivot_longer(nsp:pessimistic, 
                                         names_to = "strategy",
                                         values_to = "iptsc_strat") %>% 
  rename(uid = id_42)


smc_clean_inc_iptsc <- smc_clean %>% left_join(iptp_clean, by = c("adm1", "adm2", "uid", "strategy")) %>% 
  mutate(smc_max_age = case_when(!is.na(smc_strat) & !is.na(iptsc_strat) ~ 13*365,
                                 !is.na(smc_strat) & is.na(iptsc_strat) ~ 5*365,
                                 .default = NA_integer_)) %>% 
  mutate(smc_coverage = case_when(!is.na(smc_strat) & !is.na(iptsc_strat) ~ 0.65,
                                  !is.na(smc_strat) & is.na(iptsc_strat) ~ 0.75,
                                  .default = NA_integer_))

make_smc_scen <- function(smc_input, savename){
  
  smc_pre <- cali_mega_rds$interventions %>% dplyr::select(adm1, adm2, uid, contains("smc")) %>%
    filter(!is.na(smc_n_rounds))
  
  smc_scen = tibble(adm1 = smc_input$adm1,
                    adm2 = smc_input$adm2,
                    uid = smc_input$uid,
                    smc_n_rounds = smc_input$smc_n_rounds,
                    smc_min_age = 91,
                    smc_max_age = smc_input$smc_max_age,
                    smc_start = "July",
                    smc_end = "September",
                    smc_drug = "sp_aq",
                    smc_cov = smc_input$smc_coverage,
                    smc_start_month =7) %>%
    expand_grid(year = 2026:2030) %>%
    mutate(smc_start_date = as.Date(sprintf("%d-%02d-15", year, smc_start_month)), # assume mid month start date for SMC campaign
           smc_timestep = as.numeric(difftime(smc_start_date, origin_date, units = "days")))
  
  smc_scen <- bind_rows(smc_pre, smc_scen) %>%
    arrange(adm1, adm2, year)
  
  saveRDS(smc_scen,
          paste0("04.scenario-setup/02.data-outputs/site_file_prep_dat/", savename, ".RDS"))
}

scen_names <- sort(unique(smc_clean$strategy))

for(i in 1:length(scen_names)){
  
  smc_inp <- smc_clean_inc_iptsc %>% filter(strategy == scen_names[i])
  
  make_smc_scen(smc_input = smc_inp, savename = paste0("SMC_scen_", scen_names[i]))
  
}

# 
# #### MDA ####
# 
# mda_clean <- all_mda %>% dplyr::select(adm1 = region, adm2 = district, uid = id_42,
#                                        strategy,
#                                        mda_coverage) %>%
#   filter(!is.na(mda_coverage)) %>%
#   mutate(mda_cov_month1 = ifelse(mda_coverage == "Tous les PS", 0.8, 0.3),
#          mda_cov_month2 = ifelse(mda_coverage == "Tous les PS", 0.75, 0.25),
#          mda_cov_month3 = ifelse(mda_coverage == "Tous les PS", 0.7, 0.2))
# 
# 
# 
# 
# make_mda_scen <- function(mda_input, savename){
#   
#   mda_pre <- cali_mega_rds$interventions %>% dplyr::select(adm1, adm2, uid, contains("mda")) %>%
#     filter(!is.na(mda_month1))
#   
#   mda_scen <- tibble(adm1 = mda_input$adm1,
#                      adm2 = mda_input$adm2,
#                      uid =  mda_input$uid,
#                      mda_min_age = 91.2,
#                      mda_max_age = 5110) %>%
#     expand_grid(year =2026:2030) %>%
#     mutate(mda_month1 = ymd(paste0(year, "-07-11")),
#            mda_month2 = ymd(paste0(year, "-09-23")),
#            mda_month3 = ymd(paste0(year, "-10-03")),
#            mda_drug = "DHAPQ + Primaquine",
#            mda_cov_month1 = rep(mda_input$mda_cov_month1,each = length(2026:2030)) ,
#            mda_cov_month2 = rep(mda_input$mda_cov_month2,each = length(2026:2030)),
#            mda_cov_month3 = rep(mda_input$mda_cov_month3,each = length(2026:2030))) %>%
#     mutate(    mda_timestep_month1 = as.numeric(difftime(mda_month1, origin_date, units = "days")),
#                mda_timestep_month2 = as.numeric(difftime(mda_month2, origin_date, units = "days")),
#                mda_timestep_month3 = as.numeric(difftime(mda_month3, origin_date, units = "days")))
#   
#   mda_scen <- bind_rows(mda_pre, mda_scen) %>%
#     arrange(adm1, adm2, mda_month1)
#   
#   saveRDS(mda_scen,
#           paste0("04.scenario-setup/02.data-outputs/prepped_dat_post_SNT_workshop/", savename, ".RDS"))
#   
# }
# 
# 
# for(i in 1:length(scen_names)){
#   
#   mda_inp <- mda_clean %>% filter(strategy == scen_names[i])
#   
#   if(nrow(mda_inp) > 0) make_mda_scen(mda_input = mda_inp, savename = paste0("MDA_scen_", i))
#   
# }

#### ITNs ####

# build unnested then nest later

# created in 01b_PNLP_LLIN_scenarios.R

llin_clean <- all_llin %>%
  pivot_longer(nsp:pessimistic, 
               names_to = "strategy",
               values_to = "llin_strat") %>% 
  mutate(llin_coverage = case_when(llin_strat == "1_net_3_p" ~ 0.71, # value from AMP LLIN quantification tool
                                   llin_strat == "deprioritize" ~ NA,
                                   llin_strat == "ITN, max 4 per HH" ~ 0.932,
                                   llin_strat == "ITN, max 5 per HH" & adm1 == "Western 2" ~ 0.908,
                                   llin_strat == "ITN, max 5 per HH" & adm1 == "Lower River" ~ 0.885,
                                   llin_strat == "ITN, max 7 per HH" & adm1 == "Central River" ~ 0.935,
                                   llin_strat == "ITN, max 7 per HH" & adm1 == "Upper River" ~ 0.873,
                                   llin_strat == "universal" ~ 1,
                                   .default = NA)) %>% 
  dplyr::select(adm1, adm2, uid = id_42, strategy,
                llin_strat, llin_coverage)

llin_strategy_varying2 <- llin_clean %>% distinct(adm1, adm2, uid, llin_strat, strategy) %>%
  arrange(uid)
write_csv(llin_strategy_varying2, "04.scenario-setup/02.data-outputs/district_with_varying_llin_strategy.csv")



# llin_scens <- read_csv("04.scenario-setup/02.data-outputs/pnlp_llin_scens.csv")
#
# llin_strategy_varying <- llin_scens %>% distinct(region, district, id_42) %>%
#   arrange(id_42)
# write_csv(llin_strategy_varying, "04.scenario-setup/02.data-outputs/district_with_varying_llin_strategy.csv")

locs <- cali_mega_rds$interventions %>% distinct(adm1, adm2, uid)

itn_pre = bind_rows(cali_mega_rds$interventions$itn) %>%
  rename(uid = uid.x) %>% 
  dplyr::select(-uid.y) %>% 
  mutate(year = year(origin_date + itn_dist_timestep)) %>%
  left_join(locs, by = "uid")

# get all the resistance parameters from the pre- file
resistance_level = cali_mega_rds$resistance %>%
  filter(year %in% c(2026:2030))

itn_efficacy_params <-
  read.csv("./03.calibration/01.site-file-create/02.accessory-data/itn-efficacy-params.csv") |>
  mutate(
    # Normalize join key so values like "dual-ai" and "dual_ai" match.
    itn_net_type_join = str_to_lower(str_trim(itn_net_type)),
    itn_net_type_join = str_replace_all(itn_net_type_join, "-", "_"),
    pyrethroid_resistance_join = round(pyrethroid_resistance, 2)
  ) |>
  select(-itn_net_type, -pyrethroid_resistance)

# resistance_params = itn_pre %>% group_by(adm0, uid) %>%
#   slice_max(itn_dist_timestep) %>%
#   ungroup() %>%
#   dplyr::select(uid, pyrethroid_resistance, bioassay_mortality, dn0, rn0, gamman, rnm)

# set up the timing of routine campaigns (same everywhere)

# find the mean routine distribution over the last 3 years

mean_routine_dist = itn_pre %>% group_by(uid, adm1, adm2) %>% 
  # remove the mass campaigns
  mutate(uid_median_cov = median(itn_cov),
         limit = uid_median_cov*25) %>% 
  ungroup() %>% 
  filter(itn_cov < limit) %>% 
  # only look at the last 3 years (7 - 9 = 2024-2026 )
  filter(itn_dist_timestep >= 6*365) %>% 
  group_by(uid) %>% 
  summarise(n_months = n(),
            mean_itn_cov = mean(itn_cov))

mean_monthly_routine_cov = mean(mean_routine_dist$mean_itn_cov)
  
routine_clean <- all_routine %>%
  rename(uid = id_42) %>% 
  pivot_longer(nsp:pessimistic, 
               names_to = "strategy",
               values_to = "routine_strat") %>% 
  mutate(mean_itn_cov_monthly = mean_monthly_routine_cov) %>% 
  # mutate(routine_llin_coverage = case_when(routine_strat == "Cease routine distribution in 6 months following mass campaign + enhanced routine in areas w CBS" ~ mean_routine_itn_dist*1.5,
  #                                          .default = mean_routine_itn_dist)) %>% 
  dplyr::select(adm1, adm2, uid, strategy, routine_strat, mean_itn_cov_monthly)

# need to include ceasing routine distribution after mass campaign 
# timing of the next mass campaign

itn_routine_list <- list()

# lazy assumption here - one routine strategy for every district
itn_routine_clean_short <- routine_clean %>% distinct(strategy, mean_itn_cov_monthly)

# test model input
# routine_input = itn_routine_clean_short %>% filter(strategy == "pessimistic")

make_itn_routine <- function(routine_input, cease_post_mass = FALSE){
  
  # annual_prop_pop_routine = routine_input$routine_llin_coverage
  monthly_prop_pop_routine = mean_monthly_routine_cov
  
  # set up monthly timesteps then convert into day timesteps
  dist_times <- seq.Date(ymd("2026-01-01"), ymd("2030-12-31"), by = "month")
  dist_timesteps = as.numeric(difftime(dist_times, origin_date, units = "days"))
  
  if(cease_post_mass){
    # 4169 is the time of the mass campaign - remove routine distributions in following 6 months
    rem_pts = which(dist_timesteps >4169 & dist_timesteps <= (4169+366/2))
    dist_timesteps = dist_timesteps[-rem_pts]
    dist_times = dist_times[-rem_pts]
    }
  
  itn_routine = tibble(
    year = year(dist_times),
    itn_dist_timestep = dist_timesteps,
    itn_distributed = NA,
    itn_cov = monthly_prop_pop_routine,
    itn_usage_estimate = NA,
    itn_retention = itn_pre$itn_retention[1],
    itn_net_type = "dual-ai",
    adm0 = "Gambia")
  
  return(itn_routine)
  
}

for(i in 1:length(scen_names)){
  
  itn_routine_inp <- itn_routine_clean_short %>% filter(strategy == scen_names[i])
  
  itn_routine_list[[i]] <- make_itn_routine(itn_routine_inp)
}




## combine with location and then join with resistance params

itn_all_list <- list()

for(i in 1:5){
  
  itn_all_list[[i]] <- itn_routine_list[[i]] %>%
    expand_grid(distinct(itn_pre, uid)) %>%
    left_join(resistance_level, by = c("year", "uid", "adm0")) %>%
    mutate(itn_net_type_join = str_to_lower(str_trim(itn_net_type)),
           itn_net_type_join = str_replace_all(itn_net_type_join, "-", "_"),
           pyrethroid_resistance_join = round(pmin(pmax(pyrethroid_resistance, 0), 1), 2)) |>
    left_join(itn_efficacy_params, by = c("itn_net_type_join", "pyrethroid_resistance_join")) |>
    select(-itn_net_type_join, -pyrethroid_resistance_join)
  
}

# add in mass campaigns as per each scenario

# assume the mass campaign happens in June
mass_time = ymd("2028-06-01")
dist_times <- seq.Date(ymd("2026-01-01"), ymd("2030-12-31"), by = "month")
dist_timesteps = as.numeric(difftime(dist_times, origin_date, units = "days"))
mass_timestep_actual = as.numeric(difftime(mass_time, origin_date, units = "days"))
mass_timestep_nearest = dist_timesteps[which.min(abs(mass_timestep_actual - dist_timesteps))]



llin_scen_names <- sort(unique(llin_clean$strategy))


# function to make each scenario

make_itn_scen <- function(llin_scenario_name, itn_all_pick, save_name, coverage_multiplier = 0.7){
  
  # filter by scenario, set up the timestep of the mass campaign so it can be joined to itn_all
  # then set the mass coverage based on PNLP coverage * 0.7 to get realistic usage numbers
  itn_scen_select <- llin_clean %>%  filter(strategy == llin_scenario_name) %>%
    mutate(itn_dist_timestep = mass_timestep_nearest) %>%
    mutate(mass_coverage_actual = llin_coverage*coverage_multiplier)
  
  itn_all_add_scen <- itn_all_pick %>% left_join(itn_scen_select, by = c("uid", "adm1", "adm2",
                                                                         "itn_dist_timestep")) %>%
    # replace the previous values with sum of mass value and routine value
    mutate(itn_cov = ifelse(!is.na(strategy), itn_cov + mass_coverage_actual, itn_cov)) %>%
    bind_rows(itn_pre) %>%
    arrange(uid, itn_dist_timestep) %>%
    dplyr::select(-c(strategy, llin_coverage, mass_coverage_actual))
  
  saveRDS(itn_all_add_scen, paste0("04.scenario-setup/02.data-outputs/site_file_prep_dat/",save_name,".RDS"))
}

for(i in 1:5){

  make_itn_scen(llin_scen_names[i], itn_all_pick = itn_all_list[[i]], save_name = paste0("LLIN_scen_", llin_scen_names[i]))

}


#### vaccine ####


vacc_pre <- cali_mega_rds$interventions %>% dplyr::select(adm1, adm2, uid, contains("vacc")) %>%
  filter(!is.na(vaccine_timestep ))

vacc_clean <- all_vax %>% clean_names() %>% 
  pivot_longer(nsp:pessimistic, names_to = "strategy", values_to = "vax_strat") %>%
  dplyr::select(adm1,
                uid = id_42,
                adm2,
                strategy,
                vax_strat) %>% 
  mutate(vaccine_coverage = ifelse(!is.na(vax_strat), 0.9, NA))

vacc_input = vacc_clean %>% filter(strategy == "nsp")

make_vacc_scen <- function(vacc_input, savename){
  
  vacc_pre <- cali_mega_rds$interventions %>% dplyr::select(adm1, adm2, uid, contains("vacc")) %>%
    filter(!is.na(vaccine_timestep))
  
  vacc_scen = tibble(adm1 = vacc_input$adm1,
                    adm2 = vacc_input$adm2,
                    uid = vacc_input$uid,
                    vaccine_timestep = 3652,
                    year =  year(origin_date + days(3652)),
                    vaccine_cov = vacc_input$vaccine_coverage,
                    vaccine_age_first_dose = 5*30,
                    vaccine_type = "r21",
                    vaccine_booster_spacing_timestep = 365,
                    vaccine_booster_cov = 0.95)
  
  vacc_scen <- bind_rows(vacc_pre, vacc_scen) %>%
    arrange(adm1, adm2)
  
  saveRDS(vacc_scen,
          paste0("04.scenario-setup/02.data-outputs/site_file_prep_dat/", savename, ".RDS"))
}

scen_names <- sort(unique(vacc_clean$strategy))

for(i in 1:length(scen_names)){
  
  vacc_inp <- vacc_clean %>% filter(strategy == scen_names[i]) 
  
  make_vacc_scen(vacc_input = vacc_inp, savename = paste0("vacc_scen_", scen_names[i]))
  
}


#### IRS ####

# join with IRS parameter data to attach efficacy parameters based on insecticide type
irs_class_params <-
  readxl::read_excel("./03.calibration/01.site-file-create/02.accessory-data/irs_parameters.xlsx", sheet = "IRS_parameters") |>
  transmute(
    irs_class = str_to_lower(str_trim(irs_class)),
    ls_theta,
    ls_gamma,
    ks_theta,
    ks_gamma,
    ms_theta,
    ms_gamma
  ) |>
  # remove non-data rows
  filter(!is.na(irs_class), !str_starts(irs_class, "note")) |>
  # standardize to singular labels for matching
  mutate(
    irs_class_join = case_when(
      irs_class %in% c("pyrethroids", "pyrethroid") ~ "pyrethroid",
      irs_class %in% c("carbamates", "carbamate") ~ "carbamate",
      irs_class %in% c("organophosphates", "organophosphate") ~ "organophosphate",
      irs_class %in% c("neonicotinoids", "neonicotinoid") ~ "neonicotinoid",
      TRUE ~ irs_class
    )
  ) |>
  select(-irs_class)

irs_pyrethroid_params <-
  readxl::read_excel("./03.calibration/01.site-file-create/02.accessory-data/irs_parameters.xlsx", sheet = "Pyrethroid_resistance", skip = 8) |>
  transmute(
    pyrethroid_resistance = suppressWarnings(as.numeric(pyrethroid_resistance)),
    ls_theta,
    ls_gamma,
    ks_theta,
    ks_gamma,
    ms_theta,
    ms_gamma
  ) |>
  # keep only numeric resistance rows (drops footer row)
  filter(!is.na(pyrethroid_resistance)) |>
  mutate(pyrethroid_resistance_join = round(pmin(pmax(pyrethroid_resistance, 0), 1), 2)) |>
  select(-pyrethroid_resistance)



irs_clean <- all_irs %>% clean_names() %>% 
  pivot_longer(nsp:pessimistic, names_to = "strategy", values_to = "irs_strat") %>%
  dplyr::select(adm1,
                uid = id_42,
                adm2,
                strategy,
                irs_strat) %>% 
  mutate(irs_coverage = ifelse(!is.na(irs_strat), 0.4, NA)) 
  
      

irs_input = irs_clean %>% filter(strategy == "nsp")

make_irs_scen <- function(irs_input, savename){
  
  irs_pre <- cali_mega_rds$interventions %>% dplyr::select(adm1, adm2, uid, year, contains("irs_"),
                                                           contains("pyrethroid_resistance"),
                                                           contains("ls_"),
                                                           contains("ks_"),
                                                           contains("ms_")) 
  
  irs_scen = tibble(adm1 = irs_input$adm1,
                     adm2 = irs_input$adm2,
                     uid = irs_input$uid,
                     irs_insecticide_type_1 = "carbamate",
                     irs_start_month = 7,
                     irs_pop_cov = irs_input$irs_coverage) %>% 
    expand_grid(year = 2026:2030) %>%
    mutate(irs_start_date = as.Date(sprintf("%d-%02d-01", year, irs_start_month)), # assume mid month start date for SMC campaign
           irs_start_timestep = as.numeric(difftime(irs_start_date, origin_date, units = "days"))) %>% 
    mutate(
      irs_class_join = str_to_lower(str_trim(irs_insecticide_type_1)),
      irs_class_join = case_when(
        irs_class_join %in% c("pyrethroids", "pyrethroid") ~ "pyrethroid",
        irs_class_join %in% c("carbamates", "carbamate") ~ "carbamate",
        irs_class_join %in% c("organophosphates", "organophosphate") ~ "organophosphate",
        irs_class_join %in% c("neonicotinoids", "neonicotinoid") ~ "neonicotinoid",
        TRUE ~ irs_class_join
      )
    ) |>
    # class-level parameters for all IRS classes
    left_join(irs_class_params, by = "irs_class_join") |>
    # add district-year pyrethroid resistance for pyrethroid parameter mapping
    left_join(
      resistance_level |>
        select(adm1, adm2, year, pyrethroid_resistance),
      by = c("adm1", "adm2", "year")
    ) |>
    mutate(pyrethroid_resistance_join = round(pmin(pmax(pyrethroid_resistance, 0), 1), 2)) |>
    # pyrethroid resistance-specific theta/gamma values
    left_join(
      irs_pyrethroid_params |>
        rename(
          ls_theta_pyrethroid = ls_theta,
          ls_gamma_pyrethroid = ls_gamma,
          ks_theta_pyrethroid = ks_theta,
          ks_gamma_pyrethroid = ks_gamma,
          ms_theta_pyrethroid = ms_theta,
          ms_gamma_pyrethroid = ms_gamma
        ),
      by = "pyrethroid_resistance_join"
    ) |>
    # override class-level parameters for pyrethroid rows only
    mutate(
      ls_theta = if_else(irs_class_join == "pyrethroid", coalesce(ls_theta_pyrethroid, ls_theta), ls_theta),
      ls_gamma = if_else(irs_class_join == "pyrethroid", coalesce(ls_gamma_pyrethroid, ls_gamma), ls_gamma),
      ks_theta = if_else(irs_class_join == "pyrethroid", coalesce(ks_theta_pyrethroid, ks_theta), ks_theta),
      ks_gamma = if_else(irs_class_join == "pyrethroid", coalesce(ks_gamma_pyrethroid, ks_gamma), ks_gamma),
      ms_theta = if_else(irs_class_join == "pyrethroid", coalesce(ms_theta_pyrethroid, ms_theta), ms_theta),
      ms_gamma = if_else(irs_class_join == "pyrethroid", coalesce(ms_gamma_pyrethroid, ms_gamma), ms_gamma)
    ) |>
    select(
      -irs_class_join,
      -pyrethroid_resistance_join,
      -ls_theta_pyrethroid,
      -ls_gamma_pyrethroid,
      -ks_theta_pyrethroid,
      -ks_gamma_pyrethroid,
      -ms_theta_pyrethroid,
      -ms_gamma_pyrethroid
    )
  
  
  irs_scen <- bind_rows(irs_pre, irs_scen) %>%
    arrange(adm1, adm2) %>% 
    mutate(year = year(irs_start_date))

  
  saveRDS(irs_scen,
          paste0("04.scenario-setup/02.data-outputs/site_file_prep_dat/", savename, ".RDS"))
}

scen_names <- sort(unique(irs_clean$strategy))

for(i in 1:length(scen_names)){
  
  irs_inp <- irs_clean %>% filter(strategy == scen_names[i])
  
  make_irs_scen(irs_input = irs_inp, savename = paste0("irs_scen_", scen_names[i]))
}



trt_pre <- cali_mega_rds$interventions %>% dplyr::select(adm1, adm2, uid, year, contains("tx_cov")) 

mean_trt = trt_pre %>% filter(year >= 2020) %>% 
  group_by(adm1, adm2) %>% 
  summarise(mean_tx = mean(tx_cov))

