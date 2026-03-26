require("dotenv").config();
const admin = require("firebase-admin");

function normalizePrivateKey(value) {
  if (!value) {
    return value;
  }

  return String(value).replace(/\\n/g, "\n");
}

function buildServiceAccountFromDiscreteEnv() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (!projectId || !privateKey || !clientEmail) {
    return null;
  }

  return {
    type: "service_account",
    projectId,
    privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
    privateKey: privateKey,
    clientEmail,
    clientId: process.env.FIREBASE_CLIENT_ID,
    authUri: process.env.FIREBASE_AUTH_URI || "https://accounts.google.com/o/oauth2/auth",
    tokenUri: process.env.FIREBASE_TOKEN_URI || "https://oauth2.googleapis.com/token",
    authProviderX509CertUrl:
      process.env.FIREBASE_AUTH_PROVIDER_CERT_URL || "https://www.googleapis.com/oauth2/v1/certs",
    clientX509CertUrl: process.env.FIREBASE_CLIENT_CERT_URL,
    universeDomain: process.env.FIREBASE_UNIVERSE_DOMAIN || "googleapis.com",
  };
}

function normalizeServiceAccountShape(serviceAccount) {
  if (!serviceAccount || typeof serviceAccount !== "object") {
    return null;
  }

  return {
    type: serviceAccount.type || "service_account",
    projectId: serviceAccount.projectId || serviceAccount.project_id,
    privateKeyId: serviceAccount.privateKeyId || serviceAccount.private_key_id,
    privateKey: normalizePrivateKey(serviceAccount.privateKey || serviceAccount.private_key),
    clientEmail: serviceAccount.clientEmail || serviceAccount.client_email,
    clientId: serviceAccount.clientId || serviceAccount.client_id,
    authUri: serviceAccount.authUri || serviceAccount.auth_uri,
    tokenUri: serviceAccount.tokenUri || serviceAccount.token_uri,
    authProviderX509CertUrl:
      serviceAccount.authProviderX509CertUrl || serviceAccount.auth_provider_x509_cert_url,
    clientX509CertUrl: serviceAccount.clientX509CertUrl || serviceAccount.client_x509_cert_url,
    universeDomain: serviceAccount.universeDomain || serviceAccount.universe_domain,
  };
}

function getServiceAccountFromEnv() {
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (base64) {
    const decoded = Buffer.from(base64, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    return normalizeServiceAccountShape(parsed);
  }

  if (raw) {
    const parsed = JSON.parse(raw);
    return normalizeServiceAccountShape(parsed);
  }

  return normalizeServiceAccountShape(buildServiceAccountFromDiscreteEnv());
}

function initializeFirebase() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccount = getServiceAccountFromEnv();

  if (serviceAccount) {
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.projectId}.appspot.com`,
    });
  }

  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`,
  });
}
const app = initializeFirebase();
const db = admin.firestore(app);

const bucket = admin.storage().bucket();

module.exports = { admin, db, bucket };
