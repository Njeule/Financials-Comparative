const app = document.querySelector("#app");

const COLORS = {
  revenue: "#0f8b8d",
  profit: "#1f6feb",
  expense: "#d97706",
  loss: "#c2410c",
  asset: "#4f46e5",
  liability: "#be185d",
  equity: "#15803d",
  cash: "#0e7490",
  neutral: "#475569",
  ink: "#172033"
};

const COLOR_BY_NAME = {
  Assets: COLORS.asset,
  Expenses: COLORS.expense,
  Revenue: COLORS.revenue,
  Equity: COLORS.equity,
  Liabilities: COLORS.liability,
  "Operating Result": COLORS.loss,
  "Gross Profit": COLORS.profit,
  Opex: COLORS.expense,
  COGS: COLORS.expense,
  Cash: COLORS.cash,
  "Current Assets": COLORS.asset,
  "Current Liabilities": COLORS.liability,
  "Shareholders Equity": COLORS.equity,
  "Cost of Goods Sold": COLORS.expense,
  "Operating Expenses": COLORS.expense,
  "Corporate/HQ": COLORS.neutral,
  Sales: COLORS.revenue,
  "Finance & Legal": COLORS.asset,
  Global: COLORS.neutral,
  Segmented: COLORS.revenue,
  "United States": COLORS.asset
};

const FALLBACK_COLORS = ["#0f8b8d", "#4f46e5", "#d97706", "#be185d", "#15803d", "#475569", "#7c3aed"];

function semanticColor(name, index = 0) {
  return COLOR_BY_NAME[name] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function resetViewState() {
  state.filters = { months: [], categories: [], departments: [], regions: [], search: "" };
  state.openFilter = null;
  state.drillTarget = null;
  state.view = "overview";
}

function clearUploadedFiles() {
  state.uploadedFiles = {
    accountsRaw: "",
    accountsName: "",
    transactionsRaw: "",
    transactionsName: ""
  };
}

function focusUploadPanel() {
  state.uploadOpen = true;
  render();
  window.setTimeout(() => {
    const panel = document.querySelector("[data-upload-panel]");
    const input = document.querySelector("[data-coa-file]");
    panel?.scrollIntoView({ behavior: "smooth", block: "start" });
    input?.focus();
  }, 0);
}

function returnHome() {
  resetViewState();
  state.accounts = [];
  state.ledger = [];
  state.controls = null;
  state.dataLoaded = false;
  state.uploadOpen = true;
  state.uploadError = "";
  state.uploadNotice = "";
  clearUploadedFiles();
  render();
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1
});

const pct = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1
});

const tabs = [
  ["overview", "Overview", "dashboard"],
  ["pnl", "Income Statement", "receipt"],
  ["balance", "Balance Sheet", "landmark"],
  ["cashflow", "Cash Flow", "wallet"],
  ["cash", "Cash & Working Capital", "wallet"],
  ["ratios", "Ratios", "activity"],
  ["expenses", "Expenses", "factory"],
  ["ledger", "Ledger", "book"]
];

const state = {
  view: "overview",
  filters: {
    months: [],
    categories: [],
    departments: [],
    regions: [],
    search: ""
  },
  reporting: {
    periodType: "month",
    period: "",
    comparisonMode: "prior-year"
  },
  openFilter: null,
  drillTarget: null,
  accounts: [],
  ledger: [],
  controls: null,
  dataMode: "csv",
  uploadError: "",
  uploadNotice: "",
  uploadOpen: true,
  dataLoaded: false,
  uploadedFiles: {
    accountsRaw: "",
    accountsName: "",
    transactionsRaw: "",
    transactionsName: ""
  },
  options: {
    months: [],
    years: [],
    categories: [],
    departments: [],
    regions: []
  }
};

let searchTimer = 0;

