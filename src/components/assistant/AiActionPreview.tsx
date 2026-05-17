import { Pressable, StyleSheet, Text, View } from "react-native";

import { menuItems } from "@/data/menu";
import { currency } from "@/lib/format";
import { describeAiAction } from "@/lib/ai/apply-actions";
import type { BistroAiResponse } from "@/lib/ai/types";

type AiActionPreviewProps = {
  response: BistroAiResponse;
  onConfirm: () => void;
  disabled?: boolean;
};

const menuById = new Map(menuItems.map((item) => [item.id, item]));

export function AiActionPreview({ response, onConfirm, disabled }: AiActionPreviewProps) {
  const suggestions = response.suggestedItemIds
    .map((itemId) => menuById.get(itemId))
    .filter((item): item is (typeof menuItems)[number] => Boolean(item));

  if (
    response.actions.length === 0 &&
    suggestions.length === 0 &&
    response.unavailableRequests.length === 0
  ) {
    return null;
  }

  return (
    <View style={styles.card}>
      {response.actions.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Ready to apply</Text>
          <View style={styles.list}>
            {response.actions.map((action, index) => (
              <Text key={`${action.type}-${index}`} style={styles.itemText}>
                {describeAiAction(action)}
              </Text>
            ))}
          </View>
        </>
      ) : null}

      {suggestions.length > 0 ? (
        <>
          <Text style={[styles.sectionTitle, response.actions.length > 0 && styles.spacedTitle]}>
            Suggested dishes
          </Text>
          <View style={styles.list}>
            {suggestions.map((item) => (
              <View key={item.id} style={styles.suggestionRow}>
                <Text style={styles.itemText}>{item.name}</Text>
                <Text style={styles.priceText}>{currency.format(item.price)}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {response.unavailableRequests.length > 0 ? (
        <>
          <Text style={[styles.sectionTitle, styles.spacedTitle]}>Could not match</Text>
          <View style={styles.list}>
            {response.unavailableRequests.map((request) => (
              <Text key={request} style={styles.unavailableText}>
                {request}
              </Text>
            ))}
          </View>
        </>
      ) : null}

      {response.actions.length > 0 ? (
        <Pressable
          disabled={disabled}
          onPress={onConfirm}
          style={[styles.button, disabled && styles.disabled]}
        >
          <Text style={styles.buttonText}>Confirm Order Changes</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5DCCB",
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 16,
    padding: 18,
  },
  sectionTitle: {
    color: "#17251F",
    fontSize: 16,
    fontWeight: "900",
  },
  spacedTitle: {
    marginTop: 16,
  },
  list: {
    gap: 9,
    marginTop: 12,
  },
  itemText: {
    color: "#3F5C4A",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  suggestionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  priceText: {
    color: "#17251F",
    fontSize: 13,
    fontWeight: "900",
  },
  unavailableText: {
    color: "#C45B42",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  button: {
    alignItems: "center",
    backgroundColor: "#17251F",
    borderRadius: 18,
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  disabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#FFF8EA",
    fontSize: 14,
    fontWeight: "900",
  },
});
