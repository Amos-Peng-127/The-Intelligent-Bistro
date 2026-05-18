import { buildCartCatalog, buildMenuCatalog } from "../catalog";
import type {
  BistroAiAction,
  BistroAiClarificationOption,
  BistroAiConversationTurn,
  BistroAiIntent,
  BistroAiMissingSlot,
  BistroAiRequest,
  BistroAiResponse,
  BistroAiSelectionPlan,
} from "../types";

export type OllamaRuntimeConfig = {
  ollamaBaseUrl: string;
  ollamaModel: string;
};

const responseSchema = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: [
        "add_items",
        "update_items",
        "remove_items",
        "clear_cart",
        "recommend_items",
        "explain_items",
        "clarify",
        "answer_question",
      ],
    },
    reply: { type: "string" },
    needsConfirmation: { type: "boolean" },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["add_item", "set_quantity", "remove_item", "clear_cart"],
          },
          itemId: { type: "string" },
          quantity: { type: "integer", minimum: 1 },
          spiceLevel: { type: "string" },
          addOnIds: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["type"],
        additionalProperties: false,
      },
    },
    suggestedItemIds: {
      type: "array",
      items: { type: "string" },
    },
    referencedItemIds: {
      type: "array",
      items: { type: "string" },
    },
    unavailableRequests: {
      type: "array",
      items: { type: "string" },
    },
    missingSlots: {
      type: "array",
      items: {
        type: "string",
        enum: ["item", "quantity", "spice_level"],
      },
    },
    clarificationOptions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          prompt: { type: "string" },
        },
        required: ["label", "prompt"],
        additionalProperties: false,
      },
    },
    selectionPlan: {
      type: "object",
      properties: {
        source: {
          type: "string",
          enum: ["menu", "recent_referenced_items", "recent_suggested_items", "current_cart"],
        },
        itemIds: {
          type: "array",
          items: { type: "string" },
        },
        query: { type: "string" },
        tags: {
          type: "array",
          items: { type: "string" },
        },
        category: {
          type: "string",
          enum: ["rolls", "ramen", "appetizers", "salads"],
        },
        spiceLevel: { type: "string" },
        addOnIds: {
          type: "array",
          items: { type: "string" },
        },
        sortBy: {
          type: "string",
          enum: ["relevance", "price"],
        },
        sortDirection: {
          type: "string",
          enum: ["asc", "desc"],
        },
        take: { type: "integer", minimum: 1, maximum: 10 },
        quantity: { type: "integer", minimum: 1, maximum: 20 },
      },
      required: ["source"],
      additionalProperties: false,
    },
  },
  required: [
    "intent",
    "reply",
    "needsConfirmation",
    "actions",
    "suggestedItemIds",
    "referencedItemIds",
    "unavailableRequests",
    "missingSlots",
    "clarificationOptions",
  ],
  additionalProperties: false,
} as const;

type LegacyModelResponse = {
  intent?: string;
  actions?: {
    add?: Array<{ id?: string; amount?: number | string }>;
    remove?: Array<{ id?: string }>;
    clear?: boolean;
    suggestedItemsIds?: string[];
    unavailableRequests?: string[];
  };
  reply?: string | Record<string, unknown>;
  confirmationNeeded?: boolean;
  needsConfirmation?: boolean;
  suggestedItemIds?: string[];
  referencedItemIds?: string[];
  unavailableRequests?: string[];
  missingSlots?: string[];
  clarificationOptions?: Array<{ label?: string; prompt?: string }>;
  selectionPlan?: unknown;
};

