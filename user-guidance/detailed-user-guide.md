# The Gambia Malaria Budgeting Tool: User Guide

Live app: https://path-global-health.github.io/gmb-malaria-budget-app/

This guide is for programme users who will view, generate, compare, or export budgets. It does not require GitHub or AWS access.

## Current Scope Of The Tool

The tool supports SNT-based budgeting for seven intervention areas:

- Mass ITN campaign
- Routine / continuous ITN
- Indoor residual spraying
- Seasonal malaria chemoprevention
- IPT for school-age children
- Malaria vaccine
- IPTp in pregnancy

The current version does not support:

- case management
- other malaria interventions
- programme or activity cost categories that are not represented in the uploaded/default unit cost file
- real-time expenditure tracking
- real-time co-editing

## Signing In

Open the app link and sign in with your email address.

Temporary password: `!malariatempPW26`

The first time you sign in, you should be asked to set your own password.

## Shared Saving And Collaboration

The hosted app shares saved scenarios, cost sets, and generated budgets across authorised users.

The top-right corner shows the shared saving status:

- `Shared data loaded` means the browser has loaded the shared workspace.
- `Shared data saved` means your latest saved work has reached shared storage.
- `Shared save skipped` means the app prevented this browser from overwriting shared budgets.

Wait for `Shared data saved` before closing the browser.

The app is not live co-editing like Google Docs. If two people edit the same scenario or cost set at the same time, the last saved version may replace the other person's changes. Agree who is editing before making changes.

Use `Sync now` only if asked during troubleshooting, or if you are sure that the browser you are using contains the budget library that should be preserved.

## Workflow Tabs

### 1. Scenario Specification

Use this tab to define the malaria plan.

You can:

- choose plan years
- review or adjust risk strata
- select which interventions are included
- set coverage, target populations, commodity choices, rounds, cycles, buffers, and exclusions
- save a scenario for later budgeting

Save the scenario before generating a budget.

### 2. Cost Specification

Use this tab to review or edit unit costs.

You can:

- select an existing cost set
- create a new cost set
- update unit prices
- add or remove cost lines
- set the USD to GMD exchange rate
- save the cost set

The budget engine matches costs to scenario choices. For typed commodities, such as IRS product type or age-specific SMC/IPTsc packs, the cost type must match the scenario type exactly. Blank type rows are treated as shared add-on costs for that intervention.

### 3. Budget Generation

Use this tab to combine one scenario and one cost set.

You can:

- generate a budget immediately
- queue several scenario and cost-set combinations
- regenerate a budget if the scenario or cost set has changed
- open saved budgets from the Budget library

Review any pre-generation warnings before using a budget. Warnings do not usually block generation, but they tell you when one part of the budget may not be fully costed.

### 4. Budget Visualisation

Use this tab to explore one generated budget.

You can:

- view total budget
- review costs by year, intervention, category, and geography
- inspect top cost elements
- use filters to focus on specific years, interventions, cost categories, or geographies
- export Excel for detailed checking

If a budget is marked out of date, return to Budget generation and regenerate it.

### 5. Budget Comparison

Use this tab to compare two or more generated budgets.

You can:

- choose a baseline budget
- compare totals and differences
- review what drives differences between budgets
- export a comparison workbook

Comparison is only as current as the selected budgets. If a selected budget is out of date, regenerate it before relying on the comparison.

## Excel Exports

Excel exports are designed for checking and sharing results outside the app.

Useful sheets include:

- Summary sheets: high-level totals by year, intervention, category, or geography.
- Quantities: target populations, coverage-adjusted populations, commodity quantities, and quantity basis.
- Cost detail: line-by-line cost calculations.
- Diagnostics: warnings and notes saved with the budget.
- Assumptions snapshot: scenario settings used to generate the budget.
- Cost set audit: which cost rows were used, matched, unused, or skipped.

For cross-checking, start with the Cost detail sheet. Each row shows the quantity used for cost, the unit cost, and the calculated line cost.

## What To Do If...

### You Cannot Sign In

Check that your username is your email address and that the temporary password was entered exactly.

If you already reset your password, use your new password.

Contact [login support contact] if you are still blocked.

### You Do Not See A Budget Someone Else Generated

Refresh the app and wait for `Shared data loaded`.

If the budget still does not appear, ask the person who generated it to confirm that their browser showed `Shared data saved`.

### A Budget Is Out Of Date

This means the source scenario or cost set changed after the budget was generated.

Go to Budget generation and regenerate the budget.

### You See Pre-generation Warnings

Read the warning text before using the budget.

Common warnings include:

- an intervention is switched on but has no matching cost rows
- a selected product or drug type does not have an exact matching procurement cost
- an intervention is costed only with shared add-on costs
- a cost row has a missing price or unsupported unit

Warnings help identify where assumptions or unit costs may need review.

### Shared Saving Shows An Error

Do not keep making changes in multiple browsers.

Take a screenshot of the message and contact [support contact].

### You Are Unsure Whether To Click Sync Now

Do not click it unless asked during troubleshooting, or unless you know the current browser has the budget library that should be preserved.

## Support

Login and access issues: [login support contact]

Methods, assumptions, or interpretation questions: [methods contact]
