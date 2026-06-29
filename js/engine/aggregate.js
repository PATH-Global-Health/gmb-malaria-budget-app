/* Budget engine — aggregation (pure, DOM-free).
   Rolls cost rows up into the headline metrics + breakdowns the viz/comparison tabs use. */
window.GMB = window.GMB || {};
GMB.engine = GMB.engine || {};

(function (G) {
  var E = G.engine;
  function arr(obj, key) {
    return Object.keys(obj).map(function (k) { var o = {}; o[key] = (isNaN(+k) ? k : +k); o.cost_usd = obj[k]; return o; })
      .sort(function (a, b) { return a[key] > b[key] ? 1 : (a[key] < b[key] ? -1 : 0); });
  }

  E.aggregate = function (crows, scn, costSet) {
    var total = 0, tl = 0, byYear = {}, byClass = {}, byIv = {}, byA1 = {}, byA2 = {};
    crows.forEach(function (r) {
      total += r.cost_usd; tl += r.cost_local;
      byYear[r.year] = (byYear[r.year] || 0) + r.cost_usd;
      byClass[r.cost_class] = (byClass[r.cost_class] || 0) + r.cost_usd;
      byIv[r.intervention_code] = (byIv[r.intervention_code] || 0) + r.cost_usd;
      byA1[r.adm1] = (byA1[r.adm1] || 0) + r.cost_usd;
      var k = r.adm1 + "|" + r.adm2; byA2[k] = (byA2[k] || 0) + r.cost_usd;
    });
    var lastYear = Math.max.apply(null, scn.years), nat = 0;
    G.reference.districtPairs().forEach(function (d) { nat += G.assumptions.population(d.adm1, d.adm2, lastYear, scn.assumptions.growthByYear || scn.assumptions.growth); });
    var nYears = scn.years.length || 1;
    return {
      total_usd: total, total_local: tl, currency: costSet.currency || "GMD", exchange_rate: costSet.exchange_rate, years: scn.years.slice(),
      national_pop_last_year: nat,
      cost_per_person_total: nat ? total / nat : 0,
      cost_per_person_year: nat ? (total / nYears) / nat : 0,
      byYear: arr(byYear, "year"), byCostClass: arr(byClass, "cost_class"), byIntervention: arr(byIv, "intervention_code"),
      byAdm1: arr(byA1, "adm1"),
      byAdm2: Object.keys(byA2).map(function (k) { var p = k.split("|"); return { adm1: p[0], adm2: p[1], cost_usd: byA2[k] }; })
    };
  };
})(GMB);
