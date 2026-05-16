import { StyleSheet, Text, View } from "react-native";

type SectionHeaderProps = {
  title: string;
  itemCount: number;
};

export function SectionHeader({ title, itemCount }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionMeta}>
        {itemCount} {itemCount === 1 ? "item" : "items"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    color: "#17251F",
    fontSize: 22,
    fontWeight: "900",
  },
  sectionMeta: {
    color: "#8E8372",
    fontSize: 13,
    fontWeight: "800",
  },
});
