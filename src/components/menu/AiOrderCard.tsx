import { Pressable, StyleSheet, Text, View } from "react-native";

type AiOrderCardProps = {
  onPress: () => void;
};

export function AiOrderCard({ onPress }: AiOrderCardProps) {
  return (
    <Pressable onPress={onPress} style={styles.aiCard}>
      <View style={styles.aiMark}>
        <Text style={styles.aiMarkText}>AI</Text>
      </View>
      <View style={styles.aiCopy}>
        <Text style={styles.aiTitle}>Order with Bistro AI</Text>
        <Text style={styles.aiSubtitle}>
          Describe what you want in plain language and review changes before anything is applied.
        </Text>
      </View>
      <View style={styles.aiAction}>
        <Text style={styles.aiActionText}>Try it</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  aiCard: {
    alignItems: "center",
    backgroundColor: "#203B2D",
    borderRadius: 24,
    flexDirection: "row",
    gap: 14,
    marginTop: 14,
    padding: 16,
  },
  aiMark: {
    alignItems: "center",
    backgroundColor: "#C9F05C",
    borderRadius: 18,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  aiMarkText: {
    color: "#17251F",
    fontSize: 13,
    fontWeight: "900",
  },
  aiCopy: {
    flex: 1,
  },
  aiTitle: {
    color: "#FFF8EA",
    fontSize: 16,
    fontWeight: "900",
  },
  aiSubtitle: {
    color: "#D8E3D5",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    marginTop: 2,
  },
  aiAction: {
    alignItems: "center",
    backgroundColor: "rgba(255, 248, 234, 0.12)",
    borderRadius: 16,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 12,
  },
  aiActionText: {
    color: "#FFF8EA",
    fontSize: 12,
    fontWeight: "900",
  },
});
