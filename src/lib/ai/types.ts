import type { AddOn, MenuCategoryId } from "../../data/menu-catalog";

export type BistroCartItem = {
  cartId: string;
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  spiceLevel?: string;
  addOns: AddOn[];
};

export type BistroAiAction =
  | {
      type: "add_item";
      itemId: string;
      quantity: number;
      spiceLevel?: string;
    }
  | {
      type: "set_quantity";
      itemId: string;
      quantity: number;
      spiceLevel?: string;
    }
  | {
      type: "remove_item";
      itemId: string;
    }
  | {
      type: "clear_cart";
    };

export type BistroAiIntent =
  | "add_items"
  | "update_items"
  | "remove_items"
  | "clear_cart"
  | "recommend_items"
  | "explain_items"
  | "clarify"
  | "answer_question";

export type BistroAiSelectionSource =
  | "menu"
  | "recent_referenced_items"
  | "recent_suggested_items"
  | "current_cart";

export type BistroAiSelectionPlan = {
  source: BistroAiSelectionSource;
  itemIds?: string[];
  query?: string;
  tags?: string[];
  category?: Exclude<MenuCategoryId, "featured">;
  spiceLevel?: string;
  sortBy?: "relevance" | "price";
  sortDirection?: "asc" | "desc";
  take?: number;
  quantity?: number;
};

export type BistroAiMissingSlot = "item" | "quantity";

export type BistroAiClarificationOption = {
  label: string;
  prompt: string;
};

export type BistroAiCommand = {
  state: "ready" | "needs_clarification" | "inform";
  intent: BistroAiIntent;
  executable: boolean;
  requiresConfirmation: boolean;
  actions: BistroAiAction[];
  selectionPlan?: BistroAiSelectionPlan | null;
};

export type BistroAiConversationTurn = {
  role: "assistant" | "user";
  text: string;
  suggestedItemIds?: string[];
  referencedItemIds?: string[];
  actions?: BistroAiAction[];
  selectionPlan?: BistroAiSelectionPlan | null;
  command?: BistroAiCommand | null;
  missingSlots?: BistroAiMissingSlot[];
  clarificationOptions?: BistroAiClarificationOption[];
};

export type BistroAiResponse = {
  intent: BistroAiIntent;
  reply: string;
  needsConfirmation: boolean;
  actions: BistroAiAction[];
  suggestedItemIds: string[];
  referencedItemIds: string[];
  unavailableRequests: string[];
  selectionPlan?: BistroAiSelectionPlan | null;
  missingSlots?: BistroAiMissingSlot[];
  clarificationOptions?: BistroAiClarificationOption[];
  command?: BistroAiCommand;
};

export type BistroAiRequest = {
  prompt: string;
  cartItems: BistroCartItem[];
  conversation?: BistroAiConversationTurn[];
};
