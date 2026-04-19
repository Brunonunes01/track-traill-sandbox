import { onAuthStateChanged } from "firebase/auth";
import { Redirect } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { auth } from "../services/connectionFirebase";

const AUTH_BOOT_TIMEOUT_MS = 7000;

export default function IndexRoute() {
  const [loading, setLoading] = useState(true);
  const [logged, setLogged] = useState(false);

  useEffect(() => {
    console.log("[boot] IndexRoute auth check started");
    let resolved = false;

    const timeoutId = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      console.warn("[boot] Auth state timeout. Releasing loading with guest flow.");
      setLogged(false);
      setLoading(false);
    }, AUTH_BOOT_TIMEOUT_MS);

    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        console.log("[boot] Auth state resolved:", user ? "authenticated" : "guest");
        setLogged(!!user);
        setLoading(false);
      },
      (error) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        console.error("[boot] Auth listener error:", error);
        setLogged(false);
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#020617" }}>
        <ActivityIndicator size="large" color="#1e4db7" />
        <Text style={{ marginTop: 10, color: "#cbd5e1" }}>Verificando autenticação...</Text>
      </View>
    );
  }

  return <Redirect href={logged ? "/(tabs)" : "/login"} />;
}
