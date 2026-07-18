import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const outputDir = __dirname;
const sourcePath = path.join(rootDir, "docs", "CRUD_TABLE.md");
const workbookPath = path.join(outputDir, "cv-tajuk-crud-table.xlsx");
const previewPath = path.join(outputDir, "crud-matrix-preview.png");

const markdown = await fs.readFile(sourcePath, "utf8");

function extractSection(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`## ${escaped}\\r?\\n([\\s\\S]*?)(?=\\r?\\n## |$)`);
  const match = text.match(pattern);
  return match ? match[1].trim() : "";
}

function parseMarkdownTable(section) {
  const lines = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));
  return lines
    .filter((line) => !/^\|\s*-/.test(line))
    .map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    );
}

const updatedMatch = markdown.match(/^Updated:\s*(.+)$/m);
const updated = updatedMatch ? updatedMatch[1].trim() : "Not specified";
const legendRows = parseMarkdownTable(extractSection(markdown, "Legend"));
const matrixRows = parseMarkdownTable(extractSection(markdown, "CRUD Matrix"));
const notesSection = extractSection(markdown, "Notes");
const notes = notesSection
  .split(/\r?\n/)
  .map((line) => line.replace(/^- /, "").trim())
  .filter(Boolean);

if (matrixRows.length < 2) {
  throw new Error("CRUD Matrix table was not found in docs/CRUD_TABLE.md");
}

const workbook = Workbook.create();
const matrix = workbook.worksheets.add("CRUD Matrix");
const legend = workbook.worksheets.add("Legend & Notes");

const headers = ["Use case vs. entity/domain class", ...matrixRows[0].slice(1)];
const dataRows = matrixRows.slice(1).map((row) => [row[0], ...row.slice(1)]);
const columnCount = headers.length;
const dataStartRow = 4;
const dataEndRow = dataStartRow + dataRows.length;
const lastColLetter = String.fromCharCode("A".charCodeAt(0) + columnCount - 1);

matrix.showGridLines = false;
legend.showGridLines = false;

matrix.getRange(`A1:${lastColLetter}1`).merge();
matrix.getRange("A1").values = [["CRUD Matrix - CV Tajuk Revenue Cycle Information System"]];
matrix.getRange("A2").values = [[`Source: docs/CRUD_TABLE.md | Updated: ${updated}`]];
matrix.getRange(`A1:${lastColLetter}1`).format = {
  fill: "#FFFFFF",
  font: { bold: true, color: "#111827", size: 16 },
};
matrix.getRange(`A2:${lastColLetter}2`).merge();
matrix.getRange(`A2:${lastColLetter}2`).format = {
  fill: "#FFFFFF",
  font: { color: "#6B7280", italic: true, size: 10 },
};

matrix.getRangeByIndexes(dataStartRow - 1, 0, 1, columnCount).values = [headers];
matrix.getRangeByIndexes(dataStartRow, 0, dataRows.length, columnCount).values = dataRows;

const headerRange = matrix.getRangeByIndexes(dataStartRow - 1, 0, 1, columnCount);
headerRange.format = {
  fill: "#1F2937",
  font: { bold: true, color: "#FFFFFF", size: 11 },
  wrapText: true,
  horizontalAlignment: "center",
  verticalAlignment: "middle",
  borders: { preset: "all", style: "thin", color: "#D1D5DB" },
};
matrix.getRange(`A${dataStartRow}`).format.horizontalAlignment = "left";

const matrixBody = matrix.getRangeByIndexes(dataStartRow, 0, dataRows.length, columnCount);
matrixBody.format = {
  font: { color: "#374151", size: 10 },
  wrapText: true,
  verticalAlignment: "middle",
  borders: { preset: "all", style: "thin", color: "#E5E7EB" },
};

for (let r = 0; r < dataRows.length; r += 1) {
  const rowNumber = dataStartRow + 1 + r;
  const fill = r % 2 === 0 ? "#FFFFFF" : "#F9FAFB";
  matrix.getRange(`A${rowNumber}:${lastColLetter}${rowNumber}`).format.fill = fill;
  matrix.getRange(`A${rowNumber}`).format = {
    fill: r % 2 === 0 ? "#F8FAFC" : "#F3F4F6",
    font: { bold: true, color: "#1F2937", size: 10 },
    wrapText: true,
  };
}

const crudRange = matrix.getRangeByIndexes(dataStartRow, 1, dataRows.length, columnCount - 1);
crudRange.format = {
  horizontalAlignment: "center",
  verticalAlignment: "middle",
  font: { bold: true, color: "#374151", size: 10 },
};

