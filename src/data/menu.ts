import type { ImageSourcePropType } from "react-native";
import {
  categories,
  menuCatalogItems,
  type AddOn,
  type MenuCatalogItem,
  type MenuCategoryId,
} from "./menu-catalog";

export { categories, menuCatalogItems, type AddOn, type MenuCatalogItem, type MenuCategoryId };

export type MenuItem = MenuCatalogItem & {
  image: ImageSourcePropType;
};

const fallbackMenuImage = require("../../assets/images/Signature Fresh Rolls/Mango Salmon Delight Signature Fresh Rolls.jpg");

const menuItemImages: Record<string, ImageSourcePropType> = {
  "mango-salmon-delight": require("../../assets/images/Signature Fresh Rolls/Mango Salmon Delight Signature Fresh Rolls.jpg"),
  "black-garlic-ramen": require("../../assets/images/Ramen/Black Garlic Ramen.jpg"),
  "truffle-salmon-roll": require("../../assets/images/Signature Fresh Rolls/Truffle Salmon Signature Fresh Rolls.jpg"),
  "hamachi-yuzu-roll": require("../../assets/images/Signature Fresh Rolls/Hamachi Yuzu Signature Fresh Rolls.jpg"),
  "lemon-blossom-roll": require("../../assets/images/Signature Fresh Rolls/Lemon Blossom Signature Fresh Rolls.jpg"),
  "truffle-albacore-roll": require("../../assets/images/Signature Fresh Rolls/Truffle Albacore Signature Fresh Rolls.jpg"),
  "yuzu-ceviche-roll": require("../../assets/images/Signature Fresh Rolls/Yuzu Ceviche Signature Fresh Rolls.jpg"),
  "tonkotsu-ramen": require("../../assets/images/Ramen/Tonkotsu Ramen.jpg"),
  "agedashi-tofu": require("../../assets/images/Appetizers/Agedashi Tofu.jpg"),
  edamame: require("../../assets/images/Appetizers/Edamame.jpg"),
  "spicy-garlic-edamame": require("../../assets/images/Appetizers/Spicy Garlic Edamame.jpg"),
  "truffle-fries": require("../../assets/images/Appetizers/Truffle Fries.jpg"),
  "avocado-salad": require("../../assets/images/Salad/Avocado Salad.jpg"),
  "seaweed-salad": require("../../assets/images/Salad/Seaweed Salad.jpg"),
};

export const attachMenuImage = (item: MenuCatalogItem): MenuItem => ({
  ...item,
  image: menuItemImages[item.id] ?? fallbackMenuImage,
});

export const attachMenuImages = (items: MenuCatalogItem[]) => items.map(attachMenuImage);

export const menuItems: MenuItem[] = attachMenuImages(menuCatalogItems);
