import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { MenuItem } from "@/data/menu";
import { currency } from "@/lib/format";

type FeaturedRailProps = {
  items: MenuItem[];
  onOpenItem: (item: MenuItem) => void;
};

export function FeaturedRail({ items, onOpenItem }: FeaturedRailProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.featuredRail}
    >
      {items.map((item) => (
        <Pressable key={item.id} style={styles.featuredCard} onPress={() => onOpenItem(item)}>
          <ImageBackground source={item.image} resizeMode="cover" style={styles.featuredImage}>
            <View style={styles.featuredOverlay} />
            <View style={styles.featuredTag}>
              <Text style={styles.featuredTagText}>{item.tags[0]}</Text>
            </View>
            <View style={styles.featuredInfo}>
              <Text style={styles.featuredName}>{item.name}</Text>
              <Text style={styles.featuredPrice}>{currency.format(item.price)}</Text>
            </View>
          </ImageBackground>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  featuredRail: {
    gap: 14,
    paddingBottom: 18,
  },
  featuredCard: {
    borderRadius: 24,
    height: 210,
    overflow: "hidden",
    width: 260,
  },
  featuredImage: {
    flex: 1,
    justifyContent: "space-between",
    padding: 14,
  },
  featuredOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(9, 16, 12, 0.24)",
  },
  featuredTag: {
    alignSelf: "flex-start",
    backgroundColor: "#FFF8EA",
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  featuredTagText: {
    color: "#17251F",
    fontSize: 12,
    fontWeight: "900",
  },
  featuredInfo: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  featuredName: {
    color: "#FFFFFF",
    flex: 1,
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 25,
    marginRight: 12,
  },
  featuredPrice: {
    color: "#C9F05C",
    fontSize: 17,
    fontWeight: "900",
  },
});
