import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { generateItinerary } from "../config/claude";
import { usePreferencesStore } from "../config/store";

const MOCK_VENUE = {
  name: "Bar Marsella",
  justification: "Oldest bar in Barcelona, unchanged since 1820. A must for anyone who appreciates living history over tourist traps.",
  hours: "Mon–Sat: 7pm–2am, Closed Sunday",
};

export default function MapScreen() {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const [venueVisible, setVenueVisible] = useState(false);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationError, setLocationError] = useState("");
  const [itinerary, setItinerary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { time, pace, budget, notes } = usePreferencesStore();

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationError("Location permission denied.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setLocation(loc);
    })();
  }, []);

  const handleGenerate = async () => {
    if (!location) return;
    setLoading(true);
    setError("");
    setItinerary("");
    try {
      const result = await generateItinerary(
        location.coords.latitude,
        location.coords.longitude,
        time || "a full day",
        pace || "well-paced",
        budget || "flexible",
        notes
      );
      setItinerary(result);
    } catch (e) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const openVenue = () => {
    setVenueVisible(true);
    bottomSheetRef.current?.expand();
  };

  const closeVenue = () => {
    setVenueVisible(false);
    bottomSheetRef.current?.close();
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Map</Text>

        {location ? (
          <Text style={styles.locationText}>
            📍 {location.coords.latitude.toFixed(5)}, {location.coords.longitude.toFixed(5)}
          </Text>
        ) : locationError ? (
          <Text style={styles.errorText}>{locationError}</Text>
        ) : (
          <Text style={styles.locationText}>Getting your location...</Text>
        )}

        {!time && !pace && !budget && (
          <TouchableOpacity
            style={styles.nudgeBanner}
            onPress={() => router.push("/(tabs)/preferences")}
          >
            <Text style={styles.nudgeText}>
              ⚙️ No preferences set — tap here to customize your itinerary
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.generateButton, (!location || loading) && styles.buttonDisabled]}
          onPress={handleGenerate}
          disabled={!location || loading}
        >
          <Text style={styles.generateButtonText}>
            {loading ? "Generating..." : "Generate itinerary"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.testButton} onPress={openVenue}>
          <Text style={styles.testButtonText}>Test venue card</Text>
        </TouchableOpacity>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {itinerary ? (
          <View style={styles.itineraryBox}>
            <Text style={styles.itineraryTitle}>Your curated itinerary</Text>
            <Text style={styles.itineraryText}>{itinerary}</Text>
          </View>
        ) : null}
      </ScrollView>

      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={["35%"]}
        enablePanDownToClose
        onClose={closeVenue}
      >
        <BottomSheetView style={styles.sheetContent}>
          <Text style={styles.venueName}>{MOCK_VENUE.name}</Text>
          <Text style={styles.venueJustification}>{MOCK_VENUE.justification}</Text>
          <View style={styles.hoursRow}>
            <Text style={styles.hoursLabel}>Hours  </Text>
            <Text style={styles.hoursValue}>{MOCK_VENUE.hours}</Text>
          </View>
          <TouchableOpacity style={styles.moreButton}>
            <Text style={styles.moreButtonText}>More info</Text>
          </TouchableOpacity>
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingBottom: 48 },
  heading: { fontSize: 28, fontWeight: "bold", marginBottom: 12 },
  locationText: { fontSize: 14, color: "#555", marginBottom: 24 },
  errorText: { fontSize: 14, color: "red", marginBottom: 16 },
  generateButton: {
    backgroundColor: "#000",
    padding: 18,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonDisabled: { backgroundColor: "#ccc" },
  generateButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  testButton: {
    borderWidth: 1.5,
    borderColor: "#000",
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 24,
  },
  testButtonText: { fontSize: 15, fontWeight: "600", color: "#000" },
  itineraryBox: {
    backgroundColor: "#f5f5f5",
    borderRadius: 14,
    padding: 20,
  },
  itineraryTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  nudgeBanner: {
  backgroundColor: "#fff8e1",
  borderWidth: 1.5,
  borderColor: "#f0c040",
  borderRadius: 12,
  padding: 14,
  marginBottom: 16,
  },
  nudgeText: {
    fontSize: 14,
    color: "#7a6000",
    textAlign: "center",
  },
  itineraryText: {
    fontSize: 15,
    color: "#333",
    lineHeight: 24,
  },
  sheetContent: { padding: 24 },
  venueName: { fontSize: 22, fontWeight: "bold", marginBottom: 8 },
  venueJustification: { fontSize: 15, color: "#444", lineHeight: 22, marginBottom: 16 },
  hoursRow: { flexDirection: "row", marginBottom: 20 },
  hoursLabel: { fontSize: 14, fontWeight: "600", color: "#111" },
  hoursValue: { fontSize: 14, color: "#555", flex: 1 },
  moreButton: {
    borderWidth: 1.5,
    borderColor: "#000",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  moreButtonText: { fontSize: 16, fontWeight: "600", color: "#000" },
});