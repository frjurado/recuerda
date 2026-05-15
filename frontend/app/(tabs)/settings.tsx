import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Switch, Platform, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Notifications from "expo-notifications";
import { useAuth } from "@/src/auth/AuthContext";
import { api } from "@/src/api/client";
import { colors, hardShadow } from "@/src/theme";

async function scheduleDailyReminder(hour: number, minute: number) {
  // Cancel previous daily reminders
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Recuerda",
      body: "Tienes fechas que repasar hoy",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    } as any,
  });
}

export default function SettingsScreen() {
  const { token, user, signOut } = useAuth();
  const [enabled, setEnabled] = useState(true);
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const s = await api.getSettings(token);
      setEnabled(s.notifications_enabled);
      setHour(s.notification_hour);
      setMinute(s.notification_minute);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const requestPermissions = async () => {
    if (Platform.OS === "web") return true;
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted") return true;
    const req = await Notifications.requestPermissionsAsync();
    return req.status === "granted";
  };

  const toggleEnabled = async (v: boolean) => {
    if (!token) return;
    if (v) {
      const ok = await requestPermissions();
      if (!ok) {
        Alert.alert("Permisos", "Activa los permisos de notificación en los ajustes del dispositivo.");
        return;
      }
      await scheduleDailyReminder(hour, minute);
    } else {
      if (Platform.OS !== "web") {
        await Notifications.cancelAllScheduledNotificationsAsync();
      }
    }
    setEnabled(v);
    await api.updateSettings(token, { notifications_enabled: v });
  };

  const onTimeChange = async (_e: any, selected?: Date) => {
    setShowPicker(Platform.OS === "ios");
    if (!selected || !token) return;
    const h = selected.getHours();
    const m = selected.getMinutes();
    setHour(h);
    setMinute(m);
    await api.updateSettings(token, { notification_hour: h, notification_minute: m });
    if (enabled && Platform.OS !== "web") {
      const ok = await requestPermissions();
      if (ok) await scheduleDailyReminder(h, m);
    }
  };

  const pad = (n: number) => String(n).padStart(2, "0");

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.border} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="settings-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Ajustes</Text>
        <Text style={styles.subtitle}>{user?.email}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Notificaciones</Text>

        <View style={[styles.row, hardShadow]}>
          <View style={styles.rowLeft}>
            <Ionicons name="notifications" size={20} color={colors.textPrimary} />
            <Text style={styles.rowText}>Recordatorio diario</Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={toggleEnabled}
            trackColor={{ true: colors.good, false: colors.borderSubtle }}
            thumbColor={colors.surface}
            testID="toggle-notifications"
          />
        </View>

        <TouchableOpacity
          style={[styles.row, hardShadow, !enabled && styles.rowDisabled]}
          onPress={() => enabled && setShowPicker(true)}
          disabled={!enabled}
          testID="picker-notification-time"
        >
          <View style={styles.rowLeft}>
            <Ionicons name="time" size={20} color={colors.textPrimary} />
            <Text style={styles.rowText}>Hora del recordatorio</Text>
          </View>
          <Text style={styles.rowValue}>{pad(hour)}:{pad(minute)}</Text>
        </TouchableOpacity>

        {showPicker && (Platform.OS === "ios" || Platform.OS === "android") && (
          <DateTimePicker
            value={(() => { const d = new Date(); d.setHours(hour, minute, 0, 0); return d; })()}
            mode="time"
            is24Hour
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={onTimeChange}
          />
        )}

        {Platform.OS === "web" && showPicker && (
          <View style={styles.webPickerWrap}>
            <Text style={styles.webPickerLabel}>Selecciona la hora (formato 24h):</Text>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              {[6, 9, 12, 18, 21].map((h) => (
                <TouchableOpacity
                  key={h}
                  style={[styles.timeChip, h === hour && styles.timeChipActive]}
                  onPress={async () => {
                    setHour(h);
                    if (token) await api.updateSettings(token, { notification_hour: h, notification_minute: 0 });
                    setMinute(0);
                    setShowPicker(false);
                  }}
                >
                  <Text style={[styles.timeChipText, h === hour && styles.timeChipTextActive]}>
                    {pad(h)}:00
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.row, hardShadow]}
          onPress={signOut}
          testID="btn-logout"
        >
          <View style={styles.rowLeft}>
            <Ionicons name="log-out" size={20} color={colors.again} />
            <Text style={[styles.rowText, { color: colors.again }]}>Cerrar sesión</Text>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 32, fontWeight: "900", color: colors.textPrimary, letterSpacing: -1 },
  subtitle: { fontSize: 13, color: colors.textSecondary, fontWeight: "700", marginTop: 2 },
  section: { paddingHorizontal: 24, paddingTop: 16, gap: 12 },
  sectionLabel: {
    fontSize: 11, fontWeight: "800", letterSpacing: 1, color: colors.textSecondary,
    textTransform: "uppercase",
  },
  row: {
    backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border,
    paddingVertical: 14, paddingHorizontal: 16, flexDirection: "row",
    alignItems: "center", justifyContent: "space-between", borderRadius: 0,
  },
  rowDisabled: { opacity: 0.5 },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowText: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  rowValue: { fontSize: 15, fontWeight: "800", color: colors.secondary },
  webPickerWrap: { padding: 12, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border },
  webPickerLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: "700" },
  timeChip: {
    borderWidth: 2, borderColor: colors.border, paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: colors.surface, borderRadius: 0,
  },
  timeChipActive: { backgroundColor: colors.primary },
  timeChipText: { fontWeight: "800", color: colors.textPrimary },
  timeChipTextActive: { color: colors.textPrimary },
});
