const path = require("path");

require.extensions[".jpg"] = (module) => {
  module.exports = "mock-image.jpg";
};

require.extensions[".png"] = (module) => {
  module.exports = "mock-image.png";
};

const rootDir = process.cwd();
const jiti = require("jiti")(path.join(rootDir, "scripts", "ai-scenario-smoke.js"), {
  alias: {
    "@/": `${path.join(rootDir, "src")}/`,
    "react-native": path.join(rootDir, "scripts", "react-native-shim.js"),
  },
});

const { interpretOrderPrompt: submitOrderPrompt } = jiti("../server/lib/ai/interpret-order.ts");
const { menuItems } = jiti("../src/data/menu.ts");

const menuById = new Map(menuItems.map((item) => [item.id, item]));

const makeCartItem = (itemId, quantity = 1, options = {}) => {
  const item = menuById.get(itemId);
  if (!item) {
    throw new Error(`Unknown menu item: ${itemId}`);
  }

  const addOnsById = new Map((item.addOns ?? []).map((addOn) => [addOn.id, addOn]));
  const addOns = (options.addOnIds ?? []).flatMap((addOnId) => {
    const addOn = addOnsById.get(addOnId);
    return addOn ? [addOn] : [];
  });
  const spiceLevel = options.spiceLevel;
  const addOnKey = addOns.map((addOn) => addOn.id).sort().join("-");

  return {
    cartId: `${item.id}__${spiceLevel ?? "standard"}__${addOnKey || "none"}`,
    itemId: item.id,
    name: item.name,
    price: item.price,
    quantity,
    spiceLevel,
    addOns,
    image: item.image,
  };
};

const jsonContent = (value) => JSON.stringify(value);

const pushConversationTurn = (conversation, role, payload) => {
  conversation.push({
    role,
    text: payload.text,
    actions: payload.actions,
    referencedItemIds: payload.referencedItemIds,
    suggestedItemIds: payload.suggestedItemIds,
    selectionPlan: payload.selectionPlan,
    command: payload.command,
    missingSlots: payload.missingSlots,
    clarificationOptions: payload.clarificationOptions,
  });
};

const asList = (values) => (values.length > 0 ? values.join(", ") : "(none)");

const compareArray = (actual, expected) =>
  actual.length === expected.length && actual.every((value, index) => value === expected[index]);

const getActionTotal = (actions) =>
  actions.reduce((sum, action) => {
    if (!("itemId" in action)) {
      return sum;
    }

    const item = menuById.get(action.itemId);
    if (!item) {
      return sum;
    }

    const addOnsById = new Map((item.addOns ?? []).map((addOn) => [addOn.id, addOn.price]));
    const addOnTotal = (action.addOnIds ?? []).reduce((actionSum, addOnId) => actionSum + (addOnsById.get(addOnId) ?? 0), 0);
    return sum + (item.price + addOnTotal) * (action.quantity ?? 1);
  }, 0);

const getSuggestedTotal = (itemIds) =>
  itemIds.reduce((sum, itemId) => sum + (menuById.get(itemId)?.price ?? 0), 0);

const evaluateExpectations = (response, expected) => {
  const failures = [];

  if (expected.intent && response.intent !== expected.intent) {
    failures.push(`intent expected ${expected.intent} but got ${response.intent}`);
  }

  if (typeof expected.needsConfirmation === "boolean" && response.needsConfirmation !== expected.needsConfirmation) {
    failures.push(
      `needsConfirmation expected ${expected.needsConfirmation} but got ${response.needsConfirmation}`,
    );
  }

  if (expected.actionTypes) {
    const actual = response.actions.map((action) => action.type);
    if (!compareArray(actual, expected.actionTypes)) {
      failures.push(`actionTypes expected [${expected.actionTypes.join(", ")}] but got [${actual.join(", ")}]`);
    }
  }

  if (expected.actionItemIds) {
    const actual = response.actions
      .filter((action) => "itemId" in action)
      .map((action) => action.itemId);
    if (!compareArray(actual, expected.actionItemIds)) {
      failures.push(`actionItemIds expected [${expected.actionItemIds.join(", ")}] but got [${actual.join(", ")}]`);
    }
  }

  if (expected.actionAddOnIds) {
    const normalizeNestedArray = (values) => values.map((value) => JSON.stringify([...value].sort()));
    const actual = response.actions.map((action) => ("addOnIds" in action ? action.addOnIds ?? [] : []));
    if (!compareArray(normalizeNestedArray(actual), normalizeNestedArray(expected.actionAddOnIds))) {
      failures.push(
        `actionAddOnIds expected [${normalizeNestedArray(expected.actionAddOnIds).join(", ")}] but got [${normalizeNestedArray(actual).join(", ")}]`,
      );
    }
  }

  if (expected.actionSpiceLevels) {
    const actual = response.actions.map((action) => ("spiceLevel" in action ? action.spiceLevel ?? null : null));
    const expectedValues = expected.actionSpiceLevels.map((value) => value ?? null);
    if (!compareArray(actual, expectedValues)) {
      failures.push(`actionSpiceLevels expected [${expectedValues.join(", ")}] but got [${actual.join(", ")}]`);
    }
  }

  if (typeof expected.actionCount === "number") {
    const actual = response.actions.reduce(
      (sum, action) => sum + (action.type === "add_item" ? action.quantity : action.type === "remove_item" ? 1 : 0),
      0,
    );
    if (actual !== expected.actionCount) {
      failures.push(`actionCount expected ${expected.actionCount} but got ${actual}`);
    }
  }

  if (typeof expected.actionTotalMax === "number") {
    const actual = getActionTotal(response.actions);
    if (actual > expected.actionTotalMax) {
      failures.push(`actionTotal expected <= ${expected.actionTotalMax} but got ${actual}`);
    }
  }

  if (expected.suggestedItemIds) {
    if (!compareArray(response.suggestedItemIds, expected.suggestedItemIds)) {
      failures.push(
        `suggestedItemIds expected [${expected.suggestedItemIds.join(", ")}] but got [${response.suggestedItemIds.join(", ")}]`,
      );
    }
  }

  if (typeof expected.suggestedCount === "number" && response.suggestedItemIds.length !== expected.suggestedCount) {
    failures.push(`suggestedCount expected ${expected.suggestedCount} but got ${response.suggestedItemIds.length}`);
  }

  if (typeof expected.suggestedTotalMax === "number") {
    const actual = getSuggestedTotal(response.suggestedItemIds);
    if (actual > expected.suggestedTotalMax) {
      failures.push(`suggestedTotal expected <= ${expected.suggestedTotalMax} but got ${actual}`);
    }
  }

  if (expected.unavailableRequests) {
    if (!compareArray(response.unavailableRequests, expected.unavailableRequests)) {
      failures.push(
        `unavailableRequests expected [${expected.unavailableRequests.join(", ")}] but got [${response.unavailableRequests.join(", ")}]`,
      );
    }
  }

  if (typeof expected.unavailableCount === "number" && response.unavailableRequests.length !== expected.unavailableCount) {
    failures.push(`unavailableCount expected ${expected.unavailableCount} but got ${response.unavailableRequests.length}`);
  }

  if (expected.missingSlots) {
    const actual = response.missingSlots ?? [];
    if (!compareArray(actual, expected.missingSlots)) {
      failures.push(`missingSlots expected [${expected.missingSlots.join(", ")}] but got [${actual.join(", ")}]`);
    }
  }

  if (
    typeof expected.clarificationOptionCount === "number" &&
    (response.clarificationOptions?.length ?? 0) !== expected.clarificationOptionCount
  ) {
    failures.push(
      `clarificationOptionCount expected ${expected.clarificationOptionCount} but got ${response.clarificationOptions?.length ?? 0}`,
    );
  }

  if (expected.clarificationOptionLabelsInclude) {
    const actualLabels = response.clarificationOptions?.map((option) => option.label) ?? [];
    const missing = expected.clarificationOptionLabelsInclude.filter((label) => !actualLabels.includes(label));
    if (missing.length > 0) {
      failures.push(`clarificationOptions missing labels [${missing.join(", ")}]`);
    }
  }

  if (expected.commandState) {
    const actual = response.command?.state ?? null;
    if (actual !== expected.commandState) {
      failures.push(`command.state expected ${expected.commandState} but got ${actual}`);
    }
  }

  if (typeof expected.commandExecutable === "boolean") {
    const actual = response.command?.executable ?? false;
    if (actual !== expected.commandExecutable) {
      failures.push(`command.executable expected ${expected.commandExecutable} but got ${actual}`);
    }
  }

  if (expected.referencedMustInclude) {
    const missing = expected.referencedMustInclude.filter(
      (itemId) => !response.referencedItemIds.includes(itemId),
    );
    if (missing.length > 0) {
      failures.push(`referencedItemIds missing [${missing.join(", ")}]`);
    }
  }

  if (expected.selectionPlanSource) {
    const actual = response.selectionPlan?.source ?? null;
    if (actual !== expected.selectionPlanSource) {
      failures.push(`selectionPlan.source expected ${expected.selectionPlanSource} but got ${actual}`);
    }
  }

  if (expected.selectionPlanSortBy) {
    const actual = response.selectionPlan?.sortBy ?? null;
    if (actual !== expected.selectionPlanSortBy) {
      failures.push(`selectionPlan.sortBy expected ${expected.selectionPlanSortBy} but got ${actual}`);
    }
  }

  if (expected.replyIncludes) {
    expected.replyIncludes.forEach((needle) => {
      if (!response.reply.includes(needle)) {
        failures.push(`reply should include "${needle}"`);
      }
    });
  }

  if (expected.replyNotIncludes) {
    expected.replyNotIncludes.forEach((needle) => {
      if (response.reply.includes(needle)) {
        failures.push(`reply should not include "${needle}"`);
      }
    });
  }

  return failures;
};

