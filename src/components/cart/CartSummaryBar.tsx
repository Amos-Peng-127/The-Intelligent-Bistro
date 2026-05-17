import { Pressable, StyleSheet, Text, View } from "react-native";

import { currency } from "@/lib/format";

type CartSummaryBarProps = {
  count: number;
  subtotal: number;
  onViewCart: () => void;
};

export function CartSummaryBar({ count, subtotal, onViewCart }: CartSummaryBarProps) {
  if (count === 0) {
    return null;
  }

  return (
    <View style={styles.cartBar}>
      <View>
        <Text style={styles.cartBarTitle}>
          {count} {count === 1 ? "item" : "items"} in your order
        </Text>
        <Text style={styles.cartBarSubtitle}>Subtotal {currency.format(subtotal)}</Text>
      </View>
      <Pressable accessibilityLabel="View cart" onPress={onViewCart} style={styles.cartBarAction}>
        <Text style={styles.cartBarActionText}>View cart</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cartBar: {
    alignItems: "center",
    backgroundColor: "#17251F",
    borderRadius: 24,
    bottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    left: 18,
    padding: 16,
    position: "absolute",
    right: 18,
  },
  cartBarTitle: {
    color: "#FFF8EA",
    fontSize: 15,
    fontWeight: "900",
  },
  cartBarSubtitle: {
    color: "#C9F05C",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 3,
  },
  cartBarAction: {
    backgroundColor: "#FFF8EA",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cartBarActionText: {
    color: "#17251F",
    fontSize: 13,
    fontWeight: "900",
  },
});
