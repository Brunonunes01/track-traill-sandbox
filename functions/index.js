const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ maxInstances: 10 });

const db = admin.database();
const DEFAULT_BOOTSTRAP_ADMINS = [
  "brunobhnuness@gmail.com",
  "brunonunes01@gmail.com",
];

const parseBootstrapEmails = () => {
  const raw =
    process.env.ADMIN_BOOTSTRAP_EMAILS ||
    process.env.SECURITY_ADMIN_BOOTSTRAP_EMAILS ||
    "";
  const fromEnv = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_BOOTSTRAP_ADMINS, ...fromEnv]));
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

const isAuthUserNotFound = (error) => {
  const code = String(error?.code || error?.errorInfo?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return code.includes("user-not-found") || message.includes("no user record");
};

const findDeleteTarget = async ({ uid, email }) => {
  const targetUid = String(uid || "").trim();
  const targetEmail = String(email || "").trim().toLowerCase();

  if (targetUid) {
    try {
      const authUser = await admin.auth().getUser(targetUid);
      return {
        uid: authUser.uid,
        email: authUser.email || null,
        authUser,
      };
    } catch (error) {
      if (!isAuthUserNotFound(error)) throw error;

      const snapshot = await db.ref(`users/${targetUid}`).get();
      if (!snapshot.exists()) {
        throw new HttpsError("not-found", "Usuário não encontrado no Auth nem no banco.");
      }

      const data = snapshot.val() || {};
      return {
        uid: targetUid,
        email: data.email || null,
        authUser: null,
      };
    }
  }

  if (targetEmail) {
    try {
      const authUser = await admin.auth().getUserByEmail(targetEmail);
      return {
        uid: authUser.uid,
        email: authUser.email || null,
        authUser,
      };
    } catch (error) {
      if (!isAuthUserNotFound(error)) throw error;

      const snapshot = await db
        .ref("users")
        .orderByChild("email")
        .equalTo(targetEmail)
        .limitToFirst(1)
        .get();

      if (!snapshot.exists()) {
        throw new HttpsError("not-found", "Usuário não encontrado no Auth nem no banco.");
      }

      const users = snapshot.val() || {};
      const foundUid = Object.keys(users)[0];
      return {
        uid: foundUid,
        email: users[foundUid]?.email || targetEmail,
        authUser: null,
      };
    }
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

const cleanupUserData = async (uid) => {
  const updates = {
    [`users/${uid}`]: null,
  };

  const userSnapshot = await db.ref(`users/${uid}`).get();
  const userData = userSnapshot.exists() ? userSnapshot.val() || {} : {};
  const username = String(userData.username || "").trim().toLowerCase();
  if (username) {
    updates[`usernames/${username}`] = null;
  }

  const friendshipsSnapshot = await db.ref("friendships").get();
  if (friendshipsSnapshot.exists()) {
    const friendships = friendshipsSnapshot.val() || {};
    Object.keys(friendships).forEach((id) => {
      const item = friendships[id] || {};
      if (item.senderId === uid || item.receiverId === uid) {
        updates[`friendships/${id}`] = null;
      }
    });
  }

  await db.ref().update(updates);
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

exports.deleteUserAccount = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const allowed = await canManageAdmins(request.auth.uid);
  if (!allowed) {
    throw new HttpsError("permission-denied", "Permissão insuficiente para excluir usuários.");
  }

  const target = await findDeleteTarget(request.data || {});

  if (target.uid === request.auth.uid) {
    throw new HttpsError("failed-precondition", "Você não pode excluir sua própria conta.");
  }

  let authDeleted = false;
  if (target.authUser) {
    try {
      await admin.auth().deleteUser(target.uid);
      authDeleted = true;
    } catch (error) {
      if (!isAuthUserNotFound(error)) throw error;
    }
  }

  await cleanupUserData(target.uid);

  return {
    ok: true,
    uid: target.uid,
    email: target.email || null,
    authDeleted,
  };
});
