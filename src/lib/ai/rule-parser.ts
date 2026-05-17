import { menuItems } from "@/data/menu";

import type { BistroAiAction, BistroAiRequest, BistroAiResponse } from "./types";

const numberWords: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  "\u4e00": 1,
  two: 2,
  "\u4e8c": 2,
  "\u4e24": 2,
  three: 3,
  "\u4e09": 3,
  four: 4,
  "\u56db": 4,
  five: 5,
  "\u4e94": 5,
  six: 6,
  "\u516d": 6,
  seven: 7,
  "\u4e03": 7,
  eight: 8,
  "\u516b": 8,
  nine: 9,
  "\u4e5d": 9,
  ten: 10,
  "\u5341": 10,
  couple: 2,
};

const manualAliases: Record<string, string[]> = {
  "spicy-garlic-edamame": ["spicy edamame", "garlic edamame", "\u849c\u9999\u8fa3\u6bdb\u8c46", "\u8fa3\u6bdb\u8c46"],
  "truffle-salmon-roll": ["truffle salmon", "premium roll", "\u677e\u9732\u4e09\u6587\u9c7c\u5377", "\u9ad8\u7ea7\u4e09\u6587\u9c7c\u5377"],
  "hamachi-yuzu-roll": ["hamachi yuzu", "light roll", "\u6cb9\u7518\u9c7c\u67da\u5b50\u5377"],
  "mango-salmon-delight": ["mango salmon", "\u8292\u679c\u4e09\u6587\u9c7c\u5377"],
  "black-garlic-ramen": ["black garlic", "\u9ed1\u849c\u62c9\u9762"],
  "tonkotsu-ramen": ["tonkotsu", "\u8c5a\u9aa8\u62c9\u9762", "\u8c5a\u9aa8\u9762"],
  "agedashi-tofu": ["tofu appetizer", "vegetarian appetizer", "\u626c\u51fa\u8c46\u8150", "\u8c46\u8150\u524d\u83dc"],
  edamame: ["\u6bdb\u8c46"],
  "seaweed-salad": ["light salad", "fresh salad", "\u6d77\u85fb\u6c99\u62c9"],
  "avocado-salad": ["\u725b\u6cb9\u679c\u6c99\u62c9"],
};

