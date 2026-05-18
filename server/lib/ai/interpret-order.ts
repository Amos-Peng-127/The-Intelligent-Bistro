import { submitOllamaOrderPrompt } from "../../../src/lib/ai/providers/ollama";
import type { BistroAiRequest } from "../../../src/lib/ai/types";
import { validateAiResponse } from "../../../src/lib/ai/validate-response";

import { serverAiConfig } from "../config";

export async function interpretOrderPrompt(request: BistroAiRequest) {
  switch (serverAiConfig.provider) {
    case "ollama":
      return validateAiResponse(request, await submitOllamaOrderPrompt(request, serverAiConfig));
    default:
      throw new Error(`Unsupported AI provider: ${serverAiConfig.provider}`);
  }
}
