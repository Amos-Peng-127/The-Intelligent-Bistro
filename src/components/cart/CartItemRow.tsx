import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { currency } from "@/lib/format";
import type { CartItem } from "@/store/cart-store";

type CartItemRowProps = {
  item: CartItem;
  onDecrease: (cartId: string, quantity: number) => void;
  onIncrease: (cartId: string, quantity: number) => void;
  onEdit: (cartId: string) => void;
  onRemove: (cartId: string) => void;
};

export function CartItemRow({ item, onDecrease, onIncrease, onEdit, onRemove }: CartItemRowProps) {
  const addOnsTotal = item.addOns.reduce((sum, addOn) => sum + addOn.price, 0);
  const lineTotal = (item.price + addOnsTotal) * item.quantity;
  const optionSummary = [
    item.spiceLevel ? `${item.spiceLevel} spice` : undefined,
    ...item.addOns.map((addOn) => addOn.name),
  ].filter(Boolean);
  const unitPrice = item.price + addOnsTotal;

  return (
    <View style={styles.card}>
      <Image source={item.image} resizeMode="cover" style={styles.image} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.total}>{currency.format(lineTotal)}</Text>
        </View>
        {optionSummary.length > 0 ? (
          <Text style={styles.options}>{optionSummary.join(" / ")}</Text>
        ) : (
          <Text style={styles.options}>Standard preparation</Text>
        )}
        <Text style={styles.unitPrice}>{currency.format(unitPrice)} each</Text>
        <View style={styles.controls}>
          <View style={styles.quantityPill}>
            <Pressable
              accessibilityLabel={`Decrease ${item.name}`}
              onPress={() => onDecrease(item.cartId, item.quantity - 1)}
              style={styles.stepperButton}
            >
              <Text style={styles.stepperText}>-</Text>
            </Pressable>
            <Text style={styles.quantity}>{item.quantity}</Text>
            <Pressable
              accessibilityLabel={`Increase ${item.name}`}
              onPress={() => onIncrease(item.cartId, item.quantity + 1)}
              style={styles.stepperButton}
            >
              <Text style={styles.stepperText}>+</Text>
            </Pressable>
          </View>
          <View style={styles.actionRow}>
            <Pressable
              accessibilityLabel={`Edit ${item.name}`}
              onPress={() => onEdit(item.cartId)}
              style={styles.editButton}
            >
              <Text style={styles.editText}>Edit</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={`Remove ${item.name}`}
              onPress={() => onRemove(item.cartId)}
              style={styles.removeButton}
            >
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#ECE2D3",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    padding: 10,
  },
  image: {
    borderRadius: 16,
    height: 112,
    width: 98,
  },
  body: {
    flex: 1,
    marginLeft: 12,
  },
  titleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  name: {
    color: "#17251F",
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 20,
  },
  total: {
    color: "#3F5C4A",
    fontSize: 15,
    fontWeight: "900",
  },
  options: {
    color: "#75695A",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 7,
  },
  unitPrice: {
    color: "#9A8B7B",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 5,
  },
  controls: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },
  quantityPill: {
    alignItems: "center",
    backgroundColor: "#F4EFDF",
    borderRadius: 16,
    flexDirection: "row",
    padding: 4,
  },
  stepperButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  stepperText: {
    color: "#17251F",
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22,
  },
  quantity: {
    color: "#17251F",
    fontSize: 14,
    fontWeight: "900",
    minWidth: 32,
    textAlign: "center",
  },
  actionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  editButton: {
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  editText: {
    color: "#3F5C4A",
    fontSize: 12,
    fontWeight: "900",
  },
  removeButton: {
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  removeText: {
    color: "#F06449",
    fontSize: 12,
    fontWeight: "900",
  },
});
