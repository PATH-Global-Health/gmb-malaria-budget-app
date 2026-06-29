/* Data viewer — population (with projected growth) and malaria incidence.
   Rendered inside the Methods tab via GMB.dataViewer.render(container, which).
   Read-only; uses GMB.reference + GMB.assumptions + the chart/map helpers. */
window.GMB = window.GMB || {};

(function (G) {
  var el = G.ui.el, C = G.charts, U = G.util, ref = G.reference, A = G.assumptions;
  var level = "national", selRegion = null, selDistrict = null;
  var growth = A.defaultGrowth, endYear = 2030, incYear = null, hhYear = null;
  var host = null, contentEl = null, which = "population";

  function regions() { return ref.regions(); }
  function districtsOf(r) { return ref.districts(r); }
  function pairs() { return ref.districtPairs(); }
  function incYears() { return Array.from(new Set((G.data.incidence || []).map(function (r) { return r.year; }))).sort(function (a, b) { return a - b; }); }
  function fmtN(n) { return U.fmtNum(n); }
  function shortN(n) { var a = Math.abs(n); if (a >= 1e6) return (n / 1e6).toFixed(1) + "M"; if (a >= 1e3) return Math.round(n / 1e3) + "K"; return String(Math.round(n)); }
  function stratum(v) { return v == null ? "—" : v < 10 ? "Low" : v < 30 ? "Medium" : "High"; }

  function popAt(year) {
    if (level === "national") { var t = 0; pairs().forEach(function (d) { t += A.population(d.adm1, d.adm2, year, growth); }); return t; }
    if (level === "region" && selRegion) { var s = 0; districtsOf(selRegion).forEach(function (d2) { s += A.population(selRegion, d2, year, growth); }); return s; }
    if (level === "district" && selRegion && selDistrict) return A.population(selRegion, selDistrict, year, growth);
    return 0;
  }
  function popData() { var ys = [], i; for (i = 2017; i <= endYear; i++) ys.push(i); var split = ys.indexOf(2026); if (split < 0) split = ys.length; return { years: ys, values: ys.map(popAt), splitIndex: split }; }
  function regionPop(adm1, year) { var t = 0; districtsOf(adm1).forEach(function (d2) { t += ref.population(adm1, d2, year); }); return t; }
  function scopeName() { return level === "national" ? "The Gambia — national" : level === "region" ? (selRegion || "—") : (selDistrict ? selDistrict + " (" + selRegion + ")" : "—"); }

  function seg(options, val, on) { return el("div", { class: "seg" }, options.map(function (o) { return el("span", { class: "seg-opt" + (o.value === val ? " on" : ""), role: "button", tabindex: "0", onClick: function () { on(o.value); } }, [o.label]); })); }
  function selBox(options, value, on) { var s = document.createElement("select"); options.forEach(function (o) { var op = document.createElement("option"); op.value = o.value; op.textContent = o.label; if (o.value === value) op.selected = true; s.appendChild(op); }); s.addEventListener("change", function () { on(s.value); }); return s; }
  function dlPng(getSvg, file) { return G.ui.downloadButton(getSvg, file, "PNG"); }
  function ctl(label, control) { return el("div", { class: "data-ctl" }, [el("label", { text: label }), control]); }

  function controls() {
    var bar = el("div", { class: "data-controls" });
    if (which === "population") {
      bar.appendChild(ctl("Level", seg([{ value: "national", label: "National" }, { value: "region", label: "Region" }, { value: "district", label: "District" }], level, function (v) { level = v; if (v !== "national" && !selRegion) selRegion = regions()[0]; if (v === "district" && !selDistrict) selDistrict = districtsOf(selRegion)[0]; renderAll(); })));
      if (level !== "national") bar.appendChild(ctl("Region", selBox(regions().map(function (r) { return { value: r, label: r }; }), selRegion || regions()[0], function (v) { selRegion = v; selDistrict = districtsOf(v)[0]; renderAll(); })));
      if (level === "district") bar.appendChild(ctl("District", selBox(districtsOf(selRegion || regions()[0]).map(function (d) { return { value: d, label: d }; }), selDistrict, function (v) { selDistrict = v; renderAll(); })));
      var gi = document.createElement("input"); gi.type = "number"; gi.step = "0.1"; gi.min = "0"; gi.value = (growth * 100).toFixed(1); gi.style.width = "80px";
      gi.addEventListener("input", function () { var n = parseFloat(gi.value); growth = isNaN(n) ? 0 : n / 100; renderContent(); });
      bar.appendChild(ctl("Growth %/yr", gi));
      var yi = document.createElement("input"); yi.type = "number"; yi.min = "2026"; yi.max = "2040"; yi.value = endYear; yi.style.width = "80px";
      yi.addEventListener("input", function () { var n = parseInt(yi.value, 10); if (n >= 2026 && n <= 2040) { endYear = n; renderContent(); } });
      bar.appendChild(ctl("Project to", yi));
    } else if (which === "households") {
      bar.appendChild(ctl("Year", selBox(ref.years().map(function (y) { return { value: String(y), label: String(y) }; }), String(hhYear), function (v) { hhYear = +v; renderAll(); })));
    } else {
      bar.appendChild(ctl("Year", selBox(incYears().map(function (y) { return { value: String(y), label: String(y) }; }), String(incYear), function (v) { incYear = +v; renderAll(); })));
    }
    return bar;
  }

  function stat(v, l) { return el("div", { class: "stat" }, [el("div", { class: "value", text: v }), el("div", { class: "label", text: l })]); }
  function card(title, body, action, expand) {
    var head = el("div", { class: "card-head" }, [el("div", { class: "card-titlerow" }, [el("span", { class: "card-title", text: title }), action ? el("span", { class: "card-action" }, [action]) : null])]);
    return el("div", { class: "card" }, [head, el("div", { class: "card-body" }, [body, expand])]);
  }

  // ---- population ----
  function renderPopulation() {
    var frag = document.createDocumentFragment();
    var d = popData(), pop2025 = popAt(2025), popEnd = popAt(endYear), pct = pop2025 ? Math.round((popEnd / pop2025 - 1) * 100) : 0;
    frag.appendChild(el("div", { class: "panel" }, [el("div", { class: "scn-h", text: "Population — " + scopeName() }),
      el("div", { class: "stat-grid" }, [stat(fmtN(pop2025), "Population in 2025 (observed)"), stat(fmtN(popEnd), "Projected in " + endYear), stat((pct >= 0 ? "+" : "") + pct + "%", "Change 2025 → " + endYear), stat((growth * 100).toFixed(1) + "%", "Growth rate / year")])]));
    function chart(exp) { return C.line({ years: d.years, series: [{ label: "Population", color: "#0c1c8c", values: d.values }], splitIndex: d.splitIndex, fmtFull: fmtN, fmtShort: shortN, export: exp }); }
    frag.appendChild(card("Population over time", el("div", { class: "line-cap" }, [chart(false)]), dlPng(function () { return chart(true); }, "population-trend.png"), G.ui.expandPlot("Population over time", chart)));
    var headers = ["Year", "Population", "Status"];
    var t = el("table", { class: "data-table" }, [el("tr", {}, [el("th", { text: "Year" }), el("th", { class: "num", text: "Population" }), el("th", { text: "Status" })])]);
    d.years.forEach(function (y, i) { t.appendChild(el("tr", {}, [el("td", { text: String(y) }), el("td", { class: "num", text: fmtN(d.values[i]) }), el("td", { class: "muted small", text: y <= 2025 ? "observed" : "projected" })])); });
    var dl = el("button", { class: "linkbtn dl-btn", onClick: function () {
      var rows = d.years.map(function (y, i) { return [y, Math.round(d.values[i]), y <= 2025 ? "observed" : "projected"]; });
      G.util.downloadText("population.csv", U.toCsv([], [["The Gambia Malaria Budgeting Tool"], ["Population — " + scopeName()], ["Growth rate", (growth * 100).toFixed(1) + "% per year"], []]) + "\r\n" + U.toCsv(headers, rows), "text/csv");
    } }, ["Download CSV"]);
    frag.appendChild(card("Year-by-year", el("div", { class: "table-scroll" }, [t]), dl));
    return frag;
  }

  // ---- incidence ----
  function renderIncidence() {
    var frag = document.createDocumentFragment();
    var byKey = {}, vals = [];
    pairs().forEach(function (p) { var v = ref.incidence(p.adm1, p.adm2, incYear); byKey[p.adm1 + "|" + p.adm2] = v; if (v != null) vals.push(v); });
    var min = vals.length ? Math.min.apply(null, vals) : 0, max = vals.length ? Math.max.apply(null, vals) : 1;
    var map = G.ui.gambiaMap({});
    map.setColors(function (k) { var v = byKey[k]; return v == null ? "#eef0f4" : C.rampGYR(max > min ? (v - min) / (max - min) : 0.5); });
    map.setTitles(function (k, props) { var v = byKey[k]; return props.adm2 + " (" + props.adm1 + "): " + (v == null ? "no data" : v.toFixed(1) + " / 1,000 · " + stratum(v)); });
    C.attachMapLegend(map.el, { kind: "gradient", stops: C.GYR_STOPS, min: min, max: max, fmt: function (n) { return n.toFixed(0); }, label: "Cases per 1,000 (" + incYear + ")" });
    frag.appendChild(card("Malaria incidence — " + incYear, el("div", { class: "map-wrap" }, [map.el]), dlPng(function () { return map.el; }, "incidence-" + incYear + ".png"), G.ui.expandPlot("Malaria incidence " + incYear, function () { return map.el.cloneNode(true); })));

    var rows = pairs().map(function (p) { return { adm1: p.adm1, adm2: p.adm2, v: byKey[p.adm1 + "|" + p.adm2] }; }).sort(function (a, b) { return (b.v || -1) - (a.v || -1); });
    var headers = ["Region", "District", "Cases / 1,000", "Stratum"];
    var t = el("table", { class: "data-table" }, [el("tr", {}, [el("th", { text: "Region" }), el("th", { text: "District" }), el("th", { class: "num", text: "Cases / 1,000" }), el("th", { text: "Stratum" })])]);
    rows.forEach(function (r) { t.appendChild(el("tr", {}, [el("td", { text: r.adm1 }), el("td", { text: r.adm2 }), el("td", { class: "num", text: r.v == null ? "—" : r.v.toFixed(1) }), el("td", {}, [el("span", { class: "strat-badge " + (r.v == null ? "" : stratum(r.v).toLowerCase()), text: stratum(r.v) })])])); });
    var dl = el("button", { class: "linkbtn dl-btn", onClick: function () {
      var crows = rows.map(function (r) { return [r.adm1, r.adm2, r.v == null ? "" : Math.round(r.v * 10) / 10, stratum(r.v)]; });
      G.util.downloadText("incidence-" + incYear + ".csv", U.toCsv([], [["The Gambia Malaria Budgeting Tool"], ["Malaria incidence " + incYear + " (cases per 1,000)"], []]) + "\r\n" + U.toCsv(headers, crows), "text/csv");
    } }, ["Download CSV"]);
    frag.appendChild(card("Incidence by district — " + incYear, el("div", { class: "table-scroll" }, [t]), dl));
    return frag;
  }

  // ---- households ----
  function renderHouseholds() {
    var frag = document.createDocumentFragment(), year = hhYear;
    var rows = regions().map(function (r) { var pop = regionPop(r, year), size = A.householdSize(r); return { region: r, size: size, pop: pop, hh: pop / size }; });
    var totalPop = rows.reduce(function (a, b) { return a + b.pop; }, 0), totalHH = rows.reduce(function (a, b) { return a + b.hh; }, 0);
    frag.appendChild(el("div", { class: "panel" }, [el("div", { class: "scn-h", text: "Households — The Gambia (" + year + ")" }),
      el("div", { class: "stat-grid" }, [stat(fmtN(totalHH), "Households (total)"), stat(fmtN(totalPop), "Population"), stat((totalPop / totalHH).toFixed(1), "Avg household size")])]));
    function chart(exp) { var items = rows.slice().sort(function (a, b) { return b.hh - a.hh; }).map(function (r) { return { label: r.region, value: r.hh, color: "#0c1c8c" }; }); return C.hbars({ items: items, fmtFull: fmtN, fmtShort: shortN, export: exp }); }
    frag.appendChild(card("Households by region", el("div", { class: "line-cap" }, [chart(false)]), dlPng(function () { return chart(true); }, "households-by-region.png"), G.ui.expandPlot("Households by region", chart)));
    var headers = ["Region", "Avg household size", "Population", "Households"];
    var t = el("table", { class: "data-table" }, [el("tr", {}, [el("th", { text: "Region" }), el("th", { class: "num", text: "Avg household size" }), el("th", { class: "num", text: "Population" }), el("th", { class: "num", text: "Households" })])]);
    rows.slice().sort(function (a, b) { return a.region.localeCompare(b.region); }).forEach(function (r) { t.appendChild(el("tr", {}, [el("td", { text: r.region }), el("td", { class: "num", text: r.size.toFixed(1) }), el("td", { class: "num", text: fmtN(r.pop) }), el("td", { class: "num", text: fmtN(r.hh) })])); });
    t.appendChild(el("tr", { class: "total-row" }, [el("td", { text: "TOTAL" }), el("td", { class: "num", text: (totalPop / totalHH).toFixed(1) }), el("td", { class: "num", text: fmtN(totalPop) }), el("td", { class: "num", text: fmtN(totalHH) })]));
    var dl = el("button", { class: "linkbtn dl-btn", onClick: function () {
      var crows = rows.map(function (r) { return [r.region, r.size, Math.round(r.pop), Math.round(r.hh)]; }); crows.push(["TOTAL", "", Math.round(totalPop), Math.round(totalHH)]);
      G.util.downloadText("households-" + year + ".csv", U.toCsv([], [["The Gambia Malaria Budgeting Tool"], ["Households " + year], []]) + "\r\n" + U.toCsv(headers, crows), "text/csv");
    } }, ["Download CSV"]);
    frag.appendChild(card("Households by region — " + year, el("div", { class: "table-scroll" }, [t]), dl));
    frag.appendChild(el("div", { class: "callout note" }, [el("div", { class: "callout-title", text: "How households are derived" }), el("p", { class: "callout-text", text: "Households = population ÷ the region's average household size (from the national household survey). IRS quantities are based on the number of households." })]));
    return frag;
  }

  function renderContent() { contentEl.innerHTML = ""; contentEl.appendChild(which === "population" ? renderPopulation() : which === "households" ? renderHouseholds() : renderIncidence()); }
  function renderAll() { host.innerHTML = ""; host.appendChild(controls()); contentEl = el("div", { class: "data-content" }); renderContent(); host.appendChild(contentEl); }

  G.dataViewer = {
    render: function (container, w) { which = w; host = container; if (!incYear) incYear = incYears()[incYears().length - 1]; if (!hhYear) hhYear = ref.years()[ref.years().length - 1]; renderAll(); }
  };
})(GMB);
