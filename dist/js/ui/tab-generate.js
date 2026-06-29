/* Budget generation tab — a budget factory + library.
   Generate a budget immediately, or add scenario × cost-set combinations to a
   queue, name/describe each, then generate them all in one intentional pass.
   Budgets are saved automatically into the library, which tracks each budget's
   lifecycle status (current / out of date / source deleted). All money lives on
   the Visualisation and Comparison tabs; rows here are identity-only. */
window.GMB = window.GMB || {};
GMB.tabs = GMB.tabs || {};

(function (G) {
  var el = G.ui.el;

  var selScn = null, selCost = null, rootEl = null;
  var flash = null;            // { msg, notes, type } shown after an action
  var genName = null, genDesc = "";   // name/description for the next "Generate now" / "Add to queue"
  var queue = [];              // [{ scnId, costId, name, description }] — transient staging area
  var compareSel = {};         // budget id -> true, for "Compare selected"

  function scns() { return G.store.get().scenarios; }
  function costs() { return G.store.get().costSets; }
  function budgets() { return G.store.get().budgets; }
  function scnById(id) { return scns().filter(function (s) { return s.id === id; })[0]; }
  function costById(id) { return costs().filter(function (c) { return c.id === id; })[0]; }
  function ivName(code) { var c = G.catalogByCode(code); return c ? c.nice : code; }
  function comboName(scn, cost) { return scn.name + " × " + cost.name; }

  // Default the name/description fields for the current combo: pre-fill from an
  // existing budget if one exists, otherwise use the combo name + blank note.
  function resetGenMeta() {
    var scn = scnById(selScn), cost = costById(selCost);
    if (!scn || !cost) { genName = ""; genDesc = ""; return; }
    var existing = findBudgetForCombo(selScn, selCost);
    genName = existing ? (existing.name || comboName(scn, cost)) : comboName(scn, cost);
    genDesc = existing ? (existing.description || "") : "";
  }

  function selEl(options, value, on) {
    var s = document.createElement("select"); s.style.maxWidth = "100%";
    options.forEach(function (o) { var op = document.createElement("option"); op.value = o.value; op.textContent = o.label; if (o.value === value) op.selected = true; s.appendChild(op); });
    s.addEventListener("change", function () { on(s.value); }); return s;
  }

  function findBudgetForCombo(scnId, costId) {
    return budgets().filter(function (b) { return b.scenarioId === scnId && b.costSetId === costId; })[0] || null;
  }

  // current | stale | deleted  (+ the live source objects when present)
  function statusOf(b) {
    return G.budgetStatus ? G.budgetStatus(b) : { state: "current", scn: scnById(b.scenarioId), cost: costById(b.costSetId) };
  }

  function previewFor(scn, cost) {
    if (!scn || !cost || !G.engine.previewBudget) return null;
    try { return G.engine.previewBudget(scn, cost); }
    catch (e) { return { notes: ["Preview failed: " + (e && e.message ? e.message : e)] }; }
  }
  function previewNotes(scn, cost) {
    var b = previewFor(scn, cost);
    return (b && b.notes) || [];
  }
  function warningText(n) {
    return n ? (n + " costing warning" + (n === 1 ? "" : "s")) : "No costing warnings";
  }
  function warningBox(notes, title) {
    var has = notes && notes.length;
    var box = el("div", { class: "checks " + (has ? "has" : "ok"), style: "margin-top:8px" });
    box.appendChild(el("div", { class: "small", style: "font-weight:600", text: (has ? "⚠ " : "✓ ") + title }));
    if (has) notes.slice(0, 8).forEach(function (m) { box.appendChild(el("div", { class: "small", text: "⚠ " + m })); });
    if (has && notes.length > 8) box.appendChild(el("div", { class: "small muted", text: "+" + (notes.length - 8) + " more warning(s)." }));
    return box;
  }
  function persistenceWarning() {
    var st = G.persistence && G.persistence.status ? G.persistence.status() : null;
    if (!st || st.state !== "error") return null;
    return el("div", { class: "checks has", style: "margin-top:8px" }, [
      el("div", { class: "small", style: "font-weight:600", text: "⚠ Budget save failed" }),
      el("div", { class: "small", text: st.message || "Browser storage is unavailable, so generated budgets may not be available after reopening the tool." })
    ]);
  }

  function refresh() { renderBody(); }

  // ---- generation -------------------------------------------------------
  // meta: optional { name, description } from the queue. Without it (a quick
  // "Generate now"), default names are used and a replace keeps the prior name/note.
  function generateInto(scn, cost, replaceId, meta) {
    var b = G.engine.generateBudget(scn, cost);
    var prev = replaceId ? budgets().filter(function (x) { return x.id === replaceId; })[0] : null;
    if (meta) {
      b.name = (meta.name || "").trim() || comboName(scn, cost);
      b.description = meta.description || "";
    } else if (prev) {
      if (prev.name) b.name = prev.name;
      b.description = prev.description || "";
    } else {
      b.description = "";
    }
    if (replaceId) { b.id = replaceId; G.store.updateBudget(b); }
    else { G.store.addBudget(b); }
    return b;
  }

  function doGenerate() {
    var scn = scnById(selScn), cost = costById(selCost);
    if (!scn || !cost) return;
    var existing = findBudgetForCombo(selScn, selCost);
    var b = generateInto(scn, cost, existing ? existing.id : null, { name: genName, description: genDesc });
    flash = { msg: (existing ? "Regenerated & saved " : "Generated & saved ") + "“" + b.name + "”", notes: b.notes || [], type: "ok" };
    resetGenMeta();
    refresh();
    setTimeout(function () { highlightRow(b.id); }, 30);
  }

  function regenerate(b) {
    var st = statusOf(b);
    if (st.state === "deleted") return;
    var nb = generateInto(st.scn, st.cost, b.id, null);
    flash = { msg: "Regenerated “" + nb.name + "”", notes: nb.notes || [], type: "ok" };
    refresh();
    setTimeout(function () { highlightRow(nb.id); }, 30);
  }

  // ---- queue ------------------------------------------------------------
  function addToQueue() {
    var scn = scnById(selScn), cost = costById(selCost);
    if (!scn || !cost) return;
    if (queue.some(function (q) { return q.scnId === selScn && q.costId === selCost; })) {
      flash = { msg: "That combination is already in the queue.", notes: [], type: "warn" }; refresh(); return;
    }
    queue.push({ scnId: selScn, costId: selCost, name: (genName || "").trim() || comboName(scn, cost), description: genDesc || "" });
    flash = null; resetGenMeta(); refresh();
  }
  function removeFromQueue(i) { queue.splice(i, 1); refresh(); }
  function clearQueue() { queue = []; flash = null; refresh(); }
  function generateQueue() {
    var made = 0, refreshed = 0, errors = 0, notes = [];
    queue.forEach(function (item) {
      var scn = scnById(item.scnId), cost = costById(item.costId);
      if (!scn || !cost) { errors++; return; }
      var existing = findBudgetForCombo(item.scnId, item.costId);
      try {
        var b = generateInto(scn, cost, existing ? existing.id : null, { name: item.name, description: item.description });
        (b.notes || []).forEach(function (n) { notes.push((item.name || comboName(scn, cost)) + ": " + n); });
        if (existing) refreshed++; else made++;
      } catch (e) { errors++; }
    });
    flash = { msg: "Generated " + made + " new · refreshed " + refreshed + " · " + errors + " error" + (errors === 1 ? "" : "s") + (notes.length ? " · " + notes.length + " warning" + (notes.length === 1 ? "" : "s") : ""), notes: notes, type: notes.length ? "warn" : "ok" };
    queue = []; refresh();
  }

  // ---- navigation -------------------------------------------------------
  function openInViz(id) { G.focusBudgetId = id; G.router.go("viz"); }
  function compareSelected() {
    var ids = Object.keys(compareSel).filter(function (k) { return compareSel[k]; });
    if (ids.length < 2) return;
    G.focusBudgetIds = ids; G.router.go("compare");
  }
  function highlightRow(id) {
    var tr = rootEl && rootEl.querySelector('tr[data-bid="' + id + '"]');
    if (!tr) return;
    tr.scrollIntoView({ block: "center", behavior: "smooth" });
    tr.classList.add("flash-row");
    setTimeout(function () { tr.classList.remove("flash-row"); }, 1600);
  }

  // ---- render -----------------------------------------------------------
  function renderBody() {
    rootEl.innerHTML = "";
    rootEl.appendChild(GMB.ui.pageHelp("generate"));
    if (!scns().length || !costs().length) {
      rootEl.appendChild(GMB.ui.placeholder("Phase 4", "Budget generation",
        "You need at least one saved scenario and one cost set first. Build them on the Scenario specification and Cost specification tabs."));
      return;
    }
    if (!selScn || !scnById(selScn)) selScn = (scns().filter(function (s) { return s.template === "nsp"; })[0] || scns()[0]).id;
    if (!selCost || !costById(selCost)) selCost = costs()[0].id;
    if (G.focusGenerateCombo) {
      if (scnById(G.focusGenerateCombo.scenarioId)) selScn = G.focusGenerateCombo.scenarioId;
      if (costById(G.focusGenerateCombo.costSetId)) selCost = G.focusGenerateCombo.costSetId;
      G.focusGenerateCombo = null; resetGenMeta();
    }
    if (genName === null) resetGenMeta();

    rootEl.appendChild(renderGenerate());
    if (queue.length) rootEl.appendChild(renderQueue());
    rootEl.appendChild(renderLibrary());
  }

  function renderGenerate() {
    var p = el("div", { class: "panel" });
    p.appendChild(el("div", { class: "scn-h" }, [el("span", { class: "scn-step", text: "3" }), "Budget generation"]));
    p.appendChild(el("p", { class: "muted small", text: "Pick a scenario and a cost set, then either generate it now or add it to the queue to name and generate several together. Budgets are saved automatically into the library below." }));

    p.appendChild(el("div", { class: "gen-pickers" }, [
      el("div", { class: "field" }, [el("label", { text: "Scenario" }), selEl(scns().map(function (s) { return { value: s.id, label: s.name }; }), selScn, function (v) { selScn = v; flash = null; resetGenMeta(); refresh(); })]),
      el("div", { class: "field" }, [el("label", { text: "Cost set" }), selEl(costs().map(function (c) { return { value: c.id, label: c.name }; }), selCost, function (v) { selCost = v; flash = null; resetGenMeta(); refresh(); })])
    ]));

    var nameI = document.createElement("input"); nameI.type = "text"; nameI.value = genName; nameI.style.width = "100%";
    nameI.addEventListener("input", function () { genName = nameI.value; });
    var descI = document.createElement("input"); descI.type = "text"; descI.value = genDesc; descI.style.width = "100%"; descI.placeholder = "Optional note about this budget";
    descI.addEventListener("input", function () { genDesc = descI.value; });
    p.appendChild(el("div", { class: "gen-meta" }, [
      el("div", { class: "field name" }, [el("label", { text: "Budget name" }), nameI]),
      el("div", { class: "field desc" }, [el("label", { text: "Description (optional)" }), descI])
    ]));

    p.appendChild(el("div", { class: "gen-actions" }, [
      el("button", { class: "btn secondary", onClick: addToQueue }, ["+ Add to queue"]),
      genButton()
    ]));

    var scn = scnById(selScn), cost = costById(selCost);
    p.appendChild(warningBox(previewNotes(scn, cost), "Pre-generation costing checks"));

    // pre-generate check line for an existing combo
    var existing = findBudgetForCombo(selScn, selCost);
    if (existing) {
      var st = statusOf(existing);
      var line = el("div", { class: "checks " + (st.state === "stale" ? "has" : "ok"), style: "margin-top:6px" });
      var msg = st.state === "stale"
        ? "A budget for this combination exists but its source has changed — regenerate to refresh it."
        : "A budget for this combination already exists (generated " + G.util.relTime(existing.generatedAt) + ").";
      line.appendChild(el("span", { class: "small", text: msg + " " }));
      line.appendChild(el("button", { class: "linkbtn", onClick: function () { highlightRow(existing.id); } }, ["See it below ↓"]));
      p.appendChild(line);
    }

    if (flash) {
      var cls = flash.type === "warn" ? "has" : "ok", icon = flash.type === "warn" ? "⚠ " : "✓ ";
      var fb = el("div", { class: "checks " + cls, style: "margin-top:8px" }, [el("div", { class: "small", style: "font-weight:600", text: icon + flash.msg })]);
      (flash.notes || []).forEach(function (m) { fb.appendChild(el("div", { class: "small", text: "⚠ " + m })); });
      p.appendChild(fb);
    }
    var saveWarn = persistenceWarning();
    if (saveWarn) p.appendChild(saveWarn);
    return p;
  }

  function genButton() {
    var existing = findBudgetForCombo(selScn, selCost);
    if (existing) {
      var st = statusOf(existing);
      return el("button", { class: "btn", onClick: doGenerate },
        [st.state === "stale" ? "Regenerate now (refresh) →" : "Regenerate now (replace) →"]);
    }
    return el("button", { class: "btn", onClick: doGenerate }, ["Generate now →"]);
  }

  // ---- queue panel ------------------------------------------------------
  function renderQueue() {
    var p = el("div", { class: "panel" });
    p.appendChild(el("h2", { text: "Generation queue (" + queue.length + ")" }));
    p.appendChild(el("p", { class: "muted small", text: "Give each budget a name and an optional description, then generate them all at once. Combinations that already exist in the library are replaced (refreshed)." }));

    var tbl = el("table", { class: "gen-table queue-table" }, [
      el("tr", {}, [el("th", { text: "Combination" }), el("th", { text: "Budget name" }), el("th", { text: "Description (optional)" }), el("th", { text: "" })])
    ]);
    queue.forEach(function (item, i) {
      var scn = scnById(item.scnId), cost = costById(item.costId);
      var combo = scn && cost ? comboName(scn, cost) : "(source deleted)";
      var exists = findBudgetForCombo(item.scnId, item.costId);
      var notes = scn && cost ? previewNotes(scn, cost) : ["Source scenario or cost set is missing."];

      var nameI = document.createElement("input"); nameI.type = "text"; nameI.value = item.name; nameI.style.width = "100%";
      nameI.addEventListener("input", function () { item.name = nameI.value; });
      var descI = document.createElement("input"); descI.type = "text"; descI.value = item.description; descI.style.width = "100%"; descI.placeholder = "e.g. NSP package, baseline prices";
      descI.addEventListener("input", function () { item.description = descI.value; });

      tbl.appendChild(el("tr", {}, [
        el("td", {}, [el("div", { class: "small", text: combo }), exists ? el("div", { class: "muted small", text: "already in library — will refresh" }) : null, el("div", { class: notes.length ? "small" : "muted small", title: notes.join("\n"), text: warningText(notes.length) })]),
        el("td", {}, [nameI]),
        el("td", {}, [descI]),
        el("td", { class: "act-cell" }, [el("span", { class: "x", title: "Remove from queue", text: "×", onClick: function () { removeFromQueue(i); } })])
      ]));
    });
    p.appendChild(tbl);

    p.appendChild(el("div", { class: "queue-foot" }, [
      el("button", { class: "btn", onClick: generateQueue }, ["Generate all (" + queue.length + ") →"]),
      el("button", { class: "btn secondary", onClick: clearQueue }, ["Clear queue"])
    ]));
    return p;
  }

  function badge(state) {
    var txt = state === "stale" ? "Out of date" : (state === "deleted" ? "Source deleted" : "Current");
    return el("span", { class: "bstat " + state, text: txt });
  }

  function renderLibrary() {
    var p = el("div", { class: "panel" });
    p.appendChild(el("h2", { text: "Budget library" }));
    var list = budgets();
    if (!list.length) {
      p.appendChild(el("p", { class: "muted small", text: "No budgets yet. Generate one above — it is saved here automatically." }));
      return p;
    }

    var nSel = Object.keys(compareSel).filter(function (k) { return compareSel[k]; }).length;
    var canCompare = nSel >= 2;
    p.appendChild(el("div", { class: "lib-bar" }, [
      el("span", { class: "small muted", text: nSel ? (nSel + " selected") : "Tick two or more budgets to compare" }),
      el("button", { class: "btn secondary", disabled: canCompare ? null : "disabled", onClick: compareSelected }, ["Compare selected →"])
    ]));

    var tbl = el("table", { class: "gen-table lib-table" }, [
      el("tr", {}, [el("th", { text: "" }), el("th", { text: "Budget" }), el("th", { text: "Plan years" }), el("th", { text: "Interventions" }), el("th", { text: "Generated" }), el("th", { text: "Status" }), el("th", { text: "" })])
    ]);
    list.slice().reverse().forEach(function (b) {
      var st = statusOf(b);
      var a = b.aggregates || {};
      var years = (a.years && a.years.length) ? (a.years[0] + "–" + a.years[a.years.length - 1]) : "—";
      var nIv = (a.byIntervention || []).length;

      var cb = el("input", { type: "checkbox" }); cb.checked = !!compareSel[b.id];
      cb.addEventListener("click", function (e) { e.stopPropagation(); });
      cb.addEventListener("change", function () { compareSel[b.id] = cb.checked; refresh(); });

      var nameCell = el("td", {}, [
        el("div", { class: "lib-name" }, [
          b.name || (b.scenarioName + " × " + b.costSetName),
          (b.notes && b.notes.length) ? el("span", { class: "info", title: b.notes.join("\n"), text: "⚠" }) : null
        ]),
        el("div", { class: "muted small", text: b.scenarioName + "  ·  " + b.costSetName }),
        b.description ? el("div", { class: "lib-desc small", text: b.description }) : null
      ]);

      var acts = el("td", { class: "act-cell" }, [
        st.state === "stale" ? el("button", { class: "linkbtn", title: "Regenerate from the updated source", onClick: function (e) { e.stopPropagation(); regenerate(b); } }, ["Regenerate"]) : null,
        st.state !== "deleted" ? el("button", { class: "linkbtn", title: "Open in Visualisation", onClick: function (e) { e.stopPropagation(); openInViz(b.id); } }, ["View"]) : null,
        el("button", { class: "linkbtn", title: "Export full budget to Excel", onClick: function (e) { e.stopPropagation(); exportXlsx(b); } }, ["Excel"]),
        el("button", { class: "linkbtn", title: "Edit name & description", onClick: function (e) { e.stopPropagation(); editBudget(b); } }, ["Edit"]),
        el("span", { class: "x", title: "Delete budget", text: "×", onClick: function (e) { e.stopPropagation(); confirmDelete(b); } })
      ]);

      var tr = el("tr", { class: "lib-row" + (st.state === "deleted" ? " row-muted" : ""), "data-bid": b.id, role: "button", tabindex: "0" }, [
        el("td", {}, [cb]),
        nameCell,
        el("td", { text: years }),
        el("td", { text: String(nIv) }),
        el("td", { class: "muted small", title: (b.generatedAt || ""), text: G.util.relTime(b.generatedAt) }),
        el("td", {}, [badge(st.state)]),
        acts
      ]);
      tr.addEventListener("click", function () { if (st.state !== "deleted") openInViz(b.id); });
      tr.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && st.state !== "deleted") { e.preventDefault(); openInViz(b.id); } });
      tbl.appendChild(tr);
    });
    p.appendChild(tbl);
    p.appendChild(el("p", { class: "muted small", style: "margin-top:8px", text: "Click a budget to open it on the Visualisation tab. “Out of date” means its scenario or cost set changed since it was generated." }));
    return p;
  }

  // ---- row actions ------------------------------------------------------
  function exportXlsx(b) { GMB.xlsx.download(safeName(b.name), GMB.budgetSheets(b)); }
  function safeName(n) { return String(n || "budget").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60); }

  function editBudget(b) {
    var nameI = document.createElement("input"); nameI.type = "text"; nameI.value = b.name || ""; nameI.style.width = "100%";
    var descI = document.createElement("textarea"); descI.value = b.description || ""; descI.rows = 3; descI.style.width = "100%";
    var err = el("div", { class: "small", style: "color:var(--red);margin-top:6px;display:none" });
    var modal = G.ui.openModal({
      title: "Edit budget",
      body: el("div", {}, [
        el("label", { class: "small muted", text: "Budget name" }), nameI,
        el("label", { class: "small muted", style: "display:block;margin-top:10px", text: "Description (optional)" }), descI,
        err
      ]),
      footer: [
        el("button", { class: "btn secondary", onClick: function () { modal.close(); } }, ["Cancel"]),
        el("button", { class: "btn", onClick: function () {
          var v = nameI.value.trim();
          if (!v) { err.textContent = "Name can’t be empty."; err.style.display = "block"; return; }
          var dup = budgets().some(function (x) { return x.id !== b.id && (x.name || "") === v; });
          if (dup) { err.textContent = "That name is already used by another budget."; err.style.display = "block"; return; }
          var nb = JSON.parse(JSON.stringify(b)); nb.name = v; nb.description = descI.value;
          G.store.updateBudget(nb); modal.close(); refresh();
        } }, ["Save"])
      ]
    });
    setTimeout(function () { nameI.focus(); nameI.select(); }, 30);
  }

  function confirmDelete(b) {
    var modal = G.ui.openModal({
      title: "Delete budget",
      body: el("p", { text: "Delete “" + (b.name || b.scenarioName) + "”? This removes the generated budget. The scenario and cost set are not affected." }),
      footer: [
        el("button", { class: "btn secondary", onClick: function () { modal.close(); } }, ["Cancel"]),
        el("button", { class: "btn danger", onClick: function () { delete compareSel[b.id]; G.store.removeBudget(b.id); modal.close(); refresh(); } }, ["Delete budget"])
      ]
    });
  }

  G.tabs.generate = {
    render: function (root) { rootEl = root; flash = null; renderBody(); }
  };
})(GMB);
