import { router } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from "react-native-draggable-flatlist";
import { LEG_COLORS } from "../config/colors";
import { getRouteLegs } from "../config/directions";
import { useAppStore } from "../config/store";

export default function ItineraryScreen() {
  const { venues, time, pace, budget, routeLegs, setVenues, setRouteLegs, location } = useAppStore();

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
    <DraggableFlatList
      data={venues}
      keyExtractor={(item, index) => `${item.name}-${index}`}
      
      onDragEnd={async ({ data }) => {
        setVenues(data);
        if (location) {
          const legs = await getRouteLegs(
            [location.longitude, location.latitude],
            data
          );
          setRouteLegs(legs);
        }
      }}
      
      ListHeaderComponent={() => (
        <View style={styles.container}>
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
          <View style={[styles.headingDivider, { marginBottom: 4 }]} />
        </View>
      )}

      renderItem={({ item: venue, getIndex, drag, isActive }: RenderItemParams<typeof venues[0]>) => {
        const index = getIndex() ?? 0;
        const leg = routeLegs[index];
        return (
          <ScaleDecorator>
            <View>
              {leg && (
                <View style={styles.legBar}>
                  <View style={styles.legDivider} />
                  <Text style={styles.legBarText}>
                    {`Walk: ${leg.walkingDuration} min${leg.drivingDuration ? `  ·  Drive: ${leg.drivingDuration} min` : ""}`}
                  </Text>
                  <View style={styles.legDivider} />
                </View>
              )}
              <TouchableOpacity
                onLongPress={drag}
                delayLongPress={200}
                disabled={isActive}
                style={[styles.venueCard, isActive && { opacity: 0.8, backgroundColor: "#f9f9f9" }]}
              >
                <View style={styles.dragHandleContainer}>
                  <View style={[styles.venueNumber, { backgroundColor: LEG_COLORS[index % LEG_COLORS.length] }]}>
                    <Text style={styles.venueNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.dragHandle}>☰</Text>
                </View>
                <View style={styles.venueContent}>
                  <Text style={styles.venueName}>{venue.name}</Text>
                  <Text style={styles.venueAddress}>{venue.address}</Text>
                  <Text style={styles.venueJustification}>{venue.justification}</Text>
                  <Text style={styles.venueHours}>🕐 {venue.hours}</Text>
                </View>
              </TouchableOpacity>
            </View>
          </ScaleDecorator>
        );
      }}
      contentContainerStyle={{ paddingBottom: 48 }}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
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
  dragHandle: {
    fontSize: 24,
    color: "#aaa",
    marginTop: 14,
  },
  dragHandleContainer: {
    alignItems: "center",
    marginRight: 6,
  },
  venueCard: {
    flexDirection: "row",
    marginBottom: 20,
    paddingLeft: 8,
    gap: 6,
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
  legBar: {
    marginLeft: 0,
    marginBottom: 12,
    marginTop: 4,
    alignItems: "center",
  },
  legBarText: {
    fontSize: 16,
    fontWeight: "600",
    fontStyle: "italic",
    color: "#888",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginVertical: 6,
  },
  legDivider: {
    width: "50%",
    height: 1,
    backgroundColor: "#ddd",
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