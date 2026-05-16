import { StyleSheet, Text, TextInput, View } from "react-native";

type MenuSearchProps = {
  query: string;
  onChangeQuery: (query: string) => void;
};

export function MenuSearch({ query, onChangeQuery }: MenuSearchProps) {
  return (
    <View style={styles.searchBox}>
      <Text style={styles.searchIcon}>Search</Text>
      <TextInput
        value={query}
        onChangeText={onChangeQuery}
        placeholder="Search rolls, ramen, appetizers..."
        placeholderTextColor="#8E8372"
        style={styles.searchInput}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E8DFD0",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchIcon: {
    color: "#3F5C4A",
    fontSize: 12,
    fontWeight: "900",
  },
  searchInput: {
    color: "#17251F",
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    minHeight: 26,
  },
});
