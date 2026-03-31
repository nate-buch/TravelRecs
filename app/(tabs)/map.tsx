import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import MapboxGL from "@rnmapbox/maps";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { generateItinerary, Venue } from "../config/claude";
import { getNearbyPlaces } from "../config/places";
import { useAppStore } from "../config/store";

MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN!);

const LOADING_MESSAGES = [
  "Incorporating your preferences...",
  "Curating recommendations...",
  "Optimizing travel flow...",
  "Finalizing itinerary...",
];

function LoadingMessage() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= LOADING_MESSAGES.length - 1) return;
    const timer = setTimeout(() => {
      setIndex(i => i + 1);
    }, 2000);
    return () => clearTimeout(timer);
  }, [index]);

  return (
    <View style={styles.loadingOverlay}>
      <Text style={styles.loadingText}>{LOADING_MESSAGES[index]}</Text>
    </View>
  );
}

export default function MapScreen() {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const [venueVisible, setVenueVisible] = useState(false);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationError, setLocationError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { time, pace, budget, notes, venues, setVenues } = useAppStore();

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
    setVenues([]);
    try {
      const nearbyPlaces = await getNearbyPlaces(
        location.coords.latitude,
        location.coords.longitude
      );
      const result = await generateItinerary(
        location.coords.latitude,
        location.coords.longitude,
        time || "a full day",
        pace || "well-paced",
        budget || "flexible",
        notes,
        nearbyPlaces
      );
      setVenues(result);
      if (result.length > 0 && location) {
        const lngs = [...result.map(v => v.longitude), location.coords.longitude];
        const lats = [...result.map(v => v.latitude), location.coords.latitude];
        cameraRef.current?.fitBounds(
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
          80,
          500
        );
      }
    } catch (e: any) {
      setError(e.message || "Something went wrong. Please try again.");
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

  const cameraRef = useRef<MapboxGL.Camera>(null);

  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);

  return (
    <View style={styles.container}>
      <MapboxGL.MapView style={styles.map}>
        <MapboxGL.Camera
          ref={cameraRef}
          zoomLevel={14}
          centerCoordinate={
            location
              ? [location.coords.longitude, location.coords.latitude]
              : [-97.7431, 30.2672]
          }
        />
        {location && (
          <MapboxGL.PointAnnotation
            id="userLocation"
            coordinate={[location.coords.longitude, location.coords.latitude]}
          >
            <View style={styles.marker} />
          </MapboxGL.PointAnnotation>
        )}
        {venues.map((venue, index) => (
          <MapboxGL.PointAnnotation
            key={`venue-${index}`}
            id={`venue-${index}`}
            coordinate={[venue.longitude, venue.latitude]}
            anchor={{ x: 0.5, y: 0.5 }}
            onSelected={() => {
              setSelectedVenue(venue);
              bottomSheetRef.current?.expand();
            }}
          >
            <View style={styles.venueMarker} />
          </MapboxGL.PointAnnotation>
        ))}
      </MapboxGL.MapView>

    <View style={styles.overlayContainer}>

      {!location && !locationError && (
        <View style={styles.gpsLoading}>
          <Text style={styles.gpsLoadingText}>📍 Getting your location...</Text>
        </View>
      )}

      {loading && <LoadingMessage />}

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

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {!loading && venues.length === 0 && location && time && pace && budget && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            Tap "Generate itinerary" to find great spots nearby!
          </Text>
        </View>
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
    </View>

      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={["35%"]}
        enablePanDownToClose
        onClose={closeVenue}
      >
        <BottomSheetView style={styles.sheetContent}>
          <Text style={styles.venueName}>{selectedVenue?.name}</Text>
          <Text style={styles.venueJustification}>{selectedVenue?.justification}</Text>
          <View style={styles.hoursRow}>
            <Text style={styles.hoursLabel}>Hours  </Text>
            <Text style={styles.hoursValue}>{selectedVenue?.hours}</Text>
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
  map: { flex: 1 },
  marker: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#000",
    borderWidth: 2,
    borderColor: "#fff",
  },
  overlayContainer: {
    position: "absolute",
    bottom: 100,
    left: 16,
    right: 16,
    maxHeight: "70%",
  },
  itineraryBox: {
  backgroundColor: "rgba(255,255,255,0.95)",
  borderRadius: 14,
  padding: 16,
  marginBottom: 10,
  maxHeight: 300,
  overflow: "scroll",
  },
  venueMarker: {
  width: 14,
  height: 14,
  borderRadius: 7,
  backgroundColor: "#e63946",
  borderWidth: 2,
  borderColor: "#fff",
  },
  nudgeBanner: {
    backgroundColor: "#fff8e1",
    borderWidth: 1.5,
    borderColor: "#f0c040",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  nudgeText: {
    fontSize: 14,
    color: "#7a6000",
    textAlign: "center",
  },
  generateButton: {
    backgroundColor: "#000",
    padding: 18,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  emptyState: {
  backgroundColor: "rgba(255,255,255,0.95)",
  borderRadius: 12,
  padding: 16,
  marginBottom: 10,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#555",
    textAlign: "center",
  },
  gpsLoading: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    alignItems: "center",
  },
  gpsLoadingText: {
    fontSize: 14,
    color: "#555",
  },
  loadingOverlay: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  loadingText: {
    fontSize: 15,
    color: "#555",
    fontStyle: "italic",
  },
  buttonDisabled: { backgroundColor: "#ccc" },
  generateButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  errorText: { fontSize: 14, color: "red", marginBottom: 10 },
  itineraryBox: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 14,
    padding: 16,
    maxHeight: 200,
  },
  itineraryTitle: { fontSize: 16, fontWeight: "bold", marginBottom: 8 },
  itineraryText: { fontSize: 14, color: "#333", lineHeight: 22 },
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