/* Overview tab — welcome, a step-by-step "how to use" guide, and tool scope. */
window.GMB = window.GMB || {};
GMB.tabs = GMB.tabs || {};

GMB.tabs.overview = {
  render: function (root) {
    var el = GMB.ui.el;
    var st = GMB.store.get();
    var C = GMB.content || {};
    root.innerHTML = "";

    // Hero
    root.appendChild(el("div", { class: "panel" }, [
      el("div", { class: "hero-text" }, [
        el("h2", { text: "Build a malaria budget for The Gambia — step by step" }),
        el("p", { class: "lead", text:
          "Turn a simple plan — which interventions, where, and at what coverage — into a " +
          "fully costed, multi-year malaria budget. Work through the steps along the top, in order." }),
        el("button", { class: "btn", onClick: function () { GMB.router.go("scenario"); } },
          ["Start a new scenario →"])
      ])
    ]));

    // How to use this tool — collapsible steps that jump to each tab
    var stepsPanel = el("div", { class: "panel" }, [el("h2", { text: "How to use this tool" })]);
    (C.guide || []).forEach(function (g, i) {
      var det = document.createElement("details"); det.className = "guide-step";
      var sum = document.createElement("summary"); sum.className = "guide-sum";
      sum.appendChild(el("span", { class: "guide-num", text: String(i + 1) }));
      sum.appendChild(el("span", { class: "guide-title", text: g.title.replace(/^\d+\.\s*/, "") }));
      det.appendChild(sum);
      var body = el("div", { class: "guide-body" }, [el("p", { text: g.lead })]);
      if (g.points) body.appendChild(el("ul", {}, g.points.map(function (p) { return el("li", { text: p }); })));
      body.appendChild(el("button", { class: "btn secondary", onClick: (function (tab) { return function () { GMB.router.go(tab); }; })(g.tab) }, ["Go to this step →"]));
      det.appendChild(body);
      stepsPanel.appendChild(det);
    });

    // What it is / is not for
    var designedFor = [
      "Strategic multi-year intervention budgeting at national or sub-national level",
      "Comparing the cost of different intervention packages and coverage scenarios",
      "Funding gap discussions and donor planning"
    ];
    var notFor = [
      "Activity-level or micro-planning costing workflows",
      "Automatic generation of a complete GF Detailed Budget format",
      "Real-time financial tracking or expenditure monitoring"
    ];
    function list(items, cls) { return el("ul", { class: cls || "fit-list" }, items.map(function (t) { return el("li", { text: t }); })); }
    var whatPanel = el("div", { class: "panel" }, [
      el("h2", { text: "What this tool is and is not for" }),
      el("p", { class: "fit-title good", text: "Designed for" }), list(designedFor),
      el("p", { class: "fit-title bad", style: "margin-top:14px", text: "Not designed for" }), list(notFor)
    ]);

    // How to use  +  What it is for, side by side
    root.appendChild(el("div", { class: "overview-cols" }, [stepsPanel, whatPanel]));

    // Saved-work strip
    root.appendChild(el("div", { class: "panel saved-strip" }, [
      el("strong", { text: "Your saved work" }),
      el("span", { class: "counts", html:
        "<b>" + st.scenarios.length + "</b> scenarios &nbsp;·&nbsp; " +
        "<b>" + st.costSets.length + "</b> cost sets &nbsp;·&nbsp; " +
        "<b>" + st.budgets.length + "</b> generated budgets" })
    ]));
  }
};
