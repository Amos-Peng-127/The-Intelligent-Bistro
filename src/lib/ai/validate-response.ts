import { menuItems } from "@/data/menu";

import {
  findCartRemovalMatches,
  findItemMatches,
  hasChineseCharacters,
  isClearCartIntent,
  normalizeText,
  scoreRecommendation,
} from "./rule-parser";
import type {
  BistroAiAction,
  BistroAiIntent,
  BistroAiRequest,
  BistroAiResponse,
  BistroAiSelectionPlan,
} from "./types";

const menuById = new Map(menuItems.map((item) => [item.id, item]));
type MenuItem = (typeof menuItems)[number];

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

const unique = <T,>(values: T[]) => [...new Set(values)];

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

const isQuestionLikePrompt = (prompt: string) => prompt.includes("?") || prompt.includes("\uff1f");

const includesAny = (prompt: string, needles: string[]) =>
  needles.some((needle) => prompt.includes(needle));

const hasReferenceHint = (prompt: string) => includesAny(prompt, referenceHints);
const asksForCheapest = (prompt: string) => includesAny(prompt, cheapestHints);
const asksForPriciest = (prompt: string) => includesAny(prompt, priciestHints);

const looksLikeExplanationPrompt = (prompt: string) => includesAny(prompt, explanationHints);

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

