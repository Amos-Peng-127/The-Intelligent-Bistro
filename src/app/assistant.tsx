import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  useWindowDimensions,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AiActionPreview } from "@/components/assistant/AiActionPreview";
import { AssistantBubble } from "@/components/assistant/AssistantBubble";
import { PromptChips, type AssistantPromptCard } from "@/components/assistant/PromptChips";
import { applyAiActions } from "@/lib/ai/apply-actions";
import { submitOrderPrompt, warmBistroAi } from "@/lib/ai";
import type {
  BistroAiAction,
  BistroAiClarificationOption,
  BistroAiCommand,
  BistroAiMissingSlot,
  BistroAiResponse,
  BistroAiSelectionPlan,
} from "@/lib/ai/types";
import { getCartTotals, useCartStore } from "@/store/cart-store";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  conversationText?: string;
  actions?: BistroAiAction[];
  referencedItemIds?: string[];
  suggestedItemIds?: string[];
  selectionPlan?: BistroAiSelectionPlan | null;
  command?: BistroAiCommand | null;
  missingSlots?: BistroAiMissingSlot[];
  clarificationOptions?: BistroAiClarificationOption[];
};

const buildStarterPrompts = (cartItemName?: string): AssistantPromptCard[] => [
  {
    label: "Build a ramen order",
    detail: "Add multiple items in one sentence.",
    prompt: "Add two tonkotsu ramen and one spicy edamame.",
  },
  {
    label: "Recommend fresh dishes",
    detail: "Get a lighter mix from the menu.",
    prompt: "Recommend something light and fresh.",
  },
  cartItemName
    ? {
        label: `Remove ${cartItemName}`,
        detail: "Take one dish back out before checkout.",
        prompt: `Remove ${cartItemName} from my cart.`,
      }
    : {
        label: "Start a first cart",
        detail: "Begin with one easy starter.",
        prompt: "Add one easy starter to my cart.",
      },
  {
    label: "Pair two categories",
    detail: "Ask for one entree and one starter together.",
    prompt: "I want one premium roll and a vegetarian appetizer.",
  },
];

const shouldShowResponsePreview = (response: BistroAiResponse) =>
  response.actions.length > 0 ||
  response.suggestedItemIds.length > 0 ||
  response.unavailableRequests.length > 0 ||
  (response.missingSlots?.length ?? 0) > 0 ||
  (response.clarificationOptions?.length ?? 0) > 0 ||
  response.command?.state === "needs_clarification";

const confirmationPrompts = new Set([
  "confirm",
  "confirmed",
  "ok",
  "okay",
  "sure",
  "yes",
  "yep",
  "yeah",
  "soundsgood",
  "thatsright",
  "\u5bf9",
  "\u5bf9\u7684",
  "\u662f",
  "\u662f\u7684",
  "\u597d",
  "\u597d\u7684",
  "\u786e\u8ba4",
  "\u786e\u8ba4\u4e00\u4e0b",
  "\u6ca1\u9519",
]);

