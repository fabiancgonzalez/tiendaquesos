const XLSX = require("xlsx");

function normalizeHeader(value, index) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return `col_${index + 1}`;
  }

  const normalized = String(value)
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  return normalized || `col_${index + 1}`;
}

function parseSheet(worksheet) {
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
    blankrows: false,
  });

  if (!rows.length) {
    return [];
  }

  const headerRowIndex = rows.findIndex((row) =>
    Array.isArray(row) && row.some((cell) => cell !== null && String(cell).trim() !== "")
  );

  if (headerRowIndex === -1) {
    return [];
  }

  const rawHeaders = rows[headerRowIndex];
  const headers = rawHeaders.map((value, index) => normalizeHeader(value, index));

  const dataRows = rows.slice(headerRowIndex + 1);
  const parsedRows = [];

  dataRows.forEach((row, rowIndex) => {
    const isEmpty = !row || row.every((cell) => cell === null || String(cell).trim() === "");

    if (isEmpty) {
      return;
    }

    const item = {};

    headers.forEach((header, columnIndex) => {
      const value = row[columnIndex];
      if (value !== null && value !== undefined && String(value).trim() !== "") {
        item[header] = value;
      }
    });

    if (Object.keys(item).length > 0) {
      item._excel_row = headerRowIndex + rowIndex + 2;
      parsedRows.push(item);
    }
  });

  return parsedRows;
}

function readWorkbook(filePath, selectedSheets) {
  const workbook = XLSX.readFile(filePath);
  const targetSheets =
    Array.isArray(selectedSheets) && selectedSheets.length > 0
      ? workbook.SheetNames.filter((name) => selectedSheets.includes(name))
      : workbook.SheetNames;

  const sheets = targetSheets
    .map((name) => {
      const worksheet = workbook.Sheets[name];
      const rows = parseSheet(worksheet);
      return {
        name,
        rowCount: rows.length,
        rows,
      };
    })
    .filter((sheet) => sheet.rowCount > 0);

  return {
    sheetNames: workbook.SheetNames,
    sheets,
  };
}

module.exports = {
  readWorkbook,
};
