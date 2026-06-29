/* Dependency-free SVG choropleth of The Gambia, built from GMB.data.geo.
   Geometry/projection are computed once and cached so many small maps are cheap.
   Works offline / from file:// — no tiles, no Leaflet. */
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
      info.push({ key: key, props: f.properties });
    });
    var regions = (((GMB.data.geo || {}).adm1 || {}).features || []).map(function (f) { return pathD(f.geometry); });
    _g = { W: W, H: H, dByKey: dByKey, info: info, regions: regions };
    return _g;
  }

  /** Build a map. opts.onClick(key, props). Returns { el, keys, setColors, setTitles, setOutline }. */
  ui.gambiaMap = function (opts) {
    opts = opts || {};
    var g = geometry();
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 " + g.W + " " + g.H);
    svg.setAttribute("class", "gmb-map");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Map of The Gambia districts");
    svg.style.width = "100%"; svg.style.height = "auto";

    var paths = {};
    g.info.forEach(function (it) {
      var p = document.createElementNS(SVGNS, "path");
      p.setAttribute("d", g.dByKey[it.key]);
      p.setAttribute("fill", "#e6e9ef"); p.setAttribute("stroke", "#ffffff");
      p.setAttribute("stroke-width", "0.8"); p.setAttribute("class", "gmb-map-dist");
      p.style.cursor = opts.onClick ? "pointer" : "default";
      var t = document.createElementNS(SVGNS, "title");
      t.textContent = it.props.adm2 + " (" + it.props.adm1 + ")";
      p.appendChild(t);
      if (opts.onClick) {
        p.addEventListener("click", (function (key, props) { return function () { opts.onClick(key, props); }; })(it.key, it.props));
      }
      paths[it.key] = { el: p, titleEl: t, props: it.props };
      svg.appendChild(p);
    });
    g.regions.forEach(function (d) {
      var rp = document.createElementNS(SVGNS, "path");
      rp.setAttribute("d", d); rp.setAttribute("fill", "none"); rp.setAttribute("stroke", "#111111");
      rp.setAttribute("stroke-width", "1.8"); rp.setAttribute("stroke-linejoin", "round");
      rp.setAttribute("pointer-events", "none"); rp.setAttribute("class", "gmb-map-region");
      svg.appendChild(rp);
    });

    return {
      el: svg,
      keys: Object.keys(paths),
      setColors: function (fn) { Object.keys(paths).forEach(function (k) { paths[k].el.setAttribute("fill", fn(k, paths[k].props) || "#e6e9ef"); }); },
      setTitles: function (fn) { Object.keys(paths).forEach(function (k) { paths[k].titleEl.textContent = fn(k, paths[k].props); }); },
      /** Set each district's border colour (e.g. match the fill to hide internal lines for a region-only view). */
      setStroke: function (fn) { Object.keys(paths).forEach(function (k) { paths[k].el.setAttribute("stroke", fn(k, paths[k].props) || "#ffffff"); }); },
      setOutline: function (fn) {
        Object.keys(paths).forEach(function (k) {
          var on = fn(k, paths[k].props);
          paths[k].el.setAttribute("stroke", on ? "#08356f" : "#ffffff");
          paths[k].el.setAttribute("stroke-width", on ? "2.2" : "0.8");
        });
      }
    };
  };

  /** Export any inline SVG element to a downloaded PNG (white background, 2× scale). */
  ui.downloadSvgPng = function (svg, filename) {
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