const replyMentionsResolvedItems = (reply: string, itemIds: string[]) => {
  const normalizedReply = normalizeText(reply);
  if (!normalizedReply) {
    return false;
  }

  return itemIds.some((itemId) => {
    const item = menuById.get(itemId);
    if (!item) {
      return false;
    }

    const normalizedName = normalizeText(item.name);
    const withoutCategory = normalizeText(item.name.replace(/ roll$/i, "").replace(/ ramen$/i, ""));

    return (
      normalizedReply.includes(normalizedName) ||
      (withoutCategory.length > 0 && normalizedReply.includes(withoutCategory))
    );
  });
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
        itemId,
        quantity: Math.max(1, plan?.quantity ?? 1),
        spiceLevel: plan?.spiceLevel,
      }));
    case "remove_items":
      return resolvedItemIds
        .filter((itemId) => request.cartItems.some((item) => item.itemId === itemId))
        .map((itemId) => ({
          type: "remove_item" as const,
          itemId,
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

const extractRequestedCategories = (prompt: string) => {
  const categories = new Set<MenuItem["category"]>();

  if (prompt.includes("ramen") || prompt.includes("\u62c9\u9762")) {
    categories.add("ramen");
  }

  if (
    prompt.includes("roll") ||
    prompt.includes("sushi") ||
    prompt.includes("\u5bff\u53f8") ||
    prompt.includes("\u5377")
  ) {
    categories.add("rolls");
  }

  if (
    prompt.includes("appetizer") ||
    prompt.includes("\u524d\u83dc") ||
    prompt.includes("\u5c0f\u5403")
  ) {
    categories.add("appetizers");
  }

  if (prompt.includes("salad") || prompt.includes("\u6c99\u62c9")) {
    categories.add("salads");
  }

  if (prompt.includes("main") || prompt.includes("\u4e3b\u83dc")) {
    categories.add("rolls");
    categories.add("ramen");
  }

  return categories.size > 0 ? [...categories] : null;
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
  const ordinalIndex = extractOrdinalIndex(prompt, latestReferencedIds.length);

  if (ordinalIndex !== null && latestReferencedIds[ordinalIndex]) {
    return [latestReferencedIds[ordinalIndex]];
  }

  if (directMatches.length > 0) {
    return directMatches;
  }

  if (latestReferencedIds.length === 0) {
    return [];
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

const sanitizeActions = (actions: BistroAiAction[], cartItems: BistroAiRequest["cartItems"]) => {
  const normalized: BistroAiAction[] = [];

  actions.forEach((action) => {
    switch (action.type) {
      case "add_item": {
        if (!menuById.has(action.itemId)) {
          return;
        }

        const quantity = Number.isFinite(action.quantity) ? Math.max(1, Math.round(action.quantity)) : 1;
        normalized.push({
          ...action,
          quantity,
        });
        return;
      }
      case "remove_item": {
        if (!menuById.has(action.itemId)) {
          return;
        }

        if (!cartItems.some((item) => item.itemId === action.itemId)) {
          return;
        }

        normalized.push(action);
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

  return normalized;
};

const inferActionsFromPrompt = (intent: BistroAiIntent, request: BistroAiRequest) => {
  const prompt = normalizeText(request.prompt);
  const contextualItemIds = resolveContextualItemIds(request, prompt);

  switch (intent) {
    case "add_items":
      return unique([
        ...findItemMatches(prompt).map((match) => ({
          type: "add_item" as const,
          itemId: match.itemId,
          quantity: match.quantity,
          spiceLevel: match.spiceLevel,
        })),
        ...contextualItemIds.map((itemId) => ({
          type: "add_item" as const,
          itemId,
          quantity: 1,
        })),
      ]).filter(
        (action, index, actions) =>
          actions.findIndex((entry) => entry.type === action.type && entry.itemId === action.itemId) === index,
      );
    case "remove_items":
      return unique([
        ...findCartRemovalMatches(prompt, request.cartItems),
        ...contextualItemIds.filter((itemId) => request.cartItems.some((item) => item.itemId === itemId)),
      ]).map((itemId) => ({
        type: "remove_item" as const,
        itemId,
      }));
    case "clear_cart":
      return isClearCartIntent(prompt) && request.cartItems.length > 0 ? [{ type: "clear_cart" as const }] : [];
    default:
      return [];
  }
};

const inferSuggestionsFromPrompt = (intent: BistroAiIntent, prompt: string) => {
  if (intent !== "recommend_items") {
    return [];
  }

  return scoreRecommendation(prompt)
    .filter((entry) => entry.score > 0)
    .slice(0, 3)
    .map((entry) => entry.item.id);
};

const buildActionReply = (actions: BistroAiAction[], preferChinese: boolean) => {
  const addActions = actions.filter(isAddAction);
  if (addActions.length > 0) {
    const lines = addActions.map((action) => {
      const itemName = menuById.get(action.itemId)?.name ?? action.itemId;
      return `${action.quantity} x ${itemName}`;
    });

    return preferChinese
      ? `\u6211\u627e\u5230\u4e86 ${lines.join(" \u548c ")}\u3002\u8bf7\u786e\u8ba4\u4e0b\u9762\u7684\u8d2d\u7269\u8f66\u53d8\u66f4\u3002`
      : `I found ${lines.join(" and ")}. Review the cart changes below.`;
  }

  if (actions.some((action) => action.type === "remove_item")) {
    const labels = actions
      .filter((action): action is Extract<BistroAiAction, { type: "remove_item" }> => action.type === "remove_item")
      .map((action) => menuById.get(action.itemId)?.name ?? action.itemId);

    return preferChinese
      ? `\u6211\u5728\u4f60\u7684\u8d2d\u7269\u8f66\u91cc\u627e\u5230\u4e86 ${labels.join(" \u548c ")}\u3002\u8bf7\u786e\u8ba4\u4e0b\u9762\u7684\u5220\u9664\u64cd\u4f5c\u3002`
      : `I found ${labels.join(" and ")} in your cart. Review the removal below.`;
  }

  return preferChinese
    ? "\u6211\u53ef\u4ee5\u5e2e\u4f60\u6e05\u7a7a\u8d2d\u7269\u8f66\u3002\u8bf7\u786e\u8ba4\u4e0b\u9762\u7684\u53d8\u66f4\u3002"
    : "I can clear the cart for you. Review the change below.";
};

const buildUnavailableReply = (intent: BistroAiIntent, preferChinese: boolean, cartHasItems: boolean) => {
  if (intent === "remove_items") {
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

const buildRecommendationReply = (suggestedItemIds: string[], preferChinese: boolean) => {
  const lead = suggestedItemIds
    .slice(0, 2)
    .map((itemId) => menuById.get(itemId)?.name ?? itemId)
    .join(preferChinese ? " \u548c " : " and ");

  return preferChinese
    ? `\u6211\u4f1a\u5148\u63a8\u8350 ${lead}\u3002\u8fd9\u4e9b\u66f4\u8d34\u8fd1\u4f60\u7684\u9700\u6c42\u3002`
    : `I would start with ${lead}. They fit what you asked for.`;
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

export const validateAiResponse = (request: BistroAiRequest, response: BistroAiResponse): BistroAiResponse => {
  const preferChinese = hasChineseCharacters(request.prompt);
  const normalizedPrompt = normalizeText(request.prompt);
  const latestConversationItemIds = getLatestReferencedIds(request.conversation);
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
  let unavailableRequests = unique(
    response.unavailableRequests.filter((entry) => typeof entry === "string" && entry.trim().length > 0),
  );
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
  const promptSuggestsRemove = isExplicitRemovePrompt(normalizedPrompt);
  const promptSuggestsClear = isExplicitClearPrompt(normalizedPrompt);

  if (promptSuggestsClear) {
    intent = "clear_cart";
  } else if (promptSuggestsRemove) {
    intent = "remove_items";
  } else if (promptSuggestsAdd) {
    intent = "add_items";
  }

  const explicitActionIntent =
    promptSuggestsAdd || promptSuggestsRemove || promptSuggestsClear;

  const actionIntent = intent === "add_items" || intent === "remove_items" || intent === "clear_cart";
  const modelWasOvereager = actionIntent && actions.length > 0 && !explicitActionIntent;

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

  if (actionIntent && explicitActionIntent && actions.length === 0) {
    actions = sanitizeActions(resolveActionsFromSelectionPlan(intent, request, selectionPlan), request.cartItems);
  }

  if (actionIntent && explicitActionIntent && actions.length === 0) {
    actions = sanitizeActions(inferActionsFromPrompt(intent, request), request.cartItems);
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
    suggestedItemIds = sanitizeSuggestedItemIds(inferSuggestionsFromPrompt(intent, normalizedPrompt));
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

  if (actionIntent && explicitActionIntent && actions.length === 0 && unavailableRequests.length === 0) {
    unavailableRequests = [request.prompt];
  }

  let reply = response.reply.trim();
  const shouldForceChineseReply = preferChinese && !hasChineseCharacters(reply);
  const ambiguousContextReference =
    contextualItemIds.length === 0 && hasReferenceHint(normalizedPrompt) && latestConversationItemIds.length > 1;
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
  } else if (explicitActionIntent && actions.length > 0) {
    reply = buildActionReply(actions, preferChinese);
  } else if (explicitActionIntent && actions.length === 0) {
    reply =
      ambiguousContextReference
        ? preferChinese
          ? "\u6211\u77e5\u9053\u4f60\u5728\u8bf4\u4e4b\u524d\u63d0\u5230\u7684\u83dc\uff0c\u4f46\u8fd9\u53e5\u8bdd\u8fd8\u4e0d\u591f\u660e\u786e\u3002\u4f60\u53ef\u4ee5\u76f4\u63a5\u8bf4\u201c\u5e2e\u6211\u52a0\u7b2c\u4e00\u4e2a\u201d\u6216\u8005\u201c\u53ea\u52a0 Mango Salmon Delight\u201d\u3002"
          : "I know you mean one of the dishes we just discussed, but I still need a more specific add request."
        : buildUnavailableReply(intent, preferChinese, request.cartItems.length > 0);
  } else if (modelWasOvereager) {
    reply = buildAdvisoryReply(preferChinese);
  } else if (shouldForceChineseReply && intent === "recommend_items" && suggestedItemIds.length > 0) {
    reply = buildRecommendationReply(suggestedItemIds, true);
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
      reply = buildRecommendationReply(suggestedItemIds, preferChinese);
    } else if (unavailableRequests.length > 0) {
      reply = buildUnavailableReply(intent, preferChinese, request.cartItems.length > 0);
    } else {
      reply = preferChinese
        ? "\u6211\u7406\u89e3\u4e86\u4f60\u7684\u95ee\u9898\uff0c\u4e0d\u8fc7\u8fd8\u9700\u8981\u4f60\u518d\u5177\u4f53\u4e00\u70b9\u3002"
        : "I understand the question, but I need a little more detail.";
    }
  }

  return {
    intent,
    reply,
    needsConfirmation: actions.length > 0,
    actions,
    suggestedItemIds,
    referencedItemIds,
    unavailableRequests,
    selectionPlan,
  };
};
