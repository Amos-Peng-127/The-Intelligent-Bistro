import { Pressable, StyleSheet, Text, View } from "react-native";

type MenuHeaderProps = {
  cartCount: number;
};

export function MenuHeader({ cartCount }: MenuHeaderProps) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.eyebrow}>Open now - 20-30 min</Text>
        <Text style={styles.title}>Intelligent Bistro</Text>
      </View>
      <Pressable accessibilityLabel="Open cart" style={styles.cartButton}>
        <Text style={styles.cartIcon}>Bag</Text>
        {cartCount > 0 ? (
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{cartCount}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 10,
  },
  eyebrow: {
    color: "#7A6E5F",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
  },
  title: {
    color: "#17251F",
    fontSize: 31,
    fontWeight: "900",
    letterSpacing: 0,
  },
  cartButton: {
    alignItems: "center",
    backgroundColor: "#17251F",
    borderRadius: 22,
    height: 54,
    justifyContent: "center",
    position: "relative",
    width: 54,
  },
  cartIcon: {
    color: "#FFF8EA",
    fontSize: 12,
    fontWeight: "900",
  },
  cartBadge: {
    alignItems: "center",
    backgroundColor: "#F06449",
    borderRadius: 10,
    height: 20,
    justifyContent: "center",
    minWidth: 20,
    paddingHorizontal: 5,
    position: "absolute",
    right: -3,
    top: -3,
  },
  cartBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
  },
});
