import { menuCatalogItems as menuItems } from "../../data/menu-catalog";

import { matchesActionCartVariant, resolveSetQuantityTarget } from "./cart-targeting";
import {
  detectPromptAddOnIds,
  detectPromptSpiceLevel,
  findCartRemovalMatches,
  findItemMatches,
  hasChineseCharacters,
  isClearCartIntent,
  normalizeText,
  resolveMenuMentions,
  scoreRecommendation,
} from "./rule-parser";
import type {
  BistroAiAction,
  BistroAiClarificationOption,
  BistroAiCommand,
  BistroAiIntent,
  BistroAiMissingSlot,
  BistroAiRequest,
  BistroAiResponse,
  BistroAiSelectionPlan,
} from "./types";

const menuById = new Map(menuItems.map((item) => [item.id, item]));
type MenuItem = (typeof menuItems)[number];

const normalizeAddOnIds = (addOnIds?: string[]) =>
  [...new Set((addOnIds ?? []).map((addOnId) => addOnId.trim()).filter(Boolean))].sort();

const mergeActionAddOnIds = (primary?: string[], fallback?: string[]) => {
  const merged = normalizeAddOnIds([...(fallback ?? []), ...(primary ?? [])]);
  return merged.length > 0 ? merged : undefined;
};

const normalizeActionSpiceLevel = (item: MenuItem | undefined, spiceLevel?: string) => {
  if (!item?.spiceLevels?.length || !spiceLevel) {
    return undefined;
  }

  return item.spiceLevels.find((level) => level.toLowerCase() === spiceLevel.trim().toLowerCase());
};

const normalizeActionAddOnIds = (item: MenuItem | undefined, addOnIds?: string[]) => {
  if (!Array.isArray(addOnIds)) {
    return undefined;
  }

  if (!item?.addOns?.length) {
    return [];
  }

  const allowedIds = new Set(item.addOns.map((addOn) => addOn.id));
  return normalizeAddOnIds(addOnIds.filter((addOnId) => allowedIds.has(addOnId)));
};

const resolveActionAddOnNames = (item: MenuItem | undefined, addOnIds?: string[]) => {
  if (!item?.addOns?.length || !Array.isArray(addOnIds)) {
    return [];
  }

  const addOnsById = new Map(item.addOns.map((addOn) => [addOn.id, addOn.name]));
  return normalizeAddOnIds(addOnIds).flatMap((addOnId) => {
    const name = addOnsById.get(addOnId);
    return name ? [name] : [];
  });
};

const formatActionModifierLabel = (action: BistroAiAction) => {
  if (action.type === "clear_cart") {
    return "";
  }

  const item = menuById.get(action.itemId);
  const parts: string[] = [];

  if ("spiceLevel" in action && action.spiceLevel) {
    parts.push(action.spiceLevel);
  }

  if ("addOnIds" in action) {
    const addOnNames = resolveActionAddOnNames(item, action.addOnIds);
    if (addOnNames.length > 0) {
      parts.push(addOnNames.join(", "));
    }
  }

  return parts.length > 0 ? ` (${parts.join(" | ")})` : "";
};

const formatActionModifierSummary = (action: BistroAiAction) => formatActionModifierLabel(action).slice(2, -1);

const normalizeOptionalText = (value?: string) => value?.trim().toLowerCase() ?? "";

const actionHasModifierChange = (
  cartItem: BistroAiRequest["cartItems"][number],
  action: Extract<BistroAiAction, { type: "add_item" | "set_quantity" }>,
) => {
  const spiceChanged =
    action.spiceLevel !== undefined && normalizeOptionalText(cartItem.spiceLevel) !== normalizeOptionalText(action.spiceLevel);
  const addOnsChanged =
    Array.isArray(action.addOnIds) &&
    normalizeAddOnIds(cartItem.addOns.map((addOn) => addOn.id)).join(",") !== normalizeAddOnIds(action.addOnIds).join(",");

  return spiceChanged || addOnsChanged;
};

const resolveCartTargetItemIds = ({
  cartItems,
  cartResolutionItemIds,
  contextualItemIds,
  directMentionMatches,
}: {
  cartItems: BistroAiRequest["cartItems"];
  cartResolutionItemIds: string[];
  contextualItemIds: string[];
  directMentionMatches: Array<{ itemId: string }>;
}) => {
  const explicitItemIds = unique([
    ...directMentionMatches.map((match) => match.itemId),
    ...cartResolutionItemIds,
  ]).filter((itemId) => cartItems.some((item) => item.itemId === itemId));

  if (explicitItemIds.length > 0) {
    return explicitItemIds;
  }

  return unique(contextualItemIds.filter((itemId) => cartItems.some((item) => item.itemId === itemId)));
};

const getActionKey = (action: BistroAiAction) => {
  if (action.type === "clear_cart") {
    return action.type;
  }

  const spiceLevel = "spiceLevel" in action ? action.spiceLevel?.trim().toLowerCase() ?? "" : "";
  const addOnIds = "addOnIds" in action ? normalizeAddOnIds(action.addOnIds).join(",") : "";
  const quantity = "quantity" in action ? action.quantity : "";

  return [action.type, action.itemId, quantity, spiceLevel, addOnIds].join(":");
};

