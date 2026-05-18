# Tech Stack And Selection Rationale

This document explains the implementation choices behind The Intelligent Bistro and why they fit the current scope.

## Product goals

The project is optimized for four goals:

1. Ship a polished mobile ordering prototype quickly.
2. Keep the AI loop local and demo-friendly.
3. Make cart changes safe and reviewable.
4. Keep the codebase simple enough to iterate during a short build window.

## Stack overview

| Layer | Choice | Why it fits this project |
| --- | --- | --- |
| Mobile app | Expo 54 + React Native 0.81 | Fast iteration, cross-platform runtime, and strong local developer tooling |
| Navigation | Expo Router | File-based routing keeps screen structure easy to follow for a small app |
| Language | TypeScript | Shared types across UI, AI request payloads, and backend contracts |
| UI styling | React Native `StyleSheet` and Expo primitives | Precise control over mobile layout without bringing in a heavy design abstraction |
| Client state | Zustand | Minimal boilerplate for cart state and direct synchronous mutations |
| Server state | TanStack React Query | Good fit for menu and health fetching, retry behavior, and cache lifetimes |
| Backend API | Node.js + Express | Simple bridge between the mobile client and a local LLM runtime |
| Schema validation | Zod | Runtime safety for API payloads and AI response structures |
| Local AI runtime | Ollama | Easy to run locally, easy to swap models, low infrastructure overhead |
| Testing | Node-based smoke scenarios + TypeScript typecheck | Fast regression coverage around the most fragile part: AI interpretation logic |

## Why these choices make sense

### Expo Router over a custom React Navigation setup

This app has a small, screen-oriented structure: menu, assistant, and cart. Expo Router keeps navigation conventions lightweight and predictable, which is useful in a prototype where product iteration matters more than custom routing infrastructure.

### Zustand for cart state

The cart is local, UI-driven state with immediate updates and simple mutation patterns. Zustand handles this well without reducers, action boilerplate, or a heavier global-state framework. It also keeps cart logic close to the features that use it.

### React Query for API-backed menu and health checks

The menu and backend health are read-heavy, cacheable resources. React Query provides retry behavior, stale-time control, and a clean separation between local cart state and remote API state. That is a better fit than manually wiring fetch lifecycles in components.

### Express as the AI boundary

The backend serves three jobs:

1. Expose a stable API to the Expo app.
2. Centralize environment-based AI configuration.
3. Validate and sanitize AI responses before the frontend can act on them.

Keeping that boundary on the server side is important because it reduces the trust placed directly in model output.

### Ollama for local AI

Using Ollama keeps the demo self-contained. It avoids hosted API keys, works offline once installed, and makes it easy to point the project at a smaller local model such as `qwen2.5:3b`. That fits a submission where reviewers may value reproducibility and local control.

### Zod for runtime guarantees

AI-generated data is not trustworthy by default. Zod gives the backend a strict gate around request payloads and response shape, which is especially important when the UI is allowed to stage cart mutations from model output.

## Core architectural decisions

### 1. Review-first AI actions

AI-generated cart changes are staged before being applied. This keeps recommendations and cart mutations separate, reduces accidental changes, and makes the demo easier to reason about.

### 2. Validation and normalization after model output

The backend does not blindly trust the model. It validates the returned plan, fills in missing context when possible, normalizes malformed or weak responses, and can turn uncertain cases into clarification flows instead of unsafe cart mutations.

### 3. Keep menu knowledge inside the repo

The menu catalog lives with the app, and the backend exposes it through `/menu`. That keeps the product deterministic for demos and smoke tests without requiring a database.

### 4. Split local state from remote state

Cart state is managed with Zustand because it is interactive, local, and mutation-heavy. API-backed menu and health requests use React Query because they are fetch-driven and cache-friendly. That split keeps each tool doing the job it is best at.

### 5. Smoke-test the AI contract directly

The highest-risk behavior in this project is not screen rendering. It is the interpretation layer that turns natural language into staged actions, clarifications, or recommendations. The smoke tests exercise that logic directly and cheaply.

## Tradeoffs and known limits

- No persistence layer or database
- No authentication or checkout flow
- No automated end-to-end mobile UI tests yet
- Local model quality depends on the selected Ollama model
- The current scope is optimized for a demoable prototype, not production scale

## What I would do next with more time

1. Add persistent cart and session history.
2. Add end-to-end mobile tests for menu, cart, and assistant flows.
3. Add richer observability around AI failures and fallback behavior.
4. Support hosted model providers behind the same backend interface.
