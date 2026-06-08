import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  ScrollView, Linking, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth/AuthContext";
import { useDevMode } from "@/src/devmode/DevModeContext";
import { api, FlashCard } from "@/src/api/client";
import { colors, hardShadow, formatDateEs } from "@/src/theme";

export default function ReviewScreen() {
  const { token, user } = useAuth();
  const { devMode } = useDevMode();
  const [cards, setCards] = useState<FlashCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [revealedFestive, setRevealedFestive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.dueReviews(token);
      setCards(data);
      setIdx(0);
      setRevealed(false);
      setRevealedFestive(false);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => { load(); }, [load]);

  const current = cards[idx];

  const handleGrade = async (grade: number) => {
    if (!token || !current) return;
    try {
      await api.gradeReview(token, current.card_id, grade);
    } catch (e) {
      console.warn(e);
    }
    if (idx + 1 < cards.length) {
      setIdx(idx + 1);
      setRevealed(false);
      setRevealedFestive(false);
    } else {
      // refresh in case more became due
      load();
    }
  };

  const handleDismissFestive = async () => {
    if (!token || !current) return;
    try {
      await api.gradeReview(token, current.card_id, 2);
    } catch (e) {
      console.warn(e);
    }
    if (idx + 1 < cards.length) {
      setIdx(idx + 1);
      setRevealed(false);
      setRevealedFestive(false);
    } else {
      load();
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.border} />
      </SafeAreaView>
    );
  }

  if (cards.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Repasar</Text>
          <Text style={styles.subtitle}>Hola, {user?.name?.split(" ")[0] || ""}</Text>
        </View>
        <ScrollView
          contentContainerStyle={styles.emptyWrap}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          <View style={[styles.emptyCard, hardShadow]} testID="empty-review">
            <Ionicons name="checkmark-circle" size={48} color={colors.good} />
            <Text style={styles.emptyTitle}>¡Todo al día!</Text>
            <Text style={styles.emptyText}>
              No tienes tarjetas por repasar hoy. Vuelve mañana o añade más eventos.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (current.festive) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.festiveOverlay }]} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.title}>¡Festivo!</Text>
          <Text style={styles.subtitle}>{idx + 1} / {cards.length}</Text>
        </View>
        <View style={styles.body}>
          {!revealedFestive ? (
            <>
              <View style={[styles.flashcard, styles.festiveCard, hardShadow]} testID="festive-card">
                <Text style={styles.festiveEmoji}>🎂</Text>
                <Text style={styles.kindLabel}>¡Hoy!</Text>
                <Text style={styles.question} testID="card-question">{current.question}</Text>
              </View>
              <TouchableOpacity
                style={[styles.revealBtn, hardShadow]}
                onPress={() => setRevealedFestive(true)}
                testID="btn-reveal-festive"
              >
                <Text style={styles.revealText}>Ver respuesta</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={[styles.flashcard, styles.festiveCard, hardShadow]} testID="festive-card">
                <Text style={styles.festiveEmoji}>🎂</Text>
                <Text style={styles.festiveName}>{current.event_name}</Text>
                <Text style={styles.festiveTagline}>¡Hoy es el día!</Text>
                <Text style={styles.festiveBody}>Llama o escribe para felicitar</Text>
              </View>
              <View style={styles.festiveActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.call }, hardShadow]}
                  onPress={() => Linking.openURL("tel:")}
                  testID="btn-call"
                >
                  <Ionicons name="call" size={22} color="#fff" />
                  <Text style={styles.actionTextWhite}>Llamar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.message }, hardShadow]}
                  onPress={() => Linking.openURL("sms:")}
                  testID="btn-message"
                >
                  <Ionicons name="chatbubble-ellipses" size={22} color="#fff" />
                  <Text style={styles.actionTextWhite}>Escribir</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.secondaryBtn, hardShadow]}
                onPress={handleDismissFestive}
                testID="btn-dismiss-festive"
              >
                <Text style={styles.secondaryBtnText}>Continuar</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Repasar</Text>
        <Text style={styles.subtitle}>{idx + 1} / {cards.length}</Text>
      </View>
      <View style={styles.body}>
        <View style={[styles.flashcard, hardShadow]} testID="flashcard">
          <Text style={styles.kindLabel}>
            {current.kind === "sm2_name" ? "Memoriza la fecha" :
              current.kind === "day_before" ? "Mañana" :
              current.kind === "week_before" ? "Dentro de 1 semana" :
              current.kind === "month_before" ? "Dentro de 1 mes" : "Recordatorio"}
          </Text>
          <Text style={styles.question} testID="card-question">{current.question}</Text>
          {revealed && (
            <View style={styles.answerBox}>
              <Text style={styles.answerLabel}>Respuesta</Text>
              <Text style={styles.answer} testID="card-answer">
                {current.kind === "sm2_name" ? formatDateEs(current.event_day, current.event_month) : current.answer}
              </Text>
            </View>
          )}
        </View>

        {!revealed ? (
          <TouchableOpacity
            style={[styles.revealBtn, hardShadow]}
            onPress={() => setRevealed(true)}
            testID="btn-reveal"
          >
            <Text style={styles.revealText}>Ver respuesta</Text>
          </TouchableOpacity>
        ) : current.kind === "sm2_name" ? (
          <View style={styles.gradeRow}>
            {([
              { grade: 0, label: "Otra vez", bg: colors.again, textStyle: styles.gradeTextWhite, testID: "btn-grade-again" },
              { grade: 1, label: "Difícil",  bg: colors.hard,  textStyle: styles.gradeText,      testID: "btn-grade-hard"  },
              { grade: 2, label: "Bien",     bg: colors.good,  textStyle: styles.gradeText,      testID: "btn-grade-good"  },
              { grade: 3, label: "Fácil",    bg: colors.easy,  textStyle: styles.gradeTextWhite, testID: "btn-grade-easy"  },
            ] as const).map(({ grade, label, bg, textStyle, testID }) => (
              <View key={grade} style={styles.gradeBtnWrap}>
                <TouchableOpacity
                  style={[styles.gradeBtn, { backgroundColor: bg }]}
                  onPress={() => handleGrade(grade)}
                  testID={testID}
                >
                  <Text style={textStyle}>{label}</Text>
                </TouchableOpacity>
                {devMode && current.grade_intervals != null && (
                  <Text style={styles.devHint}>
                    {current.grade_intervals[grade]}d
                  </Text>
                )}
              </View>
            ))}
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.revealBtn, hardShadow]}
            onPress={() => handleGrade(2)}
            testID="btn-continue"
          >
            <Text style={styles.revealText}>Continuar</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  header: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 32, fontWeight: "900", color: colors.textPrimary, letterSpacing: -1 },
  subtitle: { fontSize: 14, color: colors.textSecondary, fontWeight: "700", marginTop: 2 },
  body: { flex: 1, padding: 24, justifyContent: "space-between" },
  flashcard: {
    backgroundColor: colors.surface,
    borderWidth: 4,
    borderColor: colors.border,
    borderRadius: 0,
    padding: 24,
    minHeight: 320,
    justifyContent: "center",
  },
  festiveCard: { backgroundColor: colors.primary, alignItems: "center" },
  festiveEmoji: { fontSize: 64, marginBottom: 12 },
  festiveName: { fontSize: 32, fontWeight: "900", color: colors.textPrimary, textAlign: "center" },
  festiveTagline: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, marginTop: 8 },
  festiveBody: { fontSize: 14, color: colors.textSecondary, marginTop: 12, textAlign: "center" },
  kindLabel: {
    fontSize: 11, fontWeight: "800", letterSpacing: 1, color: colors.textSecondary,
    textTransform: "uppercase", marginBottom: 12,
  },
  question: { fontSize: 24, fontWeight: "800", color: colors.textPrimary, lineHeight: 32 },
  answerBox: { marginTop: 24, borderTopWidth: 2, borderTopColor: colors.border, paddingTop: 16 },
  answerLabel: {
    fontSize: 11, fontWeight: "800", letterSpacing: 1, color: colors.textSecondary,
    textTransform: "uppercase", marginBottom: 6,
  },
  answer: { fontSize: 22, fontWeight: "800", color: colors.secondary },
  revealBtn: {
    backgroundColor: colors.primary,
    borderWidth: 2, borderColor: colors.border, borderRadius: 0,
    paddingVertical: 18, alignItems: "center", marginTop: 16,
  },
  revealText: { fontSize: 16, fontWeight: "800", color: colors.textPrimary, letterSpacing: 0.5 },
  gradeRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  gradeBtnWrap: { flex: 1, alignItems: "center" },
  gradeBtn: {
    width: "100%", borderWidth: 2, borderColor: colors.border, paddingVertical: 16,
    alignItems: "center", borderRadius: 0,
  },
  gradeText: { fontWeight: "800", color: colors.textPrimary, fontSize: 13 },
  gradeTextWhite: { fontWeight: "800", color: "#fff", fontSize: 13 },
  devHint: { fontSize: 11, color: "#94a3b8", fontWeight: "600", marginTop: 4 },
  festiveActions: { flexDirection: "row", gap: 12, marginTop: 16 },
  actionBtn: {
    flex: 1, borderWidth: 2, borderColor: colors.border, paddingVertical: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 0,
  },
  actionTextWhite: { color: "#fff", fontWeight: "800", fontSize: 15 },
  secondaryBtn: {
    backgroundColor: colors.surface,
    borderWidth: 2, borderColor: colors.border, paddingVertical: 14,
    alignItems: "center", marginTop: 12, borderRadius: 0,
  },
  secondaryBtnText: { fontWeight: "800", color: colors.textPrimary },
  emptyWrap: { flexGrow: 1, padding: 24, justifyContent: "center" },
  emptyCard: {
    backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border,
    padding: 24, alignItems: "center", borderRadius: 0,
  },
  emptyTitle: { fontSize: 22, fontWeight: "900", color: colors.textPrimary, marginTop: 12 },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: "center", marginTop: 8 },
});
