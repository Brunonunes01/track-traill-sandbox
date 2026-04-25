import { onIdTokenChanged } from "firebase/auth";
import Constants from "expo-constants";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  equalTo,
  get,
  onValue,
  orderByChild,
  query,
  ref,
  update,
} from "firebase/database";
import app, { auth, database } from "./connectionFirebase";

const USERS_PATH = "users";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (email) => (email || "").trim().toLowerCase();
const isPermissionDenied = (message) =>
  String(message || "").toLowerCase().includes("permission_denied");

const MASTER_ADMIN_EMAIL = "brunobhnuness@gmail.com";
const firebaseFunctionsRegion =
  Constants.expoConfig?.extra?.firebaseFunctionsRegion || "us-central1";
const functions = getFunctions(app, firebaseFunctionsRegion);

export const resolveUserRole = (userRecord, email) => {
  const normalized = normalizeEmail(email || userRecord?.email);
  if (normalized === MASTER_ADMIN_EMAIL) return "admin";
  if (userRecord?.role === "admin") return "admin";
  return "user";
};

const resolveClaimRole = (claims, email) => {
  if (normalizeEmail(email) === MASTER_ADMIN_EMAIL) return "admin";
  if (!claims) return "user";
  if (claims.admin === true || claims.role === "admin") return "admin";
  return "user";
};

export const ensureUserRole = async (uid, email) => {
  if (!uid) return "user";
  const userRef = ref(database, `${USERS_PATH}/${uid}`);
  const snapshot = await get(userRef);
  if (!snapshot.exists()) return "user";

  const userData = snapshot.val();
  const resolvedRole = resolveUserRole(userData, email);
  return resolvedRole;
};

const ensureCanManageAdmins = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) {
    throw new Error("Você precisa estar autenticado para esta operação.");
  }

  const currentRole = await ensureUserRole(currentUser.uid, currentUser.email || "");
  if (currentRole !== "admin") {
    throw new Error("Você não tem permissão para esta ação administrativa.");
  }

  return currentUser;
};

const findUserUidByEmail = async (email) => {
  const usersRef = ref(database, USERS_PATH);
  const normalizedEmail = normalizeEmail(email);

  const byEmailQuery = query(usersRef, orderByChild("email"), equalTo(normalizedEmail));
  const byEmailSnapshot = await get(byEmailQuery);
  const byEmailUsers = mapSnapshotToUsers(byEmailSnapshot);
  if (byEmailUsers.length > 0) {
    return byEmailUsers[0].uid;
  }

  const allUsersSnapshot = await get(usersRef);
  const allUsers = mapSnapshotToUsers(allUsersSnapshot);
  const matched = allUsers.find((user) => normalizeEmail(user.email) === normalizedEmail);
  if (matched?.uid) return matched.uid;

  throw new Error("Usuário não encontrado. Verifique se o e-mail já está cadastrado.");
};

export const addAdminByEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Informe um e-mail válido.");
  }
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw new Error("Formato de e-mail inválido.");
  }

  await ensureCanManageAdmins();
  const targetUid = await findUserUidByEmail(normalizedEmail);
  const now = new Date().toISOString();

  await update(ref(database, `${USERS_PATH}/${targetUid}`), {
    role: "admin",
    roleSource: "database_rule",
    roleUpdatedAt: now,
  });

  return {
    ok: true,
    uid: targetUid,
    role: "admin",
  };
};

export const removeAdminRole = async (uid) => {
  const targetUid = String(uid || "").trim();
  if (!targetUid) {
    throw new Error("Usuário inválido.");
  }
  const currentUser = await ensureCanManageAdmins();
  if (targetUid === currentUser.uid) {
    throw new Error("Você não pode remover seu próprio acesso de administrador.");
  }

  const now = new Date().toISOString();
  await update(ref(database, `${USERS_PATH}/${targetUid}`), {
    role: "user",
    roleSource: "database_rule",
    roleUpdatedAt: now,
  });

  return {
    ok: true,
    uid: targetUid,
    role: "user",
  };
};

