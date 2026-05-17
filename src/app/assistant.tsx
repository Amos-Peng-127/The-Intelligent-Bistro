import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { AiActionPreview } from "@/components/assistant/AiActionPreview";
import { AssistantBubble } from "@/components/assistant/AssistantBubble";
import { PromptChips } from "@/components/assistant/PromptChips";
import { applyAiActions } from "@/lib/ai/apply-actions";
import { aiRuntimeConfig } from "@/lib/ai/config";
import { getAiRuntimeLabel, submitOrderPrompt } from "@/lib/ai";
import type { BistroAiAction, BistroAiResponse, BistroAiSelectionPlan } from "@/lib/ai/types";
import { getCartTotals, useCartStore } from "@/store/cart-store";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  actions?: BistroAiAction[];
  referencedItemIds?: string[];
  suggestedItemIds?: string[];
  selectionPlan?: BistroAiSelectionPlan | null;
};

const starterPrompts = [
  "Add two tonkotsu ramen and one spicy edamame.",
  "Recommend something light and fresh.",
  "Remove the edamame from my cart.",
  "I want one premium roll and a vegetarian appetizer.",
];

export default function AssistantScreen() {
  const cartItems = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const { count } = getCartTotals(cartItems);
  const [draft, setDraft] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [pendingResponse, setPendingResponse] = useState<BistroAiResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "intro",
      role: "assistant",
      text: `I am connected to ${getAiRuntimeLabel()}. Ask me to add, remove, or recommend dishes, and I will prepare the cart changes for your approval.`,
    },
  ]);

  const pushMessage = (message: Omit<ChatMessage, "id">) => {
    setMessages((current) => [
      ...current,
      {
        ...message,
        id: `${Date.now()}-${current.length}`,
      },
    ]);
  };

  const handleDraftKeyPress = (
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
  ) => {
    const keyEvent = event.nativeEvent as TextInputKeyPressEventData & {
      shiftKey?: boolean;
      preventDefault?: () => void;
    };

    if (keyEvent.key !== "Enter" || keyEvent.shiftKey) {
      return;
    }

    keyEvent.preventDefault?.();
    handleSubmit();
  };

  const handleSubmit = async (input?: string) => {
    const prompt = (input ?? draft).trim();
    if (!prompt || isSubmitting) {
      return;
    }

    setDraft("");
    setPendingResponse(null);
    pushMessage({ role: "user", text: prompt });
    setIsSubmitting(true);

    try {
      const response = await submitOrderPrompt({
        prompt,
        cartItems,
        conversation: messages
          .filter((message) => message.id !== "intro")
          .slice(-6)
          .map(({ role, text, actions, referencedItemIds, suggestedItemIds, selectionPlan }) => ({
            role,
            text,
            actions,
            referencedItemIds,
            suggestedItemIds,
            selectionPlan,
          })),
      });
      pushMessage({
        role: "assistant",
        text: response.reply,
        actions: response.actions,
        referencedItemIds: response.referencedItemIds,
        suggestedItemIds: response.suggestedItemIds,
        selectionPlan: response.selectionPlan,
      });
      setPendingResponse(
        response.actions.length > 0 ||
          response.suggestedItemIds.length > 0 ||
          response.unavailableRequests.length > 0
          ? response
          : null,
      );
    } catch (error) {
      pushMessage({
        role: "assistant",
        text:
          error instanceof Error
            ? error.message
            : "The local AI request failed. Check Ollama and try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirm = () => {
    if (!pendingResponse || isApplying) {
      return;
    }

    setIsApplying(true);
    const applied = applyAiActions({
      actions: pendingResponse.actions,
      cartItems,
      addItem,
      removeItem,
      clearCart,
    });

    pushMessage({
      role: "assistant",
      text:
        applied.length > 0
          ? `Done. ${applied.join(". ")}.`
          : "I could not apply those changes to the current cart.",
    });
    setPendingResponse(null);
    setIsApplying(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.topButton}>
            <Text style={styles.topButtonText}>Back</Text>
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>Ask Bistro AI</Text>
            <Text style={styles.title}>Assistant</Text>
          </View>
          <Pressable onPress={() => router.push("/cart")} style={styles.topButton}>
            <Text style={styles.topButtonText}>Cart {count}</Text>
          </Pressable>
        </View>

        <View style={styles.runtimeCard}>
          <Text style={styles.runtimeTitle}>{getAiRuntimeLabel()}</Text>
          <Text style={styles.runtimeSubtitle}>
            Endpoint {aiRuntimeConfig.ollamaBaseUrl} - confirm before changing the cart.
          </Text>
        </View>

        <PromptChips prompts={starterPrompts} onSelect={handleSubmit} />

        <ScrollView
          contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {messages.map((message) => (
            <AssistantBubble key={message.id} role={message.role} text={message.text} />
          ))}

          {isSubmitting ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#17251F" />
              <Text style={styles.loadingText}>Bistro AI is thinking...</Text>
            </View>
          ) : null}

          {pendingResponse ? (
            <AiActionPreview
              disabled={isApplying}
              onConfirm={handleConfirm}
              response={pendingResponse}
            />
          ) : null}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            multiline
            onChangeText={setDraft}
            onKeyPress={handleDraftKeyPress}
            placeholder="Try: add two tonkotsu ramen and one spicy edamame"
            placeholderTextColor="#8A7F71"
            style={styles.input}
            value={draft}
          />
          <Pressable
            disabled={isSubmitting || draft.trim().length === 0}
            onPress={() => handleSubmit()}
            style={[
              styles.sendButton,
              (isSubmitting || draft.trim().length === 0) && styles.sendButtonDisabled,
            ]}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F7F3EA",
  },
  keyboardView: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 14,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  topButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E5DCCB",
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 68,
    paddingHorizontal: 14,
  },
  topButtonText: {
    color: "#17251F",
    fontSize: 13,
    fontWeight: "900",
  },
  headerCopy: {
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
  runtimeCard: {
    backgroundColor: "#203B2D",
    borderRadius: 24,
    marginTop: 18,
    padding: 18,
  },
  runtimeTitle: {
    color: "#FFF8EA",
    fontSize: 16,
    fontWeight: "900",
  },
  runtimeSubtitle: {
    color: "#D8E3D5",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 6,
  },
  messages: {
    paddingBottom: 20,
    paddingTop: 12,
  },
  loadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  loadingText: {
    color: "#5E5447",
    fontSize: 13,
    fontWeight: "700",
  },
  inputBar: {
    alignItems: "flex-end",
    backgroundColor: "#FFFFFF",
    borderColor: "#E5DCCB",
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 78,
    padding: 10,
  },
  input: {
    color: "#17251F",
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    maxHeight: 116,
    paddingHorizontal: 8,
    paddingTop: 10,
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: "#F06449",
    borderRadius: 18,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 76,
    paddingHorizontal: 14,
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
});
