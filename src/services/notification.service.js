const nodemailer = require("nodemailer");
const { sendWhatsAppMessage, getWhatsAppState } = require("./whatsappweb.service");

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
    "Nuevo pedido TIENDAQUESOS",
    `Pedido: ${order?.id || "s/n"}`,
    `Venta: ${sale?.id || "s/n"}`,
    `Fecha: ${toDate(order?.created_at || sale?.created_at)}`,
    `Cliente: ${customer?.nombre || "-"}`,
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

async function sendEmailIfPossible(transport, to, subject, text) {
  if (!to) {
    return { requested: false, sent: false, to: "", error: "sin-destino" };
  }

  if (!transport) {
    return { requested: true, sent: false, to, error: "smtp-no-configurado" };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  try {
    await transport.sendMail({
      from,
      to,
      subject,
      text,
    });

    return { requested: true, sent: true, to, error: null };
  } catch (error) {
    return { requested: true, sent: false, to, error: error.message };
  }
}

async function notifyOrderCreated({ order, sale, customer }) {
  const adminPhone = process.env.ADMIN_WHATSAPP || "";
  const adminEmail = process.env.ADMIN_EMAIL || "admin@tiendaquesos.local";
  const buyerPhone = customer?.telefono || "";
  const buyerEmail = customer?.email || "";

  const text = buildOrderText({ order, sale, customer });
  const subject = `Pedido ${order?.id || "s/n"} - TIENDAQUESOS`;
  const transport = createTransportIfConfigured();

  const buyerEmailResult = await sendEmailIfPossible(transport, buyerEmail, subject, text);
  const adminEmailResult = await sendEmailIfPossible(transport, adminEmail, subject, text);
  const buyerWhatsAppResult = await sendWhatsAppMessage(buyerPhone, text);
  const adminWhatsAppResult = await sendWhatsAppMessage(adminPhone, text);

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
  };
}

module.exports = {
  notifyOrderCreated,
};