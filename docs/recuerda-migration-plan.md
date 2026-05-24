# Recuerda — Self-Deployment Migration Plan

## Context for Claude Code

This document describes the current state of the **Recuerda** project, the target state, and a step-by-step migration plan. The goal is to remove all dependencies on Emergent's hosted infrastructure and deploy the app independently: backend on Render, database on MongoDB Atlas, authentication via self-owned Google OAuth.

---

## Current State

### Stack
- **Frontend:** React Native + Expo SDK 54 + Expo Router, TypeScript
- **Backend:** FastAPI + Motor (async MongoDB driver), Python
- **Database:** MongoDB (currently managed by Emergent)
- **Auth:** Google OAuth — but fully delegated to Emergent's infrastructure

### Directory structure
```
recuerda/
├── backend/
│   ├── server.py          # FastAPI app — single file
│   └── requirements.txt   # Emergent's full environment (bloated)
└── frontend/
    ├── app/
    │   ├── login.tsx       # Auth UI — calls Emergent's auth URL
    │   └── ...
    └── src/
        ├── auth/
        │   └── AuthContext.tsx   # Token management — calls backend /api/auth/session
        └── api/
            └── client.ts         # API client — reads EXPO_PUBLIC_BACKEND_URL
```

### The Emergent dependency — exactly what needs to change

There are **two hardcoded calls to Emergent's servers** that must be replaced:

**1. `frontend/app/login.tsx` — OAuth entry point**
```typescript
// CURRENT: sends user to Emergent's auth server
const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
```
This must be replaced with a direct Google OAuth flow using `expo-auth-session`.

**2. `backend/server.py` — session validation (inside `POST /api/auth/session`)**
```python
# CURRENT: calls Emergent's backend to validate the session_id and get user data
resp = await cli.get(
    "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
    headers={"X-Session-ID": payload.session_id},
)
```
This must be replaced with direct verification of a Google ID token using the `google-auth` library.

### Auth flow — current vs. target

**Current flow:**
1. User taps "Continuar con Google"
2. App opens `auth.emergentagent.com` → user logs in with Google
3. Emergent redirects back with a `session_id`
4. Frontend calls `POST /api/auth/session` with `{ session_id }`
5. Backend calls Emergent's server to exchange `session_id` → user data + `session_token`
6. Backend stores session in MongoDB, returns `session_token` to frontend
7. All subsequent requests use `Authorization: Bearer <session_token>`

**Target flow:**
1. User taps "Continuar con Google"
2. App opens Google's own OAuth consent screen via `expo-auth-session`
3. Google redirects back with an `id_token` (a signed JWT)
4. Frontend calls `POST /api/auth/session` with `{ id_token }`
5. Backend verifies the `id_token` directly with Google's public keys using `google-auth`
6. Backend extracts email, name, picture — stores/updates user in MongoDB, returns `session_token`
7. All subsequent requests unchanged — `Authorization: Bearer <session_token>`

The session management inside MongoDB (`user_sessions` collection) is **unchanged**. Only the auth handshake at step 2–5 changes.

---

## Target State

- **Backend** hosted on Render (free tier or Starter ~$7/month)
- **Database** on MongoDB Atlas free tier (M0, 512MB — more than enough)
- **Auth** via self-owned Google OAuth 2.0 app (free, registered in Google Cloud Console)
- **Frontend** built as a standalone APK via EAS Build and sideloaded on Android
- **No ongoing dependency** on Emergent or any third-party auth proxy

### New environment variables

**Backend (set in Render dashboard):**
```
MONGO_URL=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/
DB_NAME=recuerda
GOOGLE_CLIENT_ID=<your-web-client-id>.apps.googleusercontent.com
```

**Frontend (set in `.env` or EAS build config):**
```
EXPO_PUBLIC_BACKEND_URL=https://<your-render-service>.onrender.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID=<your-expo-client-id>.apps.googleusercontent.com
```

