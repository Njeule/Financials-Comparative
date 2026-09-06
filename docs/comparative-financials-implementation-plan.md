# Comparative Financial Statements Implementation Plan

## Objective

Upgrade the dashboard so it can compare current-period financial performance against prior periods and prior years, and add a cash flow style statement alongside the income statement and balance sheet.

The target result is a financial reporting app that can answer:

- How does the current year compare with the previous year?
- How does the current month compare with the previous month?
- How does the current month compare with each of the two immediately preceding months?
- What changed across income statement, balance sheet, and cash movement views?

## Feasibility

This is doable within the current static, dependency-free architecture.

The app already parses ledger CSVs, enriches rows with chart-of-account metadata, calculates financial metrics, and renders multiple report views. The main changes are:

- Expand the date model from single-period reporting to comparative period reporting.
- Add prior-year and prior-month aggregations.
- Add a cash flow or cash movement statement derived from GL activity.
- Expand the test CSV generator to produce at least two years of ledger data.
- Update UI controls so the user can choose a reporting period and comparison basis.

## Important Accounting Constraint

A formal cash flow statement normally needs opening balances, cash-flow classifications, and sometimes non-cash adjustment logic.

With the current CSV structure, the safest first version should be called a Cash Flow / Cash Movement Statement unless the source data is extended. It can still provide useful CFO reporting by showing:

- Opening cash balance.
- Cash inflows from revenue/customer receipts.
- Cash outflows from operating expenses, payroll, suppliers, tax, and finance costs.
- Investing cash flows where accounts identify capital expenditure or capitalized development.
- Financing cash flows where accounts identify loans, equity, or distributions.
- Closing cash balance.
- Reconciliation to cash-tagged balance sheet accounts.

If the client needs a statutory cash flow statement, add a new classification field to the chart of accounts.

## Recommended Data Model Changes

### Chart Of Accounts CSV

Keep existing columns:

- `AccountKey`
- `AccountNumber`
- `AccountName`
- `Category_L1`
- `Subcategory_L2`
- `DetailGroup_L3`
- `Region`
- `Department`

Add optional columns:

- `CashFlowSection`: `Operating`, `Investing`, `Financing`, `Cash`, `NonCash`, or blank.
- `CashFlowLine`: display line such as `Customer receipts`, `Supplier payments`, `Payroll`, `Capital expenditure`, `Loan proceeds`.
- `NormalBalance`: `Debit` or `Credit`, useful for validation and future statement logic.

The app should remain backward compatible. If the new columns are missing, it should infer cash flow sections from existing categories and account names.

### Transactions CSV

Keep existing columns:

- `TransactionID`
- `Date`
- `AccountNumber`
- `Description`
- `Amount`
- `Type`

No required transaction schema change is needed for the comparative work.

For stronger cash flow accuracy later, optional fields could be added:

- `CashFlowOverride`
- `Counterparty`
- `DocumentType`
- `InvoiceDate`
- `PaymentDate`

These should not be required for this phase.

## Test Data Changes

Update `scripts/generate-test-csvs.js` to generate at least 24 months of data, preferably 36 months.

Recommended coverage:

- January 2025 through December 2026 as the minimum.
- Add revenue growth, margin changes, seasonality, and realistic expense inflation.
- Include opening balance entries at the start of each year or one opening balance at the start of the data set.
- Include capex, loan interest, tax accruals/payments, working capital movements, and payroll.
- Ensure every journal entry remains balanced.

Generated files:

- `Test_ChartOfAccounts.csv`
- `Test_Transactions.csv`

The richer dataset should allow:

- Current year vs previous year comparison.
- Month vs previous month comparison.
- Month vs previous month and second previous month comparison.
- Year-to-date vs prior-year-to-date comparison.
- Cash movement statement testing.

## Reporting Period Design

Add period selection state:

- `selectedPeriodType`: `month`, `quarter`, `year`, `ytd`.
- `selectedPeriod`: for example `2026-08`, `2026-Q3`, or `2026`.
- `comparisonMode`: `prior-year`, `prior-month`, `two-prior-months`, `prior-ytd`.