const dedupeActions = (actions: BistroAiAction[]) => {
  const seen = new Set<string>();

  return actions.filter((action) => {
    const key = getActionKey(action);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const addIntentHints = [
  "add",
  "order",
  "give me",
  "get me",
  "i want",
  "i'll take",
  "please add",
  "help me add",
  "\u6dfb\u52a0",
  "\u52a0",
  "\u52a0\u5165",
  "\u7ed9\u6211\u6765",
  "\u5e2e\u6211\u52a0",
  "\u6211\u8981",
];

const removeIntentHints = [
  "remove",
  "delete",
  "drop",
  "take out",
  "take off",
  "\u5220",
  "\u5220\u9664",
  "\u5220\u6389",
  "\u53bb\u6389",
  "\u79fb\u9664",
  "\u4e0d\u8981",
];

const updateIntentHints = [
  "change",
  "set",
  "make",
  "update",
  "adjust",
  "\u6539\u6210",
  "\u6539\u4e3a",
  "\u6539\u5230",
  "\u8c03\u6574\u6210",
  "\u8c03\u6574\u4e3a",
  "\u53d8\u6210",
];

const advisoryHints = [
  "should i",
  "what do you think",
  "how about",
  "what about",
  "is it good",
  "is that good",
  "does that work",
  "would that work",
  "worth it",
  "recommend",
  "suggest",
  "think",
  "\u89c9\u5f97",
  "\u600e\u4e48\u6837",
  "\u53ef\u4ee5\u5417",
  "\u884c\u5417",
  "\u5408\u9002\u5417",
  "\u63a8\u8350",
  "\u5efa\u8bae",
  "\u770b\u770b",
];

const explanationHints = [
  "what is",
  "tell me about",
  "tell me more",
  "more about",
  "describe",
  "intro",
  "introduce",
  "feature",
  "features",
  "what's it like",
  "\u4ec0\u4e48",
  "\u4ecb\u7ecd",
  "\u4ecb\u7ecd\u4e0b",
  "\u4ecb\u7ecd\u4e00\u4e0b",
  "\u7279\u70b9",
  "\u8bf4\u8bf4",
  "\u8bb2\u8bb2",
];

const referenceHints = [
  "this",
  "that",
  "it",
  "this one",
  "that one",
  "the one",
  "these",
  "those",
  "them",
  "cart",
  "\u8fd9\u4e2a",
  "\u90a3\u4e2a",
  "\u8fd9\u9053",
  "\u90a3\u9053",
  "\u8fd9\u4e2a\u83dc",
  "\u90a3\u4e2a\u83dc",
  "\u8fd9\u4e2a\u5377",
  "\u90a3\u4e2a\u5377",
  "\u5b83",
  "\u5b83\u4eec",
  "\u8fd9\u4e9b",
  "\u90a3\u4e9b",
];

const allReferenceHints = ["all", "all of them", "them all", "\u8fd9\u4e9b", "\u90a3\u4e9b", "\u5b83\u4eec", "\u5168\u90e8"];
const cheapestHints = [
  "cheapest",
  "lowest price",
  "least expensive",
  "most affordable",
  "\u6700\u4fbf\u5b9c",
  "\u6700\u7701\u94b1",
  "\u4fbf\u5b9c\u7684",
];
const priciestHints = [
  "most expensive",
  "highest price",
  "priciest",
  "\u6700\u8d35",
  "\u6700\u8d35\u7684",
];
const alternativeRecommendationHints = [
  "another",
  "anything else",
  "different",
  "else",
  "more options",
  "other choices",
  "other options",
  "something else",
  "\u5176\u4ed6",
  "\u522b\u7684",
  "\u53e6\u5916",
  "\u53e6\u4e00\u4e2a",
  "\u6362\u4e00\u7ec4",
  "\u8fd8\u6709\u5176\u4ed6",
  "\u8fd8\u6709\u522b\u7684",
];

type BudgetConstraint = {
  maxTotal: number;
  itemCount: number | null;
  isComplaint: boolean;
};

type BudgetSelection = {
  itemIds: string[];
  total: number;
  targetCount: number;
};

type RecommendationGroup = MenuItem["category"] | "main";

const unique = <T,>(values: T[]) => [...new Set(values)];
const clarificationStopTokens = new Set([
  "a",
  "an",
  "add",
  "all",
  "and",
  "cart",
  "change",
  "clear",
  "delete",
  "dish",
  "dishes",
  "from",
  "get",
  "give",
  "help",
  "i",
  "in",
  "item",
  "items",
  "make",
  "me",
  "my",
  "of",
  "on",
  "one",
  "order",
  "please",
  "remove",
  "set",
  "that",
  "the",
  "them",
  "this",
  "to",
  "update",
  "want",
  "with",
]);
const menuNameSet = new Set(menuItems.map((item) => normalizeText(item.name)));

const countWordMap: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
};

const isAddAction = (action: BistroAiAction): action is Extract<BistroAiAction, { type: "add_item" }> =>
  action.type === "add_item";

const isSetQuantityAction = (action: BistroAiAction): action is Extract<BistroAiAction, { type: "set_quantity" }> =>
  action.type === "set_quantity";

const isQuestionLikePrompt = (prompt: string) => prompt.includes("?") || prompt.includes("\uff1f");

const includesAny = (prompt: string, needles: string[]) =>
  needles.some((needle) => prompt.includes(needle));

const hasReferenceHint = (prompt: string) => includesAny(prompt, referenceHints);
const asksForCheapest = (prompt: string) => includesAny(prompt, cheapestHints);
const asksForPriciest = (prompt: string) => includesAny(prompt, priciestHints);
const asksForAlternativeRecommendation = (prompt: string) => includesAny(prompt, alternativeRecommendationHints);

const looksLikeExplanationPrompt = (prompt: string) => includesAny(prompt, explanationHints);

const stripStructuredFieldLeak = (reply: string) => {
  const leakPatterns = [
    /(?:\bI\s+)?\bsuggestedItemIds\b\s*:/i,
    /\breferencedItemIds\b\s*:/i,
    /\bselectionPlan\b\s*:/i,
    /\bunavailableRequests\b\s*:/i,
    /\bmissingSlots\b\s*:/i,
    /\bclarificationOptions\b\s*:/i,
    /\bcommand\b\s*:/i,
    /\bactions\b\s*:/i,
    /"intent"\s*:/i,
    /"suggestedItemIds"\s*:/i,
    /"referencedItemIds"\s*:/i,
  ];
  const leakIndex = leakPatterns.reduce((bestIndex, pattern) => {
    const matchIndex = reply.search(pattern);
    if (matchIndex === -1) {
      return bestIndex;
    }

    return bestIndex === -1 ? matchIndex : Math.min(bestIndex, matchIndex);
  }, -1);

  return (leakIndex === -1 ? reply : reply.slice(0, leakIndex)).trim();
};

const looksLikeBudgetComplaintPrompt = (prompt: string) => {
  if (prompt.includes("\u4e0d\u8d85\u8fc7") || prompt.includes("\u4e0d\u8d85")) {
    return false;
  }

  if (/(?:over budget|too expensive|price is over|price exceeded|total exceeded)/.test(prompt)) {
    return true;
  }

  if (/(?:\u4ef7\u683c|\u603b\u4ef7|\u5408\u8ba1|\u9884\u7b97).{0,4}(?:\u8d85\u4e86|\u8d85\u51fa|\u8d85\u8fc7\u4e86?)/.test(prompt)) {
    return true;
  }

  if (
    /(?:\u8d85\u4e86|\u8d85\u51fa|\u8d85\u8fc7\u4e86?)/.test(prompt) &&
    !prompt.includes("\u4e0d\u8d85\u8fc7") &&
    !prompt.includes("\u4e0d\u8d85")
  ) {
    return true;
  }

  return false;
};

const parseCountToken = (token: string) => {
  const normalized = token.trim().toLowerCase();
  if (normalized === "a" || normalized === "an") {
    return 1;
  }

  if (normalized === "seven") {
    return 7;
  }

  if (normalized === "eight") {
    return 8;
  }

  if (normalized === "nine") {
    return 9;
  }

  if (normalized === "ten") {
    return 10;
  }

  if (normalized === "\u4e03") {
    return 7;
  }

  if (normalized === "\u516b") {
    return 8;
  }

  if (normalized === "\u4e5d") {
    return 9;
  }

  if (normalized === "\u5341") {
    return 10;
  }

  if (countWordMap[normalized] !== undefined) {
    return countWordMap[normalized];
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractRequestedItemCount = (prompt: string) => {
  const englishMatch = prompt.match(/\b(\d+|one|two|three|four|five|six)\s+(?:dishes?|items?|plates?|mains?)\b/);
  if (englishMatch) {
    return parseCountToken(englishMatch[1]);
  }

  const chineseMatch = prompt.match(/(\d+|[一二两三四五六])\s*(?:道菜|个菜|份菜|样菜|道|份|个)/);
  if (chineseMatch) {
    return parseCountToken(chineseMatch[1]);
  }

  return null;
};

const extractMentionQuantity = (value: string, fallback = 1) => {
  const normalized = normalizeText(value);
  const englishMatch = normalized.match(
    /\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|couple)\b/,
  );
  if (englishMatch) {
    const quantity = parseCountToken(englishMatch[1]);
    if (quantity !== null && quantity > 0) {
      return quantity;
    }
  }

  const chineseMatch = value.match(/(\d+|[\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341])/);
  if (chineseMatch) {
    const quantity = parseCountToken(chineseMatch[1]);
    if (quantity !== null && quantity > 0) {
      return quantity;
    }
  }

  return fallback;
};

const extractBudgetLimit = (prompt: string) => {
  const patterns = [
    /(?:budget(?: is| of| around)?|under|within|at most|max|no more than|less than|up to)\s*(\d+(?:\.\d+)?)/,
    /(?:\u9884\u7b97(?:\u662f|\u4e3a)?|\u63a7\u5236\u5728|\u4e0d\u8d85\u8fc7|\u6700\u591a|\u4f4e\u4e8e)\s*(\d+(?:\.\d+)?)/,
    /(\d+(?:\.\d+)?)\s*(?:\u5143|\u5757|dollars?|usd)?\s*(?:\u4ee5\u5185|\u4ee5\u4e0b|\u4e4b\u5185|\u4e0d\u8d85\u8fc7|\u6700\u591a)/,
    /(?:\u6700\u7ec8\u4ef7\u683c|\u603b\u4ef7|\u5408\u8ba1|total).{0,6}(\d+(?:\.\d+)?)/,
    /(?:\u8d85\u8fc7\u4e86?|\u8d85\u51fa\u4e86?|\u8d85\u4e86|over)\s*(\d+(?:\.\d+)?)/,
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (!match) {
      continue;
    }

    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return null;
};

const extractBudgetConstraint = (prompt: string): BudgetConstraint | null => {
  const maxTotal = extractBudgetLimit(prompt);
  if (maxTotal === null) {
    return null;
  }

  return {
    maxTotal,
    itemCount: extractRequestedItemCount(prompt),
    isComplaint: looksLikeBudgetComplaintPrompt(prompt),
  };
};

const hasChineseAddIntent = (prompt: string) =>
  /(?:\u5e2e\u6211\u52a0|\u5e2e\u6211\u70b9|\u7ed9\u6211\u6765|\u7ed9\u6211\u70b9|\u6211\u8981\u70b9|\u6211\u8981\u6765|\u6211\u60f3\u70b9|\u6211\u60f3\u6765|\u6dfb\u52a0|\u52a0\u5165|\u52a0\u4e00|\u52a0\u4e2a|\u52a0\u4efd|\u52a0\u9053|\u70b9\u4e00|\u70b9\u4e2a|\u70b9\u4efd|\u70b9\u9053|\u6765\u4e00|\u6765\u4e2a|\u6765\u4efd|\u6765\u9053|\u518d\u52a0|\u52a0\u4e0a)/.test(
    prompt,
  );

const hasChineseUpdateIntent = (prompt: string) =>
  /(?:\u6539\u6210|\u6539\u4e3a|\u6539\u5230|\u8c03\u6574\u6210|\u8c03\u6574\u4e3a|\u53d8\u6210).{0,12}(?:\d+|[\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341])(?:\u4efd|\u4e2a|\u7897|\u676f)?/.test(
    prompt,
  );

const extractRequestedQuantity = (prompt: string) => {
  const englishPatterns = [
    /\b(?:change|set|update|adjust)(?:\s+\w+){0,12}\s+(?:to|as)\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\b/,
    /\bmake(?:\s+\w+){0,12}\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\b/,
  ];

  for (const pattern of englishPatterns) {
    const match = prompt.match(pattern);
    if (!match) {
      continue;
    }

    const quantity = parseCountToken(match[1]);
    if (quantity !== null && quantity > 0) {
      return quantity;
    }
  }

  const chineseMatch = prompt.match(
    /(?:\u6539\u6210|\u6539\u4e3a|\u6539\u5230|\u8c03\u6574\u6210|\u8c03\u6574\u4e3a|\u53d8\u6210)\s*(\d+|[\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341])\s*(?:\u4efd|\u4e2a|\u7897|\u676f)?/,
  );

  if (!chineseMatch) {
    return null;
  }

  const quantity = parseCountToken(chineseMatch[1]);
  return quantity !== null && quantity > 0 ? quantity : null;
};

const extractRequestedQuantityReduction = (prompt: string) => {
  const englishPatterns = [
    /\b(?:decrease|reduce|lower|drop)(?:\s+\w+){0,8}\s+by\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\b/,
    /\b(?:decrease|reduce|lower|drop|remove|take off|take out)(?:\s+\w+){0,8}\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\b/,
    /\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+less\b/,
  ];

  for (const pattern of englishPatterns) {
    const match = prompt.match(pattern);
    if (!match) {
      continue;
    }

    const quantity = parseCountToken(match[1]);
    if (quantity !== null && quantity > 0) {
      return quantity;
    }
  }

  const chinesePatterns = [
    /(?:减少|减掉|减去)\s*(\d+|[\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341])\s*(?:份|个|碗|杯)?/,
    /(?:少|减)\s*(\d+|[\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341])\s*(?:份|个|碗|杯)/,
  ];

  for (const pattern of chinesePatterns) {
    const match = prompt.match(pattern);
    if (!match) {
      continue;
    }

    const quantity = parseCountToken(match[1]);
    if (quantity !== null && quantity > 0) {
      return quantity;
    }
  }

  return null;
};

const isStructuralSelectionQuery = (query: string) => {
  if (!query) {
    return false;
  }

  return (
    extractOrdinalIndex(query, 99) !== null ||
    asksForCheapest(query) ||
    asksForPriciest(query) ||
    hasReferenceHint(query) ||
    includesAny(query, allReferenceHints)
  );
};

const isAdvisoryPrompt = (prompt: string) =>
  includesAny(prompt, advisoryHints) || isQuestionLikePrompt(prompt);

const isExplicitAddPrompt = (prompt: string) =>
  (includesAny(prompt, addIntentHints) || hasChineseAddIntent(prompt)) &&
  !looksLikeBudgetComplaintPrompt(prompt) &&
  !isAdvisoryPrompt(prompt);

const isExplicitRemovePrompt = (prompt: string) =>
  includesAny(prompt, removeIntentHints) && !isAdvisoryPrompt(prompt);

const isExplicitUpdatePrompt = (prompt: string) =>
  extractRequestedQuantity(prompt) !== null &&
  (includesAny(prompt, updateIntentHints) || hasChineseUpdateIntent(prompt)) &&
  !looksLikeBudgetComplaintPrompt(prompt) &&
  !isAdvisoryPrompt(prompt);

const isExplicitQuantityReductionPrompt = (prompt: string) =>
  extractRequestedQuantityReduction(prompt) !== null &&
  !looksLikeBudgetComplaintPrompt(prompt) &&
  !isAdvisoryPrompt(prompt);

const isUpdateVerbPrompt = (prompt: string) =>
  (includesAny(prompt, updateIntentHints) || /(?:\u6539|\u8c03\u6574|\u53d8\u6210)/.test(prompt)) &&
  !looksLikeBudgetComplaintPrompt(prompt) &&
  !isAdvisoryPrompt(prompt);

const isExplicitClearPrompt = (prompt: string) => isClearCartIntent(prompt) && !isAdvisoryPrompt(prompt);

const extractOrdinalIndex = (prompt: string, total: number) => {
  if (total <= 0) {
    return null;
  }

  if (
    /(?:\bfirst\b|\b1st\b|\b#?1\b|\u7b2c\s*1\s*\u4e2a|\u7b2c\u4e00\u4e2a|\u7b2c\s*\u4e00\s*\u4e2a)/.test(prompt)
  ) {
    return 0;
  }

  if (
    /(?:\bsecond\b|\b2nd\b|\b#?2\b|\u7b2c\s*2\s*\u4e2a|\u7b2c\u4e8c\u4e2a|\u7b2c\s*\u4e8c\s*\u4e2a)/.test(prompt)
  ) {
    return total > 1 ? 1 : 0;
  }

  if (
    /(?:\bthird\b|\b3rd\b|\b#?3\b|\u7b2c\s*3\s*\u4e2a|\u7b2c\u4e09\u4e2a|\u7b2c\s*\u4e09\s*\u4e2a)/.test(prompt)
  ) {
    return total > 2 ? 2 : total - 1;
  }

  if (/(?:\blast\b|\u6700\u540e\u4e00\u4e2a)/.test(prompt)) {
    return total - 1;
  }

  return null;
};

const getLatestReferencedIds = (conversation: BistroAiRequest["conversation"] = []) => {
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const turn = conversation[index];
    if (turn.role !== "assistant") {
      continue;
    }

    const referencedIds =
      turn.referencedItemIds?.filter((itemId) => menuById.has(itemId)) ??
      turn.suggestedItemIds?.filter((itemId) => menuById.has(itemId)) ??
      [];

    if (referencedIds.length > 0) {
      return unique(referencedIds);
    }
  }

  return [];
};

const getLatestSuggestedIds = (conversation: BistroAiRequest["conversation"] = []) => {
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const turn = conversation[index];
    if (turn.role !== "assistant") {
      continue;
    }

    const suggestedIds = turn.suggestedItemIds?.filter((itemId) => menuById.has(itemId)) ?? [];
    if (suggestedIds.length > 0) {
      return unique(suggestedIds);
    }
  }

  return [];
};

const getLatestAssistantTurn = (conversation: BistroAiRequest["conversation"] = []) => {
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const turn = conversation[index];
    if (turn.role === "assistant") {
      return turn;
    }
  }

  return null;
};

const isCartEditIntent = (
  intent: BistroAiIntent | null | undefined,
): intent is "add_items" | "update_items" | "remove_items" =>
  intent === "add_items" ||
  intent === "update_items" ||
  intent === "remove_items";

const matchesClarificationOption = (
  prompt: string,
  conversationTurn: NonNullable<ReturnType<typeof getLatestAssistantTurn>>,
) =>
  (conversationTurn.clarificationOptions ?? []).some((option) => {
    const normalizedLabel = normalizeText(option.label);
    const normalizedOptionPrompt = normalizeText(option.prompt);
    return normalizedLabel === prompt || normalizedOptionPrompt === prompt;
  });

const resolveClarificationFollowUpIntent = (request: BistroAiRequest, prompt: string) => {
  const latestAssistantTurn = getLatestAssistantTurn(request.conversation);
  if (!latestAssistantTurn?.command || latestAssistantTurn.command.state !== "needs_clarification") {
    return null;
  }

  if (!isCartEditIntent(latestAssistantTurn.command.intent)) {
    return null;
  }

  const waitingFor = latestAssistantTurn.missingSlots ?? [];
  const expectsItem = waitingFor.length === 0 || waitingFor.includes("item");
  const expectsQuantity = waitingFor.includes("quantity");
  const expectsSpiceLevel = waitingFor.includes("spice_level");
  const resolvedContextItemIds = resolveContextualItemIds(request, prompt);
  const quantity = extractRequestedQuantity(prompt);
  const modifierTargetItemId = latestAssistantTurn.actions?.find(isAddAction)?.itemId;
  const answeredWithItem =
    (expectsItem && resolvedContextItemIds.length > 0) ||
    matchesClarificationOption(prompt, latestAssistantTurn);
  const answeredWithQuantity = expectsQuantity && quantity !== null;
  const answeredWithSpiceLevel =
    expectsSpiceLevel &&
    (matchesClarificationOption(prompt, latestAssistantTurn) ||
      detectPromptSpiceLevel(prompt) !== undefined ||
      (modifierTargetItemId ? (detectPromptAddOnIds(prompt, modifierTargetItemId)?.length ?? 0) > 0 : false));

  return answeredWithItem || answeredWithQuantity || answeredWithSpiceLevel
    ? latestAssistantTurn.command.intent
    : null;
};

const getSelectionSourceIds = (request: BistroAiRequest, source: BistroAiSelectionPlan["source"]) => {
  switch (source) {
    case "recent_referenced_items":
      return getLatestReferencedIds(request.conversation);
    case "recent_suggested_items":
      return getLatestSuggestedIds(request.conversation);
    case "current_cart":
      return unique(request.cartItems.map((item) => item.itemId).filter((itemId) => menuById.has(itemId)));
    case "menu":
    default:
      return menuItems.map((item) => item.id);
  }
};

const scoreReferencedCandidates = (prompt: string, candidateIds: string[]) => {
  const candidateSet = new Set(candidateIds);

  return scoreRecommendation(prompt)
    .filter((entry) => candidateSet.has(entry.item.id))
    .map((entry) => ({
      itemId: entry.item.id,
      score: entry.score,
    }));
};

const replyMentionsItem = (normalizedReply: string, itemId: string) => {
  const item = menuById.get(itemId);
  if (!item) {
    return false;
  }

  const normalizedName = normalizeText(item.name);
  const withoutCategory = normalizeText(item.name.replace(/ roll$/i, "").replace(/ ramen$/i, ""));

  return normalizedReply.includes(normalizedName) || (withoutCategory.length > 0 && normalizedReply.includes(withoutCategory));
};

const replyMentionsResolvedItems = (reply: string, itemIds: string[]) => {
  const normalizedReply = normalizeText(reply);
  if (!normalizedReply) {
    return false;
  }

  return itemIds.some((itemId) => replyMentionsItem(normalizedReply, itemId));
};

const replyMentionsAllResolvedItems = (reply: string, itemIds: string[]) => {
  const normalizedReply = normalizeText(reply);
  if (!normalizedReply || itemIds.length === 0) {
    return false;
  }

  return itemIds.every((itemId) => replyMentionsItem(normalizedReply, itemId));
};

const resolveSelectionPlan = (request: BistroAiRequest, plan: BistroAiSelectionPlan | null | undefined) => {
  if (!plan) {
    return [];
  }

  const sourceIds = getSelectionSourceIds(request, plan.source);
  const normalizedPlanQuery = plan.query ? normalizeText(plan.query) : "";
  const ordinalFromPlanQuery = extractOrdinalIndex(normalizedPlanQuery, sourceIds.length);
  if (ordinalFromPlanQuery !== null && sourceIds[ordinalFromPlanQuery]) {
    return [sourceIds[ordinalFromPlanQuery]];
  }

  const sourceOrder = new Map(sourceIds.map((itemId, index) => [itemId, index]));
  const requestedIds = unique((plan.itemIds ?? []).filter((itemId) => menuById.has(itemId)));

  let candidates = sourceIds
    .map((itemId) => menuById.get(itemId))
    .filter((item): item is MenuItem => Boolean(item));

  if (candidates.length === 0 && requestedIds.length > 0) {
    candidates = requestedIds
      .map((itemId) => menuById.get(itemId))
      .filter((item): item is MenuItem => Boolean(item));
  }

  if (requestedIds.length > 0) {
    const requestedSet = new Set(requestedIds);
    candidates = candidates.filter((item) => requestedSet.has(item.id));

    if (candidates.length === 0) {
      candidates = requestedIds
        .map((itemId) => menuById.get(itemId))
        .filter((item): item is MenuItem => Boolean(item));
    }
  }

  if (plan.category) {
    const categoryMatches = candidates.filter((item) => item.category === plan.category);
    if (categoryMatches.length > 0) {
      candidates = categoryMatches;
    }
  }

  if (plan.spiceLevel) {
    const spiceMatches = candidates.filter((item) =>
      item.spiceLevels?.some((level) => level.toLowerCase() === plan.spiceLevel?.toLowerCase()),
    );
    if (spiceMatches.length > 0) {
      candidates = spiceMatches;
    }
  }

  if (candidates.length === 0) {
    return [];
  }

  const normalizedQuery = normalizedPlanQuery;
  const matchedQueryItems = normalizedQuery ? new Set(findItemMatches(normalizedQuery).map((match) => match.itemId)) : new Set<string>();
  const recommendationScores = normalizedQuery
    ? new Map(scoreRecommendation(normalizedQuery).map((entry) => [entry.item.id, entry.score]))
    : new Map<string, number>();
  const requestedSet = new Set(requestedIds);
  const normalizedTags = (plan.tags ?? []).map((tag) => tag.toLowerCase());

  let scoredCandidates = candidates.map((item) => {
    let relevance = 0;

    if (requestedSet.has(item.id)) {
      relevance += 100;
    }

    if (matchedQueryItems.has(item.id)) {
      relevance += 80;
    }

    relevance += recommendationScores.get(item.id) ?? 0;

    if (normalizedTags.length > 0) {
      const matchedTags = item.tags.filter((tag) => normalizedTags.includes(tag.toLowerCase())).length;
      relevance += matchedTags * 6;
    }

    return {
      item,
      relevance,
      sourceIndex: sourceOrder.get(item.id) ?? Number.MAX_SAFE_INTEGER,
    };
  });

  const shouldFilterToPositiveMatches =
    requestedIds.length === 0 &&
    (normalizedTags.length > 0 || (normalizedQuery.length > 0 && !isStructuralSelectionQuery(normalizedQuery)));

  if (shouldFilterToPositiveMatches) {
    const positiveMatches = scoredCandidates.filter((entry) => entry.relevance > 0);
    if (positiveMatches.length > 0) {
      scoredCandidates = positiveMatches;
    }
  }

  if (plan.sortBy === "price") {
    scoredCandidates.sort((left, right) => {
      const priceDelta =
        plan.sortDirection === "desc" ? right.item.price - left.item.price : left.item.price - right.item.price;

      return priceDelta || right.relevance - left.relevance || left.sourceIndex - right.sourceIndex;
    });
  } else if (scoredCandidates.some((entry) => entry.relevance > 0)) {
    scoredCandidates.sort((left, right) => {
      const relevanceDelta = right.relevance - left.relevance;
      if (relevanceDelta !== 0) {
        return relevanceDelta;
      }

      if (plan.sortDirection === "desc") {
        return right.item.price - left.item.price || left.sourceIndex - right.sourceIndex;
      }

      return left.sourceIndex - right.sourceIndex || left.item.price - right.item.price;
    });
  } else if (plan.sortBy === "relevance" && plan.sortDirection === "desc") {
    scoredCandidates.sort((left, right) => right.item.price - left.item.price || left.sourceIndex - right.sourceIndex);
  } else {
    scoredCandidates.sort((left, right) => left.sourceIndex - right.sourceIndex || left.item.price - right.item.price);
  }

  return unique(scoredCandidates.slice(0, Math.max(1, plan.take ?? 1)).map((entry) => entry.item.id));
};

const resolveActionsFromSelectionPlan = (
  intent: BistroAiIntent,
  request: BistroAiRequest,
  plan: BistroAiSelectionPlan | null | undefined,
) => {
  const resolvedItemIds = resolveSelectionPlan(request, plan);
  if (resolvedItemIds.length === 0) {
    return [];
  }

  switch (intent) {
    case "add_items":
      return resolvedItemIds.map((itemId) => ({
        type: "add_item" as const,
        addOnIds: plan?.addOnIds,
        itemId,
        quantity: Math.max(1, plan?.quantity ?? 1),
        spiceLevel: plan?.spiceLevel,
      }));
    case "update_items":
      return resolvedItemIds
        .filter((itemId) => request.cartItems.some((item) => item.itemId === itemId))
        .map((itemId) => ({
          type: "set_quantity" as const,
          addOnIds: plan?.addOnIds,
          itemId,
          quantity: Math.max(1, plan?.quantity ?? 1),
          spiceLevel: plan?.spiceLevel,
        }));
    case "remove_items":
      return resolvedItemIds
        .filter((itemId) => request.cartItems.some((item) => item.itemId === itemId))
        .map((itemId) => ({
          type: "remove_item" as const,
          addOnIds: plan?.addOnIds,
          itemId,
          spiceLevel: plan?.spiceLevel,
        }));
    default:
      return [];
  }
};

const getLatestAssistantSelectionIds = (request: BistroAiRequest) => {
  const latestReferencedIds = getLatestReferencedIds(request.conversation);
  if (latestReferencedIds.length > 0) {
    return latestReferencedIds;
  }

  return getLatestSuggestedIds(request.conversation);
};

const hasHeavyRecommendationOverlap = (currentItemIds: string[], previousItemIds: string[]) => {
  if (currentItemIds.length === 0 || previousItemIds.length === 0) {
    return false;
  }

  const previousSet = new Set(previousItemIds);
  const overlapCount = currentItemIds.filter((itemId) => previousSet.has(itemId)).length;
  return overlapCount >= Math.min(currentItemIds.length, previousItemIds.length, 2);
};

const asksForAppetizerCategory = (prompt: string) =>
  prompt.includes("appetizer") || prompt.includes("\u524d\u83dc") || prompt.includes("\u5c0f\u5403");

const asksForRollCategory = (prompt: string) =>
  prompt.includes("roll") || prompt.includes("sushi") || prompt.includes("\u5bff\u53f8") || prompt.includes("\u5377");

const asksForRamenCategory = (prompt: string) =>
  prompt.includes("ramen") || prompt.includes("\u62c9\u9762");

const asksForSaladCategory = (prompt: string) =>
  prompt.includes("salad") || prompt.includes("\u6c99\u62c9");

const asksForMainCategory = (prompt: string) =>
  prompt.includes("main") ||
  prompt.includes("main dish") ||
  prompt.includes("\u4e3b\u83dc") ||
  /\bentree?s?\b/.test(prompt) ||
  /\bentrées?\b/.test(prompt) ||
  (asksForAppetizerCategory(prompt) && /\bdish(?:es)?\b/.test(prompt));

const extractRequestedRecommendationGroups = (prompt: string): RecommendationGroup[] => {
  const groups = new Set<RecommendationGroup>();

  if (asksForRollCategory(prompt)) {
    groups.add("rolls");
  }

  if (asksForRamenCategory(prompt)) {
    groups.add("ramen");
  }

  if (asksForAppetizerCategory(prompt)) {
    groups.add("appetizers");
  }

  if (asksForSaladCategory(prompt)) {
    groups.add("salads");
  }

  if (asksForMainCategory(prompt)) {
    groups.add("main");
  }

  return [...groups];
};

const recommendationGroupsToCategories = (groups: RecommendationGroup[]): MenuItem["category"][] => {
  const categories = new Set<MenuItem["category"]>();

  groups.forEach((group) => {
    if (group === "main") {
      categories.add("rolls");
      categories.add("ramen");
      return;
    }

    categories.add(group);
  });

  return [...categories];
};

const itemMatchesRecommendationGroup = (item: MenuItem, group: RecommendationGroup) =>
  group === "main" ? item.category === "rolls" || item.category === "ramen" : item.category === group;

const suggestionSetMatchesRequestedGroups = (itemIds: string[], groups: RecommendationGroup[]) => {
  if (groups.length === 0) {
    return true;
  }

  const resolvedItems = itemIds
    .map((itemId) => menuById.get(itemId))
    .filter((item): item is MenuItem => Boolean(item));

  if (resolvedItems.length === 0) {
    return false;
  }

  const allItemsStayInRequestedGroups = resolvedItems.every((item) =>
    groups.some((group) => itemMatchesRecommendationGroup(item, group)),
  );
  const everyRequestedGroupIsCovered = groups.every((group) =>
    resolvedItems.some((item) => itemMatchesRecommendationGroup(item, group)),
  );

  return allItemsStayInRequestedGroups && everyRequestedGroupIsCovered;
};

const buildRecommendationCandidates = (
  prompt: string,
  groups: RecommendationGroup[],
  excludedItemIds: string[] = [],
) => {
  const scoreMap = new Map(scoreRecommendation(prompt).map((entry) => [entry.item.id, entry.score]));
  const excludedSet = new Set(excludedItemIds);

  return menuItems
    .filter((item) => !excludedSet.has(item.id))
    .filter((item) => groups.length === 0 || groups.some((group) => itemMatchesRecommendationGroup(item, group)))
    .sort(
      (left, right) =>
        (scoreMap.get(right.id) ?? 0) - (scoreMap.get(left.id) ?? 0) ||
        left.price - right.price ||
        left.name.localeCompare(right.name),
    );
};

const repairSuggestedRecommendations = (
  prompt: string,
  currentSuggestedItemIds: string[],
  excludedItemIds: string[] = [],
) => {
  const requestedGroups = extractRequestedRecommendationGroups(prompt);
  if (requestedGroups.length === 0) {
    return currentSuggestedItemIds;
  }

  const candidates = buildRecommendationCandidates(prompt, requestedGroups, excludedItemIds);
  const filteredCurrentSuggestions = currentSuggestedItemIds.filter((itemId) => {
    const item = menuById.get(itemId);
    return item ? requestedGroups.some((group) => itemMatchesRecommendationGroup(item, group)) : false;
  });
  const chosen: string[] = [];
  const chosenSet = new Set<string>();

  requestedGroups.forEach((group) => {
    const currentMatch = filteredCurrentSuggestions.find((itemId) => {
      if (chosenSet.has(itemId)) {
        return false;
      }

      const item = menuById.get(itemId);
      return item ? itemMatchesRecommendationGroup(item, group) : false;
    });

    if (currentMatch) {
      chosen.push(currentMatch);
      chosenSet.add(currentMatch);
      return;
    }

    const candidate = candidates.find((item) => itemMatchesRecommendationGroup(item, group) && !chosenSet.has(item.id));
    if (!candidate) {
      return;
    }

    chosen.push(candidate.id);
    chosenSet.add(candidate.id);
  });

  filteredCurrentSuggestions.forEach((itemId) => {
    if (chosen.length >= 3 || chosenSet.has(itemId)) {
      return;
    }

    chosen.push(itemId);
    chosenSet.add(itemId);
  });

  candidates.forEach((item) => {
    if (chosen.length >= 3 || chosenSet.has(item.id)) {
      return;
    }

    chosen.push(item.id);
    chosenSet.add(item.id);
  });

  return chosen.slice(0, 3);
};

const extractRequestedCategories = (prompt: string) => {
  const categories = recommendationGroupsToCategories(extractRequestedRecommendationGroups(prompt));
  return categories.length > 0 ? categories : null;
};

const sumItemIdsTotal = (itemIds: string[]) =>
  itemIds.reduce((total, itemId) => total + (menuById.get(itemId)?.price ?? 0), 0);

const doesActionSetMeetBudget = (actions: BistroAiAction[], constraint: BudgetConstraint) => {
  if (actions.length === 0) {
    return false;
  }

  const total = actions.reduce((sum, action) => {
    if (action.type !== "add_item") {
      return sum;
    }

    const itemPrice = menuById.get(action.itemId)?.price ?? 0;
    return sum + itemPrice * Math.max(1, action.quantity);
  }, 0);

  if (total > constraint.maxTotal) {
    return false;
  }

  if (constraint.itemCount !== null) {
    const quantityCount = actions.reduce(
      (sum, action) => sum + (action.type === "add_item" ? Math.max(1, action.quantity) : 0),
      0,
    );

    if (quantityCount !== constraint.itemCount) {
      return false;
    }
  }

  return true;
};

const buildBudgetActions = (itemIds: string[]): BistroAiAction[] =>
  itemIds.map((itemId) => ({
    type: "add_item" as const,
    itemId,
    quantity: 1,
  }));

const resolveBudgetSelection = (request: BistroAiRequest, prompt: string, constraint: BudgetConstraint): BudgetSelection | null => {
  const requestedCategories = extractRequestedCategories(prompt);
  const directMatchIds = new Set(findItemMatches(prompt).map((match) => match.itemId));
  const recentSuggestedIds = getLatestSuggestedIds(request.conversation);
  const recentSuggestedSet = new Set(recentSuggestedIds);
  const recentSelectionIds = getLatestAssistantSelectionIds(request);
  const recentSelectionSet = new Set(recentSelectionIds);
  const recentCategorySet = new Set(
    recentSelectionIds
      .map((itemId) => menuById.get(itemId)?.category)
      .filter((category): category is MenuItem["category"] => Boolean(category)),
  );
  const scoreMap = new Map(scoreRecommendation(prompt).map((entry) => [entry.item.id, entry.score]));

  const targetCount =
    constraint.itemCount ??
    (constraint.isComplaint && recentSelectionIds.length > 0
      ? Math.min(3, recentSelectionIds.length)
      : 2);

  if (targetCount <= 0) {
    return null;
  }

  const candidates = menuItems.filter((item) =>
    requestedCategories ? requestedCategories.includes(item.category) : true,
  );

  if (candidates.length < targetCount) {
    return null;
  }

  let best:
    | {
        itemIds: string[];
        total: number;
        relevance: number;
        categoryCoverage: number;
      }
    | null = null;

  const visit = (startIndex: number, chosen: MenuItem[], runningTotal: number) => {
    if (chosen.length === targetCount) {
      if (runningTotal > constraint.maxTotal) {
        return;
      }

      const itemIds = chosen.map((item) => item.id);
      const relevance = chosen.reduce((sum, item) => {
        let score = scoreMap.get(item.id) ?? 0;

        if (directMatchIds.has(item.id)) {
          score += 80;
        }

        if (recentSuggestedSet.has(item.id)) {
          score += 12;
        }

        if (recentSelectionSet.has(item.id)) {
          score += 14;
        }

        if (recentCategorySet.has(item.category)) {
          score += 4;
        }

        if (item.featured) {
          score += 1;
        }

        return sum + score;
      }, 0);

      const categoryCoverage = new Set(
        chosen
          .map((item) => item.category)
          .filter((category) => recentCategorySet.has(category)),
      ).size;

      if (
        !best ||
        relevance > best.relevance ||
        (relevance === best.relevance && categoryCoverage > best.categoryCoverage) ||
        (relevance === best.relevance &&
          categoryCoverage === best.categoryCoverage &&
          runningTotal > best.total)
      ) {
        best = {
          itemIds,
          total: runningTotal,
          relevance,
          categoryCoverage,
        };
      }

      return;
    }

    for (let index = startIndex; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const nextTotal = runningTotal + candidate.price;
      if (nextTotal > constraint.maxTotal) {
        continue;
      }

      chosen.push(candidate);
      visit(index + 1, chosen, nextTotal);
      chosen.pop();
    }
  };

  visit(0, [], 0);

  if (!best) {
    return null;
  }

  const resolvedBest = best as {
    itemIds: string[];
    total: number;
    relevance: number;
    categoryCoverage: number;
  };

  return {
    itemIds: resolvedBest.itemIds,
    total: resolvedBest.total,
    targetCount,
  };
};

const pickByPrice = (candidateIds: string[], direction: "asc" | "desc") => {
  const candidates = candidateIds
    .map((itemId) => menuById.get(itemId))
    .filter((item): item is MenuItem => Boolean(item));

  if (candidates.length === 0) {
    return [];
  }

  candidates.sort((left, right) =>
    direction === "asc" ? left.price - right.price || left.name.localeCompare(right.name) : right.price - left.price || left.name.localeCompare(right.name),
  );

  return [candidates[0].id];
};

const resolveContextualItemIds = (request: BistroAiRequest, prompt: string) => {
  const directMatches = unique(findItemMatches(prompt).map((match) => match.itemId));
  const latestReferencedIds = getLatestReferencedIds(request.conversation);
  const latestAssistantTurn = getLatestAssistantTurn(request.conversation);
  const ordinalIndex = extractOrdinalIndex(prompt, latestReferencedIds.length);
  const clarificationTargetItemId =
    latestAssistantTurn?.command?.state === "needs_clarification" &&
    latestAssistantTurn.missingSlots?.includes("spice_level") &&
    latestReferencedIds.length === 1
      ? latestReferencedIds[0]
      : null;
  const clarificationReplyLooksLikeModifiers =
    clarificationTargetItemId !== null &&
    (detectPromptSpiceLevel(prompt) !== undefined ||
      (detectPromptAddOnIds(prompt, clarificationTargetItemId)?.length ?? 0) > 0);

  if (ordinalIndex !== null && latestReferencedIds[ordinalIndex]) {
    return [latestReferencedIds[ordinalIndex]];
  }

  if (clarificationReplyLooksLikeModifiers && clarificationTargetItemId) {
    return [clarificationTargetItemId];
  }

  if (directMatches.length > 0) {
    return directMatches;
  }

  if (latestReferencedIds.length === 0) {
    return [];
  }

  if (latestReferencedIds.length === 1 && latestAssistantTurn?.command?.state === "needs_clarification") {
    return latestReferencedIds;
  }

  if (asksForCheapest(prompt)) {
    return pickByPrice(latestReferencedIds, "asc");
  }

  if (asksForPriciest(prompt)) {
    return pickByPrice(latestReferencedIds, "desc");
  }

  if (includesAny(prompt, allReferenceHints)) {
    return latestReferencedIds;
  }

  if (hasReferenceHint(prompt)) {
    const rankedCandidates = scoreReferencedCandidates(prompt, latestReferencedIds);
    if (rankedCandidates.length > 0) {
      const [topCandidate, secondCandidate] = rankedCandidates;
      if (topCandidate.score > 0 && (!secondCandidate || topCandidate.score > secondCandidate.score)) {
        return [topCandidate.itemId];
      }
    }

    return latestReferencedIds.length === 1 ? [latestReferencedIds[0]] : [];
  }

  return [];
};

const normalizeIntent = (intent: BistroAiResponse["intent"] | undefined, response: BistroAiResponse): BistroAiIntent => {
  if (intent) {
    return intent;
  }

  if (response.actions.some((action) => action.type === "clear_cart")) {
    return "clear_cart";
  }

  if (response.actions.some((action) => action.type === "set_quantity")) {
    return "update_items";
  }

  if (response.actions.some((action) => action.type === "remove_item")) {
    return "remove_items";
  }

  if (response.actions.some((action) => action.type === "add_item")) {
    return "add_items";
  }

  if (response.suggestedItemIds.length > 0) {
    return "recommend_items";
  }

  if (response.referencedItemIds.length > 0) {
    return "explain_items";
  }

  return "answer_question";
};

const sanitizeSuggestedItemIds = (itemIds: string[]) =>
  unique(itemIds.filter((itemId) => typeof itemId === "string" && menuById.has(itemId)));

const sanitizeUnavailableRequests = (requests: string[]) =>
  unique(
    requests
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(
        (entry) =>
          entry.length > 0 &&
          !menuById.has(entry) &&
          !menuNameSet.has(normalizeText(entry)),
      ),
  );

const sanitizeMissingSlots = (missingSlots: BistroAiResponse["missingSlots"] | undefined) =>
  unique(
    (missingSlots ?? []).filter(
      (slot): slot is BistroAiMissingSlot =>
        slot === "item" || slot === "quantity" || slot === "spice_level",
    ),
  );

const sanitizeClarificationOptions = (
  clarificationOptions: BistroAiResponse["clarificationOptions"] | undefined,
) => {
  const seen = new Set<string>();
  const normalized: BistroAiClarificationOption[] = [];

  (clarificationOptions ?? []).forEach((option) => {
    const label = typeof option?.label === "string" ? option.label.trim() : "";
    const prompt = typeof option?.prompt === "string" ? option.prompt.trim() : "";
    if (!label || !prompt) {
      return;
    }

    const dedupeKey = `${label.toLowerCase()}::${prompt.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    normalized.push({ label, prompt });
  });

  return normalized.slice(0, 4);
};

const editDistance = (left: string, right: string) => {
  if (left === right) {
    return 0;
  }

  const matrix = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));

  for (let row = 0; row <= left.length; row += 1) {
    matrix[row][0] = row;
  }

  for (let column = 0; column <= right.length; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      );
    }
  }

  return matrix[left.length][right.length];
};

const tokensAreClose = (left: string, right: string) => {
  const maxDistance = Math.max(left.length, right.length) >= 6 ? 2 : 1;
  return editDistance(left, right) <= maxDistance;
};

const extractClarificationSubject = (value: string) => {
  const tokens = normalizeText(value)
    .split(" ")
    .filter(
      (token) =>
        token.length > 0 && parseCountToken(token) === null && !clarificationStopTokens.has(token),
    );

  if (tokens.length > 0) {
    return tokens.join(" ");
  }

  return value.trim().replace(/[.?!]+$/g, "");
};

const findClarificationCandidates = (
  query: string,
  options?: {
    preferredItemIds?: string[];
    candidateItemIds?: string[];
    limit?: number;
  },
) => {
  const directMatches = findItemMatches(query).map((match) => match.itemId);
  if (directMatches.length > 0) {
    return unique(directMatches).slice(0, Math.max(1, options?.limit ?? 4));
  }

  const normalizedQuery = normalizeText(query);
  const queryTokens = extractClarificationSubject(query)
    .split(" ")
    .filter((token) => token.length > 0);
  const preferredSet = new Set(options?.preferredItemIds ?? []);
  const candidateSet = options?.candidateItemIds ? new Set(options.candidateItemIds) : null;
  const limit = Math.max(1, options?.limit ?? 4);

  if (!normalizedQuery && queryTokens.length === 0) {
    return [];
  }

  return menuItems
    .filter((item) => !candidateSet || candidateSet.has(item.id))
    .map((item) => {
      const normalizedName = normalizeText(item.name);
      const nameTokens = normalizedName.split(" ").filter((token) => token.length > 0);
      const searchText = normalizeText(`${item.name} ${item.description} ${item.tags.join(" ")} ${item.category}`);
      const searchTokens = searchText.split(" ").filter((token) => token.length > 0);
      let score = 0;

      if (normalizedQuery && normalizedName.includes(normalizedQuery)) {
        score += 18;
      } else if (normalizedQuery && searchText.includes(normalizedQuery)) {
        score += 10;
      }

      queryTokens.forEach((token) => {
        if (nameTokens.some((candidate) => candidate === token)) {
          score += 7;
          return;
        }

        if (nameTokens.some((candidate) => candidate.includes(token) || token.includes(candidate))) {
          score += 5;
          return;
        }

        if (nameTokens.some((candidate) => tokensAreClose(candidate, token))) {
          score += 4;
          return;
        }

        if (searchTokens.some((candidate) => candidate === token)) {
          score += 2;
          return;
        }

        if (searchTokens.some((candidate) => candidate.length > 2 && tokensAreClose(candidate, token))) {
          score += 1;
        }
      });

      if (preferredSet.has(item.id)) {
        score += 2;
      }

      return {
        itemId: item.id,
        featured: item.featured ? 1 : 0,
        name: item.name,
        price: item.price,
        score,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.featured - left.featured ||
        left.price - right.price ||
        left.name.localeCompare(right.name),
    )
    .slice(0, limit)
    .map((entry) => entry.itemId);
};

const formatAddPromptSegment = (itemId: string, quantity: number, preferChinese: boolean) => {
  const itemName = menuById.get(itemId)?.name ?? itemId;
  return preferChinese ? `${quantity} \u4efd ${itemName}` : `${quantity} ${itemName}`;
};

const localizedSpiceLabel = (level: string, preferChinese: boolean) => {
  if (!preferChinese) {
    return level;
  }

  switch (level) {
    case "Mild":
      return "\u5fae\u8fa3";
    case "Medium":
      return "\u4e2d\u8fa3";
    case "Spicy":
      return "\u8fa3";
    default:
      return level;
  }
};

const buildItemClarificationPrompt = ({
  intent,
  itemId,
  preferChinese,
  quantity,
  existingAddActions = [],
}: {
  intent: BistroAiIntent;
  itemId: string;
  preferChinese: boolean;
  quantity: number;
  existingAddActions?: Extract<BistroAiAction, { type: "add_item" }>[];
}) => {
  const itemName = menuById.get(itemId)?.name ?? itemId;

  if (intent === "add_items") {
    const addSegments = [
      ...existingAddActions.map((action) =>
        formatAddPromptSegment(action.itemId, Math.max(1, action.quantity), preferChinese),
      ),
      formatAddPromptSegment(itemId, Math.max(1, quantity), preferChinese),
    ];

    return preferChinese
      ? `\u5e2e\u6211\u52a0 ${addSegments.join(" \u548c ")}`
      : `Add ${addSegments.join(" and ")}.`;
  }

  if (intent === "remove_items") {
    return preferChinese
      ? `\u5e2e\u6211\u79fb\u9664 ${itemName}`
      : `Remove ${itemName}.`;
  }

  return preferChinese
    ? `\u628a ${itemName} \u6539\u6210 ${Math.max(1, quantity)} \u4efd`
    : `Change ${itemName} to ${Math.max(1, quantity)}.`;
};

const buildItemClarificationOptions = ({
  candidateItemIds,
  existingAddActions = [],
  intent,
  preferChinese,
  quantity,
}: {
  candidateItemIds: string[];
  existingAddActions?: Extract<BistroAiAction, { type: "add_item" }>[];
  intent: BistroAiIntent;
  preferChinese: boolean;
  quantity: number;
}) =>
  sanitizeClarificationOptions(
    candidateItemIds.map((itemId) => ({
      label: menuById.get(itemId)?.name ?? itemId,
      prompt: buildItemClarificationPrompt({
        intent,
        itemId,
        preferChinese,
        quantity,
        existingAddActions,
      }),
    })),
  );

const buildQuantityClarificationOptions = (itemId: string, preferChinese: boolean, currentQuantity?: number) => {
  const quantities =
    currentQuantity && currentQuantity > 1
      ? unique([Math.max(1, currentQuantity - 1), currentQuantity, currentQuantity + 1])
      : [1, 2, 3];

  return sanitizeClarificationOptions(
    quantities.slice(0, 3).map((quantity) => ({
      label: preferChinese ? `${quantity} \u4efd` : `${quantity}`,
      prompt: buildItemClarificationPrompt({
        intent: "update_items",
        itemId,
        preferChinese,
        quantity,
      }),
      })),
  );
};

const buildAddActionPrompt = (
  action: Extract<BistroAiAction, { type: "add_item" }>,
  preferChinese: boolean,
) => {
  const item = menuById.get(action.itemId);
  const itemName = item?.name ?? action.itemId;
  const addOnNames = resolveActionAddOnNames(item, action.addOnIds);

  if (preferChinese) {
    const modifierParts = [
      action.spiceLevel ? localizedSpiceLabel(action.spiceLevel, true) : null,
      addOnNames.length > 0 ? `\u52a0 ${addOnNames.join("\u3001")}` : null,
    ].filter((part): part is string => Boolean(part));

    return `\u5e2e\u6211\u52a0 ${action.quantity} \u4efd ${itemName}${modifierParts.length > 0 ? `\uff0c${modifierParts.join("\uff0c")}` : ""}`;
  }

  const modifierText = [
    action.spiceLevel ? action.spiceLevel.toLowerCase() : null,
    addOnNames.length > 0 ? `with ${addOnNames.join(" and ")}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");

  return `Add ${action.quantity} ${itemName}${modifierText ? ` ${modifierText}` : ""}.`;
};

const buildSpiceClarificationOptions = (
  action: Extract<BistroAiAction, { type: "add_item" }>,
  preferChinese: boolean,
) => {
  const item = menuById.get(action.itemId);
  if (!item?.spiceLevels?.length) {
    return [];
  }

  return sanitizeClarificationOptions(
    item.spiceLevels.map((spiceLevel) => ({
      label: localizedSpiceLabel(spiceLevel, preferChinese),
      prompt: buildAddActionPrompt(
        {
          ...action,
          spiceLevel,
        },
        preferChinese,
      ),
    })),
  );
};

const sanitizeActions = (actions: BistroAiAction[], cartItems: BistroAiRequest["cartItems"]) => {
  const normalized: BistroAiAction[] = [];

  actions.forEach((action) => {
    switch (action.type) {
      case "add_item": {
        const item = menuById.get(action.itemId);
        if (!item) {
          return;
        }

        const quantity = Number.isFinite(action.quantity) ? Math.max(1, Math.round(action.quantity)) : 1;
        normalized.push({
          ...action,
          addOnIds: normalizeActionAddOnIds(item, action.addOnIds),
          quantity,
          spiceLevel: normalizeActionSpiceLevel(item, action.spiceLevel),
        });
        return;
      }
      case "set_quantity": {
        const item = menuById.get(action.itemId);
        if (!item) {
          return;
        }

        const sanitizedAction = {
          ...action,
          addOnIds: normalizeActionAddOnIds(item, action.addOnIds),
          spiceLevel: normalizeActionSpiceLevel(item, action.spiceLevel),
        };

        if (!resolveSetQuantityTarget(cartItems, sanitizedAction)) {
          return;
        }

        const quantity = Number.isFinite(action.quantity) ? Math.max(1, Math.round(action.quantity)) : 1;
        normalized.push({
          ...sanitizedAction,
          quantity,
        });
        return;
      }
      case "remove_item": {
        const item = menuById.get(action.itemId);
        if (!item) {
          return;
        }

        const sanitizedAction = {
          ...action,
          addOnIds: normalizeActionAddOnIds(item, action.addOnIds),
          spiceLevel: normalizeActionSpiceLevel(item, action.spiceLevel),
        };

        if (!cartItems.some((cartItem) => matchesActionCartVariant(cartItem, sanitizedAction))) {
          return;
        }

        normalized.push(sanitizedAction);
        return;
      }
      case "clear_cart": {
        if (cartItems.length === 0) {
          return;
        }

        normalized.push(action);
      }
    }
  });

  return dedupeActions(normalized);
};

const inferActionsFromPrompt = (intent: BistroAiIntent, request: BistroAiRequest): BistroAiAction[] => {
  const prompt = normalizeText(request.prompt);
  const latestReferencedIds = getLatestReferencedIds(request.conversation);
  const latestAssistantTurn = getLatestAssistantTurn(request.conversation);
  const contextualItemIds = resolveContextualItemIds(request, prompt);
  const pendingAddActions =
    latestAssistantTurn?.command?.state === "needs_clarification" && latestAssistantTurn.command.intent === "add_items"
      ? (latestAssistantTurn.actions ?? []).filter(isAddAction)
      : [];
  const pendingAddActionMap = new Map(pendingAddActions.map((action) => [action.itemId, action]));
  const clarificationTargetItemId =
    latestAssistantTurn?.command?.state === "needs_clarification" &&
    latestAssistantTurn.missingSlots?.includes("spice_level") &&
    latestReferencedIds.length === 1
      ? latestReferencedIds[0]
      : null;
  const clarificationReplyLooksLikeModifiers =
    clarificationTargetItemId !== null &&
    (detectPromptSpiceLevel(prompt) !== undefined ||
      (detectPromptAddOnIds(prompt, clarificationTargetItemId)?.length ?? 0) > 0);
  const preferredItemIds =
    latestReferencedIds.length > 0 ? latestReferencedIds : contextualItemIds;
  const directMentionMatches = clarificationReplyLooksLikeModifiers
    ? []
    : resolveMenuMentions(prompt, { preferredItemIds }).matches;
  const cartResolutionItemIds = findCartRemovalMatches(prompt, request.cartItems);
  const directMatchMap = new Map(directMentionMatches.map((match) => [match.itemId, match]));
  const directlyMentionedItemIds = new Set(directMentionMatches.map((match) => match.itemId));
  const cartTargetItemIds = resolveCartTargetItemIds({
    cartItems: request.cartItems,
    cartResolutionItemIds,
    contextualItemIds,
    directMentionMatches,
  });
  const reductionQuantity = extractRequestedQuantityReduction(prompt);
  const explicitQuantity = extractRequestedQuantity(prompt);

  switch (intent) {
    case "add_items":
      return dedupeActions([
        ...directMentionMatches.map((match) => {
          const item = menuById.get(match.itemId);
          const pendingAction = pendingAddActionMap.get(match.itemId);

          return {
            type: "add_item" as const,
            addOnIds: normalizeActionAddOnIds(
              item,
              mergeActionAddOnIds(match.addOnIds, pendingAction?.addOnIds),
            ),
            itemId: match.itemId,
            quantity: pendingAction && explicitQuantity === null ? pendingAction.quantity : match.quantity,
            spiceLevel: normalizeActionSpiceLevel(
              item,
              match.spiceLevel ?? pendingAction?.spiceLevel,
            ),
          };
        }),
        ...contextualItemIds.filter((itemId) => !directlyMentionedItemIds.has(itemId)).map((itemId) => {
          const item = menuById.get(itemId);
          const pendingAction = pendingAddActionMap.get(itemId);

          return {
            type: "add_item" as const,
            addOnIds: normalizeActionAddOnIds(
              item,
              mergeActionAddOnIds(
                item ? detectPromptAddOnIds(prompt, itemId) : undefined,
                pendingAction?.addOnIds,
              ),
            ),
            itemId,
            quantity: pendingAction?.quantity ?? 1,
            spiceLevel: normalizeActionSpiceLevel(
              item,
              (item?.spiceLevels?.length ? detectPromptSpiceLevel(prompt) : undefined) ?? pendingAction?.spiceLevel,
            ),
          };
        }),
      ]);
    case "remove_items":
      {
        const targetedRemovals = directMentionMatches
          .filter((match) =>
            request.cartItems.some((cartItem) =>
              matchesActionCartVariant(cartItem, {
                itemId: match.itemId,
                spiceLevel: match.spiceLevel,
                addOnIds: match.addOnIds,
              }),
            ),
          )
          .map((match) => ({
            type: "remove_item" as const,
            addOnIds: match.addOnIds,
            itemId: match.itemId,
            spiceLevel: match.spiceLevel,
          }));
        const targetedItemIds = new Set(targetedRemovals.map((action) => action.itemId));
        const fallbackRemovals = unique([
          ...findCartRemovalMatches(prompt, request.cartItems),
          ...(targetedRemovals.length === 0 ? cartTargetItemIds : []),
        ])
          .filter((itemId) => !targetedItemIds.has(itemId))
          .map((itemId) => ({
            type: "remove_item" as const,
            itemId,
          }));

        return dedupeActions([...targetedRemovals, ...fallbackRemovals]);
      }
    case "update_items": {
      if (reductionQuantity !== null) {
        return cartTargetItemIds.flatMap<BistroAiAction>((itemId) => {
          const directMatch = directMatchMap.get(itemId);
          const target = resolveSetQuantityTarget(request.cartItems, {
            addOnIds: directMatch?.addOnIds,
            itemId,
            spiceLevel: directMatch?.spiceLevel,
          });

          if (!target) {
            return [];
          }

          const nextQuantity = target.quantity - reductionQuantity;
          if (nextQuantity <= 0) {
            return [
              {
                type: "remove_item" as const,
                addOnIds: directMatch?.addOnIds ?? target.addOns.map((addOn) => addOn.id),
                itemId,
                spiceLevel: directMatch?.spiceLevel ?? target.spiceLevel,
              },
            ];
          }

          return [
            {
              type: "set_quantity" as const,
              addOnIds: directMatch?.addOnIds ?? target.addOns.map((addOn) => addOn.id),
              itemId,
              quantity: nextQuantity,
              spiceLevel: directMatch?.spiceLevel ?? target.spiceLevel,
            },
          ];
        });
      }

      const quantity = extractRequestedQuantity(prompt);
      if (quantity === null) {
        return cartTargetItemIds.flatMap<BistroAiAction>((itemId) => {
          const directMatch = directMatchMap.get(itemId);
          if (!directMatch || (!directMatch.spiceLevel && !Array.isArray(directMatch.addOnIds))) {
            return [];
          }

          const requestedVariant = {
            addOnIds: directMatch.addOnIds,
            itemId,
            spiceLevel: directMatch.spiceLevel,
          };
          const exactTarget = resolveSetQuantityTarget(request.cartItems, requestedVariant);
          if (exactTarget && !actionHasModifierChange(exactTarget, { ...requestedVariant, type: "set_quantity", quantity: exactTarget.quantity })) {
            return [];
          }

          const baseTarget = resolveSetQuantityTarget(request.cartItems, {
            addOnIds: directMatch.addOnIds,
            itemId,
          });
          if (!baseTarget) {
            return [];
          }

          const nextAddAction = {
            type: "add_item" as const,
            addOnIds: directMatch.addOnIds ?? baseTarget.addOns.map((addOn) => addOn.id),
            itemId,
            quantity: baseTarget.quantity,
            spiceLevel: directMatch.spiceLevel ?? baseTarget.spiceLevel,
          };

          if (!actionHasModifierChange(baseTarget, { ...nextAddAction, type: "set_quantity" })) {
            return [];
          }

          return [
            {
              type: "remove_item" as const,
              addOnIds: baseTarget.addOns.map((addOn) => addOn.id),
              itemId,
              spiceLevel: baseTarget.spiceLevel,
            },
            nextAddAction,
          ];
        });
      }

      return cartTargetItemIds.flatMap<BistroAiAction>((itemId) => {
        const directMatch = directMatchMap.get(itemId);
        const exactTarget = resolveSetQuantityTarget(request.cartItems, {
          addOnIds: directMatch?.addOnIds,
          itemId,
          spiceLevel: directMatch?.spiceLevel,
        });

        if (exactTarget) {
          return [
            {
              type: "set_quantity" as const,
              addOnIds: directMatch?.addOnIds,
              itemId,
              quantity,
              spiceLevel: directMatch?.spiceLevel,
            },
          ];
        }

        const baseTarget = resolveSetQuantityTarget(request.cartItems, {
          addOnIds: directMatch?.addOnIds,
          itemId,
        });
        if (!directMatch || !baseTarget) {
          return [
            {
              type: "set_quantity" as const,
              addOnIds: directMatchMap.get(itemId)?.addOnIds,
              itemId,
              quantity,
              spiceLevel: directMatchMap.get(itemId)?.spiceLevel,
            },
          ];
        }

        const nextAddAction = {
          type: "add_item" as const,
          addOnIds: directMatch.addOnIds ?? baseTarget.addOns.map((addOn) => addOn.id),
          itemId,
          quantity,
          spiceLevel: directMatch.spiceLevel ?? baseTarget.spiceLevel,
        };

        if (!actionHasModifierChange(baseTarget, { ...nextAddAction, type: "set_quantity" })) {
          return [
            {
              type: "set_quantity" as const,
              addOnIds: directMatch.addOnIds,
              itemId,
              quantity,
              spiceLevel: directMatch.spiceLevel,
            },
          ];
        }

        return [
          {
            type: "remove_item" as const,
            addOnIds: baseTarget.addOns.map((addOn) => addOn.id),
            itemId,
            spiceLevel: baseTarget.spiceLevel,
          },
          nextAddAction,
        ];
      });
    }
    case "clear_cart":
      return isClearCartIntent(prompt) && request.cartItems.length > 0 ? [{ type: "clear_cart" as const }] : [];
    default:
      return [];
  }
};

const pickAlternativeSuggestions = (
  request: BistroAiRequest,
  prompt: string,
  excludedItemIds: string[],
) => {
  const excludedSet = new Set(excludedItemIds);
  const recentSelectionIds = getLatestAssistantSelectionIds(request);
  const recentCategoryCounts = recentSelectionIds.reduce((map, itemId) => {
    const category = menuById.get(itemId)?.category;
    if (category) {
      map.set(category, (map.get(category) ?? 0) + 1);
    }
    return map;
  }, new Map<MenuItem["category"], number>());
  const recentTagSet = new Set(
    recentSelectionIds.flatMap((itemId) => menuById.get(itemId)?.tags.map((tag) => tag.toLowerCase()) ?? []),
  );
  const recommendationScores = new Map(scoreRecommendation(prompt).map((entry) => [entry.item.id, entry.score]));

  const scoredCandidates = menuItems
    .filter((item) => !excludedSet.has(item.id))
    .map((item) => {
      const categoryCount = recentCategoryCounts.get(item.category) ?? 0;
      return {
        item,
        score:
          (recommendationScores.get(item.id) ?? 0) +
          (categoryCount === 1 ? 4 : categoryCount > 1 ? 2 : 0) +
          item.tags.filter((tag) => recentTagSet.has(tag.toLowerCase())).length * 2 +
          (item.featured ? 1 : 0),
        categoryCount,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.categoryCount - right.categoryCount ||
        left.item.price - right.item.price ||
        left.item.name.localeCompare(right.item.name),
    );

  const chosen: string[] = [];
  const chosenSet = new Set<string>();
  const preferredCategories = [...recentCategoryCounts.entries()]
    .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
    .map(([category]) => category);

  preferredCategories.forEach((category) => {
    if (chosen.length >= 3) {
      return;
    }

    const candidate = scoredCandidates.find(
      (entry) => entry.item.category === category && !chosenSet.has(entry.item.id),
    );
    if (!candidate) {
      return;
    }

    chosen.push(candidate.item.id);
    chosenSet.add(candidate.item.id);
  });

  scoredCandidates.forEach((candidate) => {
    if (chosen.length >= 3 || chosenSet.has(candidate.item.id)) {
      return;
    }

    chosen.push(candidate.item.id);
    chosenSet.add(candidate.item.id);
  });

  return chosen.slice(0, 3);
};

const inferSuggestionsFromPrompt = (request: BistroAiRequest, intent: BistroAiIntent, prompt: string) => {
  if (intent !== "recommend_items") {
    return [];
  }

  const requestedGroups = extractRequestedRecommendationGroups(prompt);
  if (requestedGroups.length > 0) {
    const excludedItemIds = asksForAlternativeRecommendation(prompt) ? getLatestSuggestedIds(request.conversation) : [];
    return repairSuggestedRecommendations(prompt, [], excludedItemIds);
  }

  const directSuggestions = scoreRecommendation(prompt)
    .filter((entry) => entry.score > 0)
    .slice(0, 3)
    .map((entry) => entry.item.id);

  if (directSuggestions.length > 0) {
    return directSuggestions;
  }

  if (asksForAlternativeRecommendation(prompt)) {
    return pickAlternativeSuggestions(request, prompt, getLatestSuggestedIds(request.conversation));
  }

  return [];
};

const buildActionReply = (actions: BistroAiAction[], preferChinese: boolean) => {
  const addActions = actions.filter(isAddAction);
  const removeActions = actions.filter(
    (action): action is Extract<BistroAiAction, { type: "remove_item" }> => action.type === "remove_item",
  );
  const replacementPairs = addActions.reduce<
    Array<{
      addAction: Extract<BistroAiAction, { type: "add_item" }>;
      removeAction: Extract<BistroAiAction, { type: "remove_item" }>;
    }>
  >((pairs, addAction) => {
    const removeAction = removeActions.find((candidate) => {
      if (candidate.itemId !== addAction.itemId) {
        return false;
      }

      return !pairs.some((pair) => pair.removeAction === candidate);
    });

    if (!removeAction) {
      return pairs;
    }

    pairs.push({ addAction, removeAction });
    return pairs;
  }, []);

  if (replacementPairs.length > 0 && replacementPairs.length === addActions.length && replacementPairs.length === removeActions.length) {
    const lines = replacementPairs.map(({ addAction, removeAction }) => {
      const itemName = menuById.get(addAction.itemId)?.name ?? addAction.itemId;
      const fromModifier = formatActionModifierSummary(removeAction);
      const toModifier = formatActionModifierSummary(addAction);
      const changeLabel =
        fromModifier && toModifier
          ? preferChinese
            ? `从 ${fromModifier} 改成 ${toModifier}`
            : `from ${fromModifier} to ${toModifier}`
          : toModifier
            ? preferChinese
              ? `改成 ${toModifier}`
              : `to ${toModifier}`
            : preferChinese
              ? "调整成标准款"
              : "to the standard version";

      return preferChinese
        ? `${itemName} ${changeLabel}，数量 ${addAction.quantity}`
        : `${itemName} ${changeLabel} with quantity ${addAction.quantity}`;
    });

    return preferChinese
      ? `我可以把 ${lines.join(" 和 ")}。请确认下面的购物车变更。`
      : `I can swap ${lines.join(" and ")}. Review the cart changes below.`;
  }

  const setQuantityActions = actions.filter(isSetQuantityAction);
  if (setQuantityActions.length > 0) {
    const lines = setQuantityActions.map((action) => {
      const itemName = menuById.get(action.itemId)?.name ?? action.itemId;
      const modifierLabel = formatActionModifierLabel(action);
      return preferChinese
        ? `${itemName}${modifierLabel} \u8c03\u6574\u4e3a ${action.quantity}`
        : `${itemName}${modifierLabel} to ${action.quantity}`;
    });

    return preferChinese
      ? `\u6211\u53ef\u4ee5\u628a ${lines.join(" \u548c ")}\u3002\u8bf7\u786e\u8ba4\u4e0b\u9762\u7684\u6570\u91cf\u53d8\u66f4\u3002`
      : `I can set ${lines.join(" and ")}. Review the quantity changes below.`;
  }

  if (addActions.length > 0) {
    const lines = addActions.map((action) => {
      const itemName = menuById.get(action.itemId)?.name ?? action.itemId;
      return `${action.quantity} x ${itemName}${formatActionModifierLabel(action)}`;
    });

    return preferChinese
      ? `\u6211\u627e\u5230\u4e86 ${lines.join(" \u548c ")}\u3002\u8bf7\u786e\u8ba4\u4e0b\u9762\u7684\u8d2d\u7269\u8f66\u53d8\u66f4\u3002`
      : `I found ${lines.join(" and ")}. Review the cart changes below.`;
  }

  if (actions.some((action) => action.type === "remove_item")) {
    const labels = actions
      .filter((action): action is Extract<BistroAiAction, { type: "remove_item" }> => action.type === "remove_item")
      .map((action) => `${menuById.get(action.itemId)?.name ?? action.itemId}${formatActionModifierLabel(action)}`);

    return preferChinese
      ? `\u6211\u5728\u4f60\u7684\u8d2d\u7269\u8f66\u91cc\u627e\u5230\u4e86 ${labels.join(" \u548c ")}\u3002\u8bf7\u786e\u8ba4\u4e0b\u9762\u7684\u5220\u9664\u64cd\u4f5c\u3002`
      : `I found ${labels.join(" and ")} in your cart. Review the removal below.`;
  }

  return preferChinese
    ? "\u6211\u53ef\u4ee5\u5e2e\u4f60\u6e05\u7a7a\u8d2d\u7269\u8f66\u3002\u8bf7\u786e\u8ba4\u4e0b\u9762\u7684\u53d8\u66f4\u3002"
    : "I can clear the cart for you. Review the change below.";
};

const buildUnavailableReply = (intent: BistroAiIntent, preferChinese: boolean, cartHasItems: boolean) => {
  if (intent === "update_items") {
    if (!cartHasItems) {
      return preferChinese
        ? "\u4f60\u7684\u8d2d\u7269\u8f66\u8fd8\u662f\u7a7a\u7684\uff0c\u6240\u4ee5\u73b0\u5728\u6ca1\u6709\u53ef\u4ee5\u4fee\u6539\u7684\u83dc\u54c1\u3002"
        : "Your cart is empty right now, so there is nothing to update yet.";
    }

    return preferChinese
      ? "\u6211\u8fd8\u6ca1\u80fd\u5728\u4f60\u7684\u8d2d\u7269\u8f66\u91cc\u7a33\u5b9a\u5b9a\u4f4d\u5230\u90a3\u4e00\u884c\u5546\u54c1\u3002"
      : "I could not match a single cart item to update yet.";
  }

  if (intent === "remove_items") {
    if (!cartHasItems) {
      return preferChinese
        ? "\u4f60\u7684\u8d2d\u7269\u8f66\u8fd8\u662f\u7a7a\u7684\uff0c\u6240\u4ee5\u73b0\u5728\u6ca1\u6709\u4e1c\u897f\u53ef\u4ee5\u79fb\u9664\u3002"
        : "Your cart is empty right now, so there is nothing to remove.";
    }

    return preferChinese
      ? "\u6211\u8fd8\u6ca1\u6709\u5728\u4f60\u7684\u8d2d\u7269\u8f66\u91cc\u627e\u5230\u90a3\u4ef6\u5546\u54c1\u3002"
      : "I do not see that item in your cart yet.";
  }

  if (intent === "clear_cart" && !cartHasItems) {
    return preferChinese ? "\u4f60\u7684\u8d2d\u7269\u8f66\u5df2\u7ecf\u662f\u7a7a\u7684\u3002" : "Your cart is already empty.";
  }

  return preferChinese
    ? "\u6211\u6ca1\u80fd\u628a\u8fd9\u53e5\u8bdd\u7a33\u5b9a\u5730\u5339\u914d\u6210\u4e00\u4e2a\u53ef\u6267\u884c\u7684\u8d2d\u7269\u8f66\u53d8\u66f4\u3002"
    : "I could not confidently turn that into a cart change yet.";
};

const buildAdvisoryReply = (preferChinese: boolean) =>
  preferChinese
    ? "\u542c\u8d77\u6765\u4f60\u662f\u5728\u5f81\u6c42\u5efa\u8bae\uff0c\u800c\u4e0d\u662f\u76f4\u63a5\u8ba9\u6211\u6539\u8d2d\u7269\u8f66\u3002\u4f60\u53ef\u4ee5\u7ee7\u7eed\u95ee\u53e3\u5473\u3001\u7279\u70b9\uff0c\u6216\u8005\u76f4\u63a5\u8bf4\u201c\u5e2e\u6211\u52a0\u4e00\u4efd\u67d0\u9053\u83dc\u201d\u3002"
    : "It sounds like you are asking for advice, not asking me to change the cart yet. You can keep asking about the dish, or tell me directly to add it.";

const joinReadableList = (values: string[], preferChinese: boolean) => {
  if (values.length === 0) {
    return "";
  }

  if (values.length === 1) {
    return values[0];
  }

  if (values.length === 2) {
    return preferChinese ? `${values[0]} \u548c ${values[1]}` : `${values[0]} and ${values[1]}`;
  }

  return preferChinese
    ? `${values.slice(0, -1).join("\u3001")}\uff0c\u4ee5\u53ca ${values[values.length - 1]}`
    : `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
};

const buildRecommendationReply = (
  suggestedItemIds: string[],
  preferChinese: boolean,
  options?: {
    alternative?: boolean;
  },
) => {
  const items = suggestedItemIds
    .slice(0, 3)
    .map((itemId) => menuById.get(itemId))
    .filter((item): item is MenuItem => Boolean(item));
  const lead = joinReadableList(
    items.map((item) =>
      preferChinese ? `${item.name}（${buildItemFlavorNote(item, true)}）` : `${item.name} (${buildItemFlavorNote(item, false)})`,
    ),
    preferChinese,
  );

  if (!lead) {
    return preferChinese
      ? "\u6211\u53ef\u4ee5\u518d\u7ed9\u4f60\u51e0\u9053\u66f4\u8d34\u53e3\u5473\u7684\u9009\u62e9\u3002"
      : "I can line up a few more dishes that fit what you asked for.";
  }

  if (options?.alternative) {
    return preferChinese ? `\u53e6\u5916\u4e5f\u53ef\u4ee5\u770b\u770b ${lead}\u3002` : `Another good set is ${lead}.`;
  }

  return preferChinese ? `\u53ef\u4ee5\u5148\u8bd5\u8bd5 ${lead}\u3002` : `A good place to start is ${lead}.`;
};

const buildBudgetReply = ({
  itemIds,
  total,
  maxTotal,
  preferChinese,
  mode,
  previousTotal,
}: {
  itemIds: string[];
  total: number;
  maxTotal: number;
  preferChinese: boolean;
  mode: "suggest" | "action" | "complaint" | "unavailable";
  previousTotal?: number;
}) => {
  const itemNames = itemIds.map((itemId) => menuById.get(itemId)?.name ?? itemId);
  const joinedNames = itemNames.join(preferChinese ? " 和 " : " and ");
  const lineItems = itemNames.map((name) => `1 x ${name}`).join(preferChinese ? " 和 " : " and ");

  if (mode === "unavailable") {
    return preferChinese
      ? `\u5728 ${maxTotal} \u5143\u7684\u9884\u7b97\u5185\uff0c\u6211\u6682\u65f6\u6ca1\u6cd5\u7a33\u5b9a\u51d1\u51fa\u8fd9\u7ec4\u83dc\u3002\u4f60\u53ef\u4ee5\u653e\u5bbd\u9884\u7b97\uff0c\u6216\u8005\u51cf\u5c11\u4e00\u9053\u83dc\u3002`
      : `I could not fit that combination within a ${maxTotal} budget yet. Try raising the budget or reducing the dish count.`;
  }

  if (mode === "action") {
    return preferChinese
      ? `\u6211\u627e\u5230\u4e86\u4e00\u7ec4\u7b26\u5408 ${maxTotal} \u5143\u9884\u7b97\u7684\u642d\u914d\uff1a${lineItems}\uff0c\u603b\u4ef7 ${total} \u5143\u3002\u8bf7\u786e\u8ba4\u4e0b\u9762\u7684\u8d2d\u7269\u8f66\u53d8\u66f4\u3002`
      : `I found a combo that stays within ${maxTotal}: ${lineItems}, total ${total}. Review the cart changes below.`;
  }

  if (mode === "complaint") {
    return preferChinese
      ? `\u5bf9\uff0c\u521a\u624d\u90a3\u7ec4\u4e00\u5171 ${previousTotal ?? "?"} \u5143\uff0c\u8d85\u8fc7\u4e86 ${maxTotal} \u5143\u3002\u4f60\u53ef\u4ee5\u6539\u6210 ${joinedNames}\uff0c\u603b\u4ef7 ${total} \u5143\u3002`
      : `Yes, the last combo totals ${previousTotal ?? "?"}, which is over ${maxTotal}. You could switch to ${joinedNames} for a total of ${total}.`;
  }

  return preferChinese
    ? `\u6309 ${maxTotal} \u5143\u7684\u9884\u7b97\u6765\u770b\uff0c\u6211\u5efa\u8bae ${joinedNames}\uff0c\u603b\u4ef7 ${total} \u5143\u3002`
    : `For a ${maxTotal} budget, I would go with ${joinedNames}. The total comes to ${total}.`;
};

const categoryLabel = (item: MenuItem, preferChinese: boolean) => {
  if (!preferChinese) {
    switch (item.category) {
      case "rolls":
        return "roll";
      case "ramen":
        return "ramen";
      case "appetizers":
        return "appetizer";
      case "salads":
        return "salad";
      default:
        return item.category;
    }
  }

  switch (item.category) {
    case "rolls":
      return "\u5377\u7269";
    case "ramen":
      return "\u62c9\u9762";
    case "appetizers":
      return "\u524d\u83dc";
    case "salads":
      return "\u6c99\u62c9";
    default:
      return item.category;
  }
};

const zhTagMap: Record<string, string> = {
  Popular: "\u4eba\u6c14\u5f88\u9ad8",
  Fresh: "\u6e05\u723d",
  "Chef's pick": "\u4e3b\u53a8\u63a8\u8350",
  Rich: "\u6d53\u90c1",
  Premium: "\u504f\u7cbe\u81f4",
  Aromatic: "\u9999\u6c14\u660e\u663e",
  Citrus: "\u67d1\u6a58\u611f",
  Light: "\u8f83\u8f7b\u76c8",
  Bright: "\u98ce\u5473\u660e\u4eae",
  Signature: "\u62db\u724c",
  Umami: "\u9c9c\u5473\u8db3",
  Tangy: "\u5fae\u9178\u5f00\u80c3",
  Classic: "\u7ecf\u5178",
  Comfort: "\u5f88\u6696\u80c3",
  Vegetarian: "\u7d20\u98df\u53ef\u9009",
  Warm: "\u504f\u6696\u53e3",
  Vegan: "\u7eaf\u7d20",
  Shareable: "\u9002\u5408\u5206\u4eab",
  Spicy: "\u8fa3\u611f\u660e\u786e",
  Crispy: "\u53e3\u611f\u9999\u8106",
  Refreshing: "\u6e05\u65b0",
};

const buildItemFlavorNote = (item: MenuItem, preferChinese: boolean) => {
  if (preferChinese) {
    const notes = item.tags.map((tag) => zhTagMap[tag]).filter(Boolean).slice(0, 2);
    return notes.length > 0 ? notes.join("\u3001") : "\u98ce\u5473\u6bd4\u8f83\u5747\u8861";
  }

  return item.tags.slice(0, 2).join(", ") || "balanced flavor";
};

const buildExplanationReply = (itemIds: string[], preferChinese: boolean) => {
  const items = itemIds.map((itemId) => menuById.get(itemId)).filter((item): item is MenuItem => Boolean(item));
  if (items.length === 0) {
    return preferChinese
      ? "\u6211\u73b0\u5728\u8fd8\u6ca1\u5b9a\u4f4d\u5230\u4f60\u6307\u7684\u90a3\u9053\u83dc\u3002"
      : "I do not know which dish you mean yet.";
  }

  return items
    .map((item) => {
      const priceLabel = `$${item.price.toFixed(2)}`;
      const flavorNote = buildItemFlavorNote(item, preferChinese);
      const addOnNote = item.addOns?.length
        ? preferChinese
          ? `\u8fd8\u53ef\u4ee5\u52a0 ${item.addOns.slice(0, 2).map((addOn) => addOn.name).join("\u3001")}\u3002`
          : `You can also add ${item.addOns.slice(0, 2).map((addOn) => addOn.name).join(" or ")}.`
        : "";
      const spiceNote = item.spiceLevels?.length
        ? preferChinese
          ? `\u8fa3\u5ea6\u53ef\u9009 ${item.spiceLevels.join("/")}\u3002`
          : `Spice levels: ${item.spiceLevels.join("/")}.`
        : "";

      if (preferChinese) {
        return `${item.name} \u662f\u4e00\u9053${categoryLabel(item, true)}\uff0c\u4ef7\u683c ${priceLabel}\u3002\u4e3b\u8981\u98ce\u5473\u662f ${flavorNote}\uff0c\u914d\u6599\u4e3a ${item.description.replace(/\.$/, "")}\u3002${spiceNote}${addOnNote}`.trim();
      }

      return `${item.name} is a ${categoryLabel(item, false)} for ${priceLabel}. It leans ${flavorNote} and includes ${item.description.replace(/\.$/, "")}. ${spiceNote} ${addOnNote}`.trim();
    })
    .join("\n");
};

const buildClarificationReply = ({
  hasMatchedActions,
  intent,
  missingSlots,
  preferChinese,
  quantityTargetItemId,
  spiceTargetItemId,
  subject,
}: {
  hasMatchedActions: boolean;
  intent: BistroAiIntent;
  missingSlots: BistroAiMissingSlot[];
  preferChinese: boolean;
  quantityTargetItemId?: string | null;
  spiceTargetItemId?: string | null;
  subject?: string;
}) => {
  const quantityTargetName = quantityTargetItemId ? menuById.get(quantityTargetItemId)?.name ?? quantityTargetItemId : null;
  const spiceTargetItem = spiceTargetItemId ? menuById.get(spiceTargetItemId) : null;

  if (missingSlots.includes("spice_level") && spiceTargetItem) {
    const spiceChoices = spiceTargetItem.spiceLevels?.map((level) => localizedSpiceLabel(level, preferChinese)).join("/") ?? "";
    const addOnNote = spiceTargetItem.addOns?.length
      ? preferChinese
        ? `\u5982\u679c\u8fd8\u60f3\u52a0\u6599\uff0c\u4e5f\u53ef\u4ee5\u76f4\u63a5\u56de ${spiceTargetItem.addOns
            .map((addOn) => addOn.name)
            .slice(0, 3)
            .join("\u3001")}\u3002`
        : `You can also mention add-ons like ${spiceTargetItem.addOns
            .map((addOn) => addOn.name)
            .slice(0, 3)
            .join(", ")}.`
      : "";

    return preferChinese
      ? `${spiceTargetItem.name} \u8fd8\u5dee\u8fa3\u5ea6\u3002\u5148\u9009 ${spiceChoices}\u3002${addOnNote}`.trim()
      : `${spiceTargetItem.name} still needs a spice level. Pick ${spiceChoices}.${addOnNote ? ` ${addOnNote}` : ""}`;
  }

  if (missingSlots.includes("quantity") && quantityTargetName) {
    return preferChinese
      ? `\u6211\u5df2\u7ecf\u5b9a\u4f4d\u5230 ${quantityTargetName}\uff0c\u8fd8\u5dee\u4f60\u544a\u8bc9\u6211\u8981\u6539\u6210\u51e0\u4efd\u3002\u53ef\u4ee5\u76f4\u63a5\u70b9\u4e0b\u9762\u7684\u9009\u9879\u3002`
      : `I matched ${quantityTargetName}, but I still need the quantity you want. Pick one below and I will prepare the cart change.`;
  }

  if (missingSlots.includes("item")) {
    const detail = subject
      ? preferChinese
        ? `\u201c${subject}\u201d`
        : `"${subject}"`
      : preferChinese
        ? "\u90a3\u9053\u83dc"
        : "that dish";

    if (intent === "remove_items") {
      return preferChinese
        ? `\u6211\u8fd8\u4e0d\u786e\u5b9a\u4f60\u60f3\u4ece\u8d2d\u7269\u8f66\u91cc\u79fb\u9664\u7684\u662f ${detail}\u4e2d\u7684\u54ea\u4e00\u9053\u3002\u4f60\u53ef\u4ee5\u76f4\u63a5\u70b9\u4e0b\u9762\u7684\u9009\u9879\u3002`
        : `I am not sure which cart item you mean by ${detail} yet. Pick one below and I will prepare the removal.`;
    }

    if (intent === "update_items") {
      return preferChinese
        ? `\u6211\u8fd8\u4e0d\u786e\u5b9a\u4f60\u60f3\u8c03\u6574\u7684\u662f ${detail}\u4e2d\u7684\u54ea\u4e00\u9053\u3002\u4f60\u53ef\u4ee5\u5148\u9009\u4e00\u4e0b\uff0c\u6211\u518d\u7ee7\u7eed\u5904\u7406\u6570\u91cf\u53d8\u66f4\u3002`
        : `I am not sure which dish you want to update from ${detail} yet. Pick one below and I will continue with the quantity change.`;
    }

    return preferChinese
      ? hasMatchedActions
        ? `\u6211\u5df2\u7ecf\u5339\u914d\u5230\u4e86\u4f60\u8bf7\u6c42\u91cc\u7684\u4e00\u90e8\u5206\uff0c\u4f46 ${detail} \u8fd9\u90e8\u5206\u8fd8\u9700\u4f60\u518d\u786e\u8ba4\u4e00\u4e0b\u3002\u53ef\u4ee5\u76f4\u63a5\u70b9\u4e0b\u9762\u7684\u9009\u9879\u3002`
        : `\u6211\u8fd8\u4e0d\u786e\u5b9a\u4f60\u60f3\u52a0\u7684\u662f ${detail} \u4e2d\u7684\u54ea\u4e00\u9053\u3002\u53ef\u4ee5\u76f4\u63a5\u70b9\u4e0b\u9762\u7684\u9009\u9879\u3002`
      : hasMatchedActions
        ? `I matched part of your order, but I am still not sure which dish you mean by ${detail}. Pick one below and I will prepare the full cart change.`
        : `I am not sure which dish you mean by ${detail} yet. Pick one below and I will prepare the cart change.`;
  }

  return preferChinese
    ? "\u6211\u8fd8\u9700\u8981\u4f60\u518d\u7ed9\u6211\u4e00\u70b9\u4fe1\u606f\uff0c\u624d\u80fd\u5b89\u5168\u5730\u6539\u8d2d\u7269\u8f66\u3002"
    : "I need one more detail before I safely change the cart.";
};

const buildCommand = ({
  actionRequested,
  actions,
  intent,
  needsClarification,
  selectionPlan,
}: {
  actionRequested: boolean;
  actions: BistroAiAction[];
  intent: BistroAiIntent;
  needsClarification: boolean;
  selectionPlan: BistroAiSelectionPlan | null;
}): BistroAiCommand => {
  if (actionRequested && needsClarification) {
    return {
      state: "needs_clarification",
      intent,
      executable: false,
      requiresConfirmation: false,
      actions,
      selectionPlan,
    };
  }

  if (actionRequested && actions.length > 0) {
    return {
      state: "ready",
      intent,
      executable: true,
      requiresConfirmation: true,
      actions,
      selectionPlan,
    };
  }

  return {
    state: "inform",
    intent,
    executable: false,
    requiresConfirmation: false,
    actions,
    selectionPlan,
  };
};

export const validateAiResponse = (request: BistroAiRequest, response: BistroAiResponse): BistroAiResponse => {
  const preferChinese = hasChineseCharacters(request.prompt);
  const normalizedPrompt = normalizeText(request.prompt);
  const latestConversationItemIds = getLatestReferencedIds(request.conversation);
  const latestSuggestedIds = getLatestSuggestedIds(request.conversation);
  const latestAssistantSelectionIds = getLatestAssistantSelectionIds(request);
  const latestAssistantSelectionTotal =
    latestAssistantSelectionIds.length > 0 ? sumItemIdsTotal(latestAssistantSelectionIds) : null;
  const contextualItemIds = resolveContextualItemIds(request, normalizedPrompt);
  const budgetConstraint = extractBudgetConstraint(normalizedPrompt);
  const budgetSelection = budgetConstraint
    ? resolveBudgetSelection(request, normalizedPrompt, budgetConstraint)
    : null;
  const originalActions = sanitizeActions(response.actions, request.cartItems);
  let intent = normalizeIntent(response.intent, response);
  let actions = originalActions;
  let suggestedItemIds = sanitizeSuggestedItemIds(response.suggestedItemIds);
  let referencedItemIds = sanitizeSuggestedItemIds(response.referencedItemIds);
  let missingSlots = sanitizeMissingSlots(response.missingSlots);
  let clarificationOptions = sanitizeClarificationOptions(response.clarificationOptions);
  let unavailableRequests = sanitizeUnavailableRequests(response.unavailableRequests);
  let budgetReplyState:
    | {
        mode: "suggest" | "action" | "complaint" | "unavailable";
        itemIds: string[];
        total: number;
        previousTotal?: number;
      }
    | null = null;
  const selectionPlan = response.selectionPlan ?? null;
  const selectionPlanItemIds = selectionPlan ? resolveSelectionPlan(request, selectionPlan) : [];
  const promptSuggestsAdd = isExplicitAddPrompt(normalizedPrompt);
  const promptSuggestsQuantityReduction = isExplicitQuantityReductionPrompt(normalizedPrompt);
  const promptSuggestsUpdateVerb =
    promptSuggestsQuantityReduction ||
    isExplicitUpdatePrompt(normalizedPrompt) ||
    isUpdateVerbPrompt(normalizedPrompt);
  const promptSuggestsRemove = isExplicitRemovePrompt(normalizedPrompt) && !promptSuggestsQuantityReduction;
  const promptSuggestsClear = isExplicitClearPrompt(normalizedPrompt);
  const clarificationFollowUpIntent =
    promptSuggestsAdd || promptSuggestsUpdateVerb || promptSuggestsRemove || promptSuggestsClear
      ? null
      : resolveClarificationFollowUpIntent(request, normalizedPrompt);
  const promptSuggestsAlternativeRecommendation = asksForAlternativeRecommendation(normalizedPrompt);
  const requestedRecommendationGroups = extractRequestedRecommendationGroups(normalizedPrompt);

  if (promptSuggestsClear) {
    intent = "clear_cart";
  } else if (promptSuggestsUpdateVerb) {
    intent = "update_items";
  } else if (promptSuggestsRemove) {
    intent = "remove_items";
  } else if (promptSuggestsAdd) {
    intent = "add_items";
  } else if (clarificationFollowUpIntent) {
    intent = clarificationFollowUpIntent;
  }

  const explicitActionIntent =
    promptSuggestsAdd ||
    promptSuggestsUpdateVerb ||
    promptSuggestsRemove ||
    promptSuggestsClear ||
    Boolean(clarificationFollowUpIntent);

  const actionIntent =
    intent === "add_items" || intent === "update_items" || intent === "remove_items" || intent === "clear_cart";
  const preferredMenuResolutionIds = latestConversationItemIds.length > 0 ? latestConversationItemIds : contextualItemIds;
  const explicitMenuResolution =
    actionIntent && explicitActionIntent && intent !== "clear_cart"
      ? resolveMenuMentions(normalizedPrompt, { preferredItemIds: preferredMenuResolutionIds })
      : null;
  const unresolvedMenuPhrases = explicitMenuResolution?.unresolvedPhrases ?? [];
  const modelWasOvereager = actionIntent && actions.length > 0 && !explicitActionIntent;
  const inferredExplicitActions =
    actionIntent && explicitActionIntent
      ? sanitizeActions(inferActionsFromPrompt(intent, request), request.cartItems)
      : [];

  if (clarificationFollowUpIntent) {
    actions = [];
    unavailableRequests = [];
  }

  if (looksLikeExplanationPrompt(normalizedPrompt) && (selectionPlanItemIds.length > 0 || contextualItemIds.length > 0)) {
    intent = "explain_items";
    referencedItemIds = selectionPlanItemIds.length > 0 ? selectionPlanItemIds : contextualItemIds;
    actions = [];
  }

  if (actionIntent && !explicitActionIntent) {
    actions = [];
    if (suggestedItemIds.length === 0) {
      suggestedItemIds = sanitizeSuggestedItemIds(findItemMatches(normalizedPrompt).map((match) => match.itemId));
    }
    intent = "answer_question";
  }

  if (actionIntent && explicitActionIntent && (explicitMenuResolution?.unresolvedPhrases.length ?? 0) > 0) {
    actions = [];
    unavailableRequests = explicitMenuResolution?.unresolvedPhrases ?? [];
  }

  if (actionIntent && explicitActionIntent && inferredExplicitActions.length > 0) {
    actions = inferredExplicitActions;
    unavailableRequests = [];
  }

  if (actionIntent && explicitActionIntent && actions.length === 0) {
    actions = sanitizeActions(resolveActionsFromSelectionPlan(intent, request, selectionPlan), request.cartItems);
  }

  if (budgetConstraint && promptSuggestsAdd && !doesActionSetMeetBudget(actions, budgetConstraint)) {
    if (budgetSelection) {
      actions = sanitizeActions(buildBudgetActions(budgetSelection.itemIds), request.cartItems);
      budgetReplyState = {
        mode: "action",
        itemIds: budgetSelection.itemIds,
        total: budgetSelection.total,
      };
    } else {
      actions = [];
      budgetReplyState = {
        mode: "unavailable",
        itemIds: [],
        total: 0,
      };
    }
  }

  if (budgetConstraint && !explicitActionIntent) {
    if (budgetSelection) {
      intent = "recommend_items";
      actions = [];
      suggestedItemIds = budgetSelection.itemIds;
      referencedItemIds = budgetSelection.itemIds;
      unavailableRequests = [];
      budgetReplyState = {
        mode: budgetConstraint.isComplaint ? "complaint" : "suggest",
        itemIds: budgetSelection.itemIds,
        total: budgetSelection.total,
        previousTotal: latestAssistantSelectionTotal ?? undefined,
      };
    } else if (budgetConstraint.isComplaint) {
      intent = "answer_question";
      actions = [];
      budgetReplyState = {
        mode: "unavailable",
        itemIds: [],
        total: 0,
        previousTotal: latestAssistantSelectionTotal ?? undefined,
      };
    }
  }

  if (explicitActionIntent) {
    suggestedItemIds = [];
  }

  if (explicitActionIntent && actions.length > 0) {
    referencedItemIds = unique(
      actions.flatMap((action) => (action.type === "clear_cart" ? [] : [action.itemId])),
    );
  }

  if (intent === "recommend_items" && suggestedItemIds.length === 0) {
    suggestedItemIds = sanitizeSuggestedItemIds(selectionPlanItemIds);
  }

  if (intent === "recommend_items" && suggestedItemIds.length === 0) {
    suggestedItemIds = sanitizeSuggestedItemIds(inferSuggestionsFromPrompt(request, intent, normalizedPrompt));
  }

  if (
    intent === "recommend_items" &&
    requestedRecommendationGroups.length > 0 &&
    !suggestionSetMatchesRequestedGroups(suggestedItemIds, requestedRecommendationGroups)
  ) {
    const repairedSuggestions = repairSuggestedRecommendations(
      normalizedPrompt,
      suggestedItemIds,
      promptSuggestsAlternativeRecommendation ? latestSuggestedIds : [],
    );

    if (repairedSuggestions.length > 0) {
      suggestedItemIds = sanitizeSuggestedItemIds(repairedSuggestions);
    }
  }

  const alternativeRecommendationRequest =
    intent === "recommend_items" &&
    !explicitActionIntent &&
    promptSuggestsAlternativeRecommendation &&
    latestSuggestedIds.length > 0;
  const ambiguousContextReference =
    contextualItemIds.length === 0 && hasReferenceHint(normalizedPrompt) && latestConversationItemIds.length > 1;
  const explicitResolutionMatchIds = unique((explicitMenuResolution?.matches ?? []).map((match) => match.itemId));
  const cartItemIds = unique(
    request.cartItems.map((item) => item.itemId).filter((itemId) => menuById.has(itemId)),
  );
  const updateTargetItemIds = unique([
    ...explicitResolutionMatchIds,
    ...contextualItemIds,
    ...latestConversationItemIds,
    ...actions.flatMap((action) =>
      action.type === "clear_cart" ? [] : [action.itemId],
    ),
  ]).filter((itemId) => cartItemIds.includes(itemId));

  if (
    alternativeRecommendationRequest &&
    (suggestedItemIds.length === 0 || hasHeavyRecommendationOverlap(suggestedItemIds, latestSuggestedIds))
  ) {
    const alternativeSuggestionIds = pickAlternativeSuggestions(request, normalizedPrompt, latestSuggestedIds);
    if (alternativeSuggestionIds.length > 0) {
      suggestedItemIds = alternativeSuggestionIds;
      referencedItemIds = alternativeSuggestionIds;
    }
  }

  if (intent === "recommend_items" && suggestedItemIds.length > 0) {
    suggestedItemIds = suggestedItemIds.slice(0, 3);
    referencedItemIds = suggestedItemIds;
    unavailableRequests = [];
  }

  const spiceClarificationAction =
    actionIntent &&
    explicitActionIntent &&
    !budgetReplyState &&
    intent === "add_items" &&
    actions.length === 1 &&
    actions[0]?.type === "add_item" &&
    unresolvedMenuPhrases.length === 0 &&
    !ambiguousContextReference
      ? (() => {
          const action = actions[0];
          const item = menuById.get(action.itemId);
          return item?.spiceLevels?.length && !action.spiceLevel ? action : null;
        })()
      : null;
  const spiceTargetItemId = spiceClarificationAction?.itemId ?? null;
  const inferredMissingSlots: BistroAiMissingSlot[] = [];
  const missingUpdateQuantity =
    actionIntent &&
    explicitActionIntent &&
    intent === "update_items" &&
    actions.length === 0 &&
    extractRequestedQuantity(normalizedPrompt) === null &&
    updateTargetItemIds.length === 1 &&
    !budgetReplyState;
  const noResolvedActionTarget =
    intent !== "clear_cart" &&
    actions.length === 0 &&
    selectionPlanItemIds.length === 0 &&
    contextualItemIds.length === 0 &&
    explicitResolutionMatchIds.length === 0;

  if (missingUpdateQuantity) {
    inferredMissingSlots.push("quantity");
  }

  if (spiceClarificationAction) {
    inferredMissingSlots.push("spice_level");
  }

  if (
    actionIntent &&
    explicitActionIntent &&
    intent !== "clear_cart" &&
    !budgetReplyState &&
    (
      ambiguousContextReference ||
      noResolvedActionTarget ||
      (unresolvedMenuPhrases.length > 0 && selectionPlanItemIds.length === 0)
    )
  ) {
    inferredMissingSlots.push("item");
  }

  if (inferredMissingSlots.length > 0) {
    missingSlots = unique([...missingSlots, ...inferredMissingSlots]);
  } else if (actions.length > 0 && unresolvedMenuPhrases.length === 0 && !ambiguousContextReference) {
    missingSlots = [];
  }

  let clarificationCandidateItemIds: string[] = [];
  const itemClarificationSearchSpace =
    intent === "remove_items" || intent === "update_items" ? cartItemIds : undefined;
  const firstUnresolvedPhrase = unresolvedMenuPhrases[0] ?? request.prompt;
  const quantityTargetItemId = updateTargetItemIds[0] ?? null;

  if (missingSlots.includes("item")) {
    clarificationCandidateItemIds = unique([
      ...(ambiguousContextReference ? latestConversationItemIds : []),
      ...unresolvedMenuPhrases.flatMap((phrase) =>
        findClarificationCandidates(phrase, {
          preferredItemIds: preferredMenuResolutionIds,
          candidateItemIds: itemClarificationSearchSpace,
          limit: 4,
        }),
      ),
      ...findClarificationCandidates(request.prompt, {
        preferredItemIds: preferredMenuResolutionIds,
        candidateItemIds: itemClarificationSearchSpace,
        limit: 4,
      }),
    ]).slice(0, 4);

    if (clarificationOptions.length === 0 && clarificationCandidateItemIds.length > 0) {
      clarificationOptions = buildItemClarificationOptions({
        candidateItemIds: clarificationCandidateItemIds,
        existingAddActions: actions.filter(isAddAction),
        intent,
        preferChinese,
        quantity: extractMentionQuantity(firstUnresolvedPhrase, 1),
      });
    }
  }

  if (missingSlots.includes("quantity") && quantityTargetItemId && clarificationOptions.length === 0) {
    clarificationOptions = buildQuantityClarificationOptions(
      quantityTargetItemId,
      preferChinese,
      request.cartItems.find((item) => item.itemId === quantityTargetItemId)?.quantity,
    );
  }

  if (missingSlots.includes("spice_level") && spiceClarificationAction && clarificationOptions.length === 0) {
    clarificationOptions = buildSpiceClarificationOptions(spiceClarificationAction, preferChinese);
  }

  const hasExecutableActionSet =
    actionIntent &&
    explicitActionIntent &&
    !budgetReplyState &&
    actions.length > 0 &&
    missingSlots.length === 0 &&
    unresolvedMenuPhrases.length === 0 &&
    !ambiguousContextReference;

  if (hasExecutableActionSet) {
    clarificationOptions = [];
  }

  const needsClarification =
    actionIntent &&
    explicitActionIntent &&
    !budgetReplyState &&
    (missingSlots.length > 0 || clarificationOptions.length > 0);

  if (needsClarification) {
    suggestedItemIds = [];
    unavailableRequests = [];

    if (clarificationCandidateItemIds.length > 0) {
      referencedItemIds = unique([...clarificationCandidateItemIds, ...referencedItemIds]).slice(0, 4);
    } else if (quantityTargetItemId) {
      referencedItemIds = unique([quantityTargetItemId, ...referencedItemIds]).slice(0, 4);
    } else if (spiceTargetItemId) {
      referencedItemIds = unique([spiceTargetItemId, ...referencedItemIds]).slice(0, 4);
    }
  } else {
    missingSlots = [];
    clarificationOptions = [];
  }

  if (referencedItemIds.length === 0) {
    referencedItemIds = unique([
      ...suggestedItemIds,
      ...selectionPlanItemIds,
      ...contextualItemIds,
      ...actions.flatMap((action) =>
        action.type === "clear_cart" ? [] : [action.itemId],
      ),
    ]).slice(0, 4);
  }

  if (
    actionIntent &&
    explicitActionIntent &&
    !needsClarification &&
    actions.length === 0 &&
    unavailableRequests.length === 0
  ) {
    unavailableRequests = [request.prompt];
  }

  let reply = stripStructuredFieldLeak(response.reply);
  const shouldForceChineseReply = preferChinese && !hasChineseCharacters(reply);
  const shouldRebuildCategoryRecommendationReply =
    intent === "recommend_items" &&
    requestedRecommendationGroups.length > 0 &&
    suggestedItemIds.length > 0 &&
    !replyMentionsAllResolvedItems(reply, suggestedItemIds);
  const shouldGroundRecommendationReply =
    suggestedItemIds.length > 0 &&
    intent === "recommend_items" &&
    (
      alternativeRecommendationRequest ||
      shouldForceChineseReply ||
      shouldRebuildCategoryRecommendationReply ||
      !replyMentionsResolvedItems(reply, suggestedItemIds)
    );
  const shouldGroundExplanationReply =
    referencedItemIds.length > 0 &&
    intent === "explain_items" &&
    (shouldForceChineseReply || !replyMentionsResolvedItems(reply, referencedItemIds));

  if (budgetReplyState && budgetConstraint) {
    reply = buildBudgetReply({
      itemIds: budgetReplyState.itemIds,
      total: budgetReplyState.total,
      maxTotal: budgetConstraint.maxTotal,
      preferChinese,
      mode: budgetReplyState.mode,
      previousTotal: budgetReplyState.previousTotal,
    });
  } else if (needsClarification) {
    reply = buildClarificationReply({
      hasMatchedActions: actions.length > 0,
      intent,
      missingSlots,
      preferChinese,
      quantityTargetItemId,
      spiceTargetItemId,
      subject: extractClarificationSubject(firstUnresolvedPhrase),
    });
  } else if (explicitActionIntent && actions.length > 0) {
    reply = buildActionReply(actions, preferChinese);
  } else if (explicitActionIntent && actions.length === 0) {
    reply =
      ambiguousContextReference
        ? preferChinese
          ? intent === "update_items"
            ? "\u6211\u77e5\u9053\u4f60\u5728\u8bf4\u521a\u624d\u63d0\u5230\u7684\u90a3\u9053\u83dc\uff0c\u4f46\u6211\u8fd8\u9700\u8981\u4f60\u66f4\u5177\u4f53\u5730\u8bf4\u660e\u8981\u6539\u6210\u51e0\u4efd\u3002"
            : "\u6211\u77e5\u9053\u4f60\u5728\u8bf4\u4e4b\u524d\u63d0\u5230\u7684\u83dc\uff0c\u4f46\u8fd9\u53e5\u8bdd\u8fd8\u4e0d\u591f\u660e\u786e\u3002\u4f60\u53ef\u4ee5\u76f4\u63a5\u8bf4\u201c\u5e2e\u6211\u52a0\u7b2c\u4e00\u4e2a\u201d\u6216\u8005\u201c\u53ea\u52a0 Mango Salmon Delight\u201d\u3002"
          : intent === "update_items"
            ? "I know you mean one of the dishes we just discussed, but I still need a more specific quantity change request."
            : "I know you mean one of the dishes we just discussed, but I still need a more specific add request."
        : buildUnavailableReply(intent, preferChinese, request.cartItems.length > 0);
  } else if (modelWasOvereager) {
    reply = buildAdvisoryReply(preferChinese);
  } else if (shouldGroundRecommendationReply) {
    reply = buildRecommendationReply(suggestedItemIds, preferChinese, {
      alternative: alternativeRecommendationRequest,
    });
  } else if (shouldGroundExplanationReply) {
    reply = buildExplanationReply(referencedItemIds.slice(0, 3), preferChinese);
  } else if (
    (shouldForceChineseReply || looksLikeExplanationPrompt(normalizedPrompt)) &&
    referencedItemIds.length > 0 &&
    (intent === "explain_items" || intent === "answer_question")
  ) {
    reply = buildExplanationReply(referencedItemIds.slice(0, 3), preferChinese);
  } else if (!reply) {
    if (actions.length > 0) {
      reply = buildActionReply(actions, preferChinese);
    } else if (referencedItemIds.length > 0 && (intent === "explain_items" || looksLikeExplanationPrompt(normalizedPrompt))) {
      reply = buildExplanationReply(referencedItemIds.slice(0, 3), preferChinese);
    } else if (suggestedItemIds.length > 0 && intent === "recommend_items") {
      reply = buildRecommendationReply(suggestedItemIds, preferChinese, {
        alternative: alternativeRecommendationRequest,
      });
    } else if (unavailableRequests.length > 0) {
      reply = buildUnavailableReply(intent, preferChinese, request.cartItems.length > 0);
    } else {
      reply = preferChinese
        ? "\u6211\u7406\u89e3\u4e86\u4f60\u7684\u95ee\u9898\uff0c\u4e0d\u8fc7\u8fd8\u9700\u8981\u4f60\u518d\u5177\u4f53\u4e00\u70b9\u3002"
        : "I understand the question, but I need a little more detail.";
    }
  }

  const command = buildCommand({
    actionRequested: actionIntent && explicitActionIntent,
    actions,
    intent,
    needsClarification,
    selectionPlan,
  });

  return {
    intent,
    reply,
    needsConfirmation: command.requiresConfirmation,
    actions,
    suggestedItemIds,
    referencedItemIds,
    unavailableRequests,
    selectionPlan,
    missingSlots,
    clarificationOptions,
    command,
  };
};
