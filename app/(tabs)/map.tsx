// #region Imports

import { Ionicons } from "@expo/vector-icons";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import MapboxGL from "@rnmapbox/maps";
import * as Location from "expo-location";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { DaySelector } from "../../components/DaySelector";
import { SearchResult, VenueSearchBar } from "../../components/VenueSearchBar";
import { generateItinerary, Venue } from "../config/claude";
import { LEG_COLORS } from "../config/colors";
import { getDefaultMode, getRouteLegs } from "../config/directions";
import { formatDuration } from "../config/durations";
import { getNearbyPlaces } from "../config/places";
import { optimizeRoute, optimizeRouteFromUser } from "../config/routing";
import { calculateSchedule, recalculateSchedule } from "../config/schedule";
import { useAppStore } from "../config/store";
import { getPlaceDetails } from "../config/places";
import { generateJustification } from "../config/claude";

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
    venues, setVenues, venuePreferences,
    setRouteLegs, routeLegs,
    setGpsLocation, routeOrigin, gpsLocation,
    setTimeBlocks, legModes, setLegModes, timeBlocks,
    addRemovedVenueName, clearRemovedVenueNames,
    setItinerary, travelDay,
  } = useAppStore();

  const insets = useSafeAreaInsets()
  
  // #endregion

  // #region Local State

  const bottomSheetRef = useRef<BottomSheet>(null);
  const generateSheetRef = useRef<BottomSheet>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationError, setLocationError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const [weatherEnabled, setWeatherEnabled] = useState(false);
  const [eventsEnabled, setEventsEnabled] = useState(false);

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
      await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10 },
        (loc) => {
          setGpsLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          setCameraCenter(prev => prev ?? [loc.coords.longitude, loc.coords.latitude]);
        }
      );
      const loc = await Location.getCurrentPositionAsync({});

      setGpsLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
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
        notes, nearbyPlaces, venuePreferences
      );
      const optimized = optimizeRoute(coords.latitude, coords.longitude, result);
      setVenues(optimized);
      const legs = await getRouteLegs([coords.longitude, coords.latitude], optimized);
      setRouteLegs(legs);
      const modes = legs.map(leg => getDefaultMode(leg, pace));
      setLegModes(modes);
      const blocks = calculateSchedule(optimized, legs, pace, modes, travelDay);
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

  // #region Route Generation: Auto 

  const handleAuto = async () => {
    if (!routeOrigin) return;
    clearRemovedVenueNames();
    generateSheetRef.current?.collapse();
    await runGeneration({
      latitude: routeOrigin.latitude,
      longitude: routeOrigin.longitude,
    });
  };

  // #endregion

  // #region Route Generation: Semi-Auto (stub — full logic in future sprint)

  const handleSemiAuto = async () => {
    if (!routeOrigin || venues.length === 0) return;
    generateSheetRef.current?.collapse();
    // TODO: full Re-Generate implementation
    // passes locked venues, added venues, removed venues, venue type prefs to Claude
    await runGeneration({
      latitude: routeOrigin.latitude,
      longitude: routeOrigin.longitude,
    });
  };

  // #endregion

  // #region Route Generation: Manual

  const handleManual = async () => {
    if (!routeOrigin || venues.length === 0) return;
    generateSheetRef.current?.collapse();
    setLoading(true);
    setError("");
    try {
      // Sweep up all user-added venues (pending + placed), mark all as placed
      const allUserVenues = venues.map(v => ({ ...v, pending: false }));
      const previousNonPending = venues.filter(v => !v.pending);
      const optimized = optimizeRouteFromUser(
        routeOrigin.latitude,
        routeOrigin.longitude,
        allUserVenues
      );
      const legs = await getRouteLegs(
        [routeOrigin.longitude, routeOrigin.latitude],
        optimized
      );
      const modes = legs.map(leg => getDefaultMode(leg, pace));
      const blocks = recalculateSchedule(optimized, legs, timeBlocks, previousNonPending, modes, travelDay);
      setItinerary(optimized, legs, modes, blocks);
      if (optimized.length > 0) {
        const lngs = [...optimized.map(v => v.longitude), location.coords.longitude];
        const lats = [...optimized.map(v => v.latitude), location.coords.latitude];
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

  // #region Add Venue via Search

  const handleSearchSelect = async (result: SearchResult) => {
    const placeHours = result.placeId ? await getPlaceDetails(result.placeId) : null;
    const venue: Venue = {
      name: result.name,
      latitude: result.latitude,
      longitude: result.longitude,
      address: result.address,
      justification: "",
      hours: placeHours?.weekdayText ?? [],
      placeId: result.placeId,
      placeHours: placeHours ?? undefined,
      types: result.types,
      venueType: undefined,
      locked: true,
      pending: true,
    };
    setVenues([venue, ...venues]);
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
      const previousVenues = venues.filter(v => !v.pending); // capture before removal
      const newVenues = venues.filter((_, i) => i !== index);
      const newTimeBlocks = timeBlocks.filter((_, i) => i !== index);
      const newLegModes = legModes.filter((_, i) => i !== index);
      setVenues(newVenues);
      if (routeOrigin && newVenues.length > 0) {
        const legs = await getRouteLegs(
          [routeOrigin?.longitude ?? 0, routeOrigin?.latitude ?? 0],
          newVenues
        );
        setRouteLegs(legs);
        const modes = legs.map((leg, i) => newLegModes[i] ?? "walking");
        setLegModes(modes);

        const blocks = recalculateSchedule(newVenues, legs, newTimeBlocks, previousVenues, newLegModes);
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

    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <StatusBar style="dark" />
    
    <View style={styles.container}>

    {/* #region Search Bar */}

    <View style={{
      position: "absolute",
      top: insets.top - 20,
      left: 12,
      right: 12,
      zIndex: 10,
    }}>
      <VenueSearchBar
        cameraCenter={cameraCenter}
        onSelect={handleSearchSelect}
      />
    </View>   

    {/* #region Map and Route */}

      <MapboxGL.MapView 
        style={styles.map}
        styleURL="mapbox://styles/flashpackingguide/cmngh698v007501qo9tazbw0c?fresh=true"
        scaleBarEnabled={false}
        compassEnabled={true}
        compassPosition={{ top: 60, right: 8 }}
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
          gpsLocation
            ? [gpsLocation.longitude, gpsLocation.latitude]
            : [-97.7431, 30.2672]
        }
      />

    {/* #region User Location */}

      {gpsLocation && (
        <MapboxGL.MarkerView
          coordinate={[gpsLocation.longitude, gpsLocation.latitude]}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={styles.userMarker}>
            <Text style={styles.userMarkerText}>YOU ARE HERE</Text>
          </View>
        </MapboxGL.MarkerView>
      )}

    {/* #region Route Legs */}

      <>
        <MapboxGL.ShapeSource
          id="allLegs"
          shape={{
            type: "FeatureCollection",
            features: routeLegs.map((leg, index) => {
              const nonPending = venues.filter(v => !v.pending);
              const venue = nonPending[index];
              if (!venue) return null;
              return {
                type: "Feature",
                geometry: { type: "LineString", coordinates: leg.walkingCoordinates },
                properties: { index, color: LEG_COLORS[index % LEG_COLORS.length] },
              };
            }).filter(Boolean) as any,
          }}
        >
          <MapboxGL.LineLayer
            id="allLegsLine"
            style={{
              lineColor: ["get", "color"],
              lineWidth: 3,
              lineDasharray: [2, 2],
            }}
          />
        </MapboxGL.ShapeSource>

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
                    label: `Walk: ${formatDuration(leg.walkingDuration)}${leg.drivingDuration ? `\nDrive: ${formatDuration(leg.drivingDuration)}` : ""}`,
                    color: LEG_COLORS[index % LEG_COLORS.length],
                  },
                };
              }).filter(Boolean) as any,
            }}
          >
            <MapboxGL.SymbolLayer
              id="legLabelsLayer"
              aboveLayerID="allLegsLine"
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
      </>

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
          aboveLayerID="allLegsLine"
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

    {!loading && venues.length === 0 && routeOrigin && time && pace && budget && (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>
          To get started, tap Generate Itinerary below or add venues above!
        </Text>
      </View>
    )}


    {/* #region Overlays */}

    <View style={styles.overlayContainer}>

      {!gpsLocation && !locationError && (
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

      {!loading && venues.length === 0 && routeOrigin && time && pace && budget && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            To get started, tap Generate Itinerary below or add venues above!
          </Text>
        </View>
      )}

    </View>

    {/* Generate Itinerary Bottom Sheet */}

      <BottomSheet
        ref={generateSheetRef}
        index={0}
        snapPoints={["8%", "52%"]}
        backgroundStyle={{ 
          backgroundColor: "#ccc", 
          borderWidth: 2, 
          borderColor: "#aaa", 
          borderRadius: 16,
        }}
        handleStyle={{ paddingTop: 8, paddingBottom: 8 }}
        handleIndicatorStyle={{ backgroundColor: "#444" }}
      >
      <BottomSheetView style={styles.generateSheetContent}>

        {/* Peek label */}

        <TouchableOpacity
          style={styles.generateSheetPeek}
          onPress={() => generateSheetRef.current?.expand()}
        >
          <Text style={styles.generateSheetPeekLabel}>GENERATE ITINERARY</Text>
        </TouchableOpacity>

        {/* AUTO */}
        <TouchableOpacity
          style={[styles.generateOption, (!routeOrigin || loading) && styles.generateOptionDisabled]}
          onPress={handleAuto}
          disabled={!routeOrigin || loading}
        >
          <View style={styles.generateOptionLeft}>
            <Text style={styles.generateOptionTitle}>AUTO</Text>
            <Text style={styles.generateOptionMode}>All AI</Text>
          </View>
          <Text style={styles.generateOptionDesc}>
            A fully AI-powered itinerary based exclusively on your travel preferences
          </Text>
        </TouchableOpacity>

        {/* SEMI-AUTO */}
        <TouchableOpacity
          style={[styles.generateOption, (!routeOrigin || loading || venues.length === 0) && styles.generateOptionDisabled]}
          onPress={handleSemiAuto}
          disabled={!routeOrigin || loading || venues.length === 0}
        >
          <View style={styles.generateOptionLeft}>
            <Text style={styles.generateOptionTitle}>SEMI-AUTO</Text>
            <Text style={styles.generateOptionMode}>Your Input + AI</Text>
          </View>
          <Text style={styles.generateOptionDesc}>
            Incorporates your additions, removals, and locks along with your preferences
          </Text>
        </TouchableOpacity>

        {/* MANUAL */}
        <TouchableOpacity
          style={[styles.generateOption, (!routeOrigin || loading || venues.length === 0) && styles.generateOptionDisabled]}
          onPress={handleManual}
          disabled={!routeOrigin || loading || venues.length === 0}
        >
          <View style={styles.generateOptionLeft}>
            <Text style={styles.generateOptionTitle}>MANUAL</Text>
            <Text style={styles.generateOptionMode}>Your Stops Only</Text>
          </View>
          <Text style={styles.generateOptionDesc}>
            Only uses the venues you've added yourself — no AI suggestions
          </Text>
        </TouchableOpacity>

        {/* #region Options Section */}

        <View style={{ height: 1.5, backgroundColor: "#aaa", marginBottom: 6 }} />
        <View style={styles.optionsLabelContainer}>
          <Text style={styles.optionsLabel}>OPTIONS</Text>
          <View style={styles.optionsLabelUnderline} />
        </View>

        <View style={styles.optionsRow}>

          <View style={styles.optionsDaySelector}>
            <View style={styles.daySelectorBorders}>
              <DaySelector />
            </View>
          </View>

          <View style={styles.optionsToggles}>
            <TouchableOpacity
              style={styles.mapPrefRow}
              onPress={() => setWeatherEnabled(prev => !prev)}
            >
              <View style={[styles.mapPrefCircle, weatherEnabled && styles.mapPrefCircleActive]}>
                {weatherEnabled && <Ionicons name="checkmark" size={20} color="#fff" />}
              </View>
              <Text style={[styles.mapPrefLabel, weatherEnabled && styles.mapPrefLabelActive]}>
                Check local weather for AI recs
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.mapPrefRow}
              onPress={() => setEventsEnabled(prev => !prev)}
            >
              <View style={[styles.mapPrefCircle, eventsEnabled && styles.mapPrefCircleActive]}>
                {eventsEnabled && <Ionicons name="checkmark" size={20} color="#fff" />}
              </View>
              <Text style={[styles.mapPrefLabel, eventsEnabled && styles.mapPrefLabelActive]}>
                Search for relevant live events
              </Text>
            </TouchableOpacity>
          </View>

        </View>

      </BottomSheetView>
    </BottomSheet>

    {/* Venue Bottom Sheet */}
    
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
    </SafeAreaView>
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
    bottom: 50,
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
    paddingTop: 2,
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

  // #region Banners, Buttons, and Empty States

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
    position: "absolute",
    top: "50%",
    left: 20,
    right: 20,
    backgroundColor: "#fff",
    opacity: 0.93,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  emptyStateText: {
    fontSize: 16,
    color: "#888",
    fontWeight: "500",
    textAlign: "center",
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

  // #region Generate Itinerary Bottom Sheet

  generateSheetContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 0,
  },
  generateSheetPeek: {
    alignItems: "center",
    paddingBottom: 6,
  },
  generateSheetPeekLabel: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 2,
    color: "#333",
  },

  // #region Generation Modes

  generateOption: {
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: 2,
    borderColor: "#bbb",
    borderRadius: 12,
    padding: 4,
    marginBottom: 8,
    gap: 12,
    backgroundColor: "#ebebeb",
  },
  generateOptionDisabled: {
    opacity: 0.4,
  },
  generateOptionLeft: {
    width: 100,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  generateOptionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111",
    letterSpacing: 0.5,
  },
  generateOptionMode: {
    fontSize: 12,
    color: "#888",
    fontWeight: "500",
    marginTop: 2,
  },
  generateOptionDesc: {
    flex: 1,
    fontSize: 12,
    color: "#555",
    lineHeight: 17,
    alignSelf: "center",

  },

  // #endregion

  // #region Generation Options

  optionsLabelContainer: {
    alignItems: "center",
    marginTop: 2,
    marginBottom: 2,
  },
  optionsLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: "#222",
    letterSpacing: 2,
    textAlign: "center",
    textTransform: "uppercase",
  },
  optionsLabelUnderline: {
    height: 0,
    backgroundColor: "#222",
    width: "25%",
    marginTop: 1,
  },
  optionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 26,
  },
  optionsDaySelector: {
    width: "20%",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
    paddingLeft: 30,
  },
  daySelectorBorders: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#999",
    paddingVertical: 6,
    alignSelf: "center",
  },
  optionsToggles: {
    flex: 1,
    paddingLeft: 2,
  },

  mapPrefRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
  },
  mapPrefCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#b0bdb0",
    alignItems: "center",
    justifyContent: "center",
  },
  mapPrefCircleActive: {
    backgroundColor: "#2d9e5f",
  },
  mapPrefLabel: {
    fontSize: 14,
    color: "#444",
    fontWeight: "500",
    flex: 1,
  },
  mapPrefLabelActive: {
    fontWeight: "700",
    color: "#111",
  },

  // #endregion

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