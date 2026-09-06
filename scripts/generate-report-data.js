import { readFile, writeFile } from "node:fs/promises";

const parseCsv = (raw) => {
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
};

const parseObjects = (raw) => {
  const [headers, ...rows] = parseCsv(raw);
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
};

const parseDate = (value) => {
  const [day, month, year] = value.split("/").map(Number);
  return new Date(year, month - 1, day);
};

const monthStartLabel = (month) => `01/${month.slice(5, 7)}/${month.slice(0, 4)}`;
const readableMonth = (month) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

const inferCashFlowSection = (account) => {
  const text = `${account.accountName} ${account.subcategory} ${account.detailGroup}`.toLowerCase();
  if (account.detailGroup === "Cash & Cash Equivalents") return "Cash";
  if (text.includes("depreciation") || text.includes("amortization")) return "NonCash";
  if (text.includes("capitalized") || text.includes("equipment") || text.includes("fixtures") || text.includes("development")) return "Investing";
  if (text.includes("loan") || text.includes("borrow") || account.category === "Equity") return "Financing";
  return "Operating";
};

const inferCashFlowLine = (account) => {
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
};

const normalizeAccount = (row) => {
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
};

const [accountsPath = "ChartOfAccounts.csv", transactionsPath = "Transactions.csv", outputPath = "report-data.json"] = process.argv.slice(2);
const accountsRaw = await readFile(accountsPath, "utf8");
const transactionsRaw = await readFile(transactionsPath, "utf8");

const accounts = parseObjects(accountsRaw).map(normalizeAccount);

const accountMap = new Map(accounts.map((account) => [account.accountNumber, account]));
const transactionRows = parseObjects(transactionsRaw);
const sourceLedger = transactionRows.map((row) => {
  const account = accountMap.get(row.AccountNumber);
  if (!account) throw new Error(`Missing account ${row.AccountNumber}`);
  const date = parseDate(row.Date);
  const amount = Number(row.Amount);
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

const reportData = {
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
    firstDate: dates[0].toISOString().slice(0, 10),
    lastDate: dates[dates.length - 1].toISOString().slice(0, 10)
  },
  accounts: activeAccounts,
  ledger: summarizedLedger
};

await writeFile(outputPath, `${JSON.stringify(reportData, null, 2)}\n`);
console.log(`Generated ${outputPath} with ${summarizedLedger.length} summarized ledger rows from ${sourceLedger.length} source rows.`);
