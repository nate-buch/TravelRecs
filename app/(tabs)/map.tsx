import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

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
      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapText}>Map goes here</Text>

        {location ? (
          <Text style={styles.locationText}>
            📍 {location.coords.latitude.toFixed(5)}, {location.coords.longitude.toFixed(5)}
          </Text>
        ) : locationError ? (
          <Text style={styles.errorText}>{locationError}</Text>
        ) : (
          <Text style={styles.locationText}>Getting your location...</Text>
        )}

        <TouchableOpacity style={styles.testButton} onPress={openVenue}>
          <Text style={styles.testButtonText}>Tap a venue (test)</Text>
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
  container: {
    flex: 1,
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#e8e8e8",
  },
  mapText: {
    fontSize: 18,
    color: "#999",
    marginBottom: 12,
  },
  locationText: {
    fontSize: 14,
    color: "#555",
    marginBottom: 24,
  },
  errorText: {
    fontSize: 14,
    color: "red",
    marginBottom: 24,
  },
  testButton: {
    backgroundColor: "#000",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  testButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  sheetContent: {
    padding: 24,
  },
  venueName: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 8,
  },
  venueJustification: {
    fontSize: 15,
    color: "#444",
    lineHeight: 22,
    marginBottom: 16,
  },
  hoursRow: {
    flexDirection: "row",
    marginBottom: 20,
  },
  hoursLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111",
  },
  hoursValue: {
    fontSize: 14,
    color: "#555",
    flex: 1,
  },
  moreButton: {
    borderWidth: 1.5,
    borderColor: "#000",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  moreButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
});