# InspectPro Mobile Manager (Expo)

Offline-first manager inspection app for phone use with auto-sync when back online.

## 1) IRONLOG / production API (live, anywhere)

The app reads a **default API base** in this order:

1. **`extra.ironlogApiBase`** in `app.json` (currently **`https://ironlog.ironlogafrica.com/api`**).
2. **`IRONLOG_API_BASE`** from EAS / `app.config.js` at build time (overrides `extra` when set).
3. **`EXPO_PUBLIC_IRONLOG_API_BASE`** when you run `expo start` (e.g. from `mobile-manager/.env` for LAN).
4. Fallback: **`IRONLOG_AFRICA_API_BASE`** in `src/config.js` (`https://ironlog.ironlogafrica.com/api`).

**EAS build (APK / AAB):** set your public IRONLOG URL (must include `/api`, use **https**):

- **Option A — `eas.json`:** under `build.preview` or `build.production`, add:

```json
"env": {
  "IRONLOG_API_BASE": "https://ironlog.ironlogafrica.com/api"
}
```

- **Option B — EAS environment variables:** in [expo.dev](https://expo.dev) project → Environment variables, create `IRONLOG_API_BASE` for the build profile, then reference it in `eas.json` if needed.

Rebuild after changing this value (`eas build ...`).

**Local `expo start` against IRONLOG:** create `mobile-manager/.env`:

```env
EXPO_PUBLIC_IRONLOG_API_BASE=https://ironlog.ironlogafrica.com/api
```

Restart Metro. `app.config.js` also reads `IRONLOG_API_BASE` / `EXPO_PUBLIC_IRONLOG_API_BASE` when present.

**IRONLOG server (Node API):**

- Deploy the same `api` app with HTTPS (e.g. Azure App Service).
- Set **`ALLOWED_ORIGINS`** on the server to comma-separated web origins that use the API in a **browser** (e.g. your dashboard). Native apps usually send **no `Origin` header**; the API is updated to allow those requests. Example:

```env
ALLOWED_ORIGINS=https://ironlog.ironlogafrica.com,https://your-dashboard-host,http://localhost:3002
```

The API also defaults to allowing `https://ironlog.ironlogafrica.com` when `ALLOWED_ORIGINS` is unset.

## 2) Configure API URL in the app (override)

You can still change the server URL on the device:

- In the app header, edit **Server URL** (e.g. `https://your-host/api` or `192.168.x.x:3002`)
- Tap **Save Server URL** (stored in AsyncStorage; overrides the built-in default until you reset).

The app normalizes input to `http(s)://.../api` when `/api` is missing.

## 3) Install and run

From `C:\INSPECTPRO\mobile-manager`:

```powershell
npm install
npx expo start
```

Scan the QR code with Expo Go.

## 4) Android build readiness

This project now includes `eas.json` and Android config in `app.json`.

Install EAS CLI (once):

```powershell
npm install -g eas-cli
```

Login:

```powershell
eas login
```

Build test APK (easy install on phone):

```powershell
cd C:\INSPECTPRO\mobile-manager
eas build -p android --profile preview
```

Build production AAB (Play Store):

```powershell
eas build -p android --profile production
```

## 5) Usage

- Fill manager name/signature.
- Select machine.
- Capture checklist, notes, and photos.
- Tap **Save Inspection**.
  - Offline: item is queued.
  - Online: queue sync is attempted immediately.
- Tap **Sync Now** to force upload.

## 6) API requirements

This app posts to:

- `POST /api/manager/inspections`
- `GET /api/assets`
- `GET /api/assets/:id/hours`

Your backend already includes these endpoints in this repo.

