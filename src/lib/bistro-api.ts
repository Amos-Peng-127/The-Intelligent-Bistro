import { useQuery } from "@tanstack/react-query";

import {
  attachMenuImages,
  categories as fallbackCategories,
  menuItems as fallbackMenuItems,
  type MenuCategoryId,
  type MenuCatalogItem,
} from "@/data/menu";
import { aiRuntimeConfig } from "@/lib/ai/config";

export type BistroApiHealth = {
  status: string;
  runtime: string;
  provider: string;
  model: string;
};

export type BistroMenuPayload = {
  categories: Array<{ id: MenuCategoryId; label: string }>;
  items: MenuCatalogItem[];
};

export type BistroMenuData = {
  categories: Array<{ id: MenuCategoryId; label: string }>;
  items: ReturnType<typeof attachMenuImages>;
};

export const fallbackMenuData: BistroMenuData = {
  categories: fallbackCategories,
  items: fallbackMenuItems,
};

const fetchBistroApi = async <T>(path: string): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  const response = await fetch(`${aiRuntimeConfig.apiBaseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    signal: controller.signal,
  })
    .catch((error) => {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`The Bistro API timed out while loading ${path}.`);
      }

      throw new Error(`Could not reach the Bistro API at ${aiRuntimeConfig.apiBaseUrl}.`);
    })
    .finally(() => clearTimeout(timeoutId));

  const payload = (await response.json().catch(() => null)) as
    | {
        error?: string;
      }
    | T
    | null;

  if (!response.ok) {
    throw new Error(
      payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
        ? payload.error
        : `The Bistro API request for ${path} failed.`,
    );
  }

  return payload as T;
};

export const useBistroMenu = () =>
  useQuery({
    queryKey: ["bistro-menu", aiRuntimeConfig.apiBaseUrl],
    queryFn: () => fetchBistroApi<BistroMenuPayload>("/menu"),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    select: (payload): BistroMenuData => ({
      categories: payload.categories,
      items: attachMenuImages(payload.items),
    }),
  });

export const useBistroHealth = () =>
  useQuery({
    queryKey: ["bistro-health", aiRuntimeConfig.apiBaseUrl],
    queryFn: () => fetchBistroApi<BistroApiHealth>("/health"),
    staleTime: 20 * 1000,
    retry: 1,
    refetchInterval: 30 * 1000,
  });
