import Constants from "expo-constants";
import { Platform } from "react-native";

const resolveHostFromCandidate = (candidate?: string | null) => {
  if (!candidate) {
    return null;
  }

  const normalized = candidate.trim().replace(/^[a-z]+:\/\//i, "").split("/")[0] ?? "";
  const host = normalized.split(":")[0]?.trim();

  return host ? host : null;
};

const getDetectedDevHost = () => {
  const manifestHost =
    resolveHostFromCandidate(Constants.expoConfig?.hostUri) ??
    resolveHostFromCandidate(
      (
        Constants.manifest2 as
          | {
              extra?: {
                expoClient?: {
                  hostUri?: string;
                };
              };
            }
          | null
      )?.extra?.expoClient?.hostUri,
    ) ??
    resolveHostFromCandidate(
      (Constants as { platform?: { hostUri?: string } }).platform?.hostUri,
    ) ??
    resolveHostFromCandidate(Constants.linkingUri);

  if (manifestHost) {
    return manifestHost;
  }

  if (Platform.OS === "web") {
    return globalThis.location?.hostname ?? null;
  }

  return null;
};

const rewriteLoopbackBaseUrl = (baseUrl: string, detectedHost: string | null) => {
  if (!detectedHost || detectedHost === "127.0.0.1" || detectedHost === "localhost") {
    return baseUrl;
  }

  return baseUrl.replace(
    /(https?:\/\/)(127\.0\.0\.1|localhost)(?=[:/]|$)/i,
    `$1${detectedHost}`,
  );
};

const detectedDevHost = getDetectedDevHost();
const defaultApiHost =
  detectedDevHost ?? (Platform.OS === "android" ? "10.0.2.2" : "127.0.0.1");
const configuredApiBaseUrl = process.env.EXPO_PUBLIC_AI_API_BASE_URL;
const apiBaseUrl = (
  configuredApiBaseUrl
    ? rewriteLoopbackBaseUrl(configuredApiBaseUrl, detectedDevHost)
    : `http://${defaultApiHost}:3001`
).replace(/\/$/, "");

export const aiRuntimeConfig = {
  apiBaseUrl,
};

export const getAiRuntimeLabel = () => "Bistro AI";
