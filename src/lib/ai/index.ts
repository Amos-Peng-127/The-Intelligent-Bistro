import { aiRuntimeConfig, getAiRuntimeLabel } from "./config";
import { submitOllamaOrderPrompt } from "./providers/ollama";
import { validateAiResponse } from "./validate-response";
import type { BistroAiRequest } from "./types";

export { getAiRuntimeLabel, aiRuntimeConfig };

export async function submitOrderPrompt(request: BistroAiRequest) {
  switch (aiRuntimeConfig.provider) {
    case "ollama":
    default:
      return validateAiResponse(request, await submitOllamaOrderPrompt(request));
  }
}
