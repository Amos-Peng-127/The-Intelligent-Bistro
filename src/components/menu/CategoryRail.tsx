import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

import type { MenuCategoryId } from "@/data/menu";

type Category = {
  id: MenuCategoryId;
  label: string;
};

type CategoryRailProps = {
  categories: Category[];
  selectedCategory: MenuCategoryId;
  onSelectCategory: (category: MenuCategoryId) => void;
};

export function CategoryRail({
  categories,
  selectedCategory,
  onSelectCategory,
}: CategoryRailProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.categoryRail}
    >
      {categories.map((category) => {
        const active = selectedCategory === category.id;
        return (
          <Pressable
            key={category.id}
            onPress={() => onSelectCategory(category.id)}
            style={[styles.categoryChip, active && styles.categoryChipActive]}
          >
            <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
              {category.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  categoryRail: {
    gap: 10,
    paddingVertical: 18,
  },
  categoryChip: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8DFD0",
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  categoryChipActive: {
    backgroundColor: "#17251F",
    borderColor: "#17251F",
  },
  categoryText: {
    color: "#64594D",
    fontSize: 13,
    fontWeight: "800",
  },
  categoryTextActive: {
    color: "#FFF8EA",
  },
});
