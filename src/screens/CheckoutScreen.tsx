import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import React, { useState } from "react";
import {
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useCart } from "../context/CartContext";

export default function CheckoutScreen() {
  const navigation = useNavigation<any>();
  const { cartItems } = useCart();

  const [metodo, setMetodo] = useState<"PIX" | "CARTAO">("PIX");
  const [numeroCartao, setNumeroCartao] = useState("");
  const [nome, setNome] = useState("");
  const [validade, setValidade] = useState("");
  const [cvv, setCvv] = useState("");

  // Calcula o valor total com base no carrinho do CartContext
  const valorTotal = cartItems.reduce(
    (acc, item) => acc + item.preco * (item.quantity || 1),
    0
  );

  const handleFinalizar = () => {
    if (metodo === "CARTAO") {
      if (!numeroCartao || !nome || !validade || !cvv) {
        Alert.alert("Atenção", "Preencha todos os dados do cartão para prosseguir.");
        return;
      }
    }

    Alert.alert(
      "Pagamento Aprovado!",
      "A sua compra foi confirmada com sucesso. Aproveite os novos recursos do Track & Trail!",
      [
        {
          text: "Ir para o Dashboard",
          onPress: () => {
            // Pode adicionar uma função clearCart() do seu contexto aqui, se existir
            navigation.reset({
              index: 0,
              routes: [{ name: "DashboardScreen" }],
            });
          },
        },
      ]
    );
  };

  return (
    <ImageBackground
      source={require("../../assets/images/Azulao.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.overlay}>
          {/* CABEÇALHO */}
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Finalizar Compra</Text>
            <View style={{ width: 28 }} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            
            {/* RESUMO DO PEDIDO */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Resumo do Pedido</Text>
              {cartItems.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <Text style={styles.itemText} numberOfLines={1}>
                    {item.quantity}x {item.nome}
                  </Text>
                  <Text style={styles.itemPrice}>
                    R$ {(item.preco * (item.quantity || 1)).toFixed(2).replace(".", ",")}
                  </Text>
                </View>
              ))}
              <View style={styles.divider} />
              <View style={styles.itemRow}>
                <Text style={styles.totalLabel}>Total a Pagar</Text>
                <Text style={styles.totalValue}>
                  R$ {valorTotal.toFixed(2).replace(".", ",")}
                </Text>
              </View>
            </View>

            {/* SELEÇÃO DE PAGAMENTO */}
            <Text style={[styles.sectionTitle, { marginLeft: 5, marginTop: 10 }]}>Método de Pagamento</Text>
            <View style={styles.metodosContainer}>
              <TouchableOpacity
                style={[styles.metodoCard, metodo === "PIX" && styles.metodoCardActive]}
                onPress={() => setMetodo("PIX")}
              >
                <Ionicons name="qr-code-outline" size={28} color={metodo === "PIX" ? "#ffd700" : "#aaa"} />
                <Text style={[styles.metodoText, metodo === "PIX" && { color: "#ffd700" }]}>PIX</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.metodoCard, metodo === "CARTAO" && styles.metodoCardActive]}
                onPress={() => setMetodo("CARTAO")}
              >
                <Ionicons name="card-outline" size={28} color={metodo === "CARTAO" ? "#ffd700" : "#aaa"} />
                <Text style={[styles.metodoText, metodo === "CARTAO" && { color: "#ffd700" }]}>Cartão</Text>
              </TouchableOpacity>
            </View>

            {/* FORMULÁRIO DO CARTÃO */}
            {metodo === "CARTAO" && (
              <View style={styles.card}>
                <Text style={styles.label}>Número do Cartão</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0000 0000 0000 0000"
                  placeholderTextColor="#777"
                  keyboardType="numeric"
                  value={numeroCartao}
                  onChangeText={setNumeroCartao}
                />

                <Text style={styles.label}>Nome do Titular</Text>
                <TextInput
                  style={styles.input}
                  placeholder="EX: BRUNO H NUNES"
                  placeholderTextColor="#777"
                  autoCapitalize="characters"
                  value={nome}
                  onChangeText={setNome}
                />

                <View style={styles.row}>
                  <View style={styles.halfInput}>
                    <Text style={styles.label}>Validade (MM/AA)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="12/30"
                      placeholderTextColor="#777"
                      keyboardType="numbers-and-punctuation"
                      value={validade}
                      onChangeText={setValidade}
                    />
                  </View>
                  <View style={styles.halfInput}>
                    <Text style={styles.label}>CVV</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="123"
                      placeholderTextColor="#777"
                      keyboardType="numeric"
                      secureTextEntry
                      value={cvv}
                      onChangeText={setCvv}
                    />
                  </View>
                </View>
              </View>
            )}

            {/* INSTRUÇÃO PIX */}
            {metodo === "PIX" && (
              <View style={[styles.card, { alignItems: "center", paddingVertical: 30 }]}>
                <Ionicons name="scan-circle-outline" size={80} color="#ffd700" />
                <Text style={styles.pixText}>
                  Após confirmar, o código PIX Copia e Cola será gerado na próxima tela.
                </Text>
              </View>
            )}

          </ScrollView>

          {/* BOTÃO FINALIZAR */}
          <TouchableOpacity style={styles.checkoutBtn} onPress={handleFinalizar}>
            <Ionicons name="lock-closed" size={20} color="#000" style={{ marginRight: 8 }} />
            <Text style={styles.checkoutText}>CONFIRMAR PAGAMENTO</Text>
          </TouchableOpacity>
          
        </View>
      </KeyboardAvoidingView>
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
    paddingHorizontal: 15,
    paddingTop: 50,
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#fff",
  },
  card: {
    backgroundColor: "#2A2A2A",
    borderRadius: 14,
    padding: 20,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 15,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  itemText: {
    color: "#B5B5B5",
    fontSize: 16,
    flex: 1,
    marginRight: 10,
  },
  itemPrice: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "#444",
    marginVertical: 15,
  },
  totalLabel: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  totalValue: {
    color: "#ffd700",
    fontSize: 20,
    fontWeight: "bold",
  },
  metodosContainer: {
    flexDirection: "row",
    gap: 15,
    marginBottom: 20,
  },
  metodoCard: {
    flex: 1,
    backgroundColor: "#2A2A2A",
    padding: 20,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  metodoCardActive: {
    borderColor: "#ffd700",
  },
  metodoText: {
    color: "#aaa",
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 8,
  },
  label: {
    color: "#B5B5B5",
    fontSize: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#1A1A1A",
    color: "#fff",
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#444",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  halfInput: {
    width: "48%",
  },
  pixText: {
    color: "#fff",
    textAlign: "center",
    marginTop: 15,
    fontSize: 15,
    lineHeight: 22,
  },
  checkoutBtn: {
    backgroundColor: "#ffd700",
    flexDirection: "row",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  checkoutText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#000",
  },
});