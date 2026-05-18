# Loom Script

This script is written for a concise 4 to 5 minute demo. It assumes the app, backend, and Ollama are already running.

## Before you record

- Empty the cart
- Keep the home screen open
- Make sure `npm run backend` is running
- Make sure Ollama is running and the model is available
- Optionally keep `http://127.0.0.1:3001/health` ready in a browser tab

## Suggested demo prompts

Use these exact prompts if you want a stable flow:

1. `Recommend something light and fresh.`
2. `Add the cheapest one to my cart.`
3. `Remove the salmon roll.`
4. `Confirm`

If you want a multi-item add instead:

`Add two tonkotsu ramen and one spicy edamame.`

## Script

### 0:00 - 0:25 | Intro

Say:

"Hi, this is The Intelligent Bistro, a mobile ordering prototype built with Expo, a Node API, and a local Ollama model. The idea is to make menu browsing feel familiar, while using AI to help with recommendations and cart edits in a controlled way."

Show:

- Home screen
- A quick scroll through featured dishes and categories

### 0:25 - 1:05 | Manual ordering flow

Say:

"The manual path starts with a standard restaurant browsing flow. Users can search, filter by category, open a dish, choose options like quantity, spice level, and add-ons, and then add the item to the cart."

Show:

- Search or switch categories
- Open one item detail modal
- Adjust quantity or options
- Add to cart
- Open the cart briefly to show subtotal and editing controls

### 1:05 - 1:50 | AI recommendations

Say:

"The assistant is where the project becomes more interesting. It can answer recommendation-style prompts without mutating the cart, so advice and actions stay separate."

Show:

- Open the assistant
- Enter `Recommend something light and fresh.`
- Point out that the response suggests dishes and opens a review surface, but does not change the cart yet

### 1:50 - 2:45 | AI-staged cart changes

Say:

"When the user clearly asks for a cart change, the system converts that request into staged actions. The important detail is that the assistant does not silently mutate state. It prepares the change, shows the review panel, and waits for confirmation."

Show:

- Enter `Add the cheapest one to my cart.`
- Open the review panel if needed
- Highlight the pending action
- Confirm the action
- Jump to the cart to show the item was applied

### 2:45 - 3:35 | Clarification flow

Say:

"The backend also handles ambiguity. If the user request is underspecified, the assistant asks for the missing detail instead of guessing. That makes the cart behavior safer and easier to trust."

Show:

- Return to the assistant
- Enter `Remove the salmon roll.`
- Point out the clarification options if more than one salmon roll is possible
- Choose one option or confirm the prepared action

### 3:35 - 4:20 | Technical architecture

Say:

"Under the hood, the Expo app talks to a small Express API. That API validates payloads, calls a local Ollama model, and sanitizes the returned plan before the frontend can apply anything. Cart state is managed with Zustand, API-backed resources use React Query, and the AI contract is covered with smoke tests."

Show:

- Briefly show the repository
- Point at `src/app`, `src/store`, `src/lib/ai`, and `server/`
- Optionally show the `/health` endpoint

### 4:20 - 4:45 | Close

Say:

"So the core value here is a local-first restaurant assistant that can recommend, clarify, and stage order changes without taking unsafe shortcuts. Thanks for watching."

## Shorter 90-second fallback version

If you need a compressed version:

1. Show the home screen and cart flow.
2. Show one recommendation prompt.
3. Show one staged add-to-cart prompt.
4. Say the backend validates and sanitizes Ollama output before applying changes.
