import { Ionicons } from "@expo/vector-icons";
import { createUserWithEmailAndPassword, type User } from "firebase/auth";
import React, { useState } from "react";
import {
  Image,
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
import { auth } from "../../services/connectionFirebase";
import { isUsernameValid, normalizeUsername, registerUserProfile } from "../services/userService";

export default function RegisterScreen({ navigation }: any) {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRegister = async () => {
    if (!fullName || !username || !email || !password || !birthDate || !phone || !address) {
      setError("Por favor, preencha todos os campos.");
      return;
    }

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    const normalizedUsername = normalizeUsername(username);
    if (!isUsernameValid(normalizedUsername)) {
      setError("Username inválido. Use 3-20 caracteres: letras, números ou underscore.");
      return;
    }

    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      let createdUser: User | null = null;
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;
      createdUser = user;

      try {
        await registerUserProfile({
          uid: user.uid,
          fullName: fullName.trim(),
          username: normalizedUsername,
          email: email.trim(),
          birthDate: birthDate.trim(),
          phone: phone.trim(),
          address: address.trim(),
        });
      } catch (profileError) {
        try {
          await createdUser.delete();
        } catch (deleteError) {
          console.warn("[register] failed to rollback auth user:", deleteError);
        }
        throw profileError;
      }

      setFullName("");
      setUsername("");
      setEmail("");
      setPassword("");
      setBirthDate("");
      setPhone("");
      setAddress("");
      setError("");

      navigation.navigate("Login");
    } catch (err: any) {
      if (err.code === "auth/email-already-in-use") setError("Este e-mail já está em uso.");
      else if (err.code === "auth/invalid-email") setError("E-mail inválido.");
      else setError(err?.message || "Erro ao criar conta.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const webInputExtraStyle = Platform.OS === "web" ? ({ outlineWidth: 0 } as any) : {};

  return (
    <ImageBackground source={require("../../assets/images/Azulao.png")} style={styles.background}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboardWrap}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.card}>
              <Image style={styles.logo} source={require("../../assets/images/LogoTrack.png")} />

              <Text style={styles.title}>Crie sua conta</Text>
              <Text style={styles.subtitle}>Cadastre-se para começar a registrar suas atividades</Text>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={18} color="#d1d5db" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, webInputExtraStyle]}
                  placeholder="Nome completo"
                  placeholderTextColor="#cbd5e1"
                  value={fullName}
                  onChangeText={(text) => {
                    setFullName(text);
                    if (error) setError("");
                  }}
                  underlineColorAndroid="transparent"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputContainer}>
                <Ionicons name="at-outline" size={18} color="#d1d5db" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, webInputExtraStyle]}
                  placeholder="Nome de usuário"
                  placeholderTextColor="#cbd5e1"
                  value={username}
                  onChangeText={(text) => {
                    setUsername(text);
                    if (error) setError("");
                  }}
                  underlineColorAndroid="transparent"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={18} color="#d1d5db" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, webInputExtraStyle]}
                  placeholder="E-mail"
                  placeholderTextColor="#cbd5e1"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (error) setError("");
                  }}
                  underlineColorAndroid="transparent"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputContainer}>
                <Ionicons name="calendar-outline" size={18} color="#d1d5db" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, webInputExtraStyle]}
                  placeholder="Data de nascimento (DD/MM/AAAA)"
                  placeholderTextColor="#cbd5e1"
                  value={birthDate}
                  onChangeText={(text) => {
                    setBirthDate(text);
                    if (error) setError("");
                  }}
                  underlineColorAndroid="transparent"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputContainer}>
                <Ionicons name="call-outline" size={18} color="#d1d5db" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, webInputExtraStyle]}
                  placeholder="Telefone"
                  placeholderTextColor="#cbd5e1"
                  value={phone}
                  onChangeText={(text) => {
                    setPhone(text);
                    if (error) setError("");
                  }}
                  underlineColorAndroid="transparent"
                  keyboardType="phone-pad"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputContainer}>
                <Ionicons name="location-outline" size={18} color="#d1d5db" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, webInputExtraStyle]}
                  placeholder="Endereço"
                  placeholderTextColor="#cbd5e1"
                  value={address}
                  onChangeText={(text) => {
                    setAddress(text);
                    if (error) setError("");
                  }}
                  underlineColorAndroid="transparent"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={18} color="#d1d5db" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, webInputExtraStyle]}
                  placeholder="Senha"
                  placeholderTextColor="#cbd5e1"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (error) setError("");
                  }}
                  underlineColorAndroid="transparent"
                  autoCorrect={false}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                  <Ionicons name={showPassword ? "eye" : "eye-off"} size={20} color="#e5e7eb" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, isSubmitting && styles.buttonDisabled]}
                onPress={handleRegister}
                disabled={isSubmitting}
              >
                <Text style={styles.primaryButtonText}>
                  {isSubmitting ? "CRIANDO..." : "CRIAR CONTA"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.switchButton} onPress={() => navigation.navigate("Login")}>
                <Text style={styles.switchText}>
                  Já tem uma conta? <Text style={styles.switchLink}>Entrar</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(1, 9, 23, 0.72)",
    paddingHorizontal: 18,
  },
  keyboardWrap: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 24,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.28)",
    backgroundColor: "rgba(2, 6, 23, 0.52)",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 22,
  },
  logo: {
    width: 150,
    height: 150,
    marginBottom: 8,
    resizeMode: "contain",
    alignSelf: "center",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    color: "#dbeafe",
    fontSize: 14,
    marginTop: 4,
    marginBottom: 16,
    textAlign: "center",
  },
  inputContainer: {
    width: "100%",
    minHeight: 50,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.5)",
    borderRadius: 14,
    backgroundColor: "rgba(30, 41, 59, 0.75)",
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    paddingVertical: 0,
  },
  eyeButton: {
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  primaryButton: {
    width: "100%",
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.72,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  switchButton: {
    marginTop: 16,
  },
  switchText: {
    color: "#e2e8f0",
    fontSize: 14,
    textAlign: "center",
  },
  switchLink: {
    color: "#60a5fa",
    fontWeight: "800",
  },
  errorText: {
    color: "#fda4af",
    fontSize: 13,
    marginBottom: 10,
  },
});
