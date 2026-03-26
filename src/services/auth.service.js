const crypto = require("crypto");

const { admin, db } = require("../config/firebase");
const { sanitizeUserItem } = require("./firestore-crud.service");

const USERS_COLLECTION = "usuarios";
const SESSIONS_COLLECTION = "_auth_sessions";
const SESSION_COOKIE = "tiendaquesos_session";
const DEFAULT_ADMIN_EMAIL = "admin@tiendaquesos.local";
const DEFAULT_ADMIN_PASSWORD = "admin123";
const SESSION_DAYS = Number(process.env.SESSION_TTL_DAYS || 7);

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, hashedPassword) {
  if (!hashedPassword || typeof hashedPassword !== "string" || !hashedPassword.startsWith("scrypt:")) {
    return false;
  }

  const [, salt, expected] = hashedPassword.split(":");

  if (!salt || !expected) {
    return false;
  }

  const actual = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function parseCookies(headerValue) {
  return String(headerValue || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const separatorIndex = part.indexOf("=");

      if (separatorIndex === -1) {
        return acc;
      }

      const key = part.slice(0, separatorIndex).trim();
      const value = decodeURIComponent(part.slice(separatorIndex + 1));
      acc[key] = value;
      return acc;
    }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  parts.push(`Path=${options.path || "/"}`);

  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function setSessionCookie(res, token) {
  const cookie = serializeCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });

  res.setHeader("Set-Cookie", cookie);
}

function clearSessionCookie(res) {
  const cookie = serializeCookie(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });

  res.setHeader("Set-Cookie", cookie);
}

function getRequestIp(req) {
  const forwarded = req.headers["x-forwarded-for"];

  if (forwarded) {
    return String(forwarded).split(",")[0].trim();
  }

  return req.socket?.remoteAddress || "";
}

async function ensureDefaultAdminUser() {
  let snapshot = await db.collection(USERS_COLLECTION).where("email_lower", "==", DEFAULT_ADMIN_EMAIL).limit(1).get();

  if (snapshot.empty) {
    snapshot = await db.collection(USERS_COLLECTION).where("email", "==", DEFAULT_ADMIN_EMAIL).limit(1).get();
  }

  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    const data = doc.data();

    if (!data.hashed_password && !data.password) {
      await doc.ref.update({
        email: DEFAULT_ADMIN_EMAIL,
        email_lower: DEFAULT_ADMIN_EMAIL,
        rol: "admin",
        activo: "si",
        hashed_password: hashPassword(DEFAULT_ADMIN_PASSWORD),
        updated_at: new Date().toISOString(),
      });

      const repaired = await doc.ref.get();
      return sanitizeUserItem({ id: repaired.id, ...repaired.data() });
    }

    return sanitizeUserItem({ id: doc.id, ...data });
  }

  const ref = await db.collection(USERS_COLLECTION).add({
    nombre: "Administrador",
    email: DEFAULT_ADMIN_EMAIL,
    email_lower: DEFAULT_ADMIN_EMAIL,
    hashed_password: hashPassword(DEFAULT_ADMIN_PASSWORD),
    rol: "admin",
    activo: "si",
    telefono: "",
    observaciones: "Usuario admin creado automaticamente",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const doc = await ref.get();
  return sanitizeUserItem({ id: doc.id, ...doc.data() });
}

async function findUserByEmail(email) {
  const normalizedEmail = normalizeText(email);

  if (!normalizedEmail) {
    return null;
  }

  let snapshot = await db.collection(USERS_COLLECTION).where("email_lower", "==", normalizedEmail).limit(1).get();

  if (!snapshot.empty) {
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  }

  snapshot = await db.collection(USERS_COLLECTION).limit(500).get();
  const match = snapshot.docs.find((doc) => normalizeText(doc.data().email) === normalizedEmail);
  return match ? { id: match.id, ...match.data() } : null;
}

async function authenticateUser(email, password) {
  await ensureDefaultAdminUser();

  const user = await findUserByEmail(email);

  if (!user) {
    throw new Error("Credenciales inválidas");
  }

  if (normalizeText(user.activo || "si") !== "si") {
    throw new Error("Usuario inactivo");
  }

  const plainPassword = String(password || "");
  const currentPassword = String(user.password || "");

  if (verifyPassword(plainPassword, user.hashed_password)) {
    return sanitizeUserItem(user);
  }

  if (currentPassword && currentPassword === plainPassword) {
    await db.collection(USERS_COLLECTION).doc(user.id).update({
      hashed_password: hashPassword(plainPassword),
      password: admin.firestore.FieldValue.delete(),
      updated_at: new Date().toISOString(),
    });

    const refreshed = await db.collection(USERS_COLLECTION).doc(user.id).get();
    return sanitizeUserItem({ id: refreshed.id, ...refreshed.data() });
  }

  throw new Error("Credenciales inválidas");
}

async function createSessionForUser(user, req) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await db.collection(SESSIONS_COLLECTION).doc(tokenHash).set({
    user_id: user.id,
    nombre: user.nombre || user.email,
    email: user.email,
    rol: user.rol,
    ip: getRequestIp(req),
    user_agent: req.headers["user-agent"] || "",
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
  });

  return token;
}

async function resolveSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const rawToken = cookies[SESSION_COOKIE];

  if (!rawToken) {
    return null;
  }

  const sessionRef = db.collection(SESSIONS_COLLECTION).doc(hashToken(rawToken));
  const sessionDoc = await sessionRef.get();

  if (!sessionDoc.exists) {
    return null;
  }

  const session = sessionDoc.data();

  if (!session.expires_at || new Date(session.expires_at).getTime() <= Date.now()) {
    await sessionRef.delete();
    return null;
  }

  return {
    token: rawToken,
    user: {
      id: session.user_id,
      nombre: session.nombre,
      email: session.email,
      rol: session.rol,
    },
    sessionId: sessionDoc.id,
    expiresAt: session.expires_at,
  };
}

async function destroySessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const rawToken = cookies[SESSION_COOKIE];

  if (!rawToken) {
    return;
  }

  await db.collection(SESSIONS_COLLECTION).doc(hashToken(rawToken)).delete().catch(() => null);
}

async function attachSession(req, _res, next) {
  try {
    req.session = await resolveSessionFromRequest(req);
    next();
  } catch (error) {
    next(error);
  }
}

function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ message: "No autenticado", error: "Inicia sesión para continuar" });
  }

  return next();
}

function requireRole(roles) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    if (!req.session?.user) {
      return res.status(401).json({ message: "No autenticado", error: "Inicia sesión para continuar" });
    }

    if (!allowedRoles.includes(req.session.user.rol)) {
      return res.status(403).json({ message: "Acceso denegado", error: "No tienes permisos suficientes" });
    }

    return next();
  };
}

module.exports = {
  attachSession,
  authenticateUser,
  clearSessionCookie,
  createSessionForUser,
  destroySessionFromRequest,
  ensureDefaultAdminUser,
  requireAuth,
  requireRole,
  setSessionCookie,
};