const recommendationKeywordMap: Record<string, string[]> = {
  autumn: ["Rich", "Comfort", "Warm"],
  fall: ["Rich", "Comfort", "Warm"],
  "\u79cb\u5929": ["Rich", "Comfort", "Warm"],
  "\u79cb\u5b63": ["Rich", "Comfort", "Warm"],
  light: ["Light", "Fresh", "Refreshing", "Citrus"],
  "\u6e05\u723d": ["Light", "Fresh", "Refreshing", "Citrus"],
  "\u6e05\u6de1": ["Light", "Fresh", "Refreshing", "Citrus"],
  fresh: ["Fresh", "Refreshing", "Citrus", "Light"],
  "\u65b0\u9c9c": ["Fresh", "Refreshing", "Citrus", "Light"],
  "\u6625\u5929": ["Fresh", "Refreshing", "Citrus", "Light"],
  "\u6625\u5b63": ["Fresh", "Refreshing", "Citrus", "Light"],
  spicy: ["Spicy"],
  "\u8fa3": ["Spicy"],
  vegetarian: ["Vegetarian"],
  "\u7d20": ["Vegetarian"],
  vegan: ["Vegan"],
  "\u7eaf\u7d20": ["Vegan"],
  premium: ["Premium"],
  "\u9ad8\u7ea7": ["Premium"],
  rich: ["Rich", "Comfort"],
  "\u6d53\u90c1": ["Rich", "Comfort"],
  comfort: ["Comfort", "Warm"],
  "\u6696": ["Comfort", "Warm"],
  shareable: ["Shareable"],
  "\u5206\u4eab": ["Shareable"],
  crispy: ["Crispy"],
  "\u9165\u8106": ["Crispy"],
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const hasChineseCharacters = (value: string) => /[\u4e00-\u9fff]/.test(value);

export const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\u4e00-\u9fffa-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getAliasesForItem = (itemId: string, itemName: string) => {
  const aliases = new Set<string>([normalizeText(itemName)]);
  const withoutCategory = normalizeText(itemName.replace(/ roll$/i, "").replace(/ ramen$/i, ""));
  if (withoutCategory && withoutCategory !== normalizeText(itemName)) {
    aliases.add(withoutCategory);
  }

  manualAliases[itemId]?.forEach((alias) => aliases.add(normalizeText(alias)));

  return [...aliases].sort((left, right) => right.length - left.length);
};

const menuIndex = menuItems.map((item) => ({
  item,
  aliases: getAliasesForItem(item.id, item.name),
}));

const readQuantity = (prefix: string) => {
  const match = prefix.match(
    /(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|couple|\u4e00|\u4e8c|\u4e24|\u4e09|\u56db|\u4e94|\u516d|\u4e03|\u516b|\u4e5d|\u5341)\s*(?:\u4efd|\u4e2a|\u7897|\u676f|\u4efd)?\s*$/,
  );
  if (!match) {
    return 1;
  }

  const value = match[1].toLowerCase();
  return Number.isFinite(Number(value)) ? Number(value) : numberWords[value] ?? 1;
};

const detectSpiceLevel = (prompt: string) => {
  if (prompt.includes("mild") || prompt.includes("\u5fae\u8fa3") || prompt.includes("\u5c0f\u8fa3")) {
    return "Mild";
  }

  if (prompt.includes("medium") || prompt.includes("\u4e2d\u8fa3")) {
    return "Medium";
  }

  if (prompt.includes("spicy") || prompt.includes("hot") || prompt.includes("\u8fa3")) {
    return "Spicy";
  }

  return undefined;
};

const buildAddReply = (actions: BistroAiAction[], preferChinese = false) => {
  const lines = actions.flatMap((action) =>
    action.type === "add_item" ? [`${action.quantity} x ${menuItems.find((item) => item.id === action.itemId)?.name ?? action.itemId}`] : [],
  );

  return preferChinese
    ? `我找到了 ${lines.join(" 和 ")}。请确认下面的购物车变更。`
    : `I found ${lines.join(" and ")}. Review the cart changes below.`;
};

const buildRemoveReply = (actions: BistroAiAction[], preferChinese = false) => {
  const labels = actions.flatMap((action) =>
    action.type === "remove_item" ? [menuItems.find((item) => item.id === action.itemId)?.name ?? action.itemId] : [],
  );

  return preferChinese
    ? `我在你的购物车里找到了 ${labels.join(" 和 ")}。请确认下面的删除操作。`
    : `I found ${labels.join(" and ")} in your cart. Review the removal below.`;
};

export const isClearCartIntent = (prompt: string) => {
  if (prompt.includes("start over")) {
    return true;
  }

  if (/\b(clear|empty)\b(?:\s+\w+){0,3}\s+\bcart\b/.test(prompt)) {
    return true;
  }

  if (/(?:\u6e05\u7a7a|\u6e05\u6389|\u6e05\u9664).{0,4}(?:\u8d2d\u7269\u8f66|cart)|(?:\u8d2d\u7269\u8f66|cart).{0,4}(?:\u6e05\u7a7a|\u6e05\u6389|\u6e05\u9664)/.test(prompt)) {
    return true;
  }

  if (
    /(?:\u6e05\u7a7a|\u6e05\u6389|\u6e05\u9664).{0,4}(?:\u83dc\u5355|\u70b9\u5355|\u8ba2\u5355|\u521a\u624d\u70b9\u7684|\u5df2\u70b9\u7684)|(?:\u83dc\u5355|\u70b9\u5355|\u8ba2\u5355).{0,4}(?:\u6e05\u7a7a|\u6e05\u6389|\u6e05\u9664)/.test(
      prompt,
    )
  ) {
    return true;
  }

  if (/\b(remove|delete|drop)\b(?:\s+\w+){0,2}\s+\b(everything|all)\b/.test(prompt)) {
    return /\b(cart|items|them|it|everything)\b/.test(prompt);
  }

  if (/(?:\u5220|\u5220\u9664|\u5220\u6389|\u53bb\u6389|\u79fb\u9664).{0,4}(?:\u5168\u90e8|\u6240\u6709)|(?:\u5168\u90e8|\u6240\u6709).{0,4}(?:\u5220|\u5220\u9664|\u5220\u6389|\u53bb\u6389|\u79fb\u9664)/.test(prompt)) {
    return /(?:\u8d2d\u7269\u8f66|\u5546\u54c1|\u4e1c\u897f|\u83dc|\u9879|items?|them|everything)/.test(prompt);
  }

  return false;
};

const hasIntentKeyword = (prompt: string, keywords: string[]) =>
  keywords.some((keyword) => prompt.includes(keyword));

const addIntentKeywords = ["add", "order", "want", "get", "have", "plus", "\u6dfb\u52a0", "\u52a0", "\u52a0\u5165", "\u6765", "\u8981", "\u70b9"];
const removeIntentKeywords = ["remove", "delete", "drop", "\u5220", "\u5220\u9664", "\u5220\u6389", "\u53bb\u6389", "\u79fb\u9664", "\u4e0d\u8981"];
const recommendationIntentKeywords = [
  "recommend",
  "suggest",
  "what should",
  "what do you suggest",
  "premium roll",
  "vegetarian appetizer",
  "\u63a8\u8350",
  "\u6709\u4ec0\u4e48\u63a8\u8350",
  "\u6709\u5565\u63a8\u8350",
  "\u63a8\u8350\u4e00\u4e0b",
  "\u63a8\u8350\u70b9",
  "\u5403\u4ec0\u4e48",
];

export const findItemMatches = (prompt: string) => {
  const hits: Array<{
    alias: string;
    end: number;
    itemId: string;
    quantity: number;
    spiceLevel?: string;
    start: number;
  }> = [];

  menuIndex.forEach(({ item, aliases }) => {
    aliases.forEach((alias) => {
      const regex = hasChineseCharacters(alias)
        ? new RegExp(escapeRegex(alias), "i")
        : new RegExp(`\\b${escapeRegex(alias)}(?:s)?\\b`, "i");
      const match = regex.exec(prompt);

      if (!match || match.index === undefined) {
        return;
      }

      const start = match.index;
      const end = start + match[0].length;
      const prefix = prompt.slice(Math.max(0, start - 20), start);
      const localWindow = prompt.slice(Math.max(0, start - 10), Math.min(prompt.length, end + 10));
      const localSpice =
        alias.includes("spicy") && item.spiceLevels?.length
          ? "Spicy"
          : item.spiceLevels?.length
            ? detectSpiceLevel(localWindow)
            : undefined;

      hits.push({
        alias,
        itemId: item.id,
        quantity: readQuantity(prefix),
        spiceLevel: localSpice,
        start,
        end,
      });
    });
  });

  hits.sort((left, right) => left.start - right.start || right.alias.length - left.alias.length);

  const consumedRanges: Array<{ start: number; end: number }> = [];
  const matches = new Map<string, { itemId: string; quantity: number; spiceLevel?: string }>();

  hits.forEach((hit) => {
    const overlapsExistingRange = consumedRanges.some(
      (range) => hit.start < range.end && hit.end > range.start,
    );

    if (overlapsExistingRange || matches.has(hit.itemId)) {
      return;
    }

    matches.set(hit.itemId, {
      itemId: hit.itemId,
      quantity: hit.quantity,
      spiceLevel: hit.spiceLevel,
    });
    consumedRanges.push({ start: hit.start, end: hit.end });
  });

  return [...matches.values()];
};

export const findCartRemovalMatches = (prompt: string, cartItems: BistroAiRequest["cartItems"]) => {
  const normalizedPrompt = normalizeText(prompt);
  const exactCartMatches = cartItems.filter((cartItem) => {
    const normalizedName = normalizeText(cartItem.name);
    return normalizedPrompt.includes(normalizedName) || normalizedName.includes(normalizedPrompt);
  });

  if (exactCartMatches.length > 0) {
    return exactCartMatches.map((item) => item.itemId);
  }

  const itemMatches = findItemMatches(normalizedPrompt).map((match) => match.itemId);
  if (itemMatches.length > 0) {
    const directCartMatches = cartItems
      .filter((item) => itemMatches.includes(item.itemId))
      .map((item) => item.itemId);

    if (directCartMatches.length > 0) {
      return directCartMatches;
    }
  }

  if (normalizedPrompt.includes("edamame")) {
    return cartItems
      .filter((item) => normalizeText(item.name).includes("edamame"))
      .map((item) => item.itemId);
  }

  return [];
};

export const scoreRecommendation = (prompt: string) => {
  const normalizedPrompt = normalizeText(prompt);

  return menuItems
    .map((item) => {
      let score = item.featured ? 1 : 0;
      const haystack = normalizeText(`${item.name} ${item.description} ${item.tags.join(" ")}`);

      Object.entries(recommendationKeywordMap).forEach(([keyword, tags]) => {
        if (normalizedPrompt.includes(keyword)) {
          if (item.tags.some((tag) => tags.includes(tag))) {
            score += 4;
          }
          if (haystack.includes(keyword)) {
            score += 2;
          }
        }
      });

      if (normalizedPrompt.includes("roll") && item.category === "rolls") {
        score += 3;
      }

      if (normalizedPrompt.includes("ramen") && item.category === "ramen") {
        score += 3;
      }

      if (normalizedPrompt.includes("appetizer") && item.category === "appetizers") {
        score += 3;
      }

      if (normalizedPrompt.includes("salad") && item.category === "salads") {
        score += 3;
      }

      if (normalizedPrompt.includes("\u5377") && item.category === "rolls") {
        score += 3;
      }

      if (normalizedPrompt.includes("\u62c9\u9762") && item.category === "ramen") {
        score += 3;
      }

      if (
        (normalizedPrompt.includes("\u524d\u83dc") || normalizedPrompt.includes("\u5c0f\u5403")) &&
        item.category === "appetizers"
      ) {
        score += 3;
      }

      if (normalizedPrompt.includes("\u6c99\u62c9") && item.category === "salads") {
        score += 3;
      }

      if (normalizedPrompt.includes("\u4e3b\u83dc") && (item.category === "rolls" || item.category === "ramen")) {
        score += 2;
      }

      return { item, score };
    })
    .sort((left, right) => right.score - left.score || left.item.price - right.item.price);
};

export const parseOrderWithRules = ({
  prompt,
  cartItems,
}: BistroAiRequest): BistroAiResponse | null => {
  const normalizedPrompt = normalizeText(prompt);
  const preferChinese = hasChineseCharacters(prompt);

  if (!normalizedPrompt) {
    return null;
  }

  if (isClearCartIntent(normalizedPrompt)) {
    if (cartItems.length === 0) {
      return {
        intent: "clear_cart",
        reply: preferChinese ? "\u4f60\u7684\u8d2d\u7269\u8f66\u5df2\u7ecf\u662f\u7a7a\u7684\u3002" : "Your cart is already empty.",
        needsConfirmation: false,
        actions: [],
        suggestedItemIds: [],
        referencedItemIds: [],
        unavailableRequests: [],
      };
    }

    return {
      intent: "clear_cart",
      reply: preferChinese
        ? "\u6211\u53ef\u4ee5\u5e2e\u4f60\u6e05\u7a7a\u8d2d\u7269\u8f66\u3002\u8bf7\u786e\u8ba4\u4e0b\u9762\u7684\u53d8\u66f4\u3002"
        : "I can clear the cart for you. Review the change below.",
      needsConfirmation: true,
      actions: [{ type: "clear_cart" }],
      suggestedItemIds: [],
      referencedItemIds: [],
      unavailableRequests: [],
    };
  }

  if (hasIntentKeyword(normalizedPrompt, removeIntentKeywords)) {
    const itemIds = [...new Set(findCartRemovalMatches(normalizedPrompt, cartItems))];

    if (itemIds.length === 0) {
      return {
        intent: "remove_items",
        reply: preferChinese
          ? "\u6211\u8fd8\u6ca1\u6709\u5728\u4f60\u7684\u8d2d\u7269\u8f66\u91cc\u627e\u5230\u8fd9\u4ef6\u5546\u54c1\u3002"
          : "I do not see that item in your cart yet.",
        needsConfirmation: false,
        actions: [],
        suggestedItemIds: [],
        referencedItemIds: [],
        unavailableRequests: [prompt],
      };
    }

    const actions: BistroAiAction[] = itemIds.map((itemId) => ({
      type: "remove_item",
      itemId,
    }));

    return {
      intent: "remove_items",
      reply: buildRemoveReply(actions, preferChinese),
      needsConfirmation: true,
      actions,
      suggestedItemIds: [],
      referencedItemIds: itemIds,
      unavailableRequests: [],
    };
  }

  if (hasIntentKeyword(normalizedPrompt, recommendationIntentKeywords)) {
    const suggestions = scoreRecommendation(normalizedPrompt)
      .filter((entry) => entry.score > 0)
      .slice(0, 3)
      .map((entry) => entry.item);

    if (suggestions.length === 0) {
      return null;
    }

    const lead = suggestions.slice(0, 2).map((item) => item.name).join(" and ");

    return {
      intent: "recommend_items",
      reply: preferChinese
        ? `\u6211\u4f1a\u5148\u63a8\u8350 ${lead}\u3002\u8fd9\u4e9b\u66f4\u8d34\u8fd1\u4f60\u7684\u9700\u6c42\u3002`
        : `I would start with ${lead}. They fit what you asked for.`,
      needsConfirmation: false,
      actions: [],
      suggestedItemIds: suggestions.map((item) => item.id),
      referencedItemIds: suggestions.map((item) => item.id),
      unavailableRequests: [],
    };
  }

  if (hasIntentKeyword(normalizedPrompt, addIntentKeywords)) {
    const matches = findItemMatches(normalizedPrompt);

    if (matches.length === 0) {
      return null;
    }

    const actions: BistroAiAction[] = matches.map((match) => ({
      type: "add_item",
      itemId: match.itemId,
      quantity: match.quantity,
      spiceLevel: match.spiceLevel,
    }));

    return {
      intent: "add_items",
      reply: buildAddReply(actions, preferChinese),
      needsConfirmation: true,
      actions,
      suggestedItemIds: [],
      referencedItemIds: matches.map((match) => match.itemId),
      unavailableRequests: [],
    };
  }

  return null;
};
