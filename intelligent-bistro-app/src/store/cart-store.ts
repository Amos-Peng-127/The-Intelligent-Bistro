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

type CartState = {
  items: CartItem[];
  addItem: (item: MenuItem, options?: { quantity?: number; spiceLevel?: string; addOns?: AddOn[] }) => void;
  updateQuantity: (cartId: string, quantity: number) => void;
  removeItem: (cartId: string) => void;
  clearCart: () => void;
};

const makeCartId = (item: MenuItem, spiceLevel?: string, addOns: AddOn[] = []) => {
  const addOnKey = addOns.map((addOn) => addOn.id).sort().join("-");
  return [item.id, spiceLevel ?? "standard", addOnKey || "none"].join("__");
};

export const useCartStore = create<CartState>((set) => ({
  items: [],
  addItem: (item, options) =>
    set((state) => {
      const quantity = options?.quantity ?? 1;
      const addOns = options?.addOns ?? [];
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
