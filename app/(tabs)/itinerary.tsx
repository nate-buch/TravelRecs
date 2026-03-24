import { StyleSheet, Text, View } from "react-native";

export default function ItineraryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Itinerary</Text>
      <Text style={styles.subtitle}>Your AI-curated day will appear here</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 28, fontWeight: "bold", marginBottom: 8 },
  subtitle: { fontSize: 16, color: "#666" },
});