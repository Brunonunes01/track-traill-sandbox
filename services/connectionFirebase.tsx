import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  initializeAuth,
  setPersistence,
} from "firebase/auth";
import { getDatabase, onValue, ref } from "firebase/database";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";

const expoConfig = Constants.expoConfig;
const extraFirebaseConfig = (expoConfig?.extra as any)?.firebase || {};

const isPlaceholderValue = (value: unknown) => String(value || "").trim().toUpperCase().startsWith("SET_VIA_");

const normalizeConfigValue = (value: unknown) => {
  const text = String(value || "").trim();
  if (!text || isPlaceholderValue(text)) return "";
  return text;
};

const isValidDatabaseUrl = (value: unknown) => {
  const text = String(value || "").trim();
  if (!text) return false;

  try {
    const parsed = new URL(text);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
};

const rawDatabaseUrl = normalizeConfigValue(
  process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || extraFirebaseConfig.databaseURL
);
export const isRealtimeDatabaseConfigured = isValidDatabaseUrl(rawDatabaseUrl);

const firebaseConfig = {
  apiKey: normalizeConfigValue(process.env.EXPO_PUBLIC_FIREBASE_API_KEY || extraFirebaseConfig.apiKey),
  authDomain: normalizeConfigValue(
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || extraFirebaseConfig.authDomain
  ),
  databaseURL: isValidDatabaseUrl(rawDatabaseUrl) ? rawDatabaseUrl : "",
  projectId: normalizeConfigValue(
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || extraFirebaseConfig.projectId
  ),
  storageBucket: normalizeConfigValue(
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || extraFirebaseConfig.storageBucket
  ),
  messagingSenderId: normalizeConfigValue(
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || extraFirebaseConfig.messagingSenderId
  ),
  appId: normalizeConfigValue(process.env.EXPO_PUBLIC_FIREBASE_APP_ID || extraFirebaseConfig.appId),
};

const requiredFirebaseFields: Array<keyof typeof firebaseConfig> = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
];

const missingFirebaseFields = requiredFirebaseFields
  .filter((key) => !String(firebaseConfig[key] || "").trim())
  .map((key) => key);

if (missingFirebaseFields.length > 0) {
  throw new Error(
    `[firebase] configuração ausente: ${missingFirebaseFields.join(
      ", "
    )}. Defina EXPO_PUBLIC_FIREBASE_* ou expo.extra.firebase.`
  );
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

const buildFallbackDatabaseUrl = () => {
  const normalizedProjectId = String(firebaseConfig.projectId || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .trim();
  const safeProjectId = normalizedProjectId || "local-dev";
  return `https://${safeProjectId}-default-rtdb.firebaseio.com`;
};

const getReactNativePersistenceSafe = () => {
  try {
    // Tenta obter a persistência do módulo auth
    const authModule = require("firebase/auth");
    return authModule.getReactNativePersistence || null;
  } catch (err) {
    console.warn("[firebase] getReactNativePersistence fallback error:", err);
    return null;
  }
};

const createAuth = () => {
  if (Platform.OS === "web") {
    const webAuth = getAuth(app);
    setPersistence(webAuth, browserLocalPersistence).catch((err) => {
      console.warn("[firebase] web persistence failed:", err);
    });
    return webAuth;
  }

  try {
    const persistenceFactory = getReactNativePersistenceSafe();
    if (persistenceFactory && AsyncStorage) {
      console.log("[firebase] Initializing Auth with AsyncStorage persistence");
      return initializeAuth(app, {
        persistence: persistenceFactory(AsyncStorage),
      });
    }
    console.log("[firebase] Falling back to default getAuth");
    return getAuth(app);
  } catch (error) {
    console.warn("[firebase] Auth initialization error, using getAuth:", error);
    return getAuth(app);
  }
};

export const auth = createAuth();
export const database = (() => {
  const configDatabaseUrl = String(firebaseConfig.databaseURL || "").trim();
  if (isValidDatabaseUrl(configDatabaseUrl)) {
    return getDatabase(app, configDatabaseUrl);
  }

  const fallbackDatabaseUrl = buildFallbackDatabaseUrl();
  console.warn(
    `[firebase] databaseURL inválida (${configDatabaseUrl || "vazia"}). ` +
      `Aplicando fallback ${fallbackDatabaseUrl}. Defina EXPO_PUBLIC_FIREBASE_DATABASE_URL corretamente.`
  );

  return getDatabase(app, fallbackDatabaseUrl);
})();
export const storage = getStorage(app);

const isDisconnectLikeError = (error: unknown) => {
  const message = String((error as any)?.message || "").toLowerCase();
  const code = String((error as any)?.code || "").toLowerCase();
  return (
    message.includes("disconnect") ||
    message.includes("network") ||
    message.includes("timeout") ||
    code.includes("disconnect") ||
    code.includes("network")
  );
};

export const normalizeFirebaseErrorMessage = (
  error: unknown,
  fallback = "Erro de comunicação com o servidor."
) => {
  if (isDisconnectLikeError(error)) {
    return "Sem conexão com o servidor. Verifique sua internet e tente novamente.";
  }

  const message = String((error as any)?.message || "").trim();
  return message || fallback;
};

if (Platform.OS !== "web") {
  if (!isRealtimeDatabaseConfigured) {
    console.warn(
      "[firebase] Realtime Database não configurado. Defina EXPO_PUBLIC_FIREBASE_DATABASE_URL para ativar status de conexão."
    );
  }
  try {
    onValue(
      ref(database, ".info/connected"),
      (snapshot) => {
        const connected = snapshot.val() === true;
        console.log(`[firebase] realtime connection: ${connected ? "online" : "offline"}`);
      },
      (error) => {
        console.warn(
          "[firebase] .info/connected listener failed:",
          normalizeFirebaseErrorMessage(error)
        );
      }
    );
  } catch (error) {
    console.warn("[firebase] failed to register connection listener:", String(error));
  }
}

export default app;
