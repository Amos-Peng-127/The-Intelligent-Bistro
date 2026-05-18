import { StyleSheet, Text, View } from "react-native";

type AssistantBubbleProps = {
  role: "assistant" | "user";
  text: string;
};

export function AssistantBubble({ role, text }: AssistantBubbleProps) {
  const isUser = role === "user";

  return (
    <View style={[styles.row, isUser ? styles.userRow : styles.assistantRow]}>
      <View style={styles.bubbleWrap}>
        <Text style={styles.label}>{isUser ? "You" : "Bistro AI"}</Text>
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          <Text style={[styles.text, isUser ? styles.userText : styles.assistantText]}>{text}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    marginTop: 14,
  },
  userRow: {
    justifyContent: "flex-end",
  },
  assistantRow: {
    justifyContent: "flex-start",
  },
  bubbleWrap: {
    maxWidth: "88%",
  },
  label: {
    color: "#7A6E5F",
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  bubble: {
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  userBubble: {
    backgroundColor: "#17251F",
  },
  assistantBubble: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E7DCCA",
    borderWidth: 1,
  },
  text: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  userText: {
    color: "#FFF8EA",
  },
  assistantText: {
    color: "#17251F",
  },
});
