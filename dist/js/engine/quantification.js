/* Budget engine — quantification (pure, DOM-free).
   Turns a scenario into commodity quantities per district × year × intervention,
   resolving coverage/type/target/active-years/levers from the scenario object. */
window.GMB = window.GMB || {};
GMB.engine = GMB.engine || {};

(function (G) {
  var E = G.engine;

  function bandsOf(scn) {
    return scn.strata.bands.map(function (b) { return { id: b.id, name: b.name, min: b.min, max: (b.max == null ? Infinity : b.max), color: b.color }; });
  }
  function growthArg(scn) { return scn.assumptions.growthByYear || scn.assumptions.growth; }
  function hhSize(scn, adm1) { var o = scn.assumptions.householdSize; return (o && o[adm1] != null) ? o[adm1] : G.assumptions.householdSize(adm1); }
  function activeYears(iv, key) { var g = iv.geo && iv.geo[key]; if (g && g.years) return g.years; return (iv.activeYears && iv.activeYears.length) ? iv.activeYears : null; }
  function groupSum(iv) { return ((iv.target && iv.target.groups) || []).reduce(function (a, g) { return a + (g.pct || 0); }, 0); }
  function groupTargets(iv, adm1, adm2, year, scn) {
    var base = G.assumptions.population(adm1, adm2, year, growthArg(scn));
    var groups = (iv.target && iv.target.groups) || [];
    var g = iv.geo && iv.geo[adm1 + "|" + adm2];
    var totalPct = (g && g.targetPct != null) ? g.targetPct : groupSum(iv);
    var denom = groupSum(iv) || totalPct || 1;
    return groups.map(function (grp) {
      var pct = (g && g.targetPct != null) ? totalPct * ((grp.pct || 0) / denom) : (grp.pct || 0);
      return { label: grp.label || "", pct: pct, target_pop: base * pct / 100 };
    });
  }
  function targetPop(iv, adm1, adm2, year, scn) {
    var base = G.assumptions.population(adm1, adm2, year, growthArg(scn));
    var t = iv.target || { mode: "total" };
    if (t.mode === "total") return base;
    if (t.mode === "households") return base / hhSize(scn, adm1);
    var g = iv.geo && iv.geo[adm1 + "|" + adm2];
    var pct = (g && g.targetPct != null) ? g.targetPct : groupSum(iv);
    return base * (pct || 0) / 100;
  }
  function rcov(iv, ctx, k) {
    k = k || "coverage";
    var g = ctx.key && iv.geo && iv.geo[ctx.key];
    if (k === "coverage" && g && g.coverage != null) return g.coverage;
    var by = iv.coverageVary === "year" && iv.coverageByYear && iv.coverageByYear[ctx.year];
    if (by && by[k] != null) return by[k];
    var bs = iv.coverageVary === "stratum" && iv.coverageByStratum && ctx.bandId != null && iv.coverageByStratum[ctx.bandId];
    if (bs && bs[k] != null) return bs[k];
    return iv.params[k];
  }
  function rtype(iv, ctx) {
    var g = ctx.key && iv.geo && iv.geo[ctx.key];
    if (g && g.type) return g.type;
    if (iv.typeVary === "year" && iv.typeByYear && iv.typeByYear[ctx.year]) return iv.typeByYear[ctx.year];
    if (iv.typeVary === "stratum" && iv.typeByStratum && ctx.bandId != null && iv.typeByStratum[ctx.bandId]) return iv.typeByStratum[ctx.bandId];
    return iv.type;
  }
  function coverageSum(iv, ctx, prefix) {
    return [1, 2, 3, 4].reduce(function (a, k) { return a + (rcov(iv, ctx, prefix + k) || 0); }, 0);
  }
  function ceaseReductionPct(L, LD) {
    if (L.ceaseReduction != null) return L.ceaseReduction;
    if (L.ceaseMonths != null) {
      var baseMonths = LD.ceaseMonths || 1, baseReduction = LD.ceaseReduction || 0;
      return Math.max(0, Math.min(100, (Number(L.ceaseMonths) || 0) * baseReduction / baseMonths));
    }
    return LD.ceaseReduction || 0;
  }
  function coveredPop(code, tp, iv, ctx) {
    var L = iv.levers || {};
    if (code === "irs") return tp * (L.reactive ? (L.reactiveCoverage != null ? L.reactiveCoverage : ((G.assumptions.leverDefaults || {}).reactiveCoverage || 0)) : (rcov(iv, ctx) || 0));
    if (code === "vax") return tp * (rcov(iv, ctx, "dose1") || 0);
    if (code === "iptp") return tp * (rcov(iv, ctx, "contact1") || 0);
    return tp * (rcov(iv, ctx) || 0);
  }
  // commodity quantity for one district-year, before levers
  function qty(code, tp, iv, ctx) {
    var buf = 1 + (iv.params.buffer || 0), L = iv.levers || {};
    if (code === "mii" || code === "mii_routine") { var ppn = iv.params.people_per_net || 1; return tp * (rcov(iv, ctx) || 0) / ppn * buf; }
    if (code === "irs") { var cov = L.reactive ? (L.reactiveCoverage != null ? L.reactiveCoverage : ((G.assumptions.leverDefaults || {}).reactiveCoverage || 0)) : (rcov(iv, ctx) || 0); return tp * cov * buf; }
    if (code === "smc" || code === "iptsc") { return tp * (rcov(iv, ctx) || 0) * (iv.params.cycles || 1) * buf; }
    if (code === "vax") return tp * coverageSum(iv, ctx, "dose") * buf;
    if (code === "iptp") return tp * coverageSum(iv, ctx, "contact") * buf;
    return 0;
  }
  // geography/timing cost levers applied as multipliers
  function applyLevers(code, q, iv, key, year, scn) {
    var L = iv.levers || {}, LD = G.assumptions.leverDefaults || {};
    if (code === "mii" && L.urbanDeprioritise) {
      var areas = L.urbanAreas || LD.urbanAreas || [];
      if (areas.indexOf(key) !== -1) q *= (1 - (L.urbanPct != null ? L.urbanPct : (LD.urbanPct || 0)) / 100);
    }
    if (code === "mii" && L.maxNetsPerHH) {
      var cap = L.netCap || G.assumptions.netCapByRegion || {}, rg = cap[key.split("|")[0]];
      if (rg && rg.reduction) q *= (1 - rg.reduction);
    }
    if (code === "mii_routine" && L.ceaseAfterCampaign) {
      var mii = scn.interventions.mii;
      if (mii) { var camp = activeYears(mii, key) || scn.years; if (camp.indexOf(year) !== -1) q *= (1 - ceaseReductionPct(L, LD) / 100); }
    }
    return q;
  }
  function quantityBasis(code) {
    if (code === "mii" || code === "mii_routine") return "nets";
    if (code === "irs") return "structures";
    if (code === "smc" || code === "iptsc") return "treatment_courses";
    if (code === "vax" || code === "iptp") return "doses";
    return "units";
  }
  function smcRows(c, iv, adm1, adm2, year, ctx, key, scn) {
    var type = rtype(iv, ctx), cov = rcov(iv, ctx) || 0, cycles = iv.params.cycles || 1, buf = 1 + (iv.params.buffer || 0);
    return groupTargets(iv, adm1, adm2, year, scn).map(function (grp, i) {
      var meta = i === 0 ? { type: "SP+AQ 3-11m", age: "3-11 months" }
        : i === 1 ? { type: "SP+AQ 12-59m", age: "12-59 months" }
          : { type: type, age: grp.label };
      var covered = grp.target_pop * cov;
      var q = applyLevers(c.code, covered * cycles * buf, iv, key, year, scn);
      return { adm1: adm1, adm2: adm2, year: year, intervention_code: c.code, type: meta.type, commodity: meta.type, quantity: q, target_pop: grp.target_pop, covered_pop: covered, age_band: meta.age, quantity_basis: "treatment_courses" };
    }).filter(function (r) { return r.quantity > 0; });
  }
  function iptscPackType(type, i, label) {
    var base = type || "DHA-PPQ";
    if (i === 0) return base + " 5-11y";
    if (i === 1) return base + " 12-15y";
    return base + (label ? " " + label : "");
  }
  function iptscRows(c, iv, adm1, adm2, year, ctx, key, scn) {
    var type = rtype(iv, ctx), cov = rcov(iv, ctx) || 0, cycles = iv.params.cycles || 1, buf = 1 + (iv.params.buffer || 0);
    return groupTargets(iv, adm1, adm2, year, scn).map(function (grp, i) {
      var age = i === 0 ? "5-11 years" : (i === 1 ? "12-15 years" : (grp.label || ""));
      var packType = iptscPackType(type, i, grp.label);
      var covered = grp.target_pop * cov;
      var q = applyLevers(c.code, covered * cycles * buf, iv, key, year, scn);
      return { adm1: adm1, adm2: adm2, year: year, intervention_code: c.code, type: packType, commodity: packType, quantity: q, target_pop: grp.target_pop, covered_pop: covered, age_band: age, quantity_basis: "treatment_courses" };
    }).filter(function (r) { return r.quantity > 0; });
  }

  /** @returns quantityRows: [{adm1,adm2,year,intervention_code,type,commodity,quantity,target_pop,covered_pop,age_band,quantity_basis}] */
  E.quantify = function (scn) {
    var bands = bandsOf(scn), popYear = Math.max.apply(null, scn.years);
    var result = G.strata.assign(bands, scn.strata.averagingYears, scn.strata.overrides, popYear, growthArg(scn));
    var rows = [];
    G.catalog.forEach(function (c) {
      var iv = scn.interventions[c.code]; if (!iv || !iv.enabled) return;
      var scope = G.resolveScope(iv.scope, result);
      Object.keys(scope).forEach(function (key) {
        var bandId = result.byDistrict[key], pr = key.split("|"), adm1 = pr[0], adm2 = pr[1];
        var ay = activeYears(iv, key) || scn.years;
        scn.years.forEach(function (year) {
          if (ay.indexOf(year) === -1) return;
          var ctx = { year: year, bandId: bandId, key: key };
          if (c.code === "smc") { Array.prototype.push.apply(rows, smcRows(c, iv, adm1, adm2, year, ctx, key, scn)); return; }
          if (c.code === "iptsc") { Array.prototype.push.apply(rows, iptscRows(c, iv, adm1, adm2, year, ctx, key, scn)); return; }
          var tp = targetPop(iv, adm1, adm2, year, scn);
          var q = applyLevers(c.code, qty(c.code, tp, iv, ctx), iv, key, year, scn);
          if (!(q > 0)) return;
          rows.push({ adm1: adm1, adm2: adm2, year: year, intervention_code: c.code, type: rtype(iv, ctx), commodity: c.commodity, quantity: q, target_pop: tp, covered_pop: coveredPop(c.code, tp, iv, ctx), age_band: "", quantity_basis: quantityBasis(c.code) });
        });
      });
    });
    return rows;
  };
})(GMB);
