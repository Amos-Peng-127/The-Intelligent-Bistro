import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import type { MenuItem } from "@/data/menu";
import { currency } from "@/lib/format";

type MenuItemCardProps = {
  item: MenuItem;
  onOpen: (item: MenuItem) => void;
  onQuickAdd: (item: MenuItem) => void;
};

export function MenuItemCard({ item, onOpen, onQuickAdd }: MenuItemCardProps) {
  return (
    <Pressable style={styles.menuCard} onPress={() => onOpen(item)}>
      <Image source={item.image} resizeMode="cover" style={styles.menuImage} />
      <View style={styles.menuBody}>
        <View style={styles.menuTitleRow}>
          <Text style={styles.menuName}>{item.name}</Text>
          <Text style={styles.menuPrice}>{currency.format(item.price)}</Text>
        </View>
        <Text style={styles.menuDescription}>{item.description}</Text>
        <View style={styles.tagRow}>
          {item.tags.slice(0, 2).map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>
      <Pressable
        accessibilityLabel={`Add ${item.name}`}
        onPress={(event) => {
          event.stopPropagation();
          onQuickAdd(item);
        }}
        style={styles.quickAdd}
      >
        <Text style={styles.quickAddText}>+</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  menuCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#ECE2D3",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 136,
    overflow: "hidden",
    padding: 10,
    position: "relative",
  },
  menuImage: {
    borderRadius: 16,
    height: 112,
    width: 104,
  },
  menuBody: {
    flex: 1,
    marginLeft: 12,
    paddingRight: 34,
  },
  menuTitleRow: {
    gap: 6,
  },
  menuName: {
    color: "#17251F",
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 20,
  },
  menuPrice: {
    color: "#3F5C4A",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 2,
  },
  menuDescription: {
    color: "#6E6255",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    marginTop: 6,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 9,
  },
  tag: {
    backgroundColor: "#F4EFDF",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  tagText: {
    color: "#655A4E",
    fontSize: 10,
    fontWeight: "900",
  },
  quickAdd: {
    alignItems: "center",
    backgroundColor: "#F06449",
    borderRadius: 17,
    height: 34,
    justifyContent: "center",
    position: "absolute",
    right: 12,
    top: 12,
    width: 34,
  },
  quickAddText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 26,
  },
});