for (let r = 0; r < dataRows.length; r += 1) {
  for (let c = 1; c < columnCount; c += 1) {
    const value = dataRows[r][c] || "";
    const cell = matrix.getCell(dataStartRow + r, c);
    cell.format.fill = r % 2 === 0 ? "#FFFFFF" : "#F9FAFB";
    if (!value) {
      cell.format.font = { color: "#9CA3AF" };
    } else if (value.includes("D")) {
      cell.format.font = { bold: true, color: "#B91C1C" };
    } else if (value.includes("U")) {
      cell.format.font = { bold: true, color: "#A16207" };
    } else if (value.includes("C")) {
      cell.format.font = { bold: true, color: "#047857" };
    } else if (value.includes("R")) {
      cell.format.font = { bold: true, color: "#2563EB" };
    }
  }
}

matrix.getRange("A:A").format.columnWidth = 31;
matrix.getRange("B:L").format.columnWidth = 15;
matrix.getRange("A1").format.rowHeight = 30;
matrix.getRange("A2").format.rowHeight = 22;
matrix.getRange(`${dataStartRow}:${dataStartRow}`).format.rowHeight = 42;
matrix.getRange(`${dataStartRow + 1}:${dataEndRow}`).format.rowHeight = 31;
matrix.freezePanes.freezeRows(dataStartRow);
matrix.freezePanes.freezeColumns(1);

const noteRow = dataEndRow + 2;
matrix.getRange(`A${noteRow}:L${noteRow}`).merge();
matrix.getRange(`A${noteRow}`).values = [["Codes: C = create, R = read, U = update, D = delete. Blank cells mean the use case does not directly touch that class."]];
matrix.getRange(`A${noteRow}:L${noteRow}`).format = {
  fill: "#F9FAFB",
  font: { color: "#6B7280", italic: true, size: 10 },
  wrapText: true,
  borders: { preset: "outside", style: "thin", color: "#E5E7EB" },
};

legend.getRange("A1:D1").merge();
legend.getRange("A1").values = [["CRUD Table Legend & Documentation Notes"]];
legend.getRange("A2").values = [[`Generated from docs/CRUD_TABLE.md | Updated: ${updated}`]];
legend.getRange("A1:D1").format = {
  fill: "#FFFFFF",
  font: { bold: true, color: "#111827", size: 16 },
};
legend.getRange("A2:D2").merge();
legend.getRange("A2:D2").format = {
  fill: "#FFFFFF",
  font: { color: "#6B7280", italic: true, size: 10 },
};

legend.getRange("A4:B4").values = [["Code", "Meaning"]];
legend.getRange("A4:B4").format = {
  fill: "#1F2937",
  font: { bold: true, color: "#FFFFFF" },
  borders: { preset: "all", style: "thin", color: "#D1D5DB" },
};
if (legendRows.length > 1) {
  const body = legendRows.slice(1);
  legend.getRangeByIndexes(4, 0, body.length, 2).values = body;
  legend.getRangeByIndexes(4, 0, body.length, 2).format = {
    wrapText: true,
    borders: { preset: "all", style: "thin", color: "#E5E7EB" },
    font: { color: "#374151", size: 10 },
  };
}

const noteStart = 13;
legend.getRange(`A${noteStart}:D${noteStart}`).merge();
legend.getRange(`A${noteStart}`).values = [["Notes"]];
legend.getRange(`A${noteStart}:D${noteStart}`).format = {
  fill: "#1F2937",
  font: { bold: true, color: "#FFFFFF" },
};
notes.forEach((note, index) => {
  const row = noteStart + 1 + index;
  legend.getRange(`A${row}:D${row}`).merge();
  legend.getRange(`A${row}`).values = [[note]];
  legend.getRange(`A${row}:D${row}`).format = {
    fill: index % 2 === 0 ? "#FFFFFF" : "#F9FAFB",
    wrapText: true,
    font: { color: "#374151", size: 10 },
    borders: { preset: "outside", style: "thin", color: "#E5E7EB" },
  };
});

legend.getRange("A:A").format.columnWidth = 16;
legend.getRange("B:B").format.columnWidth = 50;
legend.getRange("C:D").format.columnWidth = 18;
legend.getRange(`${noteStart + 1}:${noteStart + notes.length}`).format.rowHeight = 42;
legend.freezePanes.freezeRows(4);

const inspect = await workbook.inspect({
  kind: "table",
  range: `CRUD Matrix!A5:${lastColLetter}${dataEndRow}`,
  tableMaxRows: 20,
  tableMaxCols: 12,
  maxChars: 3000,
});
console.log(inspect.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
  maxChars: 1000,
});
console.log(errors.ndjson);

const preview = await workbook.render({
  sheetName: "CRUD Matrix",
  range: `A1:${lastColLetter}${noteRow}`,
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(workbookPath);

console.log(`Workbook: ${workbookPath}`);
console.log(`Preview: ${previewPath}`);
