export const SAMPLE_DOCUMENTS = [
  {
    id: "routes",
    name: "Route exceptions.pdf",
    findings: [
      "Route R-104: two stops delayed by road congestion.",
      "Route R-118: dispatch suggested a driver check-in before rerouting.",
    ],
  },
  {
    id: "safety",
    name: "Driver safety notes.pdf",
    findings: [
      "Driver D-042: a fatigue alert requires an operator review.",
      "No automated safety intervention is recorded in this sample.",
    ],
  },
  {
    id: "suppliers",
    name: "Supplier follow-ups.pdf",
    findings: [
      "Supplier S-021: delivery window confirmation is pending.",
      "Supplier S-034: revised arrival estimate should be reviewed.",
    ],
  },
];

function escapePdf(value) {
  return String(value).normalize("NFKD").replace(/[^\x20-\x7e]/g, "?").replace(/[\\()]/g, "\\$&");
}

function wrapLine(value, width = 88) {
  const words = String(value).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  lines.push(line);
  return lines;
}

// Small, single-page PDF writer for the transient simulation downloads.
// Nothing is uploaded or persisted; both source files and report contain sample data.
function createPdf(title, lines) {
  const encoder = new TextEncoder();
  let y = 742;
  const commands = [`BT /F1 17 Tf 48 ${y} Td (${escapePdf(title)}) Tj ET`];
  for (const line of lines.flatMap((entry) => wrapLine(entry))) {
    y -= line ? 21 : 12;
    if (y < 42) break;
    commands.push(`BT /F1 10 Tf 48 ${y} Td (${escapePdf(line)}) Tj ET`);
  }
  const stream = `${commands.join("\n")}\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`,
  ];
  const offsets = [0];
  let output = "%PDF-1.4\n";
  objects.forEach((object, index) => {
    offsets.push(encoder.encode(output).length);
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = encoder.encode(output).length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([encoder.encode(output)], { type: "application/pdf" });
}

export function createSamplePdf(document) {
  return createPdf(document.name.replace(/\.pdf$/i, ""), [
    "SIMULATION SAMPLE - NOT A LIVE FLEET DOCUMENT",
    "",
    ...document.findings,
  ]);
}

export function createReportPdf(documents) {
  return createPdf("Aiviate operations report", [
    "SIMULATION REPORT - GENERATED FROM SAMPLE PDF DOCUMENTS",
    `Generated: ${new Date().toLocaleString("en-ZA")}`,
    "",
    "Summary",
    `${documents.length} sample PDFs reviewed. These are not connected account records.`,
    "",
    ...documents.flatMap((document) => [
      document.name,
      ...document.findings.map((finding) => `- ${finding}`),
      "",
    ]),
    "Recommended next steps",
    "- Review route delays with dispatch before changing assignments.",
    "- Confirm any safety alert with an operator.",
    "- Follow up on supplier delivery windows before sending updates.",
  ]);
}