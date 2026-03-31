const crypto = require("crypto");

const { admin, db } = require("../config/firebase");
const { normalizeCollectionName } = require("./firestore-import.service");

const USERS_COLLECTION = "usuarios";
const SALES_COLLECTION = "datos";
const PURCHASES_COLLECTION = "compras";

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundStock(value) {
  return Number(toNumber(value).toFixed(3));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function sanitizePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  const clean = {};

  Object.entries(payload).forEach(([key, value]) => {
    const cleanKey = String(key || "").trim();

    if (!cleanKey) {
      return;
    }

    if (value === undefined) {
      return;
    }

    clean[cleanKey] = value;
  });

  return clean;
}

function sanitizeUserItem(item) {
  if (!item) {
    return item;
  }

  const { password, hashed_password, email_lower, ...safeItem } = item;
  return safeItem;
}

function prepareUserPayload(data, isCreate = false) {
  const prepared = { ...data };
  const rawPassword = String(prepared.password || "").trim();

  if (prepared.email) {
    prepared.email = String(prepared.email).trim().toLowerCase();
    prepared.email_lower = prepared.email;
  }

  if (rawPassword) {
    prepared.hashed_password = hashPassword(rawPassword);
  } else if (isCreate) {
    throw new Error("La contraseña es obligatoria para crear usuarios");
  }

  delete prepared.password;
  return prepared;
}

function prepareArticuloPayload(data, isCreate = false) {
  const prepared = { ...data };
  const stockInicial = prepared.stock_inicial === "" ? null : toNumber(prepared.stock_inicial);
  const stockActualProvided = prepared.stock_actual !== "" && prepared.stock_actual !== undefined;

  if (prepared.stock_inicial !== undefined && prepared.stock_inicial !== "") {
    prepared.stock_inicial = roundStock(stockInicial);
  }

  if (stockActualProvided) {
    prepared.stock_actual = roundStock(prepared.stock_actual);
  } else if (isCreate && prepared.stock_inicial !== undefined) {
    prepared.stock_actual = roundStock(prepared.stock_inicial);
  }

  return prepared;
}

function sanitizeOutput(collectionName, item) {
  if (collectionName === USERS_COLLECTION) {
    return sanitizeUserItem(item);
  }

  return item;
}

function normalizeLineItems(payload) {
  return Array.isArray(payload?.lineas)
    ? payload.lineas
        .map((line) => ({
          articulo_id: line.articulo_id || "",
          cantidad: toNumber(line.cantidad),
          concepto: String(line.concepto || "").trim(),
          precio: toNumber(line.precio),
          impuesto: toNumber(line.impuesto),
          total_linea: toNumber(line.total_linea || toNumber(line.cantidad) * toNumber(line.precio)),
        }))
        .filter((line) => line.cantidad > 0)
    : [];
}

async function findArticuloByLine(line, transaction) {
  const articuloId = String(line.articulo_id || "").trim();

  if (articuloId) {
    const ref = db.collection("articulos").doc(articuloId);
    const snapshot = await transaction.get(ref);
    return snapshot.exists ? snapshot : null;
  }

  const concepto = String(line.concepto || "").trim();

  if (!concepto) {
    return null;
  }

  const query = db.collection("articulos").where("nombre", "==", concepto).limit(1);
  const snapshot = await transaction.get(query);

  if (!snapshot.empty) {
    return snapshot.docs[0];
  }

  const fallback = await transaction.get(db.collection("articulos"));
  const normalizedConcept = normalizeText(concepto);
  return fallback.docs.find((doc) => normalizeText(doc.data().nombre) === normalizedConcept) || null;
}

async function buildStockMap(lines, transaction, options = {}) {
  const map = new Map();

  for (const line of lines) {
    const snapshot = await findArticuloByLine(line, transaction);

    if (!snapshot) {
      if (options.skipMissing) {
        continue;
      }

      throw new Error(`No se encontró el artículo para la línea: ${line.concepto || line.articulo_id || "sin referencia"}`);
    }

    const current = map.get(snapshot.id) || {
      snapshot,
      cantidad: 0,
      nombre: snapshot.data().nombre || line.concepto || snapshot.id,
    };

    current.cantidad += toNumber(line.cantidad);
    map.set(snapshot.id, current);
  }

  return map;
}

