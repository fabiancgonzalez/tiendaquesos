const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const multer = require("multer");

const { readWorkbook } = require("./services/excel.service");
const { importSheetsToFirestore } = require("./services/firestore-import.service");
const {
  listCollections,
  listItems,
  createItem,
  updateItem,
  deleteItem,
} = require("./services/firestore-crud.service");
const {
  attachSession,
  authenticateUser,
  clearSessionCookie,
  createSessionForUser,
  destroySessionFromRequest,
  ensureDefaultAdminUser,
  requireAuth,
  requireRole,
  setSessionCookie,
} = require("./services/auth.service");
const { notifyOrderCreated } = require("./services/notification.service");
const { getWhatsAppState, initializeWhatsAppWeb } = require("./services/whatsappweb.service");

dotenv.config();

const app = express();
const uploadsDir = path.resolve(process.cwd(), "uploads", "products");

fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const safeBaseName = path
        .basename(file.originalname, path.extname(file.originalname))
        .replace(/[^a-z0-9_-]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
      const uniqueName = `${Date.now()}-${safeBaseName || "producto"}${path.extname(file.originalname || ".jpg")}`;
      cb(null, uniqueName);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const HIDDEN_COLLECTIONS = new Set(["_auth_sessions"]);
const SELLER_WRITE_COLLECTIONS = new Set(["articulos", "categorias", "clientes", "datos"]);

app.use(cors());
app.use(attachSession);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.resolve(process.cwd(), "public")));
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

ensureDefaultAdminUser().catch((error) => {
  console.error("No se pudo asegurar el usuario admin por defecto:", error.message);
});

initializeWhatsAppWeb().catch((error) => {
  console.error("No se pudo inicializar whatsappweb:", error.message);
});

function resolveExcelPath(customPath) {
  const defaultPath = process.env.EXCEL_FILE_PATH || "./Fabian Gonzalez FACTURASV3.xlsx";
  const rawPath = customPath || defaultPath;

  return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
}

function sanitizeCollectionList(collections) {
  return collections.filter((collection) => !HIDDEN_COLLECTIONS.has(collection));
}

function canAccessCollection(session, collectionName, method) {
  const collection = String(collectionName || "").trim().toLowerCase();

  if (!session?.user) {
    return false;
  }

  if (session.user.rol === "admin") {
    return !HIDDEN_COLLECTIONS.has(collection);
  }

  if (collection === "usuarios" || HIDDEN_COLLECTIONS.has(collection)) {
    return false;
  }

  if (method === "GET") {
    return true;
  }

  return SELLER_WRITE_COLLECTIONS.has(collection);
}

function requireCollectionPermission(req, res, next) {
  if (!canAccessCollection(req.session, req.params.collection, req.method)) {
    return res.status(req.session?.user ? 403 : 401).json({
      message: req.session?.user ? "Acceso denegado" : "No autenticado",
      error: req.session?.user ? "No tienes permisos para esta colección" : "Inicia sesión para continuar",
    });
  }

  return next();
}

function buildStoreOrderPayload(payload) {
  const customer = payload?.cliente || {};
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const lineas = items
    .map((item) => ({
      articulo_id: item.id,
      concepto: item.nombre,
      cantidad: Number(item.cantidad || 0),
      precio: Number(item.precio || 0),
      impuesto: Number(item.impuesto || 0),
      total_linea: Number((Number(item.cantidad || 0) * Number(item.precio || 0)).toFixed(2)),
    }))
    .filter((item) => item.articulo_id && item.cantidad > 0);

  if (!customer.nombre || !customer.telefono || !customer.email || !lineas.length) {
    throw new Error("Debes completar cliente, teléfono, email y al menos un producto");
  }

  const subtotal = Number(lineas.reduce((sum, line) => sum + Number(line.total_linea || 0), 0).toFixed(2));
  const kilosTotales = Number(lineas.reduce((sum, line) => sum + Number(line.cantidad || 0), 0).toFixed(2));

  return {
    salePayload: {
      vendedor: "Tienda Web",
      cliente: customer.nombre,
      cliente_email: customer.email || "",
      cliente_telefono: customer.telefono,
      direccion_entrega: customer.direccion || "",
      observaciones: customer.observaciones || "Pedido generado desde la tienda web",
      n_factura: `WEB-${Date.now()}`,
      fecha: new Date().toISOString().slice(0, 10),
      subtotal,
      total: subtotal,
      forma_de_pago: payload.forma_de_pago || "Pendiente",
      canal: "tienda_web",
      lineas,
      lineas_count: lineas.length,
      kilos_totales: kilosTotales,
    },
    orderPayload: {
      cliente: {
        nombre: customer.nombre,
        email: customer.email || "",
        telefono: customer.telefono || "",
        direccion: customer.direccion || "",
      },
      forma_de_pago: payload.forma_de_pago || "Pendiente",
      observaciones: customer.observaciones || "",
      estado: "pendiente",
      subtotal,
      total: subtotal,
      canal: "tienda_web",
      lineas,
      lineas_count: lineas.length,
    },
  };
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
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
