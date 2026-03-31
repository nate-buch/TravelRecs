import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import MapboxGL from "@rnmapbox/maps";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { generateItinerary, Venue } from "../config/claude";
import { LEG_COLORS } from "../config/colors";
import { getRouteLegs } from "../config/directions";
import { getNearbyPlaces } from "../config/places";
import { optimizeRoute } from "../config/routing";
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
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (index >= LOADING_MESSAGES.length - 1) return;
    const timer = setTimeout(() => {
      setIndex(i => i + 1);
    }, 2000);
    return () => clearTimeout(timer);
  }, [index]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: ((index + 1) / LOADING_MESSAGES.length) * 100,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [index]);

  return (
    <View style={styles.loadingOverlay}>
      <Text style={styles.loadingText}>{LOADING_MESSAGES[index]}</Text>
      <View style={styles.progressBarBackground}>
        <Animated.View style={[styles.progressBarFill, { width: progressAnim.interpolate({
          inputRange: [0, 100],
          outputRange: ["0%", "100%"],
        }) }]} />
      </View>
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

  const { time, pace, budget, notes, venues, setVenues, setRouteLegs, routeLegs } = useAppStore();

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
    setRouteLegs([]);
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

      const optimized = optimizeRoute(
        location.coords.latitude,
        location.coords.longitude,
        result
      );
      setVenues(optimized);
      const legs = await getRouteLegs(
        [location.coords.longitude, location.coords.latitude],
        optimized
      );
      setRouteLegs(legs);

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
          <MapboxGL.MarkerView
            coordinate={[location.coords.longitude, location.coords.latitude]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.userMarker}>
              <Text style={styles.userMarkerText}>YOU ARE HERE</Text>
            </View>
          </MapboxGL.MarkerView>
        )}

        {routeLegs.map((leg, index) => (
          <MapboxGL.ShapeSource
            key={`leg-${index}`}
            id={`leg-${index}`}
            shape={{
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: leg.walkingCoordinates,
              },
              properties: {},
            }}
          >
            <MapboxGL.LineLayer
              id={`leg-line-${index}`}
              style={{
                lineColor: LEG_COLORS[index % LEG_COLORS.length],
                lineWidth: 3,
                lineDasharray: [2, 2],
              }}
            />
          </MapboxGL.ShapeSource>
        ))}

        {routeLegs.length > 0 && (
          <MapboxGL.ShapeSource
            id="legLabels"
            shape={{
              type: "FeatureCollection",
              features: routeLegs.map((leg, index) => {
                const venue = venues[index];
                if (!venue) return null;
                return {
                  type: "Feature",
                  geometry: {
                    type: "Point",
                    coordinates: [venue.longitude, venue.latitude],
                  },
                  properties: {
                    label: `Walk: ${leg.walkingDuration} min${leg.drivingDuration ? `\nDrive: ${leg.drivingDuration} min` : ""}`,
                    color: LEG_COLORS[index % LEG_COLORS.length],
                  },
                };
              }).filter(Boolean),
            }}
          >
            <MapboxGL.SymbolLayer
              id="legLabelsLayer"
                style={{
                  textField: ["get", "label"],
                  textSize: 12,
                  textColor: ["get", "color"],
                  textHaloColor: "#ffffff",
                  textHaloWidth: 2,
                  textAnchor: "top",
                  textOffset: [0, 1.5],
                  symbolSortKey: 1,
                  textFont: ["DIN Offc Pro Medium", "Arial Unicode MS Regular"],
                  textMaxWidth: 8,
                }}
            />
          </MapboxGL.ShapeSource>
        )}

        {venues.map((venue, index) => (
          <MapboxGL.MarkerView
            key={`venue-${index}`}
            coordinate={[venue.longitude, venue.latitude]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <TouchableOpacity
              style={[styles.venueMarker, { backgroundColor: LEG_COLORS[index % LEG_COLORS.length] }]}
              onPress={() => {
                setSelectedVenue(venue);
                bottomSheetRef.current?.expand();
              }}
            >
              <Text style={styles.venueMarkerText}>{index + 1}</Text>
            </TouchableOpacity>
          </MapboxGL.MarkerView>
        ))}

        {venues.length > 0 && (
          <MapboxGL.ShapeSource
            id="venueNames"
            shape={{
              type: "FeatureCollection",
              features: venues.map((venue, index) => ({
                type: "Feature",
                geometry: {
                  type: "Point",
                  coordinates: [venue.longitude, venue.latitude],
                },
                properties: {
                  name: venue.name,
                  color: LEG_COLORS[index % LEG_COLORS.length],
                },
              })),
            }}
          >
            <MapboxGL.SymbolLayer
              id="venueNamesLayer"
              style={{
                textField: ["get", "name"],
                textSize: 16,
                textColor: ["get", "color"],
                textHaloColor: "#ffffff",
                textHaloWidth: 2,
                textAnchor: "bottom",
                textOffset: [0, -1.0],
                textMaxWidth: 10,
                textAllowOverlap: true,
                textIgnorePlacement: true,
                symbolSortKey: 3,
                textFont: ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
              }}
            />
          </MapboxGL.ShapeSource>
        )}

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
    bottom: 10,
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
  userMarker: {
  width: 28,
  height: 28,
  borderRadius: 14,
  backgroundColor: "#333",
  borderWidth: 2,
  borderColor: "#fff",
  justifyContent: "center",
  alignItems: "center",
  },
  userMarkerText: {
    fontSize: 5,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
  },
  venueMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  venueMarkerText: {
  color: "#fff",
  fontSize: 13,
  fontWeight: "bold",
  },
  venueMarkerContainer: {
  alignItems: "center",
  },
  venueNameLabel: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#ddd",
    maxWidth: 120,
  },
  venueNameLabelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
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
    color: "#333",
    fontStyle: "italic",
    fontWeight: "600",
    marginBottom: 10,
  },
  progressBarBackground: {
  width: "100%",
  height: 4,
  backgroundColor: "#e0e0e0",
  borderRadius: 2,
  overflow: "hidden",
  },
  progressBarFill: {
    height: 4,
    backgroundColor: "#000",
    borderRadius: 2,
  },
  legLabel: {
    backgroundColor: "transparent",
    borderWidth: 0,
    padding: 4,
  },
  legLabelText: {
    fontSize: 14,
    fontWeight: "600",
    textShadowColor: "#fff",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
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