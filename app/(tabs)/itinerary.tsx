// #region Imports

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from "react-native-draggable-flatlist";
import { SearchResult, VenueSearchBar } from "../../components/VenueSearchBar";
import { Venue } from "../config/claude";
import { LEG_COLORS } from "../config/colors";
import { getDefaultMode, getRouteLegs } from "../config/directions";
import { formatTime, roundToQuarter } from "../config/durations";
import { recalculateSchedule } from "../config/schedule";
import { useAppStore } from "../config/store";

// #endregion

// #region Types and constants

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
  let h = hours;
  if (ampm === "AM" && hours === 12) h = 0;      // 12:00 AM = midnight = 0
  else if (ampm === "PM" && hours !== 12) h = hours + 12;  // 1-11 PM = 13-23
  date.setHours(h, minutes, 0, 0);
  return date;
};

// #endregion

// #region Main Component

export default function ItineraryScreen() {
  
  // #region Store
  
  const {
    venues, time, pace, budget, routeLegs,
    setVenues, setRouteLegs, setTimeBlocks,
    location, timeBlocks, legModes, setLegModes,
    pendingVenues, addRemovedVenueName,
  } = useAppStore();

  // #endregion

  // #region Venue Actions

  const toggleLock = (nonPendingIndex: number) => {
    const updated = [...timeBlocks];
    const isCurrentlyLocked = updated[nonPendingIndex].locked;
    updated[nonPendingIndex] = { ...updated[nonPendingIndex], locked: !isCurrentlyLocked };
    setTimeBlocks(updated);

    // If locking schedule, also lock the venue
    if (!isCurrentlyLocked) {
      const nonPendingVenues = venues.filter(v => !v.pending);
      const venueName = nonPendingVenues[nonPendingIndex].name;
      const newVenues = venues.map(v => v.name === venueName ? { ...v, locked: true } : v);
      setVenues(newVenues);
    }
  };

  const toggleVenueLock = (nonPendingIndex: number, venueName: string) => {
    const isCurrentlyLocked = venues.find(v => v.name === venueName)?.locked ?? false;
    
    // Toggle the venue lock by name to avoid raw index issues
    const newVenues = venues.map(v => 
      v.name === venueName ? { ...v, locked: !isCurrentlyLocked } : v
    );

    // If unlocking venue, also unlock the schedule
    if (isCurrentlyLocked && timeBlocks[nonPendingIndex]?.locked) {
      const newBlocks = [...timeBlocks];
      newBlocks[nonPendingIndex] = { ...newBlocks[nonPendingIndex], locked: false };
      setTimeBlocks(newBlocks);
    }
    setVenues(newVenues);
  };

  const removeVenue = async (venueName: string) => {
    addRemovedVenueName(venueName);
    
    const newVenues = venues.filter(v => v.name !== venueName);
    const nonPending = newVenues.filter(v => !v.pending);
    const removedNonPendingIndex = venues
      .filter(v => !v.pending)
      .findIndex(v => v.name === venueName);
    
    const newTimeBlocks = removedNonPendingIndex >= 0
      ? timeBlocks.filter((_, i) => i !== removedNonPendingIndex)
      : timeBlocks;
    const newLegModes = removedNonPendingIndex >= 0
      ? legModes.filter((_, i) => i !== removedNonPendingIndex)
      : legModes;

    setVenues(newVenues);

    if (location && nonPending.length > 0) {
      const legs = await getRouteLegs(
        [location.longitude, location.latitude],
        nonPending
      );
      setRouteLegs(legs);
      const modes = legs.map((leg, i) => newLegModes[i] ?? getDefaultMode(leg, pace));
      setLegModes(modes);
      const blocks = recalculateSchedule(nonPending, legs, newTimeBlocks, nonPending, newLegModes);
      setTimeBlocks(blocks);
    } else {
      setRouteLegs([]);
      setLegModes([]);
      setTimeBlocks([]);
    }
  };

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
  };

  // #endregion

  // #region Time Adjustment: Travel Mode Change

  const toggleLegMode = (index: number) => {
    const leg = routeLegs[index];
    if (!leg.drivingDuration) return;

    const newModes = [...legModes];
    const currentMode = newModes[index];
    const newMode = currentMode === "walking" ? "driving" : "walking";
    newModes[index] = newMode;

    const oldDuration = currentMode === "walking" ? leg.walkingDuration : (leg.drivingDuration ?? 0);
    const newDuration = newMode === "walking" ? leg.walkingDuration : (leg.drivingDuration ?? 0);
    const oldRounded = roundToQuarter(oldDuration);
    const newRounded = roundToQuarter(newDuration);
    const deltaMins = newRounded - oldRounded;

    if (deltaMins === 0) {
      setLegModes(newModes);
      return;
    }

    const blocks = [...timeBlocks];

    // #region Faster Travel Mode Selected (Walk → Drive)

    // ─────────────────────────────────────────────
    // FASTER (walk → drive, deltaMins < 0)
    // ─────────────────────────────────────────────
    if (deltaMins < 0) {

      // If there's a locked venue before index, make sure we don't
      // push the arrival earlier than locked departure + travel time
      if (index > 0) {
        const nearestLockedBefore = Array.from({ length: index }, (_, i) => i)
          .reverse()
          .find(i => blocks[i].locked);

        if (nearestLockedBefore !== undefined) {
          const lockedDep = parseTime(blocks[nearestLockedBefore].departureTime);
          const travelMins = roundToQuarter(
            newMode === "driving" && leg.drivingDuration
              ? leg.drivingDuration
              : leg.walkingDuration
          );
          const earliestAllowedArr = new Date(lockedDep.getTime() + travelMins * 60 * 1000);
          const currentArr = parseTime(blocks[index].arrivalTime);
          const proposedArr = new Date(currentArr.getTime() + deltaMins * 60 * 1000);

          if (proposedArr < earliestAllowedArr) {
            // Cap delta so we don't go earlier than locked venue allows
            const cappedDelta = Math.round((earliestAllowedArr.getTime() - currentArr.getTime()) / 60000);
            if (cappedDelta === 0) {
              setLegModes(newModes);
              return;
            }
            for (let i = index; i < blocks.length; i++) {
              if (blocks[i].locked) continue;
              const arr = parseTime(blocks[i].arrivalTime);
              const dep = parseTime(blocks[i].departureTime);
              arr.setMinutes(arr.getMinutes() + cappedDelta);
              dep.setMinutes(dep.getMinutes() + cappedDelta);
              blocks[i] = { ...blocks[i], arrivalTime: formatTime(arr), departureTime: formatTime(dep) };
            }
            setTimeBlocks(blocks);
            setLegModes(newModes);
            return;
          }
        }
      }

      // No locked constraint — shift index and all downstream earlier
      for (let i = index; i < blocks.length; i++) {
        if (blocks[i].locked) continue;
        const arr = parseTime(blocks[i].arrivalTime);
        const dep = parseTime(blocks[i].departureTime);
        arr.setMinutes(arr.getMinutes() + deltaMins);
        dep.setMinutes(dep.getMinutes() + deltaMins);
        blocks[i] = { ...blocks[i], arrivalTime: formatTime(arr), departureTime: formatTime(dep) };
      }

    // #endregion

    // #region Slower Travel Mode Selected (Drive → Walk)

    // ─────────────────────────────────────────────
    // SLOWER (drive → walk, deltaMins > 0)
    // ─────────────────────────────────────────────
    } else {

      // If there's a locked venue before index, check if new travel time
      // requires pushing arrival later than current
      if (index > 0) {
        const nearestLockedBefore = Array.from({ length: index }, (_, i) => i)
          .reverse()
          .find(i => blocks[i].locked);

        if (nearestLockedBefore !== undefined) {
          const lockedDep = parseTime(blocks[nearestLockedBefore].departureTime);
          const travelMins = roundToQuarter(
            newMode === "walking"
              ? leg.walkingDuration
              : (leg.drivingDuration ?? leg.walkingDuration)
          );
          const requiredArr = new Date(lockedDep.getTime() + travelMins * 60 * 1000);
          const currentArr = parseTime(blocks[index].arrivalTime);

          if (requiredArr > currentArr) {
            // Push index and all downstream later to respect locked venue
            const pushDelta = Math.round((requiredArr.getTime() - currentArr.getTime()) / 60000);
            for (let i = index; i < blocks.length; i++) {
              if (blocks[i].locked) continue;
              const arr = parseTime(blocks[i].arrivalTime);
              const dep = parseTime(blocks[i].departureTime);
              arr.setMinutes(arr.getMinutes() + pushDelta);
              dep.setMinutes(dep.getMinutes() + pushDelta);
              blocks[i] = { ...blocks[i], arrivalTime: formatTime(arr), departureTime: formatTime(dep) };
            }
            setTimeBlocks(blocks);
            setLegModes(newModes);
            return;
          }
        }
      }

      // If preceding venue is unlocked and gap is now too small for new travel time,
      // pull its departure earlier to make room
      if (index > 0 && !blocks[index - 1].locked) {
        const prevDep = parseTime(blocks[index - 1].departureTime);
        const currArr = parseTime(blocks[index].arrivalTime);
        const travelMins = roundToQuarter(
          newMode === "driving" && leg.drivingDuration
            ? leg.drivingDuration
            : leg.walkingDuration
        );
        const currentGap = (currArr.getTime() - prevDep.getTime()) / 60000;

        if (currentGap < travelMins) {
          const shortfall = travelMins - currentGap;
          const newDuration = blocks[index - 1].durationMinutes - shortfall;
          if (newDuration >= 15) {
            const dep = parseTime(blocks[index - 1].departureTime);
            dep.setMinutes(dep.getMinutes() - shortfall);
            blocks[index - 1] = {
              ...blocks[index - 1],
              departureTime: formatTime(dep),
              durationMinutes: newDuration,
            };
          }
        }
      }

      // Shift the destination venue itself later (fixes index === 0 case too)
      if (!blocks[index].locked) {
        const arr = parseTime(blocks[index].arrivalTime);
        const dep = parseTime(blocks[index].departureTime);
        arr.setMinutes(arr.getMinutes() + deltaMins);
        dep.setMinutes(dep.getMinutes() + deltaMins);
        blocks[index] = { ...blocks[index], arrivalTime: formatTime(arr), departureTime: formatTime(dep) };
      }

      // Cascade full delta to all downstream venues
      for (let i = index + 1; i < blocks.length; i++) {
        if (blocks[i].locked) continue;
        const arr = parseTime(blocks[i].arrivalTime);
        const dep = parseTime(blocks[i].departureTime);
        arr.setMinutes(arr.getMinutes() + deltaMins);
        dep.setMinutes(dep.getMinutes() + deltaMins);
        blocks[i] = { ...blocks[i], arrivalTime: formatTime(arr), departureTime: formatTime(dep) };
      }
    }

    // #endregion

    setTimeBlocks(blocks);
    setLegModes(newModes);
  };

  // #endregion

  // #region Time Adjustment: Scheduling Change

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
            
            const travelMins = routeLegs[index] 
              ? roundToQuarter(
                  legModes[index] === "driving" && routeLegs[index].drivingDuration
                    ? routeLegs[index].drivingDuration
                    : routeLegs[index].walkingDuration
                )
              : 0;

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

          // Find the nearest locked venue before this index
          const nearestLockedIndex = Array.from({ length: index }, (_, i) => i)
            .reverse()
            .find(i => timeBlocks[i].locked);

          // Only squeeze venues after the nearest locked one
          const precedingIndices = Array.from({ length: index }, (_, i) => i)
            .filter(i => !timeBlocks[i].locked)
            .filter(i => nearestLockedIndex === undefined || i > nearestLockedIndex)
            .sort((a, b) => blocks[b].durationMinutes - blocks[a].durationMinutes);

          // Only count venues after the nearest locked one:
          const startIndex = nearestLockedIndex !== undefined ? nearestLockedIndex + 1 : 0;

          const minTime = routeLegs.slice(startIndex, index).reduce((sum, leg, i) => {
            const legIndex = startIndex + i;
            const mode = legModes[legIndex];
            const duration = mode === "driving" && leg.drivingDuration 
              ? leg.drivingDuration 
              : leg.walkingDuration;
            return sum + roundToQuarter(duration);
          }, 0) + ((index - startIndex) * 15);

          const currentTime = routeLegs.slice(startIndex, index).reduce((sum, leg, i) => {
            const legIndex = startIndex + i;
            const mode = legModes[legIndex];
            const duration = mode === "driving" && leg.drivingDuration
              ? leg.drivingDuration
              : leg.walkingDuration;
            return sum + roundToQuarter(duration) + blocks[startIndex + i].durationMinutes;
          }, 0);

          if (currentTime - minutesToRecover < minTime) {
            alert(nearestLockedIndex !== undefined 
              ? `Can't move earlier — up against the locked departure time of ${venues[nearestLockedIndex].name}.`
              : "Not enough time to move this arrival earlier. Try removing a stop or reordering the route."
            );
            return;
          }

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

      // Find the nearest locked venue after this index
      const nearestLockedAhead = Array.from(
        { length: blocks.length - index - 1 }, 
        (_, i) => index + 1 + i
      ).find(i => blocks[i].locked);

      if (nearestLockedAhead !== undefined) {
        // Check if cascade would push past the locked venue
        const lockedArr = parseTime(blocks[nearestLockedAhead].arrivalTime);
        const newDep = parseTime(blocks[index].departureTime);
        
        const travelMins = routeLegs[nearestLockedAhead] 
          ? roundToQuarter(
              legModes[nearestLockedAhead] === "driving" && routeLegs[nearestLockedAhead].drivingDuration
                ? routeLegs[nearestLockedAhead].drivingDuration
                : routeLegs[nearestLockedAhead].walkingDuration
            )
          : 0;
        
          const latestAllowedDep = new Date(lockedArr.getTime() - travelMins * 60 * 1000);
        
        if (newDep > latestAllowedDep) {
          alert(`Can't extend further — up against the locked arrival time of ${venues[nearestLockedAhead].name}.`);
          return;
        }
      }

      for (let i = index + 1; i < blocks.length; i++) {
        if (blocks[i].locked) continue;
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

  // #endregion

  // #region Empty State

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

  // #endregion

  // #region Rendering

  return (
    <DraggableFlatList
      data={venues}
      keyExtractor={(item, index) => `${item.name}-${index}`}
      
      onDragEnd={async ({ data, from, to }) => {
        // The dragged venue is at the `to` index in the new array
        const draggedVenue = data[to];

        // Only mark as placed if it was a pending venue deliberately moved
        const updated = draggedVenue?.pending
          ? data.map(v => v.name === draggedVenue.name ? { ...v, pending: false } : v)
          : data;

        setVenues(updated);

        // Derive nonPending from the fully updated array
        const nonPending = updated.filter(v => !v.pending);

        if (location && nonPending.length > 0) {
          const legs = await getRouteLegs(
            [location.longitude, location.latitude],
            nonPending
          );
          setRouteLegs(legs);
          const newModes = legs.map((leg) => getDefaultMode(leg, pace));
          setLegModes(newModes);
          const blocks = recalculateSchedule(nonPending, legs, timeBlocks, nonPending, legModes);
          setTimeBlocks(blocks);
        }
        
      }}
      
      // #region Itinerary Preference Header

      ListHeaderComponent={() => (
        <View style={styles.container}>
          <Text style={styles.heading}>YOUR ITINERARY</Text>
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
          <View style={styles.sectionDivider} />
            <VenueSearchBar
              cameraCenter={null}
              onSelect={handleSearchSelect}
              placeholder="Search for a venue to add..."
            />
        </View>
      )}

      // #endregion

      // #region Render Each Venue

      renderItem={({ item: venue, getIndex, drag, isActive }: RenderItemParams<typeof venues[0]>) => {
        const index = getIndex() ?? 0;
        
        if (venue.pending) {
          return (
            <ScaleDecorator>
              <TouchableOpacity
                onLongPress={drag}
                delayLongPress={200}
                disabled={isActive}
                style={[styles.venueCard, isActive && { opacity: 0.8 }]}
              >
                <View style={styles.dragHandleContainer}>
                  <View style={styles.pendingMarker}>
                    <Text style={styles.pendingMarkerText}>?</Text>
                  </View>
                  <Text style={styles.dragHandle}>☰</Text>
                </View>
                <View style={styles.venueContent}>
                  <Text style={styles.pendingVenueName}>{venue.name}</Text>
                  <Text style={styles.venueAddress}>{venue.address}</Text>
                  <Text style={styles.pendingHint}>
                    Long-press and drag into position to add to your route!
                  </Text>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => {
                      addRemovedVenueName(venue.name);
                      setVenues(venues.filter(v => v.name !== venue.name));
                    }}
                  >
                    <Ionicons name="remove-circle" size={14} color="#7b241c" />
                    <Text style={styles.removeButtonText}>REMOVE</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </ScaleDecorator>
          );
        }          
        
        const displayIndex = venues
          .filter(v => !v.pending)
          .findIndex(v => v.name === venue.name);
        const nonPendingIndex = venues
          .filter(v => !v.pending)
          .findIndex(v => v.name === venue.name);
        const leg = routeLegs[nonPendingIndex];

        console.log("renderItem", venue.name, "index:", index, "nonPendingIndex:", nonPendingIndex, "timeBlocks length:", timeBlocks.length, "pending:", venue.pending);

        
        return (
          <ScaleDecorator>
            <View>

          {/* #region ROUTE LEGS */}

            {leg && (
              <View style={styles.legBar}>
                <View style={styles.legDivider} />
                <View style={styles.legModeRow}>
                  <TouchableOpacity
                    onPress={() => toggleLegMode(nonPendingIndex)}
                    style={[
                      styles.legModeOption,
                      legModes[nonPendingIndex] === "walking" && styles.legModeSelected,
                    ]}
                  >
                    <Text style={[
                      styles.legBarText,
                      legModes[nonPendingIndex] === "walking" && styles.legBarTextSelected,
                    ]}>
                      {`Walk: ${leg.walkingDuration} min`}
                    </Text>
                  </TouchableOpacity>

                  {leg.drivingDuration && (
                    <TouchableOpacity
                      onPress={() => toggleLegMode(nonPendingIndex)}
                      style={[
                        styles.legModeOption,
                        legModes[nonPendingIndex] === "driving" && styles.legModeSelected,
                      ]}
                    >
                      <Text style={[
                        styles.legBarText,
                        legModes[nonPendingIndex] === "driving" && styles.legBarTextSelected,
                      ]}>
                        {`Drive: ${leg.drivingDuration} min`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.legDivider} />
              </View>
            )}

          {/* #endregion */}            

            {/* #region VENUE CARD */}

              <TouchableOpacity
                onLongPress={drag}
                delayLongPress={200}
                disabled={isActive}
                style={[styles.venueCard, isActive && { opacity: 0.8, backgroundColor: "#f9f9f9" }]}
              >
                <View style={styles.dragHandleContainer}>
                  <View style={[styles.venueNumber, { backgroundColor: LEG_COLORS[displayIndex % LEG_COLORS.length] }]}>
                    <Text style={styles.venueNumberText}>{displayIndex + 1}</Text>
                  </View>
                  <Text style={styles.dragHandle}>☰</Text>
                </View>

                <View style={styles.venueContent}>

                  <View style={styles.venueNameRow}>
                    <TouchableOpacity onPress={() => toggleVenueLock(nonPendingIndex, venue.name)}>
                      <View style={[styles.venueLockCircle, venue.locked && styles.venueLockCircleActive]}>
                        <Ionicons name={venue.locked ? "lock-closed" : "lock-open"} size={16} color="#fff" />
                      </View>
                    </TouchableOpacity>
                    <Text style={styles.venueName}>{venue.name}</Text>
                  </View>           
                  
                  <Text style={styles.venueAddress}>{venue.address}</Text>
                  <Text style={styles.venueJustification}>{venue.justification}</Text>
                  <Text style={styles.venueHours}>🕐 {venue.hours}</Text>
                  
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeVenue(venue.name)}
                  >
                    <Ionicons name="remove-circle" size={14} color="#7b241c" />
                    <Text style={styles.removeButtonText}>REMOVE</Text>
                  </TouchableOpacity>                  
                </View>

            {/* #endregion */}

              {/* #region TIME BLOCKS */}

                {timeBlocks[nonPendingIndex] && (

                  <View style={styles.timeBlock}>
                    
                  {/* #region Schedule Lock */}
                    <TouchableOpacity 
                      onPress={(e) => {
                        e.stopPropagation(); 
                        toggleLock(index); 
                      }}
                      style={styles.lockButton}>
                      <View style={[styles.lockCircle, timeBlocks[nonPendingIndex].locked && styles.lockCircleActive]}>
                        <Ionicons 
                          name={timeBlocks[nonPendingIndex].locked ? "lock-closed" : "lock-open"} 
                          size={16} 
                          color="#fff"
                        />
                      </View>
                    </TouchableOpacity>
                  {/* #endregion */}

                  {/* #region Arrival Time */}
                    <View style={styles.timeBlockTimeContainer}>
                      <TouchableOpacity onPress={() => applyTimeChange(nonPendingIndex, "arrival", parseTime(timeBlocks[nonPendingIndex].arrivalTime), -1)}>
                        <Text style={styles.timeChevron}>◀</Text>
                      </TouchableOpacity>
                      <View style={{ alignItems: "center", width: 44 }}>
                        <Text style={[styles.timeBlockTime, timeBlocks[nonPendingIndex].locked && styles.timeBlockTimeLocked]}>
                          {timeBlocks[nonPendingIndex].arrivalTime.split(' ')[0]}
                        </Text>
                        <Text style={[styles.timeBlockAmPm, timeBlocks[nonPendingIndex].locked && styles.timeBlockTimeLocked]}>
                          {timeBlocks[nonPendingIndex].arrivalTime.split(' ')[1]}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => applyTimeChange(nonPendingIndex, "arrival", parseTime(timeBlocks[nonPendingIndex].arrivalTime), 1)}>
                        <Text style={styles.timeChevron}>▶</Text>
                      </TouchableOpacity>
                    </View>
                  {/* #endregion */}

                  {/* #region Departure Time */}
                    <View style={[styles.timeBlockTimeContainer, { marginBottom: 3 }]}>
                      <TouchableOpacity onPress={() => applyTimeChange(nonPendingIndex, "departure", parseTime(timeBlocks[nonPendingIndex].departureTime), -1)}>
                        <Text style={styles.timeChevron}>◀</Text>
                      </TouchableOpacity>
                      <View style={{ alignItems: "center", width: 44 }}>
                        <Text style={[styles.timeBlockTime, timeBlocks[nonPendingIndex].locked && styles.timeBlockTimeLocked]}>
                          {timeBlocks[nonPendingIndex].departureTime.split(' ')[0]}
                        </Text>
                        <Text style={[styles.timeBlockAmPm, timeBlocks[nonPendingIndex].locked && styles.timeBlockTimeLocked]}>
                          {timeBlocks[nonPendingIndex].departureTime.split(' ')[1]}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => applyTimeChange(nonPendingIndex, "departure", parseTime(timeBlocks[nonPendingIndex].departureTime), 1)}>
                        <Text style={styles.timeChevron}>▶</Text>
                      </TouchableOpacity>
                    </View>
                  {/* #endregion */}

                  {/* #region Duration */}
                    <Text style={[styles.timeBlockDuration, timeBlocks[nonPendingIndex].locked && { color: "#2d9e5f", fontWeight: "900" }]}>
                      {formatDuration(timeBlocks[nonPendingIndex].durationMinutes)}
                    </Text>
                  {/* #endregion */}

                  </View>
                )}

              {/* #endregion */}

              </TouchableOpacity>

            </View>
          </ScaleDecorator>
        );
      }}

      // #endregion

      contentContainerStyle={{ paddingBottom: 48 }}
    />
  );

  // #endregion
  
}

