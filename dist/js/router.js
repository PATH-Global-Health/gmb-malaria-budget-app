/* Tab navigation. Builds the nav bar and renders the active tab.
   `gate` lets later tabs disable themselves until prerequisites exist. */
window.GMB = window.GMB || {};

(function (G) {
  var TABS = [
    { id: "overview", label: "Overview" },
    { id: "methods",  label: "Methods" },
    { id: "scenario", label: "Scenario specification", step: 1 },
    { id: "costs",    label: "Cost specification",     step: 2 },
    { id: "generate", label: "Budget generation",      step: 3 },
    { id: "viz",      label: "Budget visualisation",   step: 4 },
    { id: "compare",  label: "Budget comparison",      step: 5 }
  ];

  var navEl, contentEl, current = null;

  function render() {
    var active = G.store.get().activeTab;

    // (Re)build nav
    navEl.innerHTML = "";
    TABS.forEach(function (t, i) {
      var btn = document.createElement("button");
      btn.className = "tab-btn" + (t.id === active ? " active" : "");
      btn.type = "button";
      if (t.step) {
        var num = document.createElement("span");
        num.className = "step-num";
        num.textContent = t.step;
        btn.appendChild(num);
      }
      var lbl = document.createElement("span");
      lbl.textContent = t.label;
      btn.appendChild(lbl);
      btn.addEventListener("click", function () { G.router.go(t.id); });
      navEl.appendChild(btn);
    });

    // Render active tab body
    G.router._leaveGuard = null; // each tab re-registers its own guard if needed
    var WIDE = { scenario: 1, costs: 1, generate: 1, viz: 1, compare: 1 };
    contentEl.className = "tab-content" + (WIDE[active] ? " wide" : "");
    var tab = G.tabs[active];
    contentEl.innerHTML = "";
    if (tab && typeof tab.render === "function") {
      tab.render(contentEl);
    } else {
      contentEl.textContent = "Unknown tab: " + active;
    }
    contentEl.focus();
  }

  G.router = {
    init: function () {
      navEl = document.getElementById("tab-nav");
      contentEl = document.getElementById("tab-content");
      G.store.subscribe(function () {
        // Only re-render when the active tab changes (tabs manage their own bodies otherwise)
        if (current !== G.store.get().activeTab) { current = G.store.get().activeTab; render(); }
      });
      current = G.store.get().activeTab;
      render();
    },
    go: function (id) {
      if (id === G.store.get().activeTab) return;
      var guard = G.router._leaveGuard;
      function proceed() { G.store.setActiveTab(id); }
      if (guard) guard(proceed); else proceed();
    },
    /** A tab can register fn(proceed) to intercept navigation away (e.g. unsaved changes). */
    setLeaveGuard: function (fn) { G.router._leaveGuard = fn; },
    tabs: TABS
  };
})(GMB);
