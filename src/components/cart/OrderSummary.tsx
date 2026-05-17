import { Pressable, StyleSheet, Text, View } from "react-native";

import { currency } from "@/lib/format";

type OrderSummaryProps = {
  subtotal: number;
  tax: number;
  total: number;
  disabled?: boolean;
};

export function OrderSummary({ subtotal, tax, total, disabled }: OrderSummaryProps) {
  return (
    <View style={styles.summary}>
      <Text style={styles.title}>Order summary</Text>
      <View style={styles.line}>
        <Text style={styles.label}>Subtotal</Text>
        <Text style={styles.value}>{currency.format(subtotal)}</Text>
      </View>
      <View style={styles.line}>
        <Text style={styles.label}>Estimated tax</Text>
        <Text style={styles.value}>{currency.format(tax)}</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.line}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>{currency.format(total)}</Text>
      </View>
      <Pressable disabled={disabled} style={[styles.checkoutButton, disabled && styles.disabled]}>
        <Text style={styles.checkoutText}>Checkout</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    backgroundColor: "#17251F",
    borderRadius: 24,
    marginTop: 18,
    padding: 18,
  },
  title: {
    color: "#FFF8EA",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 14,
  },
  line: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 9,
  },
  label: {
    color: "#D8E3D5",
    fontSize: 14,
    fontWeight: "700",
  },
  value: {
    color: "#FFF8EA",
    fontSize: 14,
    fontWeight: "900",
  },
  divider: {
    backgroundColor: "rgba(255, 248, 234, 0.16)",
    height: 1,
    marginTop: 16,
  },
  totalLabel: {
    color: "#FFF8EA",
    fontSize: 17,
    fontWeight: "900",
  },
  totalValue: {
    color: "#C9F05C",
    fontSize: 20,
    fontWeight: "900",
  },
  checkoutButton: {
    alignItems: "center",
    backgroundColor: "#F06449",
    borderRadius: 20,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 56,
  },
  disabled: {
    opacity: 0.45,
  },
  checkoutText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
});
