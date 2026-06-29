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

  function emit() {
    if (typeof G.cloud.onStatusChange === "function") G.cloud.onStatusChange(STATUS);
  }

  function setStatus(state, message, extra) {
    STATUS = Object.assign({ state: state, message: message || "" }, extra || {});
    emit();
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
    return {
      scenarios: Array.isArray(data.scenarios) ? data.scenarios : [],
      costSets: Array.isArray(data.costSets) ? data.costSets : [],
      budgets: Array.isArray(data.budgets) ? data.budgets : [],
      removedSeeds: Array.isArray(data.removedSeeds) ? data.removedSeeds : []
    };
  }

  async function loadState() {
    if (!CFG.enabled || !(await validTokens())) return null;
    setStatus("loading", "Loading shared data...", { user: userLabel(loadTokens()) });
    var res = await fetch(CFG.apiBase + "/state", { headers: { authorization: await authHeader() } });
    if (!res.ok) throw new Error("Could not load shared state");
    var data = await res.json();
    setStatus("signed_in", data.remote && data.remote.empty ? "Shared store is empty" : "Shared data loaded", { user: userLabel(loadTokens()) });
    return cleanState(data);
  }

  async function saveState(state) {
    if (!CFG.enabled || !(await validTokens())) return null;
    setStatus("saving", "Saving shared data...", { user: userLabel(loadTokens()) });
    var res = await fetch(CFG.apiBase + "/state", {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: await authHeader() },
      body: JSON.stringify(cleanState(state))
    });
    if (!res.ok) throw new Error("Could not save shared state");
    var out = await res.json();
    setStatus("saved", "Shared data saved", { user: userLabel(loadTokens()), savedAt: out.savedAt });
    return out;
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
