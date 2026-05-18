# Startup Guide

This guide is the operational version of the README. Follow it when you want the project running quickly and predictably on a local machine.

## Prerequisites

- Node.js 20 or newer
- npm
- Ollama installed locally
- One of the following for the UI:
  - Expo Go on a phone
  - Android Emulator
  - iOS Simulator
  - A browser for Expo web

## One-time setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create your local environment file

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

### 3. Pull the default Ollama model

```bash
ollama pull qwen2.5:3b
```

## Runtime configuration

Default values:

```bash
EXPO_PUBLIC_AI_API_BASE_URL=http://127.0.0.1:3001
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:3b
```

### Choose the correct API base URL

Use the value below for `EXPO_PUBLIC_AI_API_BASE_URL` depending on where the Expo app is running:

| Target | Recommended value |
| --- | --- |
| Expo web | `http://127.0.0.1:3001` |
| iOS simulator | `http://127.0.0.1:3001` |
| Android emulator | `http://10.0.2.2:3001` |
| Physical device on same Wi-Fi | `http://<your-lan-ip>:3001` |

If the frontend cannot reach the backend, this value is the first thing to check.

## Start the application

Open two terminals from the repository root.

### Terminal A: backend API

```bash
npm run backend
```

Expected log:

```text
[bistro-api] listening on http://0.0.0.0:3001
```

### Terminal B: Expo app

```bash
npm run start
```

Then choose a target:

- Press `a` for Android
- Press `w` for web
- Scan the QR code with Expo Go for a physical device

## Verify each layer

### Backend health

Open this URL in a browser:

```text
http://127.0.0.1:3001/health
```

Expected response shape:

```json
{
  "status": "ok",
  "runtime": "...",
  "provider": "ollama",
  "model": "qwen2.5:3b"
}
```

### Menu API

Open:

```text
http://127.0.0.1:3001/menu
```

You should see categories and menu items.

### App behavior

1. Open the home screen.
2. Confirm featured dishes and category filters render.
3. Add one item from the detail modal.
4. Open Bistro AI and ask for a recommendation.
5. Confirm the AI preview appears before a cart mutation is applied.

## Useful commands

```bash
npm run typecheck
npm run smoke:ai
npm run lint
```

## Common issues

### 1. The app loads, but AI requests fail

Check:

- `npm run backend` is still running
- Ollama is running locally
- The selected model was pulled with `ollama pull qwen2.5:3b`
- `EXPO_PUBLIC_AI_API_BASE_URL` points to the correct host for your device

### 2. The menu loads, but AI still fails

That usually means the frontend fallback menu is working, but the AI path is not. The AI flow depends on:

- `POST /ai/interpret`
- a reachable backend
- a reachable Ollama instance

### 3. The physical device cannot reach the backend

Use your machine's LAN IP instead of `127.0.0.1`, for example:

```bash
EXPO_PUBLIC_AI_API_BASE_URL=http://192.168.1.20:3001
```

Make sure the phone and development machine are on the same network.

### 4. Android emulator cannot reach localhost

Use:

```bash
EXPO_PUBLIC_AI_API_BASE_URL=http://10.0.2.2:3001
```

### 5. AI replies are slow or timing out

Try:

- checking that Ollama is already warm
- using the default `qwen2.5:3b` model
- reducing other heavy local processes

## Submission-ready path

For a clean demo run:

1. Start Ollama first.
2. Start the backend.
3. Confirm `/health` responds.
4. Start Expo.
5. Empty the cart before recording or presenting.
