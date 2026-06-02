import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth/AuthContext";
import { colors, hardShadow } from "@/src/theme";

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID!,
  offlineAccess: false,
});

export default function LoginScreen() {
  const { signInWithToken } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const { idToken } = await GoogleSignin.getTokens();
      if (!idToken) throw new Error("No se obtuvo el token de Google");
      await signInWithToken(idToken);
      router.replace("/(tabs)");
    } catch (e: any) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) {
        // user cancelled, do nothing
      } else {
        Alert.alert("Error", e?.message || "Fallo al iniciar sesión");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="login-screen">
      <View style={styles.brand}>
        <Text style={styles.brandTitle}>Recuérdame</Text>
        <Text style={styles.brandSubtitle}>Nunca olvides un cumpleaños</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardText}>
          Registra tus eventos importantes y la app te ayudará a recordarlos con
          repetición espaciada al estilo Anki.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.googleBtn, hardShadow]}
        onPress={handleGoogle}
        disabled={loading}
        testID="btn-login-google"
      >
        {loading ? (
          <ActivityIndicator color={colors.border} />
        ) : (
          <>
            <Ionicons name="logo-google" size={22} color={colors.border} />
            <Text style={styles.googleText}>Continuar con Google</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.footer}>Inicia sesión para sincronizar tus eventos.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: "center",
  },
  brand: { marginBottom: 40, alignItems: "flex-start" },
  brandTitle: {
    fontSize: 56, fontWeight: "900", color: colors.textPrimary, letterSpacing: -2,
  },
  brandSubtitle: {
    fontSize: 16, color: colors.textSecondary, marginTop: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 0,
    padding: 20,
    marginBottom: 32,
    ...hardShadow,
  },
  cardText: { color: colors.textPrimary, fontSize: 15, lineHeight: 22 },
  googleBtn: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 0,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  googleText: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  footer: {
    textAlign: "center", marginTop: 24, color: colors.textSecondary, fontSize: 13,
  },
});
