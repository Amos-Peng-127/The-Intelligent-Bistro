import { menuItems } from "@/data/menu";
import type { CartItem } from "@/store/cart-store";

const getCourseLabel = (category: (typeof menuItems)[number]["category"]) => {
  switch (category) {
    case "rolls":
    case "ramen":
      return "main";
    case "appetizers":
      return "starter";
    case "salads":
      return "salad";
    default:
      return category;
  }
};

export const buildMenuCatalog = () =>
  menuItems
    .map((item) => {
      const spiceLevels = item.spiceLevels?.join("/") ?? "None";
      const addOns = item.addOns?.map((addOn) => addOn.name).join(", ") ?? "None";
      const tags = item.tags.join(", ");

      return [
        `id: ${item.id}`,
        `name: ${item.name}`,
        `category: ${item.category}`,
        `course: ${getCourseLabel(item.category)}`,
        `price: ${item.price}`,
        `tags: ${tags}`,
        `spice: ${spiceLevels}`,
        `addons: ${addOns}`,
      ].join(" | ");
    })
    .join("\n");

export const buildCartCatalog = (cartItems: CartItem[]) => {
  if (cartItems.length === 0) {
    return "Cart is empty.";
  }

  return cartItems
    .map((item) => {
      const addOns = item.addOns.map((addOn) => addOn.name).join(", ") || "None";
      return [
        `cartId: ${item.cartId}`,
        `itemId: ${item.itemId}`,
        `name: ${item.name}`,
        `quantity: ${item.quantity}`,
        `spice: ${item.spiceLevel ?? "None"}`,
        `addons: ${addOns}`,
      ].join(" | ");
    })
    .join("\n");
};
