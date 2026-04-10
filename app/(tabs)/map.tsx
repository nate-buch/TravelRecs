// #region Imports

import { Ionicons } from "@expo/vector-icons";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import MapboxGL from "@rnmapbox/maps";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SearchResult, VenueSearchBar } from "../../components/VenueSearchBar";
import { generateItinerary, Venue } from "../config/claude";
import { LEG_COLORS } from "../config/colors";
import { getDefaultMode, getRouteLegs } from "../config/directions";
import { getNearbyPlaces } from "../config/places";
import { optimizeRoute } from "../config/routing";
import { calculateSchedule, recalculateSchedule } from "../config/schedule";
import { useAppStore } from "../config/store";

MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN!);

// #endregion

// #region Types and Constants

const LOADING_MESSAGES = [
  "Incorporating your preferences...",
  "Curating recommendations...",
  "Optimizing travel flow...",
  "Finalizing itinerary...",
];

const PENDING_MARKER_COLOR = "#888888";
const PENDING_MARKER_LABEL = "Add to your Itinerary!";

interface SearchResult {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  types: string[];
  placeId: string;
};

// #endregion

// #region Loading Message Progress Bar

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

// #endregion

// #region Main Component

export default function MapScreen() {
  
  // #region Store

  const {
    time, pace, budget, notes,
    venues, setVenues,
    setRouteLegs, routeLegs,
    setLocation: saveLocation,
    setTimeBlocks, legModes, setLegModes, timeBlocks,
    addRemovedVenueName, clearRemovedVenueNames,
  } = useAppStore();
  
  // #endregion

  // #region Local State

  const bottomSheetRef = useRef<BottomSheet>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationError, setLocationError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const cameraRef = useRef<MapboxGL.Camera>(null);

  // Tracks the current map camera center for search result biasing
  const [cameraCenter, setCameraCenter] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (selectedVenue) {
      const updated = venues.find(v => v.name === selectedVenue.name);
      if (updated) setSelectedVenue(updated);
    }
  }, [venues]);

  // #endregion

  // #region GPS

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationError("Location permission denied.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setLocation(loc);
      saveLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      setCameraCenter([loc.coords.longitude, loc.coords.latitude]);
    })();
  }, []);

  // #endregion

  // #region Itinerary Generation (shared logic)

  const runGeneration = async (coords: { latitude: number; longitude: number }) => {
    setLoading(true);
    setError("");
    setVenues([]);
    setRouteLegs([]);
    try {
      const nearbyPlaces = await getNearbyPlaces(coords.latitude, coords.longitude);
      const result = await generateItinerary(
        coords.latitude, coords.longitude,
        time || "a full day", pace || "well-paced", budget || "flexible",
        notes, nearbyPlaces
      );
      const optimized = optimizeRoute(coords.latitude, coords.longitude, result);
      setVenues(optimized);
      const legs = await getRouteLegs([coords.longitude, coords.latitude], optimized);
      setRouteLegs(legs);
      const modes = legs.map(leg => getDefaultMode(leg, pace));
      setLegModes(modes);
      const blocks = calculateSchedule(optimized, legs, pace);
      setTimeBlocks(blocks);
      if (result.length > 0) {
        const lngs = [...result.map(v => v.longitude), coords.longitude];
        const lats = [...result.map(v => v.latitude), coords.latitude];
        cameraRef.current?.fitBounds(
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
          80, 500
        );
      }
    } catch (e: any) {
      setError(e.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // #endregion

  // #region Generate New Itinerary

  const handleGenerateNew = async () => {
    if (!location) return;
    clearRemovedVenueNames();
    await runGeneration({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });
  };

  // #endregion

  // #region Re-Generate Itinerary (stub — full logic in future sprint)

  const handleReGenerate = async () => {
    if (!location || venues.length === 0) return;
    // TODO: pass locked venues, pending venues, and removedVenueNames to Claude
    await runGeneration({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });
  };

  // #endregion

  // #region Add Venue via Search

  const handleSearchSelect = (result: SearchResult) => {
    const venue: Venue = {
      name: result.name,
      latitude: result.latitude,
      longitude: result.longitude,
      address: result.address,
      justification: "",
      hours: "Verify before visiting",
      types: result.types,
      venueType: undefined,
      locked: true,
      pending: true,
    };
    setVenues([venue, ...venues]);
    cameraRef.current?.flyTo([result.longitude, result.latitude], 500);
  };

  // #endregion

  // #region Venue Bottom Sheet Toggle

  const toggleVenueLockFromMap = (venue: Venue) => {
    const index = venues.findIndex(v => v.name === venue.name);
    if (index === -1) return;
    const newVenues = [...venues];
    newVenues[index] = { ...newVenues[index], locked: !newVenues[index].locked };
    setVenues(newVenues);
    setSelectedVenue(newVenues[index]);
  };

  const removeVenueFromMap = async (venue: Venue) => {
    const index = venues.findIndex(v => v.name === venue.name);
    if (index === -1) return;
    bottomSheetRef.current?.close();
    addRemovedVenueName(venue.name);
    const newVenues = venues.filter((_, i) => i !== index);
    const newTimeBlocks = timeBlocks.filter((_, i) => i !== index);
    const newLegModes = legModes.filter((_, i) => i !== index);
    setVenues(newVenues);
    if (location && newVenues.length > 0) {
      const legs = await getRouteLegs(
        [location?.coords.longitude ?? 0, location?.coords.latitude ?? 0],
        newVenues
      );
      setRouteLegs(legs);
      const modes = legs.map((leg, i) => newLegModes[i] ?? "walking");
      setLegModes(modes);
      const blocks = recalculateSchedule(newVenues, legs, newTimeBlocks, newVenues);
      setTimeBlocks(blocks);
    } else {
      setRouteLegs([]);
      setLegModes([]);
      setTimeBlocks([]);
    }
  };

  // #endregion

  // #region Render Itinerary

  return (
    <View style={styles.container}>

    {/* #region Search Bar */}

    <View style={styles.searchBarWrapper}>
      <VenueSearchBar
        cameraCenter={cameraCenter}
        onSelect={handleSearchSelect}
      />
    </View>   

    {/* #region Map and Route */}

      <MapboxGL.MapView 
        style={styles.map}
        styleURL="mapbox://styles/flashpackingguide/cmngh698v007501qo9tazbw0c?fresh=true"
        onCameraChanged={(state) => {
          const c = state.properties.center;
          if (c) setCameraCenter([c[0], c[1]]);
        }}
      >

    {/* #region Camera */}

      <MapboxGL.Camera
        ref={cameraRef}
        zoomLevel={14}
        centerCoordinate={
          location
            ? [location.coords.longitude, location.coords.latitude]
            : [-97.7431, 30.2672]
        }
      />

    {/* #region User Location */}

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

    {/* #region Route Legs */}

      {routeLegs.map((leg, index) => {
        const nonPending = venues.filter(v => !v.pending);
        const venue = nonPending[index];
        if (!venue) return null;
        return (
          <MapboxGL.ShapeSource
            key={`leg-${index}`}
            id={`leg-${index}`}
            shape={{ type: "Feature", geometry: { type: "LineString", coordinates: leg.walkingCoordinates }, properties: {} }}
          >
            <MapboxGL.LineLayer
              id={`leg-line-${index}`}
              style={{ lineColor: LEG_COLORS[index % LEG_COLORS.length], lineWidth: 3, lineDasharray: [2, 2] }}
            />
          </MapboxGL.ShapeSource>
        );
      })}

      {routeLegs.length > 0 && (
        <MapboxGL.ShapeSource
          id="legLabels"
          shape={{
            type: "FeatureCollection",
            features: routeLegs.map((leg, index) => {
              const nonPending = venues.filter(v => !v.pending);
              const venue = nonPending[index];
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
            }).filter(Boolean) as any,
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
                textOffset: [0, 1.2],
                symbolSortKey: 1,
                textFont: ["DIN Offc Pro Medium", "Arial Unicode MS Regular"],
                textMaxWidth: 8,
              }}
          />
        </MapboxGL.ShapeSource>
      )}

    {/* #region Venue Names and Times */}

      <MapboxGL.ShapeSource
        id="venueNames"
        shape={{
          type: "FeatureCollection",
          features: venues
            .filter(v => !v.pending)
            .map((venue, i) => ({
              type: "Feature",
              geometry: { type: "Point", coordinates: [venue.longitude, venue.latitude] },
              properties: {
                name: venue.name,
                color: LEG_COLORS[i % LEG_COLORS.length],
                timeBlock: timeBlocks[i]
                  ? `${timeBlocks[i].arrivalTime} – ${timeBlocks[i].departureTime}`
                  : "",
              },
            })),
        }}
      >
        <MapboxGL.SymbolLayer
          id="venueNamesLayer"
          aboveLayerID="legLabelsLayer"
          style={{
            textField: ["get", "name"],
            textSize: 16,
            textColor: ["get", "color"],
            textHaloColor: "#ffffff",
            textHaloWidth: 2,
            textAnchor: "bottom",
            textOffset: [0, -1.5],
            textMaxWidth: 10,
            textAllowOverlap: true,
            textIgnorePlacement: true,
            symbolSortKey: 3,
            textFont: ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
          }}
        />

        <MapboxGL.SymbolLayer
          id="venueTimesLayer"
          aboveLayerID="venueNamesLayer"
          style={{
            textField: ["get", "timeBlock"],
            textSize: 12,
            textColor: ["get", "color"],
            textHaloColor: "#ffffff",
            textHaloWidth: 2,
            textAnchor: "bottom",
            textOffset: [0, -0.9],
            textMaxWidth: 12,
            textAllowOverlap: true,
            textIgnorePlacement: true,
            textFont: ["DIN Offc Pro Medium", "Arial Unicode MS Regular"],
          }}
        />
      </MapboxGL.ShapeSource>

    {/* Pending venue markers — filtered from venues array */}
      
      <MapboxGL.ShapeSource
        id="pendingMarkers"
        shape={{
          type: "FeatureCollection",
          features: venues
            .filter(v => v.pending)
            .map(v => ({
              type: "Feature",
              geometry: { type: "Point", coordinates: [v.longitude, v.latitude] },
              properties: { name: v.name },
            })),
        }}
        onPress={(e) => {
          const feature = e.features[0];
          if (!feature) return;
          const name = feature.properties?.name;
          const v = venues.find(p => p.name === name && p.pending);
          if (v) {
            setSelectedVenue(v);
            bottomSheetRef.current?.expand();
          }
        }}
      >
        <MapboxGL.CircleLayer
          id="pendingVenueCircles"
          style={{
            circleRadius: 12,
            circleColor: PENDING_MARKER_COLOR,
            circleStrokeWidth: 2,
            circleStrokeColor: "#ffffff",
          }}
        />
        <MapboxGL.SymbolLayer
          id="pendingQuestionMarks"
          aboveLayerID="pendingVenueCircles"
          style={{
            textField: "?",
            textSize: 16,
            textColor: "#ffffff",
            textFont: ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
            textAllowOverlap: true,
            textIgnorePlacement: true,
          }}
        />
        <MapboxGL.SymbolLayer
          id="pendingNameLabels"
          aboveLayerID="pendingQuestionMarks"
          style={{
            textField: ["get", "name"],
            textSize: 16,
            textColor: PENDING_MARKER_COLOR,
            textHaloColor: "#ffffff",
            textHaloWidth: 2,
            textAnchor: "bottom",
            textOffset: [0, -1.0],
            textMaxWidth: 10,
            textAllowOverlap: true,
            textIgnorePlacement: true,
            symbolSortKey: 10,
            textFont: ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
          }}
        />
        <MapboxGL.SymbolLayer
          id="pendingLabels"
          aboveLayerID="pendingNameLabels"
          style={{
            textField: PENDING_MARKER_LABEL,
            textSize: 13,
            textColor: PENDING_MARKER_COLOR,
            textHaloColor: "#ffffff",
            textHaloWidth: 2,
            textAnchor: "top",
            textOffset: [0, 1.2],
            textFont: ["DIN Offc Pro Medium", "Arial Unicode MS Regular"],
            textAllowOverlap: true,
            textIgnorePlacement: true,
            symbolSortKey: 10,
          }}
        />
      </MapboxGL.ShapeSource>

    {/* #region Venue Markers */}

      <MapboxGL.ShapeSource
        id="venueMarkers"
        shape={{
          type: "FeatureCollection",
          features: venues
            .filter(v => !v.pending)
            .map((venue, i) => ({
              type: "Feature",
              geometry: { type: "Point", coordinates: [venue.longitude, venue.latitude] },
              properties: { index: i + 1, color: LEG_COLORS[i % LEG_COLORS.length] },
            })),
        }}
        onPress={(e) => {
          const feature = e.features[0];
          if (!feature) return;
          const idx = (feature.properties?.index ?? 1) - 1;
          const tappedVenue = venues[idx];
          if (tappedVenue) {
            setSelectedVenue(tappedVenue);
            bottomSheetRef.current?.expand();
          }
        }}
      >
        <MapboxGL.CircleLayer
          id="venueCircles"
          aboveLayerID="legLabelsLayer"
          style={{
            circleRadius: 12,
            circleColor: ["get", "color"],
            circleStrokeWidth: 2,
            circleStrokeColor: "#ffffff",
          }}
        />
        <MapboxGL.SymbolLayer
          id="venueNumbers"
          aboveLayerID="venueCircles"
          style={{
            textField: ["to-string", ["get", "index"]],
            textSize: 15,
            textColor: "#ffffff",
            textFont: ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
            textAllowOverlap: true,
            textIgnorePlacement: true,
          }}
        />
      </MapboxGL.ShapeSource>

    </MapboxGL.MapView>

    {/* #region Overlays */}

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
            Tap "Generate New Itinerary" to find great spots nearby!
          </Text>
        </View>
      )}

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.generateButton, (!location || loading) && styles.buttonDisabled]}
          onPress={handleGenerateNew}
          disabled={!location || loading}
        >
          <Text style={styles.generateButtonText}>Generate New Itinerary</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.generateButton,
            styles.reGenerateButton,
            (!location || loading || venues.length === 0) && styles.buttonDisabled,
          ]}
          onPress={handleReGenerate}
          disabled={!location || loading || venues.length === 0}
        >
          <Text style={styles.generateButtonText}>Re-Generate!</Text>
          <Text style={styles.reGenerateSubtext}>
            Considers additions,{"\n"}removals, and locks.
          </Text>
        </TouchableOpacity>
      </View>
    </View>

    {/* Bottom Sheet */}
    
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={["35%"]}
      enablePanDownToClose
      onClose={() => setSelectedVenue(null)}
    >
      <BottomSheetView style={styles.sheetContent}>

        {selectedVenue && (
          <>
            <View style={styles.venueNameRow}>
              <TouchableOpacity onPress={() => toggleVenueLockFromMap(selectedVenue)}>
                <View style={[styles.venueLockCircle, selectedVenue.locked && styles.venueLockCircleActive]}>
                  <Ionicons
                    name={selectedVenue.locked ? "lock-closed" : "lock-open"}
                    size={16}
                    color="#fff"
                  />
                </View>
              </TouchableOpacity>
              <Text style={styles.venueName}>{selectedVenue.name}</Text>
            </View>
            <Text style={styles.venueJustification}>{selectedVenue.justification}</Text>
            <View style={styles.hoursRow}>
              <Text style={styles.hoursLabel}>Hours  </Text>
              <Text style={styles.hoursValue}>{selectedVenue.hours}</Text>
            </View>
            <View style={styles.venueCardActions}>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeVenueFromMap(selectedVenue)}
              >
                <Ionicons name="remove-circle" size={14} color="#7b241c" />
                <Text style={styles.removeButtonText}>REMOVE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.moreButton}>
                <Text style={styles.moreButtonText}>More info</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

      </BottomSheetView>
    </BottomSheet>

    </View>

  );

  //#endregion

}

