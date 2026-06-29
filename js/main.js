/* Bootstrap: hydrate saved state, wire the footer data status, start the router. */
(function () {
  function start(saved) {
    var G = window.GMB;

    // Restore any saved scenarios/costs/budgets
    if (saved) G.store.hydrate(saved);

    // First run: seed the five SNT scenarios and the default cost set
    if (G.seedScenarios) G.seedScenarios();
    if (G.seedCostSets) G.seedCostSets();

    // Footer: confirm reference data loaded
    var status = document.getElementById("data-status");
    if (status) {
      if (G.reference.loaded()) {
        var c = G.reference.counts();
        status.textContent = "Data loaded: " + c.regions + " regions · " +
          c.districts + " districts · population " +
          c.years[0] + "–" + c.years[c.years.length - 1];
        status.className = "data-status ok";
      } else {
        status.textContent = "Reference data failed to load";
        status.className = "data-status warn";
      }
    }

    G.router.init();
  }

  function boot() {
    var G = window.GMB;
    var loaded = G.persistence.load();
    if (loaded && typeof loaded.then === "function") loaded.then(start).catch(function () { start(null); });
    else start(loaded);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
