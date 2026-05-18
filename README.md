# The Intelligent Bistro

The Intelligent Bistro is a mobile ordering prototype built with Expo Router, a Node.js API, and a local Ollama model. Diners can browse a curated menu, customize dishes, manage a cart, and use Bistro AI to recommend dishes or stage cart changes before anything is applied.

## What this project demonstrates

- A polished mobile menu flow with search, category filtering, featured dishes, and item detail modals
- Cart management with quantity updates, removals, subtotal calculation, and quick return paths
- A local AI assistant that can recommend dishes, add multiple items, remove items, clear the cart, and ask follow-up questions when the request is ambiguous
- A review-first interaction model where AI-generated cart actions are staged for confirmation before they touch client state
- A lightweight backend bridge that validates requests, calls a local Ollama model, and sanitizes the returned plan

## Reviewer quick links

- [Startup guide](docs/startup-guide.md)
- [Tech stack and selection rationale](docs/tech-stack.md)
- [Loom recording script](docs/loom-script.md)

## Product walkthrough

Reviewers can try the following flows:

1. Browse featured dishes, switch categories, and search by keyword.
2. Open a dish, choose quantity, spice level, and add-ons, then add it to the cart.
3. Open the cart and manually increase, decrease, or remove items.
4. Open Bistro AI and ask for recommendations such as "Recommend something light and fresh."
5. Ask Bistro AI to stage cart changes such as "Add two tonkotsu ramen and one spicy edamame."
6. Confirm the staged actions in the review panel.
7. Try an ambiguous request such as "Remove the salmon roll" and use the clarification options.

## Architecture

```text
Expo app
  -> GET /menu
  -> GET /health
  -> POST /ai/interpret
Node.js + Express API
  -> request validation with Zod
  -> local AI orchestration
  -> AI response sanitization and action normalization
Local Ollama model
  -> qwen2.5:3b by default
```

The frontend can fall back to local menu data for browsing, but the AI flow requires the backend API and Ollama to be running.

## Quick start

### Prerequisites

- Node.js 20+ and npm
- Ollama installed locally
- Expo Go, Android Emulator, iOS Simulator, or Expo web

### 1. Install dependencies

```bash
npm install
```

### 2. Create a local environment file

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

### 3. Pull the default local model

```bash
ollama pull qwen2.5:3b
```

### 4. Start the backend API

```bash
npm run backend
```

### 5. Start the Expo app in a second terminal

```bash
npm run start
```

### 6. Open the app

- `a` for Android emulator
- `w` for web
- Scan the QR code in Expo Go for a physical device

## Environment variables

Default values live in [.env.example](.env.example):

```bash
EXPO_PUBLIC_AI_API_BASE_URL=http://127.0.0.1:3001
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:3b
```

Host recommendations by target:

- Expo web or iOS simulator: `http://127.0.0.1:3001`
- Android emulator: `http://10.0.2.2:3001`
- Physical device: `http://<your-lan-ip>:3001`

## Available scripts

| Command | Purpose |
| --- | --- |
| `npm run start` | Start the Expo development server |
| `npm run android` | Open the Expo app on Android |
| `npm run ios` | Open the Expo app on iOS |
| `npm run web` | Open the Expo app on web |
| `npm run backend` | Start the local Bistro API |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run smoke:ai` | Run AI scenario smoke tests |
| `npm run lint` | Run Expo linting |

## API surface

The local backend exposes three endpoints:

- `GET /health`
- `GET /menu`
- `POST /ai/interpret`

Example health check:

```bash
curl http://127.0.0.1:3001/health
```

## Verification

Basic checks before submission:

```bash
npm run typecheck
npm run smoke:ai
```

Manual checks:

- Load the menu screen and confirm categories and featured dishes render.
- Add an item from the detail modal and confirm the cart summary updates.
- Open Bistro AI and confirm recommendation-only prompts do not mutate the cart.
- Confirm staged AI actions apply only after explicit confirmation.
- Test at least one clarification flow and one remove or quantity-change flow.

## Project structure

```text
src/app/                 Expo Router screens
src/components/          Reusable UI components
src/data/                Menu data and catalog helpers
src/lib/ai/              Frontend AI client, parsing, validation, action application
src/store/               Zustand cart state
server/                  Express API and server-side AI orchestration
scripts/                 Smoke tests and local utilities
docs/                    Submission support materials
```

## Current scope

This prototype is intentionally local-first and demo-oriented:

- No authentication, checkout, payment, or order persistence
- Cart state lives on the client
- AI runs through a local Ollama model rather than a hosted provider
- The backend focuses on menu delivery and AI interpretation, not a full restaurant platform

## Submission note

If you want the shortest path for a reviewer:

1. Start Ollama.
2. Run `npm run backend`.
3. Run `npm run start`.
4. Open the app and test the assistant flow from the home screen.