> Note: Google OAuth requires **two separate Client IDs** — one for the backend (Web application type) and one for the frontend (Android type, or use Expo's proxy client). See Step 1 below.

---

## Migration Plan

### Step 0 — Prerequisites (manual, outside the codebase)

These must be done by hand before any code changes:

**0a. MongoDB Atlas**
1. Create a free account at mongodb.com/atlas
2. Create a free M0 cluster (any region)
3. Create a database user with read/write access
4. Whitelist `0.0.0.0/0` in Network Access (Render IPs are dynamic)
5. Get the connection string: `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/`
6. Keep `DB_NAME=recuerda`

**0b. Google Cloud Console**
1. Go to console.cloud.google.com → create a new project (e.g. "Recuerda")
2. Enable the **Google Identity** API (also called "Google Sign-In" or OAuth)
3. Go to APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
4. Create **two** client IDs:
   - Type **Web application** → used by the backend to verify tokens. Add `https://<your-render-url>.onrender.com` to Authorized origins. Note the Client ID.
   - Type **Android** → used by the frontend. Package name must match `app.json` (currently `com.anonymous` — change this first, see Step 2). Note the Client ID.
5. Configure the OAuth consent screen (External, add your own Gmail as test user during development)

**0c. Render account**
1. Sign up at render.com
2. Connect your GitHub account (so Render can deploy from the repo)

---

### Step 1 — Update `backend/requirements.txt`

Replace the entire file with a minimal, clean set of dependencies. Remove all Emergent platform bloat.

New `backend/requirements.txt`:
```
fastapi==0.110.1
uvicorn==0.25.0
motor==3.3.1
pymongo==4.5.0
pydantic==2.13.4
python-dotenv==1.2.2
httpx==0.28.1
google-auth==2.52.0
python-jose[cryptography]==3.5.0
passlib==1.7.4
```

---

### Step 2 — Update `frontend/app.json`

Change the bundle identifier from the default `com.anonymous` to something real. This is required for the Android OAuth client ID in Google Cloud Console.

In `frontend/app.json`, find the `android` section and set:
```json
{
  "expo": {
    "android": {
      "package": "com.frjurado.recuerda"
    }
  }
}
```

Also verify `name` and `slug` at the top level are set to `"recuerda"`.

---

### Step 3 — Rewrite `backend/server.py` auth endpoint

The only thing that changes in `server.py` is the `POST /api/auth/session` endpoint and its imports. Everything else (events, reviews, settings, flashcards, SM-2 logic) is **untouched**.

**3a. Change the request model** — accept `id_token` instead of `session_id`:

```python
# REMOVE this model:
class SessionRequest(BaseModel):
    session_id: str

# ADD this model:
class SessionRequest(BaseModel):
    id_token: str
```

**3b. Add the Google verification import** at the top of `server.py`:

```python
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
```

**3c. Rewrite the `auth_session` endpoint**:

```python
@api_router.post("/auth/session")
async def auth_session(payload: SessionRequest):
    """Verify Google ID token and create/update local session."""
    GOOGLE_CLIENT_ID = os.environ["GOOGLE_CLIENT_ID"]
    try:
        idinfo = google_id_token.verify_oauth2_token(
            payload.id_token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Token de Google inválido: {e}")

    email = idinfo.get("email")
    name = idinfo.get("name", "")
    picture = idinfo.get("picture")

    if not email:
        raise HTTPException(status_code=400, detail="No se pudo obtener el email de Google")

    # Generate our own session token
    session_token = str(uuid.uuid4())

    # Upsert user by email (same logic as before)
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "created_at": datetime.now(timezone.utc),
        })

    # Store session (same as before)
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
    })

    # Ensure default settings exist (same as before)
    settings = await db.settings.find_one({"user_id": user_id}, {"_id": 0})
    if not settings:
        await db.settings.insert_one({
            "user_id": user_id,
            "notifications_enabled": True,
            "notification_hour": 9,
            "notification_minute": 0,
        })

    return {
        "session_token": session_token,
        "user": UserOut(user_id=user_id, email=email, name=name, picture=picture).model_dump(),
    }
```

**3d. Remove the `httpx` import** — it is no longer used after this change (the Emergent HTTP call is gone). Verify no other endpoint uses it before removing.

---

### Step 4 — Rewrite `frontend/app/login.tsx`

Replace the Emergent auth URL with a proper `expo-auth-session` Google OAuth flow.

**4a. Install the required package** (if not already present):
```bash
cd frontend
npx expo install expo-auth-session expo-crypto
```

Check `frontend/package.json` — `expo-auth-session` may already be listed as a dependency. If so, skip the install.

**4b. Rewrite `login.tsx`**:

```typescript
import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { useAuthRequest, ResponseType } from "expo-auth-session/providers/google";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth/AuthContext";
import { colors, hardShadow } from "@/src/theme";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID!;

export default function LoginScreen() {
  const { signInWithToken } = useAuth();
  const [loading, setLoading] = useState(false);

  const [request, response, promptAsync] = useAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    responseType: ResponseType.IdToken,
    scopes: ["openid", "profile", "email"],
  });

  React.useEffect(() => {
    if (response?.type === "success") {
      const { id_token } = response.params;
      setLoading(true);
      signInWithToken(id_token)
        .catch((e: any) => Alert.alert("Error", e?.message || "Fallo al iniciar sesión"))
        .finally(() => setLoading(false));
    }
  }, [response]);

  const handleGoogle = async () => {
    setLoading(true);
    try {
      await promptAsync();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Fallo al iniciar sesión");
      setLoading(false);
    }
  };

  // JSX is identical to the original — no visual changes needed
  return (
    <SafeAreaView style={styles.container} testID="login-screen">
      <View style={styles.brand}>
        <Text style={styles.brandTitle}>Recuerda</Text>
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
        disabled={loading || !request}
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

// Styles unchanged from original
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: "center" },
  brand: { marginBottom: 40, alignItems: "flex-start" },
  brandTitle: { fontSize: 56, fontWeight: "900", color: colors.textPrimary, letterSpacing: -2 },
  brandSubtitle: { fontSize: 16, color: colors.textSecondary, marginTop: 4 },
  card: {
    backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border,
    borderRadius: 0, padding: 20, marginBottom: 32, ...hardShadow,
  },
  cardText: { color: colors.textPrimary, fontSize: 15, lineHeight: 22 },
  googleBtn: {
    backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border,
    borderRadius: 0, paddingVertical: 16, paddingHorizontal: 20,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12,
  },
  googleText: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  footer: { textAlign: "center", marginTop: 24, color: colors.textSecondary, fontSize: 13 },
});
```

**4c. Update `src/auth/AuthContext.tsx`** — the `signInWithToken` function currently expects a `session_id` string. The name stays the same but the semantics change: it now receives a Google `id_token`. No other change needed — the function body already POSTs to `/api/auth/session` with the argument as the payload body. Just verify the POST body matches:

```typescript
// In signInWithToken — change the body key from session_id to id_token:
body: JSON.stringify({ id_token: sessionId }),  // was: { session_id: sessionId }
```

Consider renaming the parameter from `sessionId` to `idToken` for clarity, but this is optional.

---

### Step 5 — Add Render deployment config

Create `backend/render.yaml` (or just use the Render dashboard — this file is optional but useful):

```yaml
services:
  - type: web
    name: recuerda-api
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn server:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: MONGO_URL
        sync: false   # set manually in Render dashboard
      - key: DB_NAME
        value: recuerda
      - key: GOOGLE_CLIENT_ID
        sync: false   # set manually in Render dashboard
```

Also create `backend/.env.example` for documentation:
```
MONGO_URL=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/
DB_NAME=recuerda
GOOGLE_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
```

---

### Step 6 — Add frontend environment config

Create `frontend/.env.example`:
```
EXPO_PUBLIC_BACKEND_URL=https://<your-service>.onrender.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID=<android-client-id>.apps.googleusercontent.com
```

Create `frontend/.env` (gitignored — already in `.gitignore`) with real values for local development.

---

### Step 7 — Deploy backend to Render

1. Push all backend changes to GitHub
2. In Render dashboard: New → Web Service → connect repo → select `backend/` as root directory
3. Set environment variables: `MONGO_URL`, `DB_NAME`, `GOOGLE_CLIENT_ID`
4. Deploy and verify the health endpoint: `GET https://<service>.onrender.com/api/` should return `{"message": "Recuerda API ready"}`

---

### Step 8 — Build and sideload the APK

Once the backend is live and `EXPO_PUBLIC_BACKEND_URL` points to it:

```bash
cd frontend
# Log in to Expo (free account required)
npx eas login

# Configure EAS (creates eas.json if not present)
npx eas build:configure

# Build a preview APK (free tier, ~10–15 min in EAS cloud)
npx eas build --profile preview --platform android
```

In `eas.json`, ensure the preview profile uses `apk` format (not `aab`, which requires Play Store):
```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

After the build completes:
1. Download the `.apk` from the EAS dashboard (or the link in the terminal)
2. On your Android phone: Settings → Security → enable "Install from unknown sources" (or "Install unknown apps" for the browser/files app)
3. Transfer the APK (AirDrop equivalent, USB, Google Drive, etc.) and install

---

## Summary of files changed

| File | Change |
|---|---|
| `backend/requirements.txt` | Replaced with minimal dependencies |
| `backend/server.py` | Auth endpoint only: swap Emergent call → Google token verification |
| `backend/render.yaml` | New file — Render deployment config |
| `backend/.env.example` | New file — environment variable documentation |
| `frontend/app.json` | Set Android package name |
| `frontend/app/login.tsx` | Replace Emergent auth URL with `expo-auth-session` Google flow |
| `frontend/src/auth/AuthContext.tsx` | Change POST body key from `session_id` to `id_token` |
| `frontend/.env.example` | New file — environment variable documentation |
| `frontend/eas.json` | New or updated — set preview profile to APK build type |

## Files NOT changed

Everything else in `server.py` (events, reviews, flashcards, SM-2 algorithm, settings, all other routes), `client.ts`, all tab screens, all other frontend files.
