// src/screens/CartScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import React from "react";
import {
  Alert,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useCart } from "../context/CartContext";

export default function CartScreen() {
  const navigation = useNavigation<any>();
  const { cartItems, increaseQty, decreaseQty, removeItem } = useCart();

  const handleRemove = (id: string) => {
    Alert.alert("Confirmar", "Deseja remover este plano?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: () => removeItem(id),
      },
    ]);
  };

  return (
    <ImageBackground
      source={require("../../assets/images/Azulao.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay}>
        {cartItems.length === 0 ? (
          <Text style={styles.empty}>Nenhum plano adicionado</Text>
        ) : (
          <>
            <ScrollView showsVerticalScrollIndicator={false}>
              {cartItems.map((item) => (
                <View key={item.id} style={styles.card}>
                  <View style={styles.header}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.title}>{item.nome}</Text>

                      {item.descricao && (
                        <Text style={styles.description}>
                          {item.descricao}
                        </Text>
                      )}
                    </View>

                    <TouchableOpacity
                      onPress={() => handleRemove(item.id)}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={22}
                        color="#ff6b6b"
                      />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.price}>
                    R$ {item.preco.toFixed(2).replace(".", ",")}
                  </Text>

                  <View style={styles.qtyRow}>
                    <TouchableOpacity
                      style={styles.qtyButton}
                      onPress={() => decreaseQty(item.id)}
                    >
                      <Text style={styles.qtyButtonText}>−</Text>
                    </TouchableOpacity>

                    <Text style={styles.qty}>{item.quantity}</Text>

                    <TouchableOpacity
                      style={styles.qtyButton}
                      onPress={() => increaseQty(item.id)}
                    >
                      <Text style={styles.qtyButtonText}>+</Text>
                    </TouchableOpacity>

                    <Text style={styles.qtyLabel}>contratações</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.checkoutBtn}
              onPress={() => navigation.navigate("Checkout")}
            >
              <Text style={styles.checkoutText}>
                IR PARA CONFIRMAÇÃO
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)", 
    padding: 15,
  },
  empty: {
    color: "#fff",
    fontSize: 18,
    textAlign: "center",
    marginTop: 50,
  },
  card: {
    backgroundColor: "#2A2A2A",
    borderRadius: 14,
    padding: 15,
    marginBottom: 15,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },
  description: {
    marginTop: 4,
    fontSize: 14,
    color: "#B5B5B5",
  },
  price: {
    marginTop: 10,
    fontSize: 20,
    fontWeight: "bold",
    color: "#ffd700",
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
  },
  qtyButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#555",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyButtonText: {
    fontSize: 20,
    color: "#fff",
  },
  qty: {
    marginHorizontal: 12,
    fontSize: 18,
    color: "#fff",
    fontWeight: "600",
  },
  qtyLabel: {
    marginLeft: 10,
    fontSize: 14,
    color: "#AAA",
  },
  checkoutBtn: {
    backgroundColor: "#ffd700",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  checkoutText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#000",
  },
});