Add period helper functions:

- `periodKey(date, periodType)`
- `rowsForPeriod(rows, periodType, periodKey)`
- `priorYearPeriod(periodKey)`
- `priorMonthPeriod(periodKey)`
- `secondPriorMonthPeriod(periodKey)`
- `samePeriodPriorYear(periodKey)`
- `yearToDateRows(rows, year, throughMonth)`

## Financial Calculation Changes

Create a reusable comparative calculation layer:

- `statementMetrics(rows)`
- `periodMetrics(allRows, period)`
- `comparativeMetrics(allRows, currentPeriod, comparisonMode)`
- `varianceAmount(current, comparison)`
- `variancePercent(current, comparison)`
- `varianceLabel(current, comparison)`

Each statement line should support:

- Current amount.
- Prior-year amount.
- Prior-month amount where applicable.
- Second prior-month amount where applicable.
- Variance amount.
- Variance percentage.
- Direction indicator.

Variance display should account for good/bad finance semantics:

- Revenue increase is favorable.
- Expense increase is unfavorable.
- Profit increase is favorable.
- Liability increase may be neutral or contextual.
- Cash increase is generally favorable.

## Income Statement Changes

Update the Income Statement view to show columns:

- Line item.
- Current period.
- Previous year comparable period.
- Previous month.
- Second previous month.
- Variance vs previous year.
- Variance vs previous month.
- Common-size `% revenue`.

For annual or YTD mode, previous month and last two months should be hidden or clearly marked as not applicable.

Required drilldowns:

- Current amount.
- Prior-year amount.
- Prior-month amount.
- Second previous-month amount.
- Variance amount.

Clicking a comparative figure should show the ledger rows behind that specific period and line.

## Balance Sheet Changes

Update the Balance Sheet view to support prior-year comparison.

Columns:

- Line item.
- Current balance.
- Previous year balance.
- Variance.
- Variance percentage.
- `% assets`.

Balance sheet comparison should use point-in-time or cumulative balance logic. Since the current app sums rows within the selected filters, this phase must decide between:

- Movement basis: current selected-period movements only.
- Balance basis: cumulative ledger balance through the selected period end.

Recommendation:

- Use cumulative balance basis for the Balance Sheet.
- Keep movement basis for Income Statement and Cash Flow.

Add a visible note where source data lacks opening balances.

## Cash Flow / Cash Movement Statement

Add a new tab:

- `Cash Flow`

Initial statement sections:

- Opening cash balance.
- Operating cash movement.
- Investing cash movement.
- Financing cash movement.
- Net cash movement.
- Closing cash balance.
- Cash reconciliation check.

Suggested lines:

- Customer receipts.
- Supplier and operating payments.
- Payroll payments.
- Tax payments.
- Interest paid or received.
- Capital expenditure.
- Capitalized development.
- Loan proceeds and repayments.
- Equity proceeds.

Columns:

- Current period.
- Previous year comparable period.
- Previous month.
- Second previous month.
- Variance vs previous year.
- Variance vs previous month.

If `CashFlowSection` and `CashFlowLine` are missing from the chart of accounts, infer them using account category, subcategory, detail group, and account name. Inferred rows should display a small caveat in the narrative.

## Overview Changes

Update the Overview page to include comparative cards:

- Revenue vs prior year.
- Gross profit vs prior year.
- Operating result vs prior year.
- Cash movement vs prior year.
- Revenue vs previous month.
- Operating result vs previous month.

Update the performance trend chart to cover multiple years:

- Show current year and prior year monthly series.
- Add toggle for revenue, gross profit, EBIT, cash movement.

## Filter And Control Changes

Add controls for:

- Reporting year.
- Reporting month.
- Period type.
- Comparison mode.

Keep existing filters:

- Month.
- Category.
- Department.
- Region.
- Search.

Recommended UX:

