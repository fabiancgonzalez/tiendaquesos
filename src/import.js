const path = require("path");
const dotenv = require("dotenv");

const { readWorkbook } = require("./services/excel.service");
const { importSheetsToFirestore } = require("./services/firestore-import.service");

dotenv.config();

async function run() {
  const filePath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(process.cwd(), process.env.EXCEL_FILE_PATH || "./Fabian Gonzalez FACTURASV3.xlsx");

  const workbook = readWorkbook(filePath);

  if (workbook.sheets.length === 0) {
    throw new Error("No hay hojas con datos para importar");
  }

  const result = await importSheetsToFirestore(workbook.sheets, true);

  console.log("Importación terminada:");
  console.table(result);
}

run().catch((error) => {
  console.error("Error en importación:", error.message);
  process.exit(1);
});
