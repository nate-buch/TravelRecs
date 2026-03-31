import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAppStore } from "../config/store";

export default function ItineraryScreen() {
  const { venues, time, pace, budget } = useAppStore();

  if (venues.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No itinerary yet</Text>
        <Text style={styles.emptySubtitle}>Head to the map to generate your day</Text>
        <TouchableOpacity
          style={styles.mapButton}
          onPress={() => router.push("/(tabs)/map")}
        >
          <Text style={styles.mapButtonText}>Go to map</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>YOUR ITINERARY</Text>
      <View style={styles.headingDivider} />

      <View style={styles.prefsRow}>
        <View style={styles.prefItem}>
          <Text style={styles.prefsLabel}>TRIP LENGTH</Text>
          <Text style={styles.prefTag}>{time}</Text>
        </View>
        <Text style={styles.prefDivider}>|</Text>
        <View style={styles.prefItem}>
          <Text style={styles.prefsLabel}>SPEED</Text>
          <Text style={styles.prefTag}>{pace}</Text>
        </View>
        <Text style={styles.prefDivider}>|</Text>
        <View style={styles.prefItem}>
          <Text style={styles.prefsLabel}>BUDGET</Text>
          <Text style={styles.prefTag}>{budget}</Text>
        </View>
      </View>

      {venues.map((venue, index) => (
        <View key={index} style={styles.venueCard}>
          <View style={styles.venueNumber}>
            <Text style={styles.venueNumberText}>{index + 1}</Text>
          </View>
          <View style={styles.venueContent}>
            <Text style={styles.venueName}>{venue.name}</Text>
            <Text style={styles.venueAddress}>{venue.address}</Text>
            <Text style={styles.venueJustification}>{venue.justification}</Text>
            <Text style={styles.venueHours}>🕐 {venue.hours}</Text>
          </View>
        </View>
      ))}

      <TouchableOpacity
        style={styles.regenerateButton}
        onPress={() => router.push("/(tabs)/map")}
      >
        <Text style={styles.regenerateButtonText}>Regenerate on map</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingBottom: 48,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 32,
    textAlign: "center",
  },
  mapButton: {
    backgroundColor: "#000",
    padding: 18,
    borderRadius: 14,
    alignItems: "center",
    width: "100%",
  },
  mapButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  heading: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    letterSpacing: 2,
    marginBottom: 12,
  },
  headingDivider: {
    height: 1,
    backgroundColor: "#ddd",
    marginBottom: 20,
  },
  prefsRow: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  prefItem: {
    flex: 1,
    alignItems: "center",
  },
  prefsLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  prefTag: {
    fontSize: 13,
    color: "#333",
    fontWeight: "500",
    textAlign: "center",
  },
  prefDivider: {
    color: "#ccc",
    fontSize: 16,
    marginTop: 8,
  },
  venueCard: {
    flexDirection: "row",
    marginBottom: 20,
    gap: 14,
  },
  venueNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
    flexShrink: 0,
  },
  venueNumberText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  venueContent: {
    flex: 1,
  },
  venueName: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 2,
  },
  venueAddress: {
    fontSize: 13,
    color: "#888",
    marginBottom: 6,
  },
  venueJustification: {
    fontSize: 14,
    color: "#444",
    lineHeight: 20,
    marginBottom: 6,
  },
  venueHours: {
    fontSize: 13,
    color: "#666",
  },
  regenerateButton: {
    borderWidth: 1.5,
    borderColor: "#000",
    padding: 18,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  regenerateButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
});