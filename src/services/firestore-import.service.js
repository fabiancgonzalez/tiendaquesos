const { db } = require("../config/firebase");

function normalizeCollectionName(name) {
  return String(name)
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

async function clearCollection(collectionName) {
  const collectionRef = db.collection(collectionName);
  const snapshot = await collectionRef.get();

  if (snapshot.empty) {
    return;
  }

  const documents = snapshot.docs;
  const batchSize = 400;

  for (let index = 0; index < documents.length; index += batchSize) {
    const chunk = documents.slice(index, index + batchSize);
    const batch = db.batch();

    chunk.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
  }
}

async function insertRows(collectionName, rows) {
  const collectionRef = db.collection(collectionName);
  const batchSize = 400;

  for (let index = 0; index < rows.length; index += batchSize) {
    const chunk = rows.slice(index, index + batchSize);
    const batch = db.batch();

    chunk.forEach((row) => {
      const docRef = collectionRef.doc();
      batch.set(docRef, {
        ...row,
        imported_at: new Date().toISOString(),
      });
    });

    await batch.commit();
  }
}

async function importSheetsToFirestore(sheets, replaceExisting = false) {
  const summary = [];

  for (const sheet of sheets) {
    const collectionName = normalizeCollectionName(sheet.name);

    if (replaceExisting) {
      await clearCollection(collectionName);
    }

    await insertRows(collectionName, sheet.rows);

    summary.push({
      sheet: sheet.name,
      collection: collectionName,
      importedRows: sheet.rowCount,
      replaced: replaceExisting,
    });
  }

  return summary;
}

module.exports = {
  importSheetsToFirestore,
  normalizeCollectionName,
};
