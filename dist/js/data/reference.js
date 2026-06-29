/* Reference-data access layer.
   Wraps the raw GMB.data.population / GMB.data.incidence arrays with lookups.
   All functions are pure and DOM-free. */
window.GMB = window.GMB || {};

(function (G) {
  var pop = (G.data && G.data.population) || [];
  var inc = (G.data && G.data.incidence) || [];

  // --- indexes built once at load ---
  var popIndex = {};      // "adm1|adm2|year" -> total_pop
  var districtsByRegion = {}; // adm1 -> Set(adm2)
  var yearSet = {};
  pop.forEach(function (r) {
    popIndex[r.adm1 + "|" + r.adm2 + "|" + r.year] = r.total_pop;
    (districtsByRegion[r.adm1] = districtsByRegion[r.adm1] || {})[r.adm2] = true;
    yearSet[r.year] = true;
  });

  var incIndex = {};      // "adm1|adm2|year" -> {incidence_per_1000, population}
  inc.forEach(function (r) {
    incIndex[r.adm1 + "|" + r.adm2 + "|" + r.year] = r;
  });

  var ref = {
    /** Sorted list of adm1 regions. */
    regions: function () {
      return Object.keys(districtsByRegion).sort();
    },
    /** Sorted list of adm2 districts, optionally filtered to a region. */
    districts: function (adm1) {
      if (adm1) return Object.keys(districtsByRegion[adm1] || {}).sort();
      return pop
        .map(function (r) { return r.adm2; })
        .filter(function (v, i, a) { return a.indexOf(v) === i; })
        .sort();
    },
    /** All [{adm1, adm2}] pairs (the planning units). */
    districtPairs: function () {
      var seen = {}, out = [];
      pop.forEach(function (r) {
        var k = r.adm1 + "|" + r.adm2;
        if (!seen[k]) { seen[k] = true; out.push({ adm1: r.adm1, adm2: r.adm2 }); }
      });
      return out.sort(function (a, b) {
        return a.adm1.localeCompare(b.adm1) || a.adm2.localeCompare(b.adm2);
      });
    },
    /** Sorted list of years present in the population data. */
    years: function () {
      return Object.keys(yearSet).map(Number).sort(function (a, b) { return a - b; });
    },
    /** Total population for a district in a year (0 if unknown). */
    population: function (adm1, adm2, year) {
      var v = popIndex[adm1 + "|" + adm2 + "|" + year];
      return v == null ? 0 : v;
    },
    /** National (or regional) total population for a year. */
    totalPopulation: function (year, adm1) {
      return pop.reduce(function (sum, r) {
        if (r.year === year && (!adm1 || r.adm1 === adm1)) return sum + r.total_pop;
        return sum;
      }, 0);
    },
    /** Malaria incidence (per 1,000) for a district/year, or null. */
    incidence: function (adm1, adm2, year) {
      var r = incIndex[adm1 + "|" + adm2 + "|" + year];
      return r ? r.incidence_per_1000 : null;
    },
    counts: function () {
      return {
        regions: ref.regions().length,
        districts: ref.districtPairs().length,
        years: ref.years(),
        popRows: pop.length,
        incRows: inc.length
      };
    },
    loaded: function () { return pop.length > 0; }
  };

  G.reference = ref;
})(GMB);
