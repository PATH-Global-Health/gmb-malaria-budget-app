/* Single source of truth + tiny pub/sub.
   State holds user-created scenarios, cost sets, and generated budgets.
   Reference data (population/incidence/catalog) lives outside the store. */
window.GMB = window.GMB || {};

(function (G) {
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function arr(x) { return Array.isArray(x) ? x : []; }

  function scenarioSeedKey(s) {
    if (!s) return "";
    if (s.seed) {
      var seed = String(s.seed);
      return seed.indexOf("snt:") === 0 ? seed.slice(4) : seed;
    }
    // Legacy seeded scenarios did not have a seed marker. Treat template-based
    // records as seeds unless they are obvious copies made through Duplicate.
    if (s.template && G.templates && G.templates[s.template] &&
      !/^Copy of\s+/i.test(s.name || "")) {
      return s.template;
    }
    return "";
  }

  function costSeedKey(c) {
    if (!c) return "";
    if (c.seed) return String(c.seed);
    // Defensive migration for very early stores where the reference cost set
    // may have been saved before the seed marker existed.
    if ((c.name || "") === "COOP cost scenario v1" || (c.name || "") === "GF / PMI 2025 reference") return "gfpmi";
    return "";
  }

  function stableJson(x) { return JSON.stringify(x == null ? null : x); }

  function eqJson(a, b) { return stableJson(a) === stableJson(b); }

  function hasKeys(o) { return !!(o && Object.keys(o).length); }

  function arrEq(a, b) {
    a = arr(a); b = arr(b);
    return a.length === b.length && a.every(function (x, i) { return x === b[i]; });
  }

  function scopeStrataKeys(s, scope) {
    var byId = {};
    arr(s && s.strata && s.strata.bands).forEach(function (b) {
      var m = String(b.name || "").match(/Strata\s+(I{1,3}|IV|V|VI{0,3}|IX|X)$/i);
      byId[b.id] = m ? m[1].toUpperCase() : b.id;
    });
    return arr(scope && scope.strata).map(function (id) { return byId[id] || id; });
  }

  function scenarioEditScore(s) {
    var tpl = s && s.template && G.templates && G.templates[s.template];
    if (!tpl) return 1;
    var score = 0;
    if ((s.name || "") !== (tpl.name || "")) score += 8;
    if ((s.description || "") !== (tpl.description || "")) score += 2;
    if (!arrEq(s.years, [2026, 2027, 2028])) score += 5;
    if (s.assumptions) {
      if (s.assumptions.growthByYear) score += 4;
      if (s.assumptions.growth != null && G.assumptions && s.assumptions.growth !== G.assumptions.defaultGrowth) score += 3;
      if (s.assumptions.householdSize) score += 3;
    }
    if (s.strata) {
      if (!arrEq(s.strata.averagingYears, tpl.averagingYears || [])) score += 4;
      if (hasKeys(s.strata.overrides)) score += 4;
      var bands = arr(s.strata.bands);
      if (bands.length !== 3 ||
        bands[0] && (bands[0].min !== 0 || bands[0].max !== 10) ||
        bands[1] && (bands[1].min !== 10 || bands[1].max !== 30) ||
        bands[2] && (bands[2].min !== 30 || bands[2].max != null)) score += 3;
    }
    arr(G.catalog).forEach(function (c) {
      var iv = s.interventions && s.interventions[c.code];
      var def = tpl.interventions && tpl.interventions[c.code];
      if (!iv) return;
      if (!!iv.enabled !== !!def) score += 6;
      var expectedParams = Object.assign({}, c.defaults || {}, (def && def.params) || {});
      Object.keys(expectedParams).forEach(function (k) {
        if (iv.params && stableJson(iv.params[k]) !== stableJson(expectedParams[k])) score += 2;
      });
      Object.keys(iv.params || {}).forEach(function (k) {
        if (expectedParams[k] == null) score += 1;
      });
      if (iv.coverageVary && iv.coverageVary !== "none") score += 3;
      if (iv.typeVary && iv.typeVary !== "none") score += 3;
      if (hasKeys(iv.coverageByYear) || hasKeys(iv.coverageByStratum)) score += 3;
      if (hasKeys(iv.typeByYear) || hasKeys(iv.typeByStratum)) score += 3;
      if (hasKeys(iv.geo)) score += 6;
      if (!eqJson(iv.levers || {}, (def && def.levers) || {})) score += 3;
      if (iv.scope && def && def.scope) {
        if (iv.scope.mode !== def.scope.mode) score += 3;
        if (!arrEq(iv.scope.exclude, def.scope.exclude || [])) score += 2;
        if (!arrEq(iv.scope.includeRegions, def.scope.includeRegions || [])) score += 2;
        if (!arrEq(iv.scope.includeDistricts, def.scope.includeDistricts || [])) score += 2;
        if (!arrEq(iv.scope.regions, def.scope.regions || [])) score += 2;
        if (!arrEq(iv.scope.districts, def.scope.districts || [])) score += 2;
        if (!arrEq(iv.scope.regionFilter, def.scope.regionFilter || [])) score += 2;
        if (iv.scope.mode === "strata" && def.scope.mode === "strata" &&
          !arrEq(scopeStrataKeys(s, iv.scope), def.scope.strata || [])) score += 3;
      }
    });
    return score;
  }

  function costEditScore(c) {
    var defaultDescription = "Default unit costs from the COOP Malaria Unit Cost Tool, with Gambia vaccine introduction delivery costs from v4.6 and current RTS,S/R21 procurement rows retained.";
    var score = 0;
    if ((c.name || "") !== "COOP cost scenario v1" && (c.name || "") !== "GF / PMI 2025 reference") score += 5;
    if ((c.description || "") !== defaultDescription) score += 2;
    if (G.data && G.data.defaultExchangeRate != null && c.exchange_rate !== G.data.defaultExchangeRate) score += 4;
    if (G.data && G.data.defaultCurrency && c.currency !== G.data.defaultCurrency) score += 2;
    if (G.data && !eqJson(c.rows || [], G.data.defaultCosts || [])) score += 10;
    return score;
  }

  function refCounts(items, field) {
    var counts = {};
    arr(items).forEach(function (item) {
      var id = item && item[field];
      if (id) counts[id] = (counts[id] || 0) + 1;
    });
    return counts;
  }

  function preferSeedRecord(a, b, refs, scoreFn) {
    var as = scoreFn ? scoreFn(a) : 0, bs = scoreFn ? scoreFn(b) : 0;
    if (bs > as) return b;
    if (as > bs) return a;
    var ar = refs[a.id] || 0, br = refs[b.id] || 0;
    if (br > ar) return b;
    if (ar > br) return a;
    // Merges pass remote first and local second. On a tie, prefer the later
    // record so an edited local seed replaces the original default.
    return b;
  }

  function mergeById(items) {
    var out = [], pos = {};
    arr(items).forEach(function (item) {
      if (!item || !item.id) return;
      if (pos[item.id] == null) {
        pos[item.id] = out.length;
        out.push(item);
      } else {
        out[pos[item.id]] = Object.assign({}, out[pos[item.id]], item);
      }
    });
    return out;
  }

  function dedupeSeeded(items, seedFn, scoreFn, refs, idMap) {
    var out = [], seedPos = {};
    mergeById(items).forEach(function (item) {
      var key = seedFn(item);
      if (!key) {
        out.push(item);
        return;
      }
      item.seed = key;
      if (seedPos[key] == null) {
        seedPos[key] = out.length;
        out.push(item);
        return;
      }
      var prev = out[seedPos[key]];
      var keep = preferSeedRecord(prev, item, refs, scoreFn);
      var drop = keep === prev ? item : prev;
      idMap[drop.id] = keep.id;
      out[seedPos[key]] = keep;
    });
    return out;
  }

  function finalId(id, map) {
    var seen = {};
    while (id && map[id] && !seen[id]) {
      seen[id] = true;
      id = map[id];
    }
    return id;
  }

  function remapBudgets(budgets, scenarioIds, costSetIds) {
    return mergeById(arr(budgets).map(function (b) {
      b = clone(b);
      if (b.scenarioId && scenarioIds[b.scenarioId]) b.scenarioId = finalId(b.scenarioId, scenarioIds);
      if (b.costSetId && costSetIds[b.costSetId]) b.costSetId = finalId(b.costSetId, costSetIds);
      return b;
    }));
  }

  function normalizeStateData(data) {
    data = data || {};
    var budgets = mergeById(arr(data.budgets).map(clone));
    var scenarioIds = {}, costSetIds = {};
    var scenarios = dedupeSeeded(arr(data.scenarios).map(clone), scenarioSeedKey, scenarioEditScore, refCounts(budgets, "scenarioId"), scenarioIds);
    var costSets = dedupeSeeded(arr(data.costSets).map(clone), costSeedKey, costEditScore, refCounts(budgets, "costSetId"), costSetIds);
    return {
      scenarios: scenarios,
      costSets: costSets,
      budgets: remapBudgets(budgets, scenarioIds, costSetIds),
      removedSeeds: Array.from(new Set(arr(data.removedSeeds)))
    };
  }

  var state = {
    scenarios: [],   // [{id, name, ...}]
    costSets: [],    // [{id, name, rows:[...]}]
    budgets: [],     // [{id, scenarioId, costSetId, ...}]
    removedSeeds: [], // markers like "scn:nsp" / "cost:gfpmi" the user deleted (don't re-seed)
    activeTab: "overview"
  };

  var subs = [];
  function notify() { subs.forEach(function (fn) { try { fn(state); } catch (e) { console.error(e); } }); }

  var store = {
    get: function () { return state; },

    /** Subscribe to any state change. Returns an unsubscribe fn. */
    subscribe: function (fn) {
      subs.push(fn);
      return function () { subs = subs.filter(function (f) { return f !== fn; }); };
    },

    /** Replace the persisted collections (used on load). */
    hydrate: function (data) {
      if (!data) return;
      data = normalizeStateData(data);
      state.scenarios = data.scenarios;
      state.costSets = data.costSets;
      state.budgets = data.budgets;
      state.removedSeeds = data.removedSeeds;
      notify();
    },

    /** Record that a seeded default was deleted, so it isn't re-seeded. */
    addRemovedSeed: function (key) {
      if (state.removedSeeds.indexOf(key) === -1) { state.removedSeeds.push(key); G.persistence.save(state); }
    },

    setActiveTab: function (id) { state.activeTab = id; notify(); },

    // --- scenarios ---
    addScenario: function (s) { state.scenarios.push(s); G.persistence.save(state); notify(); },
    updateScenario: function (s) {
      state.scenarios = state.scenarios.map(function (x) { return x.id === s.id ? s : x; });
      G.persistence.save(state); notify();
    },
    removeScenario: function (id) {
      state.scenarios = state.scenarios.filter(function (x) { return x.id !== id; });
      G.persistence.save(state); notify();
    },

    // --- cost sets ---
    addCostSet: function (c) { state.costSets.push(c); G.persistence.save(state); notify(); },
    updateCostSet: function (c) {
      state.costSets = state.costSets.map(function (x) { return x.id === c.id ? c : x; });
      G.persistence.save(state); notify();
    },
    removeCostSet: function (id) {
      state.costSets = state.costSets.filter(function (x) { return x.id !== id; });
      G.persistence.save(state); notify();
    },

    // --- budgets ---
    addBudget: function (b) { state.budgets.push(b); G.persistence.save(state); notify(); },
    updateBudget: function (b) {
      state.budgets = state.budgets.map(function (x) { return x.id === b.id ? b : x; });
      G.persistence.save(state); notify();
    },
    removeBudget: function (id) {
      state.budgets = state.budgets.filter(function (x) { return x.id !== id; });
      G.persistence.save(state); notify();
    }
  };

  G.store = store;
  G.normalizeState = normalizeStateData;

  // Shared generated-budget freshness check. Kept outside the tabs so the
  // generation library, visualisation, comparison, and exports use one rule.
  G.budgetStatus = function (b) {
    var scn = state.scenarios.filter(function (s) { return s.id === b.scenarioId; })[0];
    var cost = state.costSets.filter(function (c) { return c.id === b.costSetId; })[0];
    if (!scn || !cost) return { state: "deleted", label: "Source deleted", scn: scn, cost: cost };
    if (b.sourceSig == null || !G.engine || !G.engine.sourceSig) return { state: "current", label: "Current", scn: scn, cost: cost };
    var sig = G.engine.sourceSig(scn, cost);
    return { state: sig === b.sourceSig ? "current" : "stale", label: sig === b.sourceSig ? "Current" : "Out of date", scn: scn, cost: cost };
  };
})(GMB);
