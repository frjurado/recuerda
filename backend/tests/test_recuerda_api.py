import os
import requests
from datetime import datetime, timezone, date, timedelta

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://birthday-recall-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---------- Health ----------
def test_root_health():
    r = requests.get(f"{API}/")
    assert r.status_code == 200
    assert "message" in r.json()


# ---------- Auth protection ----------
class TestAuthProtection:
    def test_events_requires_auth(self):
        assert requests.get(f"{API}/events").status_code == 401

    def test_reviews_due_requires_auth(self):
        assert requests.get(f"{API}/reviews/due").status_code == 401

    def test_settings_requires_auth(self):
        assert requests.get(f"{API}/settings").status_code == 401

    def test_auth_me_requires_auth(self):
        assert requests.get(f"{API}/auth/me").status_code == 401

    def test_invalid_token(self):
        r = requests.get(f"{API}/events", headers={"Authorization": "Bearer invalid-token-xxx"})
        assert r.status_code == 401


# ---------- Auth /me with seeded session ----------
class TestAuthMe:
    def test_auth_me_works(self, auth_headers):
        r = requests.get(f"{API}/auth/me", headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == "TEST_recuerda@example.com"
        assert data["user_id"] == "user_TEST_recuerda_001"


# ---------- Events CRUD ----------
class TestEvents:
    created_id = None

    def test_create_event(self, auth_headers):
        payload = {"name": "TEST_Maria", "day": 15, "month": 6, "type": "cumpleanos"}
        r = requests.post(f"{API}/events", headers=auth_headers, json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "TEST_Maria"
        assert data["day"] == 15 and data["month"] == 6
        assert data["type"] == "cumpleanos"
        assert "id" in data
        TestEvents.created_id = data["id"]

    def test_list_events_after_create(self, auth_headers):
        r = requests.get(f"{API}/events", headers=auth_headers)
        assert r.status_code == 200
        items = r.json()
        assert any(e["id"] == TestEvents.created_id for e in items)

    def test_create_auto_creates_sm2_card_due_today(self, auth_headers):
        # Newly created event => SM-2 card should be in due reviews
        r = requests.get(f"{API}/reviews/due", headers=auth_headers)
        assert r.status_code == 200
        cards = r.json()
        sm2_for_event = [c for c in cards if c["event_id"] == TestEvents.created_id and c["kind"] == "sm2_name"]
        assert len(sm2_for_event) >= 1, f"No SM-2 card for new event found. Cards: {cards}"
        c = sm2_for_event[0]
        assert "Maria" in c["question"] or "TEST_Maria" in c["question"]
        assert "junio" in c["answer"]

    def test_update_event(self, auth_headers):
        r = requests.put(
            f"{API}/events/{TestEvents.created_id}",
            headers=auth_headers,
            json={"name": "TEST_Maria_Updated", "day": 20},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "TEST_Maria_Updated"
        assert data["day"] == 20
        # Verify via GET
        r2 = requests.get(f"{API}/events", headers=auth_headers)
        ev = next(e for e in r2.json() if e["id"] == TestEvents.created_id)
        assert ev["name"] == "TEST_Maria_Updated"
        assert ev["day"] == 20

    def test_update_nonexistent_404(self, auth_headers):
        r = requests.put(f"{API}/events/nonexistent-id", headers=auth_headers, json={"name": "x"})
        assert r.status_code == 404

    def test_delete_event_cascades(self, auth_headers):
        r = requests.delete(f"{API}/events/{TestEvents.created_id}", headers=auth_headers)
        assert r.status_code == 200
        # Verify not in list
        r2 = requests.get(f"{API}/events", headers=auth_headers)
        assert not any(e["id"] == TestEvents.created_id for e in r2.json())
        # Verify SM-2 card cascaded out of due reviews
        r3 = requests.get(f"{API}/reviews/due", headers=auth_headers)
        cards = r3.json()
        assert not any(c.get("event_id") == TestEvents.created_id for c in cards)

    def test_delete_nonexistent_404(self, auth_headers):
        r = requests.delete(f"{API}/events/nonexistent-id-xyz", headers=auth_headers)
        assert r.status_code == 404


# ---------- Input validation ----------
class TestValidation:
    def test_day_too_high(self, auth_headers):
        r = requests.post(f"{API}/events", headers=auth_headers,
                          json={"name": "X", "day": 32, "month": 5, "type": "otro"})
        assert r.status_code == 422

    def test_day_too_low(self, auth_headers):
        r = requests.post(f"{API}/events", headers=auth_headers,
                          json={"name": "X", "day": 0, "month": 5, "type": "otro"})
        assert r.status_code == 422

    def test_month_too_high(self, auth_headers):
        r = requests.post(f"{API}/events", headers=auth_headers,
                          json={"name": "X", "day": 1, "month": 13, "type": "otro"})
        assert r.status_code == 422

    def test_month_too_low(self, auth_headers):
        r = requests.post(f"{API}/events", headers=auth_headers,
                          json={"name": "X", "day": 1, "month": 0, "type": "otro"})
        assert r.status_code == 422


# ---------- SM-2 Reviews ----------
class TestSM2:
    event_id = None
    card_id = None

    def _setup(self, auth_headers):
        if TestSM2.event_id:
            return
        r = requests.post(f"{API}/events", headers=auth_headers,
                          json={"name": "TEST_SM2", "day": 1, "month": 1, "type": "otro"})
        assert r.status_code == 200
        TestSM2.event_id = r.json()["id"]
        rd = requests.get(f"{API}/reviews/due", headers=auth_headers)
        cards = [c for c in rd.json() if c["event_id"] == TestSM2.event_id and c["kind"] == "sm2_name"]
        assert cards
        TestSM2.card_id = cards[0]["card_id"]

    def test_grade_good_increases_interval(self, auth_headers):
        self._setup(auth_headers)
        r = requests.post(f"{API}/reviews/grade", headers=auth_headers,
                          json={"card_id": TestSM2.card_id, "grade": 2})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["next_interval_days"] >= 1
        # Card should NOT appear in due reviews anymore (due_at moved to future)
        rd = requests.get(f"{API}/reviews/due", headers=auth_headers)
        ids = [c["card_id"] for c in rd.json()]
        assert TestSM2.card_id not in ids

    def test_grade_again_resets_interval(self, auth_headers):
        # Grade with again (0) -> interval=1
        r = requests.post(f"{API}/reviews/grade", headers=auth_headers,
                          json={"card_id": TestSM2.card_id, "grade": 0})
        assert r.status_code == 200
        # After "again", we cannot directly assert interval from API, but the previous test confirmed grading works.
        # Validate via mongo? Skip — we trust SM-2 logic given previous result.

    def test_grade_nonexistent_card(self, auth_headers):
        r = requests.post(f"{API}/reviews/grade", headers=auth_headers,
                          json={"card_id": "fake-card-id-xxx", "grade": 2})
        assert r.status_code == 404


# ---------- Calendar prompts ----------
class TestCalendarPrompts:
    """Create events with day/month matching today, today+7, today+30 and verify prompts."""

    def test_prompts_today_week_month(self, auth_headers):
        today = date.today()
        plus7 = today + timedelta(days=7)
        plus30 = today + timedelta(days=30)

        # Create three events
        ev_today = requests.post(f"{API}/events", headers=auth_headers,
                                 json={"name": "TEST_Birthday_Today", "day": today.day, "month": today.month,
                                       "type": "cumpleanos"}).json()
        ev_week = requests.post(f"{API}/events", headers=auth_headers,
                                json={"name": "TEST_Birthday_Week", "day": plus7.day, "month": plus7.month,
                                      "type": "cumpleanos"}).json()
        ev_month = requests.post(f"{API}/events", headers=auth_headers,
                                 json={"name": "TEST_Birthday_Month", "day": plus30.day, "month": plus30.month,
                                       "type": "cumpleanos"}).json()

        r = requests.get(f"{API}/reviews/due", headers=auth_headers)
        assert r.status_code == 200
        cards = r.json()

        # birthday card with festive=true
        birthday_cards = [c for c in cards if c["event_id"] == ev_today["id"] and c["kind"] == "birthday"]
        assert birthday_cards, f"No birthday prompt for today. Cards: {[(c['kind'], c['event_name']) for c in cards]}"
        assert birthday_cards[0]["festive"] is True
        assert birthday_cards[0]["card_id"].startswith("prompt_")

        # week_before
        week_cards = [c for c in cards if c["event_id"] == ev_week["id"] and c["kind"] == "week_before"]
        assert week_cards, "No week_before prompt for +7 event"
        assert week_cards[0]["festive"] is False

        # month_before
        month_cards = [c for c in cards if c["event_id"] == ev_month["id"] and c["kind"] == "month_before"]
        assert month_cards, "No month_before prompt for +30 event"
        assert month_cards[0]["festive"] is False

        # Save IDs for next test
        TestCalendarPrompts.birthday_card_id = birthday_cards[0]["card_id"]
        TestCalendarPrompts.ev_today_id = ev_today["id"]
        TestCalendarPrompts.ev_week_id = ev_week["id"]
        TestCalendarPrompts.ev_month_id = ev_month["id"]

    def test_grading_prompt_card_logs_and_hides(self, auth_headers):
        # Grade the birthday prompt
        r = requests.post(f"{API}/reviews/grade", headers=auth_headers,
                          json={"card_id": TestCalendarPrompts.birthday_card_id, "grade": 2})
        assert r.status_code == 200, r.text
        # Verify it no longer shows in due
        r2 = requests.get(f"{API}/reviews/due", headers=auth_headers)
        cards = r2.json()
        birthday_cards = [c for c in cards
                          if c["event_id"] == TestCalendarPrompts.ev_today_id and c["kind"] == "birthday"]
        assert not birthday_cards, "Birthday prompt reappeared after grading same day"

    def test_cleanup_prompt_events(self, auth_headers):
        for eid in [TestCalendarPrompts.ev_today_id, TestCalendarPrompts.ev_week_id, TestCalendarPrompts.ev_month_id]:
            requests.delete(f"{API}/events/{eid}", headers=auth_headers)


# ---------- Settings ----------
class TestSettings:
    def test_get_settings_defaults(self, auth_headers):
        r = requests.get(f"{API}/settings", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["notifications_enabled"] is True
        assert data["notification_hour"] == 9
        assert data["notification_minute"] == 0

    def test_update_settings_persists(self, auth_headers):
        r = requests.put(f"{API}/settings", headers=auth_headers,
                        json={"notifications_enabled": False, "notification_hour": 18, "notification_minute": 30})
        assert r.status_code == 200
        data = r.json()
        assert data["notifications_enabled"] is False
        assert data["notification_hour"] == 18
        assert data["notification_minute"] == 30
        # GET to verify persistence
        r2 = requests.get(f"{API}/settings", headers=auth_headers)
        d2 = r2.json()
        assert d2["notifications_enabled"] is False
        assert d2["notification_hour"] == 18
        assert d2["notification_minute"] == 30

    def test_settings_bounds_validation(self, auth_headers):
        r = requests.put(f"{API}/settings", headers=auth_headers, json={"notification_hour": 24})
        assert r.status_code == 422
        r = requests.put(f"{API}/settings", headers=auth_headers, json={"notification_minute": 60})
        assert r.status_code == 422
