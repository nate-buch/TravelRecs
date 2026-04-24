// Unique URL to return to this development conversation with Claude:
// https://claude.ai/chat/4f8e86c2-b042-49e8-9410-e528ed0920f8

import { router } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { loadPreferences } from "./config/preferences";
import { useAppStore } from "./config/store";

export default function Index() {
  const setPreferences = useAppStore(state => state.setPreferences);
  const setVenuePreferences = useAppStore(state => state.setVenuePreferences);

  useEffect(() => {
    (async () => {
      const saved = await loadPreferences();
      if (saved) {
        setPreferences(saved.time, saved.pace, saved.budget, saved.notes);
        if (saved.venuePreferences) setVenuePreferences(saved.venuePreferences);
      }
    })();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TravelRecs</Text>
      <Text style={styles.subtitle}>Your curated travel companion</Text>
      <View style={styles.buttons}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={() => router.push("/(tabs)/itinerary")}
        >
          <Text style={styles.primaryButtonText}>Resume active itinerary</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => router.push("/(tabs)/map")}
        >
          <Text style={styles.secondaryButtonText}>Generate new itinerary</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 32,
  },
  title: {
    fontSize: 36,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 60,
  },
  buttons: {
    width: "100%",
    gap: 16,
  },
  button: {
    width: "100%",
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
  },
  primaryButton: {
    backgroundColor: "#000",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "#f0f0f0",
  },
  secondaryButtonText: {
    color: "#000",
    fontSize: 18,
    fontWeight: "600",
  },
});