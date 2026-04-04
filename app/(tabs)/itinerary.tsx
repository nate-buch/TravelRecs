import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from "react-native-draggable-flatlist";
import { LEG_COLORS } from "../config/colors";
import { getRouteLegs } from "../config/directions";
import { formatTime, roundToQuarter } from "../config/durations";
import { recalculateSchedule } from "../config/schedule";
import { useAppStore } from "../config/store";

const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `~${minutes}min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `~${hrs}hr ${mins}min` : `~${hrs}hr`;
};

const parseTime = (timeStr: string): Date => {
  const [time, ampm] = timeStr.split(" ");
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(ampm === "PM" && hours !== 12 ? hours + 12 : hours === 12 && ampm === "AM" ? 0 : hours);
  date.setMinutes(minutes, 0, 0);
  return date;
};

export default function ItineraryScreen() {
  const { venues, time, pace, budget, routeLegs, setVenues, setRouteLegs, setTimeBlocks, location, timeBlocks } = useAppStore();

  const toggleLock = (index: number) => {
    const updated = [...timeBlocks];
    updated[index] = { ...updated[index], locked: !updated[index].locked };
    setTimeBlocks(updated);
  };

  const applyTimeChange = (index: number, mode: "arrival" | "departure", currentDate: Date, direction: number) => {
    if (timeBlocks[index].locked) {
      const updated = [...timeBlocks];
      updated[index] = { ...updated[index], locked: false };
      setTimeBlocks(updated);
      return;
    }
    
    const newDate = new Date(currentDate.getTime() + direction * 15 * 60 * 1000);
    const blocks = [...timeBlocks];
    const deltaMins = direction * 15;

  if (mode === "arrival") {
      if (direction === 1) {
        // Moving arrival later — simple forward cascade
        for (let i = index; i < blocks.length; i++) {
          if (i > index && timeBlocks[i].locked) continue;
          const arr = parseTime(blocks[i].arrivalTime);
          const dep = parseTime(blocks[i].departureTime);
          arr.setMinutes(arr.getMinutes() + deltaMins);
          dep.setMinutes(dep.getMinutes() + deltaMins);
          blocks[i] = {
            ...blocks[i],
            arrivalTime: formatTime(arr),
            departureTime: formatTime(dep),
          };
        }
      } else {
        // Moving arrival earlier — squeeze preceding venues
        if (index === 0) {
          // First venue — just shift everything earlier
          for (let i = 0; i < blocks.length; i++) {
            if (i > index && timeBlocks[i].locked) continue;
            const arr = parseTime(blocks[i].arrivalTime);
            const dep = parseTime(blocks[i].departureTime);
            arr.setMinutes(arr.getMinutes() + deltaMins);
            dep.setMinutes(dep.getMinutes() + deltaMins);
            blocks[i] = {
              ...blocks[i],
              arrivalTime: formatTime(arr),
              departureTime: formatTime(dep),
            };
          }
        } else {
          // Check if there's already enough buffer — no squeezing needed
          if (index > 0) {
            const prevDep = parseTime(blocks[index - 1].departureTime);
            const targetArr = new Date(currentDate.getTime() + deltaMins * 60 * 1000);
            const travelMins = routeLegs[index] ? roundToQuarter(routeLegs[index].walkingDuration) : 0;
            const bufferMins = (targetArr.getTime() - prevDep.getTime()) / 60000;

            if (bufferMins >= travelMins) {
              // Plenty of buffer — shift this venue and everything downstream earlier
              for (let i = index; i < blocks.length; i++) {
                if (i > index && timeBlocks[i].locked) continue;
                const arr = parseTime(blocks[i].arrivalTime);
                const dep = parseTime(blocks[i].departureTime);
                arr.setMinutes(arr.getMinutes() + deltaMins);
                dep.setMinutes(dep.getMinutes() + deltaMins);
                blocks[i] = {
                  ...blocks[i],
                  arrivalTime: formatTime(arr),
                  departureTime: formatTime(dep),
                };
              }
              setTimeBlocks(blocks);
              return;
            }
          }

          // No buffer — need to squeeze preceding venues
          let minutesToRecover = Math.abs(deltaMins);

          const minTime = routeLegs.slice(0, index).reduce((sum, leg) => {
            return sum + roundToQuarter(leg.walkingDuration);
          }, 0) + (index * 15);

          const currentTime = routeLegs.slice(0, index).reduce((sum, leg, i) => {
            return sum + roundToQuarter(leg.walkingDuration) + blocks[i].durationMinutes;
          }, 0);

          if (currentTime - minutesToRecover < minTime) {
            alert("Not enough time to move this arrival earlier. Try removing a stop or reordering the route.");
            return;
          }

          // Squeeze preceding venues starting with longest duration — skip locked ones
          const precedingIndices = Array.from({ length: index }, (_, i) => i)
            .filter(i => !timeBlocks[i].locked)
            .sort((a, b) => blocks[b].durationMinutes - blocks[a].durationMinutes);

          for (const i of precedingIndices) {
            if (minutesToRecover <= 0) break;
            const minDuration = 15;
            const available = blocks[i].durationMinutes - minDuration;
            const squeeze = Math.min(available, minutesToRecover);
            if (squeeze > 0) {
              const dep = parseTime(blocks[i].departureTime);
              dep.setMinutes(dep.getMinutes() - squeeze);
              blocks[i] = {
                ...blocks[i],
                departureTime: formatTime(dep),
                durationMinutes: blocks[i].durationMinutes - squeeze,
              };
              minutesToRecover -= squeeze;
            }
          }

          const desiredArrival = new Date(currentDate.getTime() + deltaMins * 60 * 1000);
          const startTime = parseTime(blocks[0].arrivalTime);
          let cursor = new Date(startTime);
          for (let i = 0; i < blocks.length; i++) {
            if (timeBlocks[i].locked && i !== index) {
              // Keep locked venue times, just update cursor
              cursor = parseTime(blocks[i].departureTime);
              continue;
            }
            if (i === index) {
              const arrival = new Date(desiredArrival);
              cursor = new Date(desiredArrival);
              cursor.setMinutes(cursor.getMinutes() + blocks[i].durationMinutes);
              const departure = new Date(cursor);
              blocks[i] = {
                ...blocks[i],
                arrivalTime: formatTime(arrival),
                departureTime: formatTime(departure),
              };
            } else {
              if (i > 0) {
                const leg = routeLegs[i];
                if (leg) cursor.setMinutes(cursor.getMinutes() + roundToQuarter(leg.walkingDuration));
              }
              const arrival = new Date(cursor);
              cursor.setMinutes(cursor.getMinutes() + blocks[i].durationMinutes);
              const departure = new Date(cursor);
              blocks[i] = {
                ...blocks[i],
                arrivalTime: formatTime(arrival),
                departureTime: formatTime(departure),
              };
            }
          }
        }
      }
    } else {
      // Departure changed — update duration, shift everything downstream
      const arr = parseTime(blocks[index].arrivalTime);
      const newDep = new Date(parseTime(blocks[index].departureTime).getTime() + deltaMins * 60 * 1000);
      const newDuration = (newDep.getTime() - arr.getTime()) / 60000;
      if (newDuration < 15) return;
      blocks[index] = {
        ...blocks[index],
        departureTime: formatTime(newDep),
        durationMinutes: newDuration,
      };
      for (let i = index + 1; i < blocks.length; i++) {
        if (timeBlocks[i].locked) continue;
        const arr = parseTime(blocks[i].arrivalTime);
        const dep = parseTime(blocks[i].departureTime);
        arr.setMinutes(arr.getMinutes() + deltaMins);
        dep.setMinutes(dep.getMinutes() + deltaMins);
        blocks[i] = {
          ...blocks[i],
          arrivalTime: formatTime(arr),
          departureTime: formatTime(dep),
        };
      }
    }
    setTimeBlocks(blocks);
  };

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
          const blocks = recalculateSchedule(data, legs, timeBlocks, venues);
          setTimeBlocks(blocks);
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

                {timeBlocks[index] && (
                  <View style={styles.timeBlock}>
                    <TouchableOpacity 
                      onPress={(e) => {
                        e.stopPropagation(); 
                        toggleLock(index); 
                      }}
                      style={styles.lockButton}>
                      <View style={[styles.lockCircle, timeBlocks[index].locked && styles.lockCircleActive]}>
                        <Ionicons 
                          name={timeBlocks[index].locked ? "lock-closed" : "lock-open"} 
                          size={16} 
                          color="#fff"
                        />
                      </View>
                    </TouchableOpacity>

                    <View style={styles.timeBlockTimeContainer}>
                      <TouchableOpacity onPress={() => applyTimeChange(index, "arrival", parseTime(timeBlocks[index].arrivalTime), -1)}>
                        <Text style={styles.timeChevron}>◀</Text>
                      </TouchableOpacity>
                      <View style={{ alignItems: "center", width: 44 }}>
                        <Text style={[styles.timeBlockTime, timeBlocks[index].locked && styles.timeBlockTimeLocked]}>
                          {timeBlocks[index].arrivalTime.split(' ')[0]}
                        </Text>
                        <Text style={[styles.timeBlockAmPm, timeBlocks[index].locked && styles.timeBlockTimeLocked]}>
                          {timeBlocks[index].arrivalTime.split(' ')[1]}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => applyTimeChange(index, "arrival", parseTime(timeBlocks[index].arrivalTime), 1)}>
                        <Text style={styles.timeChevron}>▶</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={[styles.timeBlockTimeContainer, { marginBottom: 3 }]}>
                      <TouchableOpacity onPress={() => applyTimeChange(index, "departure", parseTime(timeBlocks[index].departureTime), -1)}>
                        <Text style={styles.timeChevron}>◀</Text>
                      </TouchableOpacity>
                      <View style={{ alignItems: "center", width: 44 }}>
                        <Text style={[styles.timeBlockTime, timeBlocks[index].locked && styles.timeBlockTimeLocked]}>
                          {timeBlocks[index].departureTime.split(' ')[0]}
                        </Text>
                        <Text style={[styles.timeBlockAmPm, timeBlocks[index].locked && styles.timeBlockTimeLocked]}>
                          {timeBlocks[index].departureTime.split(' ')[1]}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => applyTimeChange(index, "departure", parseTime(timeBlocks[index].departureTime), 1)}>
                        <Text style={styles.timeChevron}>▶</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={[styles.timeBlockDuration, timeBlocks[index].locked && { color: "#2d9e5f", fontWeight: "900" }]}>
                      {formatDuration(timeBlocks[index].durationMinutes)}
                    </Text>
                  </View>
                )}
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
    paddingRight: 8,
    gap: 4,
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
  venueTimeBlock: {
  fontSize: 13,
  fontWeight: "600",
  color: "#333",
  marginTop: 4,
  },
  timeBlock: {
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 8,
    paddingRight: 6,
    paddingTop: 24,
    width: 95,
  },
  timeBlockTimeContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingVertical: 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e0e0e0",
    marginBottom: 6,
    justifyContent: "center",
    gap: 2,
  },
  timeBlockTime: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
  },
  timeBlockDuration: {
    fontSize: 14,
    color: "#555",
    fontStyle: "italic",
  },
  timeChevron: {
    fontSize: 18,
    fontWeight: "600",
    color: "#444",
    paddingHorizontal: 1,
  },
  timeBlockAmPm: {
    fontSize: 10,
    fontWeight: "500",
    color: "#555",
    textAlign: "center",
  },
  lockButton: {
  marginBottom: 4,
  },
  lockCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#b0bdb0",
    alignItems: "center",
    justifyContent: "center",
  },
  lockCircleActive: {
    backgroundColor: "#2d9e5f",
  },
  lockIcon: {
    fontSize: 12,
  },
  timeBlockTimeLocked: {
    color: "#2d9e5f",
    fontWeight: "900",
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