export const deleteUserAccount = async (uid) => {
  const targetUid = String(uid || "").trim();
  if (!targetUid) {
    throw new Error("Usuário inválido.");
  }

  const currentUser = await ensureCanManageAdmins();
  if (targetUid === currentUser.uid) {
    throw new Error("Você não pode excluir sua própria conta.");
  }

  const deleteAccount = httpsCallable(functions, "deleteUserAccount");
  try {
    const result = await deleteAccount({ uid: targetUid });
    return result.data;
  } catch (error) {
    const code = String(error?.code || "").toLowerCase();
    const message = String(error?.message || "").trim();
    const normalizedMessage = message.toLowerCase();

    if (
      code.includes("not-found") &&
      (!message || normalizedMessage === "not found" || normalizedMessage.includes("function"))
    ) {
      throw new Error(
        "Função de exclusão não encontrada no Firebase. Publique as Functions com `firebase deploy --only functions`."
      );
    }

    throw new Error(message || "Não foi possível excluir a conta.");
  }
};

const mapSnapshotToUsers = (snapshot) => {
  if (!snapshot.exists()) return [];
  const data = snapshot.val();
  return Object.keys(data).map((uid) => ({ uid, ...data[uid] }));
};

export const subscribeAdmins = (onChange) => {
  const adminsQuery = query(
    ref(database, USERS_PATH),
    orderByChild("role"),
    equalTo("admin")
  );

  return onValue(
    adminsQuery,
    (snapshot) => {
      const users = mapSnapshotToUsers(snapshot);
      console.log(`[adminService] Admins encontrados: ${users.length}`);
      onChange(users);
    },
    (error) => {
      const message = String(error?.message || "");
      if (isPermissionDenied(message)) {
        console.warn("[adminService] Sem permissão para ler /users (admins):", message);
      } else {
        console.error("[adminService] Erro ao buscar admins:", message);
      }
      onChange([]);
    }
  );
};

export const subscribeUsers = (onChange) => {
  return onValue(
    ref(database, USERS_PATH),
    (snapshot) => {
      const users = mapSnapshotToUsers(snapshot);
      console.log(`[adminService] Usuários encontrados: ${users.length}`);
      onChange(users);
    },
    (error) => {
      const message = String(error?.message || "");
      if (isPermissionDenied(message)) {
        console.warn("[adminService] Sem permissão para ler /users:", message);
      } else {
        console.error("[adminService] Erro ao buscar usuários:", message);
      }
      onChange([]);
    }
  );
};

export const subscribeCurrentUserRole = (onChange) => {
  let detachRoleListener = null;

  const unsubscribeAuth = onIdTokenChanged(auth, async (user) => {
    if (detachRoleListener) {
      detachRoleListener();
      detachRoleListener = null;
    }

    if (!user) {
      onChange({ isAdmin: false, role: "user", user: null });
      return;
    }

    let claimRole = "user";
    try {
      const tokenResult = await user.getIdTokenResult();
      claimRole = resolveClaimRole(tokenResult?.claims, user.email);

      // Garante atualização de claims recentes (ex.: usuário recém-promovido).
      if (claimRole !== "admin") {
        await user.getIdToken(true);
        const refreshedToken = await user.getIdTokenResult(true);
        claimRole = resolveClaimRole(refreshedToken?.claims, user.email);
      }
    } catch (error) {
      console.warn("[admin] failed to read custom claims:", error?.message || String(error));
    }

    const userRef = ref(database, `${USERS_PATH}/${user.uid}`);
    detachRoleListener = onValue(
      userRef,
      (snapshot) => {
        const data = snapshot.val() || {};
        const dbRole = resolveUserRole(data, user.email || "");
        const role =
          claimRole === "admin" || dbRole === "admin" || normalizeEmail(user.email) === MASTER_ADMIN_EMAIL
            ? "admin"
            : "user";
        if (dbRole === "admin" && claimRole !== "admin" && normalizeEmail(user.email) !== MASTER_ADMIN_EMAIL) {
          console.warn(
            "[admin] role=admin no banco sem claim; modo sem Cloud Functions ativo."
          );
        }
        onChange({ isAdmin: role === "admin", role, user });
      },
      (error) => {
        // Fallback para ambientes onde o espelho de role no DB não existe.
        const isMaster = normalizeEmail(user.email) === MASTER_ADMIN_EMAIL;
        const finalRole = isMaster ? "admin" : claimRole;
        console.warn("[admin] user role listener failed, using claims fallback:", error?.message || String(error));
        onChange({ isAdmin: finalRole === "admin", role: finalRole, user });
      }
    );
  });

  return () => {
    if (detachRoleListener) detachRoleListener();
    unsubscribeAuth();
  };
};
