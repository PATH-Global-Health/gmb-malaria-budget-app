/* Cost specification tab — a prefilled, editable unit-cost library (Phase 3).
   Mirrors the scenario tab: seeded default cost set + variants, collapsible
   intervention panels grouped by cost category, USD→GMD, Save/Discard + leave guard. */
window.GMB = window.GMB || {};
GMB.tabs = GMB.tabs || {};

(function (G) {
  var el = G.ui.el;
  var CAT_NAMES = { PROC: "Procurement", DIST: "Distribution / logistics", OPS: "Operational", SUPP: "Support / capacity", "M&E": "Monitoring & evaluation", COM: "Communication / BCC", ADMIN: "Administration", OTHER: "Other" };
  var CAT_ORDER = ["PROC", "DIST", "OPS", "SUPP", "M&E", "COM", "ADMIN", "OTHER"];

  var current = null, rootEl = null, flash = "", lastSavedJson = null, expanded = {};

  function uid(p) { return p + "_" + Math.random().toString(36).slice(2, 9); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function snap() { return JSON.stringify(current); }
  function isDirty() { return lastSavedJson === null || snap() !== lastSavedJson; }
  function usd(n) { return "$" + (n || 0).toFixed(2); }
  function gmd(n) { return "D " + (n || 0).toFixed(2); }
  function rate() { return current.exchange_rate || 0; }

  function numEl(val, on, o) {
    o = o || {}; var i = document.createElement("input"); i.type = "number"; i.value = (val == null ? "" : val);
    ["min", "max", "step"].forEach(function (k) { if (o[k] != null) i.setAttribute(k, o[k]); });
    i.style.width = o.width || "78px";
    i.addEventListener("change", function () { on(i.value === "" ? null : parseFloat(i.value)); });
    return i;
  }
  function selEl(options, value, on) {
    var s = document.createElement("select");
    options.forEach(function (o) { var op = document.createElement("option"); var v = o.value != null ? o.value : o; op.value = v; op.textContent = o.label != null ? o.label : o; if (v === value) op.selected = true; s.appendChild(op); });
    s.addEventListener("change", function () { on(s.value); }); return s;
  }
  function chip(label, active, on, title) {
    var a = { class: "chip" + (active ? " on" : ""), role: "button", tabindex: "0", onClick: on, onKeydown: function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); on(); } } };
    if (title) a.title = title;
    return el("span", a, [label]);
  }
  function info(text) { return el("span", { class: "info", title: text, role: "img", "aria-label": text }, ["ⓘ"]); }
  function dqBadge(dq) {
    var lbl = { 1: "Model estimate", 2: "Programme data", 3: "Primary study" };
    return el("span", { class: "dq dq" + (dq || 0), title: "Data quality: " + (lbl[dq] || "not set") }, [dq ? String(dq) : "–"]);
  }
  var UNITS = ["Per net", "Per structure", "Per child", "Per dose", "Per pack", "Per treatment course", "Per person", "Per year", "One-off"];
  function unitEl(r) {
    var i = document.createElement("input"); i.type = "text"; i.value = r.unit || "";
    i.setAttribute("list", "gmb-units"); i.style.width = "96px";
    i.addEventListener("change", function () { r.unit = i.value; });
    return i;
  }
  function typeEl(r, c) {
    var i = document.createElement("input"); i.type = "text"; i.value = r.type || "";
    i.placeholder = "shared"; i.setAttribute("list", "gmb-types-" + c.code); i.style.width = "116px";
    i.addEventListener("change", function () { r.type = i.value; });
    return i;
  }

  // ---------- cost-set model ----------
  function buildDefaultCostSet() {
    return {
      id: uid("cost"), name: "COOP cost scenario v1", seed: "gfpmi",
      description: "Default unit costs from the COOP Malaria Unit Cost Tool v3.3 — GF/PMI 2025 reference prices (USD, per unit).",
      currency: (G.data && G.data.defaultCurrency) || "GMD",
      exchange_rate: (G.data && G.data.defaultExchangeRate) || 72.39,
      rows: clone((G.data && G.data.defaultCosts) || []), schemaVersion: 1
    };
  }
  function seedCostSets() {
    var ref = G.store.get().costSets.filter(function (c) { return c.seed === "gfpmi"; })[0];
    if (!ref) { if ((G.store.get().removedSeeds || []).indexOf("cost:gfpmi") === -1) G.store.addCostSet(buildDefaultCostSet()); return; }
    // corrective refresh of the canonical reference if it predates a library fix
    var changed = false;
    if (ref.name === "GF / PMI 2025 reference") { ref.name = "COOP cost scenario v1"; changed = true; }
    if (!ref.description) { ref.description = "Default unit costs from the COOP Malaria Unit Cost Tool v3.3 — GF/PMI 2025 reference prices (USD, per unit)."; changed = true; }
    if (ref.rows.some(function (r) { return r.intervention_code === "vax" && r.unit !== "Per dose"; })
      || ref.rows.some(function (r) { return r.intervention_code === "irs" && /SumiShield|Fludora/.test(r.description || "") && !r.type; })
      || ref.rows.some(function (r) { return r.intervention_code === "smc" && r.cost_class === "PROC" && r.type === "SP-AQ"; })
      || ref.rows.some(function (r) { return r.intervention_code === "iptsc" && r.cost_class === "PROC" && r.type === "DHA-PPQ"; })) { ref.rows = clone((G.data && G.data.defaultCosts) || []); changed = true; }
    if (changed) G.store.updateCostSet(ref);
  }
  function loadCostSet(id) {
    var f = G.store.get().costSets.filter(function (c) { return c.id === id; })[0];
    if (f) { current = clone(f); lastSavedJson = snap(); flash = ""; refresh(); }
  }
  function duplicateCostSet() {
    current = clone(current); current.id = uid("cost"); current.name = "Copy of " + current.name; delete current.seed;
    lastSavedJson = null; flash = ""; refresh();
  }
  function loadFirstCostSet() { var all = G.store.get().costSets; if (all.length) { current = clone(all[0]); lastSavedJson = snap(); } else { current = buildDefaultCostSet(); lastSavedJson = null; } }
  function deleteCostSet() {
    var modal = G.ui.openModal({ title: "Delete cost set",
      body: el("div", {}, [el("p", { class: "small", text: "Delete “" + current.name + "”? This cannot be undone." })]),
      footer: [el("button", { class: "linkbtn", onClick: function () { modal.close(); } }, ["Cancel"]),
        el("button", { class: "btn danger", onClick: function () { modal.close(); doDelete(); } }, ["Delete"])] });
  }
  function doDelete() {
    var id = current.id, seed = current.seed;
    if (G.store.get().costSets.some(function (c) { return c.id === id; })) { G.store.removeCostSet(id); if (seed) G.store.addRemovedSeed("cost:" + seed); }
    loadFirstCostSet(); flash = ""; refresh();
  }
  function safeFile(s) { return String(s || "costset").replace(/[^\w.-]+/g, "_").slice(0, 60); }
  var CLASS_NAMES = { PROC: "Procurement", DIST: "Distribution", OPS: "Operational", SUPP: "Support", "M&E": "Monitoring & evaluation", COM: "Communication", ADMIN: "Administration", OTHER: "Other" };
  function exportXlsx() {
    function ivn(c) { var x = GMB.catalogByCode(c); return x ? x.nice : c; }
    var cols = [{ label: "Intervention", width: 190 }, { label: "Cost category", width: 130 }, { label: "Type", width: 110 }, { label: "Description", width: 250 }, { label: "Unit", width: 90 }, { label: "Unit cost (USD)", width: 100, fmt: "num1" }, { label: "Unit cost (GMD)", width: 110, fmt: "num1" }, { label: "Source", width: 160 }, { label: "Data quality", width: 80 }];
    var rows = current.rows.map(function (r) { return [ivn(r.intervention_code), CLASS_NAMES[r.cost_class] || r.cost_class, r.type || "", r.description, r.unit, Math.round((r.usd_cost || 0) * 100) / 100, Math.round((r.usd_cost || 0) * rate() * 100) / 100, r.source || "", r.dataQuality == null ? "" : r.dataQuality]; });
    GMB.xlsx.download(safeFile(current.name), [{ name: "Unit costs", title: current.name, meta: [["Description", current.description || ""], ["Exchange rate", "1 USD = " + rate() + " GMD"]], columns: cols, rows: rows }]);
  }
  function bulkAdjust() {
    var cat = "ALL", pct = 0, modal;
    var catSel = selEl([{ value: "ALL", label: "All categories" }].concat(CAT_ORDER.map(function (c) { return { value: c, label: c }; })), "ALL", function (v) { cat = v; });
    var pctIn = numEl(0, function (v) { pct = (v == null ? 0 : v); }, { step: 1, width: "70px" });
    modal = G.ui.openModal({ title: "Bulk-adjust costs",
      body: el("div", {}, [el("p", { class: "small", text: "Multiply the USD cost of matching lines by a percentage change (e.g. −15 reduces all selected costs by 15%)." }),
        el("div", { class: "settings-line" }, [el("span", { class: "small muted", text: "Category" }), catSel, el("span", { class: "small muted", text: "Change %" }), pctIn])]),
      footer: [el("button", { class: "linkbtn", onClick: function () { modal.close(); } }, ["Cancel"]),
        el("button", { class: "btn", onClick: function () { var f = 1 + pct / 100; current.rows.forEach(function (r) { if (cat === "ALL" || r.cost_class === cat) r.usd_cost = Math.round((r.usd_cost || 0) * f * 10000) / 10000; }); modal.close(); refresh(); } }, ["Apply"])] });
  }
  function descEl(r) { var i = document.createElement("input"); i.type = "text"; i.value = r.description || ""; i.style.width = "100%"; i.addEventListener("change", function () { r.description = i.value; }); return i; }
  function removeLine(r) { current.rows = current.rows.filter(function (x) { return x !== r; }); refresh(); }
  function addLineControl(c) {
    var cat = "PROC";
    var sel = selEl(CAT_ORDER.map(function (x) { return { value: x, label: x }; }), "PROC", function (v) { cat = v; });
    return el("div", { class: "settings-line" }, [el("span", { class: "small muted", text: "Add line to" }), sel,
      el("button", { class: "linkbtn", onClick: function () { current.rows.push({ intervention_code: c.code, cost_class: cat, type: "", description: "New cost line", unit: "", usd_cost: 0, source: "", dataQuality: null }); refresh(); } }, ["+ add cost line"])]);
  }
  function revertCurrent() {
    if (lastSavedJson) current = JSON.parse(lastSavedJson);
    else current = buildDefaultCostSet();
    flash = "";
  }
  function resetPrices() {
    var def = {}; ((G.data && G.data.defaultCosts) || []).forEach(function (r) { def[r.intervention_code + "|" + r.cost_class + "|" + r.description] = r; });
    current.rows.forEach(function (r) { var d = def[r.intervention_code + "|" + r.cost_class + "|" + r.description]; if (d) { r.usd_cost = d.usd_cost; r.unit = d.unit; } });
    refresh();
  }
  function doSave() {
    var exists = G.store.get().costSets.some(function (c) { return c.id === current.id; });
    if (exists) G.store.updateCostSet(clone(current)); else G.store.addCostSet(clone(current));
    lastSavedJson = snap(); flash = "Saved “" + current.name + "”"; refresh();
  }
  function guardUnsaved(proceed) {
    if (!isDirty()) { proceed(); return; }
    var modal;
    modal = G.ui.openModal({
      title: "Unsaved changes",
      body: el("div", {}, [el("p", { class: "small", text: "You have unsaved changes to “" + current.name + "”. Save them before leaving?" })]),
      footer: [
        el("button", { class: "linkbtn", onClick: function () { modal.close(); } }, ["Cancel"]),
        el("button", { class: "linkbtn", onClick: function () { modal.close(); revertCurrent(); proceed(); } }, ["Discard changes"]),
        el("button", { class: "btn", onClick: function () { modal.close(); doSave(); proceed(); } }, ["Save changes"])
      ]
    });
  }
  G.seedCostSets = seedCostSets;

  // group a cost set's rows: { code: { cat: [rows] } }, preserving catalog order
  function grouped(cs) {
    var byCode = {};
    cs.rows.forEach(function (r) {
      var c = (byCode[r.intervention_code] = byCode[r.intervention_code] || {});
      (c[r.cost_class] = c[r.cost_class] || []).push(r);
    });
    return byCode;
  }
  function interventionTotal(catMap) { var t = 0; Object.keys(catMap).forEach(function (cat) { catMap[cat].forEach(function (r) { t += (r.usd_cost || 0); }); }); return t; }
  function catTotal(rows) { return rows.reduce(function (a, r) { return a + (r.usd_cost || 0); }, 0); }

  // ---------- render ----------
  function refresh() { var y = window.scrollY; renderBody(); window.scrollTo(0, y); }

  function renderBody() {
    rootEl.innerHTML = "";
    rootEl.appendChild(GMB.ui.pageHelp("costs"));
    var layout = el("div", { class: "scn-layout" });
    var main = el("div", { class: "scn-main" }, [renderHeader(), renderPanels()]);
    layout.appendChild(main);
    layout.appendChild(renderSummary());
    rootEl.appendChild(layout);
    var dl = document.createElement("datalist"); dl.id = "gmb-units";
    UNITS.forEach(function (u) { var o = document.createElement("option"); o.value = u; dl.appendChild(o); });
    rootEl.appendChild(dl);
    G.catalog.forEach(function (c) {
      var tl = document.createElement("datalist"); tl.id = "gmb-types-" + c.code;
      var extras = c.code === "smc" ? ["SP+AQ 3-11m", "SP+AQ 12-59m"] : (c.code === "iptsc" ? ["DHA-PPQ 5-11y", "DHA-PPQ 12-15y", "SP-AQ 5-11y", "SP-AQ 12-15y", "SP 5-11y", "SP 12-15y"] : []);
      (c.types || []).concat(extras).forEach(function (tp) { var o = document.createElement("option"); o.value = tp; tl.appendChild(o); });
      rootEl.appendChild(tl);
    });
  }

  function renderHeader() {
    var p = el("div", { class: "panel" });
    p.appendChild(el("div", { class: "scn-h" }, [el("span", { class: "scn-step", text: "$" }), "Cost set"]));
    var sets = G.store.get().costSets;
    var chips = el("div", { class: "chip-row" }, sets.map(function (s) {
      return chip(s.name, s.id === current.id, function () { guardUnsaved(function () { loadCostSet(s.id); }); }, s.description || s.name);
    }).concat([chip("⧉ Duplicate", false, function () { guardUnsaved(function () { duplicateCostSet(); }); })]));
    var actions = el("div", { class: "actions-row" }, [
      el("button", { class: "linkbtn", onClick: exportXlsx }, ["⬇ Export to Excel"]),
      el("button", { class: "linkbtn", onClick: bulkAdjust }, ["⚖ Bulk adjust"])
    ]);
    p.appendChild(el("div", { class: "field" }, [el("label", { text: "Cost set" }), chips, actions]));

    var name = document.createElement("input"); name.type = "text"; name.value = current.name; name.style.maxWidth = "360px";
    name.addEventListener("input", function () { current.name = name.value; updateSaveState(); });
    p.appendChild(el("div", { class: "field" }, [el("label", { text: "Cost set name" }), name]));
    var notes = document.createElement("textarea"); notes.value = current.description || ""; notes.rows = 2;
    notes.placeholder = "Optional — a longer description of this cost set";
    notes.style.width = "100%"; notes.style.maxWidth = "560px";
    notes.addEventListener("input", function () { current.description = notes.value; updateSaveState(); });
    p.appendChild(el("div", { class: "field" }, [el("label", { text: "Notes / description" }), notes]));

    p.appendChild(el("div", { class: "field" }, [el("label", { text: "Exchange rate (USD → " + (current.currency || "GMD") + ")" }),
      el("div", { class: "settings-line" }, [
        el("span", { class: "small muted", text: "1 USD =" }),
        numEl(current.exchange_rate, function (v) { current.exchange_rate = v; refresh(); }, { min: 0, step: 0.01, width: "90px" }),
        el("span", { class: "small muted", text: current.currency || "GMD" }),
        el("button", { class: "linkbtn", style: "margin-left:14px", onClick: resetPrices }, ["Reset to defaults"])
      ])]));
    return p;
  }

  function renderPanels() {
    var wrap = el("div", {});
    var g = grouped(current);
    G.catalog.forEach(function (c) {
      var catMap = g[c.code] || {};
      var open = !!expanded[c.code];
      var nLines = Object.keys(catMap).reduce(function (a, cat) { return a + catMap[cat].length; }, 0);
      var header = el("div", { class: "cost-ivhead", role: "button", tabindex: "0",
        onClick: function () { expanded[c.code] = !open; refresh(); },
        onKeydown: function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); expanded[c.code] = !open; refresh(); } } }, [
        el("span", { class: "twist", text: open ? "▾" : "▸" }),
        el("strong", { text: c.nice }),
        el("span", { class: "muted small", text: nLines ? c.commodity : "no cost lines yet" }),
        el("span", { class: "cost-ivtotal", text: nLines + " line" + (nLines === 1 ? "" : "s") })
      ]);
      var panel = el("div", { class: "panel cost-panel" }, [header]);
      if (open) {
        CAT_ORDER.forEach(function (cat) {
          var rows = catMap[cat]; if (!rows || !rows.length) return;
          var tbl = el("table", { class: "cost-table" }, [el("tr", {}, [
            el("th", { text: "Input description" }), el("th", { text: "Type" }), el("th", { text: "Unit" }),
            el("th", { text: "USD" }), el("th", { text: current.currency || "GMD" }), el("th", { text: "DQ" }), el("th", { text: "" })])]);
          rows.forEach(function (r) {
            tbl.appendChild(el("tr", {}, [
              el("td", { class: "cost-desc", title: r.source || "" }, [descEl(r)]),
              el("td", {}, [typeEl(r, c)]),
              el("td", {}, [unitEl(r)]),
              el("td", {}, [numEl(r.usd_cost, function (v) { r.usd_cost = (v == null ? 0 : v); refresh(); }, { min: 0, step: 0.01, width: "74px" })]),
              el("td", { class: "small muted cost-gmd", text: gmd((r.usd_cost || 0) * rate()) }),
              el("td", {}, [dqBadge(r.dataQuality)]),
              el("td", {}, [el("span", { class: "x", title: "Remove line", text: "×", onClick: function () { removeLine(r); } })])
            ]));
          });
          panel.appendChild(el("div", { class: "cost-cat" }, [
            el("div", { class: "cost-cathead" }, [el("span", { text: cat + " · " + (CAT_NAMES[cat] || cat) }), el("span", { class: "muted", text: rows.length + " line" + (rows.length === 1 ? "" : "s") })]),
            tbl
          ]));
        });
        if (!nLines) panel.appendChild(el("div", { class: "cost-cat" }, [el("p", { class: "muted small", style: "margin:6px 0", text: "No default costs for this intervention — add lines below." })]));
        panel.appendChild(el("div", { class: "cost-cat" }, [addLineControl(c)]));
      }
      wrap.appendChild(panel);
    });
    return wrap;
  }

  function renderSummary() {
    var aside = el("aside", { class: "scn-summary cost-summary" }), p = el("div", { class: "panel" });
    p.appendChild(el("h3", {}, ["Summary ", info("Each row is costed as its own line item. Blank type rows are shared add-ons; typed rows must match the scenario commodity/type.")]));
    var g = grouped(current);
    G.catalog.forEach(function (c) {
      var catMap = g[c.code]; if (!catMap) return;
      var n = Object.keys(catMap).reduce(function (a, cat) { return a + catMap[cat].length; }, 0);
      p.appendChild(el("div", { class: "sum-line" }, [el("span", { class: "muted", text: c.nice }), el("strong", { text: n + " line" + (n === 1 ? "" : "s") })]));
    });
    p.appendChild(el("p", { class: "muted small", style: "margin:6px 0 0", text: "Type-specific rows match the selected scenario type. Blank type rows are applied as shared add-on costs." }));

    var dirty = isDirty();
    var saveBtn = el("button", { class: "btn", style: "flex:1", onClick: doSave }, [lastSavedJson === null ? "Save cost set" : "Save changes"]);
    var discardBtn = el("button", { class: "btn secondary", style: "flex:1", onClick: function () { revertCurrent(); refresh(); } }, ["Discard changes"]);
    if (!dirty) { saveBtn.disabled = true; discardBtn.disabled = true; }
    p.appendChild(el("div", { style: "display:flex;gap:8px;margin-top:10px" }, [saveBtn, discardBtn]));
    p.appendChild(el("div", { class: "save-state " + (dirty ? "dirty" : "clean") }, [el("span", { class: "dot" }), dirty ? (lastSavedJson === null ? "New cost set — not saved" : "Unsaved changes") : "All changes saved"]));
    if (flash) p.appendChild(el("div", { class: "small", style: "color:var(--green);margin-top:4px", text: flash }));
    p.appendChild(el("button", { class: "btn danger", style: "width:100%;margin-top:10px", onClick: deleteCostSet }, ["Delete cost set"]));
    aside.appendChild(p);
    return aside;
  }
  function updateSaveState() {
    var s = rootEl.querySelector(".save-state"); if (!s) return;
    var dirty = isDirty();
    s.className = "save-state " + (dirty ? "dirty" : "clean");
    s.lastChild.textContent = dirty ? (lastSavedJson === null ? "New cost set — not saved" : "Unsaved changes") : "All changes saved";
    rootEl.querySelectorAll(".cost-summary .btn").forEach(function (b) { b.disabled = !dirty; });
  }

  G.tabs.costs = {
    render: function (root) {
      rootEl = root;
      if (!rootEl._gmbCostDirty) { rootEl._gmbCostDirty = true; rootEl.addEventListener("change", updateSaveState); rootEl.addEventListener("input", updateSaveState); }
      if (!current) {
        if (!G.store.get().costSets.length) seedCostSets();
        var first = G.store.get().costSets[0];
        if (first) { current = clone(first); lastSavedJson = snap(); }
        else { current = buildDefaultCostSet(); lastSavedJson = null; }
      }
      G.router.setLeaveGuard(function (proceed) { guardUnsaved(proceed); });
      flash = ""; renderBody();
    }
  };
})(GMB);
