import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth/AuthContext";
import { api } from "@/src/api/client";
import { colors, hardShadow, MONTHS_ES } from "@/src/theme";

const TYPES: { key: string; label: string }[] = [
  { key: "cumpleanos", label: "Cumpleaños" },
  { key: "aniversario", label: "Aniversario" },
  { key: "otro", label: "Otro" },
];

function daysInMonth(month1: number) {
  // Use a non-leap year to keep day count stable for the picker (we never store year)
  return new Date(2025, month1, 0).getDate();
}

export default function EventForm() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { token } = useAuth();
  const editId = params.id;

  const [name, setName] = useState("");
  const [day, setDay] = useState(1);
  const [month, setMonth] = useState(1);
  const [type, setType] = useState("cumpleanos");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!editId || !token) return;
      try {
        const list = await api.listEvents(token);
        const it = list.find((x) => x.id === editId);
        if (it) {
          setName(it.name);
          setDay(it.day);
          setMonth(it.month);
          setType(it.type);
        }
      } catch (e) {
        console.warn(e);
      }
    };
    load();
  }, [editId, token]);

  const handleSave = async () => {
    if (!token) return;
    if (!name.trim()) {
      Alert.alert("Falta nombre", "Introduce un nombre para el evento.");
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await api.updateEvent(token, editId, { name: name.trim(), day, month, type });
      } else {
        await api.createEvent(token, { name: name.trim(), day, month, type });
      }
      router.back();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const maxDay = daysInMonth(month);
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);

  return (
    <SafeAreaView style={styles.container} testID="event-form">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="btn-close">
            <Ionicons name="close" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>{editId ? "Editar evento" : "Nuevo evento"}</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={[styles.input, hardShadow]}
            value={name}
            onChangeText={setName}
            placeholder="Ej. María García"
            placeholderTextColor={colors.textSecondary}
            testID="input-event-name"
          />

          <Text style={styles.label}>Tipo</Text>
          <View style={styles.typeRow}>
            {TYPES.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[styles.typeChip, type === t.key && styles.typeChipActive]}
                onPress={() => setType(t.key)}
                testID={`type-${t.key}`}
              >
                <Text style={[styles.typeChipText, type === t.key && styles.typeChipTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Mes</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollRow}>
            {MONTHS_ES.map((m, i) => (
              <TouchableOpacity
                key={m}
                style={[styles.chip, month === i + 1 && styles.chipActive]}
                onPress={() => {
                  setMonth(i + 1);
                  const md = daysInMonth(i + 1);
                  if (day > md) setDay(md);
                }}
                testID={`month-${i + 1}`}
              >
                <Text style={[styles.chipText, month === i + 1 && styles.chipTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.label}>Día</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollRow}>
            {days.map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.dayChip, day === d && styles.chipActive]}
                onPress={() => setDay(d)}
                testID={`day-${d}`}
              >
                <Text style={[styles.chipText, day === d && styles.chipTextActive]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.preview}>
            <Text style={styles.previewLabel}>Resumen</Text>
            <Text style={styles.previewText}>
              {name || "(sin nombre)"} · {day} de {MONTHS_ES[month - 1].toLowerCase()}
            </Text>
            <Text style={styles.previewSub}>Sin año (evento anual)</Text>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, hardShadow, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            testID="btn-save-event"
          >
            <Text style={styles.saveText}>{saving ? "Guardando..." : "Guardar"}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 2, borderBottomColor: colors.border, backgroundColor: colors.surface,
  },
  title: { fontSize: 18, fontWeight: "900", color: colors.textPrimary },
  body: { padding: 24, gap: 8 },
  label: {
    fontSize: 11, fontWeight: "800", letterSpacing: 1, color: colors.textSecondary,
    textTransform: "uppercase", marginTop: 8,
  },
  input: {
    backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.textPrimary,
    borderRadius: 0,
  },
  typeRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  typeChip: {
    flex: 1, borderWidth: 2, borderColor: colors.border, paddingVertical: 12,
    alignItems: "center", backgroundColor: colors.surface, borderRadius: 0,
  },
  typeChipActive: { backgroundColor: colors.primary },
  typeChipText: { fontWeight: "800", color: colors.textPrimary, fontSize: 13 },
  typeChipTextActive: { color: colors.textPrimary },
  scrollRow: { marginTop: 4 },
  chip: {
    borderWidth: 2, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10,
    marginRight: 8, backgroundColor: colors.surface, borderRadius: 0,
  },
  dayChip: {
    borderWidth: 2, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10,
    marginRight: 8, backgroundColor: colors.surface, borderRadius: 0,
    minWidth: 48, alignItems: "center",
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontWeight: "800", color: colors.textPrimary, fontSize: 14 },
  chipTextActive: { color: colors.textPrimary },
  preview: {
    marginTop: 16, padding: 16, backgroundColor: colors.surface,
    borderWidth: 2, borderColor: colors.border, borderRadius: 0,
  },
  previewLabel: {
    fontSize: 11, fontWeight: "800", letterSpacing: 1, color: colors.textSecondary,
    textTransform: "uppercase",
  },
  previewText: { fontSize: 17, fontWeight: "800", color: colors.textPrimary, marginTop: 4 },
  previewSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2, fontWeight: "700" },
  saveBtn: {
    backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.border,
    paddingVertical: 16, alignItems: "center", marginTop: 16, borderRadius: 0,
  },
  saveText: { fontSize: 16, fontWeight: "900", color: colors.textPrimary, letterSpacing: 0.5 },
});
