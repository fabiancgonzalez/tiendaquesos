const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { db } = require("../config/firebase");
const { sendWhatsAppMessage, getWhatsAppState } = require("./whatsappweb.service");

let MessageMedia;
try {
  MessageMedia = require("../whatsappweb/src/structures/MessageMedia");
} catch (_error) {
  MessageMedia = null;
}

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
  } catch (_error) {
    return { nombre: "Empresa", direccion: "", telefono: "", correo: "" };
  }
}

async function generateInvoicePDF({ order, sale, customer, facturanumero }) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const buffers = [];
    const empresa = getCompanyData();
    const logoPath = path.resolve(__dirname, "../../public/img/LOGO_SANTA_TERESA.jpg");

    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => resolve(Buffer.concat(buffers)));

    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 40, 40, { width: 100 });
    }

    doc.fontSize(18).text(empresa.nombre, 160, 40);
    doc.fontSize(10).text(empresa.direccion, 160, 65);
    doc.text(`Tel: ${empresa.telefono}`, 160, 80);
    doc.text(`Correo: ${empresa.correo}`, 160, 95);

    doc.moveDown().fontSize(14).text(`Factura N°: ${facturanumero || "00000001"}`, { align: "right" });
    doc.fontSize(10).text(`N°: ${sale?.n_factura || order?.id || "-"}`, { align: "right" });
    doc.text(`Fecha: ${sale?.fecha || order?.created_at || "-"}`, { align: "right" });

    const telefonoCliente = customer?.telefono || order?.telefono || sale?.telefono || "-";
    const vendedor = customer?.vendedor || order?.vendedor || sale?.vendedor || "tiendaweb";
    doc.moveDown().fontSize(12).text("Cliente:", 40, 140);
    doc.fontSize(10).text(`Nombre: ${customer?.nombre || sale?.cliente || order?.cliente || "-"}`, 40, 160);
    doc.text(`Teléfono: ${telefonoCliente}`, 40, 175);
    doc.text(`Email: ${customer?.email || order?.email || sale?.email || "-"}`, 40, 190);
    if (customer?.direccion) doc.text(`Dirección: ${customer.direccion}`, 40, 205);
    doc.text(`Vendedor: ${vendedor}`, 40, 220);

    doc.moveDown().fontSize(12).text("Detalle de productos:", 40, 230);
    let y = 250;
    doc.fontSize(10).text("Producto", 40, y);
    doc.text("Cantidad", 200, y);
    doc.text("Precio", 270, y);
    doc.text("Total", 340, y);
    y += 15;
    doc.moveTo(40, y).lineTo(500, y).stroke();
    y += 5;

    (order?.lineas || sale?.lineas || []).forEach((line) => {
      doc.text(line.concepto || line.articulo_id || "Producto", 40, y);
      doc.text(String(line.cantidad || 0), 200, y);
      doc.text(`$${Number(line.precio || 0).toFixed(2)}`, 270, y);
      doc.text(`$${Number(line.total_linea || Number(line.cantidad || 0) * Number(line.precio || 0)).toFixed(2)}`, 340, y);
      y += 15;
    });

    y += 10;
    doc.moveTo(40, y).lineTo(500, y).stroke();
    y += 10;
    doc.fontSize(12).text(`Total: $${Number(order?.total || sale?.total || 0).toFixed(2)}`, 340, y);
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
  const items = Array.isArray(order?.lineas || sale?.lineas)
    ? (order?.lineas || sale?.lineas)
        .map((line) => `- ${line.concepto || line.articulo_id || "Producto"}: ${Number(line.cantidad || 0)} x $${toCurrency(line.precio)}`)
        .join("\n")
    : "- Sin detalle";

  return [
    "Nuevo pedido TIENDAFERNANDEZ",
    `Factura N°: ${facturanumero || "s/n"}`,
    `Pedido: ${order?.id || "s/n"}`,
    `Venta: ${sale?.id || "s/n"}`,
    `Fecha: ${toDate(order?.created_at || sale?.created_at)}`,
    `Cliente: ${customer?.nombre || sale?.cliente || order?.cliente || "-"}`,
    `Dirección: ${customer?.direccion || sale?.direccion || order?.direccion || "-"}`,
    `Teléfono: ${customer?.telefono || order?.telefono || sale?.telefono || "-"}`,
    `Email: ${customer?.email || order?.email || sale?.email || "-"}`,
    `Vendedor: ${customer?.vendedor || order?.vendedor || sale?.vendedor || "tiendaweb"}`,
    `Total: $${toCurrency(order?.total || sale?.total)}`,
    "",
    "Detalle:",
    items,
  ].join("\n");
}

