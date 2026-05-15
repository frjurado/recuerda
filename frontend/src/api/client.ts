const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export type EventItem = {
  id: string;
  name: string;
  day: number;
  month: number;
  type: string;
};

export type FlashCard = {
  card_id: string;
  event_id: string;
  event_name: string;
  event_day: number;
  event_month: number;
  event_type: string;
  kind: "sm2_name" | "week_before" | "month_before" | "birthday";
  question: string;
  answer: string;
  festive: boolean;
};

export type Settings = {
  notifications_enabled: boolean;
  notification_hour: number;
  notification_minute: number;
};

async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_URL}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  listEvents: (token: string) => apiFetch<EventItem[]>("/events", token),
  createEvent: (token: string, data: Omit<EventItem, "id">) =>
    apiFetch<EventItem>("/events", token, { method: "POST", body: JSON.stringify(data) }),
  updateEvent: (token: string, id: string, data: Partial<Omit<EventItem, "id">>) =>
    apiFetch<EventItem>(`/events/${id}`, token, { method: "PUT", body: JSON.stringify(data) }),
  deleteEvent: (token: string, id: string) =>
    apiFetch<{ ok: boolean }>(`/events/${id}`, token, { method: "DELETE" }),
  dueReviews: (token: string) => apiFetch<FlashCard[]>("/reviews/due", token),
  gradeReview: (token: string, card_id: string, grade: number) =>
    apiFetch<{ ok: boolean }>("/reviews/grade", token, {
      method: "POST",
      body: JSON.stringify({ card_id, grade }),
    }),
  hasDue: (token: string) => apiFetch<{ count: number; has_due: boolean }>("/reviews/has-due", token),
  getSettings: (token: string) => apiFetch<Settings>("/settings", token),
  updateSettings: (token: string, data: Partial<Settings>) =>
    apiFetch<Settings>("/settings", token, { method: "PUT", body: JSON.stringify(data) }),
};