const systemPrompt = `You are Bistro AI for a sushi and ramen menu.
Return JSON only.
The user may ask in English or Chinese. Reply in the same language when possible.
If the latest user request contains any Chinese characters, write the reply fully in Chinese except for menu item names or ids.

Your job:
- Understand the user's intent first.
- Use the menu catalog and recent conversation context.
- Only create cart actions when the user clearly wants the cart changed now.

Intent rules:
- add_items: the user explicitly wants items added to the cart now.
- update_items: the user explicitly wants the quantity of an item in the cart changed now.
- remove_items: the user explicitly wants items removed from the cart now.
- clear_cart: the user explicitly wants the cart cleared now.
- recommend_items: the user wants suggestions on what to order.
- explain_items: the user asks about flavor, texture, differences, or follow-up questions about dishes.
- clarify: the request is ambiguous and needs a short question.
- answer_question: the user is asking for advice or a general answer without changing the cart.

Safety rules:
- Questions like "should I add this", "how about this dish", or "what do you think about adding this" are not cart changes.
- If the user asks a follow-up like "what are those dishes like", use the recent conversation.
- Keep actions empty unless the order edit is explicit.
- Use set_quantity when the user wants an existing cart item changed to a specific quantity, such as "change mango salmon delight to one".
- When the user specifies spice or add-ons, include spiceLevel and/or addOnIds in the action or selectionPlan.
- Never say an item has already been added, removed, or cleared unless the cart change is only being proposed for confirmation.
- If the target depends on context, ranking, comparison, price, or relative language like "this", "that", "the cheapest one", or "the second one", use selectionPlan instead of guessing a final item id in actions.
- Use actions directly only when the item ids are explicit and unambiguous right now.
- selectionPlan.source must be one of: menu, recent_referenced_items, recent_suggested_items, current_cart.
- selectionPlan.query should summarize the selection constraint, such as "autumn", "cheapest", "spicy vegetarian", or "second one".
- For quantity changes that depend on cart context, use selectionPlan.source=current_cart and include selectionPlan.quantity.
- Use selectionPlan.sortBy=price with sortDirection=asc for "cheapest" and sortDirection=desc for "most expensive".
- Only use menu item ids that exist in the catalog.
- Only use addOnIds that belong to the selected menu item.
- If you recommend or explain dishes, include real item ids in referencedItemIds. Put recommendation ids in suggestedItemIds too when relevant.
- If the user asks to remove something not in the current cart, explain that and return no actions.
- If you are unsure which dish the user means, ask a short clarification question and return no actions.
- If you need clarification, fill missingSlots with item, quantity, and/or spice_level, and provide 2 to 4 clarificationOptions with short labels and natural next-user prompts.
- clarificationOptions should be grounded in the menu or current cart. Do not invent dishes or ids.
- Do not invent prices, items, or add-ons.
- Keep the reply concise and helpful.`;

const hasChineseCharacters = (value: string) => /[\u4e00-\u9fff]/.test(value);

const normalizeStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

const normalizeIntent = (value: unknown, fallback: BistroAiIntent): BistroAiIntent => {
  if (
    value === "add_items" ||
    value === "update_items" ||
    value === "remove_items" ||
    value === "clear_cart" ||
    value === "recommend_items" ||
    value === "explain_items" ||
    value === "clarify" ||
    value === "answer_question"
  ) {
    return value;
  }

  return fallback;
};

const normalizeMissingSlots = (value: unknown): BistroAiMissingSlot[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value.filter(
        (entry): entry is BistroAiMissingSlot =>
          entry === "item" || entry === "quantity" || entry === "spice_level",
      ),
    ),
  ];
};

const normalizeClarificationOptions = (value: unknown): BistroAiClarificationOption[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      const option = entry as Record<string, unknown>;
      const label = typeof option.label === "string" ? option.label.trim() : "";
      const prompt = typeof option.prompt === "string" ? option.prompt.trim() : "";
      if (!label || !prompt) {
        return [];
      }

      return [{ label, prompt }];
    })
    .slice(0, 4);
};