// #endregion

// #region Styles

const styles = StyleSheet.create({

  // #region General Layout

  container: { flex: 1 },
  map: { flex: 1 },

  overlayContainer: {
    position: "absolute",
    bottom: 10,
    left: 16,
    right: 16,
    maxHeight: "70%",
  },

  // #endregion

  // #region User Location Marker

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

  // #endregion

  // #region Venue Markers and Labels

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

  // #endregion

  // #region Banners, Buttons, Search Bar, and Empty States

  searchBarWrapper: {
    position: "absolute",
    top: 10,
    left: 12,
    right: 12,
    zIndex: 10,
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
  errorText: { fontSize: 14, color: "red", marginBottom: 10 },

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

  buttonDisabled: { backgroundColor: "#ccc" },
  generateButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },

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

  // #endregion

  // #region Generate Buttons

  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 2,
  },
  generateButton: {
    flex: 1,
    backgroundColor: "#000",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  reGenerateButton: {
    backgroundColor: "#000",
  },
  generateButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  reGenerateSubtext: {
    color: "#aaa",
    fontSize: 11,
    textAlign: "center",
    marginTop: 2,
  },

  // #endregion

  // #region Pending Venue

  pendingNote: {
    fontSize: 14,
    color: "#555",
    fontStyle: "italic",
    marginBottom: 16,
  },

// #endregion

  // #region Loading Bar

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

  // #endregion

  // #region Venue Bottom Sheet

  sheetContent: { padding: 24 },
  
  venueNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 6,
  },
  venueLockCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#b0bdb0",
    alignItems: "center",
    justifyContent: "center",
  },
  venueLockCircleActive: {
    backgroundColor: "#2d9e5f",
  },
  venueName: { 
    fontSize: 22, 
    fontWeight: "bold", 
    marginBottom: 2 },
  
  venueJustification: { fontSize: 15, color: "#444", lineHeight: 22, marginBottom: 16 },
  hoursRow: { flexDirection: "row", marginBottom: 20 },
  hoursLabel: { fontSize: 14, fontWeight: "600", color: "#111" },
  hoursValue: { fontSize: 14, color: "#555", flex: 1 },
  
  venueCardActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },

  removeButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#7b241c",
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginTop: 8,
    gap: 3,
  },
  removeButtonText: {
    color: "#7b241c",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
  },

  moreButton: {
    borderWidth: 1.5,
    borderColor: "#000",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  moreButtonText: { fontSize: 16, fontWeight: "600", color: "#000" },

  // #endregion

});

// #endregion