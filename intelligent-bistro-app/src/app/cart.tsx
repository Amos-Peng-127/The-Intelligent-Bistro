import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CartItemRow } from "@/components/cart/CartItemRow";
import { EmptyCart } from "@/components/cart/EmptyCart";
import { OrderSummary } from "@/components/cart/OrderSummary";
import { getCartTotals, useCartStore } from "@/store/cart-store";

const TAX_RATE = 0.08875;

export default function CartScreen() {
  const items = useCartStore((state) => state.items);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const { count, subtotal } = getCartTotals(items);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;

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
              <Text style={styles.statusTitle}>Pickup estimate</Text>
              <Text style={styles.statusTime}>20-30 min</Text>
              <Text style={styles.statusCopy}>
                We will prepare your bistro order after checkout confirmation.
              </Text>
            </View>

            <View style={styles.itemList}>
              {items.map((item) => (
                <CartItemRow
                  key={item.cartId}
                  item={item}
                  onDecrease={updateQuantity}
                  onIncrease={updateQuantity}
                  onRemove={removeItem}
                />
              ))}
            </View>

            <OrderSummary subtotal={subtotal} tax={tax} total={total} disabled={count === 0} />
          </>
        )}
      </ScrollView>
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
  itemList: {
    gap: 12,
    marginTop: 18,
  },
});