async function applyInventoryChange(transaction, lineItems, direction, options = {}) {
  const stockMap = await buildStockMap(lineItems, transaction, options);

  stockMap.forEach(({ snapshot, cantidad, nombre }) => {
    const currentStock = toNumber(snapshot.data().stock_actual);
    const nextStock = roundStock(currentStock + cantidad * direction);

    if (nextStock < 0) {
      throw new Error(`Stock insuficiente para ${nombre}. Disponible: ${currentStock}`);
    }

    transaction.update(snapshot.ref, {
      stock_actual: nextStock,
      updated_at: new Date().toISOString(),
    });
  });
}

function applyCombinedInventoryChange(transaction, previousMap, nextMap, revertDirection, createDirection) {
  const changes = new Map();

  previousMap.forEach(({ snapshot, cantidad, nombre }, key) => {
    const current = changes.get(key) || {
      snapshot,
      nombre,
      delta: 0,
    };

    current.delta += cantidad * revertDirection;
    changes.set(key, current);
  });

  nextMap.forEach(({ snapshot, cantidad, nombre }, key) => {
    const current = changes.get(key) || {
      snapshot,
      nombre,
      delta: 0,
    };

    current.delta += cantidad * createDirection;
    changes.set(key, current);
  });

  changes.forEach(({ snapshot, nombre, delta }) => {
    if (!delta) {
      return;
    }

    const currentStock = toNumber(snapshot.data().stock_actual);
    const nextStock = roundStock(currentStock + delta);

    if (nextStock < 0) {
      throw new Error(`Stock insuficiente para ${nombre}. Disponible: ${currentStock}`);
    }

    transaction.update(snapshot.ref, {
      stock_actual: nextStock,
      updated_at: new Date().toISOString(),
    });
  });
}

async function createInventoryDocument(collectionName, data) {
  const direction = collectionName === SALES_COLLECTION ? -1 : 1;
  const skipMissing = collectionName === PURCHASES_COLLECTION;

  return db.runTransaction(async (transaction) => {
    const lineItems = normalizeLineItems(data);

    if (lineItems.length) {
      await applyInventoryChange(transaction, lineItems, direction, { skipMissing });
    }

    const ref = db.collection(collectionName).doc();
    const payload = {
      ...data,
      lineas: lineItems,
      lineas_count: lineItems.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    transaction.set(ref, payload);
    return { id: ref.id, ...payload };
  });
}

async function updateInventoryDocument(collectionName, id, data) {
  const createDirection = collectionName === SALES_COLLECTION ? -1 : 1;
  const revertDirection = createDirection * -1;
  const skipMissing = collectionName === PURCHASES_COLLECTION;

  return db.runTransaction(async (transaction) => {
    const ref = db.collection(collectionName).doc(id);
    const snapshot = await transaction.get(ref);

    if (!snapshot.exists) {
      throw new Error("Registro no encontrado");
    }

    const previous = snapshot.data();
    const previousLines = normalizeLineItems(previous);
    const nextLines = normalizeLineItems({ ...previous, ...data });
    const previousMap = previousLines.length
      ? await buildStockMap(previousLines, transaction, { skipMissing })
      : new Map();
    const nextMap = nextLines.length
      ? await buildStockMap(nextLines, transaction, { skipMissing })
      : new Map();

    applyCombinedInventoryChange(transaction, previousMap, nextMap, revertDirection, createDirection);

    const payload = {
      ...data,
      lineas: nextLines,
      lineas_count: nextLines.length,
      updated_at: new Date().toISOString(),
    };

    transaction.update(ref, payload);
    return { id, ...previous, ...payload };
  });
}

async function deleteInventoryDocument(collectionName, id) {
  const revertDirection = collectionName === SALES_COLLECTION ? 1 : -1;
  const skipMissing = collectionName === PURCHASES_COLLECTION;

  return db.runTransaction(async (transaction) => {
    const ref = db.collection(collectionName).doc(id);
    const snapshot = await transaction.get(ref);

    if (!snapshot.exists) {
      throw new Error("Registro no encontrado");
    }

    const previous = snapshot.data();
    const previousLines = normalizeLineItems(previous);

    if (previousLines.length) {
      await applyInventoryChange(transaction, previousLines, revertDirection, { skipMissing });
    }

    transaction.delete(ref);
    return { id, ...previous };
  });
}

function prepareCollectionPayload(collectionName, payload, options = {}) {
  let data = sanitizePayload(payload);

  if (collectionName === USERS_COLLECTION) {
    data = prepareUserPayload(data, options.isCreate);
  }

  if (collectionName === "articulos") {
    data = prepareArticuloPayload(data, options.isCreate);
  }

  if (options.actor) {
    data.updated_by = options.actor.email || options.actor.nombre || "sistema";
    if (options.isCreate) {
      data.created_by = data.created_by || data.updated_by;
    }
  }

  return data;
}

async function listCollections() {
  const collections = await db.listCollections();
  return collections.map((collection) => collection.id).sort();
}

async function listItems(rawCollectionName, limit = 200) {
  const collectionName = normalizeCollectionName(rawCollectionName);
  const snapshot = await db.collection(collectionName).limit(limit).get();

  return {
    collection: collectionName,
    items: snapshot.docs.map((doc) => sanitizeOutput(collectionName, { id: doc.id, ...doc.data() })),
  };
}

const { notifyOrderCreated } = require("./notification.service");

async function createItem(rawCollectionName, payload, options = {}) {
  const collectionName = normalizeCollectionName(rawCollectionName);
  const data = prepareCollectionPayload(collectionName, payload, { ...options, isCreate: true });

  if (Object.keys(data).length === 0) {
    throw new Error("El registro no puede estar vacío");
  }

  // Si es una venta, crear inventario y notificar
  if (collectionName === SALES_COLLECTION) {
    const createdInventoryItem = await createInventoryDocument(collectionName, data);
    if (!options.skipNotification) {
      try {
        const customer =
        data.cliente_detalle && typeof data.cliente_detalle === "object"
          ? data.cliente_detalle
          : data.cliente && typeof data.cliente === "object"
            ? data.cliente
            : data.cliente && typeof data.cliente === "string"
              ? { nombre: data.cliente }
              : null;
      // Si hay email o teléfono, notificar
        if (customer && (customer.email || customer.telefono)) {
          await notifyOrderCreated({
            order: { ...createdInventoryItem, lineas: createdInventoryItem.lineas || data.lineas || [] },
            sale: createdInventoryItem,
            customer,
          });
        }
      } catch (e) {
      // No bloquear la venta si falla la notificación
      console.error("Error enviando notificación de venta:", e.message);
    }
    }
    return {
      collection: collectionName,
      item: sanitizeOutput(collectionName, createdInventoryItem),
    };
  }

  // Si es una compra, solo crear inventario
  if (collectionName === PURCHASES_COLLECTION) {
    const createdInventoryItem = await createInventoryDocument(collectionName, data);
    return {
      collection: collectionName,
      item: sanitizeOutput(collectionName, createdInventoryItem),
    };
  }

  // Resto de colecciones
  const ref = await db.collection(collectionName).add({
    ...data,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const created = await ref.get();

  return {
    collection: collectionName,
    item: sanitizeOutput(collectionName, { id: created.id, ...created.data() }),
  };
}

async function updateItem(rawCollectionName, id, payload, options = {}) {
  const collectionName = normalizeCollectionName(rawCollectionName);
  const data = prepareCollectionPayload(collectionName, payload, options);

  if (Object.keys(data).length === 0) {
    throw new Error("No hay campos para actualizar");
  }

  if (collectionName === SALES_COLLECTION || collectionName === PURCHASES_COLLECTION) {
    const updatedInventoryItem = await updateInventoryDocument(collectionName, id, data);
    return {
      collection: collectionName,
      item: sanitizeOutput(collectionName, updatedInventoryItem),
    };
  }

  const ref = db.collection(collectionName).doc(id);
  const doc = await ref.get();

  if (!doc.exists) {
    throw new Error("Registro no encontrado");
  }

  await ref.update({
    ...data,
    updated_at: new Date().toISOString(),
  });

  const updated = await ref.get();

  return {
    collection: collectionName,
    item: sanitizeOutput(collectionName, { id: updated.id, ...updated.data() }),
  };
}

async function deleteItem(rawCollectionName, id) {
  const collectionName = normalizeCollectionName(rawCollectionName);

  if (collectionName === SALES_COLLECTION || collectionName === PURCHASES_COLLECTION) {
    const deletedInventoryItem = await deleteInventoryDocument(collectionName, id);
    return {
      collection: collectionName,
      id,
      item: sanitizeOutput(collectionName, deletedInventoryItem),
    };
  }

  const ref = db.collection(collectionName).doc(id);
  const doc = await ref.get();

  if (!doc.exists) {
    throw new Error("Registro no encontrado");
  }

  await ref.delete();

  return {
    collection: collectionName,
    id,
  };
}

module.exports = {
  listCollections,
  listItems,
  createItem,
  updateItem,
  deleteItem,
  sanitizeUserItem,
};
