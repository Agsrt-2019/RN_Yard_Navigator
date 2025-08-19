import { router } from "expo-router";
import React from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { YARD_LIST } from "../src/Yards.config";

export default function YardSelectScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select a Yard</Text>
      <FlatList
        data={YARD_LIST}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ paddingVertical: 8 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => {
              router.push({
                pathname: "/(tabs)/Explore",
                params: { yard: item.key },
              });
            }}
          >
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.cardSub}>Tap to open</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: 16, backgroundColor: "#fff" },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 16 },
  card: {
    backgroundColor: "#f5f7ff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#dde3ff",
  },
  cardTitle: { fontSize: 18, fontWeight: "600", color: "#1f2a62" },
  cardSub: { marginTop: 4, color: "#5f6aa5" },
});
