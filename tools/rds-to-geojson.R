# Convert the adm1/adm2 .RDS sf shapefiles to web GeoJSON for the Gambia tool.
# Run once from the project root:  Rscript tools/rds-to-geojson.R
suppressMessages(library(sf))

conv <- function(in_rds, out_geojson, keep, label) {
  x <- sf::st_as_sf(readRDS(in_rds))
  x <- x[, keep]
  x <- sf::st_transform(x, 4326)                       # WGS84 lon/lat for Leaflet
  xs <- tryCatch(sf::st_simplify(x, dTolerance = 0.0008, preserveTopology = TRUE),
                 error = function(e) x)                # simplify to shrink file
  if (file.exists(out_geojson)) file.remove(out_geojson)
  sf::st_write(xs, out_geojson, driver = "GeoJSON", quiet = TRUE, layer_options = "COORDINATE_PRECISION=5")
  cat(label, "->", out_geojson, "|", nrow(xs), "features |",
      round(file.size(out_geojson) / 1024), "KB\n")
}

conv("www/shapefiles/adm1-shp.RDS", "data/geo/adm1.geojson", c("adm1"), "adm1")
conv("www/shapefiles/adm2-shp.RDS", "data/geo/adm2.geojson", c("adm1", "adm2"), "adm2")