function buildWhatsAppLink(phone, text) {
  const normalized = normalizePhone(phone);
  return normalized ? `https://wa.me/${normalized}?text=${encodeURIComponent(text)}` : null;
}

function buildMailtoLink(email, subject, body) {
  const to = String(email || "").trim();
  return to ? `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : null;
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
    auth: { user, pass },
  });
}

async function sendEmailIfPossible(transport, to, subject, text, pdfBuffer, fileName = "factura.pdf") {
  if (!to) {
    return { requested: false, sent: false, to: "", error: "sin-destino" };
  }
  if (!transport) {
    return { requested: true, sent: false, to, error: "smtp-no-configurado" };
  }

  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
    };

    if (pdfBuffer && Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 0) {
      mailOptions.attachments = [{
        filename: fileName,
        content: pdfBuffer,
        contentType: "application/pdf",
      }];
    }

    await transport.sendMail(mailOptions);
    return { requested: true, sent: true, to, error: null };
  } catch (error) {
    console.error(`[EMAIL] Error enviando correo a ${to}:`, error.message);
    return { requested: true, sent: false, to, error: error.message };
  }
}

function buildPdfMetadata({ order, sale, pdfFilePath, pdfBuffer }) {
  const fecha = (order?.created_at || sale?.created_at || new Date().toISOString()).slice(0, 10);
  const fileName = pdfFilePath ? path.basename(pdfFilePath) : `pedido_${order?.id || sale?.id || Date.now()}.pdf`;
  return {
    order_id: order?.id || "",
    sale_id: sale?.id || "",
    file_name: fileName,
    file_path: pdfFilePath || "",
    url: `/pedidosPDF/${encodeURIComponent(fileName)}`,
    mime_type: "application/pdf",
    size: pdfBuffer?.length || 0,
    fecha,
    created_at: new Date().toISOString(),
  };
}

async function resolveSellerRecipient(customer, order, sale) {
  const sellerName = String(customer?.vendedor || order?.vendedor || sale?.vendedor || "").trim();
  const fallback = {
    nombre: sellerName,
    email: String(process.env.SELLER_EMAIL || "").trim().toLowerCase(),
    telefono: normalizePhone(process.env.SELLER_WHATSAPP || ""),
  };

  if (!sellerName) {
    return fallback;
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
        email: String(seller.email || fallback.email).trim().toLowerCase(),
        telefono: normalizePhone(seller.telefono || fallback.telefono),
      };
    }
  } catch (error) {
    console.error("[NOTIFY] No se pudo resolver el vendedor:", error.message);
  }

  return fallback;
}

async function persistPdfData({ order, sale, pdfFilePath, pdfBuffer }) {
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || !pdfBuffer.length) {
    return null;
  }

  const metadata = buildPdfMetadata({ order, sale, pdfFilePath, pdfBuffer });
  const payload = {
    ...metadata,
    base64: pdfBuffer.toString("base64"),
  };

  try {
    const docRef = order?.id || sale?.id
      ? db.collection("pedidos_pdf").doc(order?.id || sale?.id)
      : db.collection("pedidos_pdf").doc();

    await docRef.set(payload, { merge: true });

    const sharedMeta = {
      pdf_id: docRef.id,
      pdf_file_name: metadata.file_name,
      pdf_file_path: metadata.file_path,
      pdf_url: metadata.url,
      pdf_size: metadata.size,
      pdf_saved_at: new Date().toISOString(),
    };

    if (sale?.id) {
      await db.collection("datos").doc(sale.id).set(sharedMeta, { merge: true });
    }
    if (order?.id) {
      await db.collection("pedidos_web").doc(order.id).set(sharedMeta, { merge: true });
    }

    return { id: docRef.id, ...payload };
  } catch (error) {
    console.error("[PDF] Error guardando PDF en Firestore:", error.message);
    return null;
  }
}

async function notifyOrderCreated({ order, sale, customer }) {
  const safeCustomer = customer || sale?.cliente_detalle || order?.cliente_detalle || {};
  const adminPhone = normalizePhone(process.env.ADMIN_WHATSAPP || "");
  const adminEmail = String(process.env.ADMIN_EMAIL || "ceferinomonier@gmail.com").trim().toLowerCase();
  const buyerPhone = normalizePhone(safeCustomer.telefono || order?.telefono || sale?.telefono || "");
  const buyerEmail = String(safeCustomer.email || order?.email || sale?.email || "").trim().toLowerCase();
  const sellerRecipient = await resolveSellerRecipient(safeCustomer, order, sale);

  let facturanumero = sale?.n_factura;
  if (!facturanumero) {
    try {
      const snapshot = await db.collection("datos").get();
      facturanumero = String(snapshot.size + 1).padStart(8, "0");
    } catch (_error) {
      facturanumero = "00000001";
    }
  }

  const text = buildOrderText({ order, sale, customer: safeCustomer, facturanumero });
  const subject = `Pedido ${order?.id || "s/n"} - TIENDAFERNANDEZ`;
  const transport = createTransportIfConfigured();

  let pdfBuffer = null;
  let pdfFilePath = null;
  let pdfRecord = null;
  let pdfBase64 = null;

  try {
    pdfBuffer = await generateInvoicePDF({ order, sale, customer: safeCustomer, facturanumero });
    if (pdfBuffer && Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 0) {
      const pedidosPDFDir = path.resolve(process.cwd(), "pedidosPDF");
      if (!fs.existsSync(pedidosPDFDir)) {
        fs.mkdirSync(pedidosPDFDir, { recursive: true });
      }

      const fecha = (order?.created_at || sale?.created_at || new Date().toISOString()).slice(0, 10);
      const fileName = `${fecha}_pedido_${order?.id || sale?.id || Date.now()}.pdf`;
      pdfFilePath = path.join(pedidosPDFDir, fileName);
      fs.writeFileSync(pdfFilePath, pdfBuffer);
      pdfRecord = await persistPdfData({ order, sale, pdfFilePath, pdfBuffer });
      pdfBase64 = pdfBuffer.toString("base64");
    } else {
      pdfBuffer = null;
    }
  } catch (error) {
    console.error("[PDF] Error generando o guardando PDF:", error.message);
    pdfBuffer = null;
    pdfFilePath = null;
    pdfRecord = null;
    pdfBase64 = null;
  }

  const emailTargets = [
    { key: "buyer", email: buyerEmail },
    { key: "admin", email: adminEmail },
    { key: "seller", email: sellerRecipient.email },
  ];

  const emailResults = {};
  for (const target of emailTargets) {
    const result = await sendEmailIfPossible(transport, target.email, subject, text, pdfBuffer, pdfRecord?.file_name || "factura.pdf");
    emailResults[target.key] = {
      ...result,
      mailto: buildMailtoLink(target.email, subject, text),
    };
  }

  const whatsappTargets = [
    { key: "buyer", phone: buyerPhone },
    { key: "admin", phone: adminPhone },
    { key: "seller", phone: sellerRecipient.telefono },
  ];

  const whatsappResults = {};
  for (const target of whatsappTargets) {
    let result;
    if (MessageMedia && pdfBase64) {
      try {
        const media = new MessageMedia("application/pdf", pdfBase64, pdfRecord?.file_name || "factura.pdf");
        result = await sendWhatsAppMessage(target.phone, media, { caption: text, sendMediaAsDocument: true });
      } catch (error) {
        console.error(`[WA] Error enviando PDF a ${target.key}:`, error.message);
        result = await sendWhatsAppMessage(target.phone, text);
      }
    } else {
      result = await sendWhatsAppMessage(target.phone, text);
    }

    whatsappResults[target.key] = {
      phone: target.phone,
      ...result,
      url: buildWhatsAppLink(target.phone, text),
    };
  }

  return {
    whatsapp: {
      ...whatsappResults,
      state: getWhatsAppState(),
    },
    email: {
      smtpConfigured: Boolean(transport),
      ...emailResults,
    },
    pdf: Boolean(pdfBuffer),
    pdfFilePath,
    pdfFileName: pdfFilePath ? path.basename(pdfFilePath) : null,
    pdfDate: pdfFilePath ? pdfFilePath.match(/(\d{4}-\d{2}-\d{2})/)?.[1] : null,
    pdfRecord,
  };
}

module.exports = {
  notifyOrderCreated,
};
