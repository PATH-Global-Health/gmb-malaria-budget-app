# Generate data/default-unit-costs.js from the COOP Unit Costs workbook.
# Run once from the project root:  Rscript tools/xlsx-to-costlib.R
suppressMessages({ library(readxl) })
if (!requireNamespace("jsonlite", quietly = TRUE)) install.packages("jsonlite", repos = "https://cloud.r-project.org")
suppressMessages(library(jsonlite))

p <- "www/unit-cost-data/FURTHER REVIEW _ COOP_Malaria_Unit_Cost_Tool_v3.3 (1).xlsx"
m <- read_excel(p, sheet = 5, col_names = FALSE, .name_repair = "minimal")
codes <- c("mii", "mii_routine", "irs", "smc", "iptsc", "vax")

rows <- list()
for (i in seq_len(nrow(m))) {
  code <- trimws(tolower(as.character(m[[1]][i])))
  if (!(code %in% codes)) next
  usd <- suppressWarnings(as.numeric(m[[7]][i]))
  if (is.na(usd)) next
  desc <- gsub("[\r\n]+", " ", trimws(as.character(m[[4]][i])))
  cc   <- trimws(as.character(m[[3]][i]))
  unit <- trimws(as.character(m[[6]][i]))
  src  <- gsub("[\r\n]+", " ", trimws(as.character(m[[8]][i])))
  dq   <- suppressWarnings(as.numeric(m[[13]][i]))
  yr   <- suppressWarnings(as.numeric(m[[5]][i]))

  d <- tolower(desc); type <- ""
  if (code %in% c("mii", "mii_routine")) {
    if (grepl("pbo", d)) type <- "PBO"
    else if (grepl("dual|chlorfenapyr|cfp", d)) type <- "Dual-AI"
    else if (grepl("standard|pyrethroid-only|pyrethroid only", d)) type <- "Standard Pyrethroid"
  } else if (code == "irs") {
    if (grepl("carbamate", d)) type <- "Carbamate"
    else if (grepl("organophosphate|pirimiphos", d)) type <- "Organophosphate"
    else if (grepl("pyrethroid", d)) type <- "Pyrethroid"
  } else if (code %in% c("smc", "iptsc")) {
    if (grepl("dha|ppq|piperaquine", d)) type <- "DHA-PPQ"
    else if (grepl("spaq|sp-aq|sp\\+aq|amodiaquine|sp\\s*\\+", d)) type <- "SP-AQ"
    else if (grepl("\\bsp\\b|sulfadoxine", d)) type <- "SP"
  } else if (code == "vax") {
    if (grepl("r21", d)) type <- "R21"
    else if (grepl("rts", d)) type <- "RTS,S"
  }

  if (code == "vax") unit <- "Per dose"   # workbook labels these "Per child" but they are priced per dose

  rows[[length(rows) + 1]] <- list(
    intervention_code = code, cost_class = cc, type = type, description = desc,
    year = if (is.na(yr)) NA else yr, unit = unit, usd_cost = round(usd, 4),
    source = if (is.na(src) || src == "NA") "" else src,
    dataQuality = if (is.na(dq)) NA else dq
  )
}

js <- toJSON(rows, auto_unbox = TRUE, na = "null", digits = 6)
out <- paste0("window.GMB=window.GMB||{};GMB.data=GMB.data||{};GMB.data.defaultCosts=", js,
              ";GMB.data.defaultExchangeRate=72.39;GMB.data.defaultCurrency=\"GMD\";")
writeLines(out, "data/default-unit-costs.js", useBytes = TRUE)
cat("rows:", length(rows), "| bytes:", file.size("data/default-unit-costs.js"), "\n")
print(table(sapply(rows, function(r) r$intervention_code)))
cat("types present:", paste(sort(unique(sapply(rows, function(r) r$type))), collapse = " | "), "\n")
