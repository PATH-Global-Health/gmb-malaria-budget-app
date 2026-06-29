/* Dependency-free SVG charts + colour helpers. Each figure is a SINGLE
   self-contained SVG with its legend baked in and ALL styling inline.
   On screen every chart uses the same compact canvas (cards align); for PNG
   export (opts.export) a larger canvas with full, untruncated labels is built
   so nothing is cut off or overlaps. */
window.GMB = window.GMB || {};
GMB.charts = GMB.charts || {};

(function (C) {
  var SVGNS = "http://www.w3.org/2000/svg";
  var FONT = '"Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif';
  var INK = "#1f2933", MUTED = "#5b6b7b", GRID = "#eef1f5", AXIS = "#cbd3de", BLUE_D = "#081566";
  var CW = 480, CH = 430;   // compact canvas (on-screen; keeps chart cards equal height)

  var CAT = ["#2f6fed", "#15a36b", "#f0883e", "#e23b50", "#8b5cf6", "#d61f8d", "#0bbbd6", "#9aca3c",
    "#a8631b", "#5b6b8c", "#c026d3", "#0e7490", "#b45309", "#4f46e5", "#16a34a", "#dc2626"];
  var CLASS_COLOR = { PROC: "#C9CBA3", DIST: "#FFE1A8", OPS: "#E26D5C", SUPP: "#723D46", "M&E": "#472D30", COM: "#9aa07e", ADMIN: "#a85c50", OTHER: "#8a8a8a" };
  var EARTH = ["#C9CBA3", "#FFE1A8", "#E26D5C", "#723D46", "#472D30", "#9aa07e", "#a85c50", "#8a8a8a"];
  var MIX = ["#7209b7", "#f72585", "#4cc9f0", "#fb8500", "#2a9d8f", "#ff7096", "#9d4edd", "#00b4d8",
    "#e9c46a", "#06d6a0", "#b5179e", "#5e548e", "#ee6c4d", "#3a86ff"];
  var YEARP = ["#264653", "#2a9d8f", "#e9c46a", "#f4a261", "#e76f51", "#457b9d"];
  // Budget palette — deep jewel tones, deliberately distinct from interventions/cost classes.
  var BUDG = ["#0b525b", "#c44536", "#5a189a", "#1d3557", "#9c6644", "#6a994e", "#a4133c", "#3d348b"];

  var _ivColor = null;
  function ivColor(code) {
    if (!_ivColor) { _ivColor = {}; (GMB.catalog || []).forEach(function (c, i) { _ivColor[c.code] = CAT[i % CAT.length]; }); }
    return _ivColor[code] || "#64748b";
  }
  function regionColor(adm1) { var r = (GMB.reference ? GMB.reference.regions() : []); var i = r.indexOf(adm1); return MIX[(i < 0 ? 0 : i) % MIX.length]; }
  C.cat = function (i) { return CAT[i % CAT.length]; };
  C.mixColor = function (i) { return MIX[i % MIX.length]; };
  C.budget = function (i) { return BUDG[i % BUDG.length]; };
  C.colorFor = function (dim, key, index) {
    if (dim === "intervention_code") return ivColor(key);
    if (dim === "cost_class") return CLASS_COLOR[key] || EARTH[(index || 0) % EARTH.length];
    if (dim === "year") return YEARP[(index || 0) % YEARP.length];
    if (dim === "adm1") return regionColor(key);
    return CAT[(index || 0) % CAT.length];
  };
  C.ivColor = ivColor;

  var YLORRD = [[255, 255, 178], [254, 217, 118], [254, 178, 76], [253, 141, 60], [240, 59, 32], [189, 0, 38]];
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  C.rampYlOrRd = function (t) {
    t = clamp01(t); var n = YLORRD.length - 1, i = Math.min(n - 1, Math.floor(t * n)), fr = t * n - i;
    var a = YLORRD[i], b = YLORRD[i + 1];
    return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * fr) + "," + Math.round(a[1] + (b[1] - a[1]) * fr) + "," + Math.round(a[2] + (b[2] - a[2]) * fr) + ")";
  };
  // Diverging green → yellow → red (RdYlGn reversed) — low is good, high is bad.
  var GYR = [[26, 152, 80], [145, 207, 96], [255, 255, 191], [252, 141, 89], [215, 48, 39]];
  C.rampGYR = function (t) {
    t = clamp01(t); var n = GYR.length - 1, i = Math.min(n - 1, Math.floor(t * n)), fr = t * n - i, a = GYR[i], b = GYR[i + 1];
    return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * fr) + "," + Math.round(a[1] + (b[1] - a[1]) * fr) + "," + Math.round(a[2] + (b[2] - a[2]) * fr) + ")";
  };
  C.GYR_STOPS = [[0, "#1a9850"], [.25, "#91cf60"], [.5, "#ffffbf"], [.75, "#fc8d59"], [1, "#d73027"]];

  function node(tag, attrs, text) {
    var n = document.createElementNS(SVGNS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }
  function txt(x, y, s, o) {
    o = o || {};
    return node("text", { x: x, y: y, fill: o.fill || INK, "font-size": o.size || 14, "font-family": FONT, "font-weight": o.weight || 400, "text-anchor": o.anchor || "start" }, s);
  }
  function tipped(el, t) { el.appendChild(node("title", null, t)); return el; }
  function ell(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function contrast(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return "#fff";
    var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#1f2933" : "#ffffff";
  }
  function svg(w, h) {
    var s = node("svg", { viewBox: "0 0 " + w + " " + h, preserveAspectRatio: "xMidYMid meet", role: "img" });
    s.setAttribute("class", "gmb-chart"); s.style.width = "100%"; s.style.height = "auto"; return s;
  }
  function emptySvg(msg) { var s = svg(CW, CH); s.appendChild(txt(CW / 2, CH / 2, msg || "No data for the current filters.", { fill: MUTED, size: 15, anchor: "middle" })); return s; }
  function niceMax(v) { if (!(v > 0)) return 1; var e = Math.floor(Math.log(v) / Math.LN10), base = Math.pow(10, e), n = v / base; var s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10; return s * base; }
  function ticksOf(max) { var out = [], n = 4; for (var i = 0; i <= n; i++) out.push(max / n * i); return out; }

  // Aligned grid legend: equal-width columns, row-major, so swatches/labels line up.
  // Columns chosen to use the width; over-long labels are ellipsised to the column.
  function packLegend(items, yTop, s, W, size) {
    var pad = 12, sw = Math.round(size * 0.85), gap = 6, lineH = Math.round(size * 1.4), charW = size * 0.54;
    var avail = W - pad * 2, minCol = size >= 16 ? 165 : 150, cols = Math.max(1, Math.min(items.length, Math.floor(avail / minCol))), colW = avail / cols;
    var maxChars = Math.max(10, Math.floor((colW - sw - gap - 8) / charW));
    if (s) items.forEach(function (it, i) {
      var c = i % cols, r = Math.floor(i / cols), x = pad + c * colW, y = yTop + size + r * lineH;
      s.appendChild(node("rect", { x: x, y: y - sw + 1, width: sw, height: sw, rx: 2, fill: it.color }));
      s.appendChild(txt(x + sw + gap, y, ell(it.label, maxChars), { fill: INK, size: size }));
    });
    return yTop + size + (Math.ceil(items.length / cols) - 1) * lineH + size;
  }

  /** Vertical bars. opts: { cats, series, mode, fmtFull, fmtShort, legend, export } */
  C.bars = function (opts) {
    var cats = opts.cats || [], series = opts.series || [];
    if (!cats.length || !series.length) return emptySvg(opts.emptyText);
    var fmtFull = opts.fmtFull || String, fmtShort = opts.fmtShort || String, big = opts.export;
    var pct = opts.mode === "stacked100", grouped = opts.mode === "grouped";
    var W = big ? 1040 : CW, ml = big ? 86 : 64, mr = big ? 28 : 16, mt = big ? 18 : 16;
    var hasLeg = opts.legend && opts.legend.length;
    var plotH = big ? 410 : (hasLeg ? 250 : 312), labelBand = big ? 116 : 92, fs = big ? 17 : 13, maxLbl = big ? 24 : 14;
    var plotW = W - ml - mr, legTop = mt + plotH + labelBand;
    var legFs = big ? 16 : fs;
    var legH = (opts.legend && opts.legend.length) ? packLegend(opts.legend, legTop, null, W, legFs) - legTop : 0;
    var H = big ? (legTop + legH + 10) : Math.max(CH, legTop + legH + 8);   // grow to fit the legend
    var s = svg(W, H);

    var catTotals = cats.map(function (_, ci) { var t = 0; series.forEach(function (sr) { t += sr.values[ci] || 0; }); return t; });
    var max = 0;
    cats.forEach(function (_, ci) { if (pct) max = 1; else if (grouped) series.forEach(function (sr) { if ((sr.values[ci] || 0) > max) max = sr.values[ci] || 0; }); else if (catTotals[ci] > max) max = catTotals[ci]; });
    if (opts.refLine && !pct && opts.refLine.value > max) max = opts.refLine.value;
    var maxN = pct ? 1 : niceMax(max);
    function y(v) { return mt + plotH - (v / maxN) * plotH; }
    ticksOf(maxN).forEach(function (tv) {
      s.appendChild(node("line", { x1: ml, y1: y(tv), x2: ml + plotW, y2: y(tv), stroke: GRID, "stroke-width": 1 }));
      s.appendChild(txt(ml - 6, y(tv) + 4, pct ? Math.round(tv * 100) + "%" : fmtShort(tv), { fill: MUTED, size: fs, anchor: "end" }));
    });
    var band = Math.min(plotW / cats.length, big ? 150 : 96), groupW = band * cats.length, xoff = ml + (plotW - groupW) / 2;
    var bw = Math.min(band * 0.72, big ? 96 : 56), bx0 = (band - bw) / 2, sub = grouped ? bw / series.length : bw;
    cats.forEach(function (label, ci) {
      var cx = xoff + ci * band + bx0, accTop = 0, ctot = catTotals[ci];
      series.forEach(function (ser, si) {
        var v = ser.values[ci] || 0; if (!(v > 0)) return;
        var disp = pct ? (ctot ? v / ctot : 0) : v, rx, ry, hgt;
        if (grouped) { rx = cx + si * sub; ry = y(v); hgt = (v / maxN) * plotH; }
        else { rx = cx; accTop += disp; ry = y(accTop); hgt = (disp / maxN) * plotH; }
        var rect = node("rect", { x: rx.toFixed(1), y: ry.toFixed(1), width: (grouped ? sub - 1 : bw).toFixed(1), height: Math.max(0, hgt).toFixed(1), fill: ser.colorByCat ? ser.colorByCat[ci] : ser.color });
        rect.setAttribute("class", "chart-bar");
        s.appendChild(tipped(rect, label + " — " + ser.label + ": " + fmtFull(v) + (pct && ctot ? " (" + Math.round(v / ctot * 100) + "%)" : "")));
      });
      if (opts.barLabels && !pct && !grouped && ctot > 0) s.appendChild(txt(xoff + ci * band + band / 2, y(ctot) - 7, fmtShort(ctot), { fill: INK, size: fs, weight: 600, anchor: "middle" }));
      var mx = xoff + ci * band + band / 2, ly = mt + plotH + (big ? 22 : 16);
      var t = txt(mx, ly, ell(label, maxLbl), { fill: INK, size: fs, anchor: "end" });
      t.setAttribute("transform", "rotate(" + (big ? -28 : -32) + " " + mx.toFixed(1) + " " + ly + ")");
      tipped(t, label); s.appendChild(t);
    });
    s.appendChild(node("line", { x1: ml, y1: mt + plotH, x2: ml + plotW, y2: mt + plotH, stroke: AXIS, "stroke-width": 1 }));
    if (opts.refLine && !pct && opts.refLine.value > 0) {
      var ry = y(opts.refLine.value);
      s.appendChild(node("line", { x1: ml, y1: ry, x2: ml + plotW, y2: ry, stroke: "#f59e0b", "stroke-width": 2, "stroke-dasharray": "7 4" }));
      if (opts.refLine.label) s.appendChild(txt(ml + plotW, ry - 5, opts.refLine.label, { fill: "#b45309", size: fs, anchor: "end" }));
    }
    if (legH) packLegend(opts.legend, legTop, s, W, legFs);
    return s;
  };

  /** Diverging horizontal bars from a centre zero line (Δ vs baseline). opts: { items:[{label,value,color?}], fmtFull, fmtShort, export } */
  C.divBars = function (opts) {
    var items = (opts.items || []).slice();
    if (!items.length) return emptySvg(opts.emptyText);
    var fmtFull = opts.fmtFull || String, fmtShort = opts.fmtShort || String, big = opts.export;
    var fs = big ? 20 : 13, maxLbl = big ? 70 : 22;
    var ml = big ? 300 : 150, mt = 16, mb = big ? 44 : 30, mr = big ? 100 : 70;
    var W = big ? 1000 : CW, H = big ? (mt + mb + items.length * 46) : CH;
    var plotW = W - ml - mr, plotH = H - mt - mb, rowH = plotH / items.length, barH = Math.min(rowH * 0.55, big ? 28 : 30);
    var maxAbs = items.reduce(function (m, it) { return Math.max(m, Math.abs(it.value || 0)); }, 0) || 1, nm = niceMax(maxAbs);
    var cx = ml + plotW / 2, s = svg(W, H);
    function x(v) { return cx + (v / nm) * (plotW / 2); }
    function signed(v) { return (v > 0 ? "+" : v < 0 ? "−" : "") + fmtShort(Math.abs(v)); }
    s.appendChild(node("line", { x1: cx, y1: mt, x2: cx, y2: mt + plotH, stroke: AXIS, "stroke-width": 1 }));
    s.appendChild(txt(ml, mt + plotH + (big ? 30 : 20), "−" + fmtShort(nm), { fill: MUTED, size: fs }));
    s.appendChild(txt(cx, mt + plotH + (big ? 30 : 20), "0", { fill: MUTED, size: fs, anchor: "middle" }));
    s.appendChild(txt(ml + plotW, mt + plotH + (big ? 30 : 20), "+" + fmtShort(nm), { fill: MUTED, size: fs, anchor: "end" }));
    items.forEach(function (it, i) {
      var cy = mt + i * rowH + rowH / 2, v = it.value || 0;
      s.appendChild(tipped(txt(ml - 8, cy + 4, ell(it.label, maxLbl), { fill: INK, size: fs, anchor: "end" }), it.label));
      var col = it.color || (v > 0 ? "#d92d20" : v < 0 ? "#2e7d4f" : "#cbd5e1");
      var x0 = Math.min(cx, x(v)), w = Math.abs(x(v) - cx);
      var rect = node("rect", { x: x0.toFixed(1), y: (cy - barH / 2).toFixed(1), width: Math.max(0, w).toFixed(1), height: barH.toFixed(1), fill: col }); rect.setAttribute("class", "chart-bar");
      s.appendChild(tipped(rect, it.label + ": " + signed(v) + " (" + fmtFull(Math.abs(v)) + ")"));
      var lx = v >= 0 ? x(v) + 5 : x(v) - 5;
      s.appendChild(txt(lx, cy + 4, signed(v), { fill: MUTED, size: fs - 1, anchor: v >= 0 ? "start" : "end" }));
    });
    return s;
  };

  /** Horizontal bars (rows fill the height). export → wide canvas + full labels. */
  C.hbars = function (opts) {
    var items = (opts.items || []).slice();
    if (!items.length) return emptySvg(opts.emptyText);
    var fmtFull = opts.fmtFull || String, fmtShort = opts.fmtShort || String, big = opts.export;
    var fs = big ? 20 : 13, maxLbl = big ? 80 : 30;
    var longest = items.reduce(function (m, it) { return Math.max(m, Math.min(it.label.length, maxLbl)); }, 0);
    var ml = big ? Math.min(620, 24 + longest * fs * 0.56) : 232;
    var mt = 16, mb = big ? 56 : 40, mr = big ? 110 : 84;
    var W = big ? Math.round(ml + 560 + mr) : CW;
    var rowH = big ? 46 : (CH - mt - mb) / items.length;
    var H = big ? (mt + mb + items.length * rowH) : CH;
    var plotW = W - ml - mr, barH = Math.min(rowH * 0.6, big ? 30 : 42), s = svg(W, H);
    var max = niceMax(items.reduce(function (m, it) { return Math.max(m, it.value || 0); }, 0));
    function x(v) { return ml + (v / max) * plotW; }
    ticksOf(max).forEach(function (tv) {
      s.appendChild(node("line", { x1: x(tv), y1: mt, x2: x(tv), y2: mt + items.length * rowH, stroke: GRID, "stroke-width": 1 }));
      s.appendChild(txt(x(tv), mt + items.length * rowH + (big ? 28 : 20), fmtShort(tv), { fill: MUTED, size: fs, anchor: "middle" }));
    });
    items.forEach(function (it, i) {
      var cy = mt + i * rowH + rowH / 2, v = it.value || 0;
      s.appendChild(tipped(txt(ml - 6, cy + 4, ell(it.label, maxLbl), { fill: INK, size: fs, anchor: "end" }), it.label));
      var rect = node("rect", { x: ml, y: (cy - barH / 2).toFixed(1), width: Math.max(0, x(v) - ml).toFixed(1), height: barH.toFixed(1), fill: it.color || "#2f6fed" });
      rect.setAttribute("class", "chart-bar");
      s.appendChild(tipped(rect, it.label + ": " + fmtFull(v)));
      s.appendChild(txt(x(v) + 5, cy + 4, fmtShort(v), { fill: MUTED, size: fs - 1 }));
    });
    return s;
  };

  /** Donut. export → larger canvas. */
  /** Lollipop chart for ranked cost elements. opts: { items:[{label,value,color,detail?}], legend, fmtFull, fmtShort, export } */
  C.lollipop = function (opts) {
    var items = (opts.items || []).slice();
    if (!items.length) return emptySvg(opts.emptyText);
    var fmtFull = opts.fmtFull || String, fmtShort = opts.fmtShort || String, big = opts.export;
    var fs = big ? 16 : 13, maxLbl = big ? 56 : 32;
    var longest = items.reduce(function (m, it) { return Math.max(m, Math.min(String(it.label || "").length, maxLbl)); }, 0);
    var ml = big ? Math.min(520, 32 + longest * fs * 0.54) : 230;
    var mt = 16, mb = big ? 56 : 40, mr = big ? 118 : 88;
    var W = big ? 1120 : CW;
    var legend = opts.legend || [], legFs = big ? 16 : 12, legH = legend.length ? packLegend(legend, 0, null, W, legFs) : 0;
    var axisBand = big ? 50 : 42;
    var rowH = big ? 46 : Math.max(10, (CH - mt - axisBand - legH - 8) / items.length);
    var H = big ? (mt + axisBand + legH + 10 + items.length * rowH) : CH;
    var plotW = W - ml - mr, s = svg(W, H);
    var max = niceMax(items.reduce(function (m, it) { return Math.max(m, it.value || 0); }, 0));
    function x(v) { return ml + (v / max) * plotW; }
    var plotBottom = mt + items.length * rowH;
    ticksOf(max).forEach(function (tv) {
      s.appendChild(node("line", { x1: x(tv), y1: mt, x2: x(tv), y2: plotBottom, stroke: GRID, "stroke-width": 1 }));
      s.appendChild(txt(x(tv), plotBottom + (big ? 28 : 20), fmtShort(tv), { fill: MUTED, size: fs, anchor: "middle" }));
    });
    items.forEach(function (it, i) {
      var cy = mt + i * rowH + rowH / 2, v = it.value || 0, col = it.color || "#2f6fed";
      s.appendChild(tipped(txt(ml - 8, cy + 4, ell(it.label, maxLbl), { fill: INK, size: fs, anchor: "end" }), it.detail || it.label));
      var stem = node("line", { x1: ml, y1: cy.toFixed(1), x2: x(v).toFixed(1), y2: cy.toFixed(1), stroke: col, "stroke-width": big ? 4 : 3, "stroke-linecap": "round", opacity: "0.75" });
      stem.setAttribute("class", "chart-bar");
      s.appendChild(tipped(stem, (it.detail || it.label) + ": " + fmtFull(v)));
      var dot = node("circle", { cx: x(v).toFixed(1), cy: cy.toFixed(1), r: big ? 9 : 6, fill: col, stroke: "#fff", "stroke-width": big ? 3 : 2 });
      dot.setAttribute("class", "chart-bar");
      s.appendChild(tipped(dot, (it.detail || it.label) + ": " + fmtFull(v)));
      s.appendChild(txt(x(v) + 8, cy + 4, fmtShort(v), { fill: MUTED, size: fs - 1 }));
    });
    s.appendChild(node("line", { x1: ml, y1: mt, x2: ml, y2: plotBottom, stroke: AXIS, "stroke-width": 1 }));
    s.appendChild(node("line", { x1: ml, y1: plotBottom, x2: ml + plotW, y2: plotBottom, stroke: AXIS, "stroke-width": 1 }));
    if (legend.length) packLegend(legend, plotBottom + axisBand - (big ? 10 : 8), s, W, legFs);
    return s;
  };

  C.donut = function (opts) {
    var items = (opts.items || []).filter(function (it) { return (it.value || 0) > 0; });
    var total = opts.total != null ? opts.total : items.reduce(function (a, b) { return a + (b.value || 0); }, 0);
    if (!items.length || !(total > 0)) return emptySvg(opts.emptyText);
    var fmtFull = opts.fmtFull || String, big = opts.export;
    var W = big ? 620 : CW, cy = big ? 230 : 175, r2 = big ? 195 : 140, r1 = big ? 118 : 86;
    var fs = big ? 16 : 13, cx = W / 2, legTop = cy + r2 + (big ? 22 : 5);
    var legH = packLegend(items.map(function (it) { return { label: it.label, color: it.color }; }), legTop, null, W, fs) - legTop;
    var s = svg(W, big ? (legTop + legH + 12) : Math.max(CH, legTop + legH + 12));   // grow to fit the legend
    function pt(a, r) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
    var a = -Math.PI / 2;
    items.forEach(function (it) {
      var frac = it.value / total, a2 = a + frac * Math.PI * 2, lg = (a2 - a) > Math.PI ? 1 : 0;
      var p1 = pt(a, r2), p2 = pt(a2, r2), p3 = pt(a2, r1), p4 = pt(a, r1);
      var d = "M" + p1[0].toFixed(1) + " " + p1[1].toFixed(1) + " A" + r2 + " " + r2 + " 0 " + lg + " 1 " + p2[0].toFixed(1) + " " + p2[1].toFixed(1) +
        " L" + p3[0].toFixed(1) + " " + p3[1].toFixed(1) + " A" + r1 + " " + r1 + " 0 " + lg + " 0 " + p4[0].toFixed(1) + " " + p4[1].toFixed(1) + " Z";
      var path = node("path", { d: d, fill: it.color }); path.setAttribute("class", "chart-slice");
      s.appendChild(tipped(path, it.label + ": " + fmtFull(it.value) + " (" + Math.round(frac * 100) + "%)"));
      if (frac >= 0.05) { var mid = (a + a2) / 2, ctr = pt(mid, (r1 + r2) / 2); s.appendChild(txt(ctr[0], ctr[1] + 5, Math.round(frac * 100) + "%", { fill: contrast(it.color), size: big ? 18 : 15, weight: 600, anchor: "middle" })); }
      a = a2;
    });
    s.appendChild(txt(cx, cy - 2, opts.centerLabel || fmtFull(total), { fill: BLUE_D, size: big ? 34 : 24, weight: 700, anchor: "middle" }));
    s.appendChild(txt(cx, cy + (big ? 28 : 20), "total", { fill: MUTED, size: fs, anchor: "middle" }));
    packLegend(items.map(function (it) { return { label: it.label, color: it.color }; }), legTop, s, W, fs);
    return s;
  };

  /** Line chart. opts:{ years:[..], series:[{label,color,values:[..]}], splitIndex, fmtFull, fmtShort, export } */
  C.line = function (opts) {
    var years = opts.years || [], series = opts.series || [];
    if (!years.length || !series.length) return emptySvg(opts.emptyText);
    var fmtFull = opts.fmtFull || String, fmtShort = opts.fmtShort || String, big = opts.export;
    var W = big ? 1040 : 720, ml = big ? 84 : 64, mr = big ? 28 : 18, mt = 16, fs = big ? 16 : 13;
    var hasLeg = series.length > 1, plotH = big ? 320 : 230, labelBand = 36, legTop = mt + plotH + labelBand, plotW = W - ml - mr;
    var legH = hasLeg ? packLegend(series.map(function (s) { return { label: s.label, color: s.color }; }), legTop, null, W, fs) - legTop : 0;
    var s = svg(W, legTop + legH + (big ? 12 : 8));
    var max = 0; series.forEach(function (se) { se.values.forEach(function (v) { if (v > max) max = v; }); });
    var maxN = niceMax(max);
    function x(i) { return ml + (years.length <= 1 ? plotW / 2 : (i / (years.length - 1)) * plotW); }
    function y(v) { return mt + plotH - (v / maxN) * plotH; }
    var split = opts.splitIndex;
    if (split != null && split > 0 && split < years.length) {
      var sx = x(split - 1);
      s.appendChild(node("rect", { x: sx.toFixed(1), y: mt, width: (ml + plotW - sx).toFixed(1), height: plotH, fill: "#f4f6f9" }));
      s.appendChild(node("line", { x1: sx, y1: mt, x2: sx, y2: mt + plotH, stroke: AXIS, "stroke-width": 1, "stroke-dasharray": "4 3" }));
      s.appendChild(txt(sx + 6, mt + 14, "projected →", { fill: MUTED, size: fs - 1 }));
    }
    ticksOf(maxN).forEach(function (tv) { s.appendChild(node("line", { x1: ml, y1: y(tv), x2: ml + plotW, y2: y(tv), stroke: GRID, "stroke-width": 1 })); s.appendChild(txt(ml - 6, y(tv) + 4, fmtShort(tv), { fill: MUTED, size: fs, anchor: "end" })); });
    var stepX = Math.ceil(years.length / 9);
    years.forEach(function (yr, i) { if (i % stepX === 0 || i === years.length - 1) s.appendChild(txt(x(i), mt + plotH + 18, String(yr), { fill: INK, size: fs, anchor: "middle" })); });
    series.forEach(function (se) {
      function seg(a, b, dashed) { var d = ""; for (var i = a; i <= b; i++) d += (i === a ? "M" : "L") + x(i).toFixed(1) + " " + y(se.values[i]).toFixed(1) + " "; var p = node("path", { d: d, fill: "none", stroke: se.color, "stroke-width": 2.5, "stroke-linejoin": "round" }); if (dashed) p.setAttribute("stroke-dasharray", "6 4"); s.appendChild(p); }
      if (split != null && split > 0 && split < years.length) { seg(0, split - 1, false); seg(split - 1, years.length - 1, true); }
      else seg(0, years.length - 1, false);
      years.forEach(function (yr, i) { var c = node("circle", { cx: x(i), cy: y(se.values[i]), r: 3, fill: se.color }); tipped(c, yr + ": " + fmtFull(se.values[i])); s.appendChild(c); });
    });
    s.appendChild(node("line", { x1: ml, y1: mt + plotH, x2: ml + plotW, y2: mt + plotH, stroke: AXIS, "stroke-width": 1 }));
    if (hasLeg) packLegend(series.map(function (se) { return { label: se.label, color: se.color }; }), legTop, s, W, fs);
    return s;
  };

  // ---- map legend (attached INTO the gambiaMap svg so it exports with the map) ----
  var _gid = 0;
  C.attachMapLegend = function (mapSvg, spec) {
    var vb = mapSvg.getAttribute("viewBox").split(/\s+/).map(Number), W = vb[2], H = vb[3];
    var legH = spec.kind === "gradient" ? 78 : packSwatch(spec.items, W, 0, null);
    mapSvg.setAttribute("viewBox", vb[0] + " " + vb[1] + " " + W + " " + (H + legH + 8));
    if (spec.kind === "gradient") {
      var id = "gmbg" + (_gid++), defs = node("defs"), g = node("linearGradient", { id: id, x1: "0", y1: "0", x2: "1", y2: "0" });
      (spec.stops || [[0, "#ffffb2"], [.25, "#fed976"], [.5, "#feb24c"], [.7, "#fd8d3c"], [.85, "#f03b20"], [1, "#bd0026"]]).forEach(function (st) { g.appendChild(node("stop", { offset: (st[0] * 100) + "%", "stop-color": st[1] })); });
      defs.appendChild(g); mapSvg.appendChild(defs);
      var barW = W * 0.6, barX = (W - barW) / 2, barY = H + 30;
      if (spec.label) mapSvg.appendChild(txt(barX, H + 18, spec.label, { fill: MUTED, size: 22 }));
      mapSvg.appendChild(node("rect", { x: barX, y: barY, width: barW, height: 18, fill: "url(#" + id + ")", stroke: AXIS }));
      mapSvg.appendChild(txt(barX, barY + 38, spec.fmt(spec.min), { fill: INK, size: 22 }));
      mapSvg.appendChild(txt(barX + barW, barY + 38, spec.fmt(spec.max), { fill: INK, size: 22, anchor: "end" }));
    } else { packSwatch(spec.items, W, H + 6, mapSvg); }
    return mapSvg;
  };
  function packSwatch(items, W, yTop, s) {
    var pad = 18, lineH = 34, sw = 22, gap = 10, charW = 11, x = pad, y = yTop + 26, rows = 1;
    items.forEach(function (it) {
      var tw = sw + gap + it.label.length * charW + 26;
      if (x + tw > W - pad && x > pad) { x = pad; y += lineH; rows++; }
      if (s) { s.appendChild(node("rect", { x: x, y: y - sw + 4, width: sw, height: sw, rx: 3, fill: it.color })); s.appendChild(txt(x + sw + gap, y, it.label, { fill: INK, size: 22 })); }
      x += tw;
    });
    return (yTop + 26) + (rows - 1) * lineH + 18 - yTop;
  }
})(GMB.charts);
