// #region Imports

import { Venue } from "./claude";
import { RouteLeg } from "./directions";
import { formatTime, getVenueDuration, roundToQuarter, VenueType } from "./durations";

// #endregion

// #region Types and Constants

export type TimeBlock = {
  arrivalTime: string;
  departureTime: string;
  durationMinutes: number;
  locked: boolean;
};

// #endregion

// #region Utilities

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

// #region Schedule Calculation API

export const calculateSchedule = (
  venues: Venue[],
  routeLegs: RouteLeg[],
  pace: string,
  legModes?: ("walking" | "driving")[]
): TimeBlock[] => {
  const now = new Date();
  // Round current time to nearest 15 min
  const roundedMinutes = roundToQuarter(now.getMinutes());
  now.setMinutes(roundedMinutes, 0, 0);

  const blocks: TimeBlock[] = [];
  let cursor = new Date(now);

  for (let i = 0; i < venues.length; i++) {
    const leg = routeLegs[i];
    const venue = venues[i];

    // Add travel time from previous location
    if (leg) {
    const mode = legModes?.[i] ?? "walking";
    const rawDuration = mode === "driving" && leg.drivingDuration 
        ? leg.drivingDuration 
        : leg.walkingDuration;
    const travelMinutes = roundToQuarter(rawDuration);
    cursor = new Date(cursor.getTime() + travelMinutes * 60 * 1000);
    }

    const arrival = new Date(cursor);

    // Get venue duration based on type and pace
    const duration = getVenueDuration(
      (venue.venueType as VenueType) ?? "attraction_landmark",
      pace
    );

    cursor = new Date(cursor.getTime() + duration * 60 * 1000);
    const departure = new Date(cursor);

    blocks.push({
      arrivalTime: formatTime(arrival),
      departureTime: formatTime(departure),
      durationMinutes: duration,
      locked: false,
    });
  }

  return blocks;
};

// #endregion

// #region Schedule Recalculation API

export const recalculateSchedule = (
  venues: Venue[],
  routeLegs: RouteLeg[],
  existingBlocks: TimeBlock[],
  existingVenues: Venue[],
  legModes?: ("walking" | "driving")[]
): TimeBlock[] => {
  const now = new Date();
  const roundedMinutes = roundToQuarter(now.getMinutes());
  now.setMinutes(roundedMinutes, 0, 0);

  const blocks: TimeBlock[] = [];
  let cursor = new Date(now);

  for (let i = 0; i < venues.length; i++) {
    const leg = routeLegs[i];
    const existingIndex = existingVenues.findIndex(v => v.name === venues[i].name);
    const existingBlock = existingIndex >= 0 ? existingBlocks[existingIndex] : undefined;
    const isLocked = existingBlock?.locked ?? false;

    if (isLocked && existingBlock) {
      // Locked venue — use its exact times, update cursor to its departure
      blocks.push({
        arrivalTime: existingBlock.arrivalTime,
        departureTime: existingBlock.departureTime,
        durationMinutes: existingBlock.durationMinutes,
        locked: true,
      });
      cursor = parseTime(existingBlock.departureTime);
      continue;
    }

    if (leg) {
    const mode = legModes?.[i] ?? "walking";
    const rawDuration = mode === "driving" && leg.drivingDuration 
        ? leg.drivingDuration 
        : leg.walkingDuration;
    const travelMinutes = roundToQuarter(rawDuration);
    cursor = new Date(cursor.getTime() + travelMinutes * 60 * 1000);
    }

    const arrival = new Date(cursor);
    const duration = existingBlock?.durationMinutes ?? 30;
    cursor = new Date(cursor.getTime() + duration * 60 * 1000);
    const departure = new Date(cursor);

    blocks.push({
      arrivalTime: formatTime(arrival),
      departureTime: formatTime(departure),
      durationMinutes: duration,
      locked: false,
    });
  }

  return blocks;
};

// #endregion