import { PdfDocument } from "./pdfWriter.js";

export const SAMPLE_DOCUMENTS = [
  {
    id: "routes",
    name: "Route exceptions.pdf",
    findings: [
      "Route R-104: two stops delayed by road congestion.",
      "Route R-118: dispatch suggested a driver check-in before rerouting.",
      "Route R-126: scheduled delivery completed.",
    ],
    entries: [
      { route: "R-104", invoice: 28500, fuel: 6100, paid: false },
      { route: "R-118", invoice: 23400, fuel: 5300, paid: true },
      { route: "R-126", invoice: 18100, fuel: 3900, paid: true },
    ],
  },
  {
    id: "safety",
    name: "Driver safety notes.pdf",
    findings: [
      "Driver D-042: a fatigue alert requires an operator review.",
      "No automated safety intervention is recorded in this sample.",
    ],
    entries: [
      { route: "R-104", driver: 4800 },
      { route: "R-118", driver: 4600 },
      { route: "R-126", driver: 3400 },
    ],
  },
  {
    id: "suppliers",
    name: "Supplier follow-ups.pdf",
    findings: [
      "Supplier S-021: delivery window confirmation is pending.",
      "Supplier S-034: revised arrival estimate should be reviewed.",
    ],
    entries: [
      { route: "R-104", supplier: 2200, paid: false },
      { route: "R-118", supplier: 1800, paid: false },
      { route: "R-126", supplier: 1200, paid: false },
    ],
  },
];

const COLORS = {
  ink: "#172026",
  muted: "#647079",
  rule: "#DEE4E5",
  pale: "#F5F7F7",
  teal: "#0C7773",
  revenue: "#61A9BD",
  costs: "#CED14E",
};