const normalizeSelectionPlan = (value: unknown): BistroAiSelectionPlan | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rawPlan = value as Record<string, unknown>;
  const source =
    rawPlan.source === "menu" ||
    rawPlan.source === "recent_referenced_items" ||
    rawPlan.source === "recent_suggested_items" ||
    rawPlan.source === "current_cart"
      ? rawPlan.source
      : "menu";

  const normalized: BistroAiSelectionPlan = {
    source,
  };

  const itemIds = normalizeStringArray(rawPlan.itemIds);
  if (itemIds.length > 0) {
    normalized.itemIds = itemIds;
  }

  if (typeof rawPlan.query === "string" && rawPlan.query.trim().length > 0) {
    normalized.query = rawPlan.query.trim();
  }

  const tags = normalizeStringArray(rawPlan.tags);
  if (tags.length > 0) {
    normalized.tags = tags;
  }

  if (
    rawPlan.category === "rolls" ||
    rawPlan.category === "ramen" ||
    rawPlan.category === "appetizers" ||
    rawPlan.category === "salads"
  ) {
    normalized.category = rawPlan.category;
  }

  if (typeof rawPlan.spiceLevel === "string" && rawPlan.spiceLevel.trim().length > 0) {
    normalized.spiceLevel = rawPlan.spiceLevel.trim();
  }

  const hasAddOnIds = Array.isArray(rawPlan.addOnIds);
  const addOnIds = normalizeStringArray(rawPlan.addOnIds);
  if (hasAddOnIds) {
    normalized.addOnIds = [...new Set(addOnIds)];
  }

  if (rawPlan.sortBy === "relevance" || rawPlan.sortBy === "price") {
    normalized.sortBy = rawPlan.sortBy;
  }

  if (rawPlan.sortDirection === "asc" || rawPlan.sortDirection === "desc") {
    normalized.sortDirection = rawPlan.sortDirection;
  }

  if (typeof rawPlan.take === "number" && Number.isFinite(rawPlan.take) && rawPlan.take > 0) {
    normalized.take = Math.min(10, Math.round(rawPlan.take));
  }

  if (typeof rawPlan.quantity === "number" && Number.isFinite(rawPlan.quantity) && rawPlan.quantity > 0) {
    normalized.quantity = Math.min(20, Math.round(rawPlan.quantity));
  }

  if (
    !normalized.itemIds &&
    !normalized.query &&
    !normalized.tags &&
    !normalized.category &&
    !normalized.spiceLevel &&
    !normalized.addOnIds &&
    !normalized.sortBy &&
    !normalized.sortDirection &&
    !normalized.take &&
    !normalized.quantity &&
    normalized.source === "menu"
  ) {
    return null;
  }

  return normalized;
};

const inferIntentFromFields = (actions: BistroAiAction[], suggestedItemIds: string[], referencedItemIds: string[]) => {
  if (actions.some((action) => action.type === "clear_cart")) {
    return "clear_cart" as const;
  }

  if (actions.some((action) => action.type === "set_quantity")) {
    return "update_items" as const;
  }

  if (actions.some((action) => action.type === "remove_item")) {
    return "remove_items" as const;
  }

  if (actions.some((action) => action.type === "add_item")) {
    return "add_items" as const;
  }

  if (suggestedItemIds.length > 0) {
    return "recommend_items" as const;
  }

  if (referencedItemIds.length > 0) {
    return "explain_items" as const;
  }

  return "answer_question" as const;
};

const extractJsonObject = (content: string) => {
  const trimmed = content.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {}

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
};

const extractJsonStringField = (content: string, field: string) => {
  const pattern = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "s");
  const match = pattern.exec(content);
  if (!match) {
    return null;
  }

  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1]
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
};

const extractJsonBooleanField = (content: string, field: string) => {
  const pattern = new RegExp(`"${field}"\\s*:\\s*(true|false)`, "i");
  const match = pattern.exec(content);
  if (!match) {
    return null;
  }

  return match[1].toLowerCase() === "true";
};

const extractJsonStringArrayField = (content: string, field: string) => {
  const pattern = new RegExp(`"${field}"\\s*:\\s*\\[([\\s\\S]*?)\\]`, "s");
  const match = pattern.exec(content);
  if (!match) {
    return [];
  }

  const values: string[] = [];
  const stringPattern = /"((?:\\.|[^"\\])*)"/g;

  for (const item of match[1].matchAll(stringPattern)) {
    try {
      values.push(JSON.parse(`"${item[1]}"`) as string);
    } catch {
      values.push(item[1]);
    }
  }

  return values;
};

