/* Intervention catalog + the five SNT templates for The Gambia (v1: core 6 + IPTp).
   Defaults seeded from the model scripts (01.scenario_set_up.R / 02.prep_*.R).
   `engine` names the quantification function; `defaults` pre-fill the scenario page. */
window.GMB = window.GMB || {};

GMB.catalog = [
  { code: "mii", engine: "itn_campaign_hh", nice: "Mass ITN campaign", commodity: "Nets",
    description: "Mass distribution of insecticide-treated nets to every household.",
    types: ["Dual-AI", "PBO", "Standard Pyrethroid"], varyType: true, typeLabel: "Net type",
    target: { key: "total", mode: "total" },
    defaults: { coverage: 1.0, buffer: 0.07, people_per_net: 1.8 }, preselect: true },

  { code: "mii_routine", engine: "itn_routine", nice: "Routine / continuous ITN", commodity: "Nets",
    description: "Continuous nets via ANC and immunisation (EPI) contacts.",
    types: ["Dual-AI", "PBO", "Standard Pyrethroid"], varyType: true, typeLabel: "Net type",
    target: { key: "routine", mode: "groups", groups: [{ label: "Routine-eligible (ANC + infants)", pct: 8.24 }] },
    defaults: { coverage: 0.80, buffer: 0.07, people_per_net: 1 }, preselect: true },

  { code: "irs", engine: "irs", nice: "Indoor residual spraying (IRS)", commodity: "Structures sprayed",
    description: "Spraying interior walls with insecticide in targeted areas.",
    types: ["Actellic", "SumiShield", "Fludora Fusion"], varyType: true, typeLabel: "Insecticide",
    target: { key: "households", mode: "households" },
    defaults: { coverage: 0.85, buffer: 0.07 }, preselect: false },

  { code: "smc", engine: "smc", nice: "Seasonal malaria chemoprevention (SMC)", commodity: "Treatment courses",
    description: "Monthly preventive antimalarials for young children in the transmission season.",
    types: ["SP-AQ"],
    target: { key: "smc359", mode: "groups", groups: [{ label: "Children 3–11 months", pct: 3.0 }, { label: "Children 12–59 months", pct: 11.5 }] },
    defaults: { coverage: 1.0, buffer: 0.07, cycles: 4 }, preselect: true },

  { code: "iptsc", engine: "ipt_sc", nice: "IPT for school-age children", commodity: "Treatment courses",
    description: "Intermittent preventive treatment for school-age children (5–15 years).",
    types: ["DHA-PPQ", "SP-AQ", "SP"],
    target: { key: "school", mode: "groups", groups: [{ label: "Primary school-age", pct: 16 }, { label: "Secondary school-age", pct: 9 }] },
    defaults: { coverage: 0.75, buffer: 0.07, cycles: 3 }, preselect: false },

  { code: "vax", engine: "vaccine", nice: "Malaria vaccine", commodity: "Doses",
    description: "Vaccination of the eligible infant cohort across the dose schedule.",
    types: ["R21", "RTS,S"],
    target: { key: "infant", mode: "groups", groups: [{ label: "Infant vaccine cohort", pct: 3.5 }] },
    defaults: { buffer: 0.07, dose1: 0.90, dose2: 0.90, dose3: 0.90, dose4: 0.85 }, preselect: false },

  { code: "iptp", engine: "iptp_anc", nice: "IPTp in pregnancy (ANC)", commodity: "Treatment courses (SP)",
    description: "Intermittent preventive treatment for pregnant women at ANC visits.",
    types: ["SP"],
    target: { key: "pw", mode: "groups", groups: [{ label: "Pregnant women", pct: 4.2 }] },
    defaults: { buffer: 0.07, contact1: 0.95, contact2: 0.85, contact3: 0.70, contact4: 0.50 }, preselect: true }
];

GMB.catalogByCode = function (code) {
  return GMB.catalog.filter(function (c) { return c.code === code; })[0] || null;
};

/* ---- District keys used by the templates ---- */
var CBS = ["North Bank West|Lower Niumi", "North Bank West|Upper Niumi", "North Bank West|Jokadu",
  "North Bank East|Upper Badibu", "North Bank East|Central Badibu", "North Bank East|Lower Badibu",
  "North Bank East|Sabach Sanjar"];
