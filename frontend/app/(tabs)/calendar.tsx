import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth/AuthContext";
import { api, EventItem } from "@/src/api/client";
import { colors, hardShadow, MONTHS_ES, formatDateEs } from "@/src/theme";

const WEEK_DAYS = ["L", "M", "X", "J", "V", "S", "D"];

function daysInMonth(year: number, month0: number) {
  return new Date(year, month0 + 1, 0).getDate();
}
function firstWeekdayMon(year: number, month0: number) {
  // Returns 0..6 where 0=Mon
  const js = new Date(year, month0, 1).getDay(); // 0=Sun
  return (js + 6) % 7;
}

export default function CalendarScreen() {
  const { token } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(now.getDate());

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.listEvents(token);
      setEvents(data);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const eventsByDay = useMemo(() => {
    const map: Record<number, EventItem[]> = {};
    for (const ev of events) {
      if (ev.month - 1 === month) {
        if (!map[ev.day]) map[ev.day] = [];
        map[ev.day].push(ev);
      }
    }
    return map;
  }, [events, month]);

  const selectedEvents = selectedDay ? eventsByDay[selectedDay] || [] : [];

  const dim = daysInMonth(year, month);
  const offset = firstWeekdayMon(year, month);
  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const goPrev = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
    setSelectedDay(null);
  };
  const goNext = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
    setSelectedDay(null);
  };

  const today = new Date();
  const isToday = (d: number) =>
    d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="calendar-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Calendario</Text>
      </View>

      <View style={styles.monthRow}>
        <TouchableOpacity style={styles.navBtn} onPress={goPrev} testID="btn-prev-month">
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{MONTHS_ES[month]} {year}</Text>
        <TouchableOpacity style={styles.navBtn} onPress={goNext} testID="btn-next-month">
          <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.border} style={{ marginTop: 24 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={styles.weekRow}>
            {WEEK_DAYS.map((w) => (
              <View key={w} style={styles.weekCell}><Text style={styles.weekText}>{w}</Text></View>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map((d, i) => {
              const has = d != null && eventsByDay[d]?.length > 0;
              const isSelected = d != null && d === selectedDay;
              return (
                <TouchableOpacity
                  key={i}
                  disabled={d == null}
                  style={[
                    styles.cell,
                    has && styles.cellHasEvent,
                    isSelected && styles.cellSelected,
                    d != null && isToday(d) && styles.cellToday,
                  ]}
                  onPress={() => d != null && setSelectedDay(d)}
                  testID={d != null ? `day-${d}` : undefined}
                >
                  <Text style={[
                    styles.cellText,
                    has && styles.cellTextHasEvent,
                    isSelected && styles.cellTextSelected,
                  ]}>
                    {d ?? ""}
                  </Text>
                  {has && <View style={styles.dot} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedDay != null && (
            <View style={styles.detailsBlock}>
              <Text style={styles.detailsTitle}>
                {formatDateEs(selectedDay, month + 1).charAt(0).toUpperCase() +
                  formatDateEs(selectedDay, month + 1).slice(1)}
              </Text>
              {selectedEvents.length === 0 ? (
                <Text style={styles.detailsEmpty}>Sin eventos este día.</Text>
              ) : (
                selectedEvents.map((ev) => (
                  <View key={ev.id} style={[styles.detailRow, hardShadow]}>
                    <Ionicons
                      name={ev.type === "cumpleanos" ? "gift" : "heart"}
                      size={20}
                      color={colors.textPrimary}
                    />
                    <Text style={styles.detailName}>{ev.name}</Text>
                  </View>
                ))
              )}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 32, fontWeight: "900", color: colors.textPrimary, letterSpacing: -1 },
  monthRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 24, marginBottom: 8,
  },
  navBtn: {
    borderWidth: 2, borderColor: colors.border, padding: 8, borderRadius: 0,
    backgroundColor: colors.surface,
  },
  monthLabel: { fontSize: 18, fontWeight: "900", color: colors.textPrimary },
  weekRow: { flexDirection: "row", paddingHorizontal: 16, marginTop: 8 },
  weekCell: { flex: 1, alignItems: "center", paddingVertical: 8 },
  weekText: {
    fontSize: 11, fontWeight: "800", color: colors.textSecondary,
    letterSpacing: 1, textTransform: "uppercase",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16 },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    borderWidth: 1, borderColor: colors.borderSubtle,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.surface,
    borderRadius: 0,
  },
  cellHasEvent: { backgroundColor: colors.primary },
  cellSelected: { borderWidth: 3, borderColor: colors.border },
  cellToday: { borderWidth: 2, borderColor: colors.secondary },
  cellText: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  cellTextHasEvent: { fontWeight: "900" },
  cellTextSelected: { fontWeight: "900" },
  dot: {
    width: 4, height: 4, backgroundColor: colors.border,
    position: "absolute", bottom: 4, borderRadius: 0,
  },
  detailsBlock: { padding: 24 },
  detailsTitle: { fontSize: 20, fontWeight: "900", color: colors.textPrimary, marginBottom: 12 },
  detailsEmpty: { fontSize: 14, color: colors.textSecondary },
  detailRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border,
    padding: 14, marginBottom: 10, borderRadius: 0,
  },
  detailName: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
});
