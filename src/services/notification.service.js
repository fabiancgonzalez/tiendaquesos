const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { db } = require("../config/firebase");
const { sendWhatsAppMessage, getWhatsAppState } = require("./whatsappweb.service");
let MessageMedia;
try {
  // Carga dinámica para evitar error circular si no existe
  MessageMedia = require("../whatsappweb/src/structures/MessageMedia");
} catch (e) {
  MessageMedia = null;
}

// Lee los datos de la empresa desde el archivo Markdown
function getCompanyData() {
  const filePath = path.resolve(__dirname, "../datosempresa.md");
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const [nombre, direccion, telefono, correo] = content.split(/\r?\n/);
    return {
      nombre: nombre || "Empresa",
      direccion: direccion || "",
      telefono: telefono ? telefono.replace(/^Te:\s*/, "") : "",
      correo: correo ? correo.replace(/^Correo:/, "") : "",
    };
  } catch (e) {
    return { nombre: "Empresa", direccion: "", telefono: "", correo: "" };
  }
}

// Genera un buffer PDF de la factura
async function generateInvoicePDF({ order, sale, customer, facturanumero }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const buffers = [];
    const empresa = getCompanyData();
    const logoPath = path.resolve(__dirname, "../../public/img/LOGO_SANTA_TERESA.jpg");

    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => {
      const pdfData = Buffer.concat(buffers);
      if (!pdfData || !Buffer.isBuffer(pdfData) || pdfData.length === 0) {
        console.error("[PDF] Error: El buffer PDF está vacío o no es válido");
      } else {
        console.log(`[PDF] PDF generado correctamente. Tamaño: ${pdfData.length} bytes`);
      }
      resolve(pdfData);
    });

    // Logo
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 40, 40, { width: 100 });
    }

    // Empresa
    doc.fontSize(18).text(empresa.nombre, 160, 40);
    doc.fontSize(10).text(empresa.direccion, 160, 65);
    doc.text(`Tel: ${empresa.telefono}`, 160, 80);
    doc.text(`Correo: ${empresa.correo}`, 160, 95);

  doc.moveDown().fontSize(14).text(`Factura N°: ${facturanumero || "00000001"}`, { align: "right" });
    doc.fontSize(10).text(`N°: ${sale?.n_factura || order?.id || "-"}`, { align: "right" });
    doc.text(`Fecha: ${sale?.fecha || order?.created_at || "-"}`, { align: "right" });

    // Cliente (forzar teléfono desde varias fuentes)
    const telefonoCliente = customer?.telefono || customer?.phone || sale?.cliente?.telefono || order?.cliente?.telefono || order?.telefono || sale?.telefono || "-";
    const vendedor = customer?.vendedor || order?.vendedor || sale?.vendedor || "tiendaweb";
    doc.moveDown().fontSize(12).text("Cliente:", 40, 140);
    doc.fontSize(10).text(`Nombre: ${customer?.nombre || "-"}`, 40, 160);
    doc.text(`Teléfono: ${telefonoCliente}`, 40, 175);
    doc.text(`Email: ${customer?.email || "-"}`, 40, 190);
    if (customer?.direccion) doc.text(`Dirección: ${customer.direccion}`, 40, 205);
    doc.text(`Vendedor: ${vendedor}`, 40, 220);

    // Tabla de productos
    doc.moveDown().fontSize(12).text("Detalle de productos:", 40, 230);
    const startY = 250;
    let y = startY;
    doc.fontSize(10).text("Producto", 40, y);
    doc.text("Cantidad", 200, y);
    doc.text("Precio", 270, y);
    doc.text("Total", 340, y);
    y += 15;
    doc.moveTo(40, y).lineTo(500, y).stroke();
    y += 5;
    (order?.lineas || []).forEach((line) => {
      doc.text(line.concepto || line.articulo_id || "Producto", 40, y);
      doc.text(String(line.cantidad), 200, y);
      doc.text(`$${Number(line.precio).toFixed(2)}`, 270, y);
      doc.text(`$${Number(line.total_linea || (line.cantidad * line.precio)).toFixed(2)}`, 340, y);
      y += 15;
    });
    y += 10;
    doc.moveTo(40, y).lineTo(500, y).stroke();

    // Totales
    y += 10;
    doc.fontSize(12).text(`Total: $${Number(order?.total || sale?.total).toFixed(2)}`, 340, y);

    doc.end();
  });
}