const extractLooseActions = (content: string): BistroAiAction[] => {
  const pattern = /"actions"\s*:\s*\[([\s\S]*?)\]/s;
  const match = pattern.exec(content);
  if (!match) {
    return [];
  }

  const objectPattern = /\{[\s\S]*?\}/g;
  const actions: BistroAiAction[] = [];

  for (const rawAction of match[1].match(objectPattern) ?? []) {
    const type = extractJsonStringField(rawAction, "type");
    if (type === "clear_cart") {
      actions.push({ type: "clear_cart" });
      continue;
    }

    const itemId = extractJsonStringField(rawAction, "itemId");
    if (!itemId) {
      continue;
    }

    const spiceLevel = extractJsonStringField(rawAction, "spiceLevel") ?? undefined;
    const hasAddOnIds = /"addOnIds"\s*:\s*\[/.test(rawAction);
    const addOnIds = extractJsonStringArrayField(rawAction, "addOnIds");

    if (type === "remove_item") {
      actions.push({
        type: "remove_item",
        addOnIds: hasAddOnIds ? addOnIds : undefined,
        itemId,
        spiceLevel,
      });
      continue;
    }

    if (type === "add_item" || type === "set_quantity") {
      const quantityMatch = /"quantity"\s*:\s*(\d+)/.exec(rawAction);
      actions.push({
        type,
        addOnIds: hasAddOnIds ? addOnIds : undefined,
        itemId,
        quantity: quantityMatch ? Math.max(1, Number(quantityMatch[1])) : 1,
        spiceLevel,
      });
    }
  }

  return actions;
};

const extractLooseSelectionPlan = (content: string) => {
  const pattern = /"selectionPlan"\s*:\s*(\{[\s\S]*?\})/s;
  const match = pattern.exec(content);
  if (!match) {
    return null;
  }

  const rawPlan = match[1];

  const hasAddOnIds = /"addOnIds"\s*:\s*\[/.test(rawPlan);

  return normalizeSelectionPlan({
    source: extractJsonStringField(rawPlan, "source") ?? "menu",
    itemIds: extractJsonStringArrayField(rawPlan, "itemIds"),
    query: extractJsonStringField(rawPlan, "query") ?? undefined,
    tags: extractJsonStringArrayField(rawPlan, "tags"),
    category: extractJsonStringField(rawPlan, "category") ?? undefined,
    spiceLevel: extractJsonStringField(rawPlan, "spiceLevel") ?? undefined,
    addOnIds: hasAddOnIds ? extractJsonStringArrayField(rawPlan, "addOnIds") : undefined,
    sortBy: extractJsonStringField(rawPlan, "sortBy") ?? undefined,
    sortDirection: extractJsonStringField(rawPlan, "sortDirection") ?? undefined,
    take: (() => {
      const value = /"take"\s*:\s*(\d+)/.exec(rawPlan);
      return value ? Number(value[1]) : undefined;
    })(),
    quantity: (() => {
      const value = /"quantity"\s*:\s*(\d+)/.exec(rawPlan);
      return value ? Number(value[1]) : undefined;
    })(),
  });
};

const extractLooseStructuredResponse = (content: string): BistroAiResponse | null => {
  if (!content.includes('"reply"') && !content.includes('"intent"')) {
    return null;
  }

  const reply = extractJsonStringField(content, "reply") ?? "";
  const suggestedItemIds = extractJsonStringArrayField(content, "suggestedItemIds");
  const referencedItemIds = extractJsonStringArrayField(content, "referencedItemIds");
  const actions = extractLooseActions(content);
  const fallbackIntent = inferIntentFromFields(actions, suggestedItemIds, referencedItemIds);

  return {
    intent: normalizeIntent(extractJsonStringField(content, "intent"), fallbackIntent),
    reply,
    needsConfirmation: extractJsonBooleanField(content, "needsConfirmation") ?? actions.length > 0,
    actions,
    suggestedItemIds,
    referencedItemIds,
    unavailableRequests: extractJsonStringArrayField(content, "unavailableRequests"),
    missingSlots: normalizeMissingSlots(extractJsonStringArrayField(content, "missingSlots")),
    clarificationOptions: [],
    selectionPlan: extractLooseSelectionPlan(content),
  };
};

const normalizeActions = (actions: unknown): BistroAiAction[] => {
  if (!Array.isArray(actions)) {
    return [];
  }

  return actions.reduce<BistroAiAction[]>((normalized, action) => {
    if (!action || typeof action !== "object" || !("type" in action)) {
      return normalized;
    }

    const rawAction = action as Record<string, unknown>;

    if (rawAction.type === "add_item" && typeof rawAction.itemId === "string") {
      const hasAddOnIds = Array.isArray(rawAction.addOnIds);
      const addOnIds = normalizeStringArray(rawAction.addOnIds);
      normalized.push({
        type: "add_item",
        addOnIds: hasAddOnIds ? [...new Set(addOnIds)] : undefined,
        itemId: rawAction.itemId,
        quantity:
          typeof rawAction.quantity === "number" && rawAction.quantity > 0
            ? Math.round(rawAction.quantity)
            : 1,
        spiceLevel: typeof rawAction.spiceLevel === "string" ? rawAction.spiceLevel : undefined,
      });
      return normalized;
    }

    if (rawAction.type === "set_quantity" && typeof rawAction.itemId === "string") {
      const hasAddOnIds = Array.isArray(rawAction.addOnIds);
      const addOnIds = normalizeStringArray(rawAction.addOnIds);
      normalized.push({
        type: "set_quantity",
        addOnIds: hasAddOnIds ? [...new Set(addOnIds)] : undefined,
        itemId: rawAction.itemId,
        quantity:
          typeof rawAction.quantity === "number" && rawAction.quantity > 0
            ? Math.round(rawAction.quantity)
            : 1,
        spiceLevel: typeof rawAction.spiceLevel === "string" ? rawAction.spiceLevel : undefined,
      });
      return normalized;
    }

    if (rawAction.type === "remove_item" && typeof rawAction.itemId === "string") {
      const hasAddOnIds = Array.isArray(rawAction.addOnIds);
      const addOnIds = normalizeStringArray(rawAction.addOnIds);
      normalized.push({
        type: "remove_item",
        addOnIds: hasAddOnIds ? [...new Set(addOnIds)] : undefined,
        itemId: rawAction.itemId,
        spiceLevel: typeof rawAction.spiceLevel === "string" ? rawAction.spiceLevel : undefined,
      });
      return normalized;
    }

    if (rawAction.type === "clear_cart") {
      normalized.push({ type: "clear_cart" });
    }

    return normalized;
  }, []);
};

const normalizeLegacyModelResponse = (parsed: LegacyModelResponse): BistroAiResponse => {
  const actions: BistroAiAction[] = [];

  parsed.actions?.add?.forEach((item) => {
    if (!item.id) {
      return;
    }

    const quantity = Number(item.amount);
    actions.push({
      type: "add_item",
      itemId: item.id,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    });
  });

  parsed.actions?.remove?.forEach((item) => {
    if (!item.id) {
      return;
    }

    actions.push({
      type: "remove_item",
      itemId: item.id,
    });
  });

  if (parsed.actions?.clear) {
    actions.push({ type: "clear_cart" });
  }

  const suggestedItemIds = normalizeStringArray(parsed.suggestedItemIds ?? parsed.actions?.suggestedItemsIds);
  const referencedItemIds = normalizeStringArray(parsed.referencedItemIds);
  const fallbackIntent = inferIntentFromFields(actions, suggestedItemIds, referencedItemIds);
  const reply =
    typeof parsed.reply === "string"
      ? parsed.reply
      : typeof parsed.reply === "object" && parsed.reply && "message" in parsed.reply && typeof parsed.reply.message === "string"
        ? parsed.reply.message
        : "I parsed a tentative response from the local model.";

  return {
    intent: normalizeIntent(parsed.intent, fallbackIntent),
    reply,
    needsConfirmation: Boolean(parsed.needsConfirmation ?? parsed.confirmationNeeded ?? actions.length > 0),
    actions,
    suggestedItemIds,
    referencedItemIds,
    unavailableRequests: normalizeStringArray(parsed.unavailableRequests ?? parsed.actions?.unavailableRequests),
    missingSlots: normalizeMissingSlots(parsed.missingSlots),
    clarificationOptions: normalizeClarificationOptions(parsed.clarificationOptions),
    selectionPlan: normalizeSelectionPlan(parsed.selectionPlan),
  };
};

const buildConversationCatalog = (conversation: BistroAiConversationTurn[] = []) => {
  if (conversation.length === 0) {
    return "No recent conversation.";
  }

  return conversation
    .slice(-6)
    .map((turn, index) => {
      const parts = [`${index + 1}. ${turn.role}: ${turn.text}`];

      if (turn.suggestedItemIds?.length) {
        parts.push(`assistant suggested dishes -> ${turn.suggestedItemIds.join(", ")}`);
      }

      if (turn.referencedItemIds?.length) {
        parts.push(`assistant referenced dishes -> ${turn.referencedItemIds.join(", ")}`);
      }

      if (turn.actions?.length) {
        parts.push(
          `assistant proposed actions -> ${turn.actions
            .map((action) =>
              action.type === "clear_cart"
                ? "clear_cart"
                : [
                    action.type,
                    action.itemId,
                    action.type === "add_item" || action.type === "set_quantity" ? action.quantity : null,
                    "spiceLevel" in action ? action.spiceLevel ?? null : null,
                    "addOnIds" in action && Array.isArray(action.addOnIds) ? action.addOnIds.join("+") : null,
                  ]
                    .filter((part) => part !== null && part !== "")
                    .join(":"),
            )
            .join(", ")}`,
        );
      }

      if (turn.command) {
        parts.push(
          `assistant command -> ${turn.command.state}:${turn.command.intent}:executable=${turn.command.executable}`,
        );
      }

      if (turn.missingSlots?.length) {
        parts.push(`assistant still needs -> ${turn.missingSlots.join(", ")}`);
      }

      if (turn.clarificationOptions?.length) {
        parts.push(
          `assistant clarification options -> ${turn.clarificationOptions
            .map((option) => option.label)
            .join(", ")}`,
        );
      }

      if (turn.selectionPlan) {
        parts.push(`assistant selection hint -> ${JSON.stringify(turn.selectionPlan)}`);
      }

      return parts.join(" | ");
    })
    .join("\n");
};

const buildStructuredFallback = (prompt: string, content?: string): BistroAiResponse => ({
  intent: "clarify",
  reply:
    (content?.trim() && !content.trim().startsWith("{") ? content.trim() : "") ||
    (hasChineseCharacters(prompt)
      ? "\u6211\u521a\u624d\u6ca1\u80fd\u7a33\u5b9a\u89e3\u6790\u90a3\u6761\u56de\u590d\u3002\u4f60\u53ef\u4ee5\u6362\u4e00\u79cd\u8bf4\u6cd5\uff0c\u6216\u8005\u76f4\u63a5\u70b9\u540d\u83dc\u54c1\u7ee7\u7eed\u95ee\u6211\u3002"
      : "I lost the structured reply on that turn. Try asking again or mention the dish by name."),
  needsConfirmation: false,
  actions: [],
  suggestedItemIds: [],
  referencedItemIds: [],
  unavailableRequests: [],
  missingSlots: [],
  clarificationOptions: [],
  selectionPlan: null,
});

const ollamaKeepAlive = "15m";
const ollamaRequestTimeoutMs = 45000;
const ollamaWarmTimeoutMs = 30000;

export async function warmOllamaModel(config: OllamaRuntimeConfig) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ollamaWarmTimeoutMs);

  const response = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: controller.signal,
    body: JSON.stringify({
      model: config.ollamaModel,
      keep_alive: ollamaKeepAlive,
      messages: [],
    }),
  })
    .catch((error) => {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("The local model warm-up timed out.");
      }

      throw new Error(
        `Could not reach Ollama at ${config.ollamaBaseUrl}. Start Ollama and make sure ${config.ollamaModel} is pulled.`,
      );
    })
    .finally(() => clearTimeout(timeoutId));

  const payload = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok || payload?.error) {
    throw new Error(payload?.error ?? "The local model warm-up failed.");
  }
}

