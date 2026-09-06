import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const outRoot = "sample-data";
const setOne = `${outRoot}/01-two-year-saas-growth`;
const setTwo = `${outRoot}/02-three-year-expansion-cycle`;

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

const quote = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const toCsv = (headers, rows) =>
  [headers.join(","), ...rows.map((row) => headers.map((header) => quote(row[header])).join(","))].join("\n") + "\n";

const parseDate = (value) => {
  const [day, month, year] = value.split("/").map(Number);
  return new Date(year, month - 1, day);
};

const formatDate = (date) =>
  `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;

const round = (value) => Math.round(value * 100) / 100;

const csv = (headers, rows) =>
  [headers.join(","), ...rows.map((row) => headers.map((header) => quote(row[header])).join(","))].join("\n") + "\n";

const inferCashFlow = (account) => {
  const text = `${account.AccountName} ${account.Subcategory_L2} ${account.DetailGroup_L3}`.toLowerCase();
  const section =
    account.DetailGroup_L3 === "Cash & Cash Equivalents" ? "Cash" :
    text.includes("depreciation") || text.includes("amortization") ? "NonCash" :
    text.includes("capitalized") || text.includes("equipment") || text.includes("fixtures") || text.includes("development") ? "Investing" :
    text.includes("loan") || text.includes("borrow") || account.Category_L1 === "Equity" ? "Financing" :
    "Operating";
  const line =
    account.DetailGroup_L3 === "Cash & Cash Equivalents" ? "Cash accounts" :
    account.Category_L1 === "Revenue" ? "Customer receipts and revenue activity" :
    text.includes("payroll") || text.includes("salaries") ? "Payroll and people costs" :
    text.includes("tax") ? "Tax payments and accruals" :
    text.includes("interest") ? "Interest paid or received" :
    text.includes("inventory") ? "Inventory and supplier payments" :
    text.includes("capitalized") || text.includes("development") ? "Capitalized development" :
    text.includes("equipment") || text.includes("fixtures") ? "Capital expenditure" :
    text.includes("loan") || text.includes("borrow") ? "Loan proceeds and repayments" :
    account.Category_L1 === "Equity" ? "Equity financing" :
    account.Category_L1 === "Expenses" ? "Operating supplier payments" :
    "Working capital movement";
  return { section, line };
};

const enrichAccounts = (accounts) =>
  accounts.map((account) => {
    const cashFlow = inferCashFlow(account);
    return {
      ...account,
      CashFlowSection: account.CashFlowSection || cashFlow.section,
      CashFlowLine: account.CashFlowLine || cashFlow.line,
      NormalBalance: account.NormalBalance || (["Revenue", "Liabilities", "Equity"].includes(account.Category_L1) ? "Credit" : "Debit")
    };
  });

const cloneJournal = (rows, yearDelta, scale, prefix) => {
  const transformed = [];
  let running = 0;

  rows.forEach((row, index) => {
    const date = parseDate(row.Date);
    date.setFullYear(date.getFullYear() + yearDelta);
    const isLast = index === rows.length - 1;
    const amount = isLast ? round(-running) : round(Number(row.Amount) * scale);
    running += amount;
    transformed.push({
      ...row,
      TransactionID: `${prefix}-${row.TransactionID}`,
      Date: formatDate(date),
      Description: row.Description.replace("Monthly", `${date.getFullYear()} monthly`),
      Amount: amount.toFixed(2),
      Type: amount >= 0 ? "Debit" : "Credit"
    });
  });

  return transformed;
};

const makeTwoYearRows = (rows) => {
  const byTransaction = new Map();
  rows.forEach((row) => {
    const date = parseDate(row.Date);
    const current = byTransaction.get(row.TransactionID) ?? [];
    current.push({ ...row, Date: formatDate(new Date(2025, date.getMonth(), date.getDate())) });
    byTransaction.set(row.TransactionID, current);
  });

  const rows2025 = Array.from(byTransaction.values()).flat();
  const rows2026 = Array.from(byTransaction.values()).flatMap((journalRows) => cloneJournal(journalRows, 1, 1.16, "FY26"));
  return [...rows2025, ...rows2026].sort((a, b) => parseDate(a.Date) - parseDate(b.Date) || a.TransactionID.localeCompare(b.TransactionID));
};

const makeThreeYearExpansionRows = (rows) => {
  const byTransaction = new Map();
  rows.forEach((row) => {
    const current = byTransaction.get(row.TransactionID) ?? [];
    current.push(row);
    byTransaction.set(row.TransactionID, current);
  });

  const cloned2024 = Array.from(byTransaction.values()).flatMap((journalRows) => cloneJournal(journalRows, -1, 0.82, "FY24"));
  const cloned2026 = Array.from(byTransaction.values()).flatMap((journalRows) => cloneJournal(journalRows, 1, 1.28, "FY26X"));
  return [...cloned2024, ...rows, ...cloned2026]
    .sort((a, b) => parseDate(a.Date) - parseDate(b.Date) || a.TransactionID.localeCompare(b.TransactionID));
};

const writeReadme = async (dir, title, coverage, notes) => {
  await writeFile(`${dir}/README.md`, `# ${title}

