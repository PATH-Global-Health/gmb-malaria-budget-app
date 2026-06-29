/* Incidence stratification — the SNT core.
   Groups districts into risk strata from mean malaria incidence over chosen years,
   confirmed from the model scripts: default cut-points 10 and 30 per 1,000,
   default averaging window 2023–2025. All pure / DOM-free. */
window.GMB = window.GMB || {};

(function (G) {
  function key(adm1, adm2) { return adm1 + "|" + adm2; }

  var strata = {
    // Colours for the 3 default strata (low → high burden).
    COLORS: { I: "#1D9E75", II: "#EF9F27", III: "#E24B4A" },

    defaultAveragingYears: [2023, 2024, 2025],

    defaultBands: function () {
      return [
        { id: "I",   name: "Strata I",   min: 0,  max: 10,       color: "#1D9E75" },
        { id: "II",  name: "Strata II",  min: 10, max: 30,       color: "#EF9F27" },
        { id: "III", name: "Strata III", min: 30, max: Infinity, color: "#E24B4A" }
      ];
    },

    key: key,

    /** Mean incidence (per 1,000) for a district over the given years. */
    meanIncidence: function (adm1, adm2, years) {
      var vals = [];
      (years || strata.defaultAveragingYears).forEach(function (y) {
        var v = G.reference.incidence(adm1, adm2, y);
        if (v != null) vals.push(v);
      });
      if (!vals.length) return null;
      return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    },

    /** Which band an incidence value falls in (last band catches the top). */
    bandFor: function (inc, bands) {
      for (var i = 0; i < bands.length; i++) {
        if (inc >= bands[i].min && inc < bands[i].max) return bands[i].id;
      }
      return bands[bands.length - 1].id;
    },

    /**
     * Assign every district to a band.
     * @returns { byDistrict:{key:bandId}, byBand:{bandId:{districts:[{adm1,adm2,inc}], count, population}}, incByDistrict:{key:inc} }
     */
    assign: function (bands, years, overrides, popYear, growth) {
      overrides = overrides || {};
      popYear = popYear || G.assumptions.LATEST_DATA_YEAR;
      var byDistrict = {}, incByDistrict = {}, byBand = {};
      bands.forEach(function (b) { byBand[b.id] = { band: b, districts: [], count: 0, population: 0 }; });

      G.reference.districtPairs().forEach(function (d) {
        var k = key(d.adm1, d.adm2);
        var inc = strata.meanIncidence(d.adm1, d.adm2, years);
        incByDistrict[k] = inc;
        var bandId = overrides[k] || strata.bandFor(inc == null ? 0 : inc, bands);
        byDistrict[k] = bandId;
        var bucket = byBand[bandId];
        if (bucket) {
          var pop = G.assumptions.population(d.adm1, d.adm2, popYear, growth);
          bucket.districts.push({ adm1: d.adm1, adm2: d.adm2, inc: inc });
          bucket.count += 1;
          bucket.population += pop;
        }
      });
      return { byDistrict: byDistrict, byBand: byBand, incByDistrict: incByDistrict };
    },

    /** Resolve a band id to the list of district keys in it (after overrides). */
    districtsInBands: function (assignment, bandIds) {
      var set = {};
      Object.keys(assignment.byDistrict).forEach(function (k) {
        if (bandIds.indexOf(assignment.byDistrict[k]) !== -1) set[k] = true;
      });
      return set;
    }
  };

  G.strata = strata;
})(GMB);
