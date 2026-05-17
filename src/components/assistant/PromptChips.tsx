import { Pressable, StyleSheet, Text, View } from "react-native";

type PromptChipsProps = {
  prompts: string[];
  onSelect: (prompt: string) => void;
};

export function PromptChips({ prompts, onSelect }: PromptChipsProps) {
  return (
    <View style={styles.row}>
      {prompts.map((prompt) => (
        <Pressable key={prompt} onPress={() => onSelect(prompt)} style={styles.chip}>
          <Text style={styles.chipText}>{prompt}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingVertical: 4,
  },
  chip: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderColor: "#E5DCCB",
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: "100%",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipText: {
    color: "#3F5C4A",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
  },
});