// #endregion

// #region Styles

const styles = StyleSheet.create({

  // #region General Layout

  container: {
    padding: 12,
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

  // #endregion

  // #region Preferences Header

  heading: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    letterSpacing: 2,
    marginBottom: 6,
  },
  sectionDivider: {
    height: 3,
    backgroundColor: "#ddd",
    marginBottom: 12,
    marginTop: 8,
  },
  prefsRow: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "flex-start",
    marginBottom: 4,
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
    marginBottom: 2,
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

  // #endregion

  // #region Staging Card

  stagingCard: {
    flexDirection: "row",
    marginBottom: 20,
    paddingLeft: 8,
    paddingRight: 8,
    gap: 4,
    opacity: 0.85,
  },
  pendingMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#888888",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
    flexShrink: 0,
  },
  pendingMarkerText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  pendingVenueName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#888888",
    flex: 1,
    marginBottom: 2,
  },
  pendingHint: {
    fontSize: 13,
    color: "#888",
    fontStyle: "italic",
    marginTop: 4,
    marginBottom: 4,
  },
  pendingSectionDivider: {
    height: 2,
    backgroundColor: "#ddd",
    marginBottom: 16,
    marginHorizontal: 8,
  },

  // #endregion

  // #region Venue Info

  dragHandle: {
    fontSize: 24,
    color: "#aaa",
    marginTop: 20,
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

  venueNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
    gap: 6,
  },
  venueName: {
    fontSize: 17,
    fontWeight: "700",
    flex: 1,
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
  venueAddress: {
    fontSize: 13,
    color: "#888",
    marginBottom: 6,
  },
  venueJustification: {
    fontSize: 14,
    color: "#444",
    lineHeight: 20,
    marginBottom: 3,
  },
  venueHours: {
    fontSize: 13,
    color: "#666",
  },

  removeButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#7b241c",
    borderRadius: 20,
    paddingHorizontal: 5,
    paddingVertical: 3,
    marginTop: 6,
    gap: 3,
  },
  removeButtonText: {
    color: "#7b241c",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
  },

  // #endregion

  // #region Time Block

  timeBlock: {
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 8,
    paddingRight: 6,
    paddingTop: 8,
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
    timeBlockTimeLocked: {
    color: "#2d9e5f",
    fontWeight: "900",
  },

  // #endregion

  // #region Venue & Schedule Lock

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

  // #endregion

  // #region Leg Mode Bar

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
    marginVertical: 1,
  },
  legDivider: {
    width: "75%",
    height: 1,
    backgroundColor: "#ddd",
  },
  legModeRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  legModeOption: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  legModeSelected: {
    borderColor: "#888",
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  legBarTextSelected: {
    color: "#333",
    fontWeight: "700",
  },

  // #endregion

  // #region Regeneration Button

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

  // #endregion

});

// #endregion