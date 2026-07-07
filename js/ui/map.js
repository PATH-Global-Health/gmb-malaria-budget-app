/* Leaflet display maps for The Gambia, with an SVG fallback/export layer built
   from the bundled GeoJSON. The public CDN Leaflet script is optional: if it is
   unavailable the app still renders the original inline SVG map. */
window.GMB = window.GMB || {};
GMB.ui = GMB.ui || {};

(function (ui) {
  var SVGNS = "http://www.w3.org/2000/svg";

  function eachRing(geom, cb) {
    if (!geom) return;
    if (geom.type === "Polygon") geom.coordinates.forEach(cb);
    else if (geom.type === "MultiPolygon") geom.coordinates.forEach(function (poly) { poly.forEach(cb); });
  }
  function bounds(features) {
    var b = { minx: Infinity, miny: Infinity, maxx: -Infinity, maxy: -Infinity };
    features.forEach(function (f) {
      eachRing(f.geometry, function (ring) {
        ring.forEach(function (p) {
          if (p[0] < b.minx) b.minx = p[0]; if (p[0] > b.maxx) b.maxx = p[0];
          if (p[1] < b.miny) b.miny = p[1]; if (p[1] > b.maxy) b.maxy = p[1];
        });
      });
    });
    return b;
  }

  var _g = null;
  function geometry() {
    if (_g) return _g;
    var geo = (GMB.data && GMB.data.geo && GMB.data.geo.adm2) || { features: [] };
    var feats = geo.features || [];
    var W = 1000, pad = 8, b = bounds(feats);
    var dx = (b.maxx - b.minx) || 1, dy = (b.maxy - b.miny) || 1;
    var H = Math.max(120, Math.round((W - 2 * pad) * (dy / dx) + 2 * pad));
    function px(p) { return pad + (p[0] - b.minx) / dx * (W - 2 * pad); }
    function py(p) { return pad + (b.maxy - p[1]) / dy * (H - 2 * pad); }
    function pathD(geom) {
      var d = "";
      eachRing(geom, function (ring) {
        ring.forEach(function (p, i) { d += (i ? "L" : "M") + px(p).toFixed(1) + " " + py(p).toFixed(1) + " "; });
        d += "Z ";
      });
      return d;
    }
    var dByKey = {}, info = [];
    feats.forEach(function (f) {
      var key = f.properties.adm1 + "|" + f.properties.adm2;
      dByKey[key] = pathD(f.geometry);
      info.push({ key: key, props: f.properties, feature: f });
    });
    var regions = (((GMB.data.geo || {}).adm1 || {}).features || []).map(function (f) { return pathD(f.geometry); });
    _g = { W: W, H: H, dByKey: dByKey, info: info, regions: regions };
    return _g;
  }

  function svgNode(name, attrs) {
    var n = document.createElementNS(SVGNS, name);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function textNode(x, y, text, attrs) {
    var t = svgNode("text", Object.assign({ x: x, y: y, "font-family": "Arial, sans-serif", "font-size": 22, fill: "#253447" }, attrs || {}));
    t.textContent = text;
    return t;
  }
  function buildSvgMap(opts, state) {
    opts = opts || {};
    state = state || { colors: {}, titles: {}, strokes: {}, outline: {} };
    var g = geometry();
    var svg = svgNode("svg", { viewBox: "0 0 " + g.W + " " + g.H, class: "gmb-map", role: "img", "aria-label": "Map of The Gambia districts" });
    svg.style.width = "100%"; svg.style.height = "auto";
    var paths = {};
    g.info.forEach(function (it) {
      var p = svgNode("path", {
        d: g.dByKey[it.key],
        fill: state.colors[it.key] || "#e6e9ef",
        stroke: state.outline[it.key] ? "#08356f" : (state.strokes[it.key] || "#ffffff"),
        "stroke-width": state.outline[it.key] ? "2.2" : "0.8",
        class: "gmb-map-dist"
      });
      p.style.cursor = opts.onClick ? "pointer" : "default";
      var t = svgNode("title");
      t.textContent = state.titles[it.key] || (it.props.adm2 + " (" + it.props.adm1 + ")");
      p.appendChild(t);
      if (opts.onClick) p.addEventListener("click", function () { opts.onClick(it.key, it.props); });
      paths[it.key] = { el: p, titleEl: t, props: it.props };
      svg.appendChild(p);
    });
    g.regions.forEach(function (d) {
      svg.appendChild(svgNode("path", { d: d, fill: "none", stroke: "#111111", "stroke-width": "1.8", "stroke-linejoin": "round", "pointer-events": "none", class: "gmb-map-region" }));
    });
    return { svg: svg, paths: paths };
  }
  function appendSvgLegend(svg, spec) {
    if (!spec) return svg;
    var vb = svg.getAttribute("viewBox").split(/\s+/).map(Number), W = vb[2], H = vb[3];
    var legH = spec.kind === "gradient" ? 78 : swatchHeight(spec.items || [], W);
    svg.setAttribute("viewBox", vb[0] + " " + vb[1] + " " + W + " " + (H + legH + 8));
    if (spec.kind === "gradient") {
      var id = "gmbg-export-" + Math.random().toString(36).slice(2), defs = svgNode("defs"), g = svgNode("linearGradient", { id: id, x1: "0", y1: "0", x2: "1", y2: "0" });
      (spec.stops || [[0, "#ffffb2"], [.25, "#fed976"], [.5, "#feb24c"], [.7, "#fd8d3c"], [.85, "#f03b20"], [1, "#bd0026"]]).forEach(function (st) { g.appendChild(svgNode("stop", { offset: (st[0] * 100) + "%", "stop-color": st[1] })); });
      defs.appendChild(g); svg.appendChild(defs);
      var barW = W * 0.6, barX = (W - barW) / 2, barY = H + 30;
      if (spec.label) svg.appendChild(textNode(barX, H + 18, spec.label, { fill: "#617187" }));
      svg.appendChild(svgNode("rect", { x: barX, y: barY, width: barW, height: 18, fill: "url(#" + id + ")", stroke: "#d8dee8" }));
      svg.appendChild(textNode(barX, barY + 38, spec.fmt(spec.min)));
      svg.appendChild(textNode(barX + barW, barY + 38, spec.fmt(spec.max), { "text-anchor": "end" }));
    } else {
      packSwatches(svg, spec.items || [], W, H + 6);
    }
    return svg;
  }
  function swatchHeight(items, W) { return packSwatches(null, items, W, 0); }
  function packSwatches(svg, items, W, yTop) {
    var pad = 18, lineH = 34, sw = 22, gap = 10, charW = 11, x = pad, y = yTop + 26, rows = 1;
    items.forEach(function (it) {
      var tw = sw + gap + String(it.label || "").length * charW + 26;
      if (x + tw > W - pad && x > pad) { x = pad; y += lineH; rows++; }
      if (svg) {
        svg.appendChild(svgNode("rect", { x: x, y: y - sw + 4, width: sw, height: sw, rx: 3, fill: it.color || "#ccc" }));
        svg.appendChild(textNode(x + sw + gap, y, it.label || ""));
      }
      x += tw;
    });
    return (yTop + 26) + (rows - 1) * lineH + 18 - yTop;
  }

  function leafletMap(opts) {
    var g = geometry(), state = { colors: {}, titles: {}, strokes: {}, outline: {} };
    var wrap = document.createElement("div");
    wrap.className = "gmb-map gmb-leaflet-map";
    wrap.setAttribute("role", "img");
    wrap.setAttribute("aria-label", "Map of The Gambia districts");
    var host = document.createElement("div");
    host.className = "gmb-leaflet-host";
    wrap.appendChild(host);
    var layers = {}, baseStyle = function (feature) {
      var key = feature.properties.adm1 + "|" + feature.properties.adm2;
      return { fillColor: state.colors[key] || "#e6e9ef", fillOpacity: 1, color: state.outline[key] ? "#08356f" : (state.strokes[key] || "#ffffff"), weight: state.outline[key] ? 2.2 : 0.8, opacity: 1 };
    };
    var map = L.map(host, { zoomControl: false, attributionControl: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, dragging: true });
    var gj = L.geoJSON((GMB.data.geo && GMB.data.geo.adm2) || { type: "FeatureCollection", features: [] }, {
      style: baseStyle,
      onEachFeature: function (feature, layer) {
        var key = feature.properties.adm1 + "|" + feature.properties.adm2;
        layers[key] = layer;
        layer.bindTooltip(feature.properties.adm2 + " (" + feature.properties.adm1 + ")", { sticky: true });
        if (opts.onClick) layer.on("click", function () { opts.onClick(key, feature.properties); });
      }
    }).addTo(map);
    L.geoJSON((GMB.data.geo && GMB.data.geo.adm1) || { type: "FeatureCollection", features: [] }, { style: { fillOpacity: 0, color: "#111111", weight: 1.6, opacity: 1, interactive: false } }).addTo(map);
    try { map.fitBounds(gj.getBounds(), { padding: [4, 4] }); } catch (e) {}
    setTimeout(function () { map.invalidateSize(); try { map.fitBounds(gj.getBounds(), { padding: [4, 4] }); } catch (e) {} }, 80);
    wrap._gmbLeaflet = map;
    wrap._gmbExportSvg = function () { return appendSvgLegend(buildSvgMap(opts, state).svg, wrap._gmbLegendSpec); };
    function restyle() { Object.keys(layers).forEach(function (k) { layers[k].setStyle(baseStyle(layers[k].feature)); }); }
    return {
      el: wrap,
      keys: g.info.map(function (it) { return it.key; }),
      setColors: function (fn) { g.info.forEach(function (it) { state.colors[it.key] = fn(it.key, it.props) || "#e6e9ef"; }); restyle(); },
      setTitles: function (fn) { g.info.forEach(function (it) { state.titles[it.key] = fn(it.key, it.props); if (layers[it.key]) layers[it.key].bindTooltip(state.titles[it.key] || "", { sticky: true }); }); },
      setStroke: function (fn) { g.info.forEach(function (it) { state.strokes[it.key] = fn(it.key, it.props) || "#ffffff"; }); restyle(); },
      setOutline: function (fn) { g.info.forEach(function (it) { state.outline[it.key] = !!fn(it.key, it.props); }); restyle(); }
    };
  }

  function svgMap(opts) {
    var state = { colors: {}, titles: {}, strokes: {}, outline: {} };
    var built = buildSvgMap(opts, state), paths = built.paths;
    return {
      el: built.svg,
      keys: Object.keys(paths),
      setColors: function (fn) { Object.keys(paths).forEach(function (k) { state.colors[k] = fn(k, paths[k].props) || "#e6e9ef"; paths[k].el.setAttribute("fill", state.colors[k]); }); },
      setTitles: function (fn) { Object.keys(paths).forEach(function (k) { state.titles[k] = fn(k, paths[k].props); paths[k].titleEl.textContent = state.titles[k]; }); },
      setStroke: function (fn) { Object.keys(paths).forEach(function (k) { state.strokes[k] = fn(k, paths[k].props) || "#ffffff"; paths[k].el.setAttribute("stroke", state.strokes[k]); }); },
      setOutline: function (fn) {
        Object.keys(paths).forEach(function (k) {
          state.outline[k] = !!fn(k, paths[k].props);
          paths[k].el.setAttribute("stroke", state.outline[k] ? (opts.selectedStroke || "#08356f") : (state.strokes[k] || "#ffffff"));
          paths[k].el.setAttribute("stroke-width", state.outline[k] ? (opts.selectedWidth || "2.2") : "0.8");
          if (state.outline[k] && paths[k].el.parentNode) paths[k].el.parentNode.appendChild(paths[k].el);
        });
      }
    };
  }

  /** Build a map. opts.onClick(key, props). Returns { el, keys, setColors, setTitles, setStroke, setOutline }. */
  ui.gambiaMap = function (opts) {
    opts = opts || {};
    // Keep the proven SVG renderer active while Leaflet rendering is reviewed.
    // The Leaflet code remains above, but the current GeoJSON-only Leaflet view
    // can render blank in the hosted app for some users.
    return svgMap(opts);
  };

  /** Export any inline SVG element or Leaflet map wrapper to a downloaded PNG. */
  ui.downloadSvgPng = function (svg, filename) {
    if (svg && svg._gmbExportSvg) svg = svg._gmbExportSvg();
    var vb = (svg.getAttribute("viewBox") || "0 0 1000 600").split(/\s+/);
    var w = +vb[2] || 1000, h = +vb[3] || 600, scale = 2;
    var clone = svg.cloneNode(true);
    clone.setAttribute("width", w); clone.setAttribute("height", h);
    var xml = new XMLSerializer().serializeToString(clone);
    var url = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
    var img = new Image();
    img.onload = function () {
      var c = document.createElement("canvas"); c.width = w * scale; c.height = h * scale;
      var ctx = c.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(function (blob) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = filename || "map.png"; a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      });
    };
    img.src = url;
  };

  ui.downloadButton = function (getSvg, filename, label) {
    return ui.el("button", { class: "linkbtn dl-btn", onClick: function () { ui.downloadSvgPng(getSvg(), filename); } }, [label || "Download PNG"]);
  };
})(GMB.ui);
