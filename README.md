# Intelligent Bistro App

Expo Router mobile ordering prototype with menu browsing, cart flow, and a Node.js Bistro AI backend that wraps a local Ollama model.

## Run the app

1. Install dependencies

   ```bash
   npm install
   ```

2. Copy the example environment file if you want to override the default local API and model settings

   ```bash
   Copy-Item .env.example .env
   ```

3. Start the backend API

   ```bash
   npm run backend
   ```

4. In a second terminal, start the Expo app

   ```bash
   npx expo start
   ```

## Backend API

The app now talks to a Node.js API first:

`Expo app -> Node API -> Ollama`

Available endpoints:

- `GET /health`
- `GET /menu`
- `POST /ai/interpret`

## Local AI setup

The backend is wired for a local Ollama model by default.

1. Install Ollama for Windows from the official download page:
   [https://ollama.com/download/windows](https://ollama.com/download/windows)

2. Pull the default local model

   ```bash
   ollama pull qwen2.5:3b
   ```

3. Keep Ollama running, then start the backend and open `Ask Bistro AI` inside the app.

Default environment values:

```bash
EXPO_PUBLIC_AI_API_BASE_URL=http://127.0.0.1:3001
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:3b
```

Notes:

- On Android emulator, `EXPO_PUBLIC_AI_API_BASE_URL=http://10.0.2.2:3001` is usually the right host.
- On a physical device, set `EXPO_PUBLIC_AI_API_BASE_URL` to your machine's LAN IP, for example `http://192.168.1.20:3001`.
- If the backend and Ollama run on different machines, set `OLLAMA_BASE_URL` on the backend to match the Ollama host.
- The AI flow currently supports `add_item`, `remove_item`, `clear_cart`, and dish recommendations.
- Order changes are always shown for confirmation before they touch the cart.

## Verification

Run the shared AI smoke scenarios:

```bash
npm run smoke:ai
```
