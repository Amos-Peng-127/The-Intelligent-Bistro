import { menuItems } from "@/data/menu";
import type { AddOn, MenuItem } from "@/data/menu";
import type { CartItem } from "@/store/cart-store";

import { matchesActionCartVariant, resolveSetQuantityTarget } from "./cart-targeting";
import type { BistroAiAction } from "./types";

type ApplyAiActionsArgs = {
  actions: BistroAiAction[];
  cartItems: CartItem[];
  addItem: (item: MenuItem, options?: { quantity?: number; spiceLevel?: string; addOns?: AddOn[] }) => void;
  updateQuantity: (cartId: string, quantity: number) => void;
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

const resolveActionAddOns = (item: MenuItem, addOnIds?: string[]) => {
  if (!item.addOns?.length || !Array.isArray(addOnIds)) {
    return [];
  }

  const addOnsById = new Map(item.addOns.map((addOn) => [addOn.id, addOn]));
  const seen = new Set<string>();

  return addOnIds.reduce<AddOn[]>((resolved, addOnId) => {
    const addOn = addOnsById.get(addOnId);
    if (!addOn || seen.has(addOn.id)) {
      return resolved;
    }

    seen.add(addOn.id);
    resolved.push(addOn);
    return resolved;
  }, []);
};

const buildModifierLabel = (item: MenuItem | undefined, action: BistroAiAction) => {
  const parts: string[] = [];

  if ("spiceLevel" in action && action.spiceLevel) {
    parts.push(action.spiceLevel);
  }

  if (item && "addOnIds" in action && Array.isArray(action.addOnIds)) {
    const addOnNames = resolveActionAddOns(item, action.addOnIds).map((addOn) => addOn.name);
    if (addOnNames.length > 0) {
      parts.push(addOnNames.join(", "));
    }
  }

  return parts.length > 0 ? ` (${parts.join(" | ")})` : "";
};

export const describeAiAction = (action: BistroAiAction) => {
  switch (action.type) {
    case "add_item": {
      const item = menuById.get(action.itemId);
      const itemName = item?.name ?? action.itemId;
      return `Add ${action.quantity} x ${itemName}${buildModifierLabel(item, action)}`;
    }
    case "remove_item": {
      const item = menuById.get(action.itemId);
      const itemName = item?.name ?? action.itemId;
      return `Remove ${itemName}${buildModifierLabel(item, action)}`;
    }
    case "set_quantity": {
      const item = menuById.get(action.itemId);
      const itemName = item?.name ?? action.itemId;
      return `Set ${itemName}${buildModifierLabel(item, action)} to ${action.quantity}`;
    }
    case "clear_cart":
      return "Clear the cart";
  }
};

export const applyAiActions = ({
  actions,
  cartItems,
  addItem,
  updateQuantity,
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

        const addOns = resolveActionAddOns(item, action.addOnIds);

        addItem(item, {
          quantity: action.quantity,
          spiceLevel: normalizeSpiceLevel(item, action.spiceLevel),
          addOns,
        });
        applied.push(describeAiAction(action));
        return;
      }
      case "remove_item": {
        const matches = cartItems.filter((item) => matchesActionCartVariant(item, action));
        matches.forEach((item) => removeItem(item.cartId));
        if (matches.length > 0) {
          applied.push(describeAiAction(action));
        }
        return;
      }
      case "set_quantity": {
        const target = resolveSetQuantityTarget(cartItems, action);
        if (!target) {
          return;
        }

        updateQuantity(target.cartId, action.quantity);
        applied.push(
          describeAiAction({
            ...action,
            spiceLevel: action.spiceLevel ?? target.spiceLevel,
            addOnIds: action.addOnIds ?? target.addOns.map((addOn) => addOn.id),
          }),
        );
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
