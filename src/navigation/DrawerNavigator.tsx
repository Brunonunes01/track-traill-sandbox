import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItemList,
} from "@react-navigation/drawer";
import React, { useEffect, useState } from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../../services/connectionFirebase";

import AtividadesScreen from "../screens/AtividadesScreen";
import CartScreen from "../screens/CartScreen";
import CommunityScreen from "../screens/CommunityScreen";
import ConfiguracoesScreen from "../screens/ConfiguracoesScreen";
import DashboardScreen from "../screens/DashboardScreen";
import FriendsScreen from "../screens/FriendsScreen";
import HomeScreen from "../screens/HomeScreen";
import PerfilScreen from "../screens/PerfilScreen";
import PlansScreen from "../screens/PlansScreen";

const Drawer = createDrawerNavigator();

/* ================= DRAWER CUSTOMIZADO ================= */

function CustomDrawerContent(props: any) {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
    });
    return unsubscribe;
  }, []);

  const handleLogout = () => {
    auth.signOut();
  };

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ flex: 1 }}>
      {/* HEADER */}
      <View style={styles.header}>
        <Image
          source={{
            uri:
              user?.photoURL ||
              "https://cdn-icons-png.flaticon.com/512/847/847969.png",
          }}
          style={styles.profileImage}
        />
        <Text style={styles.userName}>
          {user?.displayName || "Usuário"}
        </Text>
        {user?.email && (
          <Text style={styles.userEmail}>{user.email}</Text>
        )}
      </View>

      {/* ITENS */}
      <View style={{ flex: 1, backgroundColor: "#1C1C1C", paddingTop: 10 }}>
        <DrawerItemList {...props} />
      </View>

      {/* LOGOUT */}
      <View style={styles.logoutContainer}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="exit-outline" size={22} color="#1e4db7" />
          <Text style={styles.logoutText}>Sair</Text>
        </TouchableOpacity>
      </View>
    </DrawerContentScrollView>
  );
}

/* ================= NAVIGATOR ================= */

export default function DrawerNavigator() {
  return (
    <Drawer.Navigator
      initialRouteName="Dashboard"
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerStyle: {
          backgroundColor: "rgba(108,59,255,0.35)",
        },
        headerTintColor: "#FFF",
        headerTitleAlign: "center",
        drawerStyle: {
          backgroundColor: "#1C1C1C",
          width: 260,
        },
        drawerActiveTintColor: "#1e4db7",
        drawerInactiveTintColor: "#D1D1D1",
        drawerLabelStyle: {
          fontSize: 15,
          fontWeight: "500",
          marginLeft: -10,
        },
      }}
    >
      {/* DASHBOARD */}
      <Drawer.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          drawerLabel: "Agendamentos",
          headerTitle: "Painel Principal",
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="pine-tree"
              size={size}
              color={color}
            />
          ),
        }}
      />

      {/* PERFIL */}
      <Drawer.Screen
        name="Perfil"
        component={PerfilScreen}
        options={{
          drawerLabel: "Meu Perfil",
          headerTitle: "Perfil do Usuário",
          drawerIcon: ({ color, size }) => (
            <Ionicons
              name="person-circle-outline"
              size={size}
              color={color}
            />
          ),
        }}
      />

      {/* MAPA / INICIAL */}
<Drawer.Screen
  name="Inicial"
  component={HomeScreen}
  options={{
    drawerLabel: "Mapa",
    headerTitle: "Mapa de Lugares",
    drawerIcon: ({ color, size }) => (
      <Ionicons
        name="map-outline"
        size={size}
        color={color}
      />
    ),
  }}
/>

      {/* AMIGOS */}
      <Drawer.Screen
        name="Amigos"
        component={FriendsScreen}
        options={{
          drawerLabel: "Amigos",
          headerTitle: "Amigos",
          drawerIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />

      {/* COMUNIDADE */}
      <Drawer.Screen
        name="Comunidade"
        component={CommunityScreen}
        options={{
          drawerLabel: "Comunidade",
          headerTitle: "Comunidade",
          drawerIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
        }}
      />


      {/* ATIVIDADES */}
      <Drawer.Screen
        name="Atividades"
        component={AtividadesScreen}
        options={{
          drawerLabel: "Atividades",
          headerTitle: "Suas Atividades",
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="run"
              size={size}
              color={color}
            />
          ),
        }}
      />

      {/* PLANOS ✅ (ÍCONE CORRETO) */}
      <Drawer.Screen
        name="Planos"
        component={PlansScreen}
        options={({ navigation }) => ({
          drawerLabel: "Planos",
          headerTitle: "Planos de Assinatura",

          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigation.navigate("Carrinho")}
              style={{ marginRight: 15 }}
            >
              <Ionicons name="cart-outline" size={26} color="#fff" />
            </TouchableOpacity>
          ),

          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="clipboard-text-outline"
              size={size}
              color={color}
            />
          ),
        })}
      />

      {/* CARRINHO */}
      <Drawer.Screen
        name="Carrinho"
        component={CartScreen}
        options={{
          drawerLabel: "Carrinho",
          headerTitle: "Seu Carrinho",
          drawerIcon: ({ color, size }) => (
            <Ionicons name="cart" size={size} color={color} />
          ),
        }}
      />

      {/* CONFIGURAÇÕES */}
      <Drawer.Screen
        name="Configuracoes"
        component={ConfiguracoesScreen}
        options={{
          drawerLabel: "Configurações",
          headerTitle: "Preferências",
          drawerIcon: ({ color, size }) => (
            <Ionicons
              name="settings-outline"
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Drawer.Navigator>
  );
}

/* ================= ESTILOS ================= */

const styles = StyleSheet.create({
  header: {
    backgroundColor: "transparent",
    paddingVertical: 40,
    alignItems: "center",
  },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 10,
  },
  userName: {
    color: "#FFF",
    fontSize: 17,
    fontWeight: "bold",
  },
  userEmail: {
    color: "#E5E5E5",
    fontSize: 13,
  },
  logoutContainer: {
    padding: 15,
    borderTopWidth: 0.5,
    borderTopColor: "#333",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoutText: {
    color: "#1e4db7",
    fontSize: 15,
    fontWeight: "500",
    marginLeft: 10,
  },
});
