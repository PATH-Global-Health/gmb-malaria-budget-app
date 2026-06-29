/* Budget comparison tab — compare two or more saved budgets (no upper limit)
   against a baseline. National-level (no maps), mirroring the DRC comparison tab:
   sticky filter sidebar, metadata grid, per-budget KPIs, totals + difference
   charts (with optional envelope), a configurable breakdown, and a delta table.
   Read-only; reuses budget aggregates + costRows and the chart/util helpers. */
window.GMB = window.GMB || {};
GMB.tabs = GMB.tabs || {};

(function (G) {
  var el = G.ui.el, C = G.charts, U = G.util;

  var compareSet = {}, baselineId = null, currency = "USD", mainEl = null;
  var f = { years: {}, interventions: {}, costClasses: {} };
  var compareBy = "intervention_code", compMode = "abs", envelope = null, openFilter = {}, lastInitKey = null, rootEl = null;

  var CLASS_NAMES = { PROC: "Procurement", DIST: "Distribution", OPS: "Operational", SUPP: "Support", "M&E": "Monitoring & evaluation", COM: "Communication", ADMIN: "Administration", OTHER: "Other" };
  var DIMS = [{ value: "intervention_code", label: "Intervention" }, { value: "cost_class", label: "Cost category" }, { value: "year", label: "Year" }, { value: "adm1", label: "Region" }];

  function budgets() { return G.store.get().budgets; }
  function byId(id) { return budgets().filter(function (b) { return b.id === id; })[0]; }
  function scnGrowth(b) { var s = G.store.get().scenarios.filter(function (x) { return x.id === b.scenarioId; })[0]; return s ? (s.assumptions && (s.assumptions.growthByYear || s.assumptions.growth)) : undefined; }
  function ivName(c) { var x = G.catalogByCode(c); return x ? x.nice : c; }
  function className(c) { return CLASS_NAMES[c] || c; }
  function valField() { return currency === "GMD" ? "cost_local" : "cost_usd"; }
  function money(n) { return (currency === "GMD" ? "GMD " : "$") + U.fmtNum(n); }
  function moneyShort(n) { var pre = currency === "GMD" ? "GMD " : "$", a = Math.abs(n); if (a >= 1e9) return pre + (n / 1e9).toFixed(1) + "B"; if (a >= 1e6) return pre + (n / 1e6).toFixed(1) + "M"; if (a >= 1e3) return pre + Math.round(n / 1e3) + "K"; return pre + Math.round(n); }
  function dimLabel(dim, key) { if (dim === "intervention_code") return ivName(key); if (dim === "cost_class") return className(key); return String(key); }
  function sel(set) { return Object.keys(set).filter(function (k) { return set[k]; }); }
  function allOn(set) { return Object.keys(set).every(function (k) { return set[k]; }); }
  function selYears() { return sel(f.years).map(Number); }

  function selectedBudgets() {
    var out = [], base = byId(baselineId); if (base) out.push(base);
    budgets().forEach(function (b) { if (b.id !== baselineId && compareSet[b.id]) out.push(b); });
    return out;
  }
  var _names = null;
  function shortName(b) {
    if (!_names) { _names = {}; budgets().forEach(function (x) { _names[x.name] = (_names[x.name] || 0) + 1; }); }
    return _names[b.name] > 1 ? b.name + " (" + b.id.slice(-4) + ")" : b.name;
  }
  function budgetColor(b) { var l = selectedBudgets(); for (var i = 0; i < l.length; i++) if (l[i].id === b.id) return C.budget(i); return C.budget(0); }
  function chartLabel(b) { var n = b.scenarioName || b.name || ""; var s = (n.split("—")[0] || n).trim() || n; return s; }
  var SHORT_IV = { mii: "Mass ITN", mii_routine: "Routine ITN", irs: "IRS", smc: "SMC", iptsc: "IPT school-age", vax: "Vaccine", iptp: "IPTp" };
  function legendLabel(dim, k) { return dim === "intervention_code" ? (SHORT_IV[k] || ivName(k)) : dimLabel(dim, k); }

  function avail() {
    var yrs = {}, ivs = {}, cls = {};
    selectedBudgets().forEach(function (b) { (b.costRows || []).forEach(function (r) { yrs[r.year] = 1; ivs[r.intervention_code] = 1; cls[r.cost_class] = 1; }); });
    return {
      years: Object.keys(yrs).map(Number).sort(function (a, b) { return a - b; }),
      interventions: G.catalog.map(function (c) { return c.code; }).filter(function (c) { return ivs[c]; }),
      costClasses: Object.keys(cls).sort()
    };
  }
  function initFilters() {
    var a = avail();
    f.years = {}; a.years.forEach(function (y) { f.years[y] = true; });
    f.interventions = {}; a.interventions.forEach(function (i) { f.interventions[i] = true; });
    f.costClasses = {}; a.costClasses.forEach(function (c) { f.costClasses[c] = true; });
  }
  function filteredRows(b) { return U.filterRows(b.costRows || [], { years: selYears(), interventions: sel(f.interventions), costClasses: sel(f.costClasses) }); }
  function filteredLineRows(b) {
    var yrs = selYears(), ivs = sel(f.interventions), cls = sel(f.costClasses);
    return (b.costLineRows || b.costRows || []).filter(function (r) {
      var fixed = String(r.year) === "All Years";
      return (fixed || yrs.indexOf(r.year) !== -1 || yrs.indexOf(Number(r.year)) !== -1)
        && ivs.indexOf(r.intervention_code) !== -1
        && cls.indexOf(r.cost_class) !== -1;
    });
  }
  function totalOf(b) { var vf = valField(); return filteredRows(b).reduce(function (a, r) { return a + (r[vf] || 0); }, 0); }
  function natAvgPop(b) {
    var g = scnGrowth(b), ys = selYears(); if (!ys.length) return 0;
    var pairs = G.reference.districtPairs(), tot = 0;
    ys.forEach(function (y) { pairs.forEach(function (d) { tot += G.assumptions.population(d.adm1, d.adm2, y, g); }); });
    return tot / ys.length;
  }
  function refresh() { renderBody(); }

  function goGenerate(b) {
    G.focusGenerateCombo = { scenarioId: b.scenarioId, costSetId: b.costSetId };
    G.router.go("generate");
  }
  function freshnessCallout(picked) {
    var bad = picked.map(function (b) { return { b: b, st: G.budgetStatus ? G.budgetStatus(b) : { state: "current" } }; }).filter(function (x) { return x.st.state !== "current"; });
    if (!bad.length) return null;
    var deleted = bad.some(function (x) { return x.st.state === "deleted"; });
    return el("div", { class: "stale-callout" + (deleted ? " deleted" : "") }, [
      el("div", { class: "stale-title", text: deleted ? "Some selected budgets have deleted sources" : "Some selected budgets are out of date" }),
      el("div", { class: "small", text: bad.map(function (x) { return shortName(x.b) + ": " + (x.st.label || x.st.state); }).join("; ") }),
      bad.filter(function (x) { return x.st.state !== "deleted"; })[0] ? el("button", { class: "linkbtn", style: "margin-top:6px", onClick: function () { goGenerate(bad.filter(function (x) { return x.st.state !== "deleted"; })[0].b); } }, ["Go to Budget generation"]) : null
    ]);
  }

  // ---- controls ----
  function selBox(options, value, on) { var s = document.createElement("select"); options.forEach(function (o) { var op = document.createElement("option"); op.value = o.value; op.textContent = o.label; if (o.value === value) op.selected = true; s.appendChild(op); }); s.addEventListener("change", function () { on(s.value); }); return s; }
  function seg(options, val, on) { return el("div", { class: "seg" }, options.map(function (o) { return el("span", { class: "seg-opt" + (o.value === val ? " on" : ""), role: "button", tabindex: "0", onClick: function () { on(o.value); } }, [o.label]); })); }
  function multiSelect(id, title, values, set, labelFn) {
    var det = document.createElement("details"); det.className = "ms"; det.open = !!openFilter[id];
    det.addEventListener("toggle", function () { openFilter[id] = det.open; });
    var sum = document.createElement("summary"); sum.className = "ms-sum"; sum.textContent = title + " · " + (allOn(set) ? "All" : sel(set).length + "/" + values.length); det.appendChild(sum);
    var panel = el("div", { class: "ms-panel" });
    panel.appendChild(el("div", { class: "ms-actions" }, [el("button", { class: "linkbtn", onClick: function () { values.forEach(function (v) { set[v] = true; }); refresh(); } }, ["All"]), el("button", { class: "linkbtn", onClick: function () { values.forEach(function (v) { set[v] = false; }); refresh(); } }, ["None"])]));
    values.forEach(function (v) { var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!set[v]; cb.addEventListener("change", function () { set[v] = cb.checked; refresh(); }); panel.appendChild(el("label", { class: "ms-opt" }, [cb, " " + (labelFn ? labelFn(v) : String(v))])); });
    det.appendChild(panel); return det;
  }
  function card(title, tabsEl, bodyEl, actionEl, expandEl) {
    var titlerow = el("div", { class: "card-titlerow" }, [el("span", { class: "card-title", text: title }), actionEl ? el("span", { class: "card-action" }, [actionEl]) : null]);
    var head = el("div", { class: "card-head" }, [titlerow]); if (tabsEl) head.appendChild(tabsEl);
    return el("div", { class: "card" }, [head, el("div", { class: "card-body" }, [bodyEl, expandEl])]);
  }
  function dlPng(getSvg, file) { return G.ui.downloadButton(getSvg, file, "PNG"); }

  // ---- entry ----
  function render(root) {
    rootEl = root;
    if (!budgets().length) { root.innerHTML = ""; root.appendChild(GMB.ui.placeholder("Phase 6", "Budget comparison", "No budgets yet. Generate some on the Budget generation tab, then compare them here.")); return; }
    if (G.focusBudgetIds && G.focusBudgetIds.length) {
      baselineId = G.focusBudgetIds[0]; compareSet = {};
      G.focusBudgetIds.slice(1).forEach(function (id) { if (byId(id)) compareSet[id] = true; });
      G.focusBudgetIds = null; lastInitKey = null;
    }
    if (!baselineId || !byId(baselineId)) baselineId = budgets()[budgets().length - 1].id;
    renderBody();
  }

  function ensureFilters() {
    if (baselineId && !byId(baselineId)) baselineId = null;
    Object.keys(compareSet).forEach(function (id) { if (!byId(id)) delete compareSet[id]; });
    var key = selectedBudgets().map(function (b) { return b.id; }).slice().sort().join(",");
    if (key !== lastInitKey) { initFilters(); lastInitKey = key; }
  }
  function renderMain() {
    mainEl.innerHTML = "";
    var picked = selectedBudgets();
    if (picked.length < 2) {
      mainEl.appendChild(el("div", { class: "panel" }, [el("div", { class: "scn-h" }, [el("span", { class: "scn-step", text: "5" }), "Budget comparison"]), el("p", { class: "muted", text: "Choose a baseline budget, then tick at least one budget to compare against it." })]));
      return;
    }
    var warn = freshnessCallout(picked);
    if (warn) mainEl.appendChild(warn);
    mainEl.appendChild(renderScoreboard(picked));
    mainEl.appendChild(renderDeltaTable(picked));
    mainEl.appendChild(el("div", { class: "cards-row two" }, [renderTotalsPlot(picked), renderCompositionPlot(picked)]));
  }
  function renderBody() {
    ensureFilters();
    rootEl.innerHTML = "";
    rootEl.appendChild(GMB.ui.pageHelp("compare"));
    mainEl = el("div", { class: "viz-main" });
    renderMain();
    rootEl.appendChild(el("div", { class: "viz-layout" }, [renderSidebar(), mainEl]));
  }

  // ---- sidebar ----
  function renderSidebar() {
    var a = avail(), side = el("aside", { class: "scn-summary viz-side" });
    side.appendChild(el("div", { class: "scn-h" }, [el("span", { class: "scn-step", text: "5" }), "Budget comparison"]));

    side.appendChild(el("div", { class: "field" }, [el("label", { text: "Baseline budget" }),
      selBox(budgets().slice().reverse().map(function (b) { return { value: b.id, label: shortName(b) }; }), baselineId, function (v) { baselineId = v; delete compareSet[v]; lastInitKey = null; refresh(); })]));
    var bst = baselineId && byId(baselineId) && G.budgetStatus ? G.budgetStatus(byId(baselineId)) : { state: "current" };
    if (bst.state !== "current") side.appendChild(el("div", { class: "small", style: "color:" + (bst.state === "deleted" ? "var(--red)" : "#9a6324"), text: (bst.label || bst.state) + ": regenerate before relying on this comparison." }));

    side.appendChild(el("label", { class: "cmp-section", text: "Compare against" }));
    var others = budgets().slice().reverse().filter(function (b) { return b.id !== baselineId; });
    var list = el("div", { class: "cmp-budget-list" });
    if (!others.length) list.appendChild(el("p", { class: "muted small", style: "margin:4px", text: "Generate another budget to compare." }));
    others.forEach(function (b) {
      var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!compareSet[b.id];
      cb.addEventListener("change", function () { if (cb.checked) compareSet[b.id] = true; else delete compareSet[b.id]; lastInitKey = null; refresh(); });
      var st = G.budgetStatus ? G.budgetStatus(b) : { state: "current" };
      list.appendChild(el("label", { class: "ms-opt" }, [cb, " " + shortName(b), st.state !== "current" ? el("span", { class: "bstat " + st.state + " cmp-budget-status", text: st.label || st.state }) : null]));
    });
    side.appendChild(list);

    side.appendChild(el("div", { class: "filt-group" }, [el("span", { class: "filt-title", text: "Currency" }), seg([{ value: "USD", label: "USD" }, { value: "GMD", label: "GMD" }], currency, function (v) { currency = v; refresh(); })]));
    side.appendChild(multiSelect("years", "Years", a.years, f.years, String));
    side.appendChild(multiSelect("iv", "Interventions", a.interventions, f.interventions, ivName));
    side.appendChild(multiSelect("cls", "Cost categories", a.costClasses, f.costClasses, className));

    var env = document.createElement("input"); env.type = "number"; env.min = "0"; env.placeholder = "Available budget in " + currency; if (envelope != null) env.value = envelope;
    env.addEventListener("input", function () { envelope = env.value === "" ? null : Number(env.value); renderMain(); });
    side.appendChild(el("div", { class: "field" }, [el("label", { text: "Budget envelope (optional)" }), env]));
    side.appendChild(el("button", { class: "btn secondary", style: "margin-top:6px", onClick: function () { initFilters(); currency = "USD"; envelope = null; refresh(); } }, ["Reset filters"]));
    return side;
  }

  // ---- scoreboard (totals · relative size · Δ vs baseline · per person · envelope) ----
  function renderScoreboard(picked) {
    var totals = picked.map(totalOf), maxTot = Math.max.apply(null, totals) || 1, baseTot = totals[0];
    var grid = el("div", { class: "sb-grid" });
    picked.forEach(function (b, i) {
      var tot = totals[i], pop = natAvgPop(b), col = budgetColor(b);
      var c = el("div", { class: "sb-card" + (i === 0 ? " base" : "") }); c.style.borderTopColor = col;
      c.appendChild(el("div", { class: "sb-head" }, [el("span", { class: "leg-swatch", style: "background:" + col }), el("strong", { text: b.scenarioName, title: b.name }), i === 0 ? el("span", { class: "sb-baseline", text: "baseline" }) : null]));
      c.appendChild(el("div", { class: "muted small sb-sub", text: b.costSetName, title: b.name }));
      c.appendChild(el("div", { class: "sb-total", text: money(tot) }));
      c.appendChild(el("div", { class: "sb-bar" }, [el("div", { class: "sb-bar-fill", style: "width:" + (tot / maxTot * 100).toFixed(1) + "%;background:" + col })]));
      var foot = el("div", { class: "sb-foot" });
      if (i > 0) { var d = tot - baseTot, pc = baseTot ? Math.round(d / baseTot * 100) : 0; foot.appendChild(el("span", { class: "delta-pill " + (d > 0 ? "up" : d < 0 ? "down" : "none") }, [(d > 0 ? "▲ +" : d < 0 ? "▼ −" : "– ") + (d === 0 ? "no change" : moneyShort(Math.abs(d)) + " · " + (d > 0 ? "+" : "") + pc + "%")])); }
      else foot.appendChild(el("span", { class: "muted small", text: "reference" }));
      foot.appendChild(el("span", { class: "muted small", text: pop ? money(tot / pop) + " / person" : "" }));
      c.appendChild(foot);
      if (envelope != null && envelope > 0) { var rem = envelope - tot; c.appendChild(el("div", { class: "sb-env " + (rem >= 0 ? "ok" : "over"), text: rem >= 0 ? "Under envelope by " + moneyShort(rem) + " (" + Math.round(tot / envelope * 100) + "% used)" : "Over envelope by " + moneyShort(-rem) })); }
      grid.appendChild(c);
    });
    return card("Budget comparison", null, grid, el("button", { class: "linkbtn dl-btn", onClick: function () { exportCompareXlsx(picked); } }, ["⬇ Export to Excel"]));
  }
  function exportCompareXlsx(picked) {
    var base = picked[0], baseTot = totalOf(base);
    var meta = [["Baseline", shortName(base)], ["Currency", currency], ["Years", allOn(f.years) ? "All" : sel(f.years).join(", ")]];
    function keysFor(dim) { var t = {}, o = []; picked.forEach(function (b) { U.pivot(filteredRows(b), dim, null, valField()).groups.forEach(function (g) { if (!(g.key in t)) { t[g.key] = 0; o.push(g.key); } t[g.key] += g.total; }); }); if (dim === "year") o.sort(function (a, b) { return a - b; }); else o.sort(function (a, b) { return t[b] - t[a]; }); return o; }
    function perBudgetMap(dim) { return picked.map(function (b) { var m = {}; U.pivot(filteredRows(b), dim, null, valField()).groups.forEach(function (g) { m[g.key] = g.total; }); return m; }); }
    var sheets = [{ name: "Summary", title: "Budget comparison", meta: meta,
      columns: [{ label: "Budget", width: 210 }, { label: "Scenario", width: 160 }, { label: "Cost set", width: 150 }, { label: "Total (" + currency + ")", width: 130, fmt: "money" }, { label: "Δ vs baseline", width: 120, fmt: "money" }, { label: "Δ %", width: 70, fmt: "num1" }, { label: "Cost per person", width: 120, fmt: "money" }],
      rows: picked.map(function (b, i) { var tot = totalOf(b), pop = natAvgPop(b), d = tot - baseTot; return [shortName(b) + (i === 0 ? " (baseline)" : ""), b.scenarioName, b.costSetName, Math.round(tot), i === 0 ? 0 : Math.round(d), i === 0 ? 0 : (baseTot ? Math.round(d / baseTot * 1000) / 10 : 0), pop ? Math.round(tot / pop) : ""]; }) }];
    [["intervention_code", "By intervention"], ["cost_class", "By cost category"], ["year", "By year"], ["adm1", "By region"]].forEach(function (dd) {
      var dim = dd[0], keys = keysFor(dim), pm = perBudgetMap(dim);
      var cols = [{ label: dd[1].replace("By ", ""), width: 200 }].concat(picked.map(function (b) { return { label: shortName(b), width: 130, fmt: "money" }; }));
      var rows = keys.map(function (k) { return [dimLabel(dim, k)].concat(picked.map(function (b, i) { return Math.round(pm[i][k] || 0); })); });
      var totalRow = ["TOTAL"].concat(picked.map(function (b) { return Math.round(totalOf(b)); }));
      sheets.push({ name: dd[1], title: dd[1] + " (" + currency + ")", columns: cols, rows: rows, totalRow: totalRow });
    });
    sheets.push({ name: "Budget status", title: "Budget source status",
      columns: [{ label: "Budget", width: 210 }, { label: "Scenario", width: 180 }, { label: "Cost set", width: 170 }, { label: "Status", width: 120 }, { label: "Warnings", width: 90, fmt: "int" }, { label: "Generated", width: 130 }],
      rows: picked.map(function (b) { var st = G.budgetStatus ? G.budgetStatus(b) : { label: "Current" }; return [shortName(b), b.scenarioName, b.costSetName, st.label || st.state, (b.notes || []).length, (b.generatedAt || "").slice(0, 10)]; }) });
    var diagRows = [];
    picked.forEach(function (b) {
      (b.notes || []).forEach(function (m) { diagRows.push([shortName(b), "warning", "", "", "", m]); });
      var d = b.diagnostics || {};
      Object.keys(d).sort().forEach(function (key) {
        (d[key] || []).forEach(function (it) { diagRows.push([shortName(b), key, it.intervention_code || "", it.type || "", it.reason || it.unit || it.cost_class || "", it.message || it.description || ""]); });
      });
    });
    sheets.push({ name: "Diagnostics", title: "Budget diagnostics",
      columns: [{ label: "Budget", width: 210 }, { label: "Diagnostic type", width: 170 }, { label: "Intervention", width: 140 }, { label: "Type", width: 130 }, { label: "Reason/detail", width: 180 }, { label: "Message", width: 340 }],
      rows: diagRows });
    var lineRows = [];
    picked.forEach(function (b) {
      filteredLineRows(b).forEach(function (r) {
        lineRows.push([shortName(b), b.scenarioName, b.costSetName, r.adm1, r.adm2, String(r.year), ivName(r.intervention_code), r.type || "", r.commodity || "", className(r.cost_class), r.description || "", r.unit || "", Math.round((r.quantity_for_cost || r.quantity || 0) * 10) / 10, Math.round((r.unit_cost_usd || 0) * 100) / 100, Math.round(r.cost_usd || 0), Math.round(r.cost_local || 0), r.match_kind || "", r.source || ""]);
      });
    });
    sheets.push({ name: "Line detail", title: "Combined line-item cost detail",
      columns: [{ label: "Budget", width: 210 }, { label: "Scenario", width: 180 }, { label: "Cost set", width: 170 }, { label: "Region", width: 140 }, { label: "District", width: 140 }, { label: "Year", width: 80 }, { label: "Intervention", width: 180 }, { label: "Type", width: 130 }, { label: "Commodity", width: 150 }, { label: "Cost category", width: 130 }, { label: "Description", width: 300 }, { label: "Unit", width: 100 }, { label: "Quantity used for cost", width: 130, fmt: "num1" }, { label: "Unit cost USD", width: 110, fmt: "num1" }, { label: "Cost USD", width: 110, fmt: "money" }, { label: "Cost local", width: 110, fmt: "money" }, { label: "Match", width: 100 }, { label: "Source", width: 180 }],
      rows: lineRows });
    var topRows = [];
    picked.forEach(function (b) {
      G.topCostElements(filteredLineRows(b), { currency: currency, limit: 30 }).forEach(function (r, i) {
        topRows.push([shortName(b), i + 1, r.intervention, r.type, r.cost_category, r.description, r.unit, Math.round((r.quantity_for_cost || 0) * 10) / 10, Math.round((r.unit_cost_usd || 0) * 100) / 100, Math.round(r.value || 0), r.source]);
      });
    });
    sheets.push({ name: "Top elements by budget", title: "Top cost elements by budget",
      columns: [{ label: "Budget", width: 210 }, { label: "Rank", width: 60, fmt: "int" }, { label: "Intervention", width: 180 }, { label: "Type", width: 130 }, { label: "Cost category", width: 130 }, { label: "Cost description", width: 300 }, { label: "Unit", width: 100 }, { label: "Quantity used for cost", width: 130, fmt: "num1" }, { label: "Unit cost USD", width: 110, fmt: "num1" }, { label: "Cost (" + currency + ")", width: 120, fmt: "money" }, { label: "Source", width: 180 }],
      rows: topRows });
    var assumptionRows = [];
    picked.forEach(function (b) {
      var st = G.budgetStatus ? G.budgetStatus(b) : {}, scn = st.scn;
      if (!scn) { assumptionRows.push([shortName(b), "Scenario source unavailable", "", "", "", "", "", "", ""]); return; }
      G.catalog.forEach(function (c) {
        var iv = scn.interventions && scn.interventions[c.code], p = (iv && iv.params) || {};
        if (iv) assumptionRows.push([shortName(b), ivName(c.code), c.code, iv.enabled ? "Yes" : "No", iv.type || "", (iv.activeYears || []).join(", "), p.coverage == null ? "" : p.coverage, p.cycles == null ? "" : p.cycles, p.buffer == null ? "" : p.buffer]);
      });
    });
    sheets.push({ name: "Assumptions snapshot", title: "Scenario assumptions snapshot",
      columns: [{ label: "Budget", width: 210 }, { label: "Intervention", width: 180 }, { label: "Code", width: 80 }, { label: "Enabled", width: 80 }, { label: "Selected type", width: 130 }, { label: "Active years", width: 140 }, { label: "Coverage", width: 90, fmt: "num1" }, { label: "Cycles", width: 80, fmt: "num1" }, { label: "Buffer", width: 80, fmt: "num1" }],
      rows: assumptionRows });
    GMB.xlsx.download("budget-comparison", sheets);
  }

  // ---- breakdown ----
  function dimValuesSorted(picked) {
    var totals = {}, order = [];
    picked.forEach(function (b) { U.pivot(filteredRows(b), compareBy, null, valField()).groups.forEach(function (gr) { if (!(gr.key in totals)) { totals[gr.key] = 0; order.push(gr.key); } totals[gr.key] += gr.total; }); });
    if (compareBy === "year") order.sort(function (a, b) { return Number(a) - Number(b); });
    else order.sort(function (a, b) { return totals[b] - totals[a]; });
    return order;
  }
  function renderTotalsPlot(picked) {
    function build(exp) {
      var cats = picked.map(chartLabel), colors = picked.map(budgetColor), vals = picked.map(totalOf);
      return C.bars({ cats: cats, series: [{ label: "Total", color: "#888", colorByCat: colors, values: vals }], fmtFull: money, fmtShort: moneyShort, barLabels: true, refLine: (envelope != null && envelope > 0) ? { value: envelope, label: "Available budget " + moneyShort(envelope) } : null, export: exp });
    }
    return card("Total budget" + (envelope != null && envelope > 0 ? " vs envelope" : ""), null, build(false), dlPng(function () { return build(true); }, "comparison-totals.png"), G.ui.expandPlot("Total budget comparison", build));
  }
  function renderCompositionPlot(picked) {
    var dimTabs = seg(DIMS, compareBy, function (v) { compareBy = v; refresh(); });
    var modeTabs = seg([{ value: "abs", label: "$" }, { value: "share", label: "%" }], compMode, function (v) { compMode = v; refresh(); });
    var controls = el("div", { class: "plot-controls" }, [dimTabs, modeTabs]);
    function build(exp) {
      var keys = dimValuesSorted(picked), vf = valField();
      var perBudget = picked.map(function (b) { var m = {}; U.pivot(filteredRows(b), compareBy, null, vf).groups.forEach(function (gr) { m[gr.key] = gr.total; }); return m; });
      var cats = picked.map(chartLabel);
      var series = keys.map(function (k, ki) { return { label: dimLabel(compareBy, k), color: C.colorFor(compareBy, k, ki), values: picked.map(function (b, bi) { return perBudget[bi][k] || 0; }) }; });
      var legend = keys.map(function (k, ki) { return { label: legendLabel(compareBy, k), color: C.colorFor(compareBy, k, ki) }; });
      return C.bars({ cats: cats, series: series, mode: compMode === "share" ? "stacked100" : "stacked", fmtFull: money, fmtShort: moneyShort, legend: legend, export: exp });
    }
    var dimName = DIMS.filter(function (d) { return d.value === compareBy; })[0].label.toLowerCase();
    return card("Where the money goes — by " + dimName, controls, build(false), dlPng(function () { return build(true); }, "comparison-composition.png"), G.ui.expandPlot("Comparison composition", build));
  }

  // ---- delta table ----
  function renderDeltaTable(picked) {
    var base = picked[0], comps = picked.slice(1), vf = valField(), keys = dimValuesSorted(picked);
    var perBudget = picked.map(function (b) { var m = {}; U.pivot(filteredRows(b), compareBy, null, vf).groups.forEach(function (gr) { m[gr.key] = gr.total; }); return m; });
    var dimName = DIMS.filter(function (d) { return d.value === compareBy; })[0].label;

    var head = [el("th", { text: dimName }), el("th", { class: "num", text: shortName(base) + " (baseline)" })].concat(comps.map(function (b) { return el("th", { class: "num", text: shortName(b) }); }));
    var t = el("table", { class: "data-table cmp-delta" }, [el("tr", {}, head)]);
    keys.forEach(function (k) {
      var bv = perBudget[0][k] || 0;
      var cells = [el("td", { class: "rowlab", text: dimLabel(compareBy, k) }), el("td", { class: "num", text: money(bv) })];
      comps.forEach(function (b, ci) {
        var cv = perBudget[ci + 1][k] || 0, d = cv - bv;
        var pill;
        if (bv === 0 && cv > 0) pill = el("span", { class: "delta-pill new", text: "New" });
        else if (Math.abs(d) < 1) pill = el("span", { class: "delta-pill none", text: "–" });
        else { var pc = bv ? Math.round(d / bv * 100) : 0; pill = el("span", { class: "delta-pill " + (d > 0 ? "up" : "down"), text: (d > 0 ? "▲ +" : "▼ −") + moneyShort(Math.abs(d)) + " (" + (d > 0 ? "+" : "") + pc + "%)" }); }
        cells.push(el("td", { class: "num" }, [document.createTextNode(money(cv) + " "), pill]));
      });
      t.appendChild(el("tr", {}, cells));
    });
    // totals row
    var totRow = [el("td", { class: "rowlab", text: "TOTAL" }), el("td", { class: "num", text: money(totalOf(base)) })].concat(comps.map(function (b) { return el("td", { class: "num", text: money(totalOf(b)) }); }));
    t.appendChild(el("tr", { class: "total-row" }, totRow));

    var dl = el("button", { class: "linkbtn dl-btn", onClick: function () { exportCompareXlsx(picked); } }, ["⬇ Export to Excel"]);
    return card("Change vs baseline — by " + dimName.toLowerCase(), null, el("div", { class: "table-scroll" }, [t]), dl);
  }

  G.tabs.compare = { render: render };
})(GMB);
