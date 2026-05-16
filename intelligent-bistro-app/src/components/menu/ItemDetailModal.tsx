import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { AddOn, MenuItem } from "@/data/menu";
import { currency } from "@/lib/format";

type ItemDetailModalProps = {
  item: MenuItem | null;
  quantity: number;
  spiceLevel?: string;
  selectedAddOns: AddOn[];
  total: number;
  onClose: () => void;
  onAddToCart: () => void;
  onChangeQuantity: (quantity: number) => void;
  onChangeSpiceLevel: (level: string) => void;
  onToggleAddOn: (addOn: AddOn) => void;
};

export function ItemDetailModal({
  item,
  quantity,
  spiceLevel,
  selectedAddOns,
  total,
  onClose,
  onAddToCart,
  onChangeQuantity,
  onChangeSpiceLevel,
  onToggleAddOn,
}: ItemDetailModalProps) {
  return (
    <Modal
      visible={item !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {item ? (
        <SafeAreaView style={styles.modalSafeArea}>
          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <Image source={item.image} resizeMode="cover" style={styles.detailImage} />
            <Pressable
              accessibilityLabel="Close item details"
              onPress={onClose}
              style={styles.closeButton}
            >
              <Text style={styles.closeText}>x</Text>
            </Pressable>

            <View style={styles.detailHeader}>
              <View style={styles.detailTitleWrap}>
                <Text style={styles.detailName}>{item.name}</Text>
                <Text style={styles.detailDescription}>{item.description}</Text>
              </View>
              <Text style={styles.detailPrice}>{currency.format(item.price)}</Text>
            </View>

            <View style={styles.detailTags}>
              {item.tags.map((tag) => (
                <View key={tag} style={styles.detailTag}>
                  <Text style={styles.detailTagText}>{tag}</Text>
                </View>
              ))}
            </View>

            {item.spiceLevels ? (
              <View style={styles.optionGroup}>
                <Text style={styles.optionTitle}>Spice level</Text>
                <View style={styles.optionRow}>
                  {item.spiceLevels.map((level) => {
                    const active = spiceLevel === level;
                    return (
                      <Pressable
                        key={level}
                        onPress={() => onChangeSpiceLevel(level)}
                        style={[styles.optionChip, active && styles.optionChipActive]}
                      >
                        <Text style={[styles.optionText, active && styles.optionTextActive]}>
                          {level}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {item.addOns ? (
              <View style={styles.optionGroup}>
                <Text style={styles.optionTitle}>Add-ons</Text>
                {item.addOns.map((addOn) => {
                  const active = selectedAddOns.some((selected) => selected.id === addOn.id);
                  return (
                    <Pressable
                      key={addOn.id}
                      onPress={() => onToggleAddOn(addOn)}
                      style={[styles.addOnRow, active && styles.addOnRowActive]}
                    >
                      <View>
                        <Text style={styles.addOnName}>{addOn.name}</Text>
                        <Text style={styles.addOnPrice}>+ {currency.format(addOn.price)}</Text>
                      </View>
                      <View style={[styles.addOnToggle, active && styles.addOnToggleActive]}>
                        <Text style={[styles.addOnToggleText, active && styles.addOnToggleTextActive]}>
                          {active ? "Yes" : "+"}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.quantityCard}>
              <Text style={styles.optionTitle}>Quantity</Text>
              <View style={styles.quantityStepper}>
                <Pressable
                  accessibilityLabel="Decrease quantity"
                  onPress={() => onChangeQuantity(Math.max(1, quantity - 1))}
                  style={styles.stepperButton}
                >
                  <Text style={styles.stepperText}>-</Text>
                </Pressable>
                <Text style={styles.quantityText}>{quantity}</Text>
                <Pressable
                  accessibilityLabel="Increase quantity"
                  onPress={() => onChangeQuantity(quantity + 1)}
                  style={styles.stepperButton}
                >
                  <Text style={styles.stepperText}>+</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <Pressable style={styles.addToCartButton} onPress={onAddToCart}>
              <Text style={styles.addToCartText}>Add to cart - {currency.format(total)}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalSafeArea: {
    flex: 1,
    backgroundColor: "#F7F3EA",
  },
  modalContent: {
    paddingBottom: 120,
  },
  detailImage: {
    height: 310,
    width: "100%",
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 248, 234, 0.95)",
    borderRadius: 18,
    height: 38,
    justifyContent: "center",
    position: "absolute",
    right: 16,
    top: 16,
    width: 38,
  },
  closeText: {
    color: "#17251F",
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 24,
  },
  detailHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  detailTitleWrap: {
    flex: 1,
  },
  detailName: {
    color: "#17251F",
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 33,
  },
  detailDescription: {
    color: "#6E6255",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
    marginTop: 8,
  },
  detailPrice: {
    color: "#3F5C4A",
    fontSize: 21,
    fontWeight: "900",
    marginTop: 5,
  },
  detailTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  detailTag: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8DFD0",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  detailTagText: {
    color: "#655A4E",
    fontSize: 12,
    fontWeight: "900",
  },
  optionGroup: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  optionTitle: {
    color: "#17251F",
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 12,
  },
  optionRow: {
    flexDirection: "row",
    gap: 10,
  },
  optionChip: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8DFD0",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  optionChipActive: {
    backgroundColor: "#203B2D",
    borderColor: "#203B2D",
  },
  optionText: {
    color: "#64594D",
    fontSize: 13,
    fontWeight: "900",
  },
  optionTextActive: {
    color: "#FFF8EA",
  },
  addOnRow: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E8DFD0",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  addOnRowActive: {
    borderColor: "#203B2D",
  },
  addOnName: {
    color: "#17251F",
    fontSize: 15,
    fontWeight: "900",
  },
  addOnPrice: {
    color: "#7A6E5F",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  addOnToggle: {
    alignItems: "center",
    borderColor: "#CFC2B0",
    borderRadius: 15,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    minWidth: 30,
    paddingHorizontal: 8,
  },
  addOnToggleActive: {
    backgroundColor: "#C9F05C",
    borderColor: "#C9F05C",
  },
  addOnToggleText: {
    color: "#6E6255",
    fontSize: 18,
    fontWeight: "900",
  },
  addOnToggleTextActive: {
    color: "#17251F",
    fontSize: 12,
  },
  quantityCard: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  quantityStepper: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderColor: "#E8DFD0",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    padding: 8,
  },
  stepperButton: {
    alignItems: "center",
    backgroundColor: "#F4EFDF",
    borderRadius: 14,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  stepperText: {
    color: "#17251F",
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 28,
  },
  quantityText: {
    color: "#17251F",
    fontSize: 18,
    fontWeight: "900",
    minWidth: 46,
    textAlign: "center",
  },
  modalFooter: {
    backgroundColor: "#F7F3EA",
    borderTopColor: "#E8DFD0",
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    padding: 18,
    position: "absolute",
    right: 0,
  },
  addToCartButton: {
    alignItems: "center",
    backgroundColor: "#F06449",
    borderRadius: 20,
    justifyContent: "center",
    minHeight: 58,
  },
  addToCartText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
});
