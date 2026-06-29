library(tidyverse)
library(sf)
library(janitor)

# set up 

path_dist_shp <- "02.data-processing/shapefiles/03.data-outputs/dist_shp_fixed_may26.RDS"
path_region_shp <- "02.data-processing/shapefiles/03.data-outputs/region_shp_fixed_aug24.RDS"
# District polygons: primary spatial unit for joins and district-level maps.
dist_shp <- readRDS(path_dist_shp)
# Regional polygons: overlaid as bold boundaries for spatial context.
region_shp <- readRDS(path_region_shp)


dist_df <- dist_shp %>% st_drop_geometry() %>% dplyr::select(adm1, adm2, id_42)

# incidence data for interventions targeted by incidence 
inc_dat <- read_csv("02.data-processing/dhis2-data/03.data-outputs/GMB_inc_2020_2025_cali.csv")

inc_dat_24 <- inc_dat %>% filter(year %in% c(2024)) %>% 
  dplyr::select(adm1, adm2, year, malaria_incidence_per_1000_corrected) %>% 
  rename(inc_2024 = malaria_incidence_per_1000_corrected)
inc_dat_23_25 <- inc_dat %>% filter(year %in% c(2023:2025)) %>% 
  group_by(adm1, adm2) %>% 
  summarise(inc_2023_2025 = mean(malaria_incidence_per_1000_corrected)) %>% 
  ungroup()

pop_2025 <- inc_dat %>% filter(year == 2025) %>% 
  dplyr::select(adm1, adm2, population = population_new)


#### set up LLIN scenarios ####

max_net_dat <- read_csv("C:/Users/hslater/Box/snt-2025/gambia/02.data-processing/stratification/llin_max_per_hh_dat.csv") %>% 
  mutate(adm1 = case_when(region == "CRR" ~ "Central River",
                          region == "LRR" ~ "Lower River",
                          region == "NBE" ~ "North Bank East",
                          region == "NBW" ~ "North Bank West",
                          region == "URR" ~ "Upper River",
                          region == "Western1" ~ "Western 1",
                          region == "Western2" ~ "Western 2"))
max_net_dat_temp = max_net_dat %>% dplyr::select(adm1, max_nets_per_HH)

llin_scens <- dist_df %>% 
  left_join(max_net_dat_temp) %>% 
  mutate(nsp = "universal",
         bau = "universal",
         optimistic = "universal",
         realistic = "1_net_3_p") %>% 
  mutate(pessimistic = case_when(adm2 %in% c("Kombo North", "Kanifing", 
                                                  # CBS areas (inc < 10)
                                                  "Lower Niumi", "Upper Niumi", "Jokadu",
                                                  "Upper Badibu", "Central Badibu", 
                                                  "Lower Badibu", "Sabach Sanjar") ~ "deprioritize",
                                                  .default = paste0("ITN, max ", max_nets_per_HH, " per HH")))
           
saveRDS(llin_scens, "C:/Users/hslater/Box/snt-2025/gambia/04.scenario-setup/02.data-outputs/llin_scens_v1.RDS")           

#### set up routine LLIN scens ####

routine_llin_scens <- dist_df %>% 
  mutate(nsp = "Everywhere",
         bau = "Everywhere",
         optimistic = "Everywhere",
         realistic = "Cease routine distribution in 6 months following mass campaign",
         pessimistic = ifelse(adm2 %in% c("Lower Niumi", "Upper Niumi", "Jokadu",
                                          "Upper Badibu", "Central Badibu", 
                                          "Lower Badibu", "Sabach Sanjar"), 
                              "Cease routine distribution in 6 months following mass campaign + enhanced routine in areas w CBS",
                              "Cease routine distribution in 6 months following mass campaign"))

saveRDS(routine_llin_scens, "C:/Users/hslater/Box/snt-2025/gambia/04.scenario-setup/02.data-outputs/routine_llin_scens_v1.RDS")           


#### set up SMC scens ####

smc_2025 <- read_csv("02.data-processing/smc/cleaned_smc.csv") %>% 
  filter(year == 2025) %>% 
  clean_names() %>% 
  dplyr::select(adm1 = region, adm2 = district) %>% 
  mutate(smc_2025 = 1)


smc_scens <- dist_df %>% 
  left_join(inc_dat_24) %>% 
  left_join(inc_dat_23_25) %>% 
  left_join(smc_2025) %>%
  left_join(pop_2025) %>% 
  mutate(nsp = ifelse(inc_2024 >= 30, "SMC (4 cycles)",NA),
         bau = ifelse(smc_2025 == 1, "SMC (4 cycles)", NA),
         optimistic = ifelse(inc_2023_2025 >= 30, "SMC (4 cycles)", NA),
         realistic = ifelse(inc_2023_2025 >= 30, "SMC (4 cycles)", NA),
         pessimistic = case_when(inc_2023_2025 >= 30 & adm2 %in% c("Kombo North", "Kombo Central") ~ "SMC with some urban\ndeprioritisation\n(3 cycles)",
                                 inc_2023_2025 >= 30 & !adm2 %in% c("Kanifing", "Banjul") ~ "SMC (3 cycles)",
                                 .default = NA)) %>% 
  dplyr::select(adm1, adm2, id_42, nsp, bau, optimistic, realistic, pessimistic)

saveRDS(smc_scens, "C:/Users/hslater/Box/snt-2025/gambia/04.scenario-setup/02.data-outputs/smc_scens_v1.RDS")           


names(smc_scens)

#### set up IPTsc scens ####

iptsc_scens <- dist_df %>% 
  left_join(inc_dat_24) %>% 
  left_join(inc_dat_23_25) %>% 
  left_join(pop_2025) %>% 
  mutate(nsp = ifelse(inc_2024 >= 30, "IPTsc",NA),
         bau = NA,
         optimistic = ifelse(inc_2023_2025 >= 30 & adm1 %in% c("Central River", "Upper River"), "IPTsc",NA),
         realistic = NA,
         pessimistic = NA) %>% 
  dplyr::select(-c(year, inc_2024, inc_2023_2025, population))
  
saveRDS(iptsc_scens, "C:/Users/hslater/Box/snt-2025/gambia/04.scenario-setup/02.data-outputs/iptsc_scens_v1.RDS")           

#### set up IRS scens ####

irs_scens <- dist_df %>% 
  left_join(inc_dat_24) %>% 
  left_join(inc_dat_23_25) %>% 
  left_join(pop_2025) %>% 
  mutate(nsp = ifelse(inc_2024 >= 30, "IRS", NA),
         bau = ifelse(adm1 %in% c("Upper River", "Central River"), "IRS", NA),
         optimistic = ifelse(inc_2023_2025 >= 30, "IRS", NA), 
         realistic = NA,
         pessimistic = NA)

saveRDS(irs_scens, "C:/Users/hslater/Box/snt-2025/gambia/04.scenario-setup/02.data-outputs/irs_scens_v1.RDS")           

#### set up vaccine scens ####

vax_scens <- dist_df %>% 
  left_join(inc_dat_24) %>% 
  left_join(inc_dat_23_25) %>% 
  left_join(pop_2025) %>% 
  mutate(NSP = ifelse(inc_2024 >= 30, "R21 Vaccine", NA),
         BAU = NA,
         Optimistic = ifelse(inc_2023_2025 >= 30, "R21 Vaccine", NA),
         Realistic = ifelse(adm2 %in% c("Jarra East", "Kombo South") | adm1 %in% "Upper River", "R21 Vaccine", NA),
         Pessimistic = NA)

saveRDS(vax_scens, "C:/Users/hslater/Box/snt-2025/gambia/04.scenario-setup/02.data-outputs/vax_scens_v1.RDS")           
