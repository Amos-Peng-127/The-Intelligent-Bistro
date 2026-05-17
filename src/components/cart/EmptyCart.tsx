import { Pressable, StyleSheet, Text, View } from "react-native";

type EmptyCartProps = {
  onBrowseMenu: () => void;
};

export function EmptyCart({ onBrowseMenu }: EmptyCartProps) {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.mark}>
        <Text style={styles.markText}>0</Text>
      </View>
      <Text style={styles.title}>Your cart is empty</Text>
      <Text style={styles.copy}>Add a roll, ramen, or appetizer to start a bistro order.</Text>
      <Pressable onPress={onBrowseMenu} style={styles.button}>
        <Text style={styles.buttonText}>Browse menu</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#ECE2D3",
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 28,
    padding: 24,
  },
  mark: {
    alignItems: "center",
    backgroundColor: "#F4EFDF",
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  markText: {
    color: "#3F5C4A",
    fontSize: 20,
    fontWeight: "900",
  },
  title: {
    color: "#17251F",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 16,
  },
  copy: {
    color: "#75695A",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#17251F",
    borderRadius: 18,
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonText: {
    color: "#FFF8EA",
    fontSize: 14,
    fontWeight: "900",
  },
});
