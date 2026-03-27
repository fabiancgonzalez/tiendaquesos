// --- Helpers de permisos y colecciones ---
function sanitizeCollectionList(collections) {
  // Filtra colecciones ocultas o internas si es necesario
  return (collections || []).filter(
    (name) => !name.startsWith("_") && name !== "migrations"
  );
}

function canAccessCollection(session, collection, method = "GET") {
  // Permite acceso total a admin, restringe a otros roles
  if (!session?.user) return false;
  if (session.user.rol === "admin") return true;
  // Ejemplo: solo permite acceso a "articulos" y "clientes" a otros roles
  const allowed = ["articulos", "clientes", "proveedores", "pedidos_web", "datos"];
  return allowed.includes(collection);
}

function requireCollectionPermission(req, res, next) {
  const collection = req.params.collection;
  if (!canAccessCollection(req.session, collection, req.method)) {
    return res.status(403).json({ message: "Acceso denegado a la colección" });
  }
  next();
}

const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const multer = require("multer");

// Importar middlewares y servicios personalizados
const {
  attachSession,
  authenticateUser,
  clearSessionCookie,
  createSessionForUser,
  destroySessionFromRequest,
  requireAuth,
  requireRole,
  setSessionCookie,
} = require("./services/auth.service");
const {
  listCollections,
  listItems,
  createItem,
  updateItem,
  deleteItem,
  sanitizeUserItem,
} = require("./services/firestore-crud.service");
const { notifyOrderCreated } = require("./services/notification.service");
const { readWorkbook } = require("./services/excel.service");
const { importSheetsToFirestore, normalizeCollectionName } = require("./services/firestore-import.service");
const { getWhatsAppState } = require("./services/whatsappweb.service");

dotenv.config();


// Usar /tmp para compatibilidad con Vercel/serverless

const uploadDir = "/tmp/uploads/products";
try {
  fs.mkdirSync(uploadDir, { recursive: true });
} catch (e) {
  // Ignorar si ya existe o no se puede crear
}
const upload = multer({ dest: uploadDir });

const app = express();

// Middlewares
app.use(cors());
app.use(attachSession);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.resolve(process.cwd(), "public")));
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

// Endpoints
app.post("/api/auth/register", async (req, res) => {
  const { nombre, email, telefono, password } = req.body || {};
  if (!nombre || !email || !telefono || !password) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }
  try {
    // Verificar si ya existe el usuario en Firebase Auth
    let userRecord;
    try {
      userRecord = await require("../src/config/firebase").admin.auth().getUserByEmail(email);
      return res.status(409).json({ error: "El email ya está registrado" });
    } catch (e) {
      // Si no existe, Firebase lanza error, seguimos
    }

    // Crear usuario en Firebase Auth
    const newUser = await require("../src/config/firebase").admin.auth().createUser({
      email,
      password,
      displayName: nombre,
      phoneNumber: telefono.startsWith("+") ? telefono : "+" + telefono.replace(/\D+/g, ""),
      disabled: false,
    });

    // Guardar datos extra en Firestore
    const db = require("../src/config/firebase").db;
    await db.collection("usuarios").doc(newUser.uid).set({
      nombre,
      email,
      telefono,
      rol: "cliente",
      creado: new Date().toISOString(),
      uid: newUser.uid,
    });

    return res.json({ ok: true, uid: newUser.uid });
  } catch (error) {
    let msg = error.message || "Error registrando usuario";
    if (error.code === "auth/email-already-exists") {
      msg = "El email ya está registrado";
    }
    return res.status(500).json({ error: msg });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = await authenticateUser(email, password);
    const token = await createSessionForUser(user, req);

    setSessionCookie(res, token);
    res.json({ message: "Sesión iniciada", user });
  } catch (error) {
    res.status(401).json({ message: "No se pudo iniciar sesión", error: error.message });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  await destroySessionFromRequest(req);
  clearSessionCookie(res);
  res.json({ message: "Sesión cerrada" });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ message: "No autenticado", error: "No hay una sesión activa" });
  }

  return res.json({ user: req.session.user, expiresAt: req.session.expiresAt });
});

app.get("/api/store/products", async (_req, res) => {
  try {
    const data = await listItems("articulos", 500);
    const items = (data.items || []).filter((item) => Number(item.stock_actual || 0) > 0 || item.stock_actual === "");
    return res.json({ items });
  } catch (error) {
    return res.status(500).json({ message: "Error listando productos", error: error.message });
  }
});

