/* Bootstrap: hydrate saved state, wire the footer data status, start the router. */
(function () {
  function renderCloudStatus() {
    var G = window.GMB;
    var el = document.getElementById("auth-status");
    if (!el || !G.cloud) return;
    var st = G.cloud.status ? G.cloud.status() : { state: "disabled", message: "Local-only mode" };
    el.innerHTML = "";
    if (st.state === "disabled") {
      el.appendChild(document.createElement("span")).textContent = "Local-only mode";
      return;
    }
    var text = document.createElement("div");
    text.className = "auth-text";
    var user = document.createElement("div");
    user.className = "auth-user";
    user.textContent = st.user || (st.state === "signed_out" ? "Not signed in" : "Shared storage");
    var sync = document.createElement("div");
    sync.className = "auth-sync " + st.state;
    sync.textContent = st.message || "";
    text.appendChild(user);
    text.appendChild(sync);
    el.appendChild(text);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "auth-btn";
    if (st.state === "signed_out" || st.state === "error") {
      btn.textContent = "Sign in";
      btn.addEventListener("click", function () { G.cloud.signIn(); });
      el.appendChild(btn);
    } else {
      btn.textContent = "Sign out";
      btn.addEventListener("click", function () { G.cloud.signOut(); });
      el.appendChild(btn);
    }
  }

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
    renderCloudStatus();
  }

  async function boot() {
    var G = window.GMB;
    if (G.cloud) {
      G.cloud.onStatusChange = renderCloudStatus;
      await G.cloud.init();
      renderCloudStatus();
    }
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