export async function submitOllamaOrderPrompt(
  {
    prompt,
    cartItems,
    conversation,
  }: BistroAiRequest,
  config: OllamaRuntimeConfig,
): Promise<BistroAiResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ollamaRequestTimeoutMs);

  const response = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: controller.signal,
    body: JSON.stringify({
      model: config.ollamaModel,
      keep_alive: ollamaKeepAlive,
      stream: false,
      format: responseSchema,
      options: {
        temperature: 0.1,
        num_predict: 220,
      },
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: [
            `Latest user request: ${prompt}`,
            "",
            "Recent conversation:",
            buildConversationCatalog(conversation),
            "",
            "Current cart:",
            buildCartCatalog(cartItems),
            "",
            "Menu catalog:",
            buildMenuCatalog(),
          ].join("\n"),
        },
      ],
    }),
  })
    .catch((error) => {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          "The local model took too long to answer. It may still be warming up, so try again in a moment.",
        );
      }

      throw new Error(
        `Could not reach Ollama at ${config.ollamaBaseUrl}. Start Ollama and make sure ${config.ollamaModel} is pulled.`,
      );
    })
    .finally(() => clearTimeout(timeoutId));

  const payload = (await response.json()) as {
    error?: string;
    message?: { content?: string };
  };

  if (!response.ok || payload.error) {
    throw new Error(payload.error ?? "The local model request failed.");
  }

  const rawContent = payload.message?.content ?? "";
  const parsed = extractJsonObject(rawContent) ?? extractLooseStructuredResponse(rawContent);
  if (!parsed || typeof parsed !== "object") {
    return buildStructuredFallback(prompt, rawContent);
  }

  if ("confirmationNeeded" in parsed || ("actions" in parsed && !Array.isArray(parsed.actions))) {
    return normalizeLegacyModelResponse(parsed as LegacyModelResponse);
  }

  const normalizedActions = normalizeActions((parsed as Record<string, unknown>).actions);
  const suggestedItemIds = normalizeStringArray((parsed as Record<string, unknown>).suggestedItemIds);
  const referencedItemIds = normalizeStringArray((parsed as Record<string, unknown>).referencedItemIds);
  const fallbackIntent = inferIntentFromFields(normalizedActions, suggestedItemIds, referencedItemIds);

  return {
    intent: normalizeIntent((parsed as Record<string, unknown>).intent, fallbackIntent),
    reply:
      typeof (parsed as Record<string, unknown>).reply === "string"
        ? ((parsed as Record<string, unknown>).reply as string)
        : buildStructuredFallback(prompt).reply,
    needsConfirmation: Boolean((parsed as Record<string, unknown>).needsConfirmation),
    actions: normalizedActions,
    suggestedItemIds,
    referencedItemIds,
    unavailableRequests: normalizeStringArray((parsed as Record<string, unknown>).unavailableRequests),
    missingSlots: normalizeMissingSlots((parsed as Record<string, unknown>).missingSlots),
    clarificationOptions: normalizeClarificationOptions((parsed as Record<string, unknown>).clarificationOptions),
    selectionPlan: normalizeSelectionPlan((parsed as Record<string, unknown>).selectionPlan),
  };
}
