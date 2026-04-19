const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ maxInstances: 10 });

const db = admin.database();

const parseBootstrapEmails = () => {
  const raw =
    process.env.ADMIN_BOOTSTRAP_EMAILS ||
    process.env.SECURITY_ADMIN_BOOTSTRAP_EMAILS ||
    "";
  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
};

const isBootstrapAdmin = (email) => {
  if (!email) return false;
  const list = parseBootstrapEmails();
  return list.includes(String(email).trim().toLowerCase());
};

const canManageAdmins = async (uid) => {
  if (!uid) return false;
  const caller = await admin.auth().getUser(uid);
  const claims = caller.customClaims || {};

  if (claims.admin === true || claims.role === "admin") {
    return true;
  }

  return isBootstrapAdmin(caller.email || "");
};

const findUser = async ({ uid, email }) => {
  if (uid && String(uid).trim()) {
    return admin.auth().getUser(String(uid).trim());
  }

  if (email && String(email).trim()) {
    return admin.auth().getUserByEmail(String(email).trim().toLowerCase());
  }

  throw new HttpsError("invalid-argument", "Informe uid ou email do usuário alvo.");
};

const setRoleMirror = async (uid, role) => {
  await db.ref(`users/${uid}`).update({
    role,
    roleSource: "custom_claim",
    roleUpdatedAt: new Date().toISOString(),
  });
};

exports.setUserAdminClaim = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const allowed = await canManageAdmins(request.auth.uid);
  if (!allowed) {
    throw new HttpsError("permission-denied", "Permissão insuficiente para gerenciar administradores.");
  }

  const target = await findUser(request.data || {});
  const currentClaims = target.customClaims || {};

  const nextClaims = {
    ...currentClaims,
    admin: true,
    role: "admin",
  };

  await admin.auth().setCustomUserClaims(target.uid, nextClaims);
  await setRoleMirror(target.uid, "admin");

  return {
    ok: true,
    uid: target.uid,
    email: target.email || null,
    role: "admin",
  };
});

exports.clearUserAdminClaim = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const allowed = await canManageAdmins(request.auth.uid);
  if (!allowed) {
    throw new HttpsError("permission-denied", "Permissão insuficiente para gerenciar administradores.");
  }

  const target = await findUser(request.data || {});

  if (target.uid === request.auth.uid) {
    throw new HttpsError("failed-precondition", "Você não pode remover seu próprio acesso de administrador.");
  }

  const currentClaims = target.customClaims || {};
  const nextClaims = { ...currentClaims };
  delete nextClaims.admin;
  delete nextClaims.role;

  await admin.auth().setCustomUserClaims(target.uid, nextClaims);
  await setRoleMirror(target.uid, "user");

  return {
    ok: true,
    uid: target.uid,
    email: target.email || null,
    role: "user",
  };
});
