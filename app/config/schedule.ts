import { Venue } from "./claude";
import { RouteLeg } from "./directions";
import { formatTime, getVenueDuration, roundToQuarter, VenueType } from "./durations";

export type TimeBlock = {
  arrivalTime: string;
  departureTime: string;
  durationMinutes: number;
};

export const calculateSchedule = (
  venues: Venue[],
  routeLegs: RouteLeg[],
  pace: string
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
      const travelMinutes = roundToQuarter(leg.walkingDuration);
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
    });
  }

  return blocks;
};