function normalizePhone(value) {
  return String(value || "").replace(/\D+/g, "");
}

function toCurrency(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function toDate(value) {
  const parsed = new Date(value || Date.now());
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function buildOrderText({ order, sale, customer, facturanumero }) {
  const items = Array.isArray(order?.lineas)
    ? order.lineas
        .map((line) => `- ${line.concepto || line.articulo_id || "Producto"}: ${Number(line.cantidad || 0)} x $${toCurrency(line.precio)}`)
        .join("\n")
    : "- Sin detalle";
  return [
    "Nuevo pedido TIENDAFERNANDEZ",
    `Factura N°: ${facturanumero || "s/n"}`,
    `Pedido: ${order?.id || "s/n"}`,
    `Venta: ${sale?.id || "s/n"}`,
    `Fecha: ${toDate(order?.created_at || sale?.created_at)}`,
    `Cliente: ${customer?.nombre || "-"}`,
    `Dirección: ${customer?.direccion || "-"}`,
    `Teléfono: ${customer?.telefono || customer?.phone || sale?.cliente?.telefono || order?.cliente?.telefono || order?.telefono || sale?.telefono || "-"}`,
    `Email: ${customer?.email || "-"}`,
    `Vendedor: ${customer?.vendedor || order?.vendedor || sale?.vendedor || "tiendaweb"}`,
    `Total: $${toCurrency(order?.total || sale?.total)}`,
    "",
    "Detalle:",
    items,
  ].join("\n");
}

function buildPdfMetadata({ order, sale, pdfFilePath, pdfBuffer }) {
  const fecha = (order?.created_at || sale?.created_at || new Date().toISOString()).slice(0, 10);
  const pdfFileName = pdfFilePath ? path.basename(pdfFilePath) : `pedido_${order?.id || sale?.id || Date.now()}.pdf`;
  const pdfUrl = pdfFileName ? `/pedidosPDF/${encodeURIComponent(pdfFileName)}` : null;

  return {
    collection: "pedidos_pdf",
    order_id: order?.id || "",
    sale_id: sale?.id || "",
    file_name: pdfFileName,
    file_path: pdfFilePath || "",
    url: pdfUrl,
    mime_type: "application/pdf",
    size: pdfBuffer?.length || 0,
    fecha,
    created_at: new Date().toISOString(),
  };
}

async function resolveSellerRecipient(customer, order, sale) {
  const sellerName = String(customer?.vendedor || order?.vendedor || sale?.vendedor || "").trim();
  const fallbackEmail = String(process.env.SELLER_EMAIL || "").trim();
  const fallbackPhone = normalizePhone(process.env.SELLER_WHATSAPP || "");

  if (!sellerName) {
    return { nombre: "", email: fallbackEmail, telefono: fallbackPhone };
  }

  try {
    let snapshot = await db.collection("usuarios").where("nombre", "==", sellerName).limit(1).get();

    if (snapshot.empty && sellerName.includes("@")) {
      snapshot = await db.collection("usuarios").where("email", "==", sellerName.toLowerCase()).limit(1).get();
    }

    if (!snapshot.empty) {
      const seller = snapshot.docs[0].data();
      return {
        nombre: seller.nombre || sellerName,
        email: String(seller.email || fallbackEmail).trim().toLowerCase(),
        telefono: normalizePhone(seller.telefono || fallbackPhone),
      };
    }
  } catch (error) {
    console.error("[NOTIFY] No se pudo resolver el vendedor:", error.message);
  }

  return { nombre: sellerName, email: fallbackEmail, telefono: fallbackPhone };
}

async function persistPdfData({ order, sale, pdfFilePath, pdfBuffer }) {
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || !pdfBuffer.length) {
    return null;
  }

  const pdfMeta = {
    ...buildPdfMetadata({ order, sale, pdfFilePath, pdfBuffer }),
    base64: pdfBuffer.toString("base64"),
  };

  try {
    const pdfRef = db.collection("pedidos_pdf").doc(order?.id || sale?.id || undefined);
    await pdfRef.set(pdfMeta, { merge: true });

    const sharedMeta = {
      pdf_id: pdfRef.id,
      pdf_file_name: pdfMeta.file_name,
      pdf_file_path: pdfMeta.file_path,
      pdf_url: pdfMeta.url,
      pdf_size: pdfMeta.size,
      pdf_saved_at: new Date().toISOString(),
    };

    if (sale?.id) {
      await db.collection("datos").doc(sale.id).set(sharedMeta, { merge: true });
    }

    if (order?.id) {
      await db.collection("pedidos_web").doc(order.id).set(sharedMeta, { merge: true });
    }

    return { id: pdfRef.id, ...pdfMeta };
  } catch (error) {
    console.error("[PDF] Error guardando PDF en Firestore:", error.message);
    return null;
  }
}

function buildWhatsAppLink(phone, text) {
  const normalized = normalizePhone(phone);

  if (!normalized) {
    return null;
  }

  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}

function buildMailtoLink(email, subject, body) {
  const to = String(email || "").trim();

  if (!to) {
    return null;
  }

  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function createTransportIfConfigured() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: {
      user,
      pass,
    },
  });
}

async function sendEmailIfPossible(transport, to, subject, text, pdfBuffer) {
  if (!to) {
    return { requested: false, sent: false, to: "", error: "sin-destino" };
  }
  if (!transport) {
    return { requested: true, sent: false, to, error: "smtp-no-configurado" };
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  try {
    const mailOptions = {
      from,
      to,
      subject,
      text,
    };
    if (pdfBuffer && Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 0) {
      mailOptions.attachments = [
        {
          filename: "factura.pdf",
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ];
      console.log(`[EMAIL] Adjuntando PDF de ${pdfBuffer.length} bytes a ${to}`);
    } else if (pdfBuffer) {
      console.error(`[EMAIL] El buffer PDF es inválido o vacío, no se adjunta. Tamaño: ${pdfBuffer.length || 0}`);
    }
    await transport.sendMail(mailOptions);
    return { requested: true, sent: true, to, error: null };
  } catch (error) {
    console.error(`[EMAIL] Error enviando correo a ${to}:`, error);
    return { requested: true, sent: false, to, error: error.message };
  }
}

async function notifyOrderCreated({ order, sale, customer }) {
    console.log("[DEBUG] Datos recibidos en notifyOrderCreated:");
    console.log("order:", JSON.stringify(order));
    console.log("sale:", JSON.stringify(sale));
    console.log("customer:", JSON.stringify(customer));
  const adminPhone = process.env.ADMIN_WHATSAPP || "";
  const adminEmail = process.env.ADMIN_EMAIL || "ceferinomonier@gmail.com";
  const buyerPhone = customer?.telefono || "";
  const buyerEmail = customer?.email || "";

  // Calcular número de factura correlativo
  let facturanumero = sale?.n_factura;
  if (!facturanumero) {
    try {
      const { db } = require("../config/firebase");
      const snapshot = await db.collection("datos").get();
      facturanumero = String(snapshot.size + 1).padStart(8, "0");
    } catch (e) {
      facturanumero = "00000001";
    }
  }
  const text = buildOrderText({ order, sale, customer, facturanumero });
  const subject = `Pedido ${order?.id || "s/n"} - TIENDAFERNANDEZ`;
  const transport = createTransportIfConfigured();

  // Generar PDF de factura y guardarlo en pedidosPDF
  let pdfBuffer = null;
  let pdfFilePath = null;
  try {
    pdfBuffer = await generateInvoicePDF({ order, sale, customer, facturanumero });
    console.log(`[DEBUG] PDF generado. Buffer: ${pdfBuffer ? pdfBuffer.length : 'null'} bytes`);
    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
      console.error("[PDF] El PDF generado es nulo o vacío, no se adjuntará");
      pdfBuffer = null;
    } else {
      // Guardar PDF en carpeta pedidosPDF
      const pedidosPDFDir = path.resolve(process.cwd(), "pedidosPDF");
      if (!fs.existsSync(pedidosPDFDir)) {
        fs.mkdirSync(pedidosPDFDir, { recursive: true });
      }
      const fecha = (order?.created_at || new Date().toISOString()).slice(0, 10);
      const pdfFileName = `pedido_${order?.id || Date.now()}.pdf`;
      pdfFilePath = path.join(pedidosPDFDir, `${fecha}_${pdfFileName}`);
      fs.writeFileSync(pdfFilePath, pdfBuffer);
      console.log(`[PDF] Guardado en: ${pdfFilePath}`);
    }
  } catch (e) {
    console.error("[PDF] Error generando o guardando PDF:", e);
    pdfBuffer = null;
    pdfFilePath = null;
  }
  if (!pdfBuffer) {
    console.error("[DEBUG] El buffer PDF es nulo antes de enviar correo o WhatsApp");
  }

  const buyerEmailResult = await sendEmailIfPossible(transport, buyerEmail, subject, text, pdfBuffer);
  const adminEmailResult = await sendEmailIfPossible(transport, adminEmail, subject, text, pdfBuffer);


  // WhatsApp: enviar PDF como documento si es posible
  let buyerWhatsAppResult, adminWhatsAppResult;
  if (MessageMedia && pdfBuffer && Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 0) {
    try {
      const base64pdf = pdfBuffer.toString("base64");
      if (!base64pdf || base64pdf.length < 100) {
        console.error("[WA] El PDF convertido a base64 es inválido o muy pequeño");
        throw new Error("PDF base64 inválido");
      }
      const media = new MessageMedia(
        "application/pdf",
        base64pdf,
        "factura.pdf"
      );
      console.log(`[WA] Enviando PDF por WhatsApp (${base64pdf.length} chars) a comprador y admin`);
      buyerWhatsAppResult = await sendWhatsAppMessage(buyerPhone, media, { caption: text, sendMediaAsDocument: true });
      adminWhatsAppResult = await sendWhatsAppMessage(adminPhone, media, { caption: text, sendMediaAsDocument: true });
    } catch (e) {
      console.error("[WA] Error enviando PDF por WhatsApp, se enviará solo texto:", e);
      buyerWhatsAppResult = await sendWhatsAppMessage(buyerPhone, text);
      adminWhatsAppResult = await sendWhatsAppMessage(adminPhone, text);
    }
  } else {
    if (!MessageMedia) console.error("[WA] MessageMedia no está disponible, no se puede enviar PDF");
    if (!pdfBuffer) console.error("[WA] El buffer PDF es nulo, no se puede enviar PDF");
    buyerWhatsAppResult = await sendWhatsAppMessage(buyerPhone, text);
    adminWhatsAppResult = await sendWhatsAppMessage(adminPhone, text);
  }

  return {
    whatsapp: {
      buyer: {
        phone: buyerPhone,
        ...buyerWhatsAppResult,
        url: buildWhatsAppLink(buyerPhone, text),
      },
      admin: {
        phone: adminPhone,
        ...adminWhatsAppResult,
        url: buildWhatsAppLink(adminPhone, text),
      },
      state: getWhatsAppState(),
    },
    email: {
      smtpConfigured: Boolean(transport),
      buyer: {
        ...buyerEmailResult,
        mailto: buildMailtoLink(buyerEmail, subject, text),
      },
      admin: {
        ...adminEmailResult,
        mailto: buildMailtoLink(adminEmail, subject, text),
      },
    },
    pdf: Boolean(pdfBuffer),
    pdfFilePath: pdfFilePath,
    pdfFileName: pdfFilePath ? path.basename(pdfFilePath) : null,
    pdfDate: pdfFilePath ? pdfFilePath.match(/(\d{4}-\d{2}-\d{2})/)?.[1] : null,
  };
}

module.exports = {
  notifyOrderCreated,
};
