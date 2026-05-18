export type MenuCategoryId = "featured" | "rolls" | "ramen" | "appetizers" | "salads";

export type AddOn = {
  id: string;
  name: string;
  price: number;
};

export type MenuCatalogItem = {
  id: string;
  name: string;
  category: Exclude<MenuCategoryId, "featured">;
  description: string;
  price: number;
  tags: string[];
  featured?: boolean;
  spiceLevels?: string[];
  addOns?: AddOn[];
};

export const categories: Array<{ id: MenuCategoryId; label: string }> = [
  { id: "featured", label: "Featured" },
  { id: "rolls", label: "Fresh Rolls" },
  { id: "ramen", label: "Ramen" },
  { id: "appetizers", label: "Appetizers" },
  { id: "salads", label: "Salads" },
];

const spiceLevels = ["Mild", "Medium", "Spicy"];

export const menuCatalogItems: MenuCatalogItem[] = [
  {
    id: "mango-salmon-delight",
    name: "Mango Salmon Delight",
    category: "rolls",
    description: "Salmon, ripe mango, cucumber, yuzu kosho, and citrus soy.",
    price: 18,
    tags: ["Popular", "Fresh"],
    featured: true,
    spiceLevels,
    addOns: [
      { id: "extra-salmon", name: "Extra salmon", price: 5 },
      { id: "avocado", name: "Avocado", price: 2 },
      { id: "yuzu-sauce", name: "Yuzu sauce", price: 1 },
    ],
  },
  {
    id: "black-garlic-ramen",
    name: "Black Garlic Ramen",
    category: "ramen",
    description: "Silky tonkotsu broth, black garlic oil, chashu, egg, and scallions.",
    price: 17,
    tags: ["Chef's pick", "Rich"],
    featured: true,
    spiceLevels,
    addOns: [
      { id: "ajitama", name: "Marinated egg", price: 2 },
      { id: "extra-chashu", name: "Extra chashu", price: 4 },
      { id: "corn", name: "Sweet corn", price: 1.5 },
    ],
  },
  {
    id: "truffle-salmon-roll",
    name: "Truffle Salmon Roll",
    category: "rolls",
    description: "Seared salmon, truffle ponzu, avocado, and crispy shallots.",
    price: 19,
    tags: ["Premium", "Aromatic"],
    featured: true,
    spiceLevels,
    addOns: [
      { id: "extra-truffle", name: "Extra truffle ponzu", price: 2 },
      { id: "avocado", name: "Avocado", price: 2 },
    ],
  },
  {
    id: "hamachi-yuzu-roll",
    name: "Hamachi Yuzu Roll",
    category: "rolls",
    description: "Yellowtail, cucumber, micro greens, and bright yuzu dressing.",
    price: 18,
    tags: ["Citrus", "Light"],
    spiceLevels,
  },
  {
    id: "lemon-blossom-roll",
    name: "Lemon Blossom Roll",
    category: "rolls",
    description: "Crab, avocado, lemon zest, sesame, and a clean soy glaze.",
    price: 16,
    tags: ["Bright", "Signature"],
  },
  {
    id: "truffle-albacore-roll",
    name: "Truffle Albacore Roll",
    category: "rolls",
    description: "Albacore, truffle soy, crispy garlic, and pickled cucumber.",
    price: 19,
    tags: ["Premium", "Umami"],
  },
  {
    id: "yuzu-ceviche-roll",
    name: "Yuzu Ceviche Roll",
    category: "rolls",
    description: "Fresh fish, avocado, red onion, cilantro, and yuzu leche de tigre.",
    price: 17,
    tags: ["Fresh", "Tangy"],
    spiceLevels,
  },
  {
    id: "tonkotsu-ramen",
    name: "Tonkotsu Ramen",
    category: "ramen",
    description: "Classic pork broth, thin noodles, chashu, bamboo shoots, and egg.",
    price: 16,
    tags: ["Classic", "Comfort"],
    spiceLevels,
    addOns: [
      { id: "ajitama", name: "Marinated egg", price: 2 },
      { id: "extra-noodles", name: "Extra noodles", price: 3 },
      { id: "extra-chashu", name: "Extra chashu", price: 4 },
    ],
  },
  {
    id: "agedashi-tofu",
    name: "Agedashi Tofu",
    category: "appetizers",
    description: "Crisp tofu in warm tentsuyu broth with daikon and scallion.",
    price: 9,
    tags: ["Vegetarian", "Warm"],
  },
  {
    id: "edamame",
    name: "Edamame",
    category: "appetizers",
    description: "Steamed soybeans finished with sea salt.",
    price: 6,
    tags: ["Vegan", "Shareable"],
  },
  {
    id: "spicy-garlic-edamame",
    name: "Spicy Garlic Edamame",
    category: "appetizers",
    description: "Edamame tossed with chili garlic oil and toasted sesame.",
    price: 8,
    tags: ["Spicy", "Shareable"],
    spiceLevels,
  },
  {
    id: "truffle-fries",
    name: "Truffle Fries",
    category: "appetizers",
    description: "Crispy fries, truffle salt, parmesan, herbs, and aioli.",
    price: 10,
    tags: ["Crispy", "Popular"],
  },
  {
    id: "avocado-salad",
    name: "Avocado Salad",
    category: "salads",
    description: "Avocado, greens, cucumber, cherry tomato, and sesame vinaigrette.",
    price: 12,
    tags: ["Vegetarian", "Light"],
    addOns: [
      { id: "salmon", name: "Salmon", price: 5 },
      { id: "tofu", name: "Tofu", price: 3 },
    ],
  },
  {
    id: "seaweed-salad",
    name: "Seaweed Salad",
    category: "salads",
    description: "Wakame, sesame, cucumber, and ginger soy dressing.",
    price: 8,
    tags: ["Vegan", "Refreshing"],
  },
];
