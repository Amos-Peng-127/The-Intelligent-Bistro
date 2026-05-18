import { useMemo, useState } from "react";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CartItemRow } from "@/components/cart/CartItemRow";
import { EmptyCart } from "@/components/cart/EmptyCart";
import { OrderSummary } from "@/components/cart/OrderSummary";
import { ItemDetailModal } from "@/components/menu/ItemDetailModal";
import { type AddOn, menuItems } from "@/data/menu";
import { currency } from "@/lib/format";
import { getCartTotals, useCartStore } from "@/store/cart-store";

const TAX_RATE = 0.08875;
const menuById = new Map(menuItems.map((item) => [item.id, item]));

export default function CartScreen() {
  const [editingCartId, setEditingCartId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState(1);
  const [editSpice, setEditSpice] = useState<string | undefined>();
  const [editAddOns, setEditAddOns] = useState<AddOn[]>([]);
  const items = useCartStore((state) => state.items);
  const updateItemConfiguration = useCartStore((state) => state.updateItemConfiguration);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const { count, subtotal } = getCartTotals(items);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;
  const editingCartItem = useMemo(
    () => items.find((item) => item.cartId === editingCartId) ?? null,
    [editingCartId, items],
  );
  const editingMenuItem = editingCartItem ? menuById.get(editingCartItem.itemId) ?? null : null;
  const editTotal = editingMenuItem
    ? (editingMenuItem.price + editAddOns.reduce((sum, addOn) => sum + addOn.price, 0)) * editQuantity
    : 0;

  const closeEditor = () => {
    setEditingCartId(null);
    setEditQuantity(1);
    setEditSpice(undefined);
    setEditAddOns([]);
  };

  const openEditor = (cartId: string) => {
    const cartItem = items.find((item) => item.cartId === cartId);
    if (!cartItem || !menuById.has(cartItem.itemId)) {
      return;
    }

    setEditingCartId(cartId);
    setEditQuantity(cartItem.quantity);
    setEditSpice(cartItem.spiceLevel);
    setEditAddOns(cartItem.addOns);
  };

  const toggleEditAddOn = (addOn: AddOn) => {
    setEditAddOns((current) =>
      current.some((selected) => selected.id === addOn.id)
        ? current.filter((selected) => selected.id !== addOn.id)
        : [...current, addOn],
    );
  };

  const saveEditedItem = () => {
    if (!editingCartId || !editingMenuItem) {
      return;
    }

    updateItemConfiguration(editingCartId, editingMenuItem, {
      quantity: editQuantity,
      spiceLevel: editSpice,
      addOns: editAddOns,
    });
    closeEditor();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back to menu"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>Your order</Text>
            <Text style={styles.title}>Cart</Text>
          </View>
          <Pressable
            accessibilityLabel="Clear cart"
            disabled={count === 0}
            onPress={clearCart}
            style={[styles.clearButton, count === 0 && styles.clearButtonDisabled]}
          >
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        </View>

        {count === 0 ? (
          <EmptyCart onBrowseMenu={() => router.replace("/")} />
        ) : (
          <>
            <View style={styles.statusCard}>
              <View style={styles.statusTopRow}>
                <View>
                  <Text style={styles.statusTitle}>Pickup estimate</Text>
                  <Text style={styles.statusTime}>20-30 min</Text>
                </View>
                <View style={styles.statusChip}>
                  <Text style={styles.statusChipText}>{items.length} dishes</Text>
                </View>
              </View>
              <Text style={styles.statusCopy}>
                We will prepare your bistro order after checkout confirmation.
              </Text>
              <View style={styles.statusMetrics}>
                <View style={styles.statusMetric}>
                  <Text style={styles.statusMetricValue}>{count}</Text>
                  <Text style={styles.statusMetricLabel}>Items</Text>
                </View>
                <View style={styles.statusMetric}>
                  <Text style={styles.statusMetricValue}>{currency.format(subtotal)}</Text>
                  <Text style={styles.statusMetricLabel}>Subtotal</Text>
                </View>
                <View style={styles.statusMetric}>
                  <Text style={styles.statusMetricValue}>{currency.format(total)}</Text>
                  <Text style={styles.statusMetricLabel}>Est. total</Text>
                </View>
              </View>
            </View>

            <Pressable onPress={() => router.push("/assistant")} style={styles.assistantCard}>
              <View style={styles.assistantBadge}>
                <Text style={styles.assistantBadgeText}>AI</Text>
              </View>
              <View style={styles.assistantCopy}>
                <Text style={styles.assistantTitle}>Edit with Bistro AI</Text>
                <Text style={styles.assistantText}>
                  Say things like remove one edamame or clear the cart after adding a fresh roll.
                </Text>
              </View>
              <Text style={styles.assistantAction}>Open</Text>
            </Pressable>

            <View style={styles.itemList}>
              {items.map((item) => (
                <CartItemRow
                  key={item.cartId}
                  item={item}
                  onDecrease={updateQuantity}
                  onEdit={openEditor}
                  onIncrease={updateQuantity}
                  onRemove={removeItem}
                />
              ))}
            </View>

            <OrderSummary subtotal={subtotal} tax={tax} total={total} disabled={count === 0} />
          </>
        )}
      </ScrollView>

      <ItemDetailModal
        item={editingMenuItem}
        quantity={editQuantity}
        spiceLevel={editSpice}
        selectedAddOns={editAddOns}
        total={editTotal}
        submitLabel={`Save changes - ${currency.format(editTotal)}`}
        onClose={closeEditor}
        onAddToCart={saveEditedItem}
        onChangeQuantity={setEditQuantity}
        onChangeSpiceLevel={setEditSpice}
        onToggleAddOn={toggleEditAddOn}
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
    paddingBottom: 36,
    paddingTop: 8,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  headerText: {
    alignItems: "center",
    flex: 1,
  },
  eyebrow: {
    color: "#7A6E5F",
    fontSize: 13,
    fontWeight: "800",
  },
  title: {
    color: "#17251F",
    fontSize: 30,
    fontWeight: "900",
    marginTop: 2,
  },
  backButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E8DFD0",
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
  },
  backText: {
    color: "#17251F",
    fontSize: 13,
    fontWeight: "900",
  },
  clearButton: {
    alignItems: "center",
    backgroundColor: "#F4EFDF",
    borderRadius: 18,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
  },
  clearButtonDisabled: {
    opacity: 0.45,
  },
  clearText: {
    color: "#F06449",
    fontSize: 13,
    fontWeight: "900",
  },
  statusCard: {
    backgroundColor: "#203B2D",
    borderRadius: 24,
    marginTop: 22,
    padding: 18,
  },
  statusTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statusTitle: {
    color: "#D8E3D5",
    fontSize: 13,
    fontWeight: "800",
  },
  statusTime: {
    color: "#C9F05C",
    fontSize: 28,
    fontWeight: "900",
    marginTop: 4,
  },
  statusCopy: {
    color: "#FFF8EA",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 6,
  },
  statusChip: {
    alignItems: "center",
    backgroundColor: "rgba(255, 248, 234, 0.14)",
    borderRadius: 16,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 12,
  },
  statusChipText: {
    color: "#FFF8EA",
    fontSize: 12,
    fontWeight: "900",
  },
  statusMetrics: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  statusMetric: {
    backgroundColor: "rgba(255, 248, 234, 0.08)",
    borderRadius: 18,
    flex: 1,
    minHeight: 72,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  statusMetricValue: {
    color: "#FFF8EA",
    fontSize: 18,
    fontWeight: "900",
  },
  statusMetricLabel: {
    color: "#D8E3D5",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },
  assistantCard: {
    alignItems: "center",
    backgroundColor: "#FFF8EA",
    borderColor: "#E7DCCA",
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    marginTop: 16,
    padding: 16,
  },
  assistantBadge: {
    alignItems: "center",
    backgroundColor: "#17251F",
    borderRadius: 18,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  assistantBadgeText: {
    color: "#FFF8EA",
    fontSize: 12,
    fontWeight: "900",
  },
  assistantCopy: {
    flex: 1,
  },
  assistantTitle: {
    color: "#17251F",
    fontSize: 15,
    fontWeight: "900",
  },
  assistantText: {
    color: "#6E6255",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 3,
  },
  assistantAction: {
    color: "#3F5C4A",
    fontSize: 12,
    fontWeight: "900",
  },
  itemList: {
    gap: 12,
    marginTop: 18,
  },
});
