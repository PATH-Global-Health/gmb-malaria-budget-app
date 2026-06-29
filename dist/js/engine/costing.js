/* Budget engine - line-item costing (pure, DOM-free).
   Joins quantified commodities to unit-cost rows, keeps every matched cost line,
   and derives legacy costRows from those detailed line items. */
window.GMB = window.GMB || {};
GMB.engine = GMB.engine || {};

(function (G) {
  var E = G.engine;

  function normText(x) { return String(x == null ? "" : x).trim(); }
  function typeKey(x) { return normText(x).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
  function canonicalType(code, type, description) {
    var raw = normText(type), key = typeKey(raw), desc = typeKey(description);
    if (code === "irs") {
      if (key === "organophosphate" || key === "actellic 300cs" || key === "actellic") return "Actellic";
      if (key === "sumishield" || key === "sumishield 50wg") return "SumiShield";
      if (key === "fludora" || key === "fludora fusion") return "Fludora Fusion";
      if (key === "carbamate" || key === "pyrethroid") return "Actellic";
    }
    if (code === "smc") {
      if (key === "sp aq 3 11m" || key === "sp aq 3 11 months" || key === "spaq 3 11m") return "SP+AQ 3-11m";
      if (key === "sp aq 12 59m" || key === "sp aq 12 59 months" || key === "spaq 12 59m") return "SP+AQ 12-59m";
      if (key === "sp aq" || key === "spaq") return "SP-AQ";
    }
    if (code === "iptsc") {
      if (/^dha ppq.*5 11/.test(key) || /^dp.*5 11/.test(key)) return "DHA-PPQ 5-11y";
      if (/^dha ppq.*12 15/.test(key) || /^dp.*12 15/.test(key)) return "DHA-PPQ 12-15y";
      if (/^sp aq.*5 11/.test(key) || /^spaq.*5 11/.test(key)) return "SP-AQ 5-11y";
      if (/^sp aq.*12 15/.test(key) || /^spaq.*12 15/.test(key)) return "SP-AQ 12-15y";
      if (/^sp.*5 11/.test(key)) return "SP 5-11y";
      if (/^sp.*12 15/.test(key)) return "SP 12-15y";
      if (key === "dha ppq" || key === "dp") {
        if (/dispersible|younger|20 160|25kg/.test(desc)) return "DHA-PPQ 5-11y";
        if (/40 320|older|adult/.test(desc)) return "DHA-PPQ 12-15y";
        return "DHA-PPQ";
      }
      if (key === "sp aq" || key === "spaq") return "SP-AQ";
      if (key === "sp") return "SP";
    }
    return raw;
  }
  function normUnit(unit) {
    var u = typeKey(unit);
    if (!u) return "";
    if (/one off|one time|once/.test(u)) return "one-off";
    if (/year|annual/.test(u)) return "per-year";
    if (/net|itn/.test(u)) return "per-net";
    if (/structure|household|hh/.test(u)) return "per-structure";
    if (/child/.test(u)) return "per-child";
    if (/person|population/.test(u)) return "per-person";
    if (/dose/.test(u)) return "per-dose";
    if (/pack/.test(u)) return "per-pack";
    if (/course|treatment/.test(u)) return "per-treatment-course";
    return "unsupported";
  }
  function classKey(x) {
    var k = typeKey(x);
    if (k === "proc" || k === "procurement") return "PROC";
    if (k === "dist" || k === "distribution" || k === "logistics") return "DIST";
    if (k === "ops" || k === "operational") return "OPS";
    if (k === "supp" || k === "support") return "SUPP";
    if (k === "m e" || k === "monitoring evaluation") return "M&E";
    if (k === "com" || k === "communication") return "COM";
    if (k === "admin" || k === "administration") return "ADMIN";
    return x || "OTHER";
  }
  function knownClass(k) {
    return ["PROC", "DIST", "OPS", "SUPP", "M&E", "COM", "ADMIN", "OTHER"].indexOf(k) !== -1;
  }
  function quantityForCost(qr, unitNorm) {
    if (unitNorm === "per-child" || unitNorm === "per-person") return qr.covered_pop != null ? qr.covered_pop : qr.quantity;
    return qr.quantity;
  }
  function addDiag(diag, key, item) {
    diag[key].push(item);
  }
  function hasCost(cost) {
    return cost != null && cost !== "" && isFinite(+cost);
  }
  function aggregateCostRows(lineRows) {
    var map = {};
    lineRows.forEach(function (r) {
      var k = [r.adm1, r.adm2, r.year, r.intervention_code, r.cost_class].join("|");
      if (!map[k]) map[k] = { adm1: r.adm1, adm2: r.adm2, year: r.year, intervention_code: r.intervention_code, cost_class: r.cost_class, cost_usd: 0, cost_local: 0 };
      map[k].cost_usd += r.cost_usd || 0;
      map[k].cost_local += r.cost_local || 0;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  /** @returns { costRows, costLineRows, diagnostics } */
  E.applyCostsDetailed = function (qrows, costSet) {
    var fx = costSet.exchange_rate || 0, costRows = costSet.rows || [], byIv = {}, out = [];
    var diag = { missingCostRows: [], missingTypeRows: [], missingTypedProcurement: [], sharedOnlyRows: [], unsupportedUnits: [], skippedRows: [], invalidCostClasses: [], ambiguousTypeRows: [], unmatchedQuantityRows: [] };

    costRows.forEach(function (r, i) {
      var code = r.intervention_code;
      var unitNorm = normUnit(r.unit);
      if (!code) { addDiag(diag, "skippedRows", { index: i, reason: "missing_intervention_code", description: r.description || "" }); return; }
      if (!hasCost(r.usd_cost)) { addDiag(diag, "skippedRows", { index: i, reason: "missing_usd_cost", intervention_code: code, description: r.description || "" }); return; }
      if (!unitNorm) { addDiag(diag, "skippedRows", { index: i, reason: "missing_unit", intervention_code: code, description: r.description || "" }); return; }
      if (unitNorm === "unsupported") { addDiag(diag, "unsupportedUnits", { index: i, intervention_code: code, unit: r.unit || "", description: r.description || "" }); return; }
      var ctype = canonicalType(code, r.type, r.description), cclass = classKey(r.cost_class);
      if (!knownClass(cclass)) addDiag(diag, "invalidCostClasses", { index: i, intervention_code: code, cost_class: r.cost_class || "", description: r.description || "" });
      if (code === "iptsc" && cclass === "PROC" && ctype === "DHA-PPQ" && typeKey(r.type) === "dha ppq") {
        addDiag(diag, "ambiguousTypeRows", { index: i, intervention_code: code, type: r.type || "", description: r.description || "", message: "DHA-PPQ procurement row needs 5-11y or 12-15y pack type." });
      }
      var row = Object.assign({}, r, {
        _index: i,
        type: ctype,
        unit_norm: unitNorm,
        cost_class: cclass
      });
      (byIv[code] = byIv[code] || []).push(row);
    });

    qrows.forEach(function (qr, qi) {
      var code = qr.intervention_code, qType = canonicalType(code, qr.type);
      var rows = byIv[code] || [];
      if (!rows.length) {
        addDiag(diag, "missingCostRows", { row: qi, intervention_code: code, type: qType });
        addDiag(diag, "unmatchedQuantityRows", { row: qi, intervention_code: code, type: qType, reason: "missing_intervention_cost_rows" });
        return;
      }
      var matched = rows.filter(function (cr) {
        if (cr.unit_norm === "per-year" || cr.unit_norm === "one-off") return false;
        return !cr.type || cr.type === qType;
      });
      if (!matched.length) {
        addDiag(diag, "missingTypeRows", { row: qi, intervention_code: code, type: qType });
        addDiag(diag, "unmatchedQuantityRows", { row: qi, intervention_code: code, type: qType, reason: "missing_type_cost_rows" });
        return;
      }
      if (qType && !matched.some(function (cr) { return cr.type === qType; })) {
        addDiag(diag, "sharedOnlyRows", { row: qi, intervention_code: code, type: qType });
      }
      if (qType && !rows.some(function (cr) { return cr.cost_class === "PROC" && cr.type === qType && cr.unit_norm !== "per-year" && cr.unit_norm !== "one-off"; })) {
        addDiag(diag, "missingTypedProcurement", { row: qi, intervention_code: code, type: qType });
      }
      matched.forEach(function (cr) {
        var qfc = quantityForCost(qr, cr.unit_norm), costUsd = qfc * (+cr.usd_cost || 0);
        out.push({
          line_id: ["var", qi, cr._index].join("_"),
          adm1: qr.adm1, adm2: qr.adm2, year: qr.year,
          intervention_code: code, type: qType, commodity: qr.commodity,
          target_pop: qr.target_pop || 0, covered_pop: qr.covered_pop || 0,
          quantity: qr.quantity || 0, quantity_for_cost: qfc || 0, quantity_basis: qr.quantity_basis || "",
          age_band: qr.age_band || "", cost_class: cr.cost_class, description: cr.description || "",
          source: cr.source || "", dataQuality: cr.dataQuality == null ? null : cr.dataQuality,
          unit: cr.unit || "", unit_norm: cr.unit_norm, unit_cost_usd: +cr.usd_cost || 0,
          cost_usd: costUsd, cost_local: costUsd * fx, match_kind: cr.type ? "exact_type" : "shared_type"
        });
      });
    });

    Object.keys(byIv).forEach(function (code) {
      var qForCode = qrows.filter(function (q) { return q.intervention_code === code; });
      if (!qForCode.length) return;
      var years = {}, firstByYear = {};
      qForCode.forEach(function (q) { years[q.year] = true; if (!firstByYear[q.year]) firstByYear[q.year] = q; });
      (byIv[code] || []).forEach(function (cr) {
        if (cr.unit_norm !== "per-year" && cr.unit_norm !== "one-off") return;
        if (cr.type && !qForCode.some(function (q) { return canonicalType(code, q.type) === cr.type; })) return;
        var useYears = cr.unit_norm === "one-off" ? ["All Years"] : Object.keys(years).sort();
        useYears.forEach(function (year, ix) {
          var anchor = firstByYear[year] || qForCode[0], costUsd = +cr.usd_cost || 0;
          out.push({
            line_id: ["fixed", cr._index, year, ix].join("_"),
            adm1: "National", adm2: "National", year: year,
            intervention_code: code, type: canonicalType(code, cr.type), commodity: "Fixed cost",
            target_pop: 0, covered_pop: 0, quantity: 1, quantity_for_cost: 1, quantity_basis: cr.unit_norm,
            age_band: "", cost_class: cr.cost_class, description: cr.description || "",
            source: cr.source || "", dataQuality: cr.dataQuality == null ? null : cr.dataQuality,
            unit: cr.unit || "", unit_norm: cr.unit_norm, unit_cost_usd: costUsd,
            cost_usd: costUsd, cost_local: costUsd * fx, match_kind: "fixed",
            _anchor_adm1: anchor.adm1, _anchor_adm2: anchor.adm2
          });
        });
      });
    });

    return { costLineRows: out, costRows: aggregateCostRows(out), diagnostics: diag };
  };

  E.applyCosts = function (qrows, costSet) {
    return E.applyCostsDetailed(qrows, costSet).costRows;
  };
})(GMB);
