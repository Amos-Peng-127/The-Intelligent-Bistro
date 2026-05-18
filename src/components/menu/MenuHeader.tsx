import { Pressable, StyleSheet, Text, View } from "react-native";

type MenuHeaderProps = {
  cartCount: number;
  onOpenCart: () => void;
};

export function MenuHeader({ cartCount, onOpenCart }: MenuHeaderProps) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.eyebrow}>Open now - 20-30 min</Text>
        <Text style={styles.title}>Intelligent Bistro</Text>
      </View>
      <Pressable accessibilityLabel="Open cart" onPress={onOpenCart} style={styles.cartButton}>
        <Text style={styles.cartLabel}>Cart</Text>
        <View style={[styles.cartBadge, cartCount === 0 && styles.cartBadgeEmpty]}>
          <Text style={[styles.cartBadgeText, cartCount === 0 && styles.cartBadgeTextEmpty]}>
            {cartCount}
          </Text>
        </View>
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
    flexDirection: "row",
    gap: 10,
    height: 54,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  cartLabel: {
    color: "#FFF8EA",
    fontSize: 13,
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
  },
  cartBadgeEmpty: {
    backgroundColor: "rgba(255, 248, 234, 0.12)",
  },
  cartBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
  },
  cartBadgeTextEmpty: {
    color: "#FFF8EA",
  },
});