function parseCsv(raw) {
  const rows = [];
  let field = "";
  let row = [];
  let quoted = false;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    const next = raw[i + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function parseObjects(raw) {
  const [headers, ...rows] = parseCsv(raw);
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

const ACCOUNT_COLUMNS = ["AccountKey", "AccountNumber", "AccountName", "Category_L1", "Subcategory_L2", "DetailGroup_L3", "Region", "Department"];
const TRANSACTION_COLUMNS = ["TransactionID", "Date", "AccountNumber", "Description", "Amount", "Type"];

function inferCashFlowSection(account) {
  const text = `${account.accountName} ${account.subcategory} ${account.detailGroup}`.toLowerCase();
  if (account.detailGroup === "Cash & Cash Equivalents") return "Cash";
  if (text.includes("depreciation") || text.includes("amortization")) return "NonCash";
  if (text.includes("capitalized") || text.includes("equipment") || text.includes("fixtures") || text.includes("development")) return "Investing";
  if (text.includes("loan") || text.includes("borrow") || account.category === "Equity") return "Financing";
  return "Operating";
}

function inferCashFlowLine(account) {
  const text = `${account.accountName} ${account.subcategory} ${account.detailGroup}`.toLowerCase();
  if (account.detailGroup === "Cash & Cash Equivalents") return "Cash accounts";
  if (account.category === "Revenue") return "Customer receipts and revenue activity";
  if (text.includes("payroll") || text.includes("salaries")) return "Payroll and people costs";
  if (text.includes("tax")) return "Tax payments and accruals";
  if (text.includes("interest")) return "Interest paid or received";
  if (text.includes("inventory")) return "Inventory and supplier payments";
  if (text.includes("capitalized") || text.includes("development")) return "Capitalized development";
  if (text.includes("equipment") || text.includes("fixtures")) return "Capital expenditure";
  if (text.includes("loan") || text.includes("borrow")) return "Loan proceeds and repayments";
  if (account.category === "Equity") return "Equity financing";
  if (account.category === "Expenses") return "Operating supplier payments";
  return "Working capital movement";
}

function normalizeAccount(row) {
  const account = {
    accountKey: row.AccountKey,
    accountNumber: row.AccountNumber,
    accountName: row.AccountName,
    category: row.Category_L1,
    subcategory: row.Subcategory_L2,
    detailGroup: row.DetailGroup_L3,
    region: row.Region,
    department: row.Department,
    normalBalance: row.NormalBalance || "",
    cashFlowSection: row.CashFlowSection || "",
    cashFlowLine: row.CashFlowLine || ""
  };
  account.cashFlowSection ||= inferCashFlowSection(account);
  account.cashFlowLine ||= inferCashFlowLine(account);
  return account;
}

function csvHeaders(raw) {
  const [headers = []] = parseCsv(raw);
  return new Set(headers.map((header) => header.trim()));
}

function hasRequiredColumns(headers, columns) {
  return columns.every((column) => headers.has(column));
}

function detectCsvKind(raw) {
  const headers = csvHeaders(raw);
  if (hasRequiredColumns(headers, ACCOUNT_COLUMNS)) return "accounts";
  if (hasRequiredColumns(headers, TRANSACTION_COLUMNS)) return "transactions";
  return "";
}

function csvKindLabel(kind) {
  return kind === "accounts" ? "Chart of Accounts CSV" : "Transactions CSV";
}

function parseDate(value) {
  const [day, month, year] = value.split("/").map(Number);
  return new Date(year, month - 1, day);
}

function parseIsoOrDisplayDate(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`);
  return parseDate(value);
}

function presentationAmount(category, amount) {
  return ["Revenue", "Liabilities", "Equity"].includes(category) ? -amount : amount;
}

function fmtMoney(value) {
  const formatted = currency.format(Math.abs(value));
  return value < 0 ? `(${formatted})` : formatted;
}

function fmtCompact(value) {
  return compactCurrency.format(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function icon(name) {
  const paths = {
    dashboard: "M3 13h8V3H3v10Zm10 8h8V3h-8v18ZM3 21h8v-6H3v6Z",
    receipt: "M6 2h12v20l-3-2-3 2-3-2-3 2V2Zm3 6h6M9 12h6M9 16h4",
    landmark: "M3 21h18M5 10h14M6 10v8M10 10v8M14 10v8M18 10v8M4 7l8-4 8 4H4Z",
    wallet: "M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 0V5a2 2 0 0 1 2-2h13M17 13h4",
    activity: "M3 12h4l3-8 4 16 3-8h4",
    factory: "M3 21V9l6 4V9l6 4V5h4v16H3Zm4-2h2m3 0h2m3 0h2",
    book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13Z",
    search: "M10 18a8 8 0 1 1 5.3-14A8 8 0 0 1 10 18Zm5.7-2.3L21 21",
    filter: "M3 5h18l-7 8v5l-4 2v-7L3 5Z",
    reset: "M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5",
    download: "M12 3v12m0 0 4-4m-4 4-4-4M4 21h16",
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3-10 2 2 4-5",
    bars: "M4 19V9m6 10V5m6 14v-8m4 8H2",
    line: "M3 17l6-6 4 4 7-9",
    dollar: "M12 2v20M17 7c-1-2-8-2-8 1 0 4 8 2 8 6 0 3-7 3-9 1",
    chevron: "M9 6l6 6-6 6"
  };
  return `<svg class="ui-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] ?? paths.dashboard}"/></svg>`;
}

function groupSum(rows, keyFn, valueFn = (row) => row.presentationAmount) {
  const map = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    map.set(key, (map.get(key) ?? 0) + valueFn(row));
  });
  return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function metrics(rows) {
  const sum = (predicate) => rows.filter(predicate).reduce((total, row) => total + row.presentationAmount, 0);
  const revenue = sum((row) => row.category === "Revenue");
  const cogs = sum((row) => row.subcategory === "Cost of Goods Sold");
  const grossProfit = revenue - cogs;
  const opex = sum((row) => row.subcategory === "Operating Expenses");
  const totalExpenses = sum((row) => row.category === "Expenses");
  const ebit = grossProfit - opex;
  const netResult = revenue - totalExpenses;
  const assets = sum((row) => row.category === "Assets");
  const liabilities = sum((row) => row.category === "Liabilities");
  const currentAssets = sum((row) => row.subcategory === "Current Assets");
  const currentLiabilities = sum((row) => row.subcategory === "Current Liabilities");
  const reportedEquity = sum((row) => row.category === "Equity");
  const currentYearEarnings = netResult;
  const equity = reportedEquity + currentYearEarnings;
  const cash = sum((row) => row.detailGroup === "Cash & Cash Equivalents");
  return {
    revenue,
    cogs,
    grossProfit,
    grossMargin: revenue ? grossProfit / revenue : 0,
    opex,
    totalExpenses,
    ebit,
    netResult,
    ebitMargin: revenue ? ebit / revenue : 0,
    assets,
    liabilities,
    currentAssets,
    currentLiabilities,
    reportedEquity,
    currentYearEarnings,
    equity,
    balanceCheck: assets - liabilities - equity,
    cash,
    workingCapital: currentAssets - currentLiabilities,
    currentRatio: currentLiabilities ? currentAssets / currentLiabilities : 0,
    debtToEquity: equity ? liabilities / equity : 0,
    transactions: state.controls?.totalTransactions ?? new Set(rows.map((row) => row.transactionId)).size,
    lines: rows.length
  };
}

function applyFilters() {
  const f = state.filters;
  const search = f.search.trim().toLowerCase();
  return state.ledger.filter((row) => {
    const matchSearch =
      !search ||
      [
        row.transactionId,
        row.description,
        row.accountNumber,
        row.accountName,
        row.category,
        row.subcategory,
        row.detailGroup
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    return (
      (f.months.length === 0 || f.months.includes(row.month)) &&
      (f.categories.length === 0 || f.categories.includes(row.category)) &&
      (f.departments.length === 0 || f.departments.includes(row.department)) &&
      (f.regions.length === 0 || f.regions.includes(row.region)) &&
      matchSearch
    );
  });
}

function byDrillTarget(rows) {
  const target = state.drillTarget;
  if (!target) return rows;
  return rows.filter((row) => {
    if (target.accountNumber && row.accountNumber !== target.accountNumber) return false;
    if (target.detailGroup && row.detailGroup !== target.detailGroup) return false;
    if (target.subcategory && row.subcategory !== target.subcategory) return false;
    if (target.category && row.category !== target.category) return false;
    if (target.cashFlowSection && row.cashFlowSection !== target.cashFlowSection) return false;
    if (target.cashFlowLine && row.cashFlowLine !== target.cashFlowLine) return false;
    if (target.month && row.month !== target.month) return false;
    if (target.months && !target.months.includes(row.month)) return false;
    return true;
  });
}

function monthlySeries(rows) {
  return state.options.months.map((month) => {
    const monthRows = rows.filter((row) => row.month === month);
    const m = metrics(monthRows);
    return {
      month,
      revenue: m.revenue,
      grossProfit: m.grossProfit,
      opex: m.opex,
      ebit: m.ebit,
      cash: m.cash
    };
  });
}

function integrityChecks() {
  if (state.controls) {
    const dates = state.ledger.map((row) => row.date).sort((a, b) => a - b);
    return {
      accounts: state.controls.sourceAccounts,
      lines: state.controls.sourceLines,
      publishedLines: state.controls.publishedLines,
      usedAccounts: state.controls.activeAccounts,
      inactiveAccounts: state.controls.inactiveAccounts,
      debits: state.controls.sourceDebits,
      credits: state.controls.sourceCredits,
      balanced: state.controls.balancedTransactions,
      totalTransactions: state.controls.totalTransactions,
      ledgerTotal: state.controls.sourceLedgerTotal,
      firstDate: state.controls.firstDate ? new Date(`${state.controls.firstDate}T00:00:00`) : dates[0],
      lastDate: state.controls.lastDate ? new Date(`${state.controls.lastDate}T00:00:00`) : dates[dates.length - 1]
    };
  }
  const nets = new Map();
  state.ledger.forEach((row) => nets.set(row.transactionId, (nets.get(row.transactionId) ?? 0) + row.amount));
  const debits = state.ledger.filter((row) => row.type === "Debit").reduce((total, row) => total + Math.abs(row.amount), 0);
  const credits = state.ledger.filter((row) => row.type === "Credit").reduce((total, row) => total + Math.abs(row.amount), 0);
  const dates = state.ledger.map((row) => row.date).sort((a, b) => a - b);
  return {
    accounts: state.accounts.length,
    lines: state.ledger.length,
    usedAccounts: new Set(state.ledger.map((row) => row.accountNumber)).size,
    inactiveAccounts: state.accounts.length - new Set(state.ledger.map((row) => row.accountNumber)).size,
    debits,
    credits,
    balanced: Array.from(nets.values()).filter((value) => Math.abs(value) < 0.005).length,
    totalTransactions: nets.size,
    ledgerTotal: state.ledger.reduce((total, row) => total + row.amount, 0),
    firstDate: dates[0],
    lastDate: dates[dates.length - 1]
  };
}

function dateIso(date) {
  return date ? date.toISOString().slice(0, 10) : "n/a";
}

function monthLabel(month) {
  return month ? month : "n/a";
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthIndex(month) {
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
}

function monthFromIndex(index) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function addMonths(month, delta) {
  return monthFromIndex(monthIndex(month) + delta);
}

function availableYears() {
  return [...new Set(state.options.months.map((month) => month.slice(0, 4)))].sort();
}

function defaultReportingPeriod() {
  return state.options.months.at(-1) ?? "";
}

function ensureReportingPeriod() {
  if (!state.reporting.period || !state.options.months.includes(state.reporting.period)) {
    state.reporting.period = defaultReportingPeriod();
  }
}

function periodLabel(month) {
  return month ? readableMonth(month) : "No period";
}

function priorYearPeriod(month) {
  return month ? `${Number(month.slice(0, 4)) - 1}-${month.slice(5, 7)}` : "";
}

function periodRows(rows, month = state.reporting.period) {
  return month ? rows.filter((row) => row.month === month) : rows;
}

function monthsToDate(month) {
  if (!month) return [];
  const year = month.slice(0, 4);
  return state.options.months.filter((item) => item.slice(0, 4) === year && item <= month);
}

function ytdRows(rows, month = state.reporting.period) {
  const months = monthsToDate(month);
  return rows.filter((row) => months.includes(row.month));
}

function cumulativeRows(rows, throughMonth = state.reporting.period) {
  return throughMonth ? rows.filter((row) => row.month <= throughMonth) : rows;
}

function comparisonSets(rows) {
  ensureReportingPeriod();
  const currentMonth = state.reporting.period;
  const priorYear = priorYearPeriod(currentMonth);
  const priorMonth = addMonths(currentMonth, -1);
  const secondPriorMonth = addMonths(currentMonth, -2);
  return {
    currentMonth,
    priorYear,
    priorMonth,
    secondPriorMonth,
    current: periodRows(rows, currentMonth),
    priorYearRows: periodRows(rows, priorYear),
    priorMonthRows: periodRows(rows, priorMonth),
    secondPriorMonthRows: periodRows(rows, secondPriorMonth),
    currentYtd: ytdRows(rows, currentMonth),
    priorYtd: ytdRows(rows, priorYear),
    cumulativeCurrent: cumulativeRows(rows, currentMonth),
    cumulativePriorYear: cumulativeRows(rows, priorYear)
  };
}

function varianceAmount(current, comparison) {
  return current - comparison;
}

function variancePercent(current, comparison) {
  return comparison ? (current - comparison) / Math.abs(comparison) : 0;
}

function fmtVariance(current, comparison) {
  const amount = varianceAmount(current, comparison);
  return `${fmtMoney(amount)} ${comparison ? `(${pct.format(variancePercent(current, comparison))})` : ""}`.trim();
}

function reportSubtitle() {
  if (!state.dataLoaded) return "Interactive financial statements reporting pack";
  const checks = integrityChecks();
  const start = checks.firstDate?.getFullYear?.();
  const end = checks.lastDate?.getFullYear?.();
  const yearLabel = start && end ? (start === end ? String(start) : `${start}-${end}`) : "current";
  const period = state.reporting.period ? ` | ${periodLabel(state.reporting.period)}` : "";
  return `Interactive ${yearLabel} financial statements reporting pack${period}`;
}

function monthlyVariance(rows) {
  const series = monthlySeries(rows);
  const revenueMonths = series.filter((row) => row.revenue);
  const ebitMonths = series.filter((row) => row.ebit || row.revenue || row.opex);
  const last = series.at(-1) ?? {};
  const previous = series.at(-2) ?? {};
  const bestRevenue = revenueMonths.reduce((best, row) => (row.revenue > (best?.revenue ?? -Infinity) ? row : best), null);
  const worstEbit = ebitMonths.reduce((worst, row) => (row.ebit < (worst?.ebit ?? Infinity) ? row : worst), null);
  const avgRevenue = revenueMonths.length ? revenueMonths.reduce((sum, row) => sum + row.revenue, 0) / revenueMonths.length : 0;
  const avgOpex = revenueMonths.length ? revenueMonths.reduce((sum, row) => sum + row.opex, 0) / revenueMonths.length : 0;
  const ebitValues = ebitMonths.map((row) => row.ebit);
  const ebitSpread = ebitValues.length ? Math.max(...ebitValues) - Math.min(...ebitValues) : 0;
  return {
    bestRevenue,
    worstEbit,
    revenueMoM: last.revenue - (previous.revenue ?? 0),
    ebitMoM: last.ebit - (previous.ebit ?? 0),
    revenueRunRate: avgRevenue * 12,
    opexRunRate: avgOpex * 12,
    ebitSpread
  };
}

function cfoExceptions(rows) {
  const sets = comparisonSets(rows);
  const currentRows = sets.current;
  const m = metrics(currentRows);
  const balanceMetrics = metrics(sets.cumulativeCurrent);
  const expenseMix = groupSum(
    currentRows.filter((row) => row.category === "Expenses"),
    (row) => row.accountName
  );
  const topExpense = expenseMix[0];
  const exceptions = [];
  if (m.ebitMargin < 0) {
    exceptions.push({
      severity: "critical",
      title: "Operating loss",
      text: `Operating result is ${fmtMoney(m.ebit)} with ${pct.format(m.ebitMargin)} margin.`,
      view: "pnl"
    });
  }
  if (m.revenue && m.opex / m.revenue > 0.7) {
    exceptions.push({
      severity: "critical",
      title: "Opex burden",
      text: `Operating expenses consume ${pct.format(m.opex / m.revenue)} of revenue.`,
      view: "expenses"
    });
  }
  if (m.revenue && m.cogs / m.revenue > 0.6) {
    exceptions.push({
      severity: "warning",
      title: "COGS pressure",
      text: `COGS is ${pct.format(m.cogs / m.revenue)} of revenue.`,
      view: "pnl"
    });
  }
  if (balanceMetrics.currentRatio < 1.2 || balanceMetrics.currentRatio > 3) {
    exceptions.push({
      severity: "warning",
      title: "Liquidity watch",
      text: `Current ratio is ${balanceMetrics.currentRatio.toFixed(2)}, outside the preferred 1.2-3.0 range.`,
      view: "cash"
    });
  }
  if (topExpense && m.opex + m.cogs && topExpense.value / (m.opex + m.cogs) > 0.3) {
    exceptions.push({
      severity: "info",
      title: "Expense concentration",
      text: `${topExpense.name} represents ${pct.format(topExpense.value / (m.opex + m.cogs))} of expenses.`,
      view: "expenses",
      accountNumber: currentRows.find((row) => row.accountName === topExpense.name)?.accountNumber
    });
  }
  return exceptions;
}

function pageNarrative(view, rows) {
  const sets = comparisonSets(rows);
  const periodMetrics = metrics(sets.current);
  const balanceMetrics = metrics(sets.cumulativeCurrent);
  const m = ["balance", "cash"].includes(view) ? balanceMetrics : periodMetrics;
  const variance = monthlyVariance(rows);
  const lines = {
    overview: [
      `Operating result is ${fmtMoney(m.ebit)} on revenue of ${fmtMoney(m.revenue)}.`,
      `Gross margin is ${pct.format(m.grossMargin)} while opex equals ${pct.format(m.opex / Math.max(m.revenue, 1))} of revenue.`,
      `Best revenue month is ${monthLabel(variance.bestRevenue?.month)}; worst operating-result month is ${monthLabel(variance.worstEbit?.month)}.`
    ],
    pnl: [
      `The P&L shows ${fmtMoney(m.grossProfit)} gross profit before ${fmtMoney(m.opex)} of operating expenses.`,
      `Operating margin is ${pct.format(m.ebitMargin)}, so cost structure is the main management question.`,
      "Click any statement line to inspect the supporting journals."
    ],
    balance: [
      `Assets are ${fmtMoney(m.assets)} and balance against liabilities plus adjusted equity of ${fmtMoney(m.liabilities + m.equity)}.`,
      `Equity includes accumulated earnings/loss of ${fmtMoney(m.currentYearEarnings)} so the statement balances.`,
      `Current ratio is ${m.currentRatio.toFixed(2)} and debt-to-equity is ${m.debtToEquity.toFixed(2)}.`
    ],
    cash: [
      `Cash proxy totals ${fmtMoney(m.cash)} and working capital is ${fmtMoney(m.workingCapital)}.`,
      `Revenue run-rate is ${fmtMoney(variance.revenueRunRate)} versus opex run-rate of ${fmtMoney(variance.opexRunRate)}.`,
      "Formal cash flow classification requires opening balances and cash-flow tags."
    ],
    cashflow: [
      `Cash flow compares ${periodLabel(state.reporting.period)} against prior year and the two immediately preceding months.`,
      "Operating, investing, and financing lines use cash-flow tags when available and inferred classifications otherwise.",
      "Closing cash reconciles to accounts tagged Cash & Cash Equivalents."
    ],
    ratios: [
      `${m.ebit >= 0 ? "Operating conversion is positive" : "Operating conversion is negative"} at ${pct.format(m.ebitMargin)} operating margin.`,
      `COGS/revenue is ${pct.format(m.cogs / Math.max(m.revenue, 1))}; opex/revenue is ${pct.format(m.opex / Math.max(m.revenue, 1))}.`,
      `Current ratio is ${balanceMetrics.currentRatio.toFixed(2)} on cumulative current assets and current liabilities.`
    ],
    expenses: [
      `Total expenses are ${fmtMoney(m.cogs + m.opex)}, with opex at ${fmtMoney(m.opex)}.`,
      `Expense concentration and monthly run-rate should be reviewed before planning decisions.`,
      "Click an account bar to inspect its journal support."
    ],
    ledger: [
      `${rows.length} report rows are visible under the current filters.`,
      state.controls ? "The ledger explorer shows monthly account summaries created from the uploaded files." : "The ledger explorer is the audit trail behind every chart and statement.",
      "Download the filtered set when a working-paper extract is needed."
    ]
  }[view];

  return `<section class="narrative">
    <strong>CFO summary</strong>
    <p>${escapeHtml(lines[0])}</p>
    <ul>${lines.slice(1).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
  </section>`;
}

function reconciliationPanel() {
  const checks = integrityChecks();
  const m = metrics(state.ledger);
  const ok = Math.abs(checks.ledgerTotal) < 0.005 && Math.abs(checks.debits - checks.credits) < 0.005;
  return `<section class="recon-panel">
    <div class="section-title">
      <h2>${icon("shield")} Reconciliation Controls</h2>
      <span class="status ${ok ? "ok" : "fail"}">${ok ? "Passed" : "Review"}</span>
    </div>
    <div class="recon-grid">
      <div><span>Total debits</span><strong>${fmtMoney(checks.debits)}</strong></div>
      <div><span>Total credits</span><strong>${fmtMoney(checks.credits)}</strong></div>
      <div><span>Net ledger total</span><strong>${fmtMoney(checks.ledgerTotal)}</strong></div>
      <div><span>Balanced entries</span><strong>${checks.balanced}/${checks.totalTransactions}</strong></div>
      <div><span>Transaction lines</span><strong>${checks.lines}</strong></div>
      <div><span>Report rows</span><strong>${checks.publishedLines ?? checks.lines}</strong></div>
      <div><span>Active accounts</span><strong>${checks.usedAccounts}/${checks.accounts}</strong></div>
      <div><span>Inactive accounts</span><strong>${checks.inactiveAccounts}</strong></div>
      <div><span>Date coverage</span><strong>${dateIso(checks.firstDate)} to ${dateIso(checks.lastDate)}</strong></div>
      <div><span>Balance sheet check</span><strong>${fmtMoney(m.balanceCheck)}</strong></div>
    </div>
  </section>`;
}

function loadData(accountsRaw, transactionsRaw) {
  const accounts = parseObjects(accountsRaw).map(normalizeAccount);
  const accountMap = new Map(accounts.map((account) => [account.accountNumber, account]));
  const ledger = parseObjects(transactionsRaw).map((row) => {
    const account = accountMap.get(row.AccountNumber);
    if (!account) throw new Error(`Missing account ${row.AccountNumber}`);
    const date = parseDate(row.Date);
    const amount = Number(row.Amount);
    return {
      transactionId: row.TransactionID,
      date,
      dateLabel: row.Date,
      month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      quarter: `${date.getFullYear()} Q${Math.floor(date.getMonth() / 3) + 1}`,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      category: account.category,
      subcategory: account.subcategory,
      detailGroup: account.detailGroup,
      region: account.region,
      department: account.department,
      cashFlowSection: account.cashFlowSection,
      cashFlowLine: account.cashFlowLine,
      description: row.Description,
      amount,
      presentationAmount: presentationAmount(account.category, amount),
      type: row.Type
    };
  });

  state.accounts = accounts;
  state.ledger = ledger;
  state.controls = null;
  state.dataMode = "csv";
  state.dataLoaded = true;
  state.options = {
    months: [...new Set(ledger.map((row) => row.month))].sort(),
    years: [...new Set(ledger.map((row) => row.month.slice(0, 4)))].sort(),
    categories: [...new Set(ledger.map((row) => row.category))].sort(),
    departments: [...new Set(ledger.map((row) => row.department))].sort(),
    regions: [...new Set(ledger.map((row) => row.region))].sort()
  };
  ensureReportingPeriod();
}

function monthStartLabel(month) {
  return `01/${month.slice(5, 7)}/${month.slice(0, 4)}`;
}

function readableMonth(month) {
  const date = new Date(`${month}-01T00:00:00`);
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function requireColumns(rows, columns, fileName) {
  if (!rows.length) throw new Error(`${fileName} is empty.`);
  const missing = columns.filter((column) => !(column in rows[0]));
  if (missing.length) throw new Error(`${fileName} does not match the required format. Missing columns: ${missing.join(", ")}`);
}

function buildReportDataFromCsv(accountsRaw, transactionsRaw) {
  const accountRows = parseObjects(accountsRaw);
  const transactionRows = parseObjects(transactionsRaw);
  requireColumns(
    accountRows,
    ACCOUNT_COLUMNS,
    "ChartOfAccounts.csv"
  );
  requireColumns(transactionRows, TRANSACTION_COLUMNS, "Transactions.csv");

  const accounts = accountRows.map(normalizeAccount);
  const accountMap = new Map(accounts.map((account) => [account.accountNumber, account]));
  const sourceLedger = transactionRows.map((row) => {
    const account = accountMap.get(row.AccountNumber);
    if (!account) throw new Error(`Transactions.csv contains account ${row.AccountNumber}, which is not in ChartOfAccounts.csv.`);
    const date = parseDate(row.Date);
    const amount = Number(row.Amount);
    if (!Number.isFinite(amount)) throw new Error(`Transactions.csv has a non-numeric amount for ${row.TransactionID}.`);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return {
      transactionId: row.TransactionID,
      date,
      dateLabel: row.Date,
      month,
      accountNumber: account.accountNumber,
      type: row.Type,
      amount
    };
  });

  const sourceNets = new Map();
  sourceLedger.forEach((row) => sourceNets.set(row.transactionId, (sourceNets.get(row.transactionId) ?? 0) + row.amount));
  const activeAccounts = [...new Set(sourceLedger.map((row) => row.accountNumber))]
    .map((accountNumber) => accountMap.get(accountNumber))
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
  const summary = new Map();
  sourceLedger.forEach((row) => {
    const key = [row.month, row.accountNumber, row.type].join("|");
    const current = summary.get(key) ?? {
      month: row.month,
      dateLabel: monthStartLabel(row.month),
      accountNumber: row.accountNumber,
      type: row.type,
      amount: 0,
      sourceLineCount: 0
    };
    current.amount += row.amount;
    current.sourceLineCount += 1;
    summary.set(key, current);
  });
  const summarizedLedger = Array.from(summary.values())
    .sort((a, b) => `${a.month}-${a.accountNumber}-${a.type}`.localeCompare(`${b.month}-${b.accountNumber}-${b.type}`))
    .map((row, index) => ({
      transactionId: `SUM-${String(index + 1).padStart(4, "0")}`,
      dateLabel: row.dateLabel,
      month: row.month,
      accountNumber: row.accountNumber,
      type: row.type,
      amount: Number(row.amount.toFixed(2)),
      description: `${readableMonth(row.month)} summarized ${row.type.toLowerCase()}s for ${accountMap.get(row.accountNumber)?.accountName ?? row.accountNumber} (${row.sourceLineCount} transactions)`,
      sourceLineCount: row.sourceLineCount
    }));
  const dates = sourceLedger.map((row) => row.date).sort((a, b) => a - b);
  const debits = sourceLedger.filter((row) => row.type === "Debit").reduce((total, row) => total + Math.abs(row.amount), 0);
  const credits = sourceLedger.filter((row) => row.type === "Credit").reduce((total, row) => total + Math.abs(row.amount), 0);

  return {
    generatedAt: new Date().toISOString(),
    privacy: {
      mode: "summarized",
      grain: "month-account-type",
      rawCsvFilesRequiredOnline: false,
      notes: [
        "Raw transaction IDs are replaced with synthetic summary IDs.",
        "Original transaction descriptions are not published.",
        "Ledger lines are summarized by month, account, and debit/credit type."
      ]
    },
    controls: {
      sourceAccounts: accounts.length,
      activeAccounts: activeAccounts.length,
      inactiveAccounts: accounts.length - activeAccounts.length,
      sourceLines: sourceLedger.length,
      publishedLines: summarizedLedger.length,
      totalTransactions: sourceNets.size,
      balancedTransactions: Array.from(sourceNets.values()).filter((value) => Math.abs(value) < 0.005).length,
      sourceDebits: Number(debits.toFixed(2)),
      sourceCredits: Number(credits.toFixed(2)),
      sourceLedgerTotal: Number(sourceLedger.reduce((total, row) => total + row.amount, 0).toFixed(2)),
      firstDate: dates[0]?.toISOString().slice(0, 10) ?? "",
      lastDate: dates.at(-1)?.toISOString().slice(0, 10) ?? ""
    },
    accounts: activeAccounts,
    ledger: summarizedLedger
  };
}

function loadReportData(reportData) {
  const accounts = reportData.accounts.map((account) => normalizeAccount({
    AccountKey: account.accountKey,
    AccountNumber: account.accountNumber,
    AccountName: account.accountName,
    Category_L1: account.category,
    Subcategory_L2: account.subcategory,
    DetailGroup_L3: account.detailGroup,
    Region: account.region,
    Department: account.department,
    CashFlowSection: account.cashFlowSection,
    CashFlowLine: account.cashFlowLine,
    NormalBalance: account.normalBalance
  }));
  const accountMap = new Map(accounts.map((account) => [account.accountNumber, account]));
  const ledger = reportData.ledger.map((row) => {
    const account = accountMap.get(row.accountNumber);
    if (!account) throw new Error(`Missing account ${row.accountNumber}`);
    const date = parseIsoOrDisplayDate(row.dateLabel);
    return {
      transactionId: row.transactionId,
      date,
      dateLabel: row.dateLabel,
      month: row.month,
      quarter: `${row.month.slice(0, 4)} Q${Math.floor((Number(row.month.slice(5, 7)) - 1) / 3) + 1}`,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      category: account.category,
      subcategory: account.subcategory,
      detailGroup: account.detailGroup,
      region: account.region,
      department: account.department,
      cashFlowSection: account.cashFlowSection,
      cashFlowLine: account.cashFlowLine,
      description: row.description,
      amount: Number(row.amount),
      presentationAmount: presentationAmount(account.category, Number(row.amount)),
      type: row.type,
      sourceLineCount: row.sourceLineCount ?? 1
    };
  });

  state.accounts = accounts;
  state.ledger = ledger;
  state.controls = reportData.controls;
  state.dataMode = reportData.privacy?.mode ?? "json";
  state.dataLoaded = true;
  state.options = {
    months: [...new Set(ledger.map((row) => row.month))].sort(),
    years: [...new Set(ledger.map((row) => row.month.slice(0, 4)))].sort(),
    categories: [...new Set(ledger.map((row) => row.category))].sort(),
    departments: [...new Set(ledger.map((row) => row.department))].sort(),
    regions: [...new Set(ledger.map((row) => row.region))].sort()
  };
  ensureReportingPeriod();
}

function buildPnl(rows) {
  const revenue = metrics(rows).revenue;
  const cogs = metrics(rows).cogs;
  const opex = metrics(rows).opex;
  const grossProfit = revenue - cogs;
  const ebit = grossProfit - opex;
  const accounts = groupSum(rows, (row) => row.accountName);
  const accountLookup = (name) => rows.find((row) => row.accountName === name);

  return [
    { id: "revenue", label: "Revenue", amount: revenue, level: 0, kind: "section", category: "Revenue" },
    ...accounts
      .filter((item) => accountLookup(item.name)?.category === "Revenue")
      .map((item) => ({
        id: `rev-${item.name}`,
        label: item.name,
        amount: item.value,
        level: 1,
        kind: "line",
        category: "Revenue",
        accountNumber: accountLookup(item.name)?.accountNumber
      })),
    { id: "cogs", label: "Cost of Goods Sold", amount: cogs, level: 0, kind: "section", subcategory: "Cost of Goods Sold" },
    ...accounts
      .filter((item) => accountLookup(item.name)?.subcategory === "Cost of Goods Sold")
      .map((item) => ({
        id: `cogs-${item.name}`,
        label: item.name,
        amount: item.value,
        level: 1,
        kind: "line",
        subcategory: "Cost of Goods Sold",
        accountNumber: accountLookup(item.name)?.accountNumber
      })),
    { id: "gross-profit", label: "Gross Profit", amount: grossProfit, level: 0, kind: "subtotal" },
    { id: "opex", label: "Operating Expenses", amount: opex, level: 0, kind: "section", subcategory: "Operating Expenses" },
    ...accounts
      .filter((item) => accountLookup(item.name)?.subcategory === "Operating Expenses")
      .map((item) => ({
        id: `opex-${item.name}`,
        label: item.name,
        amount: item.value,
        level: 1,
        kind: "line",
        subcategory: "Operating Expenses",
        accountNumber: accountLookup(item.name)?.accountNumber
      })),
    { id: "ebit", label: "Operating Result", amount: ebit, level: 0, kind: "subtotal" }
  ];
}

function buildBalance(rows) {
  const m = metrics(rows);
  const lines = [];
  ["Assets", "Liabilities"].forEach((category) => {
    const categoryRows = rows.filter((row) => row.category === category);
    const total = categoryRows.reduce((sum, row) => sum + row.presentationAmount, 0);
    lines.push({ id: category, label: category, amount: total, level: 0, kind: "section", category });
    groupSum(categoryRows, (row) => row.subcategory).forEach((item) => {
      lines.push({
        id: `${category}-${item.name}`,
        label: item.name,
        amount: item.value,
        level: 1,
        kind: "line",
        category,
        subcategory: item.name
      });
    });
  });
  lines.push({ id: "Equity", label: "Equity", amount: m.equity, level: 0, kind: "section", category: "Equity" });
  groupSum(rows.filter((row) => row.category === "Equity"), (row) => row.subcategory).forEach((item) => {
    lines.push({
      id: `Equity-${item.name}`,
      label: item.name,
      amount: item.value,
      level: 1,
      kind: "line",
      category: "Equity",
      subcategory: item.name
    });
  });
  lines.push({
    id: "current-year-earnings",
    label: "Accumulated Earnings / (Loss)",
    amount: m.currentYearEarnings,
    level: 1,
    kind: "line"
  });
  lines.push({
    id: "balance-check",
    label: "Balance Check",
    amount: m.balanceCheck,
    level: 0,
    kind: "subtotal"
  });
  return lines;
}

function lineAmount(lines, id) {
  return lines.find((line) => line.id === id)?.amount ?? 0;
}

function comparativeLines(builder, rows, options = {}) {
  const sets = comparisonSets(rows);
  const currentLines = builder(sets.current);
  const priorYearLines = builder(sets.priorYearRows);
  const priorMonthLines = builder(sets.priorMonthRows);
  const secondPriorMonthLines = builder(sets.secondPriorMonthRows);
  return currentLines.map((line) => {
    const priorYear = lineAmount(priorYearLines, line.id);
    const priorMonth = lineAmount(priorMonthLines, line.id);
    const secondPriorMonth = lineAmount(secondPriorMonthLines, line.id);
    return {
      ...line,
      current: line.amount,
      priorYear,
      priorMonth,
      secondPriorMonth,
      varianceYear: varianceAmount(line.amount, priorYear),
      varianceMonth: varianceAmount(line.amount, priorMonth),
      commonSize: options.denominator ? line.amount / options.denominator : 0
    };
  });
}

function comparativeBalanceLines(rows) {
  const sets = comparisonSets(rows);
  const currentLines = buildBalance(sets.cumulativeCurrent);
  const priorLines = buildBalance(sets.cumulativePriorYear);
  const denominator = metrics(sets.cumulativeCurrent).assets;
  return currentLines.map((line) => {
    const priorYear = lineAmount(priorLines, line.id);
    return {
      ...line,
      current: line.amount,
      priorYear,
      varianceYear: varianceAmount(line.amount, priorYear),
      commonSize: denominator ? line.amount / denominator : 0
    };
  });
}

function cashFlowRows(rows) {
  const cashRows = rows.filter((row) => row.cashFlowSection === "Cash");
  const nonCashRows = rows.filter((row) => {
    if (row.cashFlowSection === "Cash" || row.cashFlowSection === "NonCash") return false;
    const text = `${row.description} ${row.accountName}`.toLowerCase();
    if ((text.includes("depreciation") || text.includes("amortization")) && row.amount < 0) return false;
    return true;
  });
  const lineRows = groupSum(nonCashRows, (row) => `${row.cashFlowSection}|${row.cashFlowLine}`, (row) => -row.amount);
  const sections = ["Operating", "Investing", "Financing"];
  const lines = [];
  sections.forEach((section) => {
    const sectionLines = lineRows.filter((item) => item.name.startsWith(`${section}|`));
    const sectionTotal = sectionLines.reduce((sum, item) => sum + item.value, 0);
    lines.push({ id: `cf-${section}`, label: `${section} cash movement`, amount: sectionTotal, level: 0, kind: "section", cashFlowSection: section });
    sectionLines.forEach((item) => {
      const label = item.name.split("|")[1];
      lines.push({
        id: `cf-${section}-${label}`,
        label,
        amount: item.value,
        level: 1,
        kind: "line",
        cashFlowSection: section,
        cashFlowLine: label
      });
    });
  });
  const netMovement = cashRows.reduce((sum, row) => sum + row.amount, 0);
  lines.push({ id: "cf-net-movement", label: "Net cash movement", amount: netMovement, level: 0, kind: "subtotal", cashFlowSection: "Cash" });
  return lines;
}

function cashBalanceThrough(rows, month) {
  return cumulativeRows(rows, month)
    .filter((row) => row.cashFlowSection === "Cash")
    .reduce((sum, row) => sum + row.presentationAmount, 0);
}

function comparativeCashFlowLines(rows) {
  const sets = comparisonSets(rows);
  const currentLines = cashFlowRows(sets.current);
  const priorYearLines = cashFlowRows(sets.priorYearRows);
  const priorMonthLines = cashFlowRows(sets.priorMonthRows);
  const secondPriorMonthLines = cashFlowRows(sets.secondPriorMonthRows);
  const openingCash = cashBalanceThrough(rows, addMonths(sets.currentMonth, -1));
  const priorOpeningCash = cashBalanceThrough(rows, addMonths(sets.priorYear, -1));
  const priorMonthOpeningCash = cashBalanceThrough(rows, addMonths(sets.priorMonth, -1));
  const secondPriorMonthOpeningCash = cashBalanceThrough(rows, addMonths(sets.secondPriorMonth, -1));
  const netMovement = lineAmount(currentLines, "cf-net-movement");
  const priorNetMovement = lineAmount(priorYearLines, "cf-net-movement");
  const priorMonthNetMovement = lineAmount(priorMonthLines, "cf-net-movement");
  const secondPriorMonthNetMovement = lineAmount(secondPriorMonthLines, "cf-net-movement");
  const baseLines = [
    { id: "cf-opening-cash", label: "Opening cash balance", amount: openingCash, level: 0, kind: "section" },
    ...currentLines,
    { id: "cf-closing-cash", label: "Closing cash balance", amount: openingCash + netMovement, level: 0, kind: "subtotal" }
  ];
  return baseLines.map((line) => {
    const priorYear =
      line.id === "cf-opening-cash" ? priorOpeningCash :
      line.id === "cf-closing-cash" ? priorOpeningCash + priorNetMovement :
      lineAmount(priorYearLines, line.id);
    const priorMonth =
      line.id === "cf-opening-cash" ? priorMonthOpeningCash :
      line.id === "cf-closing-cash" ? priorMonthOpeningCash + priorMonthNetMovement :
      lineAmount(priorMonthLines, line.id);
    const secondPriorMonth =
      line.id === "cf-opening-cash" ? secondPriorMonthOpeningCash :
      line.id === "cf-closing-cash" ? secondPriorMonthOpeningCash + secondPriorMonthNetMovement :
      lineAmount(secondPriorMonthLines, line.id);
    return {
      ...line,
      current: line.amount,
      priorYear,
      priorMonth,
      secondPriorMonth,
      varianceYear: varianceAmount(line.amount, priorYear),
      varianceMonth: varianceAmount(line.amount, priorMonth)
    };
  });
}

function kpi(label, value, meta, tone) {
  return `<article class="kpi ${tone}"><span>${label}</span><strong>${value}</strong><small>${meta}</small></article>`;
}

function filterMenu(id, label, options, selected) {
  const summary = selected.length === 0 ? "All" : selected.length === 1 ? selected[0] : `${selected.length} selected`;
  const open = state.openFilter === id;
  return `
    <div class="filter-menu">
      <button class="filter-button" data-open-filter="${id}">${icon("filter")}<span>${label}</span><strong>${escapeHtml(summary)}</strong>${icon("chevron")}</button>
      ${
        open
          ? `<div class="filter-popover">
              <button class="filter-clear" data-clear-filter="${id}">Clear</button>
              ${options
                .map(
                  (option) => `
                  <label class="check-row">
                    <input type="checkbox" data-filter="${id}" value="${escapeHtml(option)}" ${selected.includes(option) ? "checked" : ""}>
                    <span>${escapeHtml(option)}</span>
                  </label>`
                )
                .join("")}
            </div>`
          : ""
      }
    </div>`;
}

function activeFilterChips() {
  const chips = [
    ...state.filters.months.map((value) => ["months", value]),
    ...state.filters.categories.map((value) => ["categories", value]),
    ...state.filters.departments.map((value) => ["departments", value]),
    ...state.filters.regions.map((value) => ["regions", value])
  ];
  if (!chips.length && !state.filters.search) return "";
  return `<div class="active-filters">
    <span>Active filters</span>
    ${state.filters.search ? `<button data-clear-search>Search: ${escapeHtml(state.filters.search)} x</button>` : ""}
    ${chips.map(([id, value]) => `<button data-remove-filter="${id}" data-filter-value="${escapeHtml(value)}">${escapeHtml(value)} x</button>`).join("")}
  </div>`;
}

function uploadPicker(kind, label) {
  const fileName =
    kind === "accounts" ? state.uploadedFiles.accountsName : state.uploadedFiles.transactionsName;
  const dataAttr = kind === "accounts" ? "data-coa-file" : "data-transactions-file";
  return `
    <label class="file-picker ${fileName ? "ready" : ""}">
      <span>${label}</span>
      <input type="file" ${dataAttr} accept=".csv,text/csv">
      <b>Choose file</b>
      <em>${fileName ? escapeHtml(fileName) : "No file selected"}</em>
    </label>`;
}

function periodControls() {
  if (!state.dataLoaded) return "";
  ensureReportingPeriod();
  return `
    <label class="period-select">
      <span>Report month</span>
      <select data-report-period>
        ${state.options.months.map((month) => `<option value="${month}" ${state.reporting.period === month ? "selected" : ""}>${escapeHtml(periodLabel(month))}</option>`).join("")}
      </select>
    </label>
    <label class="period-select">
      <span>Compare</span>
      <select data-comparison-mode>
        <option value="prior-year" ${state.reporting.comparisonMode === "prior-year" ? "selected" : ""}>Prior year</option>
        <option value="prior-month" ${state.reporting.comparisonMode === "prior-month" ? "selected" : ""}>Prior month</option>
        <option value="two-prior-months" ${state.reporting.comparisonMode === "two-prior-months" ? "selected" : ""}>Two prior months</option>
      </select>
    </label>`;
}

function header() {
  return `
    <header class="top">
      <button class="brand" data-home title="Return to upload home">
        <span class="brand-mark">FS</span>
        <div>
          <h1>CFO Financial Statements</h1>
          <p>${escapeHtml(reportSubtitle())}</p>
        </div>
      </button>
      <nav class="tabs">
        ${tabs
          .map(
            ([id, label, iconName]) => `
            <button class="${state.view === id ? "active" : ""}" data-view="${id}">
              ${icon(iconName)}
              <span>${label}</span>
            </button>`
          )
          .join("")}
      </nav>
      <div class="filters">
        ${periodControls()}
        <label class="search">${icon("search")}<input data-search value="${escapeHtml(state.filters.search)}" placeholder="Search ledger, account, description"></label>
        ${filterMenu("months", "Month", state.options.months, state.filters.months)}
        ${filterMenu("categories", "Category", state.options.categories, state.filters.categories)}
        ${filterMenu("departments", "Department", state.options.departments, state.filters.departments)}
        ${filterMenu("regions", "Region", state.options.regions, state.filters.regions)}
        <button class="icon-button" data-reset title="Reset filters">${icon("reset")}</button>
        <button class="upload-toggle" data-upload-toggle>${icon("download")} Upload CSVs</button>
      </div>
      ${activeFilterChips()}
      <section class="upload-panel" data-upload-panel ${state.uploadOpen ? "" : "hidden"}>
        <div>
          <strong>Refresh report from your CSV files</strong>
          <p>Select both CSV files in either order, then generate a fresh report. You can also download a reusable report file after reviewing the results.</p>
          ${state.uploadError ? `<p class="upload-error">${escapeHtml(state.uploadError)}</p>` : ""}
          ${state.uploadNotice ? `<p class="upload-notice">${escapeHtml(state.uploadNotice)}</p>` : ""}
        </div>
        ${uploadPicker("accounts", "Chart of Accounts CSV")}
        ${uploadPicker("transactions", "Transactions CSV")}
        <button class="download-button" data-refresh-from-upload>Generate report</button>
        <button class="download-button secondary" data-export-report-data>Download report file</button>
      </section>
    </header>`;
}

function lineChart(series) {
  const width = 960;
  const height = 270;
  const pad = { left: 58, right: 18, top: 18, bottom: 40 };
  const allValues = series.flatMap((row) => [row.revenue, row.opex, row.ebit]);
  const min = Math.min(0, ...allValues);
  const max = Math.max(1, ...allValues);
  const x = (index) => pad.left + (index * (width - pad.left - pad.right)) / Math.max(series.length - 1, 1);
  const y = (value) => pad.top + ((max - value) * (height - pad.top - pad.bottom)) / (max - min || 1);
  const barWidth = Math.max(12, (width - pad.left - pad.right) / series.length / 4);
  const path = series.map((row, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(row.ebit)}`).join(" ");

  return `
    <p class="chart-note">Monthly revenue and operating expense bars with operating result as the line.</p>
    <svg class="data-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly performance trend">
      ${[0, 0.25, 0.5, 0.75, 1]
        .map((step) => {
          const value = min + (max - min) * step;
          const yy = y(value);
          return `<line class="grid-line" x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}"></line><text class="tick" x="8" y="${yy + 4}">${fmtCompact(value)}</text>`;
        })
        .join("")}
      ${series
        .map((row, index) => {
          const xx = x(index);
          const revTop = y(row.revenue);
          const opexTop = y(row.opex);
          return `
            <rect class="bar" x="${xx - barWidth - 2}" y="${revTop}" width="${barWidth}" height="${Math.max(1, y(0) - revTop)}" fill="${COLORS.revenue}"></rect>
            <rect class="bar" x="${xx + 2}" y="${opexTop}" width="${barWidth}" height="${Math.max(1, y(0) - opexTop)}" fill="${COLORS.expense}"></rect>
            <text class="tick" x="${xx - 21}" y="${height - 12}">${row.month.slice(5)}</text>`;
        })
        .join("")}
      <path d="${path}" fill="none" stroke="${COLORS.loss}" stroke-width="3"></path>
      ${series.map((row, index) => `<circle cx="${x(index)}" cy="${y(row.ebit)}" r="3" fill="${COLORS.loss}"><title>${row.month}: ${fmtMoney(row.ebit)}</title></circle>`).join("")}
    </svg>
    <div class="legend"><span><i style="background:${COLORS.revenue}"></i>Revenue</span><span><i style="background:${COLORS.expense}"></i>Opex</span><span><i style="background:${COLORS.loss}"></i>Operating Result</span></div>`;
}

function barChart(data, options = {}) {
  const width = 960;
  const rowHeight = options.rowHeight ?? 32;
  const height = Math.max(options.minHeight ?? 210, 44 + data.length * rowHeight);
  const pad = { left: options.left ?? 235, right: options.right ?? 74, top: 18, bottom: 30 };
  const max = Math.max(1, ...data.map((item) => Math.abs(item.value)));
  return `
    <svg class="data-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(options.label ?? "Bar chart")}">
      ${data
        .map((item, index) => {
          const y = pad.top + index * rowHeight;
          const barWidth = (Math.abs(item.value) / max) * (width - pad.left - pad.right);
          const account = options.accountLookup?.(item.name) ?? "";
          const color = options.colorFn?.(item, index) ?? semanticColor(item.name, index);
          const valueLabel = fmtCompact(item.value);
          const outsideX = pad.left + barWidth + 8;
          const placeInside = outsideX > width - pad.right + 18;
          const labelX = placeInside ? pad.left + barWidth - 8 : outsideX;
          const labelFill = placeInside ? "#ffffff" : "#53657d";
          const labelAnchor = placeInside ? "end" : "start";
          return `
            <text class="tick" x="8" y="${y + 22}">${escapeHtml(String(item.name).slice(0, 34))}</text>
            <rect class="bar" data-drill-account="${escapeHtml(account)}" data-drill-label="${escapeHtml(item.name)}" x="${pad.left}" y="${y + 4}" width="${barWidth}" height="22" rx="5" fill="${color}"><title>${escapeHtml(item.name)}: ${fmtMoney(item.value)}</title></rect>
            <text class="tick value-label" x="${labelX}" y="${y + 21}" text-anchor="${labelAnchor}" style="fill:${labelFill}">${valueLabel}</text>`;
        })
        .join("")}
    </svg>`;
}

function pieChart(data, targetKey = "category") {
  const total = data.reduce((sum, item) => sum + Math.abs(item.value), 0) || 1;
  let cumulative = 0;
  const radius = 104;
  const cx = 150;
  const cy = 140;
  const slices = data
    .map((item, index) => {
      const start = (cumulative / total) * Math.PI * 2;
      cumulative += Math.abs(item.value);
      const end = (cumulative / total) * Math.PI * 2;
      const large = end - start > Math.PI ? 1 : 0;
      const x1 = cx + radius * Math.cos(start);
      const y1 = cy + radius * Math.sin(start);
      const x2 = cx + radius * Math.cos(end);
      const y2 = cy + radius * Math.sin(end);
      return `<path class="pie-slice" data-drill-${targetKey}="${escapeHtml(item.name)}" data-drill-label="${escapeHtml(item.name)}" d="M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z" fill="${semanticColor(item.name, index)}"><title>${escapeHtml(item.name)}: ${fmtMoney(item.value)}</title></path>`;
    })
    .join("");
  return `
    <svg class="data-chart pie-chart" viewBox="0 0 420 300" role="img" aria-label="Mix chart">
      ${slices}
      <circle cx="${cx}" cy="${cy}" r="62" fill="#fff"></circle>
      <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="tick">Total</text>
      <text x="${cx}" y="${cy + 20}" text-anchor="middle" fill="#172033" font-size="17" font-weight="800">${fmtCompact(total)}</text>
      ${data
        .map(
          (item, index) =>
            `<rect x="285" y="${45 + index * 24}" width="9" height="9" rx="2" fill="${semanticColor(item.name, index)}"></rect><text class="tick" x="300" y="${54 + index * 24}">${escapeHtml(item.name)}</text>`
        )
        .join("")}
    </svg>`;
}

function statementTable(lines) {
  return `<div class="statement">
    ${lines
      .map((line) => {
        const active = state.drillTarget?.label === line.label;
        return `
          <button class="statement-row ${line.kind} ${active ? "active" : ""}" data-statement='${escapeHtml(JSON.stringify(line))}' style="padding-left:${14 + line.level * 24}px">
            <span>${line.level > 0 ? "> " : ""}${escapeHtml(line.label)}</span>
            <strong>${fmtMoney(line.amount)}</strong>
          </button>`;
      })
      .join("")}
  </div>`;
}

function ledgerTable(rows, compact = false) {
  if (!rows.length) return `<div class="empty">No ledger rows match the current selection.</div>`;
  return `<div class="ledger-table ${compact ? "compact" : ""}">
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Transaction</th>
          <th>Account</th>
          <th>Category</th>
          <th>Activity summary</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
            <tr>
              <td>${escapeHtml(row.dateLabel)}</td>
              <td>${escapeHtml(row.transactionId)}</td>
              <td><strong>${escapeHtml(row.accountNumber)}</strong><span>${escapeHtml(row.accountName)}</span></td>
              <td>${escapeHtml(row.category)}</td>
              <td>${escapeHtml(row.description)}</td>
              <td class="number ${row.presentationAmount < 0 ? "negative" : ""}">${fmtMoney(row.presentationAmount)}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>`;
}

function drilldown(rows) {
  const drillRows = byDrillTarget(rows).sort((a, b) => b.date - a.date).slice(0, 80);
  return `<section>
    <div class="section-title">
      <div>
        <h2>${escapeHtml(state.drillTarget?.label ?? "Transaction Drilldown")}</h2>
        <p>${byDrillTarget(rows).length} ledger lines tie to the current selection</p>
      </div>
      ${state.drillTarget ? `<button class="icon-button" data-clear-drill title="Clear drilldown">${icon("reset")}</button>` : ""}
    </div>
    ${ledgerTable(drillRows, true)}
  </section>`;
}

function insightPanel(rows) {
  const sets = comparisonSets(rows);
  const m = metrics(sets.current);
  const balanceMetrics = metrics(sets.cumulativeCurrent);
  const topExpense = groupSum(
    sets.current.filter((row) => row.category === "Expenses"),
    (row) => row.accountName
  )[0];
  const insights = [
    [
      "Margin posture",
      m.ebit < 0
        ? `Gross margin is ${pct.format(m.grossMargin)}, but opex is absorbing ${pct.format(m.opex / Math.max(m.revenue, 1))} of revenue.`
        : `The selected period is operating-profit positive with ${pct.format(m.ebitMargin)} operating margin.`
    ],
    ["Liquidity", `Current ratio is ${balanceMetrics.currentRatio.toFixed(2)} with working capital of ${fmtMoney(balanceMetrics.workingCapital)} through ${periodLabel(sets.currentMonth)}.`],
    [
      "Cost pressure",
      topExpense
        ? `${topExpense.name} is the largest expense account at ${fmtMoney(topExpense.value)}.`
        : "No expense activity exists in the current filter."
    ],
    ["Data note", "This pack is GL-based. AR ageing, supplier ageing, budgets, and cash conversion need invoice or planning data."]
  ];
  return `<section class="insights">
    <div class="section-title"><h2>${icon("shield")} CFO Readout</h2></div>
    ${insights.map(([label, text]) => `<div class="insight"><strong>${label}</strong><p>${escapeHtml(text)}</p></div>`).join("")}
  </section>`;
}

function enhancedStatementTable(lines, options = {}) {
  const denominator = options.denominator ?? 0;
  const percentLabel = options.percentLabel ?? "%";
  return `<div class="statement">
    <div class="statement-head ${denominator ? "with-percent" : ""}">
      <span>Line item</span>
      ${denominator ? `<span>${percentLabel}</span>` : ""}
      <span>Amount</span>
    </div>
    ${lines
      .map((line) => {
        const active = state.drillTarget?.label === line.label;
        const commonSize = denominator ? line.amount / denominator : 0;
        return `
          <button class="statement-row ${line.kind} ${active ? "active" : ""} ${denominator ? "with-percent" : ""}" data-statement='${escapeHtml(JSON.stringify(line))}' style="padding-left:${14 + line.level * 24}px">
            <span>${line.level > 0 ? "> " : ""}${escapeHtml(line.label)}</span>
            ${denominator ? `<em>${pct.format(commonSize)}</em>` : ""}
            <strong>${fmtMoney(line.amount)}</strong>
          </button>`;
      })
      .join("")}
  </div>`;
}

function comparativeStatementTable(lines, options = {}) {
  const sets = comparisonSets(applyFilters());
  const percentLabel = options.percentLabel ?? "%";
  const showPriorMonths = options.showPriorMonths ?? true;
  const tableClass = showPriorMonths ? (options.commonSize ? "" : "compact-columns") : "no-prior-months";
  return `<div class="statement-scroll">
    <div class="statement comparative-statement">
      <div class="statement-head comparative ${tableClass}">
        <span>Line item</span>
        <span>${escapeHtml(periodLabel(sets.currentMonth))}</span>
        <span>${escapeHtml(periodLabel(sets.priorYear))}</span>
        ${showPriorMonths ? `<span>${escapeHtml(periodLabel(sets.priorMonth))}</span>` : ""}
        ${showPriorMonths ? `<span>${escapeHtml(periodLabel(sets.secondPriorMonth))}</span>` : ""}
        <span>YoY variance</span>
        ${showPriorMonths ? "<span>MoM variance</span>" : ""}
        ${options.commonSize ? `<span>${escapeHtml(percentLabel)}</span>` : ""}
      </div>
      ${lines
        .map((line) => {
          const active = state.drillTarget?.label === line.label;
          return `
            <button class="statement-row comparative ${tableClass} ${line.kind} ${active ? "active" : ""}" data-statement='${escapeHtml(JSON.stringify(line))}' style="padding-left:${14 + line.level * 24}px">
              <span>${line.level > 0 ? "> " : ""}${escapeHtml(line.label)}</span>
              <strong>${fmtMoney(line.current)}</strong>
              <strong>${fmtMoney(line.priorYear)}</strong>
              ${showPriorMonths ? `<strong>${fmtMoney(line.priorMonth ?? 0)}</strong>` : ""}
              ${showPriorMonths ? `<strong>${fmtMoney(line.secondPriorMonth ?? 0)}</strong>` : ""}
              <strong class="${line.varianceYear < 0 ? "negative" : ""}">${fmtVariance(line.current, line.priorYear)}</strong>
              ${showPriorMonths ? `<strong class="${line.varianceMonth < 0 ? "negative" : ""}">${fmtVariance(line.current, line.priorMonth ?? 0)}</strong>` : ""}
              ${options.commonSize ? `<em>${pct.format(line.commonSize ?? 0)}</em>` : ""}
            </button>`;
        })
        .join("")}
    </div>
  </div>`;
}

function enhancedDrilldown(rows) {
  const allDrillRows = byDrillTarget(rows).sort((a, b) => b.date - a.date);
  const drillRows = allDrillRows.slice(0, 80);
  const total = allDrillRows.reduce((sum, row) => sum + row.presentationAmount, 0);
  const debits = allDrillRows.filter((row) => row.type === "Debit").reduce((sum, row) => sum + Math.abs(row.amount), 0);
  const credits = allDrillRows.filter((row) => row.type === "Credit").reduce((sum, row) => sum + Math.abs(row.amount), 0);
  const mix = groupSum(allDrillRows, (row) => row.accountName).slice(0, 4);
  return `<section>
    <div class="section-title">
      <div>
        <h2>${escapeHtml(state.drillTarget?.label ?? "Transaction Drilldown")}</h2>
        <p>${allDrillRows.length} report rows tie to the current selection</p>
      </div>
      <div class="inline-actions">
        ${state.drillTarget ? `<button class="download-button small" data-export-drill>${icon("download")} Download selection</button><button class="icon-button" data-clear-drill title="Clear drilldown">${icon("reset")}</button>` : ""}
      </div>
    </div>
    <div class="drill-summary">
      <div><span>Selected amount</span><strong>${fmtMoney(total)}</strong></div>
      <div><span>Debits</span><strong>${fmtMoney(debits)}</strong></div>
      <div><span>Credits</span><strong>${fmtMoney(credits)}</strong></div>
      <div><span>Accounts</span><strong>${new Set(allDrillRows.map((row) => row.accountNumber)).size}</strong></div>
    </div>
    ${mix.length ? `<div class="mini-mix">${mix.map((item) => `<span>${escapeHtml(item.name)} <strong>${fmtMoney(item.value)}</strong></span>`).join("")}</div>` : ""}
    ${ledgerTable(drillRows, true)}
  </section>`;
}

function profitBridge(rows) {
  const m = metrics(rows);
  const steps = [
    { label: "Revenue", value: m.revenue, color: COLORS.revenue, type: "positive", category: "Revenue" },
    { label: "COGS", value: -m.cogs, color: COLORS.expense, type: "negative", subcategory: "Cost of Goods Sold" },
    { label: "Gross Profit", value: m.grossProfit, color: COLORS.profit, type: "subtotal" },
    { label: "Opex", value: -m.opex, color: COLORS.loss, type: "negative", subcategory: "Operating Expenses" },
    { label: "Operating Result", value: m.ebit, color: m.ebit < 0 ? COLORS.loss : COLORS.profit, type: "subtotal" }
  ];
  const max = Math.max(1, ...steps.map((step) => Math.abs(step.value)));
  return `<section class="bridge-panel">
    <div class="section-title"><h2>${icon("bars")} Profit Bridge</h2><p>Revenue to operating result</p></div>
    <div class="bridge-flow">
      ${steps
        .map(
          (step, index) => `
          <button class="bridge-step ${step.type}" data-drill-category="${escapeHtml(step.category ?? "")}" data-drill-subcategory="${escapeHtml(step.subcategory ?? "")}" data-drill-label="${escapeHtml(step.label)}">
            <span>${escapeHtml(step.label)}</span>
            <strong class="${step.value < 0 ? "negative" : ""}">${fmtMoney(step.value)}</strong>
            <i><b style="width:${Math.max(10, (Math.abs(step.value) / max) * 100)}%; background:${step.color}"></b></i>
          </button>
          ${index < steps.length - 1 ? `<div class="bridge-operator">${steps[index + 1].type === "negative" ? "-" : "="}</div>` : ""}`
        )
        .join("")}
    </div>
  </section>`;
}

function exceptionCards(rows) {
  const items = cfoExceptions(rows);
  return `<section class="exceptions">
    <div class="section-title"><h2>${icon("shield")} CFO Exceptions</h2><p>${items.length || "No"} active flags</p></div>
    <div class="exception-grid">
      ${
        items.length
          ? items
              .map(
                (item) => `<button class="exception ${item.severity}" data-exception-view="${item.view}" data-exception-account="${escapeHtml(item.accountNumber ?? "")}">
                  <span>${escapeHtml(item.severity)}</span>
                  <strong>${escapeHtml(item.title)}</strong>
                  <p>${escapeHtml(item.text)}</p>
                </button>`
              )
              .join("")
          : `<div class="empty">No exception rules are triggered for the current selection.</div>`
      }
    </div>
  </section>`;
}

function varianceCards(rows) {
  const variance = monthlyVariance(rows);
  const cards = [
    ["Best revenue month", monthLabel(variance.bestRevenue?.month), variance.bestRevenue ? fmtMoney(variance.bestRevenue.revenue) : "n/a", COLORS.revenue],
    ["Worst EBIT month", monthLabel(variance.worstEbit?.month), variance.worstEbit ? fmtMoney(variance.worstEbit.ebit) : "n/a", COLORS.loss],
    ["Revenue run-rate", fmtMoney(variance.revenueRunRate), `MoM ${fmtMoney(variance.revenueMoM)}`, COLORS.revenue],
    ["EBIT volatility", fmtMoney(variance.ebitSpread), `MoM ${fmtMoney(variance.ebitMoM)}`, COLORS.loss]
  ];
  return `<section class="variance-panel">
    <div class="section-title"><h2>${icon("activity")} Monthly Variance</h2><p>Run-rate and volatility</p></div>
    <div class="variance-grid">
      ${cards.map(([label, value, meta, color]) => `<article class="variance-card" style="border-left-color:${color}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(meta)}</small></article>`).join("")}
    </div>
  </section>`;
}

function comparativeKpis(rows) {
  const sets = comparisonSets(rows);
  const current = metrics(sets.current);
  const priorYear = metrics(sets.priorYearRows);
  const priorMonth = metrics(sets.priorMonthRows);
  const currentCash = lineAmount(cashFlowRows(sets.current), "cf-net-movement");
  const priorCash = lineAmount(cashFlowRows(sets.priorYearRows), "cf-net-movement");
  const cards = [
    ["Revenue YoY", fmtVariance(current.revenue, priorYear.revenue), `${periodLabel(sets.currentMonth)} vs ${periodLabel(sets.priorYear)}`, current.revenue >= priorYear.revenue ? "good" : "warn"],
    ["Operating Result YoY", fmtVariance(current.ebit, priorYear.ebit), "same month prior year", current.ebit >= priorYear.ebit ? "good" : "bad"],
    ["Revenue MoM", fmtVariance(current.revenue, priorMonth.revenue), `${periodLabel(sets.priorMonth)} comparison`, current.revenue >= priorMonth.revenue ? "good" : "warn"],
    ["Cash Movement YoY", fmtVariance(currentCash, priorCash), "cash flow movement", currentCash >= priorCash ? "good" : "warn"]
  ];
  return `<section class="comparative-kpis">
    ${cards.map(([label, value, meta, tone]) => kpi(label, value, meta, tone)).join("")}
  </section>`;
}

function overview(rows) {
  const sets = comparisonSets(rows);
  const m = metrics(sets.current);
  const balanceMetrics = metrics(sets.cumulativeCurrent);
  const mix = groupSum(sets.current, (row) => row.category);
  return `${pageNarrative("overview", rows)}
  ${comparativeKpis(rows)}
  ${exceptionCards(rows)}
  <div class="grid">
    <section class="chart">
      <div class="section-title"><h2>${icon("line")} Performance Trend</h2></div>
      ${lineChart(monthlySeries(rows))}
    </section>
    <section class="chart">
      <div class="section-title"><h2>${icon("bars")} Statement Mix</h2></div>
      ${pieChart(mix, "category")}
    </section>
    ${profitBridge(sets.current)}
    ${varianceCards(rows)}
    <section>
      <div class="ratio-strip">
        <div><span>Gross Margin</span><strong>${pct.format(m.grossMargin)}</strong></div>
        <div><span>Operating Margin</span><strong class="${m.ebit < 0 ? "negative" : ""}">${pct.format(m.ebitMargin)}</strong></div>
        <div><span>Current Ratio</span><strong>${balanceMetrics.currentRatio.toFixed(2)}</strong></div>
        <div><span>Debt / Equity</span><strong>${balanceMetrics.debtToEquity.toFixed(2)}</strong></div>
      </div>
    </section>
    ${insightPanel(rows)}
    ${reconciliationPanel()}
  </div>`;
}

function pnlView(rows) {
  const sets = comparisonSets(rows);
  const currentMetrics = metrics(sets.current);
  return `${pageNarrative("pnl", rows)}
  <div class="split">
    <section>
      <div class="section-title"><h2>${icon("receipt")} Comparative Income Statement</h2><p>${periodLabel(sets.currentMonth)} vs prior periods</p><button class="download-button small" data-export-statement="pnl">${icon("download")} Export</button></div>
      ${comparativeStatementTable(comparativeLines(buildPnl, rows, { denominator: currentMetrics.revenue }), { commonSize: true, percentLabel: "% revenue" })}
    </section>
    ${enhancedDrilldown(rows)}
  </div>
  ${profitBridge(sets.current)}`;
}

function balanceView(rows) {
  const sets = comparisonSets(rows);
  const m = metrics(sets.cumulativeCurrent);
  const data = [
    { name: "Assets", value: m.assets },
    { name: "Liabilities", value: m.liabilities },
    { name: "Equity", value: m.equity }
  ];
  return `${pageNarrative("balance", rows)}
  <div class="split">
    <section>
      <div class="section-title"><h2>${icon("landmark")} Comparative Balance Sheet</h2><p>Cumulative through ${periodLabel(sets.currentMonth)}</p><button class="download-button small" data-export-statement="balance">${icon("download")} Export</button></div>
      ${comparativeStatementTable(comparativeBalanceLines(rows), { commonSize: true, percentLabel: "% assets", showPriorMonths: false })}
    </section>
    <section class="chart">
      <div class="section-title"><h2>${icon("bars")} Capital Structure</h2></div>
      ${barChart(data, { label: "Capital structure", left: 120 })}
    </section>
  </div>
  ${enhancedDrilldown(rows)}`;
}

function cashFlowView(rows) {
  const sets = comparisonSets(rows);
  return `${pageNarrative("cashflow", rows)}
  <div class="split">
    <section>
      <div class="section-title"><h2>${icon("wallet")} Comparative Cash Flow</h2><p>${periodLabel(sets.currentMonth)} cash movement</p><button class="download-button small" data-export-statement="cashflow">${icon("download")} Export</button></div>
      ${comparativeStatementTable(comparativeCashFlowLines(rows), { showPriorMonths: true })}
    </section>
    ${enhancedDrilldown(rows)}
  </div>
  <section class="insights">
    <div class="section-title"><h2>${icon("shield")} Cash Flow Basis</h2></div>
    <div class="insight"><strong>Classification</strong><p>Uses optional CashFlowSection and CashFlowLine columns where present, with inferred lines for older chart-of-account files.</p></div>
    <div class="insight"><strong>Reconciliation</strong><p>Opening cash plus net cash movement should equal closing cash for the selected period.</p></div>
  </section>`;
}

function cashView(rows) {
  const sets = comparisonSets(rows);
  const m = metrics(sets.cumulativeCurrent);
  const cashSeries = monthlySeries(rows).map((row) => ({ name: row.month, value: row.cash }));
  const variance = monthlyVariance(rows);
  return `${pageNarrative("cash", rows)}
  <div class="grid">
    <section class="chart">
      <div class="section-title"><h2>${icon("wallet")} Cash And Working Capital</h2></div>
      ${barChart(cashSeries, { label: "Cash by month", left: 90, minHeight: 300, colorFn: () => COLORS.cash })}
    </section>
    <section class="insights">
      <div class="section-title"><h2>${icon("dollar")} Liquidity Snapshot</h2></div>
      <div class="insight"><strong>Cash proxy</strong><p>${fmtMoney(m.cash)} based on accounts tagged Cash & Cash Equivalents.</p></div>
      <div class="insight"><strong>Working capital</strong><p>${fmtMoney(m.workingCapital)} after comparing current assets with current liabilities.</p></div>
      <div class="insight"><strong>Run-rate</strong><p>Revenue run-rate is ${fmtMoney(variance.revenueRunRate)} against opex run-rate of ${fmtMoney(variance.opexRunRate)}.</p></div>
      <div class="insight"><strong>Reporting caveat</strong><p>A formal cash flow statement needs opening balances and cash-flow classifications.</p></div>
    </section>
  </div>`;
}

function ratiosView(rows) {
  const sets = comparisonSets(rows);
  const m = metrics(sets.current);
  const balanceMetrics = metrics(sets.cumulativeCurrent);
  const ratios = [
    ["Gross Margin", pct.format(m.grossMargin)],
    ["Operating Margin", pct.format(m.ebitMargin)],
    ["COGS / Revenue", pct.format(m.cogs / Math.max(m.revenue, 1))],
    ["Opex / Revenue", pct.format(m.opex / Math.max(m.revenue, 1))],
    ["Current Ratio", balanceMetrics.currentRatio.toFixed(2)],
    ["Debt / Equity", balanceMetrics.debtToEquity.toFixed(2)]
  ];
  return `${pageNarrative("ratios", rows)}
  <section>
    <div class="section-title"><h2>${icon("activity")} Ratio Board</h2></div>
    <div class="ratio-grid">
      ${ratios
        .map(
          ([label, value], index) =>
            `<button class="ratio-tile"><span>${label}</span><strong class="${label === "Operating Margin" && m.ebit < 0 ? "negative" : ""}">${value}</strong><i style="background:${semanticColor(label, index)}"></i></button>`
        )
        .join("")}
    </div>
  </section>`;
}

function expensesView(rows) {
  const expenses = groupSum(
    rows.filter((row) => row.category === "Expenses"),
    (row) => row.accountName
  );
  const departments = groupSum(
    rows.filter((row) => row.category === "Expenses"),
    (row) => row.department
  );
  return `${pageNarrative("expenses", rows)}
  <div class="grid">
    <section class="chart">
      <div class="section-title"><h2>${icon("factory")} Expense Accounts</h2></div>
      ${barChart(expenses, {
        label: "Expense accounts",
        colorFn: () => COLORS.expense,
        accountLookup: (name) => rows.find((row) => row.accountName === name)?.accountNumber ?? ""
      })}
    </section>
    <section class="chart">
      <div class="section-title"><h2>${icon("bars")} Department Spend</h2></div>
      ${pieChart(departments, "department")}
    </section>
  </div>`;
}

function ledgerView(rows) {
  return `${pageNarrative("ledger", rows)}
  ${reconciliationPanel()}
  <section>
    <div class="section-title"><h2>${icon("book")} General Ledger Explorer</h2></div>
    ${ledgerTable(rows.sort((a, b) => b.date - a.date))}
  </section>`;
}

function emptyState() {
  return `<main>
    <section class="empty-report">
      <strong>Upload CSVs to generate the financial statements</strong>
      <p>No report data is loaded yet. Select your chart of accounts and transactions CSV files to generate the dashboard.</p>
      ${state.uploadError ? `<p class="upload-error">${escapeHtml(state.uploadError)}</p>` : ""}
      ${state.uploadNotice ? `<p class="upload-notice">${escapeHtml(state.uploadNotice)}</p>` : ""}
      <div class="empty-upload-grid">
        ${uploadPicker("accounts", "Chart of Accounts CSV")}
        ${uploadPicker("transactions", "Transactions CSV")}
      </div>
      <div class="empty-actions">
        <button class="download-button" data-refresh-from-upload>Generate report</button>
      </div>
      <div class="empty-steps">
        <div><span>1</span><p>Choose the Chart of Accounts CSV and Transactions CSV in either order.</p></div>
        <div><span>2</span><p>Generate the report in the browser after both files are selected.</p></div>
        <div><span>3</span><p>Generate the report. Uploaded data is processed only on this page.</p></div>
      </div>
    </section>
  </main>`;
}

function body(rows) {
  if (!state.dataLoaded) return emptyState();
  ensureReportingPeriod();
  const sets = comparisonSets(rows);
  const m = metrics(sets.current);
  const checks = integrityChecks();
  const content = {
    overview: overview,
    pnl: pnlView,
    balance: balanceView,
    cashflow: cashFlowView,
    cash: cashView,
    ratios: ratiosView,
    expenses: expensesView,
    ledger: ledgerView
  }[state.view](rows);

  return `<main>
    <section class="kpis">
      ${kpi("Revenue", fmtMoney(m.revenue), `${m.transactions} journal entries`, "good")}
      ${kpi("Gross Profit", fmtMoney(m.grossProfit), `${pct.format(m.grossMargin)} gross margin`, "neutral")}
      ${kpi("Operating Result", fmtMoney(m.ebit), `${pct.format(m.ebitMargin)} operating margin`, m.ebit >= 0 ? "good" : "bad")}
      ${kpi("Current Ratio", metrics(sets.cumulativeCurrent).currentRatio.toFixed(2), `${fmtMoney(metrics(sets.cumulativeCurrent).workingCapital)} working capital`, metrics(sets.cumulativeCurrent).currentRatio >= 1.2 ? "good" : "warn")}
    </section>
    <section class="quality">
      <span>Integrity</span>
      <strong>${checks.balanced}/${checks.totalTransactions}</strong> balanced entries
      <strong>${checks.usedAccounts}</strong> active accounts
      <strong>${checks.lines}</strong> transaction lines
      ${state.controls ? `<strong>${checks.publishedLines}</strong> report rows` : ""}
      <button class="download-button" data-export>${icon("download")} Download filtered ledger</button>
    </section>
    ${content}
  </main>`;
}

function render() {
  const rows = applyFilters();
  app.innerHTML = `${header()}${body(rows)}`;
  bindEvents();
}

function updateFilter(id, value, checked) {
  const selected = state.filters[id];
  state.filters[id] = checked ? [...selected, value] : selected.filter((item) => item !== value);
  state.drillTarget = null;
  render();
}

function setDrill(target) {
  state.drillTarget = state.drillTarget?.label === target.label ? null : target;
  render();
}

function exportLedger() {
  downloadRows(applyFilters(), "fs-report-filtered-ledger.csv");
}

function exportDrilldown() {
  downloadRows(byDrillTarget(applyFilters()), "fs-report-selected-drilldown.csv");
}

function exportComparativeStatement(kind) {
  const rows = applyFilters();
  const statementRows =
    kind === "balance" ? comparativeBalanceLines(rows) :
    kind === "cashflow" ? comparativeCashFlowLines(rows) :
    comparativeLines(buildPnl, rows, { denominator: metrics(comparisonSets(rows).current).revenue });
  downloadStatementRows(statementRows, `fs-report-comparative-${kind}.csv`);
}

function downloadJson(data, filename) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function currentReportData() {
  return {
    generatedAt: new Date().toISOString(),
    privacy: {
      mode: state.dataMode,
      grain: "month-account-type",
      rawCsvFilesRequiredOnline: false,
      notes: [
        "Raw transaction IDs are replaced with synthetic summary IDs.",
        "Original transaction descriptions are not published.",
        "Ledger lines are summarized by month, account, and debit/credit type."
      ]
    },
    controls: state.controls,
    accounts: state.accounts,
    ledger: state.ledger.map((row) => ({
      transactionId: row.transactionId,
      dateLabel: row.dateLabel,
      month: row.month,
      accountNumber: row.accountNumber,
      type: row.type,
      amount: row.amount,
      description: row.description,
      cashFlowSection: row.cashFlowSection,
      cashFlowLine: row.cashFlowLine,
      sourceLineCount: row.sourceLineCount ?? 1
    }))
  };
}

async function readUpload(input, requestedKind) {
  const file = input.files?.[0];
  if (!file) return;
  const raw = await file.text();
  const detectedKind = detectCsvKind(raw);
  if (!detectedKind) {
    throw new Error(`${file.name} does not look like a Chart of Accounts CSV or Transactions CSV.`);
  }
  if (detectedKind === "accounts") {
    state.uploadedFiles.accountsRaw = raw;
    state.uploadedFiles.accountsName = file.name;
  } else {
    state.uploadedFiles.transactionsRaw = raw;
    state.uploadedFiles.transactionsName = file.name;
  }
  state.uploadNotice =
    detectedKind === requestedKind
      ? ""
      : `${file.name} looks like the ${csvKindLabel(detectedKind)}, so it was placed in the correct slot.`;
}

async function refreshFromUpload() {
  try {
    state.uploadError = "";
    state.uploadNotice = "";
    const accountsRaw = state.uploadedFiles.accountsRaw;
    const transactionsRaw = state.uploadedFiles.transactionsRaw;
    if (!accountsRaw || !transactionsRaw) {
      const missing = [];
      if (!accountsRaw) missing.push("Chart of Accounts CSV");
      if (!transactionsRaw) missing.push("Transactions CSV");
      throw new Error(`Please choose ${missing.join(" and ")} before generating the report.`);
    }
    const reportData = buildReportDataFromCsv(accountsRaw, transactionsRaw);
    loadReportData(reportData);
    resetViewState();
    state.uploadOpen = false;
    render();
  } catch (error) {
    state.uploadError = error.message;
    state.uploadOpen = true;
    render();
  }
}

function downloadRows(rows, filename) {
  const headers = ["Date", "ReportRowID", "AccountNumber", "AccountName", "Category", "ActivitySummary", "Amount"];
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      [row.dateLabel, row.transactionId, row.accountNumber, row.accountName, row.category, row.description, row.presentationAmount]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(",")
    )
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadStatementRows(rows, filename) {
  const sets = comparisonSets(applyFilters());
  const headers = [
    "LineItem",
    periodLabel(sets.currentMonth),
    periodLabel(sets.priorYear),
    periodLabel(sets.priorMonth),
    periodLabel(sets.secondPriorMonth),
    "VarianceVsPriorYear",
    "VarianceVsPriorMonth",
    "CommonSize"
  ];
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.label,
        row.current ?? row.amount ?? 0,
        row.priorYear ?? 0,
        row.priorMonth ?? "",
        row.secondPriorMonth ?? "",
        row.varianceYear ?? "",
        row.varianceMonth ?? "",
        row.commonSize ?? ""
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(",")
    )
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  document.querySelector("[data-home]")?.addEventListener("click", returnHome);
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.drillTarget = null;
      render();
    });
  });
  document.querySelector("[data-search]")?.addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    state.drillTarget = null;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(render, 220);
  });
  document.querySelector("[data-report-period]")?.addEventListener("change", (event) => {
    state.reporting.period = event.target.value;
    state.drillTarget = null;
    render();
  });
  document.querySelector("[data-comparison-mode]")?.addEventListener("change", (event) => {
    state.reporting.comparisonMode = event.target.value;
    state.drillTarget = null;
    render();
  });
  document.querySelectorAll("[data-open-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.openFilter = state.openFilter === button.dataset.openFilter ? null : button.dataset.openFilter;
      render();
    });
  });
  document.querySelectorAll("[data-filter]").forEach((input) => {
    input.addEventListener("change", () => updateFilter(input.dataset.filter, input.value, input.checked));
  });
  document.querySelectorAll("[data-clear-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filters[button.dataset.clearFilter] = [];
      render();
    });
  });
  document.querySelector("[data-reset]")?.addEventListener("click", () => {
    state.filters = { months: [], categories: [], departments: [], regions: [], search: "" };
    state.openFilter = null;
    state.drillTarget = null;
    render();
  });
  document.querySelector("[data-upload-toggle]")?.addEventListener("click", () => {
    if (state.uploadOpen) {
      state.uploadOpen = false;
      render();
    } else {
      focusUploadPanel(false);
    }
  });
  document.querySelectorAll("[data-coa-file]").forEach((input) => input.addEventListener("change", async (event) => {
    try {
      await readUpload(event.target, "accounts");
      state.uploadError = "";
    } catch (error) {
      state.uploadError = error.message;
      state.uploadNotice = "";
    }
    render();
  }));
  document.querySelectorAll("[data-transactions-file]").forEach((input) => input.addEventListener("change", async (event) => {
    try {
      await readUpload(event.target, "transactions");
      state.uploadError = "";
    } catch (error) {
      state.uploadError = error.message;
      state.uploadNotice = "";
    }
    render();
  }));
  document.querySelectorAll("[data-refresh-from-upload]").forEach((button) => {
    button.addEventListener("click", refreshFromUpload);
  });
  document.querySelector("[data-export-report-data]")?.addEventListener("click", () => downloadJson(currentReportData(), "report-data.json"));
  document.querySelector("[data-clear-search]")?.addEventListener("click", () => {
    state.filters.search = "";
    state.drillTarget = null;
    render();
  });
  document.querySelectorAll("[data-remove-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.removeFilter;
      state.filters[id] = state.filters[id].filter((value) => value !== button.dataset.filterValue);
      state.drillTarget = null;
      render();
    });
  });
  document.querySelectorAll("[data-statement]").forEach((button) => {
    button.addEventListener("click", () => {
      const line = JSON.parse(button.dataset.statement);
      setDrill({
        label: line.label,
        category: line.category,
        subcategory: line.subcategory,
        detailGroup: line.detailGroup,
        accountNumber: line.accountNumber,
        cashFlowSection: line.cashFlowSection,
        cashFlowLine: line.cashFlowLine,
        month: state.reporting.period
      });
    });
  });
  document.querySelectorAll("[data-drill-category]").forEach((node) => {
    node.addEventListener("click", () => {
      if (!node.dataset.drillCategory) return;
      setDrill({ label: node.dataset.drillLabel, category: node.dataset.drillCategory });
    });
  });
  document.querySelectorAll("[data-drill-subcategory]").forEach((node) => {
    node.addEventListener("click", () => {
      if (!node.dataset.drillSubcategory) return;
      setDrill({ label: node.dataset.drillLabel, subcategory: node.dataset.drillSubcategory });
    });
  });
  document.querySelectorAll("[data-drill-department]").forEach((node) => {
    node.addEventListener("click", () => {
      state.filters.departments = [node.dataset.drillDepartment];
      state.view = "expenses";
      render();
    });
  });
  document.querySelectorAll("[data-drill-account]").forEach((node) => {
    node.addEventListener("click", () => {
      if (!node.dataset.drillAccount) return;
      setDrill({ label: node.dataset.drillLabel, accountNumber: node.dataset.drillAccount });
    });
  });
  document.querySelector("[data-clear-drill]")?.addEventListener("click", () => {
    state.drillTarget = null;
    render();
  });
  document.querySelector("[data-export]")?.addEventListener("click", exportLedger);
  document.querySelector("[data-export-drill]")?.addEventListener("click", exportDrilldown);
  document.querySelectorAll("[data-export-statement]").forEach((button) => {
    button.addEventListener("click", () => exportComparativeStatement(button.dataset.exportStatement));
  });
  document.querySelectorAll("[data-exception-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.exceptionView;
      const accountNumber = button.dataset.exceptionAccount;
      state.drillTarget = accountNumber ? { label: "Exception evidence", accountNumber } : null;
      render();
    });
  });
}

async function init() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "1") {
      const reportResponse = await fetch("./report-data.json", { cache: "no-store" });
      if (!reportResponse.ok) throw new Error("Demo report-data.json was not found.");
      loadReportData(await reportResponse.json());
    } else if (window.location.protocol === "file:") {
      state.uploadError = "Open this app through the local server or deployment URL before uploading CSVs.";
    }
    render();
  } catch (error) {
    app.innerHTML = `<main><section><h1>Unable to load finance data</h1><p>${escapeHtml(error.message)}</p></section></main>`;
  }
}

init();
