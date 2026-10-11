const fs = require("fs");
const path = require("path");

let pdfParse = null;

try {
  pdfParse = require("pdf-parse");
} catch (error) {
  pdfParse = null;
}

function countPdfPagesFromBuffer(buffer) {
  const text = buffer.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page\b/g);
  return matches ? matches.length : null;
}

async function extractPdfMetadata(filePath, mimeType = "") {
  const extension = path.extname(filePath || "").toLowerCase();
  const isPdf = extension === ".pdf" || mimeType === "application/pdf";

  if (!isPdf) {
    return { text: "", pageCount: null, provider: "none" };
  }

  const buffer = fs.readFileSync(filePath);

  if (!pdfParse) {
    return {
      text: "",
      pageCount: countPdfPagesFromBuffer(buffer),
      provider: "page-count-fallback"
    };
  }

  const parsed = await pdfParse(buffer);

  return {
    text: String(parsed.text || "").replace(/\s+/g, " ").trim().slice(0, 20000),
    pageCount: parsed.numpages || countPdfPagesFromBuffer(buffer),
    provider: "pdf-parse"
  };
}

module.exports = {
  extractPdfMetadata
};
