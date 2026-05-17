import { menuItems } from "@/data/menu";
import type { AddOn, MenuItem } from "@/data/menu";
import type { CartItem } from "@/store/cart-store";

import type { BistroAiAction } from "./types";

type ApplyAiActionsArgs = {
  actions: BistroAiAction[];
  cartItems: CartItem[];
  addItem: (item: MenuItem, options?: { quantity?: number; spiceLevel?: string; addOns?: AddOn[] }) => void;
  removeItem: (cartId: string) => void;
  clearCart: () => void;
};

const menuById = new Map(menuItems.map((item) => [item.id, item]));

const normalizeSpiceLevel = (item: MenuItem, spiceLevel?: string) => {
  if (!spiceLevel || !item.spiceLevels?.length) {
    return item.spiceLevels?.[0];
  }

  const matched = item.spiceLevels.find(
    (level) => level.toLowerCase() === spiceLevel.trim().toLowerCase(),
  );

  return matched ?? item.spiceLevels[0];
};

export const describeAiAction = (action: BistroAiAction) => {
  switch (action.type) {
    case "add_item": {
      const itemName = menuById.get(action.itemId)?.name ?? action.itemId;
      const spiceLabel = action.spiceLevel ? ` - ${action.spiceLevel}` : "";
      return `Add ${action.quantity} x ${itemName}${spiceLabel}`;
    }
    case "remove_item": {
      const itemName = menuById.get(action.itemId)?.name ?? action.itemId;
      return `Remove ${itemName}`;
    }
    case "clear_cart":
      return "Clear the cart";
  }
};

export const applyAiActions = ({
  actions,
  cartItems,
  addItem,
  removeItem,
  clearCart,
}: ApplyAiActionsArgs) => {
  const applied: string[] = [];

  actions.forEach((action) => {
    switch (action.type) {
      case "add_item": {
        const item = menuById.get(action.itemId);
        if (!item) {
          return;
        }

        addItem(item, {
          quantity: action.quantity,
          spiceLevel: normalizeSpiceLevel(item, action.spiceLevel),
          addOns: [],
        });
        applied.push(describeAiAction(action));
        return;
      }
      case "remove_item": {
        const matches = cartItems.filter((item) => item.itemId === action.itemId);
        matches.forEach((item) => removeItem(item.cartId));
        if (matches.length > 0) {
          applied.push(describeAiAction(action));
        }
        return;
      }
      case "clear_cart": {
        if (cartItems.length > 0) {
          clearCart();
          applied.push(describeAiAction(action));
        }
      }
    }
  });

  return applied;
};
