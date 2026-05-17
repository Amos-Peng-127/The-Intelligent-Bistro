# Intelligent Bistro App

Expo Router mobile ordering prototype with menu browsing, cart flow, and a local Ollama-powered Bistro AI assistant.

## Run the app

1. Install dependencies

   ```bash
   npm install
   ```

2. Copy the example environment file if you want to override the default local AI settings

   ```bash
   Copy-Item .env.example .env
   ```

3. Start the app

   ```bash
   npx expo start
   ```

## Local AI setup

The assistant page is wired for a local Ollama model by default.

1. Install Ollama for Windows from the official download page:
   [https://ollama.com/download/windows](https://ollama.com/download/windows)

2. Pull the default local model

   ```bash
   ollama pull qwen2.5:3b
   ```

3. Keep Ollama running, then open `Ask Bistro AI` inside the app.

Default environment values:

```bash
EXPO_PUBLIC_AI_PROVIDER=ollama
EXPO_PUBLIC_OLLAMA_BASE_URL=http://127.0.0.1:11434
EXPO_PUBLIC_OLLAMA_MODEL=qwen2.5:3b
```

Notes:

- On Android emulator, `EXPO_PUBLIC_OLLAMA_BASE_URL=http://10.0.2.2:11434` is usually the right host.
- The AI flow currently supports `add_item`, `remove_item`, `clear_cart`, and dish recommendations.
- Order changes are always shown for confirmation before they touch the cart.
