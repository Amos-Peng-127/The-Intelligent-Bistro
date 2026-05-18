import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

export type AssistantPromptCard = {
  label: string;
  prompt: string;
  detail: string;
};

type PromptChipsProps = {
  prompts: AssistantPromptCard[];
  onSelect: (prompt: AssistantPromptCard) => void;
};

export function PromptChips({ prompts, onSelect }: PromptChipsProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < 720;
  const columns = width >= 1160 ? 4 : width >= 720 ? 2 : 1;
  const cardWidth = columns === 4 ? "23.8%" : columns === 2 ? "48.8%" : "100%";

  if (isCompact) {
    return (
      <View style={styles.section}>
        <Text style={styles.title}>Try one</Text>
        <ScrollView
          horizontal
          contentContainerStyle={styles.rail}
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
        >
          {prompts.map((prompt) => (
            <Pressable
              key={prompt.prompt}
              onPress={() => onSelect(prompt)}
              style={[styles.card, styles.mobileCard]}
            >
              <Text style={styles.cardTitle}>{prompt.label}</Text>
              <Text style={styles.cardDetail}>{prompt.detail}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Try one</Text>
      <View style={styles.grid}>
        {prompts.map((prompt) => (
          <Pressable
            key={prompt.prompt}
            onPress={() => onSelect(prompt)}
            style={[
              styles.card,
              columns === 4 ? styles.cardCompact : null,
              { flexBasis: cardWidth },
            ]}
          >
            <Text style={styles.cardTitle}>{prompt.label}</Text>
            <Text style={styles.cardDetail}>{prompt.detail}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 18,
  },
  title: {
    color: "#5E5447",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 10,
    textTransform: "uppercase",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  rail: {
    gap: 10,
    paddingRight: 4,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5DCCB",
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 82,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  mobileCard: {
    minHeight: 74,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: 236,
  },
  cardCompact: {
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  cardTitle: {
    color: "#17251F",
    fontSize: 13,
    fontWeight: "900",
  },
  cardDetail: {
    color: "#6E6255",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
    marginTop: 4,
  },
});
