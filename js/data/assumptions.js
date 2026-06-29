/* Population projection + demographic assumption defaults.
   Population data is observed only to 2025 (LATEST_DATA_YEAR); future plan years
   are projected from an editable annual growth rate. All pure / DOM-free. */
window.GMB = window.GMB || {};

(function (G) {
  var LATEST_DATA_YEAR = 2025;

  var assumptions = {
    LATEST_DATA_YEAR: LATEST_DATA_YEAR,

    // Default annual population growth rate for projecting beyond the data.
    defaultGrowth: 0.023,

    // Provisional demographic proportions (share of total population).
    // Editable in the scenario page; documented in Methods. See [[gmb-tool-open-items]].
    proportions: {
      pop_u5:             0.16,   // children under 5
      pop_smc_3_59m:      0.145,  // SMC eligible (3–59 months)
      pop_school:         0.25,   // school-age children 5–14 (IPT-SAC)
      pop_pw:             0.042,  // pregnant women (IPTp / routine ANC)
      pop_vaccine_cohort: 0.035   // infant cohort reaching vaccine age
    },

    avg_household_size: 8.2,      // national fallback mean household size

    // Regional mean household size (from www/population/household-size.xlsx) — used for IRS.
    regionHouseholdSize: {
      "Central River": 10.3, "Lower River": 8.3, "North Bank East": 9.5, "North Bank West": 9.5,
      "Upper River": 12.6, "Western 1": 5.3, "Western 2": 7.7
    },
    householdSize: function (adm1) {
      var s = assumptions.regionHouseholdSize[adm1];
      return s == null ? assumptions.avg_household_size : s;
    },

    // Mass-ITN "cap nets per household" lever: region census max nets/HH and the
    // resulting reduction in nets needed (from the SNT workshop deck).
    netCapByRegion: {
      "Central River": { maxNets: 7, reduction: 0.065 }, "Lower River": { maxNets: 5, reduction: 0.115 },
      "North Bank East": { maxNets: 6, reduction: 0.091 }, "North Bank West": { maxNets: 6, reduction: 0.091 },
      "Upper River": { maxNets: 7, reduction: 0.127 }, "Western 1": { maxNets: 4, reduction: 0.068 },
      "Western 2": { maxNets: 5, reduction: 0.092 }
    },

    // Default values applied by each cost-reduction lever (editable per scenario).
    leverDefaults: {
      urbanAreas: ["Western 1|Kanifing", "Western 1|Banjul", "Western 1|Kombo North"],
      urbanPct: 30,        // % of population deprioritised in those urban areas
      ceaseMonths: 6,      // routine paused for N months after a mass campaign
      ceaseReduction: 17,  // resulting % reduction in routine nets that year
      reactiveCoverage: 0.2 // reactive IRS partial coverage in hotspots
    },

    /** Total population for a district/year, projecting past LATEST_DATA_YEAR.
        `growth` may be a single rate or a {year: rate} map (compounded year by year). */
    population: function (adm1, adm2, year, growth) {
      if (year <= LATEST_DATA_YEAR) return G.reference.population(adm1, adm2, year);
      var base = G.reference.population(adm1, adm2, LATEST_DATA_YEAR);
      if (growth && typeof growth === "object") {
        var m = 1;
        for (var y = LATEST_DATA_YEAR + 1; y <= year; y++) { var r = (growth[y] != null ? growth[y] : assumptions.defaultGrowth); m *= (1 + r); }
        return base * m;
      }
      var g = (growth == null ? assumptions.defaultGrowth : growth);
      return base * Math.pow(1 + g, year - LATEST_DATA_YEAR);
    },

    /** Target sub-population for an intervention's target_pop key. */
    targetPopulation: function (targetKey, adm1, adm2, year, growth) {
      var total = assumptions.population(adm1, adm2, year, growth);
      if (targetKey === "total_pop" || !targetKey) return total;
      if (targetKey === "households") return total / assumptions.avg_household_size;
      if (targetKey === "pop_pw_and_infants") {
        return total * (assumptions.proportions.pop_pw + assumptions.proportions.pop_vaccine_cohort);
      }
      var p = assumptions.proportions[targetKey];
      return p == null ? total : total * p;
    }
  };

  G.assumptions = assumptions;
})(GMB);