const formatNumber = (value) => new Intl.NumberFormat("en-US").format(value);
const money = (value) => `ZAR ${formatNumber(value)}`;
const shortMoney = (value) => `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
const sum = (values) => values.reduce((total, value) => total + value, 0);

function entryLines(document) {
  if (document.id === "routes") return document.entries.map(({ route, invoice, fuel, paid }) =>
    `${route}: invoiced ${money(invoice)} (${paid ? "paid" : "open"}); fuel ${money(fuel)}.`
  );
  if (document.id === "safety") return document.entries.map(({ route, driver }) =>
    `${route}: driver cost ${money(driver)}.`
  );
  if (document.id === "suppliers") return document.entries.map(({ route, supplier, paid }) =>
    `${route}: supplier charge ${money(supplier)} (${paid ? "paid" : "unpaid"}).`
  );
  throw new Error("Unknown sample document.");
}

function ledgerFromDocuments(documents) {
  const [routes, safety, suppliers] = ["routes", "safety", "suppliers"].map((id) => {
    const document = documents.find((item) => item.id === id);
    if (!Array.isArray(document?.entries)) throw new Error(`Missing ${id} sample PDF records.`);
    return document.entries;
  });
  return routes.map(({ route, invoice, fuel, paid }) => {
    const driver = safety.find((item) => item.route === route)?.driver;
    const vendor = suppliers.find((item) => item.route === route);
    if (![invoice, fuel, driver, vendor?.supplier].every(Number.isFinite) || !vendor) {
      throw new Error(`Incomplete sample accounting for ${route}.`);
    }
    const cost = fuel + driver + vendor.supplier;
    return { route, invoice, fuel, driver, supplier: vendor.supplier, cost, contribution: invoice - cost, paid, supplierPaid: vendor.paid };
  });
}

function pageFooter(page, number, note) {
  page.line(48, 720, 564, 720, COLORS.rule);
  page.text(note, 48, 735, { size: 8, color: COLORS.muted });
  page.text(`${number} / 2`, 530, 735, { size: 8, color: COLORS.muted });
}

function drawKpi(page, index, label, value, valueColor = COLORS.ink) {
  const x = 48 + index * 131;
  page.rect(x, 185, 122, 72, COLORS.pale);
  page.text(label, x + 11, 199, { size: 8.3, color: COLORS.muted, bold: true });
  page.text(value, x + 11, 221, { size: 15.2, color: valueColor, bold: true });
}

function drawRouteChart(page, rows) {
  page.text("Revenue vs direct costs by route", 48, 283, { size: 13, color: COLORS.ink, bold: true });
  page.text("Invoiced value, ZAR thousands", 48, 302, { size: 8.5, color: COLORS.muted });
  page.rect(407, 291, 8, 8, COLORS.revenue);
  page.text("Revenue", 420, 289, { size: 8, color: COLORS.muted });
  page.rect(488, 291, 8, 8, COLORS.costs);
  page.text("Costs", 501, 289, { size: 8, color: COLORS.muted });

  const plotBottom = 458;
  const plotHeight = 130;
  const max = 30000;
  for (const tick of [0, 10000, 20000, 30000]) {
    const top = plotBottom - (tick / max) * plotHeight;
    page.line(91, top, 556, top, COLORS.rule, 0.6);
    page.text(tick ? `${tick / 1000}k` : "0", 58, top - 5, { size: 8, color: COLORS.muted });
  }
  rows.forEach((row, index) => {
    const center = 171 + index * 150;
    for (const [value, x, color] of [
      [row.invoice, center - 28, COLORS.revenue],
      [row.cost, center + 2, COLORS.costs],
    ]) {
      const height = (value / max) * plotHeight;
      page.rect(x, plotBottom - height, 25, height, color);
      page.text(shortMoney(value), x - 1, plotBottom - height - 15, { size: 8.5, color: COLORS.ink, bold: true });
    }
    page.text(row.route, center - 17, 470, { size: 9, color: COLORS.ink, bold: true });
  });
}

function drawCostChart(page, rows) {
  page.text("Direct cost by category", 48, 516, { size: 13, color: COLORS.ink, bold: true });
  page.text("Ranked operating inputs, ZAR", 48, 535, { size: 8.5, color: COLORS.muted });
  const categories = [
    ["Fuel", sum(rows.map((row) => row.fuel))],
    ["Driver", sum(rows.map((row) => row.driver))],
    ["Supplier", sum(rows.map((row) => row.supplier))],
  ].sort((a, b) => b[1] - a[1]);
  categories.forEach(([label, value], index) => {
    const top = 567 + index * 38;
    page.text(label, 48, top - 1, { size: 9, color: COLORS.ink });
    page.rect(183, top, 282, 12, COLORS.pale);
    page.rect(183, top, Math.round(value / 16000 * 282), 12, COLORS.revenue);
    page.text(money(value), 476, top - 2, { size: 9, color: COLORS.ink, bold: true });
  });
}

function drawLedger(page, rows) {
  page.text("Route contribution", 48, 149, { size: 13, color: COLORS.ink, bold: true });
  page.text("Invoice value less direct costs; ZAR", 48, 168, { size: 8.5, color: COLORS.muted });
  const headings = [
    ["Route", 55], ["Billed", 113], ["Fuel", 181], ["Driver", 245],
    ["Supplier", 309], ["Costs", 386], ["Contribution", 466],
  ];
  page.rect(48, 192, 516, 28, COLORS.ink);
  headings.forEach(([label, x]) => page.text(label, x, 201, { size: 8.5, color: "#FFFFFF", bold: true }));
  const data = [
    ...rows.map((row) => [row.route, row.invoice, row.fuel, row.driver, row.supplier, row.cost, row.contribution]),
    ["TOTAL", ...["invoice", "fuel", "driver", "supplier", "cost", "contribution"].map((key) => sum(rows.map((row) => row[key])))],
  ];
  data.forEach((row, index) => {
    const top = 220 + index * 33;
    if (index === rows.length) page.rect(48, top, 516, 33, COLORS.pale);
    else page.line(48, top + 33, 564, top + 33, COLORS.rule, 0.6);
    row.forEach((value, column) => {
      page.text(column ? formatNumber(value) : value, headings[column][1], top + 10, {
        size: 8.9, color: COLORS.ink, bold: index === rows.length,
      });
    });
  });
}

export function createSamplePdf(document) {
  const pdf = new PdfDocument();
  const page = pdf.addPage();
  page.text("AIVIATE / SAMPLE DOCUMENT", 48, 46, { size: 9, bold: true, color: COLORS.teal });
  page.text(document.name.replace(/\.pdf$/i, ""), 48, 78, { size: 22, bold: true, color: COLORS.ink });
  page.line(48, 119, 564, 119, COLORS.rule);
  page.text("SIMULATION - NOT A LIVE COMPANY RECORD", 48, 137, { size: 9, color: COLORS.muted });
  page.text("Operational notes", 48, 190, { size: 12, bold: true, color: COLORS.ink });
  let top = 218;
  document.findings.forEach((finding) => {
    top = page.paragraph(`- ${finding}`, 48, top, { width: 85, size: 10, leading: 17 }) + 9;
  });
  page.text("Sample accounting entries", 48, top + 24, { size: 12, bold: true, color: COLORS.ink });
  top += 54;
  entryLines(document).forEach((line) => {
    top = page.paragraph(`- ${line}`, 48, top, { width: 84, size: 10, leading: 17 }) + 10;
  });
  page.line(48, 720, 564, 720, COLORS.rule);
  page.text("Illustrative values in ZAR. Generated for the simulated agent conversation.", 48, 735, { size: 8, color: COLORS.muted });
  return pdf.toBlob();
}

export function createReportPdf(documents) {
  const rows = ledgerFromDocuments(documents);
  const invoiced = sum(rows.map((row) => row.invoice));
  if (!invoiced) throw new Error("Sample invoices are missing.");
  const costs = sum(rows.map((row) => row.cost));
  const contribution = invoiced - costs;
  const receipts = sum(rows.filter((row) => row.paid).map((row) => row.invoice));
  const receivables = invoiced - receipts;
  const payables = sum(rows.filter((row) => !row.supplierPaid).map((row) => row.supplier));
  const pdf = new PdfDocument();

  const overview = pdf.addPage();
  overview.text("AIVIATE / DISPATCH", 48, 38, { size: 10, color: COLORS.teal, bold: true });
  overview.text("SIMULATION", 489, 40, { size: 8.5, color: COLORS.muted, bold: true });
  overview.text("Financial performance", 48, 62, { size: 24, color: COLORS.ink, bold: true });
  overview.text(`Generated ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} | Currency: ZAR`, 48, 95, { size: 9, color: COLORS.muted });
  overview.rect(48, 120, 516, 45, COLORS.pale);
  overview.text("ILLUSTRATIVE REVIEW", 60, 128, { size: 8, bold: true, color: COLORS.teal });
  overview.text("Calculated from three sample PDFs; not a live ledger or audited statement.", 60, 145, { size: 9, color: COLORS.ink });
  drawKpi(overview, 0, "INVOICED", money(invoiced));
  drawKpi(overview, 1, "DIRECT COSTS", money(costs));
  drawKpi(overview, 2, "CONTRIBUTION", money(contribution), COLORS.teal);
  drawKpi(overview, 3, "MARGIN", `${(contribution / invoiced * 100).toFixed(1)}%`, COLORS.teal);
  drawRouteChart(overview, rows);
  drawCostChart(overview, rows);
  pageFooter(overview, 1, "Source: 3 generated sample PDFs | Figures are illustrative and in ZAR");

  const detail = pdf.addPage();
  detail.text("AIVIATE / FINANCIAL DETAIL", 48, 40, { size: 10, color: COLORS.teal, bold: true });
  detail.text("Accounting detail", 48, 68, { size: 23, color: COLORS.ink, bold: true });
  detail.text("All amounts are illustrative; no connected financial data was accessed.", 48, 104, { size: 9, color: COLORS.muted });
  detail.line(48, 128, 564, 128, COLORS.rule);
  drawLedger(detail, rows);

  detail.text("Collection and payable snapshot", 48, 390, { size: 13, color: COLORS.ink, bold: true });
  detail.rect(48, 416, 516, 107, COLORS.pale);
  for (const [index, label, amount] of [
    [0, "Paid customer invoices (cash receipts)", receipts],
    [1, "Unpaid customer invoices (receivables)", receivables],
    [2, "Unpaid supplier charges (payables)", payables],
  ]) {
    detail.text(label, 60, 429 + index * 29, { size: 9.5, color: COLORS.ink });
    detail.text(money(amount), 462, 429 + index * 29, { size: 10, color: COLORS.ink, bold: true });
  }
  detail.text("Operations and finance notes", 48, 542, { size: 13, color: COLORS.ink, bold: true });
  const delayedRoute = rows.find((row) => row.route === "R-104");
  if (delayedRoute) detail.text(
    `- R-104 has delayed stops and ${delayedRoute.paid ? "a paid" : "an unpaid"} invoice of ${money(delayedRoute.invoice)}.`,
    48, 570, { size: 9.5 }
  );
  detail.text("- D-042's fatigue alert needs an operator review.", 48, 590, { size: 9.5 });
  detail.text("- Confirm supplier delivery windows before settling outstanding charges.", 48, 610, { size: 9.5 });
  detail.text("Source documents", 48, 650, { size: 11, color: COLORS.ink, bold: true });
  detail.text(documents.map((document) => document.name).join("  |  "), 48, 673, { size: 8.5, color: COLORS.muted });
  detail.text("Direct costs only: VAT, overhead, depreciation and tax are not modeled.", 48, 694, { size: 8.5, color: COLORS.muted });
  pageFooter(detail, 2, "Simulation only | Invoice value is not the same as cash available");
  return pdf.toBlob();
}