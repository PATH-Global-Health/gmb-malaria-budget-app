/* Browser persistence for scenarios, cost sets, and generated budgets.
   Detailed cost-line budgets can exceed localStorage quota, so IndexedDB is
   the primary store. localStorage remains as a legacy fallback/migration path. */
window.GMB = window.GMB || {};

(function (G) {
  var KEY = "gmb_mbt_v1";
  var DB = "gmb_mbt_state";
  var STORE = "kv";
  var STATE_KEY = "state";
  var SCHEMA = 2;
  var lastStatus = { state: "idle", message: "" };

  function payloadFrom(state) {
    return {
      schemaVersion: SCHEMA,
      savedAt: new Date().toISOString(),
      data: {
        scenarios: state.scenarios,
        costSets: state.costSets,
        budgets: state.budgets,
        removedSeeds: state.removedSeeds
      }
    };
  }

  function localLoad() {
    var raw = localStorage.getItem(KEY);
    if (!raw) return null;
    var obj = JSON.parse(raw);
    return obj.data || null;
  }

  function localSave(payload) {
    localStorage.setItem(KEY, JSON.stringify(payload));
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!("indexedDB" in window)) { reject(new Error("IndexedDB is not available")); return; }
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error("Could not open IndexedDB")); };
    });
  }

  function idbGet() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readonly"), st = tx.objectStore(STORE), req = st.get(STATE_KEY);
        req.onsuccess = function () { db.close(); resolve(req.result || null); };
        req.onerror = function () { db.close(); reject(req.error || new Error("Could not read IndexedDB")); };
      });
    });
  }

  function idbSet(payload) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readwrite"), st = tx.objectStore(STORE);
        st.put(payload, STATE_KEY);
        tx.oncomplete = function () { db.close(); resolve(payload); };
        tx.onerror = function () { db.close(); reject(tx.error || new Error("Could not save IndexedDB")); };
        tx.onabort = function () { db.close(); reject(tx.error || new Error("IndexedDB save aborted")); };
      });
    });
  }

  function isEmpty(data) {
    data = data || {};
    return !(data.scenarios || []).length && !(data.costSets || []).length &&
      !(data.budgets || []).length && !(data.removedSeeds || []).length;
  }

  var persistence = {
    load: function () {
      return idbGet().then(function (payload) {
        var localData = payload && payload.data ? payload.data : null;
        var legacy = localLoad();
        if (!localData && legacy) {
          localData = legacy;
          idbSet({ schemaVersion: SCHEMA, savedAt: new Date().toISOString(), data: legacy }).catch(function () {});
        }
        if (G.cloud && G.cloud.loadState) {
          return G.cloud.loadState().then(function (remoteData) {
            if (remoteData && !isEmpty(remoteData)) {
              idbSet(payloadFrom(remoteData)).catch(function () {});
              return remoteData;
            }
            if (localData && !isEmpty(localData) && G.cloud.saveState) {
              G.cloud.saveState(localData).catch(function (e) { console.warn("Could not migrate local data to shared storage:", e); });
            }
            return localData || remoteData || null;
          }).catch(function (e) {
            console.warn("Could not load shared data; using browser storage:", e);
            if (localData && !isEmpty(localData) && G.cloud.saveState) {
              G.cloud.saveState(localData).catch(function (se) {
                console.warn("Could not repair shared data from browser storage:", se);
              });
            }
            return localData;
          });
        }
        return localData;
      }).catch(function (e) {
        try { return localLoad(); }
        catch (le) { console.warn("Could not load saved data:", e, le); return null; }
      });
    },

    /** Immediate save of the persistable collections. */
    save: function (state) {
      var payload = payloadFrom(state);
      lastStatus = { state: "saving", message: "Saving..." };
      idbSet(payload).then(function () {
        lastStatus = { state: "saved", message: "Saved", savedAt: payload.savedAt };
        if (G.cloud && G.cloud.saveState) {
          G.cloud.saveState(payload.data).catch(function (ce) {
            console.warn("Could not save shared data:", ce);
          });
        }
      }).catch(function (e) {
        try {
          localSave(payload);
          lastStatus = { state: "saved", message: "Saved to fallback storage", savedAt: payload.savedAt };
        } catch (le) {
          lastStatus = { state: "error", message: "Could not save generated budgets. Browser storage is full or unavailable." };
          console.error("Could not save data:", e, le);
        }
      });
    },

    status: function () { return lastStatus; },

    clearAll: function () {
      try { localStorage.removeItem(KEY); } catch (e) {}
      openDb().then(function (db) {
        var tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(STATE_KEY);
        tx.oncomplete = function () { db.close(); };
        tx.onerror = function () { db.close(); };
      }).catch(function () {});
    }
  };

  G.persistence = persistence;
})(GMB);
