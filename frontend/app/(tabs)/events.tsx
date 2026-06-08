import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth/AuthContext";
import { useDevMode } from "@/src/devmode/DevModeContext";
import { api, EventItem } from "@/src/api/client";
import { colors, hardShadow, formatDateEs } from "@/src/theme";

const TYPE_LABEL: Record<string, string> = {
  cumpleanos: "Cumpleaños",
  aniversario: "Aniversario",
  otro: "Otro",
};

export default function EventsScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { devMode } = useDevMode();
  const [items, setItems] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.listEvents(token);
      // Sort by month/day
      data.sort((a, b) => a.month - b.month || a.day - b.day);
      setItems(data);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirmDelete = (item: EventItem) => {
    Alert.alert(
      "Eliminar evento",
      `¿Eliminar el evento de ${item.name}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            if (!token) return;
            await api.deleteEvent(token, item.id);
            load();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="events-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Eventos</Text>
          <Text style={styles.subtitle}>{items.length} registrados</Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, hardShadow]}
          onPress={() => router.push("/event-form")}
          testID="btn-add-event"
        >
          <Ionicons name="add" size={22} color={colors.textPrimary} />
          <Text style={styles.addText}>Añadir</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.border} style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyCard, hardShadow]}>
            <Ionicons name="gift-outline" size={48} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>Sin eventos</Text>
            <Text style={styles.emptyText}>
              Añade el primer cumpleaños o aniversario para empezar a recordarlos.
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={{ padding: 24, gap: 12 }}
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => (
            <View style={[styles.row, hardShadow]} testID={`event-row-${item.id}`}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowDate}>{formatDateEs(item.day, item.month)}</Text>
                <Text style={styles.rowType}>{TYPE_LABEL[item.type] || item.type}</Text>
                {devMode && item.next_review_days != null && (
                  <Text style={styles.devHint}>
                    {item.next_review_days <= 0 ? "Repaso: hoy" : `Repaso: en ${item.next_review_days}d`}
                  </Text>
                )}
              </View>
              <View style={styles.rowActions}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => router.push({ pathname: "/event-form", params: { id: item.id } })}
                  testID={`btn-edit-${item.id}`}
                >
                  <Ionicons name="create-outline" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => confirmDelete(item)}
                  testID={`btn-delete-${item.id}`}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.again} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  title: { fontSize: 32, fontWeight: "900", color: colors.textPrimary, letterSpacing: -1 },
  subtitle: { fontSize: 13, color: colors.textSecondary, fontWeight: "700", marginTop: 2 },
  addBtn: {
    backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.border,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 0,
    flexDirection: "row", alignItems: "center", gap: 4,
  },
  addText: { fontWeight: "800", color: colors.textPrimary, fontSize: 14 },
  row: {
    backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border,
    padding: 16, flexDirection: "row", alignItems: "center", borderRadius: 0,
  },
  rowLeft: { flex: 1 },
  rowName: { fontSize: 17, fontWeight: "800", color: colors.textPrimary },
  rowDate: { fontSize: 14, color: colors.secondary, marginTop: 2, fontWeight: "700" },
  rowType: {
    fontSize: 10, color: colors.textSecondary, marginTop: 4, fontWeight: "800",
    textTransform: "uppercase", letterSpacing: 1,
  },
  devHint: { fontSize: 11, color: "#94a3b8", fontWeight: "600", marginTop: 4 },
  rowActions: { flexDirection: "row", gap: 8 },
  iconBtn: {
    borderWidth: 2, borderColor: colors.border, padding: 8, borderRadius: 0,
    backgroundColor: colors.bg,
  },
  emptyWrap: { flex: 1, padding: 24, justifyContent: "center" },
  emptyCard: {
    backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border,
    padding: 24, alignItems: "center", borderRadius: 0,
  },
  emptyTitle: { fontSize: 22, fontWeight: "900", color: colors.textPrimary, marginTop: 12 },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: "center", marginTop: 8 },
});