- Primary period controls should sit before category/department/region filters.
- Existing filters should refine the selected reporting period, not replace period selection.
- Add a clear label showing the active comparison basis.

## Export Changes

Add exports:

- Current filtered ledger.
- Current statement drilldown.
- Comparative income statement CSV.
- Comparative balance sheet CSV.
- Comparative cash flow CSV.

Each exported comparative statement should include:

- Statement name.
- Current period.
- Comparison period.
- Generated timestamp.
- Active filters.

## Implementation Phases

### Phase 1: Data And Period Foundation

- Expand test data generation to two or more years.
- Add optional cash flow columns to test chart of accounts.
- Add period helper functions.
- Add current, prior-year, previous-month, and second-previous-month row selectors.
- Add comparative metric helpers.

Acceptance criteria:

- App can identify current month, previous month, previous two months, prior-year month, current year, and prior year.
- Test data supports at least two full financial years.
- Existing reports still work with old CSVs.

### Phase 2: Comparative Income Statement

- Replace current income statement table with comparative columns.
- Add variance amount and variance percentage.
- Add previous month and second previous month columns for monthly mode.
- Update drilldown to understand selected period and selected comparison column.

Acceptance criteria:

- Income statement shows current year/current month vs prior periods.
- Variances reconcile to ledger rows.
- Common-size percentages still calculate correctly.

### Phase 3: Balance Sheet Comparison

- Add cumulative balance calculation through period end.
- Show prior-year balance sheet comparison.
- Add variance columns.
- Add source-data caveat where opening balances are incomplete.

Acceptance criteria:

- Balance sheet uses cumulative balances, not only selected-period movement.
- Current and previous-year balances reconcile to ledger totals through each period end.

### Phase 4: Cash Flow / Cash Movement Statement

- Add cash flow tab.
- Add cash flow line classification.
- Add current, prior-year, previous-month, and second-previous-month comparative columns.
- Add reconciliation to cash-tagged accounts.

Acceptance criteria:

- Cash flow view shows operating, investing, and financing movement.
- Net movement plus opening cash equals closing cash.
- Closing cash ties to cash accounts in the balance sheet.

### Phase 5: Overview And Narrative Updates

- Add comparative KPI cards.
- Update trend chart for current year vs prior year.
- Update CFO narratives to mention material variances.
- Update CFO exceptions to include comparative triggers.

Acceptance criteria:

- Overview immediately communicates whether performance improved or deteriorated.
- Narrative changes with selected period and comparison mode.

### Phase 6: QA And Browser Review

- Run syntax checks.
- Run the local server.
- Test uploads with old and new CSV schemas.
- Test all tabs at desktop and mobile sizes.
- Verify exports.
- Verify drilldowns and reconciliation totals.

Acceptance criteria:

- No regressions in current CSV upload flow.
- No layout overlap in comparative tables.
- All statement totals reconcile to supporting ledger rows.

## Risks And Decisions

Key decisions before implementation:

- Whether the Balance Sheet should show cumulative balances or period movement. Recommendation: cumulative balances.
- Whether to call the new statement `Cash Flow Statement` or `Cash Movement Statement`. Recommendation: start with `Cash Flow` in the UI, with caveats where classification is inferred.
- Whether prior-year comparison should mean same month last year, full previous year, or prior-year-to-date. Recommendation: support all via period controls, default to same period prior year.

Known risks:

- Without opening balances, balance sheet and opening cash may be incomplete.
- Without explicit cash flow classifications, some cash flow lines must be inferred.
- Comparative tables will be wider, so responsive design must be handled carefully.

## Suggested Build Order

1. Update test data generator for 2025 and 2026.
2. Add optional cash flow classification fields to generated chart of accounts.
3. Add period helper and comparative metric functions.
4. Convert Income Statement to comparative columns.
5. Convert Balance Sheet to cumulative comparative columns.
6. Add Cash Flow tab and statement builder.
7. Add comparative overview cards and trend charts.
8. Update exports.
9. Run browser and reconciliation QA.
