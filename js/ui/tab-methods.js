/* Methods tab — side-panel layout with grouped navigation: overview, a section
   per intervention, the methodology sections, and the data viewer (population +
   incidence). Content lives in GMB.content.methods; data via GMB.dataViewer. */
window.GMB = window.GMB || {};
GMB.tabs = GMB.tabs || {};

(function (G) {
  var el = G.ui.el;
  var active = "overview", rootEl = null;

  function M() { return (G.content && G.content.methods) || { overview: {}, interventions: [], sections: {} }; }

  function navItems() {
    var m = M(), items = [{ type: "item", key: "overview", label: "Overview" }];
    items.push({ type: "heading", label: "By intervention" });
    m.interventions.forEach(function (iv) { items.push({ type: "item", key: "iv:" + iv.code, label: iv.name }); });
    items.push({ type: "heading", label: "Methods" });
    ["costing", "worked", "assumptions", "data", "limitations"].forEach(function (k) { if (m.sections[k] || k === "worked") items.push({ type: "item", key: k, label: k === "worked" ? "Worked example" : m.sections[k].title }); });
    items.push({ type: "heading", label: "Explore the data" });
    items.push({ type: "item", key: "data:population", label: "Population" });
    items.push({ type: "item", key: "data:households", label: "Households" });
    items.push({ type: "item", key: "data:incidence", label: "Incidence" });
    return items;
  }

  function render(root) { rootEl = root; renderBody(); }

  function renderBody() {
    rootEl.innerHTML = "";
    var items = navItems();
    if (!items.some(function (i) { return i.type === "item" && i.key === active; })) active = "overview";

    var side = el("aside", { class: "methods-nav" }, [el("div", { class: "methods-nav-h", text: "Methods & data" })]);
    items.forEach(function (it) {
      if (it.type === "heading") side.appendChild(el("div", { class: "methods-nav-group", text: it.label }));
      else side.appendChild(el("button", { class: "methods-nav-item" + (it.key === active ? " on" : ""), onClick: function () { active = it.key; renderBody(); } }, [it.label]));
    });

    var main = el("div", { class: "methods-main" }, [renderSection()]);
    rootEl.appendChild(el("div", { class: "methods-layout" }, [side, main]));
  }

  function renderSection() {
    var m = M();
    if (active === "overview") return overviewView(m.overview);
    if (active.slice(0, 3) === "iv:") { var iv = m.interventions.filter(function (x) { return x.code === active.slice(3); })[0]; return iv ? ivView(iv) : el("div"); }
    if (active.slice(0, 5) === "data:") { var c = el("div", { class: "methods-data" }); if (G.dataViewer) G.dataViewer.render(c, active.slice(5)); return c; }
    if (active === "worked") return workedExampleView();
    return sectionView(m.sections[active]);
  }

  function overviewView(o) {
    var p = el("div", { class: "panel methods-sec" }, [el("h2", { text: "How this tool works" }), el("p", { class: "lead", text: o.lead })]);
    p.appendChild(G.ui.blocks(o.blocks));
    return p;
  }

  function ivView(iv) {
    var p = el("div", { class: "panel methods-sec" });
    p.appendChild(el("div", { class: "iv-head" }, [el("h2", { text: iv.name }), el("span", { class: "iv-target", text: "Targets: " + iv.target })]));
    p.appendChild(el("p", { class: "lead", text: iv.plain }));
    p.appendChild(el("div", { class: "method-block" }, [el("div", { class: "mb-label", text: "Quantification" }), el("div", { class: "formula big", text: iv.quant })]));
    var cols = el("div", { class: "iv-cols" });
    cols.appendChild(el("div", { class: "callout info" }, [el("div", { class: "callout-title", text: "Default assumptions" }), el("ul", {}, iv.assumptions.map(function (a) { return el("li", { text: a }); }))]));
    if (iv.notes && iv.notes.length) cols.appendChild(el("div", { class: "callout note" }, [el("div", { class: "callout-title", text: "Important notes" }), el("ul", {}, iv.notes.map(function (n) { return el("li", { text: n }); }))]));
    p.appendChild(cols);
    return p;
  }

  function sectionView(sec) {
    if (!sec) return el("div");
    var p = el("div", { class: "panel methods-sec" }, [el("h2", { text: sec.title }), el("p", { class: "lead", text: sec.lead })]);
    p.appendChild(G.ui.blocks(sec.blocks));
    return p;
  }

  function currentCostSet() {
    var st = G.store.get(), bs = st.budgets || [], last = bs[bs.length - 1];
    if (last) {
      var hit = (st.costSets || []).filter(function (c) { return c.id === last.costSetId; })[0];
      if (hit) return hit;
    }
    return (st.costSets || [])[0] || { id: "default", name: "Default unit costs", rows: (G.data && G.data.defaultCosts) || [], exchange_rate: (G.data && G.data.defaultExchangeRate) || 72.39, currency: (G.data && G.data.defaultCurrency) || "GMD" };
  }
  function workedScenario() {
    var scn = { id: "worked", name: "Worked example", years: [2026], assumptions: { growth: G.assumptions.defaultGrowth },
      strata: { averagingYears: G.strata.defaultAveragingYears.slice(), bands: G.strata.defaultBands(), overrides: {} }, interventions: {}, schemaVersion: 4 };
    G.catalog.forEach(function (c) {
      scn.interventions[c.code] = { enabled: true, type: c.types[0], scope: { mode: "custom", districts: ["Upper River|Jimara"] },
        params: Object.assign({}, c.defaults), target: JSON.parse(JSON.stringify(c.target)), coverageVary: "none", coverageByYear: null, coverageByStratum: null,
        typeVary: "none", typeByYear: null, typeByStratum: null, activeYears: [2026], geo: {}, levers: {} };
    });
    return scn;
  }
  function latestBudgetExampleRows() {
    var bs = G.store.get().budgets || [], b = bs[bs.length - 1];
    if (!b || !b.costLineRows) return null;
    var rows = b.costLineRows.filter(exampleRow);
    return rows.length ? { name: b.name || "Generated budget", rows: rows } : null;
  }
  function exampleRow(r) {
    return (r.adm1 === "Upper River" && r.adm2 === "Jimara" && Number(r.year) === 2026)
      || (r.adm1 === "National" && (String(r.year) === "2026" || String(r.year) === "All Years"));
  }
  function workedExampleView() {
    var fromBudget = latestBudgetExampleRows();
    var cost = currentCostSet(), b = fromBudget ? null : G.engine.generateBudget(workedScenario(), cost);
    var rows = fromBudget ? fromBudget.rows : (b.costLineRows || []).filter(exampleRow);
    var pop = G.assumptions.population("Upper River", "Jimara", 2026, G.assumptions.defaultGrowth);
    var p = el("div", { class: "panel methods-sec" }, [el("h2", { text: "Worked example" }),
      el("p", { class: "lead", text: "Upper River / Jimara, 2026. This table shows the quantity, matched unit-cost line, quantity used for costing, and calculated cost." }),
      el("div", { class: "callout info" }, [el("div", { class: "callout-title", text: fromBudget ? fromBudget.name : cost.name }), el("p", { text: "Projected population: " + G.util.fmtNum(pop) })])]);
    var t = el("table", { class: "gen-table data-table" }, [el("tr", {}, [
      el("th", { text: "Intervention" }), el("th", { text: "Type" }), el("th", { text: "Commodity" }), el("th", { class: "num", text: "Target pop" }),
      el("th", { class: "num", text: "Covered pop" }), el("th", { class: "num", text: "Quantity" }), el("th", { text: "Cost line" }),
      el("th", { text: "Unit" }), el("th", { class: "num", text: "Quantity used" }), el("th", { class: "num", text: "Unit cost" }), el("th", { class: "num", text: "Cost USD" })
    ])]);
    rows.forEach(function (r) {
      var c = G.catalogByCode(r.intervention_code);
      t.appendChild(el("tr", {}, [el("td", { text: c ? c.nice : r.intervention_code }), el("td", { text: r.type || "" }), el("td", { text: r.commodity || "" }),
        el("td", { class: "num", text: G.util.fmtNum(r.target_pop || 0) }), el("td", { class: "num", text: G.util.fmtNum(r.covered_pop || 0) }),
        el("td", { class: "num", text: G.util.fmtNum(r.quantity || 0) }), el("td", { text: r.description || "" }), el("td", { text: r.unit || "" }),
        el("td", { class: "num", text: G.util.fmtNum(r.quantity_for_cost || 0) }), el("td", { class: "num", text: "$" + Math.round((r.unit_cost_usd || 0) * 100) / 100 }),
        el("td", { class: "num", text: G.util.fmtUSD(r.cost_usd || 0) })]));
    });
    p.appendChild(t);
    p.appendChild(el("p", { class: "small muted", text: "Line total shown here: " + G.util.fmtUSD(rows.reduce(function (a, r) { return a + (r.cost_usd || 0); }, 0)) }));
    return p;
  }

  G.tabs.methods = { render: render };
})(GMB);
