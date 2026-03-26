const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

const { readWorkbook } = require("./services/excel.service");
const { importSheetsToFirestore } = require("./services/firestore-import.service");

dotenv.config();

function parseArgs(argv) {
  const args = {
    filePath: null,
    sheets: [],
    replaceExisting: true,
    dryRun: false,
  };

  argv.forEach((argument) => {
    if (argument === "--dry-run") {
      args.dryRun = true;
      return;
    }

    if (argument === "--append") {
      args.replaceExisting = false;
      return;
    }

    if (argument.startsWith("--sheets=")) {
      const value = argument.replace("--sheets=", "").trim();
      args.sheets = value
        ? value
            .split(",")
            .map((sheet) => sheet.trim())
            .filter(Boolean)
        : [];
      return;
    }

    if (!argument.startsWith("--") && !args.filePath) {
      args.filePath = argument;
    }
  });

  return args;
}

function resolveSeedFile(customPath) {
  const candidates = [customPath, process.env.EXCEL_FILE_PATH, "./FACTURASV3.xlsx", "./Fabian Gonzalez FACTURASV3.xlsx"]
    .filter(Boolean)
    .map((value) => (path.isAbsolute(value) ? value : path.resolve(process.cwd(), value)));

  const found = candidates.find((candidate) => fs.existsSync(candidate));

  if (!found) {
    throw new Error(`No se encontró archivo Excel para seed. Intentados: ${candidates.join(", ")}`);
  }

  return found;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const filePath = resolveSeedFile(args.filePath);

  const workbook = readWorkbook(filePath, args.sheets);

  if (workbook.sheets.length === 0) {
    throw new Error("No hay hojas con datos para seed");
  }

  const summary = workbook.sheets.map((sheet) => ({
    sheet: sheet.name,
    rowCount: sheet.rowCount,
  }));

  console.log("Archivo seed:", filePath);
  console.log("Hojas detectadas para seed:");
  console.table(summary);

  if (args.dryRun) {
    console.log("Dry run completado. No se escribieron datos en Firestore.");
    return;
  }

  const result = await importSheetsToFirestore(workbook.sheets, args.replaceExisting);

  console.log("Seed completado:");
  console.table(result);
}

run().catch((error) => {
  console.error("Error ejecutando seed:", error.message);
  process.exit(1);
});
