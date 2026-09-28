const WIDTH = 612;
const HEIGHT = 792;
const encoder = new TextEncoder();

function pdfText(value) {
  return String(value).normalize("NFKD").replace(/[^\x20-\x7e]/g, "?").replace(/[\\()]/g, "\\$&");
}

function pdfColor(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((index) => (parseInt(value.slice(index, index + 2), 16) / 255).toFixed(3)).join(" ");
}

export class PdfPage {
  constructor() {
    this.commands = [];
  }

  text(value, x, top, { size = 10, color = "#343A40", bold = false } = {}) {
    this.commands.push(
      `BT /${bold ? "F2" : "F1"} ${size} Tf ${pdfColor(color)} rg 1 0 0 1 ${x} ${HEIGHT - top - size} Tm (${pdfText(value)}) Tj ET`
    );
  }

  rect(x, top, width, height, color) {
    this.commands.push(`q ${pdfColor(color)} rg ${x} ${HEIGHT - top - height} ${width} ${height} re f Q`);
  }

  line(x1, top1, x2, top2, color = "#E5E7EB", width = 1) {
    this.commands.push(`q ${pdfColor(color)} RG ${width} w ${x1} ${HEIGHT - top1} m ${x2} ${HEIGHT - top2} l S Q`);
  }

  paragraph(value, x, top, { width = 86, size = 10, leading = 16, color = "#343A40" } = {}) {
    let line = "";
    let offset = 0;
    for (const word of String(value).split(/\s+/)) {
      if (line && `${line} ${word}`.length > width) {
        this.text(line, x, top + offset, { size, color });
        offset += leading;
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) {
      this.text(line, x, top + offset, { size, color });
      offset += leading;
    }
    return top + offset;
  }
}

export class PdfDocument {
  constructor() {
    this.pages = [];
  }

  addPage() {
    const page = new PdfPage();
    this.pages.push(page);
    return page;
  }

  toBlob() {
    if (!this.pages.length) throw new Error("Cannot create an empty PDF.");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Kids [${this.pages.map((_, index) => `${5 + index * 2} 0 R`).join(" ")}] /Count ${this.pages.length} >>`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    ];
    this.pages.forEach((page, index) => {
      const stream = `${page.commands.join("\n")}\n`;
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + index * 2} 0 R >>`,
        `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`
      );
    });
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
}