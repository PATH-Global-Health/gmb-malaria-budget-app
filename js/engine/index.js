/* Budget engine - orchestrator. generateBudget(scenario, costSet) -> budget object. */
window.GMB = window.GMB || {};
GMB.engine = GMB.engine || {};

(function (G) {
  var E = G.engine;

  E.sourceSig = function (scn, costSet) {
    return G.util.hash(JSON.stringify(scn) + "|" + JSON.stringify(costSet));
  };

  function growthArg(scn) {
    return (scn.assumptions && (scn.assumptions.growthByYear || scn.assumptions.growth)) || G.assumptions.defaultGrowth;
  }
  function bandsOf(scn) {
    return scn.strata.bands.map(function (b) {
      return { id: b.id, name: b.name, min: b.min, max: (b.max == null ? Infinity : b.max), color: b.color };
    });
  }
  function activeYears(iv) {
    return (iv.activeYears && iv.activeYears.length) ? iv.activeYears : [];
  }
  function uniq(arr) {
    var seen = {};
    return arr.filter(function (x) { if (seen[x]) return false; seen[x] = true; return true; });
  }
  function ivName(code) {
    var c = G.catalogByCode && G.catalogByCode(code);
    return c ? c.nice : (code || "Unknown intervention");
  }
  function typeLabel(type) {
    return type ? (" type '" + type + "'") : " with blank/no selected type";
  }
  function groupedDiag(items) {
    var m = {}, order = [];
    (items || []).forEach(function (it) {
      var k = (it.intervention_code || "") + "|" + (it.type || "");
      if (!m[k]) { m[k] = { intervention_code: it.intervention_code || "", type: it.type || "", n: 0 }; order.push(k); }
      m[k].n += 1;
    });
    return order.map(function (k) { return m[k]; }).sort(function (a, b) {
      return String(a.intervention_code).localeCompare(String(b.intervention_code)) || String(a.type).localeCompare(String(b.type));
    });
  }
  function hasGrouped(items, code, type) {
    return (items || []).some(function (it) { return (it.intervention_code || "") === (code || "") && (it.type || "") === (type || ""); });
  }
  function zeroQuantityDiagnostics(scn, qrows) {
    var out = [], present = {};
    qrows.forEach(function (r) { present[r.intervention_code] = true; });
    var result = G.strata.assign(bandsOf(scn), scn.strata.averagingYears, scn.strata.overrides, Math.max.apply(null, scn.years), growthArg(scn));
    G.catalog.forEach(function (c) {
      var iv = scn.interventions[c.code]; if (!iv || !iv.enabled || present[c.code]) return;
      var scope = G.resolveScope(iv.scope, result), nScope = Object.keys(scope).length, reason = "zero_quantity";
      if (!nScope) reason = "no_target_districts";
      else if (!activeYears(iv).length) reason = "no_active_years";
      else if (c.code === "vax" && ![1, 2, 3, 4].some(function (d) { return (iv.params["dose" + d] || 0) > 0; })) reason = "zero_dose_coverage";
      else if (c.code === "iptp" && ![1, 2, 3, 4].some(function (d) { return (iv.params["contact" + d] || 0) > 0; })) reason = "zero_contact_coverage";
      else if (["mii", "mii_routine", "irs", "smc", "iptsc"].indexOf(c.code) !== -1 && !(iv.params.coverage > 0)) reason = "zero_coverage";
      out.push({ intervention_code: c.code, intervention: c.nice, reason: reason });
    });
    return out;
  }

  E.diagnosticMessages = function (scn, diagnostics) {
    diagnostics = diagnostics || {};
    var notes = [];
    if (diagnostics.zeroQuantityRows && diagnostics.zeroQuantityRows.length) {
      notes = notes.concat(diagnostics.zeroQuantityRows.map(function (z) { return z.intervention + ": enabled but produces no quantity (" + z.reason.replace(/_/g, " ") + ")."; }));
    }
    groupedDiag(diagnostics.missingCostRows).forEach(function (g) {
      notes.push(ivName(g.intervention_code) + typeLabel(g.type) + ": " + g.n + " quantified row(s) have no cost rows at all in this cost set, so this intervention/type is uncosted.");
    });
    groupedDiag(diagnostics.missingTypeRows).forEach(function (g) {
      notes.push(ivName(g.intervention_code) + typeLabel(g.type) + ": " + g.n + " quantified row(s) have cost rows for the intervention, but none match the selected type. Add an exact typed cost row or change the scenario type.");
    });
    groupedDiag(diagnostics.missingTypedProcurement).forEach(function (g) {
      notes.push(ivName(g.intervention_code) + typeLabel(g.type) + ": " + g.n + " quantified row(s) are missing an exact typed procurement price. Shared blank-type add-ons may still be costed, but the commodity/product price is missing.");
    });
    groupedDiag(diagnostics.sharedOnlyRows).forEach(function (g) {
      if (hasGrouped(diagnostics.missingTypedProcurement, g.intervention_code, g.type)) return;
      notes.push(ivName(g.intervention_code) + typeLabel(g.type) + ": " + g.n + " quantified row(s) are costed only with shared blank-type add-ons. No type-specific cost line matched.");
    });
    if (diagnostics.ambiguousTypeRows && diagnostics.ambiguousTypeRows.length) notes.push(diagnostics.ambiguousTypeRows.length + " cost row(s) have ambiguous legacy types and need a more specific pack/product type.");
    if (diagnostics.unsupportedUnits && diagnostics.unsupportedUnits.length) notes.push(diagnostics.unsupportedUnits.length + " cost row(s) were skipped because their unit is not supported by the engine.");
    if (diagnostics.skippedRows && diagnostics.skippedRows.length) notes.push(diagnostics.skippedRows.length + " cost row(s) were skipped because required cost fields were missing.");
    if (diagnostics.invalidCostClasses && diagnostics.invalidCostClasses.length) notes.push(diagnostics.invalidCostClasses.length + " cost row(s) use non-standard cost categories.");
    return uniq(notes);
  };

  E.budgetNotes = function (scn, agg, diagnostics) {
    var notes = [], present = {};
    diagnostics = diagnostics || {};
    var explained = {};
    ["zeroQuantityRows", "missingCostRows", "missingTypeRows", "missingTypedProcurement", "sharedOnlyRows"].forEach(function (key) {
      (diagnostics[key] || []).forEach(function (it) { if (it.intervention_code) explained[it.intervention_code] = true; });
    });
    (agg.byIntervention || []).forEach(function (x) { present[x.intervention_code] = x.cost_usd; });
    G.catalog.forEach(function (c) {
      var iv = scn.interventions[c.code];
      if (iv && iv.enabled && !present[c.code] && !explained[c.code]) notes.push(c.nice + ": switched on but contributes $0 (no quantities, or no matching cost lines in this cost set)");
    });
    return uniq(notes.concat(E.diagnosticMessages(scn, diagnostics)));
  };

  E.previewBudget = function (scn, costSet) {
    var q = E.quantify(scn);
    var costed = E.applyCostsDetailed(q, costSet);
    costed.diagnostics.zeroQuantityRows = zeroQuantityDiagnostics(scn, q);
    var c = costed.costRows;
    var agg = E.aggregate(c, scn, costSet);
    return {
      id: "preview",
      scenarioId: scn.id, costSetId: costSet.id,
      scenarioName: scn.name, costSetName: costSet.name,
      name: scn.name + " × " + costSet.name,
      generatedAt: new Date().toISOString(),
      sourceSig: E.sourceSig(scn, costSet),
      notes: E.budgetNotes(scn, agg, costed.diagnostics),
      diagnostics: costed.diagnostics,
      quantityRows: q, costLineRows: costed.costLineRows, costRows: c, aggregates: agg, schemaVersion: 2
    };
  };

  E.generateBudget = function (scn, costSet) {
    var b = E.previewBudget(scn, costSet);
    b.id = "bud_" + Math.random().toString(36).slice(2, 9);
    b.generatedAt = new Date().toISOString();
    return b;
  };
})(GMB);
