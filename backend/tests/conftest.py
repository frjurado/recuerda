import os
import asyncio
import pytest
import requests
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://birthday-recall-1.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

TEST_USER_ID = "user_TEST_recuerda_001"
TEST_TOKEN = "TEST_token_recuerda_abc123"
TEST_EMAIL = "TEST_recuerda@example.com"


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def auth_headers():
    return {"Authorization": f"Bearer {TEST_TOKEN}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session", autouse=True)
def seed_user():
    """Seed test user + session in MongoDB; cleanup after."""
    async def _run():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        # Clean any old TEST data
        await db.users.delete_many({"user_id": TEST_USER_ID})
        await db.user_sessions.delete_many({"user_id": TEST_USER_ID})
        await db.events.delete_many({"user_id": TEST_USER_ID})
        await db.flashcards.delete_many({"user_id": TEST_USER_ID})
        await db.prompt_log.delete_many({"user_id": TEST_USER_ID})
        await db.settings.delete_many({"user_id": TEST_USER_ID})

        now = datetime.now(timezone.utc)
        await db.users.insert_one({
            "user_id": TEST_USER_ID,
            "email": TEST_EMAIL,
            "name": "TEST Recuerda",
            "picture": None,
            "created_at": now,
        })
        await db.user_sessions.insert_one({
            "session_token": TEST_TOKEN,
            "user_id": TEST_USER_ID,
            "created_at": now,
            "expires_at": now + timedelta(days=7),
        })
        client.close()

    asyncio.get_event_loop().run_until_complete(_run())
    yield

    async def _cleanup():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        await db.users.delete_many({"user_id": TEST_USER_ID})
        await db.user_sessions.delete_many({"user_id": TEST_USER_ID})
        await db.events.delete_many({"user_id": TEST_USER_ID})
        await db.flashcards.delete_many({"user_id": TEST_USER_ID})
        await db.prompt_log.delete_many({"user_id": TEST_USER_ID})
        await db.settings.delete_many({"user_id": TEST_USER_ID})
        client.close()

    asyncio.get_event_loop().run_until_complete(_cleanup())
