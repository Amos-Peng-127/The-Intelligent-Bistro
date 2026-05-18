import { create } from "zustand";
import type { AddOn, MenuItem } from "@/data/menu";

export type CartItem = {
  cartId: string;
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  spiceLevel?: string;
  addOns: AddOn[];
  image: MenuItem["image"];
};

type CartItemOptions = {
  quantity?: number;
  spiceLevel?: string;
  addOns?: AddOn[];
};

type CartState = {
  items: CartItem[];
  addItem: (item: MenuItem, options?: CartItemOptions) => void;
  updateItemConfiguration: (cartId: string, item: MenuItem, options: CartItemOptions & { quantity: number }) => void;
  updateQuantity: (cartId: string, quantity: number) => void;
  removeItem: (cartId: string) => void;
  clearCart: () => void;
};

const makeCartId = (item: MenuItem, spiceLevel?: string, addOns: AddOn[] = []) => {
  const addOnKey = addOns.map((addOn) => addOn.id).sort().join("-");
  return [item.id, spiceLevel ?? "standard", addOnKey || "none"].join("__");
};

const normalizeAddOns = (addOns: AddOn[] = []) => {
  const seen = new Set<string>();

  return addOns.filter((addOn) => {
    if (seen.has(addOn.id)) {
      return false;
    }

    seen.add(addOn.id);
    return true;
  });
};

export const useCartStore = create<CartState>((set) => ({
  items: [],
  addItem: (item, options) =>
    set((state) => {
      const quantity = options?.quantity ?? 1;
      const addOns = normalizeAddOns(options?.addOns ?? []);
      const cartId = makeCartId(item, options?.spiceLevel, addOns);
      const existing = state.items.find((cartItem) => cartItem.cartId === cartId);

      if (existing) {
        return {
          items: state.items.map((cartItem) =>
            cartItem.cartId === cartId
              ? { ...cartItem, quantity: cartItem.quantity + quantity }
              : cartItem,
          ),
        };
      }

      return {
        items: [
          ...state.items,
          {
            cartId,
            itemId: item.id,
            name: item.name,
            price: item.price,
            quantity,
            spiceLevel: options?.spiceLevel,
            addOns,
            image: item.image,
          },
        ],
      };
    }),
  updateItemConfiguration: (cartId, item, options) =>
    set((state) => {
      const currentIndex = state.items.findIndex((cartItem) => cartItem.cartId === cartId);
      if (currentIndex < 0) {
        return state;
      }

      const quantity = Math.max(1, Math.round(options.quantity));
      const addOns = normalizeAddOns(options.addOns ?? []);
      const nextCartId = makeCartId(item, options.spiceLevel, addOns);

      if (nextCartId === cartId) {
        return {
          items: state.items.map((cartItem) =>
            cartItem.cartId === cartId
              ? {
                  ...cartItem,
                  addOns,
                  quantity,
                  spiceLevel: options.spiceLevel,
                }
              : cartItem,
          ),
        };
      }

      const itemsWithoutCurrent = state.items.filter((cartItem) => cartItem.cartId !== cartId);
      const existingIndex = itemsWithoutCurrent.findIndex((cartItem) => cartItem.cartId === nextCartId);

      if (existingIndex >= 0) {
        return {
          items: itemsWithoutCurrent.map((cartItem, index) =>
            index === existingIndex
              ? {
                  ...cartItem,
                  quantity: cartItem.quantity + quantity,
                }
              : cartItem,
          ),
        };
      }

      const nextItems = [...itemsWithoutCurrent];
      nextItems.splice(Math.min(currentIndex, nextItems.length), 0, {
        cartId: nextCartId,
        itemId: item.id,
        name: item.name,
        price: item.price,
        quantity,
        spiceLevel: options.spiceLevel,
        addOns,
        image: item.image,
      });

      return {
        items: nextItems,
      };
    }),
  updateQuantity: (cartId, quantity) =>
    set((state) => ({
      items:
        quantity <= 0
          ? state.items.filter((cartItem) => cartItem.cartId !== cartId)
          : state.items.map((cartItem) =>
              cartItem.cartId === cartId ? { ...cartItem, quantity } : cartItem,
            ),
    })),
  removeItem: (cartId) =>
    set((state) => ({
      items: state.items.filter((cartItem) => cartItem.cartId !== cartId),
    })),
  clearCart: () => set({ items: [] }),
}));

export const getCartTotals = (items: CartItem[]) => {
  return items.reduce(
    (totals, item) => {
      const addOnsTotal = item.addOns.reduce((sum, addOn) => sum + addOn.price, 0);
      const lineTotal = (item.price + addOnsTotal) * item.quantity;
      return {
        count: totals.count + item.quantity,
        subtotal: totals.subtotal + lineTotal,
      };
    },
    { count: 0, subtotal: 0 },
  );
};
