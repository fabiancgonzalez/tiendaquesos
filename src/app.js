
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const multer = require("multer");
const app = express();




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

function formatPhoneArgentina(telefono) {
  const digits = String(telefono || "").replace(/\D+/g, "");
  if (digits.startsWith("549")) return "+" + digits;
  if (digits.startsWith("54"))  return "+549" + digits.slice(2);
  if (digits.startsWith("0"))   return "+549" + digits.slice(1);
  return "+549" + digits;
}

function normalizeCustomer(body = {}) {
  const rawCustomer = body.cliente && typeof body.cliente === "object" ? body.cliente : {};
  const nombre = String(rawCustomer.nombre || body.nombre || "").trim();
  const email = String(rawCustomer.email || body.email || "").trim().toLowerCase();
  const telefono = String(rawCustomer.telefono || body.telefono || "").replace(/\D+/g, "");
  const direccion = String(rawCustomer.direccion || body.direccion || "").trim();
  const observaciones = String(rawCustomer.observaciones || body.observaciones || "").trim();
  const vendedor = String(body.vendedor || rawCustomer.vendedor || "Tienda Web").trim();

  return {
    nombre,
    email,
    telefono,
    telefono_whatsapp: telefono,
    telefono_formateado: telefono ? formatPhoneArgentina(telefono) : "",
    direccion,
    observaciones,
    vendedor,
  };
}

function normalizeStoreLineItems(items = []) {
  return Array.isArray(items)
    ? items
        .map((item) => {
          const cantidad = Number(item.cantidad || 0);
          const precio = Number(item.precio || 0);
          const impuesto = Number(item.impuesto || 0);

          return {
            articulo_id: String(item.id || item.articulo_id || "").trim(),
            concepto: String(item.nombre || item.concepto || item.articulo_id || "Producto").trim(),
            cantidad,
            precio,
            impuesto,
            total_linea: Number((cantidad * precio).toFixed(2)),
            imagen: String(item.imagen || "").trim(),
          };
        })
        .filter((item) => item.cantidad > 0)
    : [];
}

// --- Utilidad para construir el payload del pedido desde el body ---
function buildStoreOrderPayload(body = {}) {
  // Estructura mínima para que funcione el endpoint
  // Puedes personalizar los campos según tu modelo de datos
  const cliente = normalizeCustomer(body);
  const items = normalizeStoreLineItems(body.items || []);
  const forma_de_pago = body.forma_de_pago || "Pendiente";
  const direccion = cliente.direccion || "";
  const telefono = cliente.telefono || "";
  const observaciones = cliente.observaciones || "";
  const vendedor = cliente.vendedor || "Tienda Web";

  const total = items.reduce((sum, item) => sum + Number(item.total_linea || 0), 0);

  // Payload para la colección de ventas ("datos")
  const salePayload = {
    cliente: cliente.nombre || "",
    cliente_detalle: cliente,
    items,
    lineas: items,
    forma_de_pago,
    direccion,
    telefono,
    email: cliente.email,
    observaciones,
    total,
    vendedor,
    fecha: new Date().toISOString().slice(0, 10),
    created_at: new Date().toISOString(),
    estado: "Pendiente",
  };

  // Payload para la colección de pedidos_web
  const orderPayload = {
    cliente: cliente.nombre || "",
    cliente_detalle: cliente,
    lineas: items,
    forma_de_pago,
    direccion,
    observaciones,
    total,
    telefono,
    email: cliente.email,
    vendedor,
    created_at: new Date().toISOString(),
    estado: "Pendiente",
  };

  return { salePayload, orderPayload, customer: cliente };
}

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
      //phoneNumber: telefono.startsWith("+") ? telefono : "+" + telefono.replace(/\D+/g, ""),
      phoneNumber: formatPhoneArgentina(telefono),
      disabled: false,
    });

    // Guardar datos extra en Firestore
    const db = require("../src/config/firebase").db;
    await db.collection("usuarios").doc(newUser.uid).set({
      nombre,
      email,
      telefono: String(telefono || "").replace(/\D+/g, ""),
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
    const { salePayload, orderPayload, customer } = buildStoreOrderPayload(req.body || {});
    // Siempre priorizar el teléfono del payload si existe
    const sale = await createItem("datos", salePayload, {
      actor: { nombre: "Tienda Web", email: "ceferinomonier@gmail.com" },
      skipNotification: true,
    });
    const order = await createItem("pedidos_web", {
      ...orderPayload,
      venta_id: sale.item.id,
    });
    const notification = await notifyOrderCreated({
      order: order.item,
      sale: sale.item,
      customer,
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




// --- Al final del archivo: Endpoint y static para PDFs de pedidos ---
const pedidosPDFDir = require("path").resolve(process.cwd(), "pedidosPDF");
app.get("/api/pedidosPDF", requireRole("admin"), (req, res) => {
  const { fecha } = req.query;
  try {
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return res.status(400).json({ error: "Fecha requerida en formato YYYY-MM-DD" });
    }
    if (!fs.existsSync(pedidosPDFDir)) {
      return res.json({ pdfs: [] });
    }
    const files = fs.readdirSync(pedidosPDFDir)
      .filter(f => f.startsWith(fecha + "_"))
      .map(f => ({
        name: f,
        url: `/pedidosPDF/${encodeURIComponent(f)}`
      }));
    res.json({ pdfs: files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.use("/pedidosPDF", express.static(pedidosPDFDir));
// --- Helpers de permisos y colecciones ---
function sanitizeCollectionList(collections) {
  // Filtra colecciones ocultas o internas si es necesario
  return (collections || []).filter(
    (name) => !name.startsWith("_") && name !== "migrations"
  );
}

app.get("/", (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "public", "index.html"));
});

module.exports = app;
