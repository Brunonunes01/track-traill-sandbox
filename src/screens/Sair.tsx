// src/screens/Sair.tsx
import { useNavigation } from "@react-navigation/native";
import { useEffect } from "react";
import { Alert } from "react-native";
import { auth } from "../../services/connectionFirebase";

export default function Sair() {
  const navigation = useNavigation();

  useEffect(() => {
    auth.signOut()
      .then(() => {
        // Redireciona para a tela de login corretamente
        navigation.getParent()?.reset({
            index: 0,
            routes: [{ name: "Login" }],
          });          
      })
      .catch((error) => {
        Alert.alert("Erro", "Não foi possível sair: " + error.message);
      });
  }, [navigation]);

  return null; // Tela em branco, só faz logout
}
