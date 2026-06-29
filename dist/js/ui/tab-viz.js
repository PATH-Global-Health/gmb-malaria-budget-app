/* Budget visualisation tab — explore ONE budget in a gridded, DRC-aligned layout:
   a sticky filter sidebar, a top row (intervention-mix map + KPIs + budget envelope),
   tabbed tables (expandable intervention costs, quantities), DRC-style chart cards,
   and a 4-map cost grid (YlOrRd). Multi-select filters cascade everywhere and the
   intervention filter doubles as a what-if. Read-only — never mutates the store. */
window.GMB = window.GMB || {};
GMB.tabs = GMB.tabs || {};

(function (G) {
  var el = G.ui.el, C = G.charts, U = G.util;

  // ---- state ----
  var selId = null, lastInitId = null, rootEl = null;
  var currency = "USD", level = "national";
  var f = { years: {}, interventions: {}, costClasses: {}, regions: {}, districts: {} };
  var envelope = null, tableTab = "costs", expanded = {};
  var cardA = "iv", cardB = "year", cardC = "breakdown", topN = 10;
  var openFilter = {};

  var CLASS_NAMES = { PROC: "Procurement", DIST: "Distribution", OPS: "Operational", SUPP: "Support", "M&E": "Monitoring & evaluation", COM: "Communication", ADMIN: "Administration", OTHER: "Other" };
  var SHORT = { mii: "ITN Campaign", mii_routine: "ITN Routine", irs: "IRS", smc: "SMC", iptsc: "IPTsc", vax: "MalVac", iptp: "IPTp" };

  // ---- data helpers ----
  function budgets() { return G.store.get().budgets; }
  function byId(id) { return budgets().filter(function (b) { return b.id === id; })[0]; }
  function scnGrowth(b) { var s = G.store.get().scenarios.filter(function (x) { return x.id === b.scenarioId; })[0]; return s ? (s.assumptions && (s.assumptions.growthByYear || s.assumptions.growth)) : undefined; }
  function ivName(c) { var x = G.catalogByCode(c); return x ? x.nice : c; }
  function className(c) { return CLASS_NAMES[c] || c; }
  function valField() { return currency === "GMD" ? "cost_local" : "cost_usd"; }
  function money(n) { return (currency === "GMD" ? "GMD " : "$") + U.fmtNum(n); }
  function moneyShort(n) {
    var pre = currency === "GMD" ? "GMD " : "$", a = Math.abs(n);
    if (a >= 1e9) return pre + (n / 1e9).toFixed(1) + "B";
    if (a >= 1e6) return pre + (n / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return pre + Math.round(n / 1e3) + "K";
    return pre + Math.round(n);
  }
  function shortIv(c) { return SHORT[c] || ivName(c); }
  function dimLabel(dim, key) { if (dim === "intervention_code") return shortIv(key); if (dim === "cost_class") return className(key); if (dim === "adm2") return key.split("|")[1]; return String(key); }
  function targetDef(code) {
    var c = G.catalogByCode(code); if (!c || !c.target) return "Total population";
    if (c.target.mode === "households") return "Households";
    if (c.target.groups) return c.target.groups.map(function (g) { return g.label; }).join(", ");
    return "Total population";
  }

  function avail(b) {
    var rows = b.costRows || [], yrs = {}, ivs = {}, cls = {}, regs = {}, dis = {};
    rows.forEach(function (r) { yrs[r.year] = 1; ivs[r.intervention_code] = 1; cls[r.cost_class] = 1; regs[r.adm1] = 1; dis[r.adm1 + "|" + r.adm2] = 1; });
    return {
      years: Object.keys(yrs).map(Number).sort(function (a, b) { return a - b; }),
      interventions: G.catalog.map(function (c) { return c.code; }).filter(function (c) { return ivs[c]; }),
      costClasses: Object.keys(cls).sort(), regions: Object.keys(regs).sort(), districts: Object.keys(dis).sort()
    };
  }
  function initFilters(b) {
    var a = avail(b);
    f.years = {}; a.years.forEach(function (y) { f.years[y] = true; });
    f.interventions = {}; a.interventions.forEach(function (i) { f.interventions[i] = true; });
    f.costClasses = {}; a.costClasses.forEach(function (c) { f.costClasses[c] = true; });
    f.regions = {}; a.regions.forEach(function (r) { f.regions[r] = true; });
    f.districts = {}; a.districts.forEach(function (d) { f.districts[d] = true; });
    envelope = null; expanded = {};
  }
  function selA(set) { return Object.keys(set).filter(function (k) { return set[k]; }); }
  function allOn(set) { return Object.keys(set).every(function (k) { return set[k]; }); }
  function selYears() { return selA(f.years).map(Number); }
  function filtered(b) { return U.filterRows(b.costRows || [], { years: selYears(), interventions: selA(f.interventions), costClasses: selA(f.costClasses), regions: selA(f.regions), districts: selA(f.districts) }); }
  function filteredLines(b) {
    var yrs = selYears(), ivs = selA(f.interventions), cls = selA(f.costClasses), regs = selA(f.regions), dists = selA(f.districts);
    return (b.costLineRows || b.costRows || []).filter(function (r) {
      var fixed = String(r.year) === "All Years";
      return (fixed || yrs.indexOf(r.year) !== -1 || yrs.indexOf(Number(r.year)) !== -1)
        && ivs.indexOf(r.intervention_code) !== -1
        && cls.indexOf(r.cost_class) !== -1
        && (fixed || regs.indexOf(r.adm1) !== -1)
        && (fixed || dists.indexOf(r.adm1 + "|" + r.adm2) !== -1);
    });
  }
  function filteredNoGeo(b) { return U.filterRows(b.costRows || [], { years: selYears(), interventions: selA(f.interventions), costClasses: selA(f.costClasses) }); }
  function sum(rows, fld) { return rows.reduce(function (a, r) { return a + (r[fld] || 0); }, 0); }
  function popDistrict(k, y, g) { var p = k.split("|"); return G.assumptions.population(p[0], p[1], y, g); }
  function scopeDistricts() { return selA(f.districts).filter(function (k) { return f.regions[k.split("|")[0]]; }); }
  function geoFiltered() { return !allOn(f.regions) || (level === "district" && !allOn(f.districts)); }
  function avgScopePop(b) {
    var g = scnGrowth(b), ys = selYears(); if (!ys.length) return 0;
    var ds = scopeDistricts(), tot = 0;
    ys.forEach(function (y) { ds.forEach(function (k) { tot += popDistrict(k, y, g); }); });
    return tot / ys.length;
  }
  function refresh() { renderBody(); }

  function goGenerate(b) {
    G.focusGenerateCombo = { scenarioId: b.scenarioId, costSetId: b.costSetId };
    G.router.go("generate");
  }
  function statusCallout(b, st) {
    var deleted = st.state === "deleted";
    return el("div", { class: "stale-callout" + (deleted ? " deleted" : "") }, [
      el("div", { class: "stale-title", text: deleted ? "Source deleted" : "Budget out of date" }),
      el("div", { class: "small", text: deleted ? "This generated budget can still be reviewed, but its source scenario or cost set is no longer available." : "This generated budget no longer matches its saved scenario or cost set. Regenerate it before using these outputs for decisions." }),
      deleted ? null : el("button", { class: "linkbtn", style: "margin-top:6px", onClick: function () { goGenerate(b); } }, ["Go to Budget generation"])
    ]);
  }

  // ---- controls ----
  function selBox(options, value, on) {
    var s = document.createElement("select");
    options.forEach(function (o) { var op = document.createElement("option"); op.value = o.value; op.textContent = o.label; if (o.value === value) op.selected = true; s.appendChild(op); });
    s.addEventListener("change", function () { on(s.value); }); return s;
  }
  function seg(options, val, on) { return el("div", { class: "seg" }, options.map(function (o) { return el("span", { class: "seg-opt" + (o.value === val ? " on" : ""), role: "button", tabindex: "0", onClick: function () { on(o.value); } }, [o.label]); })); }
  // Compact multi-select dropdown (native <details>; open state survives re-render).
  function multiSelect(id, title, values, set, labelFn) {
    var det = document.createElement("details"); det.className = "ms"; det.open = !!openFilter[id];
    det.addEventListener("toggle", function () { openFilter[id] = det.open; });
    var sum = document.createElement("summary"); sum.className = "ms-sum";
    sum.textContent = title + " · " + (allOn(set) ? "All" : selA(set).length + "/" + values.length);
    det.appendChild(sum);
    var panel = el("div", { class: "ms-panel" });
    panel.appendChild(el("div", { class: "ms-actions" }, [
      el("button", { class: "linkbtn", onClick: function () { values.forEach(function (v) { set[v] = true; }); refresh(); } }, ["All"]),
      el("button", { class: "linkbtn", onClick: function () { values.forEach(function (v) { set[v] = false; }); refresh(); } }, ["None"])
    ]));
    values.forEach(function (v) {
      var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!set[v];
      cb.addEventListener("change", function () { set[v] = cb.checked; refresh(); });
      panel.appendChild(el("label", { class: "ms-opt" }, [cb, " " + (labelFn ? labelFn(v) : String(v))]));
    });
    det.appendChild(panel);
    return det;
  }
  function dlPng(getSvg, file) { return G.ui.downloadButton(getSvg, file, "PNG"); }
  function plotActions(download, expand) { return el("span", { class: "plot-actions" }, [download, expand]); }

  // ---- entry ----
  function render(root) {
    rootEl = root;
    var bs = budgets();
    if (!bs.length) { root.innerHTML = ""; root.appendChild(GMB.ui.placeholder("Phase 5", "Budget visualisation", "No budgets yet. Generate one on the Budget generation tab, then explore it here.")); return; }
    var focus = G.focusBudgetId;
    if (focus && byId(focus)) selId = focus;
    if (!selId || !byId(selId)) selId = bs[bs.length - 1].id;
    G.focusBudgetId = null;
    if (selId !== lastInitId) { initFilters(byId(selId)); lastInitId = selId; }
    renderBody();
  }

  function renderBody() {
    rootEl.innerHTML = "";
    rootEl.appendChild(GMB.ui.pageHelp("viz"));
    var b = byId(selId); if (!b) { lastInitId = null; render(rootEl); return; }
    var main = el("div", { class: "viz-main" });
    var st = G.budgetStatus ? G.budgetStatus(b) : { state: "current" };
    if (st.state !== "current") main.appendChild(statusCallout(b, st));
    main.appendChild(renderTop(b));
    main.appendChild(renderTables(b));
    main.appendChild(renderCharts(b));
    main.appendChild(renderMaps(b));
    rootEl.appendChild(el("div", { class: "viz-layout" }, [renderSidebar(b), main]));
  }

  // ---- sidebar ----
  function renderSidebar(b) {
    var a = avail(b), side = el("aside", { class: "scn-summary viz-side" });
    side.appendChild(el("div", { class: "scn-h" }, [el("span", { class: "scn-step", text: "4" }), "Budget visualisation"]));
    side.appendChild(el("div", { class: "field" }, [el("label", { text: "Budget" }),
      selBox(budgets().slice().reverse().map(function (x) { return { value: x.id, label: x.name }; }), selId, function (v) { selId = v; initFilters(byId(v)); lastInitId = v; refresh(); })]));
    side.appendChild(el("p", { class: "muted small", text: b.scenarioName + " · " + b.costSetName }));
    if (b.description) side.appendChild(el("p", { class: "small", style: "font-style:italic", text: b.description }));
    var st = G.budgetStatus ? G.budgetStatus(b) : { state: "current" };
    if (st.state !== "current") side.appendChild(statusCallout(b, st));
    if (b.notes && b.notes.length) { var n = el("div", { class: "checks has" }); b.notes.forEach(function (m) { n.appendChild(el("div", { class: "small", text: "⚠ " + m })); }); side.appendChild(n); }

    side.appendChild(el("div", { class: "filt-group" }, [el("span", { class: "filt-title", text: "Currency" }), seg([{ value: "USD", label: "USD" }, { value: "GMD", label: "GMD" }], currency, function (v) { currency = v; refresh(); })]));
    side.appendChild(el("div", { class: "filt-group" }, [el("span", { class: "filt-title", text: "Summary level" }), seg([{ value: "national", label: "National" }, { value: "region", label: "Region" }, { value: "district", label: "District" }], level, function (v) { level = v; refresh(); })]));
    side.appendChild(multiSelect("years", "Years", a.years, f.years, String));
    side.appendChild(multiSelect("iv", "Interventions", a.interventions, f.interventions, ivName));
    side.appendChild(multiSelect("cls", "Cost categories", a.costClasses, f.costClasses, className));
    if (level !== "national") side.appendChild(multiSelect("reg", "Regions", a.regions, f.regions, null));
    if (level === "district") {
      var vis = a.districts.filter(function (d) { return f.regions[d.split("|")[0]]; });
      if (vis.length) side.appendChild(multiSelect("dist", "Districts", vis, f.districts, function (d) { return d.split("|")[1]; }));
    }
    side.appendChild(el("button", { class: "btn secondary", style: "margin-top:6px", onClick: function () { initFilters(b); level = "national"; currency = "USD"; refresh(); } }, ["Reset filters"]));
    side.appendChild(el("p", { class: "muted small", style: "margin-top:8px", text: "Deselect interventions to see the budget without them — totals drop by exactly their cost." }));
    return side;
  }

  // ---- top row ----
  function renderTop(b) {
    return el("div", { class: "viz-top" }, [renderMixMap(b), renderValueCards(b)]);
  }

  function renderMixMap(b) {
    var rows = filteredNoGeo(b), vf = valField();
    var pkg = {}; // districtKey -> { set }
    rows.forEach(function (r) { var k = r.adm1 + "|" + r.adm2; (pkg[k] = pkg[k] || {})[r.intervention_code] = true; });
    function inScope(k) { return f.regions[k.split("|")[0]] && f.districts[k]; }
    function comboKey(k) { var s = pkg[k]; if (!s) return ""; return G.catalog.map(function (c) { return c.code; }).filter(function (c) { return s[c]; }).join(","); }
    var counts = {}; G.reference.districtPairs().forEach(function (d) { var k = d.adm1 + "|" + d.adm2; if (inScope(k)) { var ck = comboKey(k); if (ck) counts[ck] = (counts[ck] || 0) + 1; } });
    var combos = Object.keys(counts).sort(function (x, y) { return counts[y] - counts[x]; });
    var color = {}; combos.forEach(function (ck, i) { color[ck] = C.mixColor(i); });
    function comboLabel(ck) { return ck.split(",").map(function (c) { return shortIv(c); }).join(" + ") || "—"; }

    var map = G.ui.gambiaMap({});
    map.setColors(function (k) { if (!inScope(k)) return "#eef0f4"; var ck = comboKey(k); return ck ? color[ck] : "#dfe5ee"; });
    map.setTitles(function (k, props) { return props.adm2 + " (" + props.adm1 + "): " + (inScope(k) ? comboLabel(comboKey(k)) : "filtered out"); });
    var gf = geoFiltered(); map.setOutline(function (k) { return gf && inScope(k); });
    if (combos.length) C.attachMapLegend(map.el, { kind: "swatch", items: combos.map(function (ck) { return { label: comboLabel(ck) + " (" + counts[ck] + ")", color: color[ck] }; }) });

    return card("Intervention mix", null, el("div", { class: "map-wrap" }, [map.el]), dlPng(function () { return map.el; }, "intervention-mix.png"), G.ui.expandPlot("Intervention mix", function () { return map.el.cloneNode(true); }));
  }

  function renderValueCards(b) {
    var rows = filtered(b), total = sum(rows, valField());
    var full = currency === "GMD" ? b.aggregates.total_local : b.aggregates.total_usd;
    var delta = total - full, pop = avgScopePop(b);
    var col = el("div", { class: "value-col" });

    var totBox = el("div", { class: "value-card" }, [el("div", { class: "vc-title", text: "Total budget (" + currency + ")" }), el("div", { class: "vc-num", text: money(total) })]);
    if (Math.abs(delta) >= 1) totBox.appendChild(el("div", { class: "vc-sub", style: "color:var(--red)", text: (delta < 0 ? "−" : "+") + moneyShort(Math.abs(delta)) + " vs full budget" }));
    else totBox.appendChild(el("div", { class: "vc-sub", text: "All interventions included" }));
    col.appendChild(totBox);

    col.appendChild(el("div", { class: "value-card" }, [el("div", { class: "vc-title", text: "Cost per person (" + currency + ")" }), el("div", { class: "vc-num", text: pop ? money(total / pop) : "—" }), el("div", { class: "vc-sub", text: "Avg population across selected years: " + U.fmtNum(pop) })]));

    // budget envelope
    var input = document.createElement("input"); input.type = "number"; input.min = "0"; input.placeholder = "Enter envelope in " + currency; input.style.width = "100%";
    if (envelope != null) input.value = envelope;
    input.addEventListener("input", function () { envelope = input.value === "" ? null : Number(input.value); updateEnvelope(); });
    var status = el("div", { class: "vc-sub", id: "env-status" });
    var bar = el("div", { class: "env-bar" }, [el("div", { class: "env-fill" })]);
    var envBox = el("div", { class: "value-card" }, [el("div", { class: "vc-title", text: "Budget envelope (" + currency + ")" }), el("div", { class: "field", style: "margin:6px 0" }, [input]), bar, status]);
    col.appendChild(envBox);
    function updateEnvelope() {
      var fill = bar.querySelector(".env-fill");
      if (envelope == null || !(envelope > 0)) { status.textContent = "Set an available budget to compare with the selected total."; status.style.color = ""; fill.style.width = "0%"; return; }
      var pctUsed = Math.min(100, total / envelope * 100); fill.style.width = pctUsed.toFixed(0) + "%";
      var rem = envelope - total;
      if (rem >= 0) { status.textContent = "Remaining: " + money(rem) + " (" + Math.round(pctUsed) + "% used)"; status.style.color = "var(--green)"; fill.style.background = "var(--green)"; }
      else { status.textContent = "Over budget by " + money(-rem); status.style.color = "var(--red)"; fill.style.background = "var(--red)"; }
    }
    updateEnvelope();
    return col;
  }

  // ---- generic card ----
  function card(title, tabsEl, bodyEl, actionEl, expandEl) {
    var titlerow = el("div", { class: "card-titlerow" }, [el("span", { class: "card-title", text: title }), actionEl ? el("span", { class: "card-action" }, [actionEl]) : null]);
    var head = el("div", { class: "card-head" }, [titlerow]);
    if (tabsEl) head.appendChild(tabsEl);
    return el("div", { class: "card" }, [head, el("div", { class: "card-body" }, [bodyEl, expandEl])]);
  }
  function cardTabs(options, val, on) { return el("div", { class: "card-tabs" }, options.map(function (o) { return el("button", { class: "card-tab" + (o.value === val ? " on" : ""), onClick: function () { on(o.value); } }, [o.label]); })); }

  // ---- tables ----
  function renderTables(b) {
    var tabs = cardTabs([{ value: "costs", label: "Intervention costs" }, { value: "lines", label: "Cost lines" }, { value: "quantities", label: "Quantities" }], tableTab, function (v) { tableTab = v; refresh(); });
    var built = tableTab === "costs" ? tableCosts(b) : tableTab === "lines" ? tableCostLines(b) : tableQuantities(b);
    var dl = el("button", { class: "linkbtn dl-btn", onClick: function () {
      var qrows = U.filterRows(b.quantityRows || [], { years: selYears(), interventions: selA(f.interventions), regions: selA(f.regions), districts: selA(f.districts) });
      GMB.xlsx.download(b.name || "budget", GMB.budgetSheets(b, { rows: filtered(b), lineRows: filteredLines(b), quantityRows: qrows, filters: filterSummary(b), topN: topN, currency: currency }));
    } }, ["⬇ Export to Excel (full budget)"]);
    return card("Cost tables", tabs, el("div", { class: "table-scroll" }, [built.el]), dl);
  }

  function tableCosts(b) {
    var rows = filtered(b), vf = valField(), years = selYears().sort(function (a, b) { return a - b; });
    var data = {};
    rows.forEach(function (r) {
      var d = data[r.intervention_code] || (data[r.intervention_code] = { tot: 0, yr: {}, cls: {} });
      var v = r[vf] || 0; d.tot += v; d.yr[r.year] = (d.yr[r.year] || 0) + v;
      var c = d.cls[r.cost_class] || (d.cls[r.cost_class] = { tot: 0, yr: {} }); c.tot += v; c.yr[r.year] = (c.yr[r.year] || 0) + v;
    });
    var ivs = Object.keys(data).sort(function (a, b) { return data[b].tot - data[a].tot; });
    var headers = ["Intervention"].concat(years.map(function (y) { return y + " Cost (" + currency + ")"; })).concat(["Total Cost (" + currency + ")"]);
    var t = el("table", { class: "gen-table data-table cost-table" }, [el("tr", {}, [el("th", { text: "" }), el("th", { text: "Intervention" })].concat(years.map(function (y) { return el("th", { class: "num", text: y + " Cost" }); })).concat([el("th", { class: "num", text: "Total" })]))]);
    var grand = { yr: {}, tot: 0 };
    ivs.forEach(function (code) {
      var d = data[code], clss = Object.keys(d.cls).sort(function (a, b) { return d.cls[b].tot - d.cls[a].tot; });
      grand.tot += d.tot; years.forEach(function (y) { grand.yr[y] = (grand.yr[y] || 0) + (d.yr[y] || 0); });
      var toggle = el("td", { class: "exp-cell" }, [clss.length ? el("span", { class: "exp-tog", role: "button", text: expanded[code] ? "−" : "+", onClick: function () { expanded[code] = !expanded[code]; refresh(); } }) : null]);
      t.appendChild(el("tr", { class: "iv-row" }, [toggle, el("td", { text: ivName(code) })].concat(years.map(function (y) { return el("td", { class: "num", text: money(d.yr[y] || 0) }); })).concat([el("td", { class: "num", text: money(d.tot) })])));
      if (expanded[code]) clss.forEach(function (cl) {
        var c = d.cls[cl];
        t.appendChild(el("tr", { class: "sub-row" }, [el("td", {}), el("td", { class: "sub-name", text: className(cl) })].concat(years.map(function (y) { return el("td", { class: "num", text: money(c.yr[y] || 0) }); })).concat([el("td", { class: "num", text: money(c.tot) })])));
      });
    });
    t.appendChild(el("tr", { class: "total-row" }, [el("td", {}), el("td", { text: "TOTAL" })].concat(years.map(function (y) { return el("td", { class: "num", text: money(grand.yr[y] || 0) }); })).concat([el("td", { class: "num", text: money(grand.tot) })])));
    var csv = ivs.map(function (code) { var d = data[code]; return [ivName(code)].concat(years.map(function (y) { return Math.round(d.yr[y] || 0); })).concat([Math.round(d.tot)]); });
    var totalRow = ["TOTAL"].concat(years.map(function (y) { return Math.round(grand.yr[y] || 0); })).concat([Math.round(grand.tot)]);
    return { el: t, headers: headers, rows: csv, totalRow: totalRow, title: "Cost by intervention and year", file: "intervention-costs.csv" };
  }

  function tableCostLines(b) {
    var rows = filteredLines(b).slice().sort(function (a, c) {
      return String(a.intervention_code).localeCompare(String(c.intervention_code)) || String(a.year).localeCompare(String(c.year)) || (c.cost_usd || 0) - (a.cost_usd || 0);
    });
    var vf = valField();
    var t = el("table", { class: "gen-table data-table" }, [el("tr", {}, [
      el("th", { text: "Intervention" }), el("th", { text: "Type" }), el("th", { text: "Cost line" }),
      el("th", { text: "Unit" }), el("th", { class: "num", text: "Quantity used" }), el("th", { class: "num", text: "Unit cost" }),
      el("th", { text: "Category" }), el("th", { class: "num", text: "Cost" })
    ])]);
    rows.forEach(function (r) {
      t.appendChild(el("tr", {}, [
        el("td", { text: ivName(r.intervention_code) }),
        el("td", { text: r.type || "" }),
        el("td", { text: r.description || "" }),
        el("td", { text: r.unit || "" }),
        el("td", { class: "num", text: U.fmtNum(r.quantity_for_cost || r.quantity || 0) }),
        el("td", { class: "num", text: "$" + Math.round((r.unit_cost_usd || 0) * 100) / 100 }),
        el("td", { text: className(r.cost_class) }),
        el("td", { class: "num", text: money(r[vf] || 0) })
      ]));
    });
    return { el: t, headers: [], rows: [], totalRow: null, title: "Detailed cost lines", file: "cost-lines.csv" };
  }

  function tableQuantities(b) {
    var qrows = U.filterRows(b.quantityRows || [], { years: selYears(), interventions: selA(f.interventions), regions: selA(f.regions), districts: selA(f.districts) });
    var years = selYears().sort(function (a, b) { return a - b; });
    var map = {}, order = [];
    qrows.forEach(function (r) {
      var k = r.intervention_code + "|" + r.commodity;
      if (!map[k]) { map[k] = { iv: r.intervention_code, commodity: r.commodity, def: targetDef(r.intervention_code), pop: {}, qty: {}, qtot: 0 }; order.push(k); }
      var m = map[k]; m.qty[r.year] = (m.qty[r.year] || 0) + (r.quantity || 0); m.qtot += r.quantity || 0; m.pop[r.year] = (m.pop[r.year] || 0) + (r.target_pop || 0);
    });
    var items = order.map(function (k) { return map[k]; }).sort(function (a, b) { return b.qtot - a.qtot; });
    var headEls = [el("th", { text: "Intervention" }), el("th", { text: "Commodity" }), el("th", { text: "Target population" })]
      .concat(years.map(function (y) { return el("th", { class: "num", text: y + " Pop targeted" }); }))
      .concat(years.map(function (y) { return el("th", { class: "num", text: y + " Quantity" }); }))
      .concat([el("th", { class: "num", text: "All years quantity" })]);
    var t = el("table", { class: "gen-table data-table" }, [el("tr", {}, headEls)]);
    items.forEach(function (m) {
      t.appendChild(el("tr", {}, [el("td", { text: ivName(m.iv) }), el("td", { text: m.commodity }), el("td", { class: "small", text: m.def })]
        .concat(years.map(function (y) { return el("td", { class: "num", text: U.fmtNum(m.pop[y] || 0) }); }))
        .concat(years.map(function (y) { return el("td", { class: "num", text: U.fmtNum(m.qty[y] || 0) }); }))
        .concat([el("td", { class: "num", text: U.fmtNum(m.qtot) })])));
    });
    var headers = ["Intervention", "Commodity", "Target population"].concat(years.map(function (y) { return y + " Pop targeted"; })).concat(years.map(function (y) { return y + " Quantity"; })).concat(["All years quantity"]);
    var csv = items.map(function (m) { return [ivName(m.iv), m.commodity, m.def].concat(years.map(function (y) { return Math.round(m.pop[y] || 0); })).concat(years.map(function (y) { return Math.round(m.qty[y] || 0); })).concat([Math.round(m.qtot)]); });
    return { el: t, headers: headers, rows: csv, totalRow: null, title: "Commodity quantities", file: "quantities.csv" };
  }

  // ---- chart cards ----
  function renderCharts(b) {
    var rows = filtered(b), lines = filteredLines(b), vf = valField();
    return el("div", { class: "cards-row" }, [chartShare(rows, vf), chartByYear(rows, vf), chartDiagnostics(rows, lines, vf)]);
  }

  function donutFor(rows, dim, vf, exp) {
    var piv = U.pivot(rows, dim, null, vf).groups.sort(function (x, y) { return y.total - x.total; });
    var items = piv.map(function (gr, i) { return { label: dimLabel(dim, gr.key), value: gr.total, color: C.colorFor(dim, gr.key, i) }; });
    return C.donut({ items: items, fmtFull: money, centerLabel: moneyShort(items.reduce(function (a, c) { return a + c.value; }, 0)), export: exp });
  }
  function chartShare(rows, vf) {
    var tabs = cardTabs([{ value: "iv", label: "Intervention share" }, { value: "class", label: "Cost class share" }], cardA, function (v) { cardA = v; refresh(); });
    var dim = cardA === "iv" ? "intervention_code" : "cost_class";
    function build(exp) { return donutFor(rows, dim, vf, exp); }
    return card("Intervention cost share", tabs, build(false), dlPng(function () { return build(true); }, "cost-share.png"), G.ui.expandPlot("Intervention cost share", build));
  }

  function stackedFromPivot(rows, groupDim, splitDim, vf, mode, exp) {
    var piv = U.pivot(rows, groupDim, splitDim, vf), groups = piv.groups.slice();
    if (groupDim === "year") groups.sort(function (x, y) { return Number(x.key) - Number(y.key); }); else groups.sort(function (x, y) { return y.total - x.total; });
    var cats = groups.map(function (gr) { return dimLabel(groupDim, gr.key); });
    var series = piv.splitKeys.map(function (sk, i) { return { label: dimLabel(splitDim, sk), color: C.colorFor(splitDim, sk, i), values: groups.map(function (gr) { return gr.parts[sk] || 0; }) }; });
    return C.bars({ cats: cats, series: series, mode: mode, fmtFull: money, fmtShort: moneyShort, legend: series.map(function (s) { return { label: s.label, color: s.color }; }), export: exp });
  }
  function topElements(rows, vf, exp) {
    function shortCostDescription(s) {
      var t = String(s || "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
      t = t.replace(/^Insecticide\s*[–-]\s*/i, "").replace(/^SPAQ\s+co-blister\s*[–-]\s*/i, "SPAQ ");
      return t || "Cost line";
    }
    var seenClasses = {}, legend = [];
    var lineItems = G.topCostElements(rows, { currency: currency, limit: topN }).map(function (it) {
      var detailParts = [it.detail];
      if (it.quantity_for_cost != null && isFinite(+it.quantity_for_cost)) detailParts.push("quantity used " + U.fmtNum(it.quantity_for_cost));
      if (it.unit_cost_usd != null && isFinite(+it.unit_cost_usd)) detailParts.push("unit cost $" + (Math.round(+it.unit_cost_usd * 100) / 100));
      if (!it.has_line_detail || it.quantity_for_cost == null || it.unit_cost_usd == null) detailParts.push("line-level quantity/unit-cost detail unavailable; regenerate this budget to refresh detailed cost lines");
      if (!seenClasses[it.cost_class]) {
        seenClasses[it.cost_class] = true;
        legend.push({ label: className(it.cost_class), color: C.colorFor("cost_class", it.cost_class) });
      }
      return { label: shortIv(it.intervention_code) + " - " + shortCostDescription(it.description || it.cost_category), value: it.value, color: C.colorFor("cost_class", it.cost_class), detail: detailParts.join(" | ") };
    });
    return C.lollipop({ items: lineItems, legend: legend, fmtFull: money, fmtShort: moneyShort, export: exp });
    var agg = {}; rows.forEach(function (r) { var k = r.intervention_code + "|" + r.cost_class; agg[k] = (agg[k] || 0) + (r[vf] || 0); });
    var items = Object.keys(agg).map(function (k) { var p = k.split("|"); return { label: ivName(p[0]) + " — " + className(p[1]), value: agg[k], color: C.colorFor("cost_class", p[1]) }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 12);
    return C.hbars({ items: items, fmtFull: money, fmtShort: moneyShort, export: exp });
  }
  function chartByYear(rows, vf) {
    var tabs = cardTabs([{ value: "year", label: "Yearly breakdown" }, { value: "all", label: "All years total" }], cardB, function (v) { cardB = v; refresh(); });
    function build(exp) {
      if (cardB === "year") return stackedFromPivot(rows, "year", "intervention_code", vf, "stacked", exp);
      var piv = U.pivot(rows, "intervention_code", null, vf).groups.sort(function (x, y) { return y.total - x.total; });
      return C.hbars({ items: piv.map(function (gr, i) { return { label: shortIv(gr.key), value: gr.total, color: C.colorFor("intervention_code", gr.key, i) }; }), fmtFull: money, fmtShort: moneyShort, export: exp });
    }
    return card("Cost by year and intervention", tabs, build(false), dlPng(function () { return build(true); }, "cost-by-year.png"), G.ui.expandPlot("Cost by year and intervention", build));
  }

  function chartDiagnostics(rows, lines, vf) {
    var tabs = cardTabs([{ value: "breakdown", label: "Cost class breakdown" }, { value: "prop", label: "Proportions" }, { value: "top", label: "Top cost elements" }], cardC, function (v) { cardC = v; refresh(); });
    var topSel = selBox([5, 10, 15, 20, 30].map(function (n) { return { value: String(n), label: String(n) }; }), String(topN), function (v) { topN = Number(v); refresh(); });
    var controls = cardC === "top" ? el("div", { class: "plot-controls" }, [tabs, el("label", { class: "topn-ctl" }, ["Show", topSel])]) : tabs;
    function build(exp) {
      if (cardC === "breakdown") return stackedFromPivot(rows, "intervention_code", "cost_class", vf, "stacked", exp);
      if (cardC === "prop") return stackedFromPivot(rows, "intervention_code", "cost_class", vf, "stacked100", exp);
      return topElements(lines, vf, exp);
    }
    return card("Intervention cost diagnostics", controls, build(false), dlPng(function () { return build(true); }, "cost-diagnostics.png"), G.ui.expandPlot("Intervention cost diagnostics", build));
  }

  // ---- maps ----
  function renderMaps(b) {
    return el("div", {}, [
      el("h2", { text: "Cost by geography" }),
      el("div", { class: "maps-grid" }, [
        costMap(b, "region", "total", "Region — total cost"),
        costMap(b, "region", "perperson", "Region — cost per person"),
        costMap(b, "district", "total", "District — total cost"),
        costMap(b, "district", "perperson", "District — cost per person")
      ])
    ]);
  }

  function costMap(b, lvl, metric, titleText) {
    var rows = filteredNoGeo(b), vf = valField(), g = scnGrowth(b), ys = selYears();
    var distCost = {}; rows.forEach(function (r) { var k = r.adm1 + "|" + r.adm2; distCost[k] = (distCost[k] || 0) + (r[vf] || 0); });
    var regCost = {}; Object.keys(distCost).forEach(function (k) { var a1 = k.split("|")[0]; regCost[a1] = (regCost[a1] || 0) + distCost[k]; });
    function inScope(k) { return f.regions[k.split("|")[0]] && f.districts[k]; }
    function avgPop(k) { if (!ys.length) return 0; var t = 0; ys.forEach(function (y) { t += popDistrict(k, y, g); }); return t / ys.length; }
    var regPop = {};
    function regAvgPop(a1) { if (regPop[a1] == null) { regPop[a1] = 0; G.reference.districts(a1).forEach(function (d2) { regPop[a1] += avgPop(a1 + "|" + d2); }); } return regPop[a1]; }
    function areaVal(k) {
      var a1 = k.split("|")[0];
      if (lvl === "region") return metric === "perperson" ? (regAvgPop(a1) ? regCost[a1] / regAvgPop(a1) : 0) : (regCost[a1] || 0);
      return metric === "perperson" ? (avgPop(k) ? distCost[k] / avgPop(k) : 0) : (distCost[k] || 0);
    }
    var vals = G.reference.districtPairs().map(function (d) { return d.adm1 + "|" + d.adm2; }).filter(inScope).map(areaVal);
    var min = vals.length ? Math.min.apply(null, vals) : 0, max = vals.length ? Math.max.apply(null, vals) : 1;
    function colorOf(k) { if (!inScope(k)) return "#eef0f4"; return C.rampYlOrRd(max > min ? (areaVal(k) - min) / (max - min) : 0.5); }
    var map = G.ui.gambiaMap({});
    map.setColors(colorOf);
    map.setTitles(function (k, props) { var lab = lvl === "region" ? props.adm1 : props.adm2 + " (" + props.adm1 + ")"; var v = areaVal(k); return lab + ": " + (metric === "perperson" ? money(v) + " / person" : money(v)) + (inScope(k) ? "" : " (filtered out)"); });
    if (lvl === "region") map.setStroke(colorOf);   // region-only view: hide internal district borders
    else { var gf = geoFiltered(); map.setOutline(function (k) { return gf && inScope(k); }); }
    C.attachMapLegend(map.el, { kind: "gradient", min: min, max: max, fmt: moneyShort, label: (metric === "perperson" ? "Cost per person" : "Total cost") });

    return el("div", { class: "map-card" }, [
      el("div", { class: "card-head" }, [el("div", { class: "card-titlerow" }, [el("span", { class: "card-title", text: titleText }), el("span", { class: "card-action" }, [dlPng(function () { return map.el; }, "map-" + lvl + "-" + metric + ".png")])])]),
      el("div", { class: "map-wrap" }, [map.el, G.ui.expandPlot(titleText, function () { return map.el.cloneNode(true); })])
    ]);
  }

  // ---- CSV ----
  function filterSummary(b) {
    var parts = [];
    if (!allOn(f.years)) parts.push("Years: " + selA(f.years).join(", "));
    if (!allOn(f.interventions)) parts.push("Interventions: " + selA(f.interventions).map(ivName).join(", "));
    if (!allOn(f.costClasses)) parts.push("Cost categories: " + selA(f.costClasses).map(className).join(", "));
    if (!allOn(f.regions)) parts.push("Regions: " + selA(f.regions).join(", "));
    return parts.length ? parts.join("; ") : "All data (no filters applied)";
  }
  function csvWith(b, title, headers, rows, totalRow) {
    var meta = [["The Gambia Malaria Budgeting Tool"], [title], ["Budget", b.name || ""], ["Scenario", b.scenarioName || ""], ["Cost set", b.costSetName || ""], ["Currency", currency], ["Summary level", level], ["Filters applied", filterSummary(b)], ["Generated", (b.generatedAt || "").slice(0, 10)], []];
    var body = rows.slice(); if (totalRow) body.push(totalRow);
    return U.toCsv([], meta) + "\r\n" + U.toCsv(headers, body);
  }

  G.tabs.viz = { render: render };
})(GMB);
