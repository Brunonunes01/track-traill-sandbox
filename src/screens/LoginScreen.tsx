import { Ionicons } from "@expo/vector-icons";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
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
import { ensureUserProfileCompatibility } from "../services/userService";

const LOGIN_ATTEMPT_TIMEOUT_MS = 15000;

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string) => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
};

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const hasNavigatedRef = useRef(false);

  const emailFocus = useRef(new Animated.Value(0)).current;
  const passwordFocus = useRef(new Animated.Value(0)).current;

  const navigateToMain = useCallback(
    (source: string) => {
      if (hasNavigatedRef.current) {
        console.log(`[auth] Skipping navigation from ${source} (already navigating/navigated)`);
        return;
      }

      hasNavigatedRef.current = true;
      console.log(`[auth] Initiating navigation to MainTabs from source: ${source}`);

      const performNavigation = () => {
        try {
          if (typeof navigation?.replace === "function") {
            navigation.replace("MainTabs");
            return;
          }
          if (typeof navigation?.navigate === "function") {
            navigation.navigate("MainTabs");
            return;
          }
          throw new Error("Navigation API indisponível no login.");
        } catch (navError: any) {
          hasNavigatedRef.current = false;
          console.error("[auth] Navigation error captured in performNavigation:", navError);
          setError("Falha ao abrir o painel principal. Tente novamente.");
          Alert.alert("Erro de Navegação", "Não foi possível abrir a tela principal após o login.");
        }
      };

      if (Platform.OS === "android") {
        setTimeout(performNavigation, 300);
      } else {
        performNavigation();
      }
    },
    [navigation]
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        navigateToMain("auth-state-listener");
      }
    });
    return unsubscribe;
  }, [navigateToMain]);

  const handleFocus = (anim: Animated.Value) => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: false,
    }).start();
  };

  const handleBlur = (anim: Animated.Value) => {
    Animated.timing(anim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Digite o e-mail e a senha.");
      return;
    }

    if (isSubmitting) return;

    setIsSubmitting(true);
    setError("");

    try {
      const userCredential = await withTimeout(
        signInWithEmailAndPassword(auth, email.trim(), password),
        LOGIN_ATTEMPT_TIMEOUT_MS,
        "Tempo de login excedido. Verifique sua conexão e tente novamente."
      );

      try {
        await ensureUserProfileCompatibility({
          uid: userCredential.user.uid,
          email: userCredential.user.email || "",
        });
      } catch {
        Alert.alert(
          "Perfil parcialmente indisponível",
          "O login foi concluído, mas houve falha ao carregar seu perfil."
        );
      }

      setError("");
      setEmail("");
      setPassword("");
      navigateToMain("login-success");
    } catch (err: any) {
      if (err.code === "auth/user-not-found") {
        setError("Usuário não encontrado.");
      } else if (err.code === "auth/wrong-password") {
        setError("Senha incorreta.");
      } else if (err.code === "auth/invalid-email") {
        setError("E-mail inválido.");
      } else if (err?.message === "Tempo de login excedido. Verifique sua conexão e tente novamente.") {
        setError(err.message);
      } else {
        setError("Erro ao fazer login.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError("Digite seu e-mail para redefinir a senha.");
      return;
    }

    if (isResettingPassword) return;

    setIsResettingPassword(true);
    setError("");

    try {
      await sendPasswordResetEmail(auth, normalizedEmail);
      Alert.alert(
        "E-mail enviado",
        "Enviamos um link para redefinição de senha. Verifique sua caixa de entrada."
      );
    } catch (err: any) {
      if (err?.code === "auth/invalid-email") {
        setError("E-mail inválido.");
      } else {
        setError("Não foi possível enviar o e-mail de redefinição.");
      }
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleSocialLoginPress = (providerName: string) => {
    Alert.alert(
      "Login social",
      `${providerName} ainda não está configurado neste ambiente. Use e-mail e senha por enquanto.`
    );
  };

  const webInputStyle = Platform.OS === "web" ? ({ outlineWidth: 0 } as any) : {};

  return (
    <ImageBackground source={require("../../assets/images/Azulao.png")} style={styles.background}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboardWrap}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <Image style={styles.logo} source={require("../../assets/images/LogoTrack.png")} />

              <Text style={styles.title}>Bem-vindo</Text>
              <Text style={styles.subtitle}>Acesse sua conta para continuar</Text>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Animated.View
                style={[
                  styles.inputContainer,
                  {
                    borderColor: emailFocus.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["rgba(255,255,255,0.55)", "#60a5fa"],
                    }),
                  },
                ]}
              >
                <Ionicons name="mail-outline" size={18} color="#d1d5db" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, webInputStyle]}
                  placeholder="E-mail"
                  placeholderTextColor="#cbd5e1"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  underlineColorAndroid="transparent"
                  value={email}
                  onFocus={() => handleFocus(emailFocus)}
                  onBlur={() => handleBlur(emailFocus)}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (error) setError("");
                  }}
                />
              </Animated.View>

              <Animated.View
                style={[
                  styles.inputContainer,
                  {
                    borderColor: passwordFocus.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["rgba(255,255,255,0.55)", "#60a5fa"],
                    }),
                  },
                ]}
              >
                <Ionicons name="lock-closed-outline" size={18} color="#d1d5db" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, webInputStyle]}
                  placeholder="Senha"
                  placeholderTextColor="#cbd5e1"
                  secureTextEntry={!showPassword}
                  underlineColorAndroid="transparent"
                  value={password}
                  onFocus={() => handleFocus(passwordFocus)}
                  onBlur={() => handleBlur(passwordFocus)}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (error) setError("");
                  }}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                  <Ionicons name={showPassword ? "eye" : "eye-off"} size={20} color="#e5e7eb" />
                </TouchableOpacity>
              </Animated.View>

              <TouchableOpacity
                style={[styles.primaryButton, isSubmitting && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={isSubmitting}
              >
                <Text style={styles.primaryButtonText}>{isSubmitting ? "ENTRANDO..." : "ENTRAR"}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.forgotPasswordButton}
                onPress={handleForgotPassword}
                disabled={isResettingPassword}
              >
                <Text style={styles.forgotPasswordText}>
                  {isResettingPassword ? "ENVIANDO..." : "Esqueceu sua senha?"}
                </Text>
              </TouchableOpacity>

              <View style={styles.socialSection}>
                <Text style={styles.socialLabel}>Ou entre com</Text>
                <View style={styles.socialButtonsRow}>
                  <TouchableOpacity style={styles.socialButton} onPress={() => handleSocialLoginPress("Facebook")}>
                    <Ionicons name="logo-facebook" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.socialButton} onPress={() => handleSocialLoginPress("Instagram")}>
                    <Ionicons name="logo-instagram" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.socialButton} onPress={() => handleSocialLoginPress("X")}>
                    <Ionicons name="logo-twitter" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity style={styles.switchButton} onPress={() => navigation.navigate("Register")}>
                <Text style={styles.switchText}>
                  Não tem uma conta? <Text style={styles.switchLink}>Cadastre-se</Text>
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
  background: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
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
    width: 160,
    height: 160,
    marginBottom: 8,
    resizeMode: "contain",
    alignSelf: "center",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    color: "#dbeafe",
    fontSize: 14,
    marginTop: 4,
    marginBottom: 18,
    textAlign: "center",
  },
  inputContainer: {
    width: "100%",
    minHeight: 52,
    borderWidth: 1.5,
    borderRadius: 14,
    backgroundColor: "rgba(30, 41, 59, 0.75)",
    marginBottom: 12,
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
    fontSize: 16,
    paddingVertical: 0,
  },
  eyeButton: {
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  errorText: {
    color: "#fda4af",
    fontSize: 13,
    marginBottom: 10,
  },
  primaryButton: {
    width: "100%",
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
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
  forgotPasswordButton: {
    marginTop: 12,
    alignSelf: "center",
  },
  forgotPasswordText: {
    color: "#bfdbfe",
    fontSize: 13,
    textDecorationLine: "underline",
  },
  socialSection: {
    marginTop: 18,
    alignItems: "center",
  },
  socialLabel: {
    color: "#e2e8f0",
    fontSize: 13,
    marginBottom: 10,
  },
  socialButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  socialButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.5)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  switchButton: {
    marginTop: 18,
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
});
