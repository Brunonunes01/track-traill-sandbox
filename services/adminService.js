import { onIdTokenChanged } from "firebase/auth";
import Constants from "expo-constants";
import {
  equalTo,
  get,
  onValue,
  orderByChild,
  query,
  ref,
} from "firebase/database";
import { getFunctions, httpsCallable } from "firebase/functions";
import { auth, database } from "./connectionFirebase";

const USERS_PATH = "users";

const normalizeEmail = (email) => (email || "").trim().toLowerCase();
const isPermissionDenied = (message) =>
  String(message || "").toLowerCase().includes("permission_denied");

export const resolveUserRole = (userRecord, email) => {
  if (userRecord?.role === "admin") return "admin";
  void normalizeEmail(email || userRecord?.email);
  return "user";
};

const resolveClaimRole = (claims) => {
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

const getFunctionsRegion = () => {
  const envRegion = process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION;
  if (envRegion?.trim()) return envRegion.trim();
  const extraRegion = (Constants.expoConfig?.extra || {}).firebaseFunctionsRegion;
  if (typeof extraRegion === "string" && extraRegion.trim()) return extraRegion.trim();
  return "us-central1";
};

const callAdminFunction = async (name, payload) => {
  if (!auth.currentUser?.uid) {
    throw new Error("Você precisa estar autenticado para esta operação.");
  }

  try {
    const functions = getFunctions(undefined, getFunctionsRegion());
    const callable = httpsCallable(functions, name);
    const result = await callable(payload);
    return result?.data || null;
  } catch (error) {
    const message = String(error?.message || "").trim();
    throw new Error(message || "Falha ao executar ação administrativa.");
  }
};

export const addAdminByEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Informe um e-mail válido.");
  }

  const response = await callAdminFunction("setUserAdminClaim", { email: normalizedEmail });
  return response;
};

export const removeAdminRole = async (uid) => {
  if (!uid?.trim()) {
    throw new Error("Usuário inválido.");
  }

  const response = await callAdminFunction("clearUserAdminClaim", { uid: uid.trim() });
  return response;
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
      claimRole = resolveClaimRole(tokenResult?.claims);

      // Garante atualização de claims recentes (ex.: usuário recém-promovido).
      if (claimRole !== "admin") {
        await user.getIdToken(true);
        const refreshedToken = await user.getIdTokenResult(true);
        claimRole = resolveClaimRole(refreshedToken?.claims);
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
        const role = claimRole === "admin" ? "admin" : "user";
        if (dbRole === "admin" && claimRole !== "admin") {
          console.warn(
            "[admin] role=admin no banco, mas claim admin ausente no token. Regras podem negar acesso."
          );
        }
        onChange({ isAdmin: role === "admin", role, user });
      },
      (error) => {
        // Fallback para ambientes onde o espelho de role no DB não existe.
        console.warn("[admin] user role listener failed, using claims fallback:", error?.message || String(error));
        onChange({ isAdmin: claimRole === "admin", role: claimRole, user });
      }
    );
  });

  return () => {
    if (detachRoleListener) detachRoleListener();
    unsubscribeAuth();
  };
};