## Files

- \`ChartOfAccounts.csv\`
- \`Transactions.csv\`
- \`report-data.json\`

## Period Coverage

${coverage}

## Testing Notes

${notes.map((note) => `- ${note}`).join("\n")}
`);
};

const accountHeaders = [
  "AccountKey",
  "AccountNumber",
  "AccountName",
  "Category_L1",
  "Subcategory_L2",
  "DetailGroup_L3",
  "Region",
  "Department",
  "CashFlowSection",
  "CashFlowLine",
  "NormalBalance"
];
const transactionHeaders = ["TransactionID", "Date", "AccountNumber", "Description", "Amount", "Type"];

const accounts = enrichAccounts(parseObjects(await readFile("ChartOfAccounts.csv", "utf8")));
const transactions = parseObjects(await readFile("Transactions.csv", "utf8"));

await mkdir(setOne, { recursive: true });
await mkdir(setTwo, { recursive: true });

await writeFile(`${setOne}/ChartOfAccounts.csv`, csv(accountHeaders, accounts));
await writeFile(`${setOne}/Transactions.csv`, toCsv(transactionHeaders, makeTwoYearRows(transactions)));
await execFileAsync("node", ["scripts/generate-report-data.js", `${setOne}/ChartOfAccounts.csv`, `${setOne}/Transactions.csv`, `${setOne}/report-data.json`]);
await writeReadme(setOne, "Sample Set 01 - Two Year SaaS Growth", "January 2025 through December 2026.", [
  "Designed for prior-year, prior-month, and second-prior-month comparison testing.",
  "Includes cash-flow classification columns in the chart of accounts.",
  "Use December 2026 to test November 2026 and October 2026 comparison columns."
]);

await writeFile(`${setTwo}/ChartOfAccounts.csv`, csv(accountHeaders, accounts));
await writeFile(`${setTwo}/Transactions.csv`, toCsv(transactionHeaders, makeThreeYearExpansionRows(transactions)));
await execFileAsync("node", ["scripts/generate-report-data.js", `${setTwo}/ChartOfAccounts.csv`, `${setTwo}/Transactions.csv`, `${setTwo}/report-data.json`]);
await writeReadme(setTwo, "Sample Set 02 - Three Year Expansion Cycle", "January 2024 through December 2026.", [
  "Designed for longer comparative testing and cumulative balance sheet checks.",
  "Includes a scaled 2024 baseline, full 2025 actual-style data, and 2026 expansion-cycle data.",
  "Useful for testing prior-year comparison across 2025 and 2026 selected months."
]);

console.log(`Generated sample file sets in ${outRoot}/`);
