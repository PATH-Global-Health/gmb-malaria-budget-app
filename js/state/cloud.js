/* Optional AWS-backed shared persistence.
   The app still works offline/local-only; this layer activates after Cognito sign-in. */
window.GMB = window.GMB || {};

(function (G) {
  var CFG = {
    enabled: location.hostname === "path-global-health.github.io",
    apiBase: "https://2sw09cgqc3.execute-api.us-east-2.amazonaws.com",
    cognitoDomain: "https://us-east-2cojiub4le.auth.us-east-2.amazoncognito.com",
    clientId: "7e8ggoqir9pu1vc0vuplj2k3qs",
    redirectUri: "https://path-global-health.github.io/gmb-malaria-budget-app/"
  };

  var TOKEN_KEY = "gmb_mbt_cognito_tokens";
  var VERIFIER_KEY = "gmb_mbt_pkce_verifier";
  var STATUS = { state: CFG.enabled ? "signed_out" : "disabled", message: CFG.enabled ? "Shared sync off" : "Local-only mode" };
  var lastRemoteBudgetCount = 0;

  function emit() {
    if (typeof G.cloud.onStatusChange === "function") G.cloud.onStatusChange(STATUS);
  }

  function setStatus(state, message, extra) {
    STATUS = Object.assign({ state: state, message: message || "" }, extra || {});
    emit();
  }

  function byteLength(text) {
    if (window.TextEncoder) return new TextEncoder().encode(text || "").length;
    return (text || "").length;
  }

  function fmtBytes(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
    if (bytes >= 1024) return Math.round(bytes / 1024) + " KB";
    return bytes + " B";
  }

  function chunksOf(text, size) {
    var chunks = [];
    for (var i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
    return chunks.length ? chunks : [""];
  }

  async function fetchWithTimeout(url, opts, ms) {
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, ms || 45000);
    try {
      return await fetch(url, Object.assign({}, opts || {}, { signal: ctl.signal }));
    } finally {
      clearTimeout(timer);
    }
  }

  function base64Url(bytes) {
    var str = "";
    new Uint8Array(bytes).forEach(function (b) { str += String.fromCharCode(b); });
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function decodeJwt(token) {
    try {
      var part = (token || "").split(".")[1] || "";
      var json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(decodeURIComponent(Array.prototype.map.call(json, function (c) {
        return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
      }).join("")));
    } catch (e) { return {}; }
  }

  function loadTokens() {
    try {
      var raw = localStorage.getItem(TOKEN_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function userLabel(tokens) {
    var claims = decodeJwt(tokens && tokens.id_token);
    return claims.email || claims["cognito:username"] || claims.sub || "signed-in user";
  }

  function saveTokens(tokens) {
    var exp = Date.now() + Math.max(0, ((tokens.expires_in || 3600) - 60) * 1000);
    var merged = Object.assign(loadTokens() || {}, tokens, { expires_at: exp });
    localStorage.setItem(TOKEN_KEY, JSON.stringify(merged));
    setStatus("signed_in", "Signed in", { user: userLabel(merged) });
    return merged;
  }

  function clearTokens() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  async function tokenRequest(params) {
    var body = new URLSearchParams(Object.assign({ client_id: CFG.clientId }, params));
    var res = await fetch(CFG.cognitoDomain + "/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    if (!res.ok) throw new Error("Cognito token request failed");
    return await res.json();
  }

  async function refresh(tokens) {
    if (!tokens || !tokens.refresh_token) return null;
    var next = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token });
    next.refresh_token = tokens.refresh_token;
    return saveTokens(next);
  }

  async function validTokens() {
    var tokens = loadTokens();
    if (!tokens) return null;
    if (tokens.expires_at && tokens.expires_at > Date.now()) return tokens;
    try { return await refresh(tokens); }
    catch (e) { clearTokens(); setStatus("signed_out", "Session expired"); return null; }
  }

  async function authHeader() {
    var tokens = await validTokens();
    if (!tokens || !tokens.id_token) throw new Error("Not signed in");
    return "Bearer " + tokens.id_token;
  }

  async function signIn() {
    if (!CFG.enabled) return;
    var verifierBytes = new Uint8Array(32);
    crypto.getRandomValues(verifierBytes);
    var verifier = base64Url(verifierBytes);
    var challenge = base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    localStorage.setItem(VERIFIER_KEY, verifier);
    location.assign(CFG.cognitoDomain + "/login?" + new URLSearchParams({
      client_id: CFG.clientId,
      response_type: "code",
      scope: "email openid",
      redirect_uri: CFG.redirectUri,
      code_challenge: challenge,
      code_challenge_method: "S256"
    }).toString());
  }

  async function handleCallback() {
    if (!CFG.enabled) return false;
    var url = new URL(location.href);
    var code = url.searchParams.get("code");
    if (!code) return false;
    var verifier = localStorage.getItem(VERIFIER_KEY);
    if (!verifier) throw new Error("Missing sign-in verifier");
    setStatus("signing_in", "Completing sign-in...");
    saveTokens(await tokenRequest({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: CFG.redirectUri,
      code_verifier: verifier
    }));
    localStorage.removeItem(VERIFIER_KEY);
    history.replaceState({}, document.title, CFG.redirectUri);
    return true;
  }

  function cleanState(data) {
    data = data || {};
    var scenarios = Array.isArray(data.scenarios) ? data.scenarios : [];
    var costSets = Array.isArray(data.costSets) ? data.costSets : [];
    var budgets = Array.isArray(data.budgets) ? data.budgets : [];
    var removedSeeds = Array.isArray(data.removedSeeds) ? data.removedSeeds : [];
    if (scenarios.length === 1 && scenarios[0].id === "test-scenario" &&
      !costSets.length && !budgets.length && !removedSeeds.length) {
      scenarios = [];
    }
    return {
      scenarios: scenarios,
      costSets: costSets,
      budgets: budgets,
      removedSeeds: removedSeeds
    };
  }

  function countLabel(state) {
    state = cleanState(state);
    return state.scenarios.length + " scenario(s), " + state.costSets.length + " cost set(s), " + state.budgets.length + " budget(s)";
  }

  function budgetSummary(b) {
    var out = {};
    Object.keys(b || {}).forEach(function (k) {
      if (k !== "costLineRows" && k !== "costRows" && k !== "quantityRows" && k !== "diagnostics") out[k] = b[k];
    });
    return out;
  }

  function manifestFromState(state) {
    var clean = cleanState(state);
    return {
      scenarios: clean.scenarios,
      costSets: clean.costSets,
      budgets: clean.budgets.map(budgetSummary),
      budgetIndex: clean.budgets.map(function (b) {
        return {
          id: b.id,
          name: b.name || "",
          scenarioId: b.scenarioId || "",
          costSetId: b.costSetId || "",
          generatedAt: b.generatedAt || "",
          sourceSig: b.sourceSig || "",
          schemaVersion: b.schemaVersion || ""
        };
      }),
      removedSeeds: clean.removedSeeds
    };
  }

  async function apiJson(path, opts) {
    var res = await fetchWithTimeout(CFG.apiBase + path, Object.assign({
      headers: { authorization: await authHeader() }
    }, opts || {}), opts && opts.timeout ? opts.timeout : 45000);
    if (!res.ok) {
      var detail = "";
      try { detail = await res.text(); } catch (e) {}
      throw new Error("AWS API " + res.status + (detail ? ": " + detail.slice(0, 160) : ""));
    }
    return await res.json();
  }

  async function loadState() {
    if (!CFG.enabled || !(await validTokens())) return null;
    setStatus("loading", "Loading shared data...", { user: userLabel(loadTokens()) });
    try {
      var data = await apiJson("/state");
      var state = cleanState(data);
      var index = Array.isArray(data.budgetIndex) ? data.budgetIndex : [];
      if (index.length) {
        var loaded = [];
        for (var i = 0; i < index.length; i++) {
          setStatus("loading", "Loading shared budget " + (i + 1) + " of " + index.length + "...", { user: userLabel(loadTokens()) });
          var detail = await apiJson("/state?part=budget&id=" + encodeURIComponent(index[i].id));
          if (detail && detail.budget) loaded.push(detail.budget);
        }
        state.budgets = loaded;
      }
      lastRemoteBudgetCount = state.budgets.length;
      setStatus("signed_in", data.remote && data.remote.empty ? "Shared store is empty" : "Shared data loaded: " + countLabel(state), { user: userLabel(loadTokens()) });
      return state;
    } catch (e) {
      setStatus("error", "Shared load failed: " + (e && e.message ? e.message : "network error"), { user: userLabel(loadTokens()) });
      throw e;
    }
  }

  async function saveState(state) {
    if (!CFG.enabled || !(await validTokens())) return null;
    var clean = cleanState(state);
    if (!clean.budgets.length && lastRemoteBudgetCount > 0) {
      setStatus("error", "Shared save skipped: would remove " + lastRemoteBudgetCount + " shared budget(s)", { user: userLabel(loadTokens()) });
      return null;
    }
    var manifest = manifestFromState(clean);
    var body = JSON.stringify(manifest);
    var size = byteLength(body);
    setStatus("saving", "Saving shared manifest (" + fmtBytes(size) + ")...", { user: userLabel(loadTokens()) });
    try {
      var res = await fetchWithTimeout(CFG.apiBase + "/state?part=manifest", {
        method: "PUT",
        headers: { "content-type": "application/json", authorization: await authHeader() },
        body: body
      }, 60000);
      if (!res.ok) {
        var detail = "";
        try { detail = await res.text(); } catch (e) {}
        throw new Error("Could not save shared state (" + res.status + ")" + (detail ? ": " + detail.slice(0, 160) : ""));
      }
      var out = await res.json();
      for (var i = 0; i < clean.budgets.length; i++) {
        var budgetBody = JSON.stringify(clean.budgets[i]);
        var parts = chunksOf(budgetBody, 450000);
        for (var j = 0; j < parts.length; j++) {
          setStatus("saving", "Saving shared budget " + (i + 1) + " of " + clean.budgets.length + ", chunk " + (j + 1) + " of " + parts.length + " (" + fmtBytes(byteLength(parts[j])) + ")...", { user: userLabel(loadTokens()) });
          var bres = await fetchWithTimeout(CFG.apiBase + "/state?part=budget-chunk&id=" + encodeURIComponent(clean.budgets[i].id) + "&chunk=" + j + "&total=" + parts.length, {
            method: "PUT",
            headers: { "content-type": "text/plain", authorization: await authHeader() },
            body: parts[j]
          }, 60000);
          if (!bres.ok) {
            var bdetail = "";
            try { bdetail = await bres.text(); } catch (e) {}
            throw new Error("Could not save shared budget " + clean.budgets[i].id + " chunk " + (j + 1) + " (" + bres.status + ")" + (bdetail ? ": " + bdetail.slice(0, 160) : ""));
          }
        }
      }
      lastRemoteBudgetCount = clean.budgets.length;
      setStatus("saved", "Shared data saved: " + countLabel(clean), { user: userLabel(loadTokens()), savedAt: out.savedAt });
      return out;
    } catch (e) {
      var msg = e && e.name === "AbortError" ? "Shared save timed out" : "Shared save failed";
      setStatus("error", msg + ": " + (e && e.message ? e.message : "network error"), { user: userLabel(loadTokens()) });
      throw e;
    }
  }

  function signOut() {
    clearTokens();
    setStatus("signed_out", "Signed out");
    location.assign(CFG.cognitoDomain + "/logout?" + new URLSearchParams({
      client_id: CFG.clientId,
      logout_uri: CFG.redirectUri
    }).toString());
  }

  G.cloud = {
    config: CFG,
    onStatusChange: null,
    init: async function () {
      if (!CFG.enabled) { setStatus("disabled", "Local-only mode"); return; }
      try { await handleCallback(); }
      catch (e) { console.error(e); clearTokens(); setStatus("error", "Could not complete sign-in"); }
      var tokens = await validTokens();
      if (tokens) setStatus("signed_in", "Signed in", { user: userLabel(tokens) });
      else setStatus("signed_out", "Shared sync off");
    },
    signIn: signIn,
    signOut: signOut,
    loadState: loadState,
    saveState: saveState,
    isSignedIn: async function () { return !!(await validTokens()); },
    status: function () { return STATUS; }
  };
})(GMB);
