/* Scenario specification — SNT-style page (Phase 2a + 2b).
   Layout: 1 plan basics · 2 stratification · [3 mix | 4 map viewer] · 5 specifications · sticky summary.
   Geography/timing overrides live in iv.geo[key] = {years?, coverage?, targetPct?}. Nothing is
   persisted until "Save scenario" is clicked (current is an in-memory working copy). */
window.GMB = window.GMB || {};
GMB.tabs = GMB.tabs || {};

(function (G) {
  var el = G.ui.el;
  var COLORS = ["#1D9E75", "#EF9F27", "#E24B4A", "#7F77DD", "#378ADD", "#D85A30"];
  var ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
  var BRIGHT = ["#4363d8", "#3cb44b", "#f58231", "#e6194B", "#911eb4", "#f032e6", "#42d4f4", "#bfef45", "#9A6324", "#800000", "#808000", "#000075"];
  var YEAR_PALETTE = ["#4363d8", "#3cb44b", "#f58231", "#e6194B", "#42d4f4", "#911eb4"];
  var ALL_COLOR = "#0c4a9e", MULTI_COLOR = "#9A6324", OFF_COLOR = "#dfe5ee", NONE_COLOR = "#f3f5f8";
  var SHORT = { mii: "Mass ITN", mii_routine: "Routine ITN", irs: "IRS", smc: "SMC", iptsc: "IPTsc", vax: "Vaccine", iptp: "IPTp" };
  var COV_BASED = ["mii", "mii_routine", "irs", "smc", "iptsc"];

  var current = null, mapApi = null, rootEl = null, flash = "", viewerIv = "__mix__", viewerStagger = false, lastSavedJson = null;

  var TARGET_PRESETS = [
    { key: "total", label: "Total population", def: { mode: "total" } },
    { key: "households", label: "Households", def: { mode: "households" } },
    { key: "u5", label: "Children under 5", def: { mode: "groups", groups: [{ label: "Children under 5", pct: 16 }] } },
    { key: "smc359", label: "Children 3–59 months", def: { mode: "groups", groups: [{ label: "Children 3–11 months", pct: 3.0 }, { label: "Children 12–59 months", pct: 11.5 }] } },
    { key: "school", label: "School-age children (5–15)", def: { mode: "groups", groups: [{ label: "Primary school-age", pct: 16 }, { label: "Secondary school-age", pct: 9 }] } },
    { key: "pw", label: "Pregnant women", def: { mode: "groups", groups: [{ label: "Pregnant women", pct: 4.2 }] } },
    { key: "infant", label: "Infant vaccine cohort", def: { mode: "groups", groups: [{ label: "Infant vaccine cohort", pct: 3.5 }] } },
    { key: "routine", label: "Routine-eligible (ANC + infants)", def: { mode: "groups", groups: [{ label: "Routine-eligible (ANC + infants)", pct: 8.24 }] } }
  ];
  function presetByKey(k) { return TARGET_PRESETS.filter(function (p) { return p.key === k; })[0]; }

  function uid(p) { return p + "_" + Math.random().toString(36).slice(2, 9); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function num(n) { return G.util.fmtNum(n); }
  function snap() { return JSON.stringify(current); }
  function isDirty() { return lastSavedJson === null || snap() !== lastSavedJson; }
  function catIndex(code) { return G.catalog.map(function (c) { return c.code; }).indexOf(code); }
  function legacyType(code, type) {
    if (code !== "irs") return type;
    if (type === "Organophosphate" || type === "Carbamate" || type === "Pyrethroid") return "Actellic";
    return type;
  }

  function defaultBands() {
    return [
      { id: uid("b"), name: "Strata I", min: 0, max: 10, color: COLORS[0] },
      { id: uid("b"), name: "Strata II", min: 10, max: 30, color: COLORS[1] },
      { id: uid("b"), name: "Strata III", min: 30, max: null, color: COLORS[2] }
    ];
  }
  function bandsResolved(scn) {
    return scn.strata.bands.map(function (b) { return { id: b.id, name: b.name, min: b.min, max: b.max == null ? Infinity : b.max, color: b.color }; });
  }

  /** Years a mass campaign runs within the plan window, from a {mode, firstYear, everyYears} config. */
  function campaignYears(camp, years) {
    if (!camp) return years.slice();
    var lo = Math.min.apply(null, years), hi = Math.max.apply(null, years), out = [];
    if (camp.mode === "oneoff") out = [camp.firstYear];
    else {
      var step = Math.max(1, camp.everyYears || 3);
      for (var y = camp.firstYear; y <= hi; y += step) out.push(y);
      for (var z = camp.firstYear - step; z >= lo; z -= step) out.push(z);
    }
    out = out.filter(function (y) { return years.indexOf(y) !== -1; });
    if (!out.length) out = [years.slice().sort(function (a, b) { return Math.abs(a - camp.firstYear) - Math.abs(b - camp.firstYear); })[0]];
    return out.sort(function (a, b) { return a - b; });
  }

  function buildScenario(templateId) {
    var tpl = G.templates[templateId] || null;
    var scn = {
      id: uid("scn"), name: tpl ? tpl.name : "New scenario", template: templateId,
      description: tpl ? (tpl.description || "") : "",
      years: [2026, 2027, 2028], assumptions: { growth: G.assumptions.defaultGrowth },
      strata: { averagingYears: tpl ? tpl.averagingYears.slice() : G.strata.defaultAveragingYears.slice(), bands: defaultBands(), overrides: {} },
      interventions: {}, schemaVersion: 4
    };
    var topId = scn.strata.bands[scn.strata.bands.length - 1].id;
    G.catalog.forEach(function (c) {
      var t = tpl && tpl.interventions[c.code];
      var iv = {
        enabled: !!t, type: c.types[0],
        scope: t ? clone(t.scope) : { mode: "strata", strata: [topId] },
        params: Object.assign({}, c.defaults, (t && t.params) || {}),
        target: JSON.parse(JSON.stringify(c.target)),
        coverageVary: "none", coverageByYear: null, coverageByStratum: null,
        typeVary: "none", typeByYear: null, typeByStratum: null,
        activeYears: scn.years.slice(), geo: {},
        levers: (t && t.levers) ? clone(t.levers) : {}
      };
      // Mass ITN runs as a campaign — default a single 2028 campaign (matches the model), every 3 years.
      if (c.code === "mii") { iv.campaign = { mode: "recurring", firstYear: 2028, everyYears: 3 }; iv.activeYears = campaignYears(iv.campaign, scn.years); }
      scn.interventions[c.code] = iv;
    });
    return scn;
  }

  function remapTemplateStrata(scn) {
    var pos = { I: 0, II: 1, III: 2 }, bands = scn.strata.bands;
    Object.keys(scn.interventions).forEach(function (code) {
      var sc = scn.interventions[code].scope;
      if (sc && sc.mode === "strata" && sc.strata)
        sc.strata = sc.strata.map(function (id) { return (pos[id] != null && bands[pos[id]]) ? bands[pos[id]].id : id; })
          .filter(function (id) { return bands.some(function (b) { return b.id === id; }); });
    });
  }

  function normalize(prevYears) {
    var ids = current.strata.bands.map(function (b) { return b.id; });
    function eqSet(a, b) { return a.length === b.length && a.every(function (x) { return b.indexOf(x) !== -1; }); }
    function inPlan(y) { return current.years.indexOf(y) !== -1; }
    Object.keys(current.interventions).forEach(function (code) {
      var iv = current.interventions[code], sc = iv.scope;
      iv.type = legacyType(code, iv.type);
      if (iv.typeByYear) Object.keys(iv.typeByYear).forEach(function (y) { iv.typeByYear[y] = legacyType(code, iv.typeByYear[y]); });
      if (iv.typeByStratum) Object.keys(iv.typeByStratum).forEach(function (b) { iv.typeByStratum[b] = legacyType(code, iv.typeByStratum[b]); });
      Object.keys(iv.geo || {}).forEach(function (k) { if (iv.geo[k] && iv.geo[k].type) iv.geo[k].type = legacyType(code, iv.geo[k].type); });
      if (sc && sc.mode === "strata") sc.strata = (sc.strata || []).filter(function (id) { return ids.indexOf(id) !== -1; });
      if (prevYears && iv.campaign) iv.activeYears = campaignYears(iv.campaign, current.years);
      else if (prevYears && eqSet(iv.activeYears, prevYears)) iv.activeYears = current.years.slice();
      else iv.activeYears = iv.activeYears.filter(inPlan);
      if (!iv.activeYears.length) iv.activeYears = iv.campaign ? campaignYears(iv.campaign, current.years) : current.years.slice();
      Object.keys(iv.geo || {}).forEach(function (k) { if (iv.geo[k].years) iv.geo[k].years = iv.geo[k].years.filter(inPlan); });
    });
  }

  function computeAssignment(scn) {
    var bands = bandsResolved(scn), popYear = Math.max.apply(null, scn.years);
    return { bands: bands, result: G.strata.assign(bands, scn.strata.averagingYears, scn.strata.overrides, popYear, scn.assumptions.growthByYear || scn.assumptions.growth) };
  }
  function nationalPop(year) { var g = growthArg(); var t = 0; G.reference.districtPairs().forEach(function (d) { t += G.assumptions.population(d.adm1, d.adm2, year, g); }); return t; }
  function geoOf(iv, key) { return iv.geo && iv.geo[key]; }
  function groupSum(iv) { return ((iv.target && iv.target.groups) || []).reduce(function (a, g) { return a + (g.pct || 0); }, 0); }
  function hhSizeFor(adm1) { var o = current.assumptions.householdSize; return (o && o[adm1] != null) ? o[adm1] : G.assumptions.householdSize(adm1); }
  function ivTargetPop(iv, adm1, adm2, year) {
    var base = G.assumptions.population(adm1, adm2, year, growthArg());
    var t = iv.target || { mode: "total" };
    if (t.mode === "total") return base;
    if (t.mode === "households") return base / hhSizeFor(adm1);
    var g = geoOf(iv, adm1 + "|" + adm2);
    var pct = (g && g.targetPct != null) ? g.targetPct : groupSum(iv);
    return base * pct / 100;
  }
  function resolveCoverage(iv, ctx, compKey) {
    compKey = compKey || "coverage"; ctx = ctx || {};
    var g = ctx.key && geoOf(iv, ctx.key);
    if (compKey === "coverage" && g && g.coverage != null) return g.coverage;
    var byY = iv.coverageVary === "year" && iv.coverageByYear && iv.coverageByYear[ctx.year];
    if (byY && byY[compKey] != null) return byY[compKey];
    var byS = iv.coverageVary === "stratum" && iv.coverageByStratum && ctx.bandId != null && iv.coverageByStratum[ctx.bandId];
    if (byS && byS[compKey] != null) return byS[compKey];
    return iv.params[compKey];
  }
  // coverage components per intervention (single value, or dose/contact sets)
  function coverageComps(c) {
    if (c.code === "vax") return [["dose1", "d1"], ["dose2", "d2"], ["dose3", "d3"], ["dose4", "d4"]];
    if (c.code === "iptp") return [["contact1", "c1"], ["contact2", "c2"], ["contact3", "c3"], ["contact4", "c4"]];
    return [["coverage", null]];
  }
  function coverageLabel(c) { return c.code === "vax" ? "Dose coverage" : c.code === "iptp" ? "Contact coverage" : "Coverage"; }
  function compSnapshot(iv, comps) { var o = {}; comps.forEach(function (cp) { o[cp[0]] = iv.params[cp[0]]; }); return o; }
  function resolveType(iv, ctx) {
    ctx = ctx || {};
    var g = ctx.key && geoOf(iv, ctx.key);
    if (g && g.type) return g.type;
    if (iv.typeVary === "year" && iv.typeByYear && iv.typeByYear[ctx.year]) return iv.typeByYear[ctx.year];
    if (iv.typeVary === "stratum" && iv.typeByStratum && ctx.bandId != null && iv.typeByStratum[ctx.bandId]) return iv.typeByStratum[ctx.bandId];
    return iv.type;
  }
  function activeYearsFor(iv, key) {
    var g = geoOf(iv, key);
    if (g && g.years) return g.years;
    return iv.activeYears && iv.activeYears.length ? iv.activeYears : current.years;
  }
  function isActive(iv, key, year) { return activeYearsFor(iv, key).indexOf(year) !== -1; }
  function geoOverrideCount(iv) { return Object.keys(iv.geo || {}).filter(function (k) { var g = iv.geo[k]; return g && (g.years || g.coverage != null || g.targetPct != null || g.type); }).length; }
  function coveredKeys(scn, assignment) {
    var set = {};
    G.catalog.forEach(function (c) { var iv = scn.interventions[c.code]; if (iv && iv.enabled) Object.keys(G.resolveScope(iv.scope, assignment.result)).forEach(function (k) { set[k] = true; }); });
    return set;
  }

  // ---------- input helpers ----------
  function numEl(val, on, o) {
    o = o || {}; var i = document.createElement("input"); i.type = "number"; i.value = (val == null ? "" : val);
    ["min", "max", "step"].forEach(function (k) { if (o[k] != null) i.setAttribute(k, o[k]); });
    if (o.placeholder != null) i.placeholder = o.placeholder; i.style.width = o.width || "70px";
    i.addEventListener("change", function () { on(i.value === "" ? null : parseFloat(i.value)); }); return i;
  }
  function pctEl(frac, on) { return numEl(frac == null ? null : Math.round(frac * 100), function (v) { on(v == null ? null : v / 100); }, { min: 0, max: 100, step: 1, width: "56px" }); }
  function chk(checked, on, disabled) { var i = document.createElement("input"); i.type = "checkbox"; i.checked = !!checked; if (disabled) i.disabled = true; i.addEventListener("change", function () { on(i.checked); }); return i; }
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
  function ceaseReductionFromMonths(months) {
    var LD = G.assumptions.leverDefaults || {}, baseMonths = LD.ceaseMonths || 1, baseReduction = LD.ceaseReduction || 0;
    var m = Math.max(0, Math.min(24, Number(months) || 0));
    return Math.max(0, Math.min(100, Math.round((m * baseReduction / baseMonths) * 10) / 10));
  }

  // ---------- render ----------
  function refresh() { renderBody(); }

  function renderBody() {
    var wasClean = lastSavedJson !== null && snap() === lastSavedJson;
    normalize(null);
    if (wasClean) lastSavedJson = snap();
    var assignment = computeAssignment(current);
    rootEl.innerHTML = "";
    rootEl.appendChild(GMB.ui.pageHelp("scenario"));
    var layout = el("div", { class: "scn-layout" });
    var main = el("div", { class: "scn-main" });
    main.appendChild(renderBasics());
    main.appendChild(renderStrata(assignment));
    main.appendChild(el("div", { class: "scn-grid2" }, [renderMix(assignment), renderViewer(assignment)]));
    main.appendChild(renderSpecs(assignment));
    layout.appendChild(main);
    layout.appendChild(renderSummary(assignment));
    rootEl.appendChild(layout);
    applyMapColors(assignment);
  }

  function renderBasics() {
    var p = el("div", { class: "panel" });
    p.appendChild(el("div", { class: "scn-h" }, [el("span", { class: "scn-step", text: "1" }), "Plan basics"]));
    var name = document.createElement("input"); name.type = "text"; name.value = current.name; name.style.maxWidth = "360px";
    name.addEventListener("input", function () { current.name = name.value; updateSaveState(); });
    var yearChips = el("div", { class: "chip-row" }, [2026, 2027, 2028, 2029, 2030, 2031].map(function (y) {
      return chip(String(y), current.years.indexOf(y) !== -1, function () {
        var prev = current.years.slice(), i = current.years.indexOf(y);
        if (i === -1) current.years.push(y); else if (current.years.length > 1) current.years.splice(i, 1);
        current.years.sort(function (a, b) { return a - b; }); normalize(prev); refresh();
      });
    }));
    var ord = { nsp: 0, bau: 1, optimistic: 2, realistic: 3, pessimistic: 4 };
    var scns = G.store.get().scenarios.slice().sort(function (a, b) {
      return (ord[a.template] != null ? ord[a.template] : 99) - (ord[b.template] != null ? ord[b.template] : 99);
    });
    var scnChips = el("div", { class: "chip-row" }, scns.map(function (s) {
      return chip(s.name, s.id === current.id, function () { guardUnsaved(function () { loadScenario(s.id); }); }, s.description || s.name);
    }).concat([
      chip("⧉ Duplicate", false, function () { guardUnsaved(function () { duplicateScenario(); }); }),
      chip("+ New", false, function () { guardUnsaved(function () { newScenario(); }); })
    ]));
    var actions = el("div", { class: "actions-row" }, [
      el("button", { class: "linkbtn", onClick: exportScenarioXlsx }, ["⬇ Export to Excel"])
    ]);
    p.appendChild(el("div", { class: "field" }, [el("label", { text: "Scenario" }), scnChips, actions]));
    p.appendChild(el("div", { class: "field" }, [el("label", { text: "Scenario name" }), name]));
    var notes = document.createElement("textarea"); notes.value = current.description || ""; notes.rows = 2;
    notes.placeholder = "Optional — a longer description of this scenario";
    notes.style.width = "100%"; notes.style.maxWidth = "560px";
    notes.addEventListener("input", function () { current.description = notes.value; updateSaveState(); });
    p.appendChild(el("div", { class: "field" }, [el("label", { text: "Notes / description" }), notes]));
    p.appendChild(el("div", { class: "field" }, [el("label", { text: "Plan years" }), el("div", { class: "muted small", style: "margin:-2px 0 5px", text: "Each year is quantified and costed separately." }), yearChips]));
    return p;
  }
  function applyTemplate(id) {
    var keepName = current.name, keepId = current.id, keepYears = current.years.slice();
    current = buildScenario(id); current.id = keepId; current.years = keepYears;
    Object.keys(current.interventions).forEach(function (code) { var iv = current.interventions[code]; iv.activeYears = iv.campaign ? campaignYears(iv.campaign, keepYears) : keepYears.slice(); });
    if (id === "blank") current.name = keepName;
    remapTemplateStrata(current); lastSavedJson = null; refresh();
  }

  function renderStrata(assignment) {
    var bands = assignment.bands, p = el("div", { class: "panel" });
    p.appendChild(el("div", { class: "scn-h" }, [el("span", { class: "scn-step", text: "2" }), "Stratification rules"]));
    p.appendChild(el("p", { class: "muted small", text: "Group districts by mean malaria incidence per 1,000. Click a district to override its stratum." }));
    var avg = el("div", { class: "chip-row" }, [2020, 2021, 2022, 2023, 2024, 2025].map(function (y) {
      return chip(String(y), current.strata.averagingYears.indexOf(y) !== -1, function () {
        var i = current.strata.averagingYears.indexOf(y);
        if (i === -1) current.strata.averagingYears.push(y); else if (current.strata.averagingYears.length > 1) current.strata.averagingYears.splice(i, 1);
        current.strata.averagingYears.sort(function (a, b) { return a - b; }); refresh();
      });
    }));
    p.appendChild(el("div", { class: "field" }, [el("label", { text: "Average incidence over years" }), avg]));

    var editor = el("div", { class: "band-editor" });
    current.strata.bands.forEach(function (b, i) {
      var last = i === current.strata.bands.length - 1;
      var nameI = document.createElement("input"); nameI.type = "text"; nameI.value = b.name; nameI.style.width = "110px";
      nameI.addEventListener("input", function () { b.name = nameI.value; updateSaveState(); });
      var range;
      if (!last) { var cut = numEl(b.max, function (v) { if (v != null) { b.max = v; current.strata.bands[i + 1].min = v; refresh(); } }, { min: 0, step: 1, width: "60px" }); range = el("span", { class: "small" }, [(i === 0 ? "< " : num(b.min) + " – "), cut]); }
      else range = el("span", { class: "small", text: "≥ " + num(b.min) });
      var rm = current.strata.bands.length > 1 ? el("span", { class: "x", title: "Remove stratum", text: "×", onClick: function () { removeBand(b.id); } }) : null;
      editor.appendChild(el("div", { class: "band-row" }, [el("span", { class: "swatch", style: "background:" + b.color }), nameI, range, rm]));
    });
    editor.appendChild(el("button", { class: "linkbtn", style: "align-self:flex-start;margin-top:4px", onClick: addBand }, ["+ add stratum"]));
    p.appendChild(editor);

    var natPop = nationalPop(Math.max.apply(null, current.years)), counts = el("div", { class: "stat-grid" });
    bands.forEach(function (b) {
      var bk = assignment.result.byBand[b.id], pct = natPop ? Math.round(bk.population / natPop * 100) : 0;
      counts.appendChild(el("div", { class: "stat", style: "border-left:4px solid " + b.color }, [
        el("div", { class: "value", text: bk.count }),
        el("div", { class: "label", html: G.util.esc(b.name) + " · " + num(bk.population) + " people · <b>" + pct + "%</b> of pop" })
      ]));
    });
    p.appendChild(counts);
    p.appendChild(el("div", { class: "map-toolbar" }, [
      el("div", { class: "chip-row small" }, bands.map(function (b) { return el("span", {}, [el("span", { class: "swatch", style: "background:" + b.color }), " " + b.name]); })),
      G.ui.downloadButton(function () { return mapApi.el; }, "gambia-strata.png", "Download map")
    ]));
    p.appendChild(el("div", { class: "map-wrap" }, [mapApi.el]));
    var nOver = Object.keys(current.strata.overrides).length;
    if (nOver) p.appendChild(el("div", { class: "small", style: "margin-top:8px" }, [nOver + " override" + (nOver > 1 ? "s" : "") + ". ", el("a", { href: "#", text: "Clear all", onClick: function (e) { e.preventDefault(); current.strata.overrides = {}; refresh(); } })]));
    return p;
  }
  function addBand() {
    var bands = current.strata.bands, last = bands[bands.length - 1], splitAt = (last.min || 0) + 20;
    last.max = splitAt;
    bands.push({ id: uid("b"), name: "Strata " + (ROMAN[bands.length] || (bands.length + 1)), min: splitAt, max: null, color: COLORS[bands.length % COLORS.length] });
    refresh();
  }
  function removeBand(id) {
    var bands = current.strata.bands; if (bands.length <= 1) return;
    var i = bands.map(function (b) { return b.id; }).indexOf(id); if (i === -1) return;
    if (i === bands.length - 1) bands[i - 1].max = null; else bands[i + 1].min = bands[i].min;
    bands.splice(i, 1);
    var nb = bands[Math.min(i, bands.length - 1)];
    Object.keys(current.strata.overrides).forEach(function (k) { if (current.strata.overrides[k] === id) current.strata.overrides[k] = nb.id; });
    refresh();
  }
  function onDistrictClick(key) {
    var bands = current.strata.bands, a = computeAssignment(current), cur = a.result.byDistrict[key], idx = bands.map(function (b) { return b.id; }).indexOf(cur);
    current.strata.overrides[key] = bands[(idx + 1) % bands.length].id; refresh();
  }
  function applyMapColors(assignment) {
    var colorByBand = {}; assignment.bands.forEach(function (b) { colorByBand[b.id] = b.color; });
    mapApi.setColors(function (k) { return colorByBand[assignment.result.byDistrict[k]]; });
    mapApi.setOutline(function (k) { return !!current.strata.overrides[k]; });
    mapApi.setTitles(function (k, props) {
      var inc = assignment.result.incByDistrict[k], bandId = assignment.result.byDistrict[k], band = assignment.bands.filter(function (b) { return b.id === bandId; })[0];
      return props.adm2 + " — " + (inc == null ? "no data" : Math.round(inc * 10) / 10 + "/1,000") + " · " + (band ? band.name : "") + (current.strata.overrides[k] ? " (override)" : "");
    });
  }

  function renderMix(assignment) {
    var bands = assignment.bands, p = el("div", { class: "panel" });
    p.appendChild(el("div", { class: "scn-h" }, [el("span", { class: "scn-step", text: "3" }), "Intervention mix by stratum"]));
    p.appendChild(el("p", { class: "muted small", text: "Turn interventions on and choose which strata each runs in. Set details in step 5." }));
    var table = el("table", { class: "iv-table" });
    table.appendChild(el("tr", {}, [el("th", { text: "Intervention" }), el("th", { text: "On" }), el("th", { text: "All" })]
      .concat(bands.map(function (b) { return el("th", { text: b.name.replace("Strata ", "S ") }); })).concat([el("th", { text: "Distr." })])));
    G.catalog.forEach(function (c) {
      var iv = current.interventions[c.code], sc = iv.scope, isEvery = sc.mode === "everywhere", isStrata = sc.mode === "strata";
      var nDist = iv.enabled ? Object.keys(G.resolveScope(sc, assignment.result)).length : 0;
      var cells = [el("td", { class: "iv-name", text: c.nice }),
        el("td", {}, [chk(iv.enabled, function (v) { iv.enabled = v; refresh(); })]),
        el("td", {}, [chk(isEvery, function (v) { iv.scope = v ? { mode: "everywhere" } : { mode: "strata", strata: bands.map(function (b) { return b.id; }) }; refresh(); }, !iv.enabled)])];
      bands.forEach(function (b) {
        var on = isEvery || (isStrata && sc.strata.indexOf(b.id) !== -1);
        cells.push(el("td", {}, [chk(on, function (v) {
          var set = isStrata ? sc.strata.slice() : (isEvery ? bands.map(function (x) { return x.id; }) : []);
          var i = set.indexOf(b.id); if (v && i === -1) set.push(b.id); if (!v && i !== -1) set.splice(i, 1);
          iv.scope = { mode: "strata", strata: set, exclude: sc.exclude }; refresh();
        }, !iv.enabled || isEvery)]));
      });
      cells.push(el("td", { class: "iv-dist" }, [sc.mode === "custom" ? "cust" : String(nDist)]));
      table.appendChild(el("tr", { class: iv.enabled ? "" : "iv-off" }, cells));
    });
    p.appendChild(table);
    return p;
  }

  // ---- step 4: map viewer ----
  function renderViewer(assignment) {
    var p = el("div", { class: "panel" });
    p.appendChild(el("div", { class: "scn-h" }, [el("span", { class: "scn-step", text: "4" }), "Intervention map viewer"]));
    var enabled = G.catalog.filter(function (c) { return current.interventions[c.code].enabled; });
    if (viewerIv !== "__mix__" && !enabled.some(function (c) { return c.code === viewerIv; })) viewerIv = "__mix__";
    var opts = [{ value: "__mix__", label: "Intervention mix (all years)" }].concat(enabled.map(function (c) { return { value: c.code, label: c.nice }; }));
    var ctl = el("div", { class: "chip-row small" }, [el("span", { class: "muted", text: "View" }), selEl(opts, viewerIv, function (v) { viewerIv = v; refresh(); })]);
    if (viewerIv !== "__mix__") ctl.appendChild(el("label", { class: "small inline-toggle" }, [chk(viewerStagger, function (v) { viewerStagger = v; refresh(); }), " year by year"]));
    p.appendChild(ctl);
    if (viewerIv === "__mix__") return renderMixMap(p, assignment, enabled);
    return renderSingleMap(p, assignment, G.catalogByCode(viewerIv), current.interventions[viewerIv]);
  }

  function renderMixMap(p, assignment, enabled) {
    p.appendChild(el("div", { class: "small muted", style: "margin:4px 0", text: "Colour = the combination of interventions running in each district (across all years)." }));
    var coveredByCode = {}; enabled.forEach(function (c) { coveredByCode[c.code] = G.resolveScope(current.interventions[c.code].scope, assignment.result); });
    function combo(k) { return enabled.filter(function (c) { return coveredByCode[c.code][k]; }).map(function (c) { return c.code; }); }
    var colorOf = {}, order = [], countOf = {};
    G.reference.districtPairs().forEach(function (d) {
      var k = d.adm1 + "|" + d.adm2, codes = combo(k), key = codes.join("+"); if (!codes.length) return;
      if (!colorOf[key]) { colorOf[key] = BRIGHT[order.length % BRIGHT.length]; order.push(key); }
      countOf[key] = (countOf[key] || 0) + 1;
    });
    var map = G.ui.gambiaMap({});
    map.setColors(function (k) { var key = combo(k).join("+"); return key ? colorOf[key] : "#eef0f4"; });
    map.setTitles(function (k, pr) { var codes = combo(k); return pr.adm2 + " — " + (codes.map(function (x) { return SHORT[x]; }).join(" + ") || "none"); });
    p.appendChild(el("div", { class: "map-toolbar" }, [el("span", { class: "small muted", text: order.length + " combinations" }), G.ui.downloadButton(function () { return map.el; }, "intervention-mix.png", "Download map")]));
    p.appendChild(el("div", { class: "map-wrap" }, [map.el]));
    p.appendChild(el("div", { class: "viewer-legend" }, order.map(function (key) {
      return el("div", { class: "row" }, [el("span", { class: "swatch", style: "background:" + colorOf[key] }), el("span", {}, [key.split("+").map(function (x) { return SHORT[x]; }).join(" + ") + " (" + countOf[key] + ")"])]);
    })));
    return p;
  }

  function yearCategory(iv, key, covered) {
    if (!covered[key]) return { cat: "none" };
    var ys = activeYearsFor(iv, key).filter(function (y) { return current.years.indexOf(y) !== -1; });
    if (!ys.length) return { cat: "off" };
    if (ys.length === current.years.length) return { cat: "all" };
    if (ys.length === 1) return { cat: "year", year: ys[0] };
    return { cat: "multi", years: ys };
  }
  function yearColor(catObj) {
    if (catObj.cat === "none") return NONE_COLOR;
    if (catObj.cat === "off") return OFF_COLOR;
    if (catObj.cat === "all") return ALL_COLOR;
    if (catObj.cat === "multi") return MULTI_COLOR;
    return YEAR_PALETTE[current.years.indexOf(catObj.year) % YEAR_PALETTE.length];
  }

  function renderSingleMap(p, assignment, c, iv) {
    var covered = G.resolveScope(iv.scope, assignment.result), years = current.years;
    if (!viewerStagger) {
      p.appendChild(el("div", { class: "small muted", style: "margin:4px 0", text: "Fill = the year(s) each district runs (rolled up across all years). Use ‘year by year’ or ‘Set by geography’ in step 5 to edit." }));
      var map = G.ui.gambiaMap({});
      map.setColors(function (k) { return yearColor(yearCategory(iv, k, covered)); });
      map.setTitles(function (k, pr) {
        var cc = yearCategory(iv, k, covered);
        var t = cc.cat === "none" ? "not targeted" : cc.cat === "off" ? "off (no years)" : cc.cat === "all" ? "every year" : cc.cat === "year" ? "only " + cc.year : "years " + cc.years.join(", ");
        return pr.adm2 + " — " + t;
      });
      // legend: categories present
      var present = {};
      Object.keys(covered).forEach(function (k) { var cc = yearCategory(iv, k, covered); present[cc.cat === "year" ? "y" + cc.year : cc.cat] = cc; });
      var legend = el("div", { class: "year-legend" });
      if (present.all) legend.appendChild(el("div", { class: "row" }, [el("span", { class: "swatch", style: "background:" + ALL_COLOR }), "Every year"]));
      years.forEach(function (y) { if (present["y" + y]) legend.appendChild(el("div", { class: "row" }, [el("span", { class: "swatch", style: "background:" + YEAR_PALETTE[years.indexOf(y) % YEAR_PALETTE.length] }), "Only " + y])); });
      if (present.multi) legend.appendChild(el("div", { class: "row" }, [el("span", { class: "swatch", style: "background:" + MULTI_COLOR }), "Multiple years"]));
      if (present.off) legend.appendChild(el("div", { class: "row" }, [el("span", { class: "swatch", style: "background:" + OFF_COLOR }), "Off"]));
      p.appendChild(el("div", { class: "map-toolbar" }, [el("span", { class: "small muted", text: SHORT[c.code] + " · roll-up" }), G.ui.downloadButton(function () { return map.el; }, c.code + "-rollup.png", "Download map")]));
      p.appendChild(el("div", { class: "map-wrap" }, [map.el]));
      p.appendChild(legend);
      return p;
    }
    // year-by-year small multiples (clickable to edit)
    p.appendChild(el("div", { class: "small muted", style: "margin:4px 0", text: "Click a district in any year to add/remove " + SHORT[c.code] + " that year." }));
    var color = BRIGHT[catIndex(c.code) % BRIGHT.length];
    var grid = el("div", { class: "viewer-multiples" });
    years.forEach(function (y) {
      var m = G.ui.gambiaMap({ onClick: function (key) { toggleYear(iv, key, y, covered[key]); } });
      m.setColors(function (k) { return covered[k] ? (isActive(iv, k, y) ? color : "#dfe5ee") : "#f3f5f8"; });
      m.setTitles(function (k, pr) { return pr.adm2 + " — " + (!covered[k] ? "not targeted" : (isActive(iv, k, y) ? "active " + y : "not in " + y)); });
      grid.appendChild(el("div", { class: "viewer-cell" }, [
        el("div", { class: "vc-head" }, [el("strong", { text: String(y) }), G.ui.downloadButton(function () { return m.el; }, c.code + "-" + y + ".png", "PNG")]),
        el("div", { class: "map-wrap small-map" }, [m.el])
      ]));
    });
    p.appendChild(grid);
    return p;
  }
  function ensureGeo(iv, key) { return (iv.geo[key] = iv.geo[key] || {}); }
  function cleanGeo(iv, key) { var g = iv.geo[key]; if (g && !g.years && g.coverage == null && g.targetPct == null && !g.type) delete iv.geo[key]; }
  function toggleYear(iv, key, year, isCovered) {
    if (!isCovered) return;
    var g = ensureGeo(iv, key), ys = (g.years ? g.years.slice() : activeYearsFor(iv, key).slice()), i = ys.indexOf(year);
    if (i === -1) ys.push(year); else ys.splice(i, 1);
    ys.sort(function (a, b) { return a - b; }); g.years = ys; refresh();
  }

  // ---- step 5: specifications ----
  function renderSpecs(assignment) {
    var p = el("div", { class: "panel" });
    p.appendChild(el("div", { class: "scn-h" }, [el("span", { class: "scn-step", text: "5" }), "Intervention specifications"]));
    var enabled = G.catalog.filter(function (c) { return current.interventions[c.code].enabled; });
    if (!enabled.length) { p.appendChild(el("p", { class: "muted small", text: "Turn on interventions in step 3 to set them up here." })); return p; }
    p.appendChild(el("p", { class: "muted small", text: "Set target population, coverage, timing, and levers. Use ‘Set by geography’ for district-level timing/coverage." }));
    var grid = el("div", { class: "spec-grid" });
    enabled.forEach(function (c) { grid.appendChild(renderSpecCard(c, current.interventions[c.code], assignment)); });
    p.appendChild(grid);
    return p;
  }
  // Coverage block — label + Universal/By year/By stratum seg + values, all flowing on one line.
  function renderCoverage(c, iv, assignment, card) {
    var comps = coverageComps(c);
    function compInputs(target, getStore, setStore) {
      comps.forEach(function (cp) {
        if (cp[1]) target.appendChild(el("span", { class: "small", text: cp[1] }));
        target.appendChild(pctEl(getStore(cp[0]), function (v) { setStore(cp[0], v); }));
      });
      if (comps.length === 1) target.appendChild(el("span", { class: "small", text: "%" }));
    }
    var line = el("div", { class: "settings-line wrap" }, [el("span", { class: "small muted", text: coverageLabel(c) }),
      el("div", { class: "seg" }, [["none", "Universal"], ["year", "By year"], ["stratum", "By stratum"]].map(function (m) {
        return el("span", { class: "seg-opt" + (iv.coverageVary === m[0] ? " on" : ""), text: m[1], onClick: function () {
          iv.coverageVary = m[0];
          if (m[0] === "year") { iv.coverageByYear = {}; current.years.forEach(function (y) { iv.coverageByYear[y] = compSnapshot(iv, comps); }); }
          if (m[0] === "stratum") { iv.coverageByStratum = {}; assignment.bands.forEach(function (b) { iv.coverageByStratum[b.id] = compSnapshot(iv, comps); }); }
          refresh();
        } });
      }))]);
    if (iv.coverageVary === "none") compInputs(line, function (k) { return iv.params[k]; }, function (k, v) { iv.params[k] = v; });
    card.appendChild(line);
    if (iv.coverageVary === "year") current.years.forEach(function (y) {
      var yl = el("div", { class: "settings-line wrap sub" }, [el("span", { class: "small muted", text: y })]);
      compInputs(yl, function (k) { return (iv.coverageByYear[y] || {})[k]; }, function (k, v) { (iv.coverageByYear[y] = iv.coverageByYear[y] || {})[k] = v; });
      card.appendChild(yl);
    });
    if (iv.coverageVary === "stratum") assignment.bands.forEach(function (b) {
      var sl = el("div", { class: "settings-line wrap sub" }, [el("span", { class: "small muted", text: b.name.replace("Strata ", "S ") })]);
      compInputs(sl, function (k) { return (iv.coverageByStratum[b.id] || {})[k]; }, function (k, v) { (iv.coverageByStratum[b.id] = iv.coverageByStratum[b.id] || {})[k] = v; });
      card.appendChild(sl);
    });
  }

  function openHouseholdModal() {
    if (!current.assumptions.householdSize) current.assumptions.householdSize = Object.assign({}, G.assumptions.regionHouseholdSize);
    var hs = current.assumptions.householdSize, modal;
    var tbl = el("table", { class: "geo-table" }, [el("tr", {}, [el("th", { text: "Region" }), el("th", { text: "Mean household size" })])]);
    G.reference.regions().forEach(function (r) {
      tbl.appendChild(el("tr", {}, [el("td", { text: r }), el("td", {}, [numEl(hs[r] != null ? hs[r] : G.assumptions.householdSize(r), function (v) { hs[r] = v; }, { min: 1, step: 0.1, width: "70px" })])]));
    });
    modal = G.ui.openModal({
      title: "Mean household size by region",
      body: el("div", {}, [el("p", { class: "muted small", style: "margin-top:0", text: "Used to convert district population into households for IRS (households = population ÷ mean household size). Defaults from household-size.xlsx." }), tbl]),
      footer: [el("button", { class: "linkbtn", onClick: function () { delete current.assumptions.householdSize; modal.close(); } }, ["Reset to defaults"]),
        el("button", { class: "btn", onClick: function () { modal.close(); } }, ["Done"])],
      onClose: function () { refresh(); }
    });
  }

  function renderSpecCard(c, iv, assignment) {
    var card = el("div", { class: "spec-card" });
    var nOv = geoOverrideCount(iv);
    card.appendChild(el("div", { class: "spec-head" }, [
      el("div", {}, [el("strong", { text: c.nice }), el("span", { class: "muted small", style: "margin-left:6px", text: c.commodity })]),
      el("div", { class: "spec-head-right" }, [
        nOv ? el("span", { class: "small muted", style: "margin-right:6px" }, [nOv + " override" + (nOv > 1 ? "s" : "") + " · ", el("a", { href: "#", text: "clear", onClick: function (e) { e.preventDefault(); iv.geo = {}; refresh(); } })]) : null,
        el("button", { class: "linkbtn", onClick: function () { openGeoModal(c, iv); } }, ["Set by geography…"])
      ])
    ]));
    // Type / net type (net-type interventions can vary by year or stratum)
    if (c.types && c.types.length > 1) {
      if (c.varyType) {
        var typeRow = el("div", { class: "settings-line" }, [el("span", { class: "small muted", text: c.typeLabel || "Type" })]);
        if (iv.typeVary === "none") typeRow.appendChild(selEl(c.types, iv.type, function (v) { iv.type = v; }));
        typeRow.appendChild(el("div", { class: "seg" }, [["none", "Universal"], ["year", "By year"], ["stratum", "By stratum"]].map(function (m) {
          return el("span", { class: "seg-opt" + (iv.typeVary === m[0] ? " on" : ""), text: m[1], onClick: function () {
            iv.typeVary = m[0];
            if (m[0] === "year") { iv.typeByYear = {}; current.years.forEach(function (y) { iv.typeByYear[y] = iv.type; }); }
            if (m[0] === "stratum") { iv.typeByStratum = {}; assignment.bands.forEach(function (b) { iv.typeByStratum[b.id] = iv.type; }); }
            refresh();
          } });
        })));
        card.appendChild(typeRow);
        if (iv.typeVary === "year") { var tyr = el("div", { class: "settings-line wrap" }); current.years.forEach(function (y) { tyr.appendChild(el("span", { class: "small", text: y })); tyr.appendChild(selEl(c.types, iv.typeByYear[y] || iv.type, function (v) { iv.typeByYear[y] = v; })); }); card.appendChild(tyr); }
        if (iv.typeVary === "stratum") { var tst = el("div", { class: "settings-line wrap" }); assignment.bands.forEach(function (b) { tst.appendChild(el("span", { class: "small", text: b.name.replace("Strata ", "S ") })); tst.appendChild(selEl(c.types, iv.typeByStratum[b.id] || iv.type, function (v) { iv.typeByStratum[b.id] = v; })); }); card.appendChild(tst); }
      } else {
        card.appendChild(el("div", { class: "settings-line" }, [el("span", { class: "small muted", text: c.typeLabel || "Type" }), selEl(c.types, iv.type, function (v) { iv.type = v; })]));
      }
    }

    // Intervention target population — dropdown + "% of total population" rows
    var tgt = iv.target || { mode: "total", key: "total" };
    card.appendChild(el("div", { class: "settings-line" }, [el("span", { class: "small muted", text: "Intervention target population" }),
      selEl(TARGET_PRESETS.map(function (p) { return { value: p.key, label: p.label }; }), tgt.key || "total", function (v) {
        var p = presetByKey(v); if (p) { iv.target = Object.assign({ key: p.key }, JSON.parse(JSON.stringify(p.def))); refresh(); }
      })]));
    if (tgt.mode === "total") card.appendChild(el("div", { class: "settings-line" }, [el("span", { class: "small muted", text: "100% of total population" })]));
    else if (tgt.mode === "households") card.appendChild(el("div", { class: "settings-line" }, [
      el("a", { href: "#", class: "small", onClick: function (e) { e.preventDefault(); openHouseholdModal(); } }, ["Households"]),
      el("span", { class: "small muted", text: " — district population ÷ region mean household size" }),
      info("Click ‘Households’ to view or edit the region mean household sizes. Structures sprayed = households × coverage.")
    ]));
    else {
      tgt.groups.forEach(function (gr) { card.appendChild(el("div", { class: "settings-line group-row" }, [numEl(gr.pct, function (v) { gr.pct = v; refresh(); }, { min: 0, max: 100, step: 0.01, width: "56px" }), el("span", { class: "small", text: "% of total population — " + gr.label })])); });
      if (tgt.groups.length > 1) card.appendChild(el("div", { class: "settings-line" }, [el("span", { class: "small muted", text: "= " + (Math.round(groupSum(iv) * 100) / 100) + "% of total" })]));
    }

    renderCoverage(c, iv, assignment, card);
    if (c.code === "mii" || c.code === "mii_routine") card.appendChild(el("div", { class: "settings-line" }, [el("span", { class: "small muted", text: "People per net" }), numEl(iv.params.people_per_net, function (v) { iv.params.people_per_net = v; refresh(); }, { min: 1, step: 0.1, width: "54px" }), info("Average people covered per net (e.g. 1.8). Nets needed = target population × coverage ÷ people-per-net × (1 + buffer).")]));
    if (c.code === "smc" || c.code === "iptsc") card.appendChild(el("div", { class: "settings-line" }, [el("span", { class: "small muted", text: "Cycles / yr" }), numEl(iv.params.cycles, function (v) { iv.params.cycles = v; }, { min: 1, step: 1, width: "50px" })]));
    card.appendChild(el("div", { class: "settings-line" }, [el("span", { class: "small muted", text: "Buffer" }), pctEl(iv.params.buffer, function (v) { iv.params.buffer = v; }), el("span", { class: "small", text: "%" })]));

    if (c.code === "mii") {
      var camp = iv.campaign || (iv.campaign = { mode: "recurring", firstYear: 2028, everyYears: 3 });
      var cl2 = el("div", { class: "settings-line" }, [el("span", { class: "small muted", text: "Campaign" }),
        selEl([{ value: "recurring", label: "Recurring" }, { value: "oneoff", label: "One-off" }], camp.mode, function (v) { camp.mode = v; iv.activeYears = campaignYears(camp, current.years); refresh(); })]);
      if (camp.mode === "recurring") {
        cl2.appendChild(el("span", { class: "small muted", text: "every" }));
        cl2.appendChild(numEl(camp.everyYears, function (v) { camp.everyYears = Math.max(1, v || 1); iv.activeYears = campaignYears(camp, current.years); refresh(); }, { min: 1, step: 1, width: "44px" }));
        cl2.appendChild(el("span", { class: "small muted", text: "yrs from" }));
      } else { cl2.appendChild(el("span", { class: "small muted", text: "in" })); }
      cl2.appendChild(numEl(camp.firstYear, function (v) { camp.firstYear = v || 2028; iv.activeYears = campaignYears(camp, current.years); refresh(); }, { min: 2020, max: 2040, step: 1, width: "62px" }));
      card.appendChild(cl2);
    }
    var ty = el("div", { class: "settings-line" }, [el("span", { class: "small muted", text: "Active years" })].concat(current.years.map(function (y) {
      return chip(String(y), iv.activeYears.indexOf(y) !== -1, function () { var i = iv.activeYears.indexOf(y); if (i === -1) iv.activeYears.push(y); else if (iv.activeYears.length > 1) iv.activeYears.splice(i, 1); iv.activeYears.sort(function (a, b) { return a - b; }); refresh(); });
    })));
    card.appendChild(ty);

    var levers = el("div", { class: "levers" });
    var LD = G.assumptions.leverDefaults;
    if (c.code === "mii_routine") {
      levers.appendChild(el("label", { class: "small inline-toggle" }, [chk(iv.levers.ceaseAfterCampaign, function (v) { iv.levers.ceaseAfterCampaign = v; if (v) { if (iv.levers.ceaseMonths == null) iv.levers.ceaseMonths = LD.ceaseMonths; if (iv.levers.ceaseReduction == null) iv.levers.ceaseReduction = ceaseReductionFromMonths(iv.levers.ceaseMonths); } refresh(); }), " cease routine after a mass campaign", info("After a mass campaign, routine distribution pauses because households have just received nets. The pause months are converted into the annual routine-net reduction used by the budget engine.")]));
      if (iv.levers.ceaseAfterCampaign) levers.appendChild(el("div", { class: "lever-fold settings-line wrap" }, [el("span", { class: "small muted", text: "Pause" }), numEl(iv.levers.ceaseMonths, function (v) { iv.levers.ceaseMonths = v; iv.levers.ceaseReduction = ceaseReductionFromMonths(v); refresh(); }, { min: 0, max: 24, step: 1, width: "44px" }), el("span", { class: "small muted", text: "months · costing reduction" }), numEl(iv.levers.ceaseReduction, function (v) { iv.levers.ceaseReduction = v; }, { min: 0, max: 100, step: 0.1, width: "52px" }), el("span", { class: "small muted", text: "% of routine nets in campaign years" }), info("Changing pause months auto-updates this percentage using the default calibration: " + LD.ceaseMonths + " months = " + LD.ceaseReduction + "%. Edit the percentage directly if programme evidence supports a different reduction.")]));
    }
    if (c.code === "mii") {
      levers.appendChild(el("label", { class: "small inline-toggle" }, [chk(iv.levers.maxNetsPerHH, function (v) { iv.levers.maxNetsPerHH = v; if (v && !iv.levers.netCap) iv.levers.netCap = JSON.parse(JSON.stringify(G.assumptions.netCapByRegion)); refresh(); }), " cap nets per household", info("Caps nets at each region’s census household maximum, cutting nets needed by a region-specific amount. Applied in the budget engine.")]));
      if (iv.levers.maxNetsPerHH) {
        var capTbl = el("table", { class: "lever-table" }, [el("tr", {}, [el("th", { text: "Region" }), el("th", { text: "Max nets/HH" }), el("th", { text: "% reduction" })])]);
        Object.keys(iv.levers.netCap).forEach(function (rg) {
          var rrow = iv.levers.netCap[rg];
          capTbl.appendChild(el("tr", {}, [el("td", { text: rg }),
            el("td", {}, [numEl(rrow.maxNets, function (v) { rrow.maxNets = v; }, { min: 1, step: 1, width: "44px" })]),
            el("td", {}, [numEl(Math.round(rrow.reduction * 1000) / 10, function (v) { rrow.reduction = (v == null ? 0 : v / 100); }, { min: 0, max: 100, step: 0.1, width: "50px" }), el("span", { class: "small muted", text: "%" })])]));
        });
        levers.appendChild(el("div", { class: "lever-fold" }, [capTbl]));
      }
      levers.appendChild(el("label", { class: "small inline-toggle" }, [chk(iv.levers.urbanDeprioritise, function (v) { iv.levers.urbanDeprioritise = v; if (v) { if (!iv.levers.urbanAreas) iv.levers.urbanAreas = LD.urbanAreas.slice(); if (iv.levers.urbanPct == null) iv.levers.urbanPct = LD.urbanPct; } refresh(); }), " deprioritise urban", info("Removes the set % of population in the chosen urban areas from the campaign — assumed covered another way — reducing nets there. Applied in the budget engine.")]));
      if (iv.levers.urbanDeprioritise) {
        var fold = el("div", { class: "lever-fold" });
        fold.appendChild(el("div", { class: "settings-line" }, [numEl(iv.levers.urbanPct, function (v) { iv.levers.urbanPct = v; }, { min: 0, max: 100, step: 5, width: "50px" }), el("span", { class: "small muted", text: "% of population excluded in these areas" })]));
        var chips = el("div", { class: "chip-row small" }, (iv.levers.urbanAreas || []).map(function (k) {
          return el("span", { class: "chip removable" }, [k.split("|")[1], el("span", { class: "x", text: " ×", onClick: function () { iv.levers.urbanAreas = iv.levers.urbanAreas.filter(function (x) { return x !== k; }); refresh(); } })]);
        }));
        var remaining = G.reference.districtPairs().map(function (d) { return d.adm1 + "|" + d.adm2; }).filter(function (k) { return (iv.levers.urbanAreas || []).indexOf(k) === -1; });
        var addSel = selEl([{ value: "", label: "+ add area…" }].concat(remaining.map(function (k) { return { value: k, label: k.split("|")[1] + " (" + k.split("|")[0] + ")" }; })), "", function (v) { if (v) { iv.levers.urbanAreas.push(v); refresh(); } });
        fold.appendChild(el("div", { class: "settings-line wrap" }, [el("span", { class: "small muted", text: "Areas:" }), chips, addSel]));
        levers.appendChild(fold);
      }
    }
    if (c.code === "irs") {
      levers.appendChild(el("label", { class: "small inline-toggle" }, [chk(iv.levers.reactive, function (v) { iv.levers.reactive = v; if (v && iv.levers.reactiveCoverage == null) iv.levers.reactiveCoverage = LD.reactiveCoverage; refresh(); }), " reactive (hotspots only)", info("IRS triggered only in lowest-stratum hotspots at partial coverage, not blanket spraying. Applied in the budget engine.")]));
      if (iv.levers.reactive) levers.appendChild(el("div", { class: "lever-fold settings-line" }, [el("span", { class: "small muted", text: "Reactive coverage" }), pctEl(iv.levers.reactiveCoverage, function (v) { iv.levers.reactiveCoverage = v; }), el("span", { class: "small muted", text: "of structures in hotspot districts" })]));
    }
    if (levers.childNodes.length) card.appendChild(levers);

    var ex = iv.scope.exclude || [];
    if (ex.length) card.appendChild(el("div", { class: "settings-line" }, [el("span", { class: "small muted", text: "Excluded:" }), el("span", { class: "chip-row small" }, ex.map(function (k) {
      return el("span", { class: "chip removable" }, [k.split("|")[1], el("span", { class: "x", text: " ×", onClick: function () { iv.scope.exclude = ex.filter(function (x) { return x !== k; }); refresh(); } })]);
    }))]));

    var lastYear = Math.max.apply(null, current.years), covered = G.resolveScope(iv.scope, assignment.result), targ = 0;
    Object.keys(covered).forEach(function (k) { if (isActive(iv, k, lastYear)) { var pr = k.split("|"); targ += ivTargetPop(iv, pr[0], pr[1], lastYear); } });
    var pctNat = nationalPop(lastYear) ? Math.round(targ / nationalPop(lastYear) * 1000) / 10 : 0;
    card.appendChild(el("div", { class: "spec-foot small" }, [el("span", {}, ["Target pop " + lastYear + ": ", el("strong", { text: num(targ) })]), el("span", { class: "muted" }, [pctNat + "% of national"])]));
    return card;
  }

  // ---- Set-by-geography modal ----
  function openGeoModal(c, iv) {
    var assignment = computeAssignment(current);
    var covered = G.resolveScope(iv.scope, assignment.result);
    var keys = Object.keys(covered).sort();
    var covBased = COV_BASED.indexOf(c.code) !== -1;
    var propBased = iv.target && iv.target.mode === "groups";
    var typeBased = !!c.varyType;
    var defCov = iv.params.coverage, defTarget = Math.round(groupSum(iv) * 100) / 100;
    var byRegion = {};
    keys.forEach(function (k) { var r = k.split("|")[0]; (byRegion[r] = byRegion[r] || []).push(k); });
    var holder = el("div", {}), modalCtl, filterText = "";
    function typeOptions(withInherit) { return (withInherit ? [{ value: "", label: "(inherit)" }] : [{ value: "", label: "— set all —" }]).concat(c.types.map(function (tp) { return { value: tp, label: tp }; })); }
    function cascadeType(region, type) { byRegion[region].forEach(function (k) { ensureGeo(iv, k).type = type; }); rebuild(); }

    function regionCommonYears(region) {
      var ks = byRegion[region], first = activeYearsFor(iv, ks[0]).slice().sort(function (a, b) { return a - b; });
      var common = ks.every(function (k) { var ys = activeYearsFor(iv, k).slice().sort(function (a, b) { return a - b; }); return ys.length === first.length && ys.every(function (y, i) { return y === first[i]; }); });
      return common ? first : iv.activeYears.slice();
    }
    function cascadeYears(region, years) { byRegion[region].forEach(function (k) { ensureGeo(iv, k).years = years.slice(); }); rebuild(); }
    function cascadeCoverage(region, frac) { byRegion[region].forEach(function (k) { var g = ensureGeo(iv, k); if (frac == null) { delete g.coverage; cleanGeo(iv, k); } else g.coverage = frac; }); rebuild(); }
    function cascadeTarget(region, pct) { byRegion[region].forEach(function (k) { var g = ensureGeo(iv, k); if (pct == null) { delete g.targetPct; cleanGeo(iv, k); } else g.targetPct = pct; }); rebuild(); }

    function districtYearChips(k) {
      return el("span", { class: "chip-row" }, current.years.map(function (y) {
        var ch = el("span", { class: "chip" + (isActive(iv, k, y) ? " on" : ""), role: "button", tabindex: "0" }, [String(y)]);
        function tog() { var g = ensureGeo(iv, k), ys = (g.years ? g.years.slice() : activeYearsFor(iv, k).slice()), i = ys.indexOf(y); if (i === -1) ys.push(y); else ys.splice(i, 1); ys.sort(function (a, b) { return a - b; }); g.years = ys; ch.classList.toggle("on"); }
        ch.addEventListener("click", tog); ch.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tog(); } });
        return ch;
      }));
    }
    function regionYearChips(region) {
      var ry = regionCommonYears(region);
      return el("span", { class: "chip-row" }, current.years.map(function (y) {
        var ch = el("span", { class: "chip" + (ry.indexOf(y) !== -1 ? " on" : ""), role: "button", tabindex: "0" }, [String(y)]);
        function tog() { var ys = ry.slice(), i = ys.indexOf(y); if (i === -1) ys.push(y); else ys.splice(i, 1); ys.sort(function (a, b) { return a - b; }); cascadeYears(region, ys); }
        ch.addEventListener("click", tog); ch.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tog(); } });
        return ch;
      }));
    }

    function buildTable() {
      var table = el("table", { class: "geo-table" });
      var head = [el("th", { text: "Area" }), el("th", { text: "Stratum" }), el("th", { text: "Active years" })];
      if (typeBased) head.push(el("th", { text: c.typeLabel || "Type" }));
      if (covBased) head.push(el("th", { text: "Coverage %" }));
      if (propBased) head.push(el("th", { text: "Target % of total" }));
      table.appendChild(el("tr", {}, head));
      Object.keys(byRegion).sort().forEach(function (region) {
        var districts = byRegion[region].filter(function (k) { return !filterText || k.split("|")[1].toLowerCase().indexOf(filterText) !== -1; });
        if (!districts.length) return;
        var rcells = [el("td", {}, [el("strong", { text: region })]), el("td", { class: "muted small", text: "all districts" }), el("td", {}, [regionYearChips(region)])];
        if (typeBased) rcells.push(el("td", {}, [selEl(typeOptions(false), "", function (v) { if (v) cascadeType(region, v); })]));
        if (covBased) rcells.push(el("td", {}, [numEl(null, function (v) { cascadeCoverage(region, v == null ? null : v / 100); }, { min: 0, max: 100, step: 1, width: "60px", placeholder: "set all" })]));
        if (propBased) rcells.push(el("td", {}, [numEl(null, function (v) { cascadeTarget(region, v); }, { min: 0, max: 100, step: 0.1, width: "60px", placeholder: "set all" })]));
        table.appendChild(el("tr", { class: "geo-region-row" }, rcells));
        districts.forEach(function (k) {
          var bandId = assignment.result.byDistrict[k], band = assignment.bands.filter(function (b) { return b.id === bandId; })[0];
          var row = [el("td", { text: k.split("|")[1] }), el("td", {}, [el("span", { class: "swatch", style: "background:" + (band ? band.color : "#ccc") }), " " + (band ? band.name : "")]), el("td", {}, [districtYearChips(k)])];
          if (typeBased) { var gt = geoOf(iv, k); row.push(el("td", {}, [selEl(typeOptions(true), (gt && gt.type) || "", function (v) { var g = ensureGeo(iv, k); if (!v) { delete g.type; cleanGeo(iv, k); } else g.type = v; })])); }
          if (covBased) { var g0 = geoOf(iv, k); row.push(el("td", {}, [numEl(g0 && g0.coverage != null ? Math.round(g0.coverage * 100) : null, function (v) { var g = ensureGeo(iv, k); if (v == null) { delete g.coverage; cleanGeo(iv, k); } else g.coverage = v / 100; }, { min: 0, max: 100, step: 1, width: "60px", placeholder: Math.round(defCov * 100) })])); }
          if (propBased) { var g1 = geoOf(iv, k); row.push(el("td", {}, [numEl(g1 && g1.targetPct != null ? g1.targetPct : null, function (v) { var g = ensureGeo(iv, k); if (v == null) { delete g.targetPct; cleanGeo(iv, k); } else g.targetPct = v; }, { min: 0, max: 100, step: 0.1, width: "60px", placeholder: defTarget })])); }
          table.appendChild(el("tr", {}, row));
        });
      });
      return table;
    }
    function rebuild() { holder.innerHTML = ""; holder.appendChild(buildTable()); }
    rebuild();

    modalCtl = G.ui.openModal({
      title: c.nice + " — set by geography",
      body: el("div", {}, [
        el("p", { class: "muted small", style: "margin-top:0", text: "Set timing, coverage and target population by region (blue row — cascades to all its districts) or per district. Blank inputs use the intervention default." }),
        (function () { var s = document.createElement("input"); s.type = "text"; s.placeholder = "Filter districts…"; s.style.width = "220px"; s.style.marginBottom = "8px"; s.addEventListener("input", function () { filterText = s.value.toLowerCase(); rebuild(); }); return s; })(),
        holder
      ]),
      footer: [
        el("button", { class: "linkbtn", onClick: function () { iv.geo = {}; rebuild(); } }, ["Clear all overrides"]),
        el("button", { class: "btn", onClick: function () { modalCtl.close(); } }, ["Done"])
      ],
      onClose: function () { refresh(); }
    });
  }

  function renderSummary(assignment) {
    var aside = el("aside", { class: "scn-summary" }), p = el("div", { class: "panel" });
    p.appendChild(el("h3", {}, ["Summary ", info("Live overview of this scenario: plan years, how many interventions are switched on, the number of districts covered across all interventions, and the projected national population in the final plan year.")]));
    var nIv = G.catalog.filter(function (c) { return current.interventions[c.code].enabled; }).length;
    var covered = Object.keys(coveredKeys(current, assignment)).length, lastYear = Math.max.apply(null, current.years);
    function line(l, v) { return el("div", { class: "sum-line" }, [el("span", { class: "muted", text: l }), el("strong", { text: v })]); }
    p.appendChild(line("Years", current.years[0] + "–" + lastYear));
    p.appendChild(line("Interventions on", nIv + " of " + G.catalog.length));
    p.appendChild(line("Districts covered", covered + " of 42"));
    p.appendChild(line("Projected pop " + lastYear, num(nationalPop(lastYear))));

    // population growth (optionally by year)
    var maxY = Math.max.apply(null, current.years);
    var gToggle = el("label", { class: "small inline-toggle" }, [chk(!!current.assumptions.growthByYear, function (v) {
      if (v) { var o = {}; for (var y = 2026; y <= maxY; y++) o[y] = current.assumptions.growth; current.assumptions.growthByYear = o; }
      else current.assumptions.growthByYear = null;
      refresh();
    }), " vary by year"]);
    var gField = el("div", { class: "field" }, [el("label", {}, ["Population growth rate (%/yr) ", info("Projects population beyond 2025 to each plan year.")])]);
    if (!current.assumptions.growthByYear) {
      gField.appendChild(el("div", { class: "settings-line" }, [numEl(Math.round(current.assumptions.growth * 1000) / 10, function (v) { current.assumptions.growth = (v == null ? 0 : v / 100); refresh(); }, { min: 0, max: 10, step: 0.1, width: "62px" }), el("span", { class: "small", text: "%" }), gToggle]));
    } else {
      var gy = el("div", { class: "settings-line wrap" });
      for (var y = 2026; y <= maxY; y++) { (function (yy) { gy.appendChild(el("span", { class: "small", text: yy })); gy.appendChild(numEl(Math.round((current.assumptions.growthByYear[yy] || 0) * 1000) / 10, function (v) { current.assumptions.growthByYear[yy] = (v == null ? 0 : v / 100); refresh(); }, { min: 0, max: 10, step: 0.1, width: "50px" })); })(y); }
      gField.appendChild(gy); gField.appendChild(gToggle);
    }
    p.appendChild(gField);

    // validation checks
    var checks = computeChecks(assignment);
    var cb = el("div", { class: "checks " + (checks.length ? "has" : "ok") }, [el("div", { class: "small", style: "font-weight:600", text: checks.length ? ("⚠ " + checks.length + " check" + (checks.length > 1 ? "s" : "")) : "✓ No issues" })]);
    checks.forEach(function (m) { cb.appendChild(el("div", { class: "small", text: "• " + m })); });
    p.appendChild(cb);

    var dirty = isDirty();
    var saveBtn = el("button", { class: "btn", style: "flex:1", onClick: doSave }, [lastSavedJson === null ? "Save scenario" : "Save changes"]);
    var discardBtn = el("button", { class: "btn secondary", style: "flex:1", onClick: function () { revertCurrent(); refresh(); } }, ["Discard changes"]);
    if (!dirty) { saveBtn.disabled = true; discardBtn.disabled = true; }
    p.appendChild(el("div", { style: "display:flex;gap:8px;margin-top:8px" }, [saveBtn, discardBtn]));
    p.appendChild(el("div", { class: "save-state " + (dirty ? "dirty" : "clean") }, [el("span", { class: "dot" }), dirty ? (lastSavedJson === null ? "New scenario — not saved" : "Unsaved changes") : "All changes saved"]));
    if (flash) p.appendChild(el("div", { class: "small", style: "color:var(--green);margin-top:4px", text: flash }));
    p.appendChild(el("button", { class: "btn danger", style: "width:100%;margin-top:10px", onClick: deleteScenario }, ["Delete scenario"]));
    aside.appendChild(p);
    return aside;
  }
  function updateSaveState() {
    var s = rootEl.querySelector(".save-state"); if (!s) return;
    var dirty = isDirty();
    s.className = "save-state " + (dirty ? "dirty" : "clean");
    s.lastChild.textContent = dirty ? (lastSavedJson === null ? "New scenario — not saved" : "Unsaved changes") : "All changes saved";
    rootEl.querySelectorAll(".scn-summary .btn").forEach(function (btn) { btn.disabled = !dirty; });
    var cb = rootEl.querySelector(".checks");
    if (cb) {
      var w = computeChecks(computeAssignment(current));
      cb.className = "checks " + (w.length ? "has" : "ok");
      cb.innerHTML = "";
      cb.appendChild(el("div", { class: "small", style: "font-weight:600", text: w.length ? ("⚠ " + w.length + " check" + (w.length > 1 ? "s" : "")) : "✓ No issues" }));
      w.forEach(function (m) { cb.appendChild(el("div", { class: "small", text: "• " + m })); });
    }
  }
  function doSave() {
    var exists = G.store.get().scenarios.some(function (s) { return s.id === current.id; });
    if (exists) G.store.updateScenario(clone(current)); else G.store.addScenario(clone(current));
    lastSavedJson = snap(); flash = "Saved “" + current.name + "”"; refresh();
  }

  // The five SNT scenarios are seeded as real, budget-able scenarios.
  // Seed any that are MISSING (by template marker) so a partial/leftover store still gets the full set.
  function seedSnt() {
    var have = {}, removed = G.store.get().removedSeeds || [];
    G.store.get().scenarios.forEach(function (s) { if (s.template) have[s.template] = true; });
    ["nsp", "bau", "optimistic", "realistic", "pessimistic"].forEach(function (id) {
      if (have[id] || removed.indexOf("scn:" + id) !== -1) return;
      var scn = buildScenario(id); remapTemplateStrata(scn); G.store.addScenario(scn);
    });
    // backfill on pre-existing seeded scenarios: descriptions + updated SMC default coverage (now 100%)
    G.store.get().scenarios.forEach(function (s) {
      if (!s.template || !G.templates[s.template]) return;
      var changed = false;
      if (!s.description) { s.description = G.templates[s.template].description || ""; changed = true; }
      var smc = s.interventions && s.interventions.smc;
      if (smc && smc.params && smc.params.coverage === 0.75) { smc.params.coverage = 1.0; changed = true; }
      if (changed) G.store.updateScenario(s);
    });
  }
  function loadScenario(id) {
    var f = G.store.get().scenarios.filter(function (s) { return s.id === id; })[0];
    if (f) { current = clone(f); lastSavedJson = snap(); flash = ""; refresh(); }
  }
  function newScenario() { current = buildScenario("blank"); lastSavedJson = null; flash = ""; refresh(); }
  function duplicateScenario() { current = clone(current); current.id = uid("scn"); current.name = "Copy of " + current.name; lastSavedJson = null; flash = ""; refresh(); }
  function growthArg() { return current.assumptions.growthByYear ? current.assumptions.growthByYear : current.assumptions.growth; }
  function loadFirstScenario() { var all = G.store.get().scenarios; var f = all.filter(function (s) { return s.template === "nsp"; })[0] || all[0]; if (f) { current = clone(f); lastSavedJson = snap(); } else { current = buildScenario("blank"); lastSavedJson = null; } }
  function deleteScenario() {
    var modal = G.ui.openModal({ title: "Delete scenario",
      body: el("div", {}, [el("p", { class: "small", text: "Delete “" + current.name + "”? This cannot be undone." })]),
      footer: [el("button", { class: "linkbtn", onClick: function () { modal.close(); } }, ["Cancel"]),
        el("button", { class: "btn danger", onClick: function () { modal.close(); doDelete(); } }, ["Delete"])] });
  }
  function doDelete() {
    var id = current.id, tpl = current.template;
    if (G.store.get().scenarios.some(function (s) { return s.id === id; })) {
      G.store.removeScenario(id);
      if (tpl && G.templates[tpl]) G.store.addRemovedSeed("scn:" + tpl);
    }
    loadFirstScenario(); flash = ""; refresh();
  }
  function safeFile(s) { return String(s || "scenario").replace(/[^\w.-]+/g, "_").slice(0, 60); }
  function exportScenarioXlsx() {
    var assignment = computeAssignment(current), ly = Math.max.apply(null, current.years);
    var cols = [{ label: "Intervention", width: 200 }, { label: "Included", width: 60 }, { label: "Type", width: 120 }, { label: "Scope", width: 90 }, { label: "Districts", width: 65, fmt: "int" }, { label: "Coverage / doses", width: 100 }, { label: "Buffer %", width: 60, fmt: "int" }, { label: "Active years", width: 130 }, { label: "Target pop " + ly, width: 110, fmt: "int" }];
    var rows = G.catalog.map(function (c) {
      var iv = current.interventions[c.code];
      var covered = iv.enabled ? G.resolveScope(iv.scope, assignment.result) : {};
      var targ = 0; Object.keys(covered).forEach(function (k) { if (isActive(iv, k, ly)) { var pr = k.split("|"); targ += ivTargetPop(iv, pr[0], pr[1], ly); } });
      var cov = (c.code === "vax") ? [1, 2, 3, 4].map(function (d) { return Math.round((iv.params["dose" + d] || 0) * 100) + "%"; }).join(" / ") : (c.code === "iptp") ? [1, 2, 3, 4].map(function (k) { return Math.round((iv.params["contact" + k] || 0) * 100) + "%"; }).join(" / ") : (Math.round((iv.params.coverage || 0) * 100) + "%");
      var scope = iv.scope.mode === "everywhere" ? "Everywhere" : iv.scope.mode === "strata" ? ("Strata: " + (iv.scope.strata || []).join(", ")) : "Custom";
      return [c.nice, iv.enabled ? "Yes" : "No", iv.type || "", scope, Object.keys(covered).length, cov, Math.round((iv.params.buffer || 0) * 100), (iv.activeYears || []).join(", "), Math.round(targ)];
    });
    GMB.xlsx.download(safeFile(current.name), [{ name: "Scenario", title: current.name, meta: [["Description", current.description || ""], ["Plan years", current.years[0] + "–" + current.years[current.years.length - 1]]], columns: cols, rows: rows }]);
  }
  function computeChecks(assignment) {
    var w = [];
    G.catalog.forEach(function (c) {
      var iv = current.interventions[c.code]; if (!iv.enabled) return;
      if (Object.keys(G.resolveScope(iv.scope, assignment.result)).length === 0) w.push(c.nice + ": covers 0 districts");
      if (!iv.activeYears.length) w.push(c.nice + ": no active years");
      if (c.code === "vax") { if (![1, 2, 3, 4].some(function (d) { return (iv.params["dose" + d] || 0) > 0; })) w.push(c.nice + ": all dose coverages 0%"); }
      else if (c.code === "iptp") { if (![1, 2, 3, 4].some(function (k) { return (iv.params["contact" + k] || 0) > 0; })) w.push(c.nice + ": all contact coverages 0%"); }
      else if (!(iv.params.coverage > 0)) w.push(c.nice + ": coverage is 0%");
    });
    return w;
  }
  function revertCurrent() {
    if (lastSavedJson) current = JSON.parse(lastSavedJson);
    else { current = buildScenario(current.template || "blank"); if (current.template && current.template !== "blank") remapTemplateStrata(current); }
    flash = "";
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
  G.seedScenarios = seedSnt;

  G.tabs.scenario = {
    render: function (root) {
      rootEl = root;
      if (!rootEl._gmbDirtyListener) { rootEl._gmbDirtyListener = true; rootEl.addEventListener("change", updateSaveState); rootEl.addEventListener("input", updateSaveState); }
      if (!current) {
        if (!G.store.get().scenarios.length) seedSnt();
        var all = G.store.get().scenarios;
        var first = all.filter(function (s) { return s.template === "nsp"; })[0] || all[0];
        if (first) { current = clone(first); lastSavedJson = snap(); }
        else { current = buildScenario("nsp"); remapTemplateStrata(current); lastSavedJson = null; }
      }
      if (!mapApi) mapApi = G.ui.gambiaMap({ onClick: onDistrictClick });
      G.router.setLeaveGuard(function (proceed) { guardUnsaved(proceed); });
      flash = ""; renderBody();
    }
  };
})(GMB);