var URBAN = ["Western 1|Kanifing", "Western 1|Banjul", "Western 1|Kombo North"];

var EVERY = { mode: "everywhere" };
var III = function (extra) { return Object.assign({ mode: "strata", strata: ["III"] }, extra || {}); };

/* The five SNT scenarios, encoded from the workshop deck + model scripts.
   Each intervention entry: { scope, enabled?, params?{overrides} }. Unlisted = disabled. */
GMB.templates = {
  nsp: { id: "nsp", name: "NSP — National Strategic Plan", averagingYears: [2024],
    description: "Full national strategic plan; high-burden interventions in Strata III (2024 incidence).",
    interventions: { mii: { scope: EVERY }, mii_routine: { scope: EVERY }, smc: { scope: III() },
      iptsc: { scope: III() }, irs: { scope: III() }, vax: { scope: III() }, iptp: { scope: EVERY } } },

  bau: { id: "bau", name: "Business as usual", averagingYears: [2023, 2024, 2025],
    description: "Continue interventions at 2025 levels.",
    interventions: { mii: { scope: EVERY }, mii_routine: { scope: EVERY }, smc: { scope: III() },
      irs: { scope: { mode: "custom", regions: ["Upper River", "Central River"] } }, iptp: { scope: EVERY } } },

  optimistic: { id: "optimistic", name: "Optimistic", averagingYears: [2023, 2024, 2025],
    description: "Increased funding; high-burden interventions in Strata III (2023–2025 mean).",
    interventions: { mii: { scope: EVERY }, mii_routine: { scope: EVERY }, smc: { scope: III() },
      iptsc: { scope: III({ regionFilter: ["Central River", "Upper River"] }) },
      irs: { scope: III() }, vax: { scope: III() }, iptp: { scope: EVERY } } },

  realistic: { id: "realistic", name: "Realistic", averagingYears: [2023, 2024, 2025],
    description: "Reduced funding: 1 net per 3 people, cease routine after campaign, no IRS or IPTsc, vaccine to GAVI-approved districts.",
    interventions: { mii: { scope: EVERY, params: { people_per_net: 3, coverage: 0.71 } },
      mii_routine: { scope: EVERY, levers: { ceaseAfterCampaign: true } },
      smc: { scope: III({ exclude: ["Western 1|Kanifing", "Western 1|Banjul"] }) },
      vax: { scope: { mode: "custom", regions: ["Upper River"], districts: ["Lower River|Jarra East", "Western 2|Kombo South"] } },
      iptp: { scope: EVERY } } },

  pessimistic: { id: "pessimistic", name: "Pessimistic", averagingYears: [2023, 2024, 2025],
    description: "Deepest cuts: deprioritise urban + CBS areas, SMC at 3 cycles, no IRS/IPTsc/vaccine.",
    interventions: { mii: { scope: { mode: "everywhere", exclude: URBAN.concat(CBS) } },
      mii_routine: { scope: EVERY, levers: { ceaseAfterCampaign: true } },
      smc: { scope: III({ exclude: ["Western 1|Kanifing", "Western 1|Banjul"] }), params: { cycles: 3 } },
      iptp: { scope: EVERY } } }
};

/** Resolve an intervention scope to a set of district keys, given a strata assignment. */
GMB.resolveScope = function (scope, assignment) {
  var keys = {}, all = GMB.reference.districtPairs();
  function add(k) { keys[k] = true; }
  if (!scope || scope.mode === "everywhere") {
    all.forEach(function (d) { add(GMB.strata.key(d.adm1, d.adm2)); });
  } else if (scope.mode === "strata") {
    var inb = GMB.strata.districtsInBands(assignment, scope.strata || []);
    Object.keys(inb).forEach(add);
    if (scope.regionFilter) {
      Object.keys(keys).forEach(function (k) {
        if (scope.regionFilter.indexOf(k.split("|")[0]) === -1) delete keys[k];
      });
    }
  } else if (scope.mode === "custom") {
    (scope.regions || []).forEach(function (r) {
      all.forEach(function (d) { if (d.adm1 === r) add(GMB.strata.key(d.adm1, d.adm2)); });
    });
    (scope.districts || []).forEach(add);
  }
  (scope && scope.exclude || []).forEach(function (k) { delete keys[k]; });
  return keys;
};
