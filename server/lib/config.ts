export type SupportedAiProvider = "ollama";

const resolveProvider = (): SupportedAiProvider => {
  if (process.env.AI_PROVIDER === "ollama" || !process.env.AI_PROVIDER) {
    return "ollama";
  }

  throw new Error(`Unsupported AI_PROVIDER "${process.env.AI_PROVIDER}".`);
};

export const serverAiConfig = {
  provider: resolveProvider(),
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
  ollamaModel: process.env.OLLAMA_MODEL ?? "qwen2.5:3b",
};

export const getServerRuntimeLabel = () =>
  `Node API -> ${serverAiConfig.provider} (${serverAiConfig.ollamaModel})`;
