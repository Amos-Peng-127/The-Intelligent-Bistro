import { aiRuntimeConfig, getAiRuntimeLabel } from "./config";
import { validateAiResponse } from "./validate-response";
import type { BistroAiRequest, BistroAiResponse } from "./types";

export { getAiRuntimeLabel, aiRuntimeConfig };

const aiInterpretTimeoutMs = 35000;
const aiWarmTimeoutMs = 30000;

export async function warmBistroAi() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), aiWarmTimeoutMs);

  const response = await fetch(`${aiRuntimeConfig.apiBaseUrl}/ai/warm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: controller.signal,
  })
    .catch((error) => {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Bistro AI warm-up took too long.");
      }

      throw new Error(`Could not reach Bistro AI at ${aiRuntimeConfig.apiBaseUrl}. Start the Node server and try again.`);
    })
    .finally(() => clearTimeout(timeoutId));

  const payload = (await response.json().catch(() => null)) as
    | {
        error?: string;
      }
    | null;

  if (!response.ok) {
    throw new Error(
      payload && typeof payload.error === "string" ? payload.error : "The Bistro AI warm-up request failed.",
    );
  }
}

export async function submitOrderPrompt(request: BistroAiRequest) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), aiInterpretTimeoutMs);

  const response = await fetch(`${aiRuntimeConfig.apiBaseUrl}/ai/interpret`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: controller.signal,
    body: JSON.stringify(request),
  })
    .catch((error) => {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Bistro AI took too long to answer. Try again in a moment.");
      }

      throw new Error(`Could not reach Bistro AI at ${aiRuntimeConfig.apiBaseUrl}. Start the Node server and try again.`);
    })
    .finally(() => clearTimeout(timeoutId));

  const payload = (await response.json().catch(() => null)) as
    | {
        error?: string;
      }
    | BistroAiResponse
    | null;

  if (!response.ok) {
    throw new Error(
      payload && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "The Bistro AI request failed.",
    );
  }

  return validateAiResponse(request, payload as BistroAiResponse);
}