const scenarios = [
  {
    name: "Single configurable add asks for spice then preserves modifiers",
    turns: [
      {
        prompt: "add 2 black garlic ramen with marinated egg",
        modelContent: jsonContent({
          intent: "add_items",
          reply: "I found 2 x Black Garlic Ramen. Review the cart changes below.",
          needsConfirmation: true,
          actions: [{ type: "add_item", itemId: "black-garlic-ramen", quantity: 2, addOnIds: ["ajitama"] }],
          suggestedItemIds: [],
          referencedItemIds: ["black-garlic-ramen"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "add_items",
          actionTypes: ["add_item"],
          actionItemIds: ["black-garlic-ramen"],
          actionAddOnIds: [["ajitama"]],
          needsConfirmation: false,
          missingSlots: ["spice_level"],
          clarificationOptionLabelsInclude: ["Mild", "Medium", "Spicy"],
          commandState: "needs_clarification",
          commandExecutable: false,
          referencedMustInclude: ["black-garlic-ramen"],
          replyIncludes: ["spice level", "Marinated egg"],
        },
      },
      {
        prompt: "Spicy",
        modelContent: jsonContent({
          intent: "answer_question",
          reply: "Black Garlic Ramen is one of the richer bowls on the menu.",
          needsConfirmation: false,
          actions: [],
          suggestedItemIds: [],
          referencedItemIds: ["black-garlic-ramen"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "add_items",
          actionTypes: ["add_item"],
          actionItemIds: ["black-garlic-ramen"],
          actionAddOnIds: [["ajitama"]],
          actionSpiceLevels: ["Spicy"],
          needsConfirmation: true,
          missingSlots: [],
          commandState: "ready",
          commandExecutable: true,
          replyIncludes: ["Black Garlic Ramen"],
        },
      },
    ],
  },
  {
    name: "Clarification ack keeps pending spice request alive",
    seedConversation: [
      {
        role: "assistant",
        text: "Black Garlic Ramen still needs a spice level. Pick Mild/Medium/Spicy. You can also mention add-ons like Marinated egg, Extra chashu, Sweet corn.",
        actions: [{ type: "add_item", itemId: "black-garlic-ramen", quantity: 1 }],
        referencedItemIds: ["black-garlic-ramen"],
        suggestedItemIds: [],
        selectionPlan: null,
        command: {
          state: "needs_clarification",
          intent: "add_items",
          executable: false,
          requiresConfirmation: false,
          actions: [{ type: "add_item", itemId: "black-garlic-ramen", quantity: 1 }],
        },
        missingSlots: ["spice_level"],
        clarificationOptions: [
          { label: "Mild", prompt: "Add 1 Black Garlic Ramen mild." },
          { label: "Medium", prompt: "Add 1 Black Garlic Ramen medium." },
          { label: "Spicy", prompt: "Add 1 Black Garlic Ramen spicy." },
        ],
      },
    ],
    turns: [
      {
        prompt: "Yes, that is correct.",
        modelContent: jsonContent({
          intent: "answer_question",
          reply: "Got it.",
          needsConfirmation: false,
          actions: [],
          suggestedItemIds: [],
          referencedItemIds: [],
          unavailableRequests: [],
        }),
        expect: {
          intent: "add_items",
          actionTypes: ["add_item"],
          actionItemIds: ["black-garlic-ramen"],
          needsConfirmation: false,
          missingSlots: ["spice_level"],
          clarificationOptionLabelsInclude: ["Mild", "Medium", "Spicy"],
          commandState: "needs_clarification",
          commandExecutable: false,
          referencedMustInclude: ["black-garlic-ramen"],
          replyIncludes: ["spice level"],
        },
      },
    ],
  },
  {
    name: "Clarification follow-up keeps remove intent on empty cart",
    seedConversation: [
      { role: "user", text: "Trim the cart." },
      {
        role: "assistant",
        text: "Which dish should I remove?",
        actions: [],
        referencedItemIds: [],
        suggestedItemIds: [],
        command: {
          state: "needs_clarification",
          intent: "remove_items",
          executable: false,
        },
        missingSlots: ["item"],
        clarificationOptions: [
          {
            label: "Spicy Garlic Edamame",
            prompt: "Remove Spicy Garlic Edamame from my cart.",
          },
        ],
      },
    ],
    initialCart: [],
    turns: [
      {
        prompt: "Spicy Garlic Edamame",
        modelContent: jsonContent({
          intent: "add_items",
          reply: "I found 1 x Spicy Garlic Edamame. Review the cart changes below.",
          needsConfirmation: true,
          actions: [{ type: "add_item", itemId: "spicy-garlic-edamame", quantity: 1 }],
          suggestedItemIds: [],
          referencedItemIds: ["spicy-garlic-edamame"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "remove_items",
          actionTypes: [],
          needsConfirmation: false,
          unavailableCount: 1,
          commandState: "inform",
          commandExecutable: false,
          replyIncludes: ["nothing to remove"],
        },
      },
    ],
  },
  {
    name: "Autumn cheapest add",
    turns: [
      {
        prompt: "Is there one suitable for autumn?",
        modelContent: jsonContent({
          intent: "recommend_items",
          reply: "For autumn I would look at Black Garlic Ramen, Mango Salmon Delight, and Tonkotsu Ramen.",
          needsConfirmation: false,
          actions: [],
          suggestedItemIds: ["black-garlic-ramen", "mango-salmon-delight", "tonkotsu-ramen"],
          referencedItemIds: ["black-garlic-ramen", "mango-salmon-delight", "tonkotsu-ramen"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "recommend_items",
          suggestedItemIds: ["black-garlic-ramen", "mango-salmon-delight", "tonkotsu-ramen"],
          needsConfirmation: false,
        },
      },
      {
        prompt: "What is different about those three? Any spicy option?",
        modelContent: jsonContent({
          intent: "explain_items",
          reply: "Black Garlic Ramen is richer, Mango Salmon Delight is fresher, and Tonkotsu Ramen is the classic comfort bowl.",
          needsConfirmation: false,
          actions: [],
          suggestedItemIds: [],
          referencedItemIds: ["black-garlic-ramen", "mango-salmon-delight", "tonkotsu-ramen"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "explain_items",
          referencedMustInclude: ["black-garlic-ramen", "mango-salmon-delight", "tonkotsu-ramen"],
          needsConfirmation: false,
        },
      },
      {
        prompt: "Add the cheapest one to the cart.",
        modelContent: jsonContent({
          intent: "add_items",
          reply: "I will add the cheapest one from the dishes we just discussed.",
          needsConfirmation: true,
          actions: [],
          suggestedItemIds: [],
          referencedItemIds: [],
          unavailableRequests: [],
          selectionPlan: {
            source: "recent_referenced_items",
            query: "cheapest",
            sortBy: "price",
            sortDirection: "asc",
            take: 1,
            quantity: 1,
          },
        }),
        expect: {
          intent: "add_items",
          actionTypes: ["add_item"],
          actionItemIds: ["tonkotsu-ramen"],
          selectionPlanSource: "recent_referenced_items",
          selectionPlanSortBy: "price",
          needsConfirmation: false,
          missingSlots: ["spice_level"],
          commandState: "needs_clarification",
          commandExecutable: false,
          referencedMustInclude: ["tonkotsu-ramen"],
          replyIncludes: ["Tonkotsu Ramen", "spice level"],
        },
      },
    ],
  },
  {
    name: "Cheapest follow-up falls back to recent suggestions",
    seedConversation: [
      {
        role: "assistant",
        text: "For autumn I would look at Black Garlic Ramen, Mango Salmon Delight, and Tonkotsu Ramen.",
        suggestedItemIds: ["black-garlic-ramen", "mango-salmon-delight", "tonkotsu-ramen"],
        referencedItemIds: [],
        actions: [],
        selectionPlan: null,
        command: {
          state: "inform",
          intent: "recommend_items",
          executable: false,
          requiresConfirmation: false,
        },
        missingSlots: [],
        clarificationOptions: [],
      },
    ],
    turns: [
      {
        prompt: "Add the cheapest one to the cart.",
        modelContent: jsonContent({
          intent: "add_items",
          reply: "I will add the cheapest one.",
          needsConfirmation: true,
          actions: [],
          suggestedItemIds: [],
          referencedItemIds: [],
          unavailableRequests: [],
        }),
        expect: {
          intent: "add_items",
          actionTypes: ["add_item"],
          actionItemIds: ["tonkotsu-ramen"],
          needsConfirmation: false,
          missingSlots: ["spice_level"],
          commandState: "needs_clarification",
          commandExecutable: false,
          referencedMustInclude: ["tonkotsu-ramen"],
          replyIncludes: ["Tonkotsu Ramen", "spice level"],
        },
      },
    ],
  },
  {
    name: "Chinese second suggestion add",
    turns: [
      {
        prompt: "有什么清爽一点的推荐吗？",
        modelContent: jsonContent({
          intent: "recommend_items",
          reply: "我会先推荐 Hamachi Yuzu Roll、Mango Salmon Delight 和 Seaweed Salad。",
          needsConfirmation: false,
          actions: [],
          suggestedItemIds: ["hamachi-yuzu-roll", "mango-salmon-delight", "seaweed-salad"],
          referencedItemIds: ["hamachi-yuzu-roll", "mango-salmon-delight", "seaweed-salad"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "recommend_items",
          suggestedItemIds: ["hamachi-yuzu-roll", "mango-salmon-delight", "seaweed-salad"],
          needsConfirmation: false,
        },
      },
      {
        prompt: "那帮我加第二个吧。",
        modelContent: jsonContent({
          intent: "add_items",
          reply: "我会把第二个推荐加进购物车。",
          needsConfirmation: true,
          actions: [],
          suggestedItemIds: [],
          referencedItemIds: [],
          unavailableRequests: [],
          selectionPlan: {
            source: "recent_suggested_items",
            query: "second one",
            take: 1,
            quantity: 1,
          },
        }),
        expect: {
          intent: "add_items",
          actionTypes: ["add_item"],
          actionItemIds: ["mango-salmon-delight"],
          selectionPlanSource: "recent_suggested_items",
          needsConfirmation: false,
          missingSlots: ["spice_level"],
          commandState: "needs_clarification",
          commandExecutable: false,
          referencedMustInclude: ["mango-salmon-delight"],
          replyIncludes: ["Mango Salmon Delight", "辣度"],
        },
      },
    ],
  },
  {
    name: "Explain second suggestion",
    turns: [
      {
        prompt: "Recommend something light and fresh.",
        modelContent: jsonContent({
          intent: "recommend_items",
          reply: "I would start with Hamachi Yuzu Roll, Mango Salmon Delight, and Seaweed Salad.",
          needsConfirmation: false,
          actions: [],
          suggestedItemIds: ["hamachi-yuzu-roll", "mango-salmon-delight", "seaweed-salad"],
          referencedItemIds: ["hamachi-yuzu-roll", "mango-salmon-delight", "seaweed-salad"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "recommend_items",
          suggestedItemIds: ["hamachi-yuzu-roll", "mango-salmon-delight", "seaweed-salad"],
        },
      },
      {
        prompt: "Tell me more about the second one.",
        modelContent: jsonContent({
          intent: "explain_items",
          reply: "Let me explain the second recommendation.",
          needsConfirmation: false,
          actions: [],
          suggestedItemIds: [],
          referencedItemIds: [],
          unavailableRequests: [],
          selectionPlan: {
            source: "recent_suggested_items",
            query: "second one",
            take: 1,
          },
        }),
        expect: {
          intent: "explain_items",
          referencedMustInclude: ["mango-salmon-delight"],
          needsConfirmation: false,
          replyIncludes: ["Mango Salmon Delight"],
        },
      },
    ],
  },
  {
    name: "Cheapest add clears stray quantity clarification after structural resolution",
    seedConversation: [
      {
        role: "assistant",
        text: "Would you like to try the Hamachi Yuzu Roll or the Lemon Blossom Roll? Both are light and fresh options from our menu.",
        actions: [],
        referencedItemIds: ["hamachi-yuzu-roll", "lemon-blossom-roll"],
        suggestedItemIds: ["hamachi-yuzu-roll", "lemon-blossom-roll"],
        selectionPlan: null,
        command: {
          state: "inform",
          intent: "recommend_items",
          executable: false,
          requiresConfirmation: false,
        },
        missingSlots: [],
        clarificationOptions: [],
      },
      {
        role: "user",
        text: "Tell me more about the second one.",
      },
      {
        role: "assistant",
        text: "Lemon Blossom Roll is a roll for $16.00. It leans Bright, Signature and includes Crab, avocado, lemon zest, sesame, and a clean soy glaze.",
        actions: [],
        referencedItemIds: ["lemon-blossom-roll"],
        suggestedItemIds: [],
        selectionPlan: {
          source: "recent_suggested_items",
          query: "second one",
          take: 1,
        },
        command: {
          state: "inform",
          intent: "explain_items",
          executable: false,
          requiresConfirmation: false,
        },
        missingSlots: [],
        clarificationOptions: [],
      },
    ],
    turns: [
      {
        prompt: "Add the cheapest one to my cart.",
        modelContent: jsonContent({
          intent: "add_items",
          reply: "I need one more detail before I safely change the cart.",
          needsConfirmation: false,
          actions: [{ type: "add_item", itemId: "lemon-blossom-roll", quantity: 1 }],
          suggestedItemIds: [],
          referencedItemIds: ["lemon-blossom-roll"],
          missingSlots: ["quantity"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "add_items",
          actionTypes: ["add_item"],
          actionItemIds: ["lemon-blossom-roll"],
          actionCount: 1,
          needsConfirmation: true,
          missingSlots: [],
          clarificationOptionCount: 0,
          commandState: "ready",
          commandExecutable: true,
          referencedMustInclude: ["lemon-blossom-roll"],
          replyIncludes: ["Lemon Blossom Roll", "Review"],
          replyNotIncludes: ["need one more detail", "quantity"],
        },
      },
    ],
  },
  {
    name: "Generic recommendation trims leaked unavailable ids",
    turns: [
      {
        prompt: "any recommendation?",
        modelContent: jsonContent({
          intent: "recommend_items",
          reply:
            "A good place to start is Mango Salmon Delight, Black Garlic Ramen, and Truffle Salmon Roll.",
          needsConfirmation: false,
          actions: [],
          suggestedItemIds: [
            "mango-salmon-delight",
            "black-garlic-ramen",
            "truffle-salmon-roll",
            "hamachi-yuzu-roll",
            "lemon-blossom-roll",
            "truffle-albacore-roll",
            "yuzu-ceviche-roll",
          ],
          referencedItemIds: [
            "mango-salmon-delight",
            "black-garlic-ramen",
            "truffle-salmon-roll",
            "hamachi-yuzu-roll",
          ],
          unavailableRequests: [
            "tonkotsu-ramen",
            "agedashi-tofu",
            "edamame",
            "spicy-garlic-edamame",
          ],
        }),
        expect: {
          intent: "recommend_items",
          suggestedItemIds: ["mango-salmon-delight", "black-garlic-ramen", "truffle-salmon-roll"],
          referencedMustInclude: ["mango-salmon-delight", "black-garlic-ramen", "truffle-salmon-roll"],
          unavailableCount: 0,
          needsConfirmation: false,
        },
      },
    ],
  },
  {
    name: "Appetizer and dish recommendation covers both categories",
    turns: [
      {
        prompt: "recommend me both appetizer and dish",
        modelContent: jsonContent({
          intent: "recommend_items",
          reply: "Would you like to try the Agedashi Tofu or the Spicy Garlic Edamame?",
          needsConfirmation: false,
          actions: [],
          suggestedItemIds: ["agedashi-tofu", "spicy-garlic-edamame"],
          referencedItemIds: ["agedashi-tofu", "spicy-garlic-edamame"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "recommend_items",
          suggestedItemIds: ["agedashi-tofu", "black-garlic-ramen", "spicy-garlic-edamame"],
          referencedMustInclude: ["agedashi-tofu", "black-garlic-ramen"],
          unavailableCount: 0,
          replyIncludes: ["Agedashi Tofu", "Black Garlic Ramen"],
        },
      },
    ],
  },
  {
    name: "Remove cheapest ramen from cart",
    initialCart: [
      { itemId: "black-garlic-ramen", quantity: 1 },
      { itemId: "tonkotsu-ramen", quantity: 1 },
      { itemId: "seaweed-salad", quantity: 1 },
    ],
    turns: [
      {
        prompt: "Remove the cheapest ramen from my cart.",
        modelContent: jsonContent({
          intent: "remove_items",
          reply: "I will remove the cheapest ramen from your current cart.",
          needsConfirmation: true,
          actions: [],
          suggestedItemIds: [],
          referencedItemIds: [],
          unavailableRequests: [],
          selectionPlan: {
            source: "current_cart",
            category: "ramen",
            query: "cheapest",
            sortBy: "price",
            sortDirection: "asc",
            take: 1,
          },
        }),
        expect: {
          intent: "remove_items",
          actionTypes: ["remove_item"],
          actionItemIds: ["tonkotsu-ramen"],
          selectionPlanSource: "current_cart",
          needsConfirmation: true,
        },
      },
    ],
  },
  {
    name: "Budget-aware add under 34",
    turns: [
      {
        prompt: "Recommend something that feels comforting.",
        modelContent: jsonContent({
          intent: "recommend_items",
          reply: "I would start with Black Garlic Ramen and Mango Salmon Delight.",
          needsConfirmation: false,
          actions: [],
          suggestedItemIds: ["black-garlic-ramen", "mango-salmon-delight", "hamachi-yuzu-roll"],
          referencedItemIds: ["black-garlic-ramen", "mango-salmon-delight", "hamachi-yuzu-roll"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "recommend_items",
        },
      },
      {
        prompt: "我希望总共点两道菜，最终价格不超过34元，你帮我添加到菜单。",
        modelContent: jsonContent({
          intent: "add_items",
          reply: "我会帮你安排两道菜。",
          needsConfirmation: true,
          actions: [
            { type: "add_item", itemId: "black-garlic-ramen", quantity: 1 },
            { type: "add_item", itemId: "hamachi-yuzu-roll", quantity: 1 },
          ],
          suggestedItemIds: [],
          referencedItemIds: [],
          unavailableRequests: [],
        }),
        expect: {
          intent: "add_items",
          actionTypes: ["add_item", "add_item"],
          actionCount: 2,
          actionTotalMax: 34,
          needsConfirmation: true,
          replyIncludes: ["34", "预算"],
        },
      },
    ],
  },
  {
    name: "Budget complaint becomes alternative suggestion",
    turns: [
      {
        prompt: "Add Black Garlic Ramen and Hamachi Yuzu Roll.",
        modelContent: jsonContent({
          intent: "add_items",
          reply: "I will prepare those two dishes for confirmation.",
          needsConfirmation: true,
          actions: [
            { type: "add_item", itemId: "black-garlic-ramen", quantity: 1 },
            { type: "add_item", itemId: "hamachi-yuzu-roll", quantity: 1 },
          ],
          suggestedItemIds: [],
          referencedItemIds: ["black-garlic-ramen", "hamachi-yuzu-roll"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "add_items",
          actionTypes: ["add_item", "add_item"],
        },
      },
      {
        prompt: "你点的价格超过了34。",
        modelContent: jsonContent({
          intent: "add_items",
          reply: "我来重新处理。",
          needsConfirmation: true,
          actions: [
            { type: "add_item", itemId: "black-garlic-ramen", quantity: 1 },
            { type: "add_item", itemId: "hamachi-yuzu-roll", quantity: 1 },
          ],
          suggestedItemIds: [],
          referencedItemIds: [],
          unavailableRequests: [],
        }),
        expect: {
          intent: "recommend_items",
          actionTypes: [],
          suggestedCount: 2,
          suggestedTotalMax: 34,
          replyIncludes: ["超过了 34"],
        },
      },
    ],
  },
  {
    name: "Clear menu maps to clear cart",
    initialCart: [
      { itemId: "black-garlic-ramen", quantity: 1 },
    ],
    turns: [
      {
        prompt: "帮我清空菜单",
        modelContent: jsonContent({
          intent: "clear_cart",
          reply: "购物车已清空。",
          needsConfirmation: false,
          actions: [],
          suggestedItemIds: [],
          referencedItemIds: [],
          unavailableRequests: [],
        }),
        expect: {
          intent: "clear_cart",
          actionTypes: ["clear_cart"],
          needsConfirmation: true,
          replyIncludes: ["清空购物车"],
        },
      },
    ],
  },
  {
    name: "Mixed-language first suggestion add",
    turns: [
      {
        prompt: "推荐一个 fresh 一点的主菜。",
        modelContent: jsonContent({
          intent: "recommend_items",
          reply: "I would start with Hamachi Yuzu Roll, Mango Salmon Delight, and Seaweed Salad.",
          needsConfirmation: false,
          actions: [],
          suggestedItemIds: ["hamachi-yuzu-roll", "mango-salmon-delight", "yuzu-ceviche-roll"],
          referencedItemIds: ["hamachi-yuzu-roll", "mango-salmon-delight", "yuzu-ceviche-roll"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "recommend_items",
          suggestedItemIds: ["hamachi-yuzu-roll", "mango-salmon-delight", "yuzu-ceviche-roll"],
          needsConfirmation: false,
          replyIncludes: ["可以先试试"],
        },
      },
      {
        prompt: "那 add 第一个吧。",
        modelContent: jsonContent({
          intent: "add_items",
          reply: "I will add the first recommendation.",
          needsConfirmation: true,
          actions: [],
          suggestedItemIds: [],
          referencedItemIds: [],
          unavailableRequests: [],
          selectionPlan: {
            source: "recent_suggested_items",
            query: "first one",
            take: 1,
            quantity: 1,
          },
        }),
        expect: {
          intent: "add_items",
          actionTypes: ["add_item"],
          actionItemIds: ["hamachi-yuzu-roll"],
          selectionPlanSource: "recent_suggested_items",
          needsConfirmation: false,
          missingSlots: ["spice_level"],
          commandState: "needs_clarification",
          commandExecutable: false,
          referencedMustInclude: ["hamachi-yuzu-roll"],
          replyIncludes: ["Hamachi Yuzu Roll", "辣度"],
        },
      },
    ],
  },
  {
    name: "Clear entire cart",
    initialCart: [
      { itemId: "mango-salmon-delight", quantity: 1 },
      { itemId: "seaweed-salad", quantity: 2 },
      { itemId: "truffle-fries", quantity: 1 },
    ],
    turns: [
      {
        prompt: "My cart has 3 items. Remove all of them.",
        modelContent: jsonContent({
          intent: "remove_items",
          reply: "I can remove everything from the cart.",
          needsConfirmation: true,
          actions: [],
          suggestedItemIds: [],
          referencedItemIds: [],
          unavailableRequests: [],
          selectionPlan: {
            source: "current_cart",
            query: "all of them",
            take: 10,
          },
        }),
        expect: {
          intent: "clear_cart",
          actionTypes: ["clear_cart"],
          needsConfirmation: true,
          replyIncludes: ["clear the cart"],
        },
      },
    ],
  },
  {
    name: "Explicit add overrides wrong model item with direct matches",
    turns: [
      {
        prompt: "add 1 tofu and 1 salmon roll",
        modelContent: jsonContent({
          intent: "add_items",
          reply: "I found 1 x Black Garlic Ramen. Review the cart changes below.",
          needsConfirmation: true,
          actions: [{ type: "add_item", itemId: "black-garlic-ramen", quantity: 1 }],
          suggestedItemIds: [],
          referencedItemIds: ["black-garlic-ramen"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "add_items",
          actionTypes: ["add_item", "add_item"],
          actionItemIds: ["agedashi-tofu", "truffle-salmon-roll"],
          needsConfirmation: true,
          unavailableCount: 0,
          replyIncludes: ["Agedashi Tofu", "Truffle Salmon Roll"],
        },
      },
    ],
  },
  {
    name: "Direct alias recovery fills typo and clears unavailable list",
    turns: [
      {
        prompt: "add 1 truffle salmon roll and 1 tofo",
        modelContent: jsonContent({
          intent: "add_items",
          reply: "I found 1 x Truffle Salmon Roll. Review the cart changes below.",
          needsConfirmation: true,
          actions: [{ type: "add_item", itemId: "truffle-salmon-roll", quantity: 1 }],
          suggestedItemIds: [],
          referencedItemIds: ["truffle-salmon-roll"],
          unavailableRequests: ["tofo"],
        }),
        expect: {
          intent: "add_items",
          actionTypes: ["add_item", "add_item"],
          actionItemIds: ["truffle-salmon-roll", "agedashi-tofu"],
          needsConfirmation: true,
          unavailableCount: 0,
          replyIncludes: ["Agedashi Tofu", "Truffle Salmon Roll"],
        },
      },
    ],
  },
  {
    name: "Chinese tofu and salmon roll add",
    turns: [
      {
        prompt: "帮我加一道豆腐，一道salmon roll",
        modelContent: jsonContent({
          intent: "add_items",
          reply: "我找到了 1 x Agedashi Tofu。请确认下面的购物车变更。",
          needsConfirmation: true,
          actions: [{ type: "add_item", itemId: "agedashi-tofu", quantity: 1 }],
          suggestedItemIds: [],
          referencedItemIds: ["agedashi-tofu"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "add_items",
          actionTypes: ["add_item", "add_item"],
          actionItemIds: ["agedashi-tofu", "truffle-salmon-roll"],
          needsConfirmation: true,
          unavailableCount: 0,
          replyIncludes: ["Agedashi Tofu", "Truffle Salmon Roll"],
        },
      },
    ],
  },
  {
    name: "Ambiguous salmon mention does not guess",
    turns: [
      {
        prompt: "add 1 salmon",
        modelContent: jsonContent({
          intent: "add_items",
          reply: "I found 1 x Truffle Salmon Roll. Review the cart changes below.",
          needsConfirmation: true,
          actions: [{ type: "add_item", itemId: "truffle-salmon-roll", quantity: 1 }],
          suggestedItemIds: [],
          referencedItemIds: ["truffle-salmon-roll"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "add_items",
          actionTypes: [],
          needsConfirmation: false,
          missingSlots: ["item"],
          clarificationOptionLabelsInclude: ["Mango Salmon Delight", "Truffle Salmon Roll"],
          commandState: "needs_clarification",
          commandExecutable: false,
          referencedMustInclude: ["mango-salmon-delight", "truffle-salmon-roll"],
          replyIncludes: ["Pick one below"],
        },
      },
    ],
  },
  {
    name: "Ambiguous salmon follow-up ignores the previous roll",
    initialCart: [{ itemId: "lemon-blossom-roll", quantity: 1 }],
    seedConversation: [
      {
        role: "assistant",
        text: "Would you like to try the Hamachi Yuzu Roll or the Lemon Blossom Roll? Both are light and fresh options from our menu.",
        actions: [],
        referencedItemIds: ["hamachi-yuzu-roll", "lemon-blossom-roll"],
        suggestedItemIds: ["hamachi-yuzu-roll", "lemon-blossom-roll"],
        selectionPlan: null,
        command: {
          state: "inform",
          intent: "recommend_items",
          executable: false,
          requiresConfirmation: false,
        },
        missingSlots: [],
        clarificationOptions: [],
      },
      {
        role: "user",
        text: "Lemon Blossom Roll",
      },
      {
        role: "assistant",
        text: "I found 1 x Lemon Blossom Roll. Review the cart changes below.",
        actions: [{ type: "add_item", itemId: "lemon-blossom-roll", quantity: 1 }],
        referencedItemIds: ["lemon-blossom-roll"],
        suggestedItemIds: [],
        selectionPlan: null,
        command: {
          state: "ready",
          intent: "add_items",
          executable: true,
          requiresConfirmation: true,
        },
        missingSlots: [],
        clarificationOptions: [],
      },
      {
        role: "assistant",
        text: "Done. Add 1 x Lemon Blossom Roll.",
      },
    ],
    turns: [
      {
        prompt: "add 1 salmon",
        modelContent: jsonContent({
          intent: "add_items",
          reply: "I found 1 x Lemon Blossom Roll. Review the cart changes below.",
          needsConfirmation: true,
          actions: [{ type: "add_item", itemId: "lemon-blossom-roll", quantity: 1 }],
          suggestedItemIds: [],
          referencedItemIds: ["lemon-blossom-roll"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "add_items",
          actionTypes: [],
          actionCount: 0,
          needsConfirmation: false,
          missingSlots: ["item"],
          clarificationOptionCount: 2,
          clarificationOptionLabelsInclude: ["Mango Salmon Delight", "Truffle Salmon Roll"],
          commandState: "needs_clarification",
          commandExecutable: false,
          referencedMustInclude: ["mango-salmon-delight", "truffle-salmon-roll"],
          replyIncludes: ["salmon", "Pick one below"],
          replyNotIncludes: ["Lemon Blossom Roll"],
        },
      },
      {
        prompt: "Add 1 Truffle Salmon Roll.",
        modelContent: jsonContent({
          intent: "add_items",
          reply: "Sure.",
          needsConfirmation: true,
          actions: [],
          suggestedItemIds: [],
          referencedItemIds: [],
          unavailableRequests: [],
        }),
        expect: {
          intent: "add_items",
          actionTypes: ["add_item"],
          actionItemIds: ["truffle-salmon-roll"],
          actionCount: 1,
          needsConfirmation: false,
          missingSlots: ["spice_level"],
          commandState: "needs_clarification",
          commandExecutable: false,
          replyIncludes: ["Truffle Salmon Roll"],
          replyNotIncludes: ["Lemon Blossom Roll", "Mango Salmon Delight"],
        },
      },
    ],
  },
  {
    name: "Resolved salmon choice replaces stale item options with spice choices",
    seedConversation: [
      {
        role: "assistant",
        text: 'I am not sure which dish you mean by "salmon" yet. Pick one below and I will prepare the cart change.',
        actions: [],
        referencedItemIds: ["mango-salmon-delight", "truffle-salmon-roll"],
        suggestedItemIds: [],
        selectionPlan: null,
        command: {
          state: "needs_clarification",
          intent: "add_items",
          executable: false,
          requiresConfirmation: false,
        },
        missingSlots: ["item"],
        clarificationOptions: [
          { label: "Mango Salmon Delight", prompt: "Add 1 Mango Salmon Delight." },
          { label: "Truffle Salmon Roll", prompt: "Add 1 Truffle Salmon Roll." },
        ],
      },
    ],
    turns: [
      {
        prompt: "Add 1 Mango Salmon Delight.",
        modelContent: jsonContent({
          intent: "add_items",
          reply: "Mango Salmon Delight still needs a spice level. Pick Mild/Medium/Spicy.",
          needsConfirmation: false,
          actions: [{ type: "add_item", itemId: "mango-salmon-delight", quantity: 1 }],
          suggestedItemIds: [],
          referencedItemIds: ["mango-salmon-delight"],
          missingSlots: ["quantity", "spice_level"],
          clarificationOptions: [
            { label: "Mango Salmon Delight", prompt: "Add 1 Mango Salmon Delight." },
            { label: "Truffle Salmon Roll", prompt: "Add 1 Truffle Salmon Roll." },
          ],
          unavailableRequests: [],
        }),
        expect: {
          intent: "add_items",
          actionTypes: ["add_item"],
          actionItemIds: ["mango-salmon-delight"],
          actionCount: 1,
          needsConfirmation: false,
          missingSlots: ["spice_level"],
          clarificationOptionCount: 3,
          clarificationOptionLabelsInclude: ["Mild", "Medium", "Spicy"],
          commandState: "needs_clarification",
          commandExecutable: false,
          referencedMustInclude: ["mango-salmon-delight"],
          replyIncludes: ["Mango Salmon Delight", "spice level"],
        },
      },
    ],
  },
  {
    name: "Missing update quantity asks for clarification",
    initialCart: [{ itemId: "mango-salmon-delight", quantity: 2 }],
    turns: [
      {
        prompt: "change mango salmon delight",
        modelContent: jsonContent({
          intent: "update_items",
          reply: "I can help update Mango Salmon Delight.",
          needsConfirmation: false,
          actions: [],
          suggestedItemIds: [],
          referencedItemIds: ["mango-salmon-delight"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "update_items",
          actionTypes: [],
          needsConfirmation: false,
          missingSlots: ["quantity"],
          clarificationOptionLabelsInclude: ["1", "2", "3"],
          commandState: "needs_clarification",
          commandExecutable: false,
          referencedMustInclude: ["mango-salmon-delight"],
          replyIncludes: ["Mango Salmon Delight"],
        },
      },
    ],
  },
  {
    name: "Quantity change overrides advisory answer",
    initialCart: [{ itemId: "mango-salmon-delight", quantity: 2 }],
    turns: [
      {
        prompt: "change mango salmon delight to one.",
        modelContent: jsonContent({
          intent: "answer_question",
          reply: "Mango Salmon Delight is one of the fresher rolls on the menu.",
          needsConfirmation: false,
          actions: [],
          suggestedItemIds: ["mango-salmon-delight"],
          referencedItemIds: ["mango-salmon-delight"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "update_items",
          actionTypes: ["set_quantity"],
          actionItemIds: ["mango-salmon-delight"],
          needsConfirmation: true,
          replyIncludes: ["quantity change"],
        },
      },
    ],
  },
  {
    name: "Chinese quantity reduction stays executable",
    initialCart: [{ itemId: "spicy-garlic-edamame", quantity: 2 }],
    turns: [
      {
        prompt: "帮我减少一份spicy garlic edamame",
        modelContent: jsonContent({
          intent: "update_items",
          reply: "好的，我将为您减少一份 Spicy Garlic Edamame。请确认购物车变更。",
          needsConfirmation: true,
          actions: [{ type: "set_quantity", itemId: "spicy-garlic-edamame", quantity: 1 }],
          suggestedItemIds: [],
          referencedItemIds: ["spicy-garlic-edamame"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "update_items",
          actionTypes: ["set_quantity"],
          actionItemIds: ["spicy-garlic-edamame"],
          needsConfirmation: true,
          commandState: "ready",
          commandExecutable: true,
          replyIncludes: ["Spicy Garlic Edamame"],
        },
      },
    ],
  },
  {
    name: "Remove one cart item becomes a quantity reduction",
    initialCart: [{ itemId: "spicy-garlic-edamame", quantity: 2 }],
    turns: [
      {
        prompt: "remove one edamame",
        modelContent: jsonContent({
          intent: "remove_items",
          reply: "I will remove the edamame from your cart.",
          needsConfirmation: true,
          actions: [{ type: "remove_item", itemId: "spicy-garlic-edamame" }],
          suggestedItemIds: [],
          referencedItemIds: ["spicy-garlic-edamame"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "update_items",
          actionTypes: ["set_quantity"],
          actionItemIds: ["spicy-garlic-edamame"],
          needsConfirmation: true,
          commandState: "ready",
          commandExecutable: true,
          replyIncludes: ["quantity change"],
        },
      },
    ],
  },
  {
    name: "Executable actions ignore stray clarification options",
    initialCart: [{ itemId: "truffle-salmon-roll", quantity: 3 }],
    turns: [
      {
        prompt: "reduce truffle salmon roll by one",
        modelContent: jsonContent({
          intent: "update_items",
          reply: "I can reduce Truffle Salmon Roll by one. Please confirm.",
          needsConfirmation: false,
          actions: [{ type: "set_quantity", itemId: "truffle-salmon-roll", quantity: 2 }],
          suggestedItemIds: [],
          referencedItemIds: ["truffle-salmon-roll"],
          unavailableRequests: [],
          clarificationOptions: [
            {
              label: "Confirm reducing one Truffle Salmon Roll",
              prompt: "Please confirm reducing one Truffle Salmon Roll.",
            },
          ],
        }),
        expect: {
          intent: "update_items",
          actionTypes: ["set_quantity"],
          actionItemIds: ["truffle-salmon-roll"],
          needsConfirmation: true,
          commandState: "ready",
          commandExecutable: true,
          clarificationOptionCount: 0,
          replyIncludes: ["quantity change"],
        },
      },
    ],
  },
  {
    name: "Alternative recommendations rotate and strip leaked fields",
    turns: [
      {
        prompt: "有什么菜？",
        modelContent: jsonContent({
          intent: "recommend_items",
          reply: "您可能喜欢 Mango Salmon Delight、Black Garlic Ramen 和 Truffle Salmon Roll。",
          needsConfirmation: false,
          actions: [],
          suggestedItemIds: ["mango-salmon-delight", "black-garlic-ramen", "truffle-salmon-roll"],
          referencedItemIds: ["mango-salmon-delight", "black-garlic-ramen", "truffle-salmon-roll"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "recommend_items",
          suggestedItemIds: ["mango-salmon-delight", "black-garlic-ramen", "truffle-salmon-roll"],
        },
      },
      {
        prompt: "还有其他的选择吗？",
        modelContent: jsonContent({
          intent: "recommend_items",
          reply:
            "您可能喜欢以下几种菜品：Mango Salmon Delight、Black Garlic Ramen 和 Truffle Salmon Roll。I suggestedItemIds: mango-salmon-delight, black-garlic-ramen, truffle-salmon-roll | referencedItemIds: mango-salmon-delight, black-garlic-ramen, truffle-salmon-roll",
          needsConfirmation: false,
          actions: [],
          suggestedItemIds: ["mango-salmon-delight", "black-garlic-ramen", "truffle-salmon-roll"],
          referencedItemIds: ["mango-salmon-delight", "black-garlic-ramen", "truffle-salmon-roll"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "recommend_items",
          suggestedItemIds: ["tonkotsu-ramen", "yuzu-ceviche-roll", "truffle-albacore-roll"],
          replyIncludes: ["另外也可以看看"],
          replyNotIncludes: ["suggestedItemIds", "referencedItemIds"],
        },
      },
    ],
  },
  {
    name: "Contextual category mentions resolve multiple add items",
    turns: [
      {
        prompt: "有什么菜？",
        modelContent: jsonContent({
          intent: "recommend_items",
          reply: "您可能喜欢 Mango Salmon Delight、Black Garlic Ramen 和 Truffle Salmon Roll。",
          needsConfirmation: false,
          actions: [],
          suggestedItemIds: ["mango-salmon-delight", "black-garlic-ramen", "truffle-salmon-roll"],
          referencedItemIds: ["mango-salmon-delight", "black-garlic-ramen", "truffle-salmon-roll"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "recommend_items",
        },
      },
      {
        prompt: "加入两个Mango和一个Ramen",
        modelContent: jsonContent({
          intent: "add_items",
          reply: "我先帮你加两份 Mango Salmon Delight。",
          needsConfirmation: true,
          actions: [{ type: "add_item", itemId: "mango-salmon-delight", quantity: 2 }],
          suggestedItemIds: [],
          referencedItemIds: ["mango-salmon-delight"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "add_items",
          actionTypes: ["add_item", "add_item"],
          actionItemIds: ["mango-salmon-delight", "black-garlic-ramen"],
          actionCount: 3,
          needsConfirmation: true,
          unavailableCount: 0,
        },
      },
    ],
  },
  {
    name: "Malformed JSON salvage",
    turns: [
      {
        prompt: "有什么推荐的吗？",
        modelContent: `{
  "intent": "recommend_items",
  "reply": "我推荐 Black Garlic Ramen 和 Tonkotsu Ramen。",
  "needsConfirmation": false,
  "actions": [],
  "suggestedItemIds": ["black-garlic-ramen", "tonkotsu-ramen"],
  "referencedItemIds": ["black-garlic-ramen", "tonkotsu-ramen"],
  "unavailableRequests": []
`,
        expect: {
          intent: "recommend_items",
          suggestedItemIds: ["black-garlic-ramen", "tonkotsu-ramen"],
          replyIncludes: ["Black Garlic Ramen", "Tonkotsu Ramen"],
          replyNotIncludes: ['"intent"', '"suggestedItemIds"'],
        },
      },
    ],
  },
  {
    name: "Modifier parsing for add actions",
    turns: [
      {
        prompt: "Add one spicy black garlic ramen with extra chashu and corn.",
        modelContent: jsonContent({
          intent: "add_items",
          reply: "Sure.",
          needsConfirmation: true,
          actions: [],
          suggestedItemIds: [],
          referencedItemIds: [],
          unavailableRequests: [],
        }),
        expect: {
          intent: "add_items",
          actionTypes: ["add_item"],
          actionItemIds: ["black-garlic-ramen"],
          actionAddOnIds: [["extra-chashu", "corn"]],
          replyIncludes: ["Extra chashu", "Sweet corn"],
        },
      },
    ],
  },
  {
    name: "Variant-aware quantity updates keep add-ons",
    initialCart: [
      {
        itemId: "black-garlic-ramen",
        quantity: 2,
        spiceLevel: "Spicy",
        addOnIds: ["extra-chashu"],
      },
    ],
    turns: [
      {
        prompt: "Change the spicy black garlic ramen with extra chashu to one.",
        modelContent: jsonContent({
          intent: "update_items",
          reply: "Got it.",
          needsConfirmation: true,
          actions: [],
          suggestedItemIds: [],
          referencedItemIds: [],
          unavailableRequests: [],
        }),
        expect: {
          intent: "update_items",
          actionTypes: ["set_quantity"],
          actionItemIds: ["black-garlic-ramen"],
          actionAddOnIds: [["extra-chashu"]],
          replyIncludes: ["Extra chashu"],
        },
      },
    ],
  },
  {
    name: "Explicit quantity update does not pull in the previous dish",
    initialCart: [
      {
        itemId: "black-garlic-ramen",
        quantity: 2,
        spiceLevel: "Medium",
      },
      {
        itemId: "truffle-salmon-roll",
        quantity: 1,
        spiceLevel: "Mild",
      },
    ],
    seedConversation: [
      {
        role: "assistant",
        text: "I found 1 x Truffle Salmon Roll (Mild). Review the cart changes below.",
        actions: [{ type: "add_item", itemId: "truffle-salmon-roll", quantity: 1, spiceLevel: "Mild" }],
        referencedItemIds: ["truffle-salmon-roll"],
        suggestedItemIds: [],
        selectionPlan: null,
        command: {
          state: "ready",
          intent: "add_items",
          executable: true,
          requiresConfirmation: true,
        },
        missingSlots: [],
        clarificationOptions: [],
      },
    ],
    turns: [
      {
        prompt: "Change black garlic ramen to 1.",
        modelContent: jsonContent({
          intent: "update_items",
          reply: "Sure.",
          needsConfirmation: true,
          actions: [],
          suggestedItemIds: [],
          referencedItemIds: [],
          unavailableRequests: [],
        }),
        expect: {
          intent: "update_items",
          actionTypes: ["set_quantity"],
          actionItemIds: ["black-garlic-ramen"],
          replyNotIncludes: ["Truffle Salmon Roll"],
        },
      },
    ],
  },
  {
    name: "Spice-only update swaps the cart variant",
    initialCart: [
      {
        itemId: "black-garlic-ramen",
        quantity: 2,
        spiceLevel: "Medium",
      },
    ],
    turns: [
      {
        prompt: "Change black garlic ramen to mild spicy level.",
        modelContent: jsonContent({
          intent: "update_items",
          reply: "Okay.",
          needsConfirmation: true,
          actions: [],
          suggestedItemIds: [],
          referencedItemIds: [],
          unavailableRequests: [],
        }),
        expect: {
          intent: "update_items",
          actionTypes: ["remove_item", "add_item"],
          actionItemIds: ["black-garlic-ramen", "black-garlic-ramen"],
          actionAddOnIds: [[], []],
          replyIncludes: ["Mild"],
        },
      },
    ],
  },
];

const run = async () => {
  let passedScenarios = 0;

  for (const scenario of scenarios) {
    const conversation = (scenario.seedConversation ?? []).map((turn) => ({ ...turn }));
    const cartItems = (scenario.initialCart ?? []).map((entry) =>
      makeCartItem(entry.itemId, entry.quantity, {
        addOnIds: entry.addOnIds,
        spiceLevel: entry.spiceLevel,
      }),
    );
    let scenarioPassed = true;

    console.log(`\nScenario: ${scenario.name}`);

    for (const [index, turn] of scenario.turns.entries()) {
      global.fetch = async () => ({
        ok: true,
        json: async () => ({
          message: {
            content: turn.modelContent,
          },
        }),
      });

      const response = await submitOrderPrompt({
        prompt: turn.prompt,
        cartItems,
        conversation,
      });

      const failures = evaluateExpectations(response, turn.expect ?? {});
      const statusLabel = failures.length === 0 ? "PASS" : "FAIL";
      if (failures.length > 0) {
        scenarioPassed = false;
      }

      console.log(`  Turn ${index + 1}: ${statusLabel}`);
      console.log(`    User: ${turn.prompt}`);
      console.log(`    Intent: ${response.intent}`);
      console.log(`    Reply: ${response.reply}`);
      console.log(
        `    Actions: ${asList(
          response.actions.map((action) =>
            "itemId" in action
              ? [
                  action.type,
                  action.itemId,
                  "quantity" in action ? action.quantity : null,
                  "spiceLevel" in action ? action.spiceLevel ?? null : null,
                  "addOnIds" in action && action.addOnIds?.length ? action.addOnIds.join("+") : null,
                ]
                  .filter((part) => part !== null && part !== "")
                  .join(":")
              : action.type,
          ),
        )}`,
      );
      console.log(`    Suggested: ${asList(response.suggestedItemIds)}`);
      console.log(`    Referenced: ${asList(response.referencedItemIds)}`);
      console.log(`    MissingSlots: ${asList(response.missingSlots ?? [])}`);
      console.log(
        `    Clarifications: ${asList((response.clarificationOptions ?? []).map((option) => option.label))}`,
      );
      console.log(
        `    Command: ${
          response.command
            ? `${response.command.state} / executable=${response.command.executable}`
            : "(none)"
        }`,
      );
      console.log(
        `    SelectionPlan: ${
          response.selectionPlan ? JSON.stringify(response.selectionPlan) : "(none)"
        }`,
      );

      failures.forEach((failure) => {
        console.log(`    - ${failure}`);
      });

      pushConversationTurn(conversation, "user", { text: turn.prompt });
      pushConversationTurn(conversation, "assistant", response);
    }

    if (scenarioPassed) {
      passedScenarios += 1;
    }

    console.log(`  Result: ${scenarioPassed ? "PASS" : "FAIL"}`);
  }

  const failedScenarios = scenarios.length - passedScenarios;
  console.log(`\nSummary: ${passedScenarios}/${scenarios.length} scenarios passed, ${failedScenarios} failed.`);
  if (failedScenarios > 0) {
    process.exitCode = 1;
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
