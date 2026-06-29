/* Single source of truth + tiny pub/sub.
   State holds user-created scenarios, cost sets, and generated budgets.
   Reference data (population/incidence/catalog) lives outside the store. */
window.GMB = window.GMB || {};

(function (G) {
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
      state.scenarios = data.scenarios || [];
      state.costSets = data.costSets || [];
      state.budgets = data.budgets || [];
      state.removedSeeds = data.removedSeeds || [];
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