const normalizeQuickReply = (value: string) =>
  value
    .toLowerCase()
    .replace(/[\s.!?,;:'"~`\-]/g, "")
    .replace(/[\uFF01\uFF1F\u3002\uFF0C\u201C\u201D\u2018\u2019\uFF08\uFF09()]/g, "");

const isConfirmationPrompt = (value: string) => confirmationPrompts.has(normalizeQuickReply(value));

export default function AssistantScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isCompactLayout = width < 720;
  const cartItems = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const { count } = getCartTotals(cartItems);
  const [draft, setDraft] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [pendingResponse, setPendingResponse] = useState<BistroAiResponse | null>(null);
  const [isPreviewModalVisible, setIsPreviewModalVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "intro",
      role: "assistant",
      text: "Tell me what you are in the mood for. I can suggest dishes and stage cart changes before anything is applied.",
    },
  ]);
  const starterPrompts = useMemo(() => buildStarterPrompts(cartItems[0]?.name), [cartItems]);
  const showStarterPrompts = !isCompactLayout || !isKeyboardVisible;

  const scrollToBottom = (animated = true) => {
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd({ animated });
    });
  };

  const openPreviewModal = () => {
    Keyboard.dismiss();
    setIsPreviewModalVisible(true);
  };

  const closePreviewModal = () => {
    setIsPreviewModalVisible(false);
  };

  const pushMessage = (message: Omit<ChatMessage, "id">) => {
    setMessages((current) => [
      ...current,
      {
        ...message,
        id: `${Date.now()}-${current.length}`,
      },
    ]);
  };

  useEffect(() => {
    const timer = setTimeout(() => scrollToBottom(), 0);

    return () => clearTimeout(timer);
  }, [messages, isSubmitting]);

  useEffect(() => {
    void warmBistroAi().catch(() => undefined);
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, () => {
      setIsKeyboardVisible(true);
      scrollToBottom(false);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const applyPendingResponse = (response: BistroAiResponse) => {
    if (isApplying || response.command?.executable === false) {
      return false;
    }

    setIsApplying(true);
    closePreviewModal();
    const applied = applyAiActions({
      actions: response.actions,
      cartItems,
      addItem,
      updateQuantity,
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
    return true;
  };

  const submitPrompt = async (
    promptText: string,
    options?: {
      displayText?: string;
    },
  ) => {
    const prompt = promptText.trim();
    const displayText = (options?.displayText ?? prompt).trim();
    if (!prompt || isSubmitting || isApplying) {
      return;
    }

    if (
      pendingResponse &&
      pendingResponse.actions.length > 0 &&
      pendingResponse.command?.state === "ready" &&
      isConfirmationPrompt(prompt)
    ) {
      setDraft("");
      pushMessage({
        role: "user",
        text: displayText,
        conversationText: prompt,
      });
      applyPendingResponse(pendingResponse);
      return;
    }

    setDraft("");
    setPendingResponse(null);
    closePreviewModal();
    pushMessage({
      role: "user",
      text: displayText,
      conversationText: prompt,
    });
    setIsSubmitting(true);

    try {
      const response = await submitOrderPrompt({
        prompt,
        cartItems,
        conversation: messages
          .filter((message) => message.id !== "intro")
          .slice(-6)
          .map(
            ({
              role,
              text,
              conversationText,
              actions,
              referencedItemIds,
              suggestedItemIds,
              selectionPlan,
              command,
              missingSlots,
              clarificationOptions,
            }) => ({
              role,
              text: conversationText ?? text,
              actions,
              referencedItemIds,
              suggestedItemIds,
              selectionPlan,
              command,
              missingSlots,
              clarificationOptions,
            }),
          ),
      });
      const nextPendingResponse = shouldShowResponsePreview(response) ? response : null;
      pushMessage({
        role: "assistant",
        text: response.reply,
        actions: response.actions,
        referencedItemIds: response.referencedItemIds,
        suggestedItemIds: response.suggestedItemIds,
        selectionPlan: response.selectionPlan,
        command: response.command,
        missingSlots: response.missingSlots,
        clarificationOptions: response.clarificationOptions,
      });
      setPendingResponse(nextPendingResponse);
      if (nextPendingResponse) {
        openPreviewModal();
      } else {
        closePreviewModal();
      }
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

  const handleDraftKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const keyEvent = event.nativeEvent as TextInputKeyPressEventData & {
      shiftKey?: boolean;
      preventDefault?: () => void;
    };

    if (keyEvent.key !== "Enter" || keyEvent.shiftKey) {
      return;
    }

    keyEvent.preventDefault?.();
    void submitPrompt(draft);
  };

  const handleConfirm = () => {
    if (!pendingResponse) {
      return;
    }

    applyPendingResponse(pendingResponse);
  };

  const previewSummaryText = pendingResponse
    ? pendingResponse.command?.state === "needs_clarification" ||
      (pendingResponse.missingSlots?.length ?? 0) > 0 ||
      (pendingResponse.clarificationOptions?.length ?? 0) > 0
      ? "Review the follow-up details"
      : pendingResponse.actions.length > 0
        ? "Review pending cart changes"
        : pendingResponse.suggestedItemIds.length > 0
          ? "Review suggested dishes"
          : "Review assistant details"
    : "";
  const modalMaxHeight = Math.min(
    height - insets.top - Math.max(insets.bottom, 18) - 48,
    680,
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 8 : 0}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.topButton}>
            <Text style={styles.topButtonText}>Back</Text>
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>Bistro assistant</Text>
            <Text style={styles.title}>Assistant</Text>
          </View>
          <Pressable onPress={() => router.push("/cart")} style={styles.topButton}>
            <Text style={styles.topButtonText}>Cart {count}</Text>
          </Pressable>
        </View>

        {showStarterPrompts ? (
          <PromptChips
            prompts={starterPrompts}
            onSelect={(prompt) => void submitPrompt(prompt.prompt, { displayText: prompt.label })}
          />
        ) : null}

        <View style={styles.chatShell}>
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.messages}
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.messagesScroll}
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
          </ScrollView>
        </View>

        {pendingResponse && !isPreviewModalVisible ? (
          <Pressable onPress={openPreviewModal} style={styles.previewTrigger}>
            <Text style={styles.previewTriggerEyebrow}>Pending</Text>
            <Text style={styles.previewTriggerText}>{previewSummaryText}</Text>
          </Pressable>
        ) : null}

        <View style={styles.inputBar}>
          <TextInput
            multiline
            onChangeText={setDraft}
            onFocus={() => scrollToBottom(false)}
            onKeyPress={handleDraftKeyPress}
            placeholder='Try: "add two tonkotsu ramen and one spicy edamame"'
            placeholderTextColor="#8A7F71"
            style={styles.input}
            value={draft}
          />
          <Pressable
            disabled={isSubmitting || draft.trim().length === 0}
            onPress={() => void submitPrompt(draft)}
            style={[
              styles.sendButton,
              (isSubmitting || draft.trim().length === 0) && styles.sendButtonDisabled,
            ]}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </Pressable>
        </View>

        <Modal
          animationType="fade"
          onRequestClose={closePreviewModal}
          transparent
          visible={Boolean(pendingResponse) && isPreviewModalVisible}
        >
          <View
            style={[
              styles.modalRoot,
              {
                paddingBottom: Math.max(insets.bottom, 18),
                paddingTop: insets.top + 24,
              },
            ]}
          >
            <Pressable onPress={closePreviewModal} style={styles.modalBackdrop} />
            <View style={styles.modalFrame} pointerEvents="box-none">
              <View
                style={[
                  styles.modalShell,
                  {
                    maxHeight: modalMaxHeight,
                  },
                ]}
              >
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Review</Text>
                  <Pressable onPress={closePreviewModal} style={styles.modalCloseButton}>
                    <Text style={styles.modalCloseText}>Close</Text>
                  </Pressable>
                </View>
                <ScrollView
                  bounces={false}
                  contentContainerStyle={styles.modalContent}
                  key={
                    pendingResponse
                      ? `${pendingResponse.reply}-${pendingResponse.actions.length}-${pendingResponse.suggestedItemIds.length}`
                      : "empty"
                  }
                  showsVerticalScrollIndicator={false}
                  style={styles.modalScroll}
                >
                  {pendingResponse ? (
                    <AiActionPreview
                      disabled={isApplying}
                      onConfirm={handleConfirm}
                      onSelectOption={({ label, prompt }) =>
                        void submitPrompt(prompt, { displayText: label })
                      }
                      response={pendingResponse}
                      variant="plain"
                    />
                  ) : null}
                </ScrollView>
              </View>
            </View>
          </View>
        </Modal>
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
  chatShell: {
    flex: 1,
    marginTop: 12,
    minHeight: 0,
    position: "relative",
  },
  messagesScroll: {
    flex: 1,
    minHeight: 0,
  },
  messages: {
    flexGrow: 1,
    paddingBottom: 20,
    paddingTop: 4,
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
  previewTrigger: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5DCCB",
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  previewTriggerEyebrow: {
    color: "#7A6E5F",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  previewTriggerText: {
    color: "#17251F",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
  },
  inputBar: {
    alignItems: "flex-end",
    backgroundColor: "#FFFFFF",
    borderColor: "#E5DCCB",
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
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
  modalRoot: {
    backgroundColor: "rgba(23, 37, 31, 0.3)",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalFrame: {
    alignItems: "center",
    justifyContent: "center",
  },
  modalShell: {
    backgroundColor: "#FFF8EA",
    borderColor: "#E5DCCB",
    borderRadius: 28,
    borderWidth: 1,
    maxWidth: 520,
    padding: 16,
    width: "100%",
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: {
    color: "#17251F",
    fontSize: 18,
    fontWeight: "900",
  },
  modalCloseButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E5DCCB",
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 14,
  },
  modalCloseText: {
    color: "#17251F",
    fontSize: 12,
    fontWeight: "900",
  },
  modalContent: {
    paddingBottom: 4,
  },
  modalScroll: {
    minHeight: 0,
    width: "100%",
  },
});
