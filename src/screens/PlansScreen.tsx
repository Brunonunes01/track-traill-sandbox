// src/screens/PlansScreen.tsx
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useNavigation } from "@react-navigation/native";
import { useCart } from "../context/CartContext";

type Plan = {
  id: string | number;
  name: string;
  type?: string;
  price: string | number;
  per?: string;
  total?: string;
  highlight?: boolean;
  features?: string[] | string | Record<string, any>;
};

export default function PlansScreen() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const navigation = useNavigation<any>();
  const { addToCart } = useCart();

  const BIN_ID = "69243bb5ae596e708f6d84af";
  const API_KEY =
    "$2a$10$T8eHLAmpCAXtEm3.F/R3fuGBuhNM7z31uRVjUzktvlXGs96VTjX2q";

  const parseDescription = (features?: Plan["features"]): string => {
    if (!features) return "Plano selecionado";

    if (Array.isArray(features)) {
      return features.map(String).join(" • ");
    }

    if (typeof features === "string") {
      return features;
    }

    if (typeof features === "object") {
      return Object.values(features).map(String).join(" • ");
    }

    return "Plano selecionado";
  };

  const parsePrice = (price: string | number): number => {
    if (typeof price === "number") return price;

    const cleaned = String(price)
      .replace("R$", "")
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim();

    const n = Number(cleaned);
    return isNaN(n) ? 0 : n;
  };

  const handleAddToCart = (item: Plan) => {
    const safeId = String(
      item.id ?? item.name ?? Math.random().toString(36).slice(2, 9)
    );

    addToCart({
      id: safeId,
      nome: item.name,
      descricao: parseDescription(item.features),
      preco: parsePrice(item.price),
    });

    navigation.navigate("Carrinho");
  };

  useEffect(() => {
    async function loadPlans() {
      try {
        const response = await fetch(
          `https://api.jsonbin.io/v3/b/${BIN_ID}`,
          {
            headers: { "X-Master-Key": API_KEY },
          }
        );

        const json = await response.json();
        const loaded = json?.record?.plans ?? json?.plans ?? [];
        setPlans(Array.isArray(loaded) ? loaded : []);
      } catch (error) {
        console.log("Erro ao buscar planos:", error);
        setPlans([]);
      } finally {
        setLoading(false);
      }
    }

    loadPlans();
  }, []);

  if (loading) {
    return (
      <ImageBackground
        source={require("../../assets/images/Azulao.png")}
        style={{ flex: 1 }}
      >
        <LinearGradient
          colors={[
            "rgba(0,0,0,0.8)",
            "rgba(0,0,0,0.3)",
            "rgba(0,0,0,0.8)",
          ]}
          style={styles.center}
        >
          <ActivityIndicator size="large" color="#ffd700" />
        </LinearGradient>
      </ImageBackground>
    );
  }

  return (
    <ImageBackground
      source={require("../../assets/images/Azulao.png")}
      resizeMode="cover"
      style={{ flex: 1 }}
    >
      <LinearGradient
        colors={[
          "rgba(0,0,0,0.8)",
          "rgba(0,0,0,0.3)",
          "rgba(0,0,0,0.8)",
        ]}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Planos</Text>

          {plans.map((item) => (
            <View
              key={String(item.id ?? item.name)}
              style={[
                styles.card,
                item.highlight
                  ? { backgroundColor: "rgba(108,59,255,0.35)" }
                  : null,
              ]}
            >
              <Text style={styles.planTitle}>
                {String(item.name ?? "").toUpperCase()}
              </Text>

              {item.type && <Text style={styles.planSub}>{item.type}</Text>}

              <Text style={styles.price}>
                {typeof item.price === "string"
                  ? item.price
                  : `R$ ${Number(item.price)
                      .toFixed(2)
                      .replace(".", ",")}`}
              </Text>

              {item.total && (
                <Text style={styles.total}>TOTAL: {item.total}</Text>
              )}
              {item.per && <Text style={styles.per}>{item.per}</Text>}

              {item.features &&
                (Array.isArray(item.features)
                  ? item.features
                  : typeof item.features === "object"
                  ? Object.values(item.features)
                  : [String(item.features)]
                ).map((f, i) => (
                  <Text key={i} style={styles.feature}>
                    • {String(f)}
                  </Text>
                ))}

              <TouchableOpacity
                style={item.highlight ? styles.btn : styles.btnOutline}
                onPress={() => handleAddToCart(item)}
              >
                <Text
                  style={
                    item.highlight ? styles.btnText : styles.btnTextOutline
                  }
                >
                  ASSINAR
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </LinearGradient>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: "center",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 26,
    color: "#fff",
    fontWeight: "bold",
    marginBottom: 20,
  },
  card: {
    width: "90%",
    padding: 25,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    marginBottom: 20,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  planTitle: {
    fontSize: 14,
    color: "#bbb",
    letterSpacing: 2,
  },
  planSub: {
    fontSize: 22,
    color: "#fff",
    marginBottom: 10,
  },
  price: {
    fontSize: 36,
    color: "#fff",
    fontWeight: "bold",
  },
  per: {
    color: "#ddd",
    marginTop: 5,
    textAlign: "center",
  },
  total: {
    color: "#ddd",
    marginTop: 10,
    marginBottom: 10,
    textAlign: "center",
  },
  feature: {
    color: "#eee",
    fontSize: 14,
    marginTop: 4,
  },
  btn: {
    backgroundColor: "#ffd700",
    width: "80%",
    padding: 12,
    borderRadius: 20,
    alignItems: "center",
    marginTop: 15,
  },
  btnText: {
    color: "#000",
    fontWeight: "bold",
    fontSize: 16,
  },
  btnOutline: {
    borderColor: "#fff",
    borderWidth: 2,
    width: "80%",
    padding: 12,
    borderRadius: 20,
    alignItems: "center",
    marginTop: 15,
  },
  btnTextOutline: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
});