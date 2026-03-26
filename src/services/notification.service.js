const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
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
async function generateInvoicePDF({ order, sale, customer }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const buffers = [];
    const empresa = getCompanyData();
    const logoPath = path.resolve(__dirname, "../../public/img/LOGO_SANTA_TERESA.jpg");

    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => {
      const pdfData = Buffer.concat(buffers);
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

    // Factura info
    doc.moveDown().fontSize(14).text("Factura", { align: "right" });
    doc.fontSize(10).text(`N°: ${sale?.n_factura || order?.id || "-"}`, { align: "right" });
    doc.text(`Fecha: ${sale?.fecha || order?.created_at || "-"}`, { align: "right" });

    // Cliente
    doc.moveDown().fontSize(12).text("Cliente:", 40, 140);
    doc.fontSize(10).text(`Nombre: ${customer?.nombre || "-"}`, 40, 160);
    doc.text(`Teléfono: ${customer?.telefono || "-"}`, 40, 175);
    doc.text(`Email: ${customer?.email || "-"}`, 40, 190);
    if (customer?.direccion) doc.text(`Dirección: ${customer.direccion}`, 40, 205);

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

function buildOrderText({ order, sale, customer }) {
  const items = Array.isArray(order?.lineas)
    ? order.lineas
        .map((line) => `- ${line.concepto || line.articulo_id || "Producto"}: ${Number(line.cantidad || 0)} x $${toCurrency(line.precio)}`)
        .join("\n")
    : "- Sin detalle";

  return [
    "Nuevo pedido TIENDAFERNANDEZ",
    `Pedido: ${order?.id || "s/n"}`,
    `Venta: ${sale?.id || "s/n"}`,
    `Fecha: ${toDate(order?.created_at || sale?.created_at)}`,
    `Cliente: ${customer?.nombre || "-"}`,
    `Dirección: ${customer?.direccion || "-"}`,
    `Teléfono: ${customer?.telefono || "-"}`,
    `Email: ${customer?.email || "-"}`,
    `Total: $${toCurrency(order?.total || sale?.total)}`,
    "",
    "Detalle:",
    items,
  ].join("\n");
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
    if (pdfBuffer) {
      mailOptions.attachments = [
        {
          filename: "factura.pdf",
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ];
    }
    await transport.sendMail(mailOptions);
    return { requested: true, sent: true, to, error: null };
  } catch (error) {
    return { requested: true, sent: false, to, error: error.message };
  }
}

async function notifyOrderCreated({ order, sale, customer }) {
  const adminPhone = process.env.ADMIN_WHATSAPP || "";
  const adminEmail = process.env.ADMIN_EMAIL || "ceferinomonier@gmail.com";
  const buyerPhone = customer?.telefono || "";
  const buyerEmail = customer?.email || "";

  const text = buildOrderText({ order, sale, customer });
  const subject = `Pedido ${order?.id || "s/n"} - TIENDAFERNANDEZ`;
  const transport = createTransportIfConfigured();

  // Generar PDF de factura
  let pdfBuffer = null;
  try {
    pdfBuffer = await generateInvoicePDF({ order, sale, customer });
  } catch (e) {
    pdfBuffer = null;
  }

  const buyerEmailResult = await sendEmailIfPossible(transport, buyerEmail, subject, text, pdfBuffer);
  const adminEmailResult = await sendEmailIfPossible(transport, adminEmail, subject, text, pdfBuffer);


  // WhatsApp: enviar PDF como documento si es posible
  let buyerWhatsAppResult, adminWhatsAppResult;
  if (MessageMedia && pdfBuffer) {
    try {
      const media = new MessageMedia(
        "application/pdf",
        pdfBuffer.toString("base64"),
        "factura.pdf"
      );
      buyerWhatsAppResult = await sendWhatsAppMessage(buyerPhone, media, { caption: text, sendMediaAsDocument: true });
      adminWhatsAppResult = await sendWhatsAppMessage(adminPhone, media, { caption: text, sendMediaAsDocument: true });
    } catch (e) {
      // Si falla, enviar solo texto
      buyerWhatsAppResult = await sendWhatsAppMessage(buyerPhone, text);
      adminWhatsAppResult = await sendWhatsAppMessage(adminPhone, text);
    }
  } else {
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
  };
}

module.exports = {
  notifyOrderCreated,
};