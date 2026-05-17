import type { CartItem } from "@/store/cart-store";
import type { MenuCategoryId } from "@/data/menu";

export type BistroAiAction =
  | {
      type: "add_item";
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

export type BistroAiConversationTurn = {
  role: "assistant" | "user";
  text: string;
  suggestedItemIds?: string[];
  referencedItemIds?: string[];
  actions?: BistroAiAction[];
  selectionPlan?: BistroAiSelectionPlan | null;
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
};

export type BistroAiRequest = {
  prompt: string;
  cartItems: CartItem[];
  conversation?: BistroAiConversationTurn[];
};
