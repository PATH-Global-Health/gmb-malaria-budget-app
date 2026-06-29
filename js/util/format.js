/* Formatting helpers — attached to the global GMB namespace. */
window.GMB = window.GMB || {};
GMB.util = GMB.util || {};

(function (u) {
  u.fmtNum = function (n) {
    if (n == null || isNaN(n)) return "—";
    return Math.round(n).toLocaleString("en-US");
  };
  u.fmtUSD = function (n) {
    if (n == null || isNaN(n)) return "—";
    return "$" + Math.round(n).toLocaleString("en-US");
  };
  u.fmtMoney = function (n, symbol) {
    if (n == null || isNaN(n)) return "—";
    return (symbol || "") + Math.round(n).toLocaleString("en-US");
  };
  u.fmtPct = function (frac) {
    if (frac == null || isNaN(frac)) return "—";
    return Math.round(frac * 100) + "%";
  };
  // Compact money for tiles: $1.2M, $850K
  u.fmtUSDshort = function (n) {
    if (n == null || isNaN(n)) return "—";
    var abs = Math.abs(n);
    if (abs >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (abs >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (abs >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
    return "$" + Math.round(n);
  };
  // Cheap, stable 32-bit FNV-1a hash → short base-36 string. Used to fingerprint
  // a scenario + cost set so a saved budget can tell when its source has changed.
  u.hash = function (str) {
    str = String(str == null ? "" : str);
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(36);
  };

  // Friendly "time ago" string from an ISO timestamp ("just now", "3 days ago").
  u.relTime = function (iso) {
    if (!iso) return "";
    var then = new Date(iso).getTime();
    if (isNaN(then)) return "";
    var s = Math.round((Date.now() - then) / 1000);
    if (s < 45) return "just now";
    var m = Math.round(s / 60);
    if (m < 60) return m + " min ago";
    var hr = Math.round(m / 60);
    if (hr < 24) return hr + " hour" + (hr > 1 ? "s" : "") + " ago";
    var d = Math.round(hr / 24);
    if (d < 30) return d + " day" + (d > 1 ? "s" : "") + " ago";
    var mo = Math.round(d / 30);
    if (mo < 12) return mo + " month" + (mo > 1 ? "s" : "") + " ago";
    var y = Math.round(mo / 12);
    return y + " year" + (y > 1 ? "s" : "") + " ago";
  };

  // Escape user-entered text before inserting into HTML
  u.esc = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };

  // Download a text/JSON/CSV file (Blob + object URL) — works offline.
  u.downloadText = function (filename, text, mime) {
    var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  };

  // Build a CSV string from a header array and rows (array of arrays).
  u.toCsv = function (headers, rows) {
    function esc(v) { v = (v == null ? "" : String(v)); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var lines = headers && headers.length ? [headers.map(esc).join(",")] : [];
    rows.forEach(function (r) { lines.push(r.map(esc).join(",")); });
    return lines.join("\r\n");
  };

  // --- Budget cost-row analysis helpers (used by the visualisation tab) ---
  // The value of a row along a dimension. "adm2" returns a composite key so
  // districts with the same name in different regions stay distinct.
  u.dimValue = function (row, dim) {
    if (dim === "adm2") return row.adm1 + "|" + row.adm2;
    return row[dim];
  };

  // Keep only rows allowed by every active filter. Each filter is an array of
  // allowed values (an include set) or null/undefined = no constraint.
  u.filterRows = function (rows, sel) {
    sel = sel || {};
    function ok(arr, v) { return !arr || arr.indexOf(v) !== -1; }
    return rows.filter(function (r) {
      return ok(sel.years, r.year)
        && ok(sel.interventions, r.intervention_code)
        && ok(sel.costClasses, r.cost_class)
        && ok(sel.regions, r.adm1)
        && ok(sel.districts, r.adm1 + "|" + r.adm2);
    });
  };

  // Roll rows up by a group dimension (and optional split dimension), summing
  // valueField. Returns { groups:[{key,total,parts}], splitKeys:[...] } in
  // first-seen order; the caller sorts as needed.
  u.pivot = function (rows, groupDim, splitDim, valueField) {
    var map = {}, order = [], splitSeen = {};
    rows.forEach(function (r) {
      var g = u.dimValue(r, groupDim), val = r[valueField] || 0;
      if (!map[g]) { map[g] = { key: g, total: 0, parts: {} }; order.push(g); }
      map[g].total += val;
      if (splitDim) {
        var s = u.dimValue(r, splitDim);
        map[g].parts[s] = (map[g].parts[s] || 0) + val;
        splitSeen[s] = true;
      }
    });
    return { groups: order.map(function (k) { return map[k]; }), splitKeys: Object.keys(splitSeen) };
  };
})(GMB.util);
