/* Small DOM helpers shared by tab views. Kept deliberately minimal;
   richer form controls (sliders, year grids) arrive with the Scenario tab. */
window.GMB = window.GMB || {};
GMB.ui = GMB.ui || {};

(function (ui) {
  /** Create an element with attributes/props and children. */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k.slice(0, 2) === "on" && typeof attrs[k] === "function") {
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  /** A stat tile (value + label). */
  function stat(value, label) {
    return el("div", { class: "stat" }, [
      el("div", { class: "value", text: value }),
      el("div", { class: "label", text: label })
    ]);
  }

  /** A "not built yet" panel used by tabs still to come. */
  function placeholder(phaseLabel, title, body) {
    return el("div", { class: "panel" }, [
      el("div", { class: "placeholder" }, [
        el("span", { class: "badge", text: phaseLabel }),
        el("h2", { text: title }),
        el("p", { class: "muted", text: body })
      ])
    ]);
  }

  /** Open a centered modal dialog. opts: {title, body(Element), footer([Elements]), className, onClose}. Returns {close, body}. */
  function openModal(opts) {
    opts = opts || {};
    var body = el("div", { class: "modal-body" });
    if (opts.body) body.appendChild(opts.body);
    function close() { document.removeEventListener("keydown", onKey); overlay.remove(); if (opts.onClose) opts.onClose(); }
    function onKey(e) { if (e.key === "Escape") close(); }
    var head = el("div", { class: "modal-head" }, [
      el("h3", { text: opts.title || "" }),
      el("button", { class: "modal-x", "aria-label": "Close", onClick: close }, ["×"])
    ]);
    var dialog = el("div", { class: "modal-dialog" + (opts.className ? " " + opts.className : "") }, [head, body]);
    if (opts.footer) dialog.appendChild(el("div", { class: "modal-foot" }, opts.footer));
    var overlay = el("div", { class: "modal-overlay", onClick: function (e) { if (e.target === overlay) close(); } }, [dialog]);
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
    return { close: close, body: body };
  }

  function expandPlot(title, buildContent) {
    var btn = el("button", { class: "plot-expand-btn", title: "Expand plot", "aria-label": "Expand plot" }, ["⛶"]);
    btn.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      var body = el("div", { class: "plot-modal-body" });
      try { body.appendChild(buildContent(true)); }
      catch (err) { body.appendChild(el("p", { class: "muted", text: "The plot could not be expanded." })); }
      openModal({ title: title || "Expanded plot", body: body, className: "plot-modal" });
    });
    return btn;
  }

  /** Render an array of content "blocks" (from GMB.content) into a fragment. */
  function blocks(arr) {
    var frag = document.createDocumentFragment();
    (arr || []).forEach(function (b) {
      if (typeof b === "string") frag.appendChild(el("p", { text: b }));
      else if (b.p) frag.appendChild(el("p", { text: b.p }));
      else if (b.h) frag.appendChild(el("h4", { text: b.h }));
      else if (b.formula) frag.appendChild(el("div", { class: "formula", text: b.formula }));
      else if (b.callout) {
        var c = b.callout, box = el("div", { class: "callout " + (c.type || "info") });
        if (c.title) box.appendChild(el("div", { class: "callout-title", text: c.title }));
        if (c.text) box.appendChild(el("p", { class: "callout-text", text: c.text }));
        if (c.items) box.appendChild(el("ul", {}, c.items.map(function (t) { return el("li", { text: t }); })));
        frag.appendChild(box);
      }
      else if (b.ul) frag.appendChild(el("ul", {}, b.ul.map(function (t) { return el("li", { text: t }); })));
      else if (b.table) {
        var t = el("table", { class: "methods-table" }, [el("tr", {}, b.table.headers.map(function (h) { return el("th", { text: h }); }))]);
        b.table.rows.forEach(function (r) { t.appendChild(el("tr", {}, r.map(function (c) { return el("td", { text: c }); }))); });
        frag.appendChild(t);
      }
    });
    return frag;
  }

  /** Collapsible "How to use this page" strip; content from GMB.content.pages[key]. */
  function pageHelp(key) {
    var c = (GMB.content && GMB.content.pages && GMB.content.pages[key]) || null;
    var det = document.createElement("details"); det.className = "page-help";
    var sum = document.createElement("summary"); sum.className = "page-help-sum"; sum.textContent = "How to use this page";
    det.appendChild(sum);
    var body = el("div", { class: "page-help-body" });
    if (c) {
      if (c.intro) body.appendChild(el("p", { class: "muted small", text: c.intro }));
      if (c.steps) body.appendChild(el("ol", { class: "help-steps" }, c.steps.map(function (s) { return el("li", { text: s }); })));
      if (c.tips && c.tips.length) body.appendChild(el("div", { class: "help-tips" }, [el("strong", { text: "Tips" }), el("ul", {}, c.tips.map(function (t) { return el("li", { text: t }); }))]));
    }
    det.appendChild(body);
    return det;
  }

  ui.el = el;
  ui.stat = stat;
  ui.placeholder = placeholder;
  ui.openModal = openModal;
  ui.expandPlot = expandPlot;
  ui.blocks = blocks;
  ui.pageHelp = pageHelp;
})(GMB.ui);
