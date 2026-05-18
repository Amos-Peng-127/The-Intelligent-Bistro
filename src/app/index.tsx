import { useMemo, useState } from "react";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CartSummaryBar } from "@/components/cart/CartSummaryBar";
import { AiOrderCard } from "@/components/menu/AiOrderCard";
import { CategoryRail } from "@/components/menu/CategoryRail";
import { FeaturedRail } from "@/components/menu/FeaturedRail";
import { ItemDetailModal } from "@/components/menu/ItemDetailModal";
import { MenuHeader } from "@/components/menu/MenuHeader";
import { MenuItemCard } from "@/components/menu/MenuItemCard";
import { MenuSearch } from "@/components/menu/MenuSearch";
import { SectionHeader } from "@/components/menu/SectionHeader";
import { type AddOn, type MenuCategoryId, type MenuItem } from "@/data/menu";
import { fallbackMenuData, useBistroMenu } from "@/lib/bistro-api";
import { getCartTotals, useCartStore } from "@/store/cart-store";

export default function Index() {
  const [selectedCategory, setSelectedCategory] = useState<MenuCategoryId>("featured");
  const [query, setQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [detailSpice, setDetailSpice] = useState<string | undefined>();
  const [detailAddOns, setDetailAddOns] = useState<AddOn[]>([]);
  const menuQuery = useBistroMenu();
  const addItem = useCartStore((state) => state.addItem);
  const cartItems = useCartStore((state) => state.items);
  const { count, subtotal } = getCartTotals(cartItems);
  const menuData = menuQuery.data ?? fallbackMenuData;
  const menuCategories = menuData.categories;
  const allMenuItems = menuData.items;

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return allMenuItems.filter((item) => {
      const matchesCategory =
        selectedCategory === "featured" ? item.featured : item.category === selectedCategory;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        item.name.toLowerCase().includes(normalizedQuery) ||
        item.description.toLowerCase().includes(normalizedQuery) ||
        item.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery));

      return matchesCategory && matchesQuery;
    });
  }, [allMenuItems, query, selectedCategory]);

  const featuredItems = useMemo(() => allMenuItems.filter((item) => item.featured), [allMenuItems]);
  const sectionTitle =
    selectedCategory === "featured"
      ? "Chef-curated picks"
      : menuCategories.find((category) => category.id === selectedCategory)?.label ?? "Menu";
  const detailTotal = selectedItem
    ? (selectedItem.price + detailAddOns.reduce((sum, addOn) => sum + addOn.price, 0)) *
      detailQuantity
    : 0;

  const openDetails = (item: MenuItem) => {
    setSelectedItem(item);
    setDetailQuantity(1);
    setDetailSpice(item.spiceLevels?.[0]);
    setDetailAddOns([]);
  };

  const toggleAddOn = (addOn: AddOn) => {
    setDetailAddOns((current) =>
      current.some((selected) => selected.id === addOn.id)
        ? current.filter((selected) => selected.id !== addOn.id)
        : [...current, addOn],
    );
  };

  const quickAddItem = (item: MenuItem) => {
    addItem(item, { quantity: 1, spiceLevel: item.spiceLevels?.[0], addOns: [] });
  };

  const addFromDetails = () => {
    if (!selectedItem) {
      return;
    }

    addItem(selectedItem, {
      quantity: detailQuantity,
      spiceLevel: detailSpice,
      addOns: detailAddOns,
    });
    setSelectedItem(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[styles.content, count > 0 && styles.contentWithCart]}
        showsVerticalScrollIndicator={false}
      >
        <MenuHeader cartCount={count} onOpenCart={() => router.push("/cart")} />
        <MenuSearch query={query} onChangeQuery={setQuery} />
        <AiOrderCard onPress={() => router.push("/assistant")} />
        <CategoryRail
          categories={menuCategories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />
        <SectionHeader title={sectionTitle} itemCount={filteredItems.length} />

        {selectedCategory === "featured" && query.trim().length === 0 ? (
          <FeaturedRail items={featuredItems} onOpenItem={openDetails} />
        ) : null}

        <View style={styles.menuList}>
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                onOpen={openDetails}
                onQuickAdd={quickAddItem}
              />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>No dishes match that search.</Text>
              <Text style={styles.emptyStateText}>
                Try another keyword, switch categories, or ask Bistro AI for a curated pick.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <CartSummaryBar count={count} subtotal={subtotal} onViewCart={() => router.push("/cart")} />

      <ItemDetailModal
        item={selectedItem}
        quantity={detailQuantity}
        spiceLevel={detailSpice}
        selectedAddOns={detailAddOns}
        total={detailTotal}
        onClose={() => setSelectedItem(null)}
        onAddToCart={addFromDetails}
        onChangeQuantity={setDetailQuantity}
        onChangeSpiceLevel={setDetailSpice}
        onToggleAddOn={toggleAddOn}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F7F3EA",
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 32,
  },
  contentWithCart: {
    paddingBottom: 118,
  },
  menuList: {
    gap: 12,
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: "#FFF8EA",
    borderColor: "#E7DCCA",
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  emptyStateTitle: {
    color: "#17251F",
    fontSize: 17,
    fontWeight: "900",
  },
  emptyStateText: {
    color: "#6E6255",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 8,
    textAlign: "center",
  },
});
