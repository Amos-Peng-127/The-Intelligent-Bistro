import { Platform } from "react-native";

const defaultBaseUrl =
  Platform.OS === "android" ? "http://10.0.2.2:11434" : "http://127.0.0.1:11434";

export const aiRuntimeConfig = {
  provider: process.env.EXPO_PUBLIC_AI_PROVIDER ?? "ollama",
  ollamaBaseUrl: process.env.EXPO_PUBLIC_OLLAMA_BASE_URL ?? defaultBaseUrl,
  ollamaModel: process.env.EXPO_PUBLIC_OLLAMA_MODEL ?? "qwen2.5:3b",
};

export const getAiRuntimeLabel = () =>
  `Local ${aiRuntimeConfig.provider} - ${aiRuntimeConfig.ollamaModel}`;