app.post("/api/store/orders", async (req, res) => {
  try {
    const { salePayload, orderPayload } = buildStoreOrderPayload(req.body || {});
    const sale = await createItem("datos", salePayload, {
      actor: { nombre: "Tienda Web", email: "web@tiendaquesos.local" },
    });
    const order = await createItem("pedidos_web", {
      ...orderPayload,
      venta_id: sale.item.id,
    });
    const notification = await notifyOrderCreated({
      order: order.item,
      sale: sale.item,
      customer: orderPayload.cliente,
    });

    return res.status(201).json({
      message: "Pedido generado correctamente",
      order: order.item,
      sale: sale.item,
      notification,
    });
  } catch (error) {
    return res.status(400).json({ message: "No se pudo crear el pedido", error: error.message });
  }
});

app.get("/api/notifications/whatsapp/status", (_req, res) => {
  res.json({ whatsapp: getWhatsAppState() });
});

app.get("/excel/sheets", requireRole("admin"), (req, res) => {
  try {
    const filePath = resolveExcelPath(req.query.filePath);
    const workbook = readWorkbook(filePath);

    res.json({
      filePath,
      availableSheets: workbook.sheetNames,
      sheetsWithData: workbook.sheets.map((sheet) => ({
        name: sheet.name,
        rowCount: sheet.rowCount,
      })),
    });
  } catch (error) {
    res.status(400).json({
      message: "No se pudo leer el archivo Excel",
      error: error.message,
    });
  }
});

app.post("/excel/import", requireRole("admin"), async (req, res) => {
  try {
    const { filePath: customPath, sheets, replaceExisting = false } = req.body || {};
    const filePath = resolveExcelPath(customPath);

    const workbook = readWorkbook(filePath, sheets);

    if (workbook.sheets.length === 0) {
      return res.status(400).json({
        message: "No hay hojas con datos para importar",
      });
    }

    const imported = await importSheetsToFirestore(workbook.sheets, Boolean(replaceExisting));

    return res.json({
      message: "Importación completada",
      filePath,
      imported,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error importando a Firebase",
      error: error.message,
    });
  }
});

app.post("/api/uploads/product-image", requireRole(["admin", "vendedor", "caja"]), upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Archivo inválido", error: "Selecciona una imagen para subir" });
  }

  return res.status(201).json({
    message: "Imagen subida",
    fileName: req.file.filename,
    url: `/uploads/products/${req.file.filename}`,
  });
});

app.get("/api/collections", requireAuth, async (req, res) => {
  try {
    const collections = await listCollections();

    return res.json({ collections: sanitizeCollectionList(collections).filter((name) => canAccessCollection(req.session, name, "GET")) });
  } catch (error) {
    return res.status(500).json({
      message: "Error listando colecciones",
      error: error.message,
    });
  }
});

app.get("/api/collections/:collection/items", requireCollectionPermission, async (req, res) => {
  try {
    const limit = Number(req.query.limit || 200);
    const data = await listItems(req.params.collection, limit);

    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      message: "Error listando registros",
      error: error.message,
    });
  }
});

app.post("/api/collections/:collection/items", requireCollectionPermission, async (req, res) => {
  try {
    const data = await createItem(req.params.collection, req.body, { actor: req.session.user });
    return res.status(201).json(data);
  } catch (error) {
    return res.status(400).json({
      message: "Error creando registro",
      error: error.message,
    });
  }
});

app.put("/api/collections/:collection/items/:id", requireCollectionPermission, async (req, res) => {
  try {
    const data = await updateItem(req.params.collection, req.params.id, req.body, { actor: req.session.user });
    return res.json(data);
  } catch (error) {
    return res.status(400).json({
      message: "Error actualizando registro",
      error: error.message,
    });
  }
});

app.delete("/api/collections/:collection/items/:id", requireCollectionPermission, async (req, res) => {
  try {
    const data = await deleteItem(req.params.collection, req.params.id);
    return res.json(data);
  } catch (error) {
    return res.status(400).json({
      message: "Error eliminando registro",
      error: error.message,
    });
  }
});

app.get("/", (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "public", "index.html"));
});

module.exports = app;
