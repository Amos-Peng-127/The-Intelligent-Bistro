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

const { submitOrderPrompt } = jiti("../src/lib/ai/index.ts");
const { menuItems } = jiti("../src/data/menu.ts");

const menuById = new Map(menuItems.map((item) => [item.id, item]));

const makeCartItem = (itemId, quantity = 1) => {
  const item = menuById.get(itemId);
  if (!item) {
    throw new Error(`Unknown menu item: ${itemId}`);
  }

  return {
    cartId: `${item.id}__standard__none`,
    itemId: item.id,
    name: item.name,
    price: item.price,
    quantity,
    spiceLevel: undefined,
    addOns: [],
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

    return sum + item.price * (action.quantity ?? 1);
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
          needsConfirmation: true,
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
          needsConfirmation: true,
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
          suggestedItemIds: ["hamachi-yuzu-roll", "mango-salmon-delight", "seaweed-salad"],
          referencedItemIds: ["hamachi-yuzu-roll", "mango-salmon-delight", "seaweed-salad"],
          unavailableRequests: [],
        }),
        expect: {
          intent: "recommend_items",
          suggestedItemIds: ["hamachi-yuzu-roll", "mango-salmon-delight", "seaweed-salad"],
          needsConfirmation: false,
          replyIncludes: ["我会先推荐"],
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
          needsConfirmation: true,
          replyIncludes: ["我找到了", "Hamachi Yuzu Roll"],
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
];

const run = async () => {
  let passedScenarios = 0;

  for (const scenario of scenarios) {
    const conversation = [];
    const cartItems = (scenario.initialCart ?? []).map((entry) => makeCartItem(entry.itemId, entry.quantity));
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
      console.log(`    Actions: ${asList(response.actions.map((action) => ("itemId" in action ? `${action.type}:${action.itemId}` : action.type)))}`);
      console.log(`    Suggested: ${asList(response.suggestedItemIds)}`);
      console.log(`    Referenced: ${asList(response.referencedItemIds)}`);
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
