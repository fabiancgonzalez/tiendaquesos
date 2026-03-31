const path = require("path");

let qrTerminal = null;

let waModule = null;
let waState = {
  enabled: String(process.env.WHATSAPPWEB_ENABLED || "false").toLowerCase() === "true",
  initialized: false,
  ready: false,
  initializing: false,
  qr: null,
  error: null,
};
let waClient = null;

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D+/g, "");
  return digits ? `${digits}@c.us` : "";
}

function tryLoadModule() {
  if (waModule) {
    return waModule;
  }

  try {
    const modulePath = path.resolve(__dirname, "..", "whatsappweb");
    waModule = require(modulePath);
    return waModule;
  } catch (error) {
    waState.error = `No se pudo cargar whatsappweb: ${error.message}`;
    return null;
  }
}

function tryLoadQrTerminal() {
  if (qrTerminal) {
    return qrTerminal;
  }

  try {
    qrTerminal = require("qrcode-terminal");
  } catch (_error) {
    qrTerminal = null;
  }

  return qrTerminal;
}

function buildQrImageUrl(qr) {
  if (!qr) {
    return null;
  }

  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(qr)}`;
}

function createClient() {
  const moduleLoaded = tryLoadModule();

  if (!moduleLoaded) {
    return null;
  }

  const { Client, LocalAuth } = moduleLoaded;

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: process.env.WHATSAPPWEB_CLIENT_ID || "tiendaquesos",
      dataPath: path.resolve(process.cwd(), ".wwebjs_auth"),
    }),
    puppeteer: {
      headless: String(process.env.WHATSAPPWEB_HEADLESS || "true").toLowerCase() !== "false",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  client.on("qr", (qr) => {
    waState.qr = qr;
    waState.ready = false;
    waState.error = "WhatsApp requiere escanear QR";
    console.log("[whatsappweb] QR recibido. Escanéalo para habilitar envíos.");

    const terminal = tryLoadQrTerminal();

    if (terminal) {
      terminal.generate(qr, { small: true });
    } else {
      console.log("[whatsappweb] Instala 'qrcode-terminal' para ver QR en consola.");
    }

    console.log(`[whatsappweb] QR URL: ${buildQrImageUrl(qr)}`);
  });

  client.on("ready", () => {
    waState.ready = true;
    waState.error = null;
    waState.qr = null;
    console.log("[whatsappweb] Cliente listo.");
  });

  client.on("auth_failure", (message) => {
    waState.ready = false;
    waState.error = `Fallo de autenticación: ${message}`;
  });

  client.on("disconnected", (reason) => {
    waState.ready = false;
    waState.error = `Cliente desconectado: ${reason}`;
  });

  return client;
}

async function initializeWhatsAppWeb() {
  if (!waState.enabled) {
    return waState;
  }

  if (waState.initialized || waState.initializing) {
    return waState;
  }

  waState.initializing = true;

  try {
    waClient = createClient();

    if (!waClient) {
      waState.initialized = true;
      waState.initializing = false;
      return waState;
    }

    await waClient.initialize();
    waState.initialized = true;
  } catch (error) {
    waState.error = `Error inicializando WhatsApp: ${error.message}`;
  } finally {
    waState.initializing = false;
  }

  return waState;
}

async function sendWhatsAppMessage(phone, content, options = {}) {
  if (!waState.enabled) {
    return { requested: false, sent: false, phone, error: "whatsappweb-deshabilitado" };
  }

  const chatId = normalizePhone(phone);

  if (!chatId) {
    return { requested: false, sent: false, phone, error: "telefono-invalido" };
  }

  await initializeWhatsAppWeb();

  if (!waClient || !waState.ready) {
    return {
      requested: true,
      sent: false,
      phone,
      error: waState.error || "cliente-no-listo",
      qrRequired: Boolean(waState.qr),
    };
  }

  try {
    const numberId = await waClient.getNumberId(chatId.replace("@c.us", ""));
    const targetId = numberId ? numberId._serialized : chatId;
    await waClient.sendMessage(targetId, content, options);
    return { requested: true, sent: true, phone, error: null };
  } catch (error) {
    return { requested: true, sent: false, phone, error: error.message };
  }
}

function getWhatsAppState() {
  return {
    ...waState,
    qr: waState.qr ? "available" : null,
    qrImageUrl: buildQrImageUrl(waState.qr),
  };
}

module.exports = {
  getWhatsAppState,
  initializeWhatsAppWeb,
  sendWhatsAppMessage,
};
