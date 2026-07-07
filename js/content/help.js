/* All user-facing guidance copy in one place (no logic) â€” rendered by the
   Overview tab, the Methods tab, and the per-page "How to use this page" strips.
   Written for a non-expert program manager; kept in step with what the engine does. */
window.GMB = window.GMB || {};

GMB.content = {

  // Overview "How to use this tool" â€” five workflow steps (Methods is a reference, not a step).
  guide: [
    { tab: "scenario", title: "1. Set up your plan", lead: "Define which interventions to deliver to which Strata and set budgeting assumptions.",
      points: ["Start from an existing scenario (e.g. NSP) and adjust it, or create a new scenario.",
        "Define malaria incidence risk strata and which interventions are targeted to each strata.",
        "Intervention budgeting assumptions (target populations, coverage, number of rounds, buffer & wastage etc) are set to default values, each can be updated by the user either at a National, Regional, District or Strata level and over years.",
        "Save the scenario."] },
    { tab: "costs", title: "2. Unit Cost Data", lead: "Define and update Unit Cost values.",
      points: ["Prices are shown in US dollars and exchange rate to Gambian dalasi can be set and updated.",
        "Define and update current unit cost values or create and store varying unit cost assumption sets (e.g. lower and upper cost ranges, sensitivity analysis to global fuel costs).",
        "Save cost data."] },
    { tab: "generate", title: "3. Generate the budget", lead: "Combine a scenario with a cost set to produce a budgeted scenario.",
      points: ["Pick a scenario and a cost set, then press Generate - budgets are automatically calculated and saved to the tool.",
        "Queue several combinations to generate multiple budgets at once.",
        "Budgets appear in the library, ready to explore or compare.",
        "On the hosted app, wait for the header to show Shared data saved before closing the browser."] },
    { tab: "viz", title: "4. Budget visualisation", lead: "Visualisations and tables assess cost implications, funding gaps, and cost drivers.",
      points: ["Use the filters on the left to focus on certain years, interventions or geographies.",
        "Switch an intervention off to instantly see how much the budget would drop.",
        "Download any chart, map or table."] },
    { tab: "compare", title: "5. Budget Comparison", lead: "Place multiple budgets side by side to assess cost implications, funding gaps, and the financial effect of different choices.",
      points: [
        "Compare budgets against an available-budget envelope.",
        "Switch the breakdown between intervention, cost category, year and Geography."] }
  ],

  // Short "Good to know" notes on the Overview.


  // Per-page help (collapsible "How to use this page" strip at the top of each working tab).
  pages: {
    scenario: { intro: "Define malaria interventions.",
      steps: ["Work from an existing scenario or choose to create a new plan.",
        "Define the plan years and the population growth rate.",
        "Set a plan name and description.",
        "Define malaria risk stratification for this plan. Select a singular or multiple years of incidence data. Define incidence thresholds for each strata - add or delete strata as required. The tool automatically displays a summary of districts in each strata, the population total per strata and a district level map of strata.",
        "For each intervention, choose which risk strata to target. Set intervention assumptions and exclusions in the intervention specification step.",
        "Set key intervention deployement and budgeting assumptions - target populations, coverage, commodity type etc. All assumptions can be set universally for all districts and years or can vary by geography and/or year.",
        "Watch the Summary panel for warnings, and tracked unsaved changes and either save or discard any changes."],
      tips: ["Hover the â“˜ icons addiditional information.", "All changes are unsaved until you press Save; use Discard to undo unsaved changes."] },

    costs: { intro: "Define unit costs assumptions.",
      steps: ["Edit and existing set of unit costs or create a new set of costs.",
              "Set a cost set name and description",
              "Set an exchange rate from USD to GMD to ensure budgets are generated in both currencies",
        "Open an intervention panel to see cost lines grouped by category.",
        "Edit a unit price in USD â€” the dalasi value updates automatically.",
              "Add or remove cost lines as required",
             "Check the summary panel for tracked unsaved changes", 
        "Press Save to keep your changes."],
      tips: ["Add or remove cost lines with the + and Ã— controls."] },

    generate: { intro: "Combine scenario and cost information to create a complete budget.",
      steps: ["Choose a scenario and a cost set.",
        "Give the budget a name and description, then press Generate now â€” it saves to the library automatically.",
        "Or add several scenario Ã— cost-set combinations to the queue and generate them together.",
        "From the library, open a budget to visualise it, or tick budgets and press Compare."],
      tips: ["If a budget already exists for that combination you'll be offered Regenerate instead of a duplicate.", "'Out of date' means the scenario or cost set changed after the budget was generated â€” regenerate to refresh it.", "The hosted app shares saved work, but it is not live co-editing. Avoid two people editing the same scenario or cost set at the same time.", "Use Sync now only from a browser that has the budget library you want to preserve."] },

    viz: { intro: "Explore one budget in depth.",
      steps: ["Pick a budget at the top of the filter panel on the left.",
        "Explore the data through interactive tables and charts",
        "Use the filters to focus on certain years, interventions, cost categories or geographies, and switch currency between USD and Dalasi.",
        "Download any figure as an image (PNG) or any table as a spreadsheet (CSV)."],
      tips: ["Deselect an intervention to see the budget without it â€” the total drops by exactly its cost.", "Enter a budget envelope to compare required budget for a plan to an avaliable envelope."] },

    compare: { intro: "Compare two or more budgets.",
      steps: ["Choose a baseline budget, then tick the budgets to compare against it.",
        "Read the scoreboard: each budget's total, its difference from the baseline, and its cost per person.",
        "Use 'Where the money goes' to see what drives the differences â€” switch the breakdown dimension and the $ / % view.",
        "Enter an available budget to flag which options are over or under."],
      tips: ["Budgets sent here with 'Compare selected' on the generation tab arrive pre-selected.", "Download the comparison table (CSV) or any chart (PNG)."] }
  },

  // Methods â€” side-panel layout: an overview, a section per intervention, then cross-cutting sections.
  methods: {
    overview: {
      lead: "This tool turns a plan â€” which interventions to deliver, where, and at what coverage â€” into a fully costed, multi-year malaria budget. It works in two steps: first it estimates the quantity of each commodity needed in every district and year, then it applies unit costs.",
      blocks: [
        { callout: { type: "info", title: "Two steps", items: ["Quantification â€” how much commodity is needed.", "Costing â€” what that commodity costs to procure, distribute etc."] } },
        { p: "Six SNT-based intervention areas are currently supported for new Gambia budgeting work. Choose one on the left to see exactly how it is quantified, the default assumptions, and any important notes. The cross-cutting sections cover costing, all the assumptions, the data behind the tool, and the tools limitations." },
        { callout: { type: "info", title: "Current scope of the tool", items: ["Mass ITN campaign.", "Routine / continuous ITN.", "Indoor residual spraying.", "Seasonal malaria chemoprevention.", "IPT for school-age children.", "Malaria vaccine.", ] } },
        { callout: { type: "limit", title: "Not modelled in this version", items: ["Case management.", "Other malaria interventions not listed above.", "Programme or activity cost areas that are not represented in the uploaded/default unit cost file.", "Funder-by-funder budget breakdowns.", "Activity-level micro-planning detail."] } }
      ]
    },
    interventions: [
      { code: "mii", name: "Mass ITN campaign", target: "Whole population",
        quant: "Nets needed = Population x Coverage / Effective People-Per-Net x (1 + Buffer)",
        plain: "Programme users select a People Per Net Cap. Cap 2 feeds an internal effective value of 1.8 people per net into the formula; cap 3 feeds 2.7 people per net into the formula.",
        assumptions: ["Coverage: 100% (universal)", "People Per Net Cap: 2 by default, using effective 1.8 people/net", "Buffer: 7%", "Campaign year: 2028 in the default plans (typically every ~3 years)"],
        notes: ["Regional 'maximum nets per household' caps reduce the nets needed by the agreed pre-specified levels from the SNT workflow.", "Explicit district exclusions remove a district from targeting and therefore from quantification and costing.", "'Deprioritise urban' is a partial quantity reduction, not a full targeting exclusion.", "Net usage is a transmission assumption; it does not change the number of nets ordered."] },
      { code: "mii_routine", name: "Routine / continuous ITN", target: "ANC & infant contacts",
        quant: "Nets needed  =  Routine-Eligible Population Ã— Coverage Ã— (1 + Buffer)",
        plain: "Nets distributed through antenatal care and infant immunisation visits between campaigns.",
        assumptions: ["Routine-eligible population: ~8.2% of the population", "Coverage: 80%", "Buffer: 7%"],
        notes: ["Can stop for several months after a mass campaign (cease after campaign). The pause duration is converted into an annual percentage reduction in routine nets for campaign years using: pause months / (Mass ITN campaign interval years x 12). For example, a 6-month pause with a 3-year campaign interval gives 6/36 = 16.7%."] },
      { code: "irs", name: "Indoor residual spraying (IRS)", target: "Households in sprayed areas",
        quant: "Structures to be sprayed =  Households Ã— Coverage Ã— (1 + Buffer)",
        plain: "Spraying targets households; the number of households comes from the population and the average household size in each region.",
        assumptions: ["Households = Population Ã· Regional Household Size (5.3â€“12.6 people depending on region)", "Coverage: 85% of households", "Buffer: 7%", "Scenario product options: Actellic, SumiShield, and Fludora Fusion"],
        notes: ["A 'reactive' option sprays only hotspot areas at a lower, partial coverage to be defined in scenario set up.", "IRS insecticide procurement costs match the selected product type exactly. Blank-type IRS rows are treated as shared logistics, operations, support, or monitoring add-ons and apply to all IRS products."] },
      { code: "smc", name: "Seasonal malaria chemoprevention (SMC)", target: "Children 3â€“59 months",
        quant: "SPAQ Packs = Age-Band Eligible Children Ã— Coverage Ã— Cycles Ã— (1 + Buffer)",
        assumptions: ["Eligible children: ~14.5% of the population, split into 3% 3-11 months and 11.5% 12-59 months", "SMC commodities are quantified separately as SP+AQ 3-11m and SP+AQ 12-59m packs", "Coverage: 100% (universal)", "Cycles: 4 (3 in the most-constrained plan)", "Buffer: 7%"],
        notes: ["Per-pack and per-dose costs use the cycle-adjusted pack quantity.", "Per-child costs use the coverage-adjusted eligible children and are not multiplied again by cycles."] },
      { code: "iptsc", name: "IPT for school-age children", target: "School-age children (5â€“15 years)",
        quant: "DHA-PPQ Packs = Age-Band Eligible Children Ã— Coverage Ã— Cycles Ã— (1 + Buffer)",
        plain: "Intermittent preventive treatment delivered to school-age children.",
        assumptions: ["Eligible children: ~25% of the population, split into 16% 5-11 years and 9% 12-15 years", "IPTsc commodities are quantified separately as younger 5-11y and older 12-15y packs for the selected drug", "Coverage: 75%", "Cycles: 3", "Default drug: DHA-PPQ", "Buffer: 7%"],
        notes: ["DHA-PPQ procurement rows match the age-pack rows separately, so younger and older pack prices are not applied to the full school-age quantity.", "SP-AQ and SP remain selectable, but drug procurement will warn as missing unless matching typed cost rows are added."] },
      { code: "vax", name: "Malaria vaccine", target: "Eligible infant cohort",
        quant: "Vaccine Doses  =  Infant Cohort Ã— (Sum of Dose Coverages) Ã— (1 + Buffer)",
        plain: "The full dose schedule delivered to the eligible infant age group.",
        assumptions: ["Infant cohort: ~3.5% of the population", "Dose coverages: 90% / 90% / 90% / 85%", "Default product: R21", "Buffer: 7%"],
        notes: ["Targeted to higher-burden districts in most of the default plans."] }],
    sections: {
      costing: { title: "How costs are applied",
        lead: "The engine costs each matched cost line separately, then rolls those line items up to cost category and intervention summaries.",
        blocks: [{ formula: "Line Item Cost:  Quantity Used For Cost Ã— Unit Price" }, { formula: "Commodity Quantity:  Target Population Ã— Coverage Ã— Rounds or Doses Ã— (1 + Buffer)" }, { formula: "Fixed Line (per year / one-off):  Applicable Occurrences Ã— Unit Price" },
          { callout: { type: "info", title: "Currencies", text: "Costs are shown in US dollars and converted to Gambian dalasi at 72.39 GMD per USD. You can change the rate on each cost set." } },
          { callout: { type: "info", title: "Matching typed commodities", items: ["Typed product rows must match the scenario commodity/type exactly, for example IRS Actellic only uses Actellic insecticide procurement rows.", "Blank-type rows are shared add-on costs for that intervention, such as logistics, supervision, operations, support, or monitoring.", "Rows with a type that does not match the scenario are excluded and reported through diagnostics where relevant."] } },
          { callout: { type: "note", title: "Warnings before generation", items: ["The Budget generation tab checks the selected scenario and cost set before saving a budget.", "Missing typed procurement, shared-add-on-only costing, unsupported units, skipped rows, and zero-quantity interventions are reported as warnings rather than blocking generation.", "Warnings are also saved with generated budgets so the issue is visible in the library and Visualisation tab."] } },
          { callout: { type: "note", title: "Quantity used for cost", items: ["Per net, per structure, per dose, per pack, and per treatment course use the quantified commodity amount.", "Per child and per person use the coverage-adjusted target population, so they do not over-count multi-cycle interventions.", "Per year applies once for each active intervention year; one-off applies once for the whole budget."] } },
          { p: "The detailed Cost lines table and Excel Cost detail sheet keep every matched line item, including its description, source, unit, quantity used for cost, unit price, and line total. Summary charts and tables are aggregated from these line items into procurement, distribution, operational, support, and monitoring & evaluation categories." }] },
      assumptions: { title: "Key assumptions",
        lead: "Defaults come from The Gambia's subnational tailoring work and a standard unit-cost workbook. You can change most of them per scenario.",
        blocks: [{ table: { headers: ["Assumption", "Default"], rows: [
          ["Population growth (projecting beyond 2025)", "2.3% per year"],
          ["Buffer / wastage on commodity quantities", "7%"],
          ["Exchange rate", "72.39 GMD per USD"],
          ["Under-5 share of population", "16%"],
          ["SMC-eligible (3â€“59 months)", "~14.5%"],
          ["School-age share", "~25%"],
          ["Infant vaccine cohort", "~3.5%"]] } },
          { callout: { type: "note", title: "Risk strata", text: "Districts are grouped by mean malaria incidence â€” 3 groups by default: low (<10), medium (10â€“30) and high (â‰¥30) cases per 1,000. Explore the figures in the Data viewer." } }] },
      data: { title: "Data sources",
        lead: "Addiditional datasets pre-specified in tool build.",
        blocks: [{ ul: ["Population by district, 2017â€“2025; later years are projected using the growth rate.",
          "DHIS2 Malaria incidence (2020â€“2025), used to group districts into risk strata.",
                        "Regional Household population size: from SNT workflow via DHS/MIS survey data.",
          "District boundaries."] },
          { callout: { type: "info", title: "See the data", text: "The Data viewer tab lets you explore the population, projected growth and incidence figures used here." } }] },
      limitations: { title: "Good to know & limitations",
        lead: "A few things to keep in mind when reading a budget.",
        blocks: [{ callout: { type: "limit", title: "Limitations", items: ["Population for future years is projected, not observed.",
          "Line-item costs are shown for verification, but the tool is still a budgeting model rather than a detailed micro-planning workbook.",
          "Cost per person uses the projected population for the selected years.",
          "Case management and funder splits are not modelled."] } }] }
    }
  }
};
