import { z } from "zod";

const addOnSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  price: z.number().finite().nonnegative(),
});

const actionSchema = z.union([
  z.object({
    type: z.literal("add_item"),
    itemId: z.string().min(1),
    quantity: z.number().int().positive(),
    spiceLevel: z.string().min(1).optional(),
    addOnIds: z.array(z.string().min(1)).max(10).optional(),
  }),
  z.object({
    type: z.literal("set_quantity"),
    itemId: z.string().min(1),
    quantity: z.number().int().positive(),
    spiceLevel: z.string().min(1).optional(),
    addOnIds: z.array(z.string().min(1)).max(10).optional(),
  }),
  z.object({
    type: z.literal("remove_item"),
    itemId: z.string().min(1),
    spiceLevel: z.string().min(1).optional(),
    addOnIds: z.array(z.string().min(1)).max(10).optional(),
  }),
  z.object({
    type: z.literal("clear_cart"),
  }),
]);

const selectionPlanSchema = z
  .object({
    source: z.enum(["menu", "recent_referenced_items", "recent_suggested_items", "current_cart"]),
    itemIds: z.array(z.string().min(1)).optional(),
    query: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).optional(),
    category: z.enum(["rolls", "ramen", "appetizers", "salads"]).optional(),
    spiceLevel: z.string().min(1).optional(),
    addOnIds: z.array(z.string().min(1)).max(10).optional(),
    sortBy: z.enum(["relevance", "price"]).optional(),
    sortDirection: z.enum(["asc", "desc"]).optional(),
    take: z.number().int().positive().max(10).optional(),
    quantity: z.number().int().positive().max(20).optional(),
  })
  .nullable()
  .optional();

const missingSlotSchema = z.enum(["item", "quantity", "spice_level"]);

const commandSchema = z.object({
  state: z.enum(["ready", "needs_clarification", "inform"]),
  intent: z.enum([
    "add_items",
    "update_items",
    "remove_items",
    "clear_cart",
    "recommend_items",
    "explain_items",
    "clarify",
    "answer_question",
  ]),
  executable: z.boolean(),
  requiresConfirmation: z.boolean(),
  actions: z.array(actionSchema),
  selectionPlan: selectionPlanSchema,
});

const clarificationOptionSchema = z.object({
  label: z.string().min(1),
  prompt: z.string().min(1),
});

const conversationTurnSchema = z.object({
  role: z.enum(["assistant", "user"]),
  text: z.string().min(1),
  suggestedItemIds: z.array(z.string().min(1)).optional(),
  referencedItemIds: z.array(z.string().min(1)).optional(),
  actions: z.array(actionSchema).optional(),
  selectionPlan: selectionPlanSchema,
  command: commandSchema.nullable().optional(),
  missingSlots: z.array(missingSlotSchema).optional(),
  clarificationOptions: z.array(clarificationOptionSchema).optional(),
});

const cartItemSchema = z.object({
  cartId: z.string().min(1),
  itemId: z.string().min(1),
  name: z.string().min(1),
  price: z.number().finite().nonnegative(),
  quantity: z.number().int().positive(),
  spiceLevel: z.string().min(1).optional(),
  addOns: z.array(addOnSchema),
});

export const interpretRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(500),
  cartItems: z.array(cartItemSchema).max(50),
  conversation: z.array(conversationTurnSchema).max(20).optional(),
});
