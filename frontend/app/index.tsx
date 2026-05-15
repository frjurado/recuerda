import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth/AuthContext";
import { colors } from "@/src/theme";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function Index() {
  const router = useRouter();
  const { user, loading, signInWithToken } = useAuth();

  useEffect(() => {
    // On web only: handle return from Emergent OAuth with session_id in URL hash/query.
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const tryParse = async () => {
        const hash = window.location.hash;
        const search = window.location.search;
        let sid: string | null = null;
        if (hash && hash.includes("session_id=")) {
          const params = new URLSearchParams(hash.replace(/^#/, ""));
          sid = params.get("session_id");
        } else if (search && search.includes("session_id=")) {
          const params = new URLSearchParams(search);
          sid = params.get("session_id");
        }
        if (sid) {
          try {
            await signInWithToken(sid);
            window.history.replaceState(null, "", window.location.pathname);
          } catch (e) {
            console.warn("Auth failed", e);
          }
        }
      };
      tryParse();
    }
  }, [signInWithToken]);

  useEffect(() => {
    if (loading) return;
    if (user) router.replace("/(tabs)");
    else router.replace("/login");
  }, [loading, user, router]);

  return (
    <View style={styles.container} testID="splash-screen">
      <ActivityIndicator size="large" color={colors.border} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
});
