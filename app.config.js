const { expo } = require("./app.json");

const isPlaceholder = (value) => String(value || "").trim().toUpperCase().startsWith("SET_VIA_");

const pickEnv = (name, fallback = "") => {
  const value = String(process.env[name] || "").trim();
  if (!value || isPlaceholder(value)) return fallback;
  return value;
};

module.exports = ({ config }) => {
  const base = config ?? expo;
  const requiredPlugins = [
    "@react-native-community/datetimepicker",
    "expo-font",
    "expo-web-browser",
  ];

  const googleMapsApiKey = pickEnv(
    "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY",
    pickEnv(
      "EXPO_PUBLIC_GOOGLE_DIRECTIONS_API_KEY",
      base?.android?.config?.googleMaps?.apiKey || ""
    )
  );

  const firebase = {
    ...(base?.extra?.firebase || {}),
    apiKey: pickEnv("EXPO_PUBLIC_FIREBASE_API_KEY", base?.extra?.firebase?.apiKey || ""),
    authDomain: pickEnv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", base?.extra?.firebase?.authDomain || ""),
    databaseURL: pickEnv("EXPO_PUBLIC_FIREBASE_DATABASE_URL", base?.extra?.firebase?.databaseURL || ""),
    projectId: pickEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID", base?.extra?.firebase?.projectId || ""),
    storageBucket: pickEnv("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET", base?.extra?.firebase?.storageBucket || ""),
    messagingSenderId: pickEnv(
      "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      base?.extra?.firebase?.messagingSenderId || ""
    ),
    appId: pickEnv("EXPO_PUBLIC_FIREBASE_APP_ID", base?.extra?.firebase?.appId || ""),
  };

  if (!googleMapsApiKey || isPlaceholder(googleMapsApiKey)) {
    console.warn(
      "[expo-config] EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ausente. O mapa no Android pode não carregar tiles."
    );
  }

  const normalizedPlugins = [...(base.plugins || [])];
  const hasPlugin = (name) =>
    normalizedPlugins.some((plugin) =>
      Array.isArray(plugin) ? plugin[0] === name : plugin === name
    );
  requiredPlugins.forEach((pluginName) => {
    if (!hasPlugin(pluginName)) {
      normalizedPlugins.push(pluginName);
    }
  });

  return {
    ...base,
    plugins: normalizedPlugins,
    android: {
      ...(base?.android || {}),
      config: {
        ...(base?.android?.config || {}),
        googleMaps: {
          ...(base?.android?.config?.googleMaps || {}),
          apiKey: googleMapsApiKey,
        },
      },
    },
    extra: {
      ...(base?.extra || {}),
      googleDirectionsApiKey: pickEnv(
        "EXPO_PUBLIC_GOOGLE_DIRECTIONS_API_KEY",
        base?.extra?.googleDirectionsApiKey || ""
      ),
      firebaseFunctionsRegion: pickEnv(
        "EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION",
        base?.extra?.firebaseFunctionsRegion || "us-central1"
      ),
      firebase,
    },
  };
};
