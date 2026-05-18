import { Pressable, StyleSheet, Text, View } from "react-native";

import { menuItems } from "@/data/menu";
import { currency } from "@/lib/format";
import { describeAiAction } from "@/lib/ai/apply-actions";
import type { BistroAiResponse } from "@/lib/ai/types";

type AiActionPreviewProps = {
  response: BistroAiResponse;
  onConfirm: () => void;
  onSelectOption?: (option: { label: string; prompt: string }) => void;
  disabled?: boolean;
  variant?: "card" | "plain";
};

const menuById = new Map(menuItems.map((item) => [item.id, item]));
const hasChineseText = (value: string) => /[\u4e00-\u9fff]/.test(value);
const slotLabelMap = {
  item: {
    en: "dish",
    zh: "\u83dc\u54c1",
  },
  quantity: {
    en: "quantity",
    zh: "\u6570\u91cf",
  },
} as const;

export function AiActionPreview({
  response,
  onConfirm,
  onSelectOption,
  disabled,
  variant = "card",
}: AiActionPreviewProps) {
  const suggestions = response.suggestedItemIds
    .map((itemId) => menuById.get(itemId))
    .filter((item): item is (typeof menuItems)[number] => Boolean(item));
  const preferChinese = hasChineseText(response.reply);
  const needsClarification =
    response.command?.state === "needs_clarification" ||
    (response.missingSlots?.length ?? 0) > 0 ||
    (response.clarificationOptions?.length ?? 0) > 0;
  const canConfirm = !needsClarification && (response.command?.executable ?? response.actions.length > 0);
  const missingSlotText =
    response.missingSlots && response.missingSlots.length > 0
      ? response.missingSlots
          .map((slot) => (preferChinese ? slotLabelMap[slot].zh : slotLabelMap[slot].en))
          .join(preferChinese ? "\u3001" : ", ")
      : null;

  if (
    !canConfirm &&
    response.actions.length === 0 &&
    !needsClarification &&
    suggestions.length === 0 &&
    response.unavailableRequests.length === 0
  ) {
    return null;
  }

  return (
    <View style={[styles.card, variant === "plain" && styles.plainCard]}>
      {response.actions.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>
            {needsClarification
              ? preferChinese
                ? "\u5df2\u8bc6\u522b\u5230"
                : "Matched so far"
              : preferChinese
                ? "\u5f85\u786e\u8ba4\u7684\u53d8\u66f4"
                : "Ready to apply"}
          </Text>
          <View style={styles.list}>
            {response.actions.map((action, index) => (
              <Text key={`${action.type}-${index}`} style={styles.itemText}>
                {describeAiAction(action)}
              </Text>
            ))}
          </View>
        </>
      ) : null}

      {needsClarification ? (
        <>
          <Text style={[styles.sectionTitle, response.actions.length > 0 && styles.spacedTitle]}>
            {preferChinese ? "\u8fd8\u9700\u8981\u4e00\u70b9\u4fe1\u606f" : "Need one more detail"}
          </Text>
          {missingSlotText ? (
            <Text style={styles.helperText}>
              {preferChinese ? `\u8fd8\u7f3a\uff1a${missingSlotText}` : `Still need: ${missingSlotText}`}
            </Text>
          ) : null}
          {response.clarificationOptions && response.clarificationOptions.length > 0 ? (
            <View style={styles.optionWrap}>
              {response.clarificationOptions.map((option) => (
                <Pressable
                  key={`${option.label}-${option.prompt}`}
                  disabled={disabled || !onSelectOption}
                  onPress={() => onSelectOption?.(option)}
                  style={[styles.optionChip, (disabled || !onSelectOption) && styles.disabledChip]}
                >
                  <Text style={styles.optionText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      {suggestions.length > 0 ? (
        <>
          <Text style={[styles.sectionTitle, response.actions.length > 0 && styles.spacedTitle]}>
            {preferChinese ? "\u63a8\u8350\u83dc\u54c1" : "Suggested dishes"}
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
          <Text style={[styles.sectionTitle, styles.spacedTitle]}>
            {preferChinese ? "\u6682\u65f6\u6ca1\u5339\u914d\u4e0a" : "Could not match"}
          </Text>
          <View style={styles.list}>
            {response.unavailableRequests.map((request) => (
              <Text key={request} style={styles.unavailableText}>
                {request}
              </Text>
            ))}
          </View>
        </>
      ) : null}

      {canConfirm && response.actions.length > 0 ? (
        <Pressable
          disabled={disabled}
          onPress={onConfirm}
          style={[styles.button, disabled && styles.disabled]}
        >
          <Text style={styles.buttonText}>
            {preferChinese ? "\u786e\u8ba4\u8fd9\u4e9b\u53d8\u66f4" : "Confirm Order Changes"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5DCCB",
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  plainCard: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: 0,
    padding: 0,
  },
  sectionTitle: {
    color: "#17251F",
    fontSize: 15,
    fontWeight: "900",
  },
  spacedTitle: {
    marginTop: 14,
  },
  list: {
    gap: 8,
    marginTop: 10,
  },
  helperText: {
    color: "#6A5A49",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 10,
  },
  itemText: {
    color: "#3F5C4A",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  optionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  optionChip: {
    backgroundColor: "#F7F3EA",
    borderColor: "#D9CCB8",
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  disabledChip: {
    opacity: 0.55,
  },
  optionText: {
    color: "#17251F",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
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
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
