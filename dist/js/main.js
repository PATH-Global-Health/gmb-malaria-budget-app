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
    sync.title = "Shared saving status. 'Shared data loaded' means this browser loaded the shared workspace. 'Shared data saved' means your latest saved work reached shared storage. 'Skipped' means this browser was prevented from overwriting shared budgets.";
    text.appendChild(user);
    text.appendChild(sync);
    el.appendChild(text);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "auth-btn";
    if (st.state === "signed_out" || (st.state === "error" && !st.user)) {
      btn.textContent = "Sign in";
      btn.addEventListener("click", function () { G.cloud.signIn(); });
      el.appendChild(btn);
    } else {
      var syncBtn = document.createElement("button");
      syncBtn.type = "button";
      syncBtn.className = "auth-btn";
      syncBtn.textContent = "Sync now";
      syncBtn.title = "Use only from a browser that has the budget library you want to preserve. Most users do not need this unless asked during troubleshooting.";
      if (!((G.store.get().budgets || []).length)) {
        syncBtn.disabled = true;
        syncBtn.title = "No local budgets to sync from this browser. Use only from a browser that has the budget library you want to preserve.";
      }
      syncBtn.addEventListener("click", function () {
        if (G.cloud && G.cloud.saveState) G.cloud.saveState(G.store.get()).catch(function (e) { console.error(e); });
      });
      el.appendChild(syncBtn);
      btn.textContent = "Sign out";
      btn.addEventListener("click", function () { G.cloud.signOut(); });
      el.appendChild(btn);
    }
  }

  function renderSignInGate() {
    var G = window.GMB;
    var nav = document.getElementById("tab-nav");
    var content = document.getElementById("tab-content");
    var status = document.getElementById("data-status");
    if (nav) nav.innerHTML = "";
    if (status) {
      status.textContent = "Sign in required for shared budgeting workspace";
      status.className = "data-status warn";
    }
    if (!content) return;
    content.className = "tab-content auth-gate-wrap";
    content.innerHTML = "";

    var card = document.createElement("section");
    card.className = "auth-gate";
    var title = document.createElement("h2");
    title.textContent = "Sign in to access the budgeting workspace";
    var body = document.createElement("p");
    body.textContent = "The hosted Gambia budgeting app uses PATH-managed sign-in so scenarios, cost sets, and generated budgets can be shared across authorised users. If you were given a temporary password, sign in with it and then create your own password when prompted.";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.textContent = "Sign in";
    btn.addEventListener("click", function () { G.cloud.signIn(); });
    card.appendChild(title);
    card.appendChild(body);
    card.appendChild(btn);
    content.appendChild(card);
    renderCloudStatus();
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
      if (G.cloud.config && G.cloud.config.enabled && !(await G.cloud.isSignedIn())) {
        renderSignInGate();
        return;
      }
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
