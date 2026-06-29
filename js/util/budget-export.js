/* Builds a comprehensive, multi-sheet Excel workbook for a generated budget —
   the artefact a programme would attach to a funding application. Returns a
   `sheets` array for GMB.xlsx.download(). Used by the Generation and
   Visualisation tabs. Breakdown sheets carry a column per plan year plus an
   all-years total; the intervention sheet nests its cost-category children, and
   the district sheet adds a coloured, bold regional subtotal row. */
window.GMB = window.GMB || {};

(function (G) {
  var CLASS = { PROC: "Procurement", DIST: "Distribution", OPS: "Operational", SUPP: "Support", "M&E": "Monitoring & evaluation", COM: "Communication", ADMIN: "Administration", OTHER: "Other" };
  function ivName(c) { var x = G.catalogByCode(c); return x ? x.nice : c; }
  function className(c) { return CLASS[c] || c; }
  function clean(v) { return v == null || v !== v ? "" : v; }
  function safeYear(y) { return String(y) === "All Years" ? "All Years" : Number(y); }
  function statusOf(b) { return G.budgetStatus ? G.budgetStatus(b) : { state: "current", label: "Current" }; }
  function getScenario(b) { var st = statusOf(b); return st.scn || null; }
  function getCostSet(b) { var st = statusOf(b); return st.cost || null; }
  function topKey(r) {
    return [r.intervention_code || "", r.type || "", r.cost_class || "", r.description || "", r.unit || "", r.unit_cost_usd || 0, r.source || ""].join("|");
  }
  function hasNum(v) { return v != null && v !== "" && isFinite(+v); }
  function round1(n) { return Math.round((n || 0) * 10) / 10; }
  function round2(n) { return Math.round((n || 0) * 100) / 100; }

  G.topCostElements = function (lineRows, opts) {
    opts = opts || {};
    var currency = opts.currency || "USD", vf = currency === "GMD" ? "cost_local" : "cost_usd", n = opts.limit || 10;
    var map = {}, order = [];
    (lineRows || []).forEach(function (r) {
      var k = topKey(r);
      if (!map[k]) {
        map[k] = {
          key: k, intervention_code: r.intervention_code, intervention: ivName(r.intervention_code),
          type: r.type || "", cost_class: r.cost_class || "", cost_category: className(r.cost_class),
          description: r.description || "", unit: r.unit || "", source: r.source || "",
          unit_cost_usd: hasNum(r.unit_cost_usd) ? +r.unit_cost_usd : null,
          quantity_for_cost: null, cost_usd: 0, cost_local: 0, has_line_detail: false
        };
        order.push(k);
      }
      var q = hasNum(r.quantity_for_cost) ? +r.quantity_for_cost : (hasNum(r.quantity) ? +r.quantity : null);
      if (q != null) map[k].quantity_for_cost = (map[k].quantity_for_cost == null ? 0 : map[k].quantity_for_cost) + q;
      if (map[k].unit_cost_usd == null && hasNum(r.unit_cost_usd)) map[k].unit_cost_usd = +r.unit_cost_usd;
      if (q != null || hasNum(r.unit_cost_usd) || r.description || r.unit) map[k].has_line_detail = true;
      map[k].cost_usd += r.cost_usd || 0;
      map[k].cost_local += r.cost_local || 0;
    });
    return order.map(function (k) {
      var e = map[k], label = e.intervention + " - " + (e.description || e.cost_category);
      if (e.unit_cost_usd == null && e.quantity_for_cost > 0 && e.cost_usd > 0) e.unit_cost_usd = e.cost_usd / e.quantity_for_cost;
      if (e.quantity_for_cost == null && e.unit_cost_usd > 0 && e.cost_usd > 0) e.quantity_for_cost = e.cost_usd / e.unit_cost_usd;
      e.label = label;
      e.value = e[vf] || 0;
      e.detail = label + (e.type ? " | " + e.type : "") + " | " + e.cost_category + " | " + e.unit;
      return e;
    }).sort(function (a, b) { return b.value - a.value; }).slice(0, n);
  };

  /* Sum cost_usd/cost_local over rows, broken out by year.
     Returns { order:[keys by total desc], m:{ key:{ u, l, yr:{year:{u,l}} } } }. */
  function byDimYear(rows, keyFn) {
    var m = {}, order = [];
    rows.forEach(function (r) {
      var k = keyFn(r); if (k == null) return;
      if (!(k in m)) { m[k] = { u: 0, l: 0, yr: {} }; order.push(k); }
      var e = m[k]; e.u += r.cost_usd || 0; e.l += r.cost_local || 0;
      var y = e.yr[r.year] || (e.yr[r.year] = { u: 0, l: 0 });
      y.u += r.cost_usd || 0; y.l += r.cost_local || 0;
    });
    order.sort(function (a, b) { return m[b].u - m[a].u; });
    return { order: order, m: m };
  }
  function rd(n) { return Math.round(n || 0); }

  /** opts: { rows, quantityRows, filters } — defaults to the budget's full data. */
  G.budgetSheets = function (b, opts) {
    opts = opts || {};
    var cur = (b.aggregates && b.aggregates.currency) || "GMD";
    var rows = opts.rows || b.costRows || [], qrows = opts.quantityRows || b.quantityRows || [];
    var lineRows = opts.lineRows || b.costLineRows || rows;
    var years = (b.aggregates && b.aggregates.years && b.aggregates.years.slice()) || [];
    if (!years.length) { var ys = {}; rows.forEach(function (r) { ys[r.year] = 1; }); years = Object.keys(ys).map(Number).sort(function (a, c) { return a - c; }); }
    var totU = rows.reduce(function (a, r) { return a + (r.cost_usd || 0); }, 0), totL = rows.reduce(function (a, r) { return a + (r.cost_local || 0); }, 0);
    var pop = (b.aggregates && b.aggregates.national_pop_last_year) || 0;
    var cU = "Cost (USD)", cL = "Cost (" + cur + ")";
    var st = statusOf(b), scn = getScenario(b), costSet = getCostSet(b);
    var meta = [["Budget", b.name || ""], ["Scenario", b.scenarioName || ""], ["Cost set", b.costSetName || ""], ["Generated", (b.generatedAt || "").slice(0, 10)], ["Source status", st.label || st.state || "Current"]];
    if (opts.filters) meta.push(["Filters applied", opts.filters]);
    function diagRows() {
      var out = [], d = b.diagnostics || {};
      (b.notes || []).forEach(function (m) { out.push(["warning", "", "", "", "", m]); });
      Object.keys(d).sort().forEach(function (key) {
        (d[key] || []).forEach(function (it) {
          out.push([key, clean(it.intervention_code), clean(it.type), clean(it.index != null ? it.index : it.row), clean(it.reason || it.unit || it.cost_class), clean(it.message || it.description || "")]);
        });
      });
      return out;
    }
    function assumptionRows() {
      if (!scn) return [["Scenario source unavailable", "", "", "", "", "", "", "", "", ""]];
      var rowsOut = [];
      G.catalog.forEach(function (c) {
        var iv = scn.interventions && scn.interventions[c.code];
        if (!iv) return;
        var p = iv.params || {};
        rowsOut.push([ivName(c.code), c.code, iv.enabled ? "Yes" : "No", clean(iv.type), clean((iv.activeYears || []).join(", ")), clean(p.coverage), clean(p.cycles), clean(p.buffer), clean(p.people_per_net), clean(iv.scope && iv.scope.mode)]);
      });
      return rowsOut;
    }
    function costAuditRows() {
      if (!costSet || !costSet.rows) return [["Cost set source unavailable", "", "", "", "", "", "", "", "", ""]];
      var used = {}, d = b.diagnostics || {}, flags = {};
      lineRows.forEach(function (r) {
        var p = String(r.line_id || "").split("_"), idx = p[0] === "fixed" ? p[1] : p[p.length - 1];
        if (idx !== "" && idx != null) used[idx] = true;
      });
      ["unsupportedUnits", "skippedRows", "invalidCostClasses", "ambiguousTypeRows"].forEach(function (k) {
        (d[k] || []).forEach(function (it) { if (it.index != null) flags[it.index] = (flags[it.index] ? flags[it.index] + "; " : "") + k + (it.reason ? ": " + it.reason : ""); });
      });
      return costSet.rows.map(function (r, i) {
        return [i + 1, ivName(r.intervention_code), clean(r.type), className(r.cost_class), clean(r.description), clean(r.unit), clean(r.usd_cost), clean(r.source), used[i] ? "Used" : "Not used in filtered budget", clean(flags[i])];
      });
    }

    // Year columns (USD) + all-years totals in both currencies.
    function yearCols() { return years.map(function (y) { return { label: String(y) + " (USD)", width: 95, fmt: "money" }; }); }
    function yearVals(e) { return years.map(function (y) { return rd((e.yr[y] || {}).u); }); }
    function yearTotalUsd(set) { return years.map(function (y) { return rd(set.reduce(function (a, e) { return a + ((e.yr[y] || {}).u || 0); }, 0)); }); }
    var tailCols = [{ label: "Total (USD)", width: 120, fmt: "money" }, { label: "Total (" + cur + ")", width: 130, fmt: "money" }];

    var sheets = [];
    sheets.push({ name: "Summary", title: "Budget summary — " + (b.name || ""), meta: meta,
      columns: [{ label: "Item", width: 240 }, { label: "Amount", width: 150, fmt: "money" }],
      rows: [["Total cost (USD)", rd(totU)], ["Total cost (" + cur + ")", rd(totL)],
        ["Cost per person (USD)", pop ? rd(totU / pop) : ""], ["Plan years", years.length ? (years[0] + "–" + years[years.length - 1]) : ""],
        ["Interventions costed", byDimYear(rows, function (r) { return r.intervention_code; }).order.length]] });

    // By intervention — parent rows with cost-category children nested beneath.
    var ivAgg = byDimYear(rows, function (r) { return r.intervention_code; });
    var ivRows = [];
    ivAgg.order.forEach(function (code) {
      var e = ivAgg.m[code];
      ivRows.push({ kind: "parent", cells: [ivName(code)].concat(yearVals(e)).concat([rd(e.u), rd(e.l)]) });
      var clsAgg = byDimYear(rows.filter(function (r) { return r.intervention_code === code; }), function (r) { return r.cost_class; });
      clsAgg.order.forEach(function (cls) {
        var ce = clsAgg.m[cls];
        ivRows.push({ kind: "child", cells: ["↳ " + className(cls)].concat(yearVals(ce)).concat([rd(ce.u), rd(ce.l)]) });
      });
    });
    sheets.push({ name: "By intervention", title: "Cost by intervention (with cost categories)",
      columns: [{ label: "Intervention / cost category", width: 240 }].concat(yearCols()).concat(tailCols),
      rows: ivRows,
      totalRow: ["TOTAL"].concat(yearTotalUsd(ivAgg.order.map(function (k) { return ivAgg.m[k]; }))).concat([rd(totU), rd(totL)]) });

    function dimSheet(name, title, label, width, keyFn, labelFn) {
      var agg = byDimYear(rows, keyFn);
      return { name: name, title: title,
        columns: [{ label: label, width: width }].concat(yearCols()).concat(tailCols),
        rows: agg.order.map(function (k) { var e = agg.m[k]; return [labelFn ? labelFn(k) : k].concat(yearVals(e)).concat([rd(e.u), rd(e.l)]); }),
        totalRow: ["TOTAL"].concat(yearTotalUsd(agg.order.map(function (k) { return agg.m[k]; }))).concat([rd(totU), rd(totL)]) };
    }
    sheets.push(dimSheet("By cost category", "Cost by category", "Cost category", 200, function (r) { return r.cost_class; }, className));

    // By year — simple per-year totals.
    var gy = byDimYear(rows, function (r) { return r.year; });
    sheets.push({ name: "By year", title: "Cost by year",
      columns: [{ label: "Year", width: 80 }, { label: cU, width: 120, fmt: "money" }, { label: cL, width: 130, fmt: "money" }],
      rows: years.map(function (y) { var e = gy.m[y] || { u: 0, l: 0 }; return [y, rd(e.u), rd(e.l)]; }), totalRow: ["TOTAL", rd(totU), rd(totL)] });

    sheets.push(dimSheet("By region", "Cost by region", "Region", 160, function (r) { return r.adm1; }));

    // By district — districts grouped under each region with a coloured regional subtotal row.
    var regAgg = byDimYear(rows, function (r) { return r.adm1; });
    var distRows = [];
    regAgg.order.slice().sort(function (a, c) { return String(a).localeCompare(String(c)); }).forEach(function (region) {
      var regionRows = rows.filter(function (r) { return r.adm1 === region; });
      var dAgg = byDimYear(regionRows, function (r) { return r.adm2; });
      dAgg.order.slice().sort(function (a, c) { return String(a).localeCompare(String(c)); }).forEach(function (d2) {
        var e = dAgg.m[d2];
        distRows.push([region, d2].concat(yearVals(e)).concat([rd(e.u), rd(e.l)]));
      });
      var re = regAgg.m[region];
      distRows.push({ kind: "sub", cells: [region + " — subtotal", ""].concat(yearVals(re)).concat([rd(re.u), rd(re.l)]) });
    });
    sheets.push({ name: "By district", title: "Cost by district (with regional subtotals)",
      columns: [{ label: "Region", width: 150 }, { label: "District", width: 150 }].concat(yearCols()).concat(tailCols),
      rows: distRows,
      totalRow: ["TOTAL", ""].concat(yearTotalUsd(regAgg.order.map(function (k) { return regAgg.m[k]; }))).concat([rd(totU), rd(totL)]) });

    // Quantities — per-year quantity columns + all-years total.
    var qm = {}, qo = [];
    qrows.forEach(function (r) {
      var k = r.intervention_code + "|" + (r.type || "") + "|" + r.commodity;
      if (!(k in qm)) { qm[k] = { iv: r.intervention_code, type: r.type || "", com: r.commodity, age: r.age_band || "", basis: r.quantity_basis || "", q: 0, tp: 0, cp: 0, yr: {} }; qo.push(k); }
      var e = qm[k]; e.q += r.quantity || 0; e.tp += r.target_pop || 0; e.cp += r.covered_pop || 0;
      e.yr[r.year] = (e.yr[r.year] || 0) + (r.quantity || 0);
    });
    qo.sort(function (a, c) { return qm[c].q - qm[a].q; });
    sheets.push({ name: "Quantities", title: "Commodity quantities by year",
      columns: [{ label: "Intervention", width: 200 }, { label: "Type", width: 120 }, { label: "Commodity", width: 150 }, { label: "Age band", width: 120 }, { label: "Quantity basis", width: 130 }]
        .concat(years.map(function (y) { return { label: String(y) + " qty", width: 90, fmt: "int" }; }))
        .concat([{ label: "All years", width: 110, fmt: "int" }, { label: "Population targeted", width: 130, fmt: "int" }, { label: "Coverage-adjusted population", width: 160, fmt: "int" }]),
      rows: qo.map(function (k) { var m = qm[k]; return [ivName(m.iv), m.type, m.com, m.age || "", m.basis || ""].concat(years.map(function (y) { return rd(m.yr[y]); })).concat([rd(m.q), rd(m.tp), rd(m.cp)]); }) });

    sheets.push({ name: "Cost detail", title: "Detailed cost lines",
      columns: [{ label: "Region", width: 140 }, { label: "District", width: 140 }, { label: "Year", width: 80 }, { label: "Intervention", width: 190 }, { label: "Type", width: 130 }, { label: "Commodity", width: 150 }, { label: "Age band", width: 120 }, { label: "Quantity basis", width: 130 }, { label: "Cost category", width: 130 }, { label: "Description", width: 280 }, { label: "Unit", width: 100 }, { label: "Quantity", width: 100, fmt: "num1" }, { label: "Quantity used for cost", width: 130, fmt: "num1" }, { label: "Unit cost USD", width: 110, fmt: "num1" }, { label: cU, width: 110, fmt: "money" }, { label: cL, width: 120, fmt: "money" }, { label: "Match", width: 100 }, { label: "Source", width: 180 }],
      rows: lineRows.map(function (r) { return [r.adm1, r.adm2, safeYear(r.year), ivName(r.intervention_code), r.type || "", r.commodity || "", r.age_band || "", r.quantity_basis || "", className(r.cost_class), r.description || "", r.unit || "", round1(r.quantity), round1(r.quantity_for_cost || r.quantity), round2(r.unit_cost_usd), rd(r.cost_usd), rd(r.cost_local), r.match_kind || "", r.source || ""]; }) });

    sheets.push({ name: "Diagnostics", title: "Budget diagnostics",
      columns: [{ label: "Diagnostic type", width: 170 }, { label: "Intervention", width: 150 }, { label: "Type", width: 140 }, { label: "Row/index", width: 80 }, { label: "Reason/detail", width: 180 }, { label: "Message", width: 340 }],
      rows: diagRows() });

    sheets.push({ name: "Source status", title: "Source status",
      columns: [{ label: "Field", width: 180 }, { label: "Value", width: 320 }],
      rows: [["Status", st.label || st.state], ["Budget id", b.id || ""], ["Scenario id", b.scenarioId || ""], ["Cost set id", b.costSetId || ""], ["Scenario source available", scn ? "Yes" : "No"], ["Cost set source available", costSet ? "Yes" : "No"], ["Saved source signature", b.sourceSig || ""], ["Generated", b.generatedAt || ""], ["Schema version", b.schemaVersion || ""]] });

    sheets.push({ name: "Assumptions snapshot", title: "Scenario assumptions snapshot",
      columns: [{ label: "Intervention", width: 190 }, { label: "Code", width: 80 }, { label: "Enabled", width: 80 }, { label: "Selected type", width: 140 }, { label: "Active years", width: 140 }, { label: "Coverage", width: 90, fmt: "num1" }, { label: "Cycles", width: 80, fmt: "num1" }, { label: "Buffer", width: 80, fmt: "num1" }, { label: "People per net", width: 110, fmt: "num1" }, { label: "Scope mode", width: 120 }],
      rows: assumptionRows() });

    sheets.push({ name: "Cost set audit", title: "Cost set audit",
      columns: [{ label: "Cost row", width: 70, fmt: "int" }, { label: "Intervention", width: 180 }, { label: "Type", width: 130 }, { label: "Cost category", width: 130 }, { label: "Description", width: 300 }, { label: "Unit", width: 110 }, { label: "Unit cost USD", width: 110, fmt: "num1" }, { label: "Source", width: 190 }, { label: "Use status", width: 150 }, { label: "Diagnostic flags", width: 240 }],
      rows: costAuditRows() });

    sheets.push({ name: "Top cost elements", title: "Top cost elements",
      columns: [{ label: "Rank", width: 60, fmt: "int" }, { label: "Intervention", width: 180 }, { label: "Type", width: 130 }, { label: "Cost category", width: 130 }, { label: "Cost description", width: 300 }, { label: "Unit", width: 100 }, { label: "Quantity used for cost", width: 130, fmt: "num1" }, { label: "Unit cost USD", width: 110, fmt: "num1" }, { label: cU, width: 120, fmt: "money" }, { label: cL, width: 120, fmt: "money" }, { label: "Source", width: 180 }],
      rows: G.topCostElements(lineRows, { currency: opts.currency || "USD", limit: opts.topN || 30 }).map(function (r, i) { return [i + 1, r.intervention, r.type, r.cost_category, r.description, r.unit, round1(r.quantity_for_cost), round2(r.unit_cost_usd), rd(r.cost_usd), rd(r.cost_local), r.source]; }) });

    var exRows = lineRows.filter(function (r) {
      return (r.adm1 === "Upper River" && r.adm2 === "Jimara" && Number(r.year) === 2026) || (r.adm1 === "National" && (String(r.year) === "2026" || String(r.year) === "All Years"));
    });
    var exPop = (G.assumptions && G.assumptions.population) ? G.assumptions.population("Upper River", "Jimara", 2026, 0.023) : 0;
    sheets.push({ name: "Worked example", title: "Worked example - Upper River / Jimara 2026",
      meta: meta.concat([["Example geography", "Upper River / Jimara"], ["Example year", "2026"], ["Projected population", Math.round(exPop)]]),
      columns: [{ label: "Intervention", width: 180 }, { label: "Type", width: 120 }, { label: "Commodity", width: 140 }, { label: "Target population", width: 120, fmt: "int" }, { label: "Coverage-adjusted population", width: 150, fmt: "int" }, { label: "Commodity quantity", width: 120, fmt: "num1" }, { label: "Cost line", width: 260 }, { label: "Unit", width: 100 }, { label: "Quantity used for cost", width: 130, fmt: "num1" }, { label: "Unit cost USD", width: 100, fmt: "num1" }, { label: "Cost category", width: 120 }, { label: cU, width: 110, fmt: "money" }],
      rows: exRows.map(function (r) { return [ivName(r.intervention_code), r.type || "", r.commodity || "", rd(r.target_pop), rd(r.covered_pop), Math.round((r.quantity || 0) * 10) / 10, r.description || "", r.unit || "", Math.round((r.quantity_for_cost || 0) * 10) / 10, Math.round((r.unit_cost_usd || 0) * 100) / 100, className(r.cost_class), rd(r.cost_usd)]; }),
      totalRow: ["TOTAL", "", "", "", "", "", "", "", "", "", "", rd(exRows.reduce(function (a, r) { return a + (r.cost_usd || 0); }, 0))] });

    return sheets;
  };
})(GMB);
