// #region Imports

import { haversineDistance, parseTime } from "../../shared/utilities";
import { VenueType } from "../../shared/venueTypeMapping";
import { Venue } from "./claude";
import { getVenueDuration } from "./durations";
import { resolveDay } from "./places";

// #endregion

// #region Constants

// Annealing parameters
const INITIAL_TEMPERATURE = 20;
const COOLING_RATE        = 0.8;
const MIN_TEMPERATURE     = 1;
const ITERATIONS_PER_TEMP = 3;

// Travel estimation
const HAVERSINE_CORRECTION = 1.4;  // crow-flies to practical distance
const WALKING_SPEED_MPH    = 3;
const DRIVING_SPEED_MPH    = 12;

// Target stop counts by pace
const TARGET_STOPS: Record<string, number> = {
  easy:    4,
  typical: 5,
  hustle:  7,
};

// Gap penalty grid — indexed by [paceBucket][gapBucket]
// Gap buckets: 0 = <15min, 1 = 15-30min, 2 = 30-60min, 3 = >60min
// Pace buckets: easy, typical, hustle
const GAP_PENALTIES: Record<string, number[]> = {
  easy:    [0, 0,   1,  3],
  typical: [0, 1,   3,  6],
  hustle:  [1, 3,   6, 10],
};

// Venue stretch limits by pace — [defaultPace, stretchToPace]
// Stretch target is the next adjacent pace's duration for that venue type,
// or an additional hustle duration added on to easy's duration
const STRETCH_PACE: Record<string, { mode: "replace" | "add"; pace: string }> = {
  hustle:  { mode: "replace", pace: "typical" },
  typical: { mode: "replace", pace: "easy" },
  easy:    { mode: "add",     pace: "hustle" },
};

// Travel window defaults
export const DEFAULT_START_TIME = "7:00 AM";
export const DEFAULT_END_TIME   = "11:00 PM";

const VENUE_TIME_WINDOWS_NUMERIC: Record<string, { start: number; end: number }> = {
  coffee_shop:         { start: 6,  end: 15 },  // 6AM - 3PM
  restaurant:          { start: 7,  end: 23 },  // 7AM - 11PM (misses breakfast typing issue — known)
  bar:                 { start: 16, end: 2  },  // 4PM - 2AM
  street_food:         { start: 6,  end: 2  },  // anytime open
  brewery:             { start: 11, end: 23 },  // 11AM - 11PM
  cultural_heritage:   { start: 7,  end: 22 },  // 6AM - 10PM
  attraction_landmark: { start: 7,  end: 22 },  // 6AM - 10PM
  museum:              { start: 7,  end: 18 },  // 6AM - 6PM
  art_gallery:         { start: 7,  end: 18 },  // 6AM - 6PM
  performing_arts:     { start: 7,  end: 23 },  // 6AM - 11PM
  live_music:          { start: 10, end: 2  },  // anytime open
  nightclub:           { start: 20, end: 2  },  // 8PM - 2AM
  market:              { start: 6,  end: 22 },  // 6AM - 10PM
  park_viewpoint:      { start: 6,  end: 20 },  // 6AM - 8PM
};

// Anchor count matrix — pace × available day length
const ANCHOR_COUNTS: Record<string, number[]> = {
  //              <4hrs  4-8hrs  8hrs+
  easy:          [1,     2,      2],
  typical:       [1,     2,      2],
  hustle:        [2,     2,      3],
};

const DEPTH_RANGES: Record<string, { min: number; max: number }> = {
  sightsee: { min: 0.8, max: 1.0 },
  explore:  { min: 0.5, max: 0.8 },
  go_local: { min: 0.2, max: 0.5 },
};

const DEPTH_PRIORITY = ["sightsee", "explore", "go_local"];

// #endregion

// #region Utilities

const getPaceBucket = (pace: string): string => {
  if (pace.toLowerCase().includes("hustle")) return "hustle";
  if (pace.toLowerCase().includes("easy"))   return "easy";
  return "typical";
};

const practicalDistance = (
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number => {
  return haversineDistance(lat1, lng1, lat2, lng2) * HAVERSINE_CORRECTION;
};

const estimatedTravelMinutes = (
  lat1: number, lng1: number,
  lat2: number, lng2: number,
  pace: string
): number => {
  const dist = practicalDistance(lat1, lng1, lat2, lng2);
  const walkMins = (dist / WALKING_SPEED_MPH) * 60;
  const driveMins = (dist / DRIVING_SPEED_MPH) * 60;
  const paceBucket = getPaceBucket(pace);
  if (walkMins <= 10) return walkMins;
  if (paceBucket === "hustle") return driveMins;
  if (walkMins > 30) return driveMins;
  return walkMins;
};

const getGapPenalty = (netGapMins: number, pace: string): number => {
  const paceBucket = getPaceBucket(pace);
  const penalties = GAP_PENALTIES[paceBucket];
  if (netGapMins < 15)  return penalties[0];
  if (netGapMins < 30)  return penalties[1];
  if (netGapMins < 60)  return penalties[2];
  return penalties[3];
};

const getMaxStretch = (venueType: VenueType, pace: string): number => {
  const paceBucket = getPaceBucket(pace);
  const stretchRule = STRETCH_PACE[paceBucket];
  const baseDuration = getVenueDuration(venueType, pace);
  const stretchDuration = getVenueDuration(venueType, stretchRule.pace);
  if (stretchRule.mode === "add") return baseDuration + stretchDuration;
  return stretchDuration;
};

const isVenueOpenAtHour = (
  venue: Venue,
  arrivalHour: number,
  travelDay: string,
  departureHour?: number,
): boolean => {
  if (!venue.placeHours) {
    return true;
  }
  const dayName = resolveDay(travelDay);
  const DAY_NAME_TO_INDEX: Record<string, number> = {
    "Sunday": 0, "Monday": 1, "Tuesday": 2,
    "Wednesday": 3, "Thursday": 4, "Friday": 5, "Saturday": 6,
  };
  const dayIndex = DAY_NAME_TO_INDEX[dayName];
  const dayPeriods = venue.placeHours.periods.filter(p => p.day === dayIndex);
  
  if (dayPeriods.length === 0) return true; // no periods, assume open

  return dayPeriods.some(p => {
    const open  = parseInt(p.openTime.slice(0, 2));
    const close = parseInt(p.closeTime.slice(0, 2));
    
    // closeTime "0000" means closes exactly at midnight, treat as 24
    const closeAdj = close === 0 ? 24 : close;
    
    const arrivalOk = closeAdj < open
      ? arrivalHour >= open || arrivalHour < closeAdj
      : arrivalHour >= open && arrivalHour < closeAdj;
    if (!arrivalOk) return false;
    if (departureHour === undefined) return true;
    const departureOk = closeAdj < open
      ? departureHour >= open || departureHour < closeAdj
      : departureHour >= open && departureHour < closeAdj;
    return departureOk;
  });
};

// #endregion

// #region Scoring - Bonuses

const getTimeWindowBonus = (
  venueType: string,
  arrivalHour: number,
): number => {
  const window = VENUE_TIME_WINDOWS_NUMERIC[venueType];
  if (!window) return 0;

  const inWindow = window.end < window.start
    ? arrivalHour >= window.start || arrivalHour < window.end   // wraps midnight
    : arrivalHour >= window.start && arrivalHour < window.end;  // normal range

  return inWindow ? 2 : -5;
};

const getLovedBonus = (
  venueType: string,
  venuePreferences: Record<string, "love" | "hate" | "neutral">,
): number => {
  return venuePreferences[venueType] === "love" ? 4 : 0;
};

const getMomentumBonus = (
  venue: Venue,
  previousVenue: Venue | null,
  routeOrigin: { latitude: number; longitude: number },
  pace: string,
): number => {
  const prevLat = previousVenue?.latitude ?? routeOrigin.latitude;
  const prevLng = previousVenue?.longitude ?? routeOrigin.longitude;
  const dist = practicalDistance(prevLat, prevLng, venue.latitude, venue.longitude);
  const paceBucket = getPaceBucket(pace);

  const MOMENTUM_MATRIX: Record<string, number[]> = {
    //                  <0.25mi  <0.5mi  <1.0mi  1.0mi+
    hustle:            [5,       3,      1,      -4],
    typical:           [3,       2,      1,      -3],
    easy:              [2,       1,      1,      -2],
  };

  const bonuses = MOMENTUM_MATRIX[paceBucket];
  if (dist < 0.25) return bonuses[0];
  if (dist < 0.5)  return bonuses[1];
  if (dist < 1.0)  return bonuses[2];
  return bonuses[3];
};

// Anchor Proximity

// Returns +2 if adding this venue between prev and next adds less than 20%
// extra distance vs. going directly — i.e. it's "on the way".
const getAnchorProximityBonus = (
  venue: Venue,
  prevPoint: { latitude: number; longitude: number },
  nextPoint: { latitude: number; longitude: number } | null,
): number => {
  if (!nextPoint) return 0;
  const direct = haversineDistance(
    prevPoint.latitude, prevPoint.longitude,
    nextPoint.latitude, nextPoint.longitude,
  );
  const detour = haversineDistance(
    prevPoint.latitude, prevPoint.longitude,
    venue.latitude, venue.longitude,
  ) + haversineDistance(
    venue.latitude, venue.longitude,
    nextPoint.latitude, nextPoint.longitude,
  );
  return detour <= direct * 1.2 ? 2 : 0;
};

// #endregion

// #region Scoring - Penalties

const computeGapPenalty = (
  fromVenue: Venue | { latitude: number; longitude: number },
  toVenue: Venue,
  gapMinutes: number,
  pace: string,
): number => {
  const travelMins = estimatedTravelMinutes(
    fromVenue.latitude, fromVenue.longitude,
    toVenue.latitude, toVenue.longitude,
    pace,
  );
  const netGap = gapMinutes - travelMins;
  if (netGap <= 0) return 0;
  return getGapPenalty(netGap, pace);
};


// Diversity Penalty

// Called once before annealing begins. Computes the fraction of venue types
// in the post-filter pool that the user left neutral (neither loved nor hated).
// Higher neutralFraction = user wants variety = stronger diversity penalty.
export const computeNeutralFraction = (
  candidates: Venue[],
  venuePreferences: Record<string, "love" | "hate" | "neutral">,
): number => {
  const typesInPool = [...new Set(candidates.map(v => v.venueType ?? ""))];
  if (typesInPool.length === 0) return 1;
  const neutralCount = typesInPool.filter(
    t => !venuePreferences[t] || venuePreferences[t] === "neutral"
  ).length;
  return neutralCount / typesInPool.length;
};

// Returns the diversity penalty for a venue given the last two placed venue types.
// Scaled by neutralFraction — opinionated users get little to no penalty.
const getDiversityPenalty = (
  venueType: string,
  recentTypes: string[],
  neutralFraction: number,
): number => {
  const basePenalty = recentTypes.includes(venueType) ? -3 : 0;
  return basePenalty * neutralFraction;
};

// #endregion

// #region venueScore

const venueScore = (
  venue: Venue,
  previousVenue: Venue | null,
  nextVenue: Venue | null,
  routeOrigin: { latitude: number; longitude: number },
  arrivalHour: number,
  departureHour: number,
  gapMinutes: number,
  pace: string,
  venuePreferences: Record<string, "love" | "hate" | "neutral">,
  travelDay: string,
  recentTypes: string[],
  neutralFraction: number,
  viable: boolean,
): number => {
  const prevPoint = previousVenue ?? routeOrigin;

  return (
    getTimeWindowBonus(venue.venueType ?? "", arrivalHour) +
    getLovedBonus(venue.venueType ?? "", venuePreferences) +
    getMomentumBonus(venue, previousVenue, routeOrigin, pace) +
    getAnchorProximityBonus(venue, prevPoint, nextVenue) +
    (venue.normalizedReviewScore ?? 0) +
    (venue.venueGravity ?? 0) * 5 +
    (-computeGapPenalty(prevPoint, venue, gapMinutes, pace)) +
    getDiversityPenalty(venue.venueType ?? "", recentTypes, neutralFraction) +
    (viable ? 0 : -50)
  );
};

// #endregion

// #region routeScore

const routeScore = (
  venues: Venue[],
  routeOrigin: { latitude: number; longitude: number },
  arrivalHours: number[],
  departureHours: number[],
  gapMinutes: number[],
  viable: boolean[],
  pace: string,
  venuePreferences: Record<string, "love" | "hate" | "neutral">,
  travelDay: string,
  neutralFraction: number,
): number => {
  // Build recentTypes incrementally as we score each venue
  const recentTypes: string[] = [];

  return venues.reduce((total, venue, i) => {
    const score = venueScore(
      venue,
      i === 0 ? null : venues[i - 1],
      i < venues.length - 1 ? venues[i + 1] : null,
      routeOrigin,
      arrivalHours[i],
      departureHours[i],
      gapMinutes[i],
      pace,
      venuePreferences,
      travelDay,
      recentTypes.slice(-2),
      neutralFraction,
      viable[i],
    );
    if (venue.venueType) recentTypes.push(venue.venueType);
    return total + score;
  }, 0);
};

// #endregion

// #region Compute Schedule Arrays

const computeScheduleArrays = (
  venues: Venue[],
  routeOrigin: { latitude: number; longitude: number },
  startTime: string,
  pace: string,
  travelDay: string,
): {
  arrivalHours: number[];
  departureHours: number[];
  gapMinutes: number[];
  viable: boolean[];
} => {

  const start = parseTime(startTime);
  const startHour = start.getHours() + start.getMinutes() / 60;
  let cursorHour = startHour;

  const arrivalHours:   number[]  = [];
  const departureHours: number[]  = [];
  const gapMinutes:     number[]  = [];
  const viable:         boolean[] = [];

  for (let i = 0; i < venues.length; i++) {
    const venue = venues[i];
    const prevLat = i === 0 ? routeOrigin.latitude  : venues[i - 1].latitude;
    const prevLng = i === 0 ? routeOrigin.longitude : venues[i - 1].longitude;

    // Travel time from previous position (fractional hours)
    const travelMins = estimatedTravelMinutes(
      prevLat, prevLng,
      venue.latitude, venue.longitude,
      pace,
    );
    const travelHours = travelMins / 60;

    // Earliest we could physically arrive
    const earliestArrivalHour = cursorHour + travelHours;

    // Use actual opening hour from placeHours if available, fall back to time window
    const window = VENUE_TIME_WINDOWS_NUMERIC[venue.venueType ?? ""];
    let windowStartHour = window?.start ?? 0;
    if (venue.placeHours) {
      const dayName = resolveDay(travelDay);
      const DAY_NAME_TO_INDEX: Record<string, number> = {
        "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
        "Thursday": 4, "Friday": 5, "Saturday": 6,
      };
      const dayIndex = DAY_NAME_TO_INDEX[dayName];
      const dayPeriods = venue.placeHours.periods.filter(p => p.day === dayIndex);
      if (dayPeriods.length > 0) {
        const openHour = parseInt(dayPeriods[0].openTime.slice(0, 2)) +
                         parseInt(dayPeriods[0].openTime.slice(2, 4)) / 60;
        windowStartHour = openHour;
      }
    }

    // Float arrival to window start if we'd arrive too early
    const projectedArrivalHour = Math.max(earliestArrivalHour, windowStartHour);

    // Real idle gap — time we'd be waiting for the venue to hit its window
    const netGapMins = (projectedArrivalHour - earliestArrivalHour) * 60;

    // Venue duration at current pace and at hustle (minimum possible)
    const baseDuration  = getVenueDuration(venue.venueType as VenueType, pace);
    const minDuration   = getVenueDuration(venue.venueType as VenueType, "hustle");
    const baseDurHours  = baseDuration / 60;
    const minDurHours   = minDuration / 60;

    // Closing-time viability — check against actual closing hour from placeHours
    // Falls back to true (viable) if hours data is unavailable
    let isViable = true;
    if (venue.placeHours) {
      const dayName  = resolveDay(travelDay);
      const DAY_NAME_TO_INDEX: Record<string, number> = {
        "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
        "Thursday": 4, "Friday": 5, "Saturday": 6,
      };
      const dayIndex   = DAY_NAME_TO_INDEX[dayName];
      const dayPeriods = venue.placeHours.periods.filter(p => p.day === dayIndex);

      if (dayPeriods.length > 0) {
        // Find the period the projected arrival falls within
        const matchingPeriod = dayPeriods.find(p => {
          const open  = parseInt(p.openTime.slice(0, 2))  + parseInt(p.openTime.slice(2, 4))  / 60;
          const close = parseInt(p.closeTime.slice(0, 2)) + parseInt(p.closeTime.slice(2, 4)) / 60;
          const closeAdj = close === 0 ? 24 : close;
          return closeAdj < open
            ? projectedArrivalHour >= open || projectedArrivalHour < closeAdj
            : projectedArrivalHour >= open && projectedArrivalHour < closeAdj;
        });

        if (matchingPeriod) {
          const closeRaw = parseInt(matchingPeriod.closeTime.slice(0, 2)) +
                           parseInt(matchingPeriod.closeTime.slice(2, 4)) / 60;
          const closeHour = closeRaw === 0 ? 24 : closeRaw;
          // Even a hustle-pace visit would run past closing — not viable
          isViable = (projectedArrivalHour + minDurHours) <= closeHour;
        } else {
          // Arrival doesn't fall in any open period — not viable
          isViable = false;
        }
      }
    }

    const projectedDepartureHour = projectedArrivalHour + baseDurHours;

    arrivalHours.push(projectedArrivalHour);
    departureHours.push(projectedDepartureHour);
    gapMinutes.push(netGapMins);
    viable.push(isViable);

    // Advance cursor to projected departure so next venue inherits the float
    cursorHour = projectedDepartureHour;
  }

  return { arrivalHours, departureHours, gapMinutes, viable };
};

// #endregion

// #region Anchor Selection

const selectAnchors = (
  candidates: Venue[],
  depth: string[],
  pace: string,
  venuePreferences: Record<string, "love" | "hate" | "neutral">,
  startTime: string,
  endTime: string,
): Venue[] => {
  // Compute available day length
  const start = parseTime(startTime);
  const end   = parseTime(endTime);
  const dayHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  const hourBucket = dayHours < 4 ? 0 : dayHours < 8 ? 1 : 2;

  const paceBucket = getPaceBucket(pace);
  const anchorCount = ANCHOR_COUNTS[paceBucket][hourBucket];

  // Identify highest selected depth bucket
  const effectiveDepth = depth.length === 0 ? DEPTH_PRIORITY : depth;
  const highestBucket  = DEPTH_PRIORITY.find(d => effectiveDepth.includes(d)) ?? "sightsee";
  const range          = DEPTH_RANGES[highestBucket];

  // Filter candidates to anchor pool
  const anchorPool = candidates.filter(v =>
    (v.normalizedReviewScore ?? 0) >= range.min &&
    (v.normalizedReviewScore ?? 0) < range.max
  );

  // Score anchor pool
  const scored = anchorPool.map(v => ({
    venue: v,
    score: (v.normalizedReviewScore ?? 0) +
           (venuePreferences[v.venueType ?? ""] === "love" ? 0.3 : 0),
  })).sort((a, b) => b.score - a.score);

  // Greedily select anchors — no duplicate venue types
  const anchors: Venue[] = [];
  const usedTypes = new Set<string>();

  for (const { venue } of scored) {
    if (anchors.length >= anchorCount) break;
    if (venue.venueType && usedTypes.has(venue.venueType)) continue;
    anchors.push(venue);
    if (venue.venueType) usedTypes.add(venue.venueType);
  }

  return anchors.sort((a, b) => {
    const aWindow = VENUE_TIME_WINDOWS_NUMERIC[a.venueType ?? ""]?.start ?? 0;
    const bWindow = VENUE_TIME_WINDOWS_NUMERIC[b.venueType ?? ""]?.start ?? 0;
    return aWindow - bWindow;
  });
};

// #endregion

// #region Gap Computation

type Gap = {
  startHour: number;                                    // when the gap opens (fractional)
  endHour: number;                                      // when the gap closes (fractional)
  prevPoint: { latitude: number; longitude: number };   // geographic start of gap
  nextPoint: { latitude: number; longitude: number };   // geographic end of gap
  isLastGap: boolean;
};

const computeGaps = (
  anchors: Venue[],
  routeOrigin: { latitude: number; longitude: number },
  pace: string,
  startTime: string,
  endTime: string,
): Gap[] => {
  const start = parseTime(startTime);
  const end   = parseTime(endTime);
  const startHour = start.getHours() + start.getMinutes() / 60;
  const endHour   = end.getHours()   + end.getMinutes()   / 60;

  // Place each anchor at its projected time slot
  const placedAnchors: { venue: Venue; arrivalHour: number; departureHour: number }[] = [];
  let cursorHour = startHour;

  for (const anchor of anchors) {
    const prevLat = placedAnchors.length === 0 ? routeOrigin.latitude  : placedAnchors[placedAnchors.length - 1].venue.latitude;
    const prevLng = placedAnchors.length === 0 ? routeOrigin.longitude : placedAnchors[placedAnchors.length - 1].venue.longitude;

    const travelMins = estimatedTravelMinutes(prevLat, prevLng, anchor.latitude, anchor.longitude, pace);
    const earliestArrival = cursorHour + travelMins / 60;

    const window = VENUE_TIME_WINDOWS_NUMERIC[anchor.venueType ?? ""];
    const windowStart = window?.start ?? 0;
    const arrivalHour = Math.max(earliestArrival, windowStart);
    const duration = getVenueDuration(anchor.venueType as VenueType, pace);
    const departureHour = arrivalHour + duration / 60;

    placedAnchors.push({ venue: anchor, arrivalHour, departureHour });
    cursorHour = departureHour;
  }

  // Build gaps around anchors
  const gaps: Gap[] = [];
  const points = [
    { point: routeOrigin, hour: startHour },
    ...placedAnchors.map(a => ({ point: { latitude: a.venue.latitude, longitude: a.venue.longitude }, hour: a.arrivalHour, departureHour: a.departureHour })),
    { point: routeOrigin, hour: endHour },
  ];

  for (let i = 0; i < placedAnchors.length + 1; i++) {
    const gapStart = i === 0 ? startHour : placedAnchors[i - 1].departureHour;
    const gapEnd   = i === placedAnchors.length ? endHour : placedAnchors[i].arrivalHour;
    const prevPoint = i === 0 ? routeOrigin : { latitude: placedAnchors[i - 1].venue.latitude, longitude: placedAnchors[i - 1].venue.longitude };
    const nextPoint = i === placedAnchors.length ? routeOrigin : { latitude: placedAnchors[i].venue.latitude, longitude: placedAnchors[i].venue.longitude };

    if (gapEnd > gapStart) {
      gaps.push({ startHour: gapStart, endHour: gapEnd, prevPoint, nextPoint, isLastGap: i === placedAnchors.length });
    }
  }

  return gaps;
};

// #endregion

// #region Gap Fill

const fillGap = (
  gap: Gap,
  candidates: Venue[],
  routeOrigin: { latitude: number; longitude: number },
  pace: string,
  venuePreferences: Record<string, "love" | "hate" | "neutral">,
  travelDay: string,
  startTime: string,
  neutralFraction: number,
  sharedRecentTypes: string[],
): Venue[] => {

  // Estimate how many venues can realistically fit in this gap
  // Last gap uses 0 travel since there's no next anchor to route toward
  const paceBucket = getPaceBucket(pace);
  const avgDuration = paceBucket === "hustle" ? 35 : paceBucket === "easy" ? 60 : 45;
  const avgTravel = gap.isLastGap ? 0 : estimatedTravelMinutes(
    gap.prevPoint.latitude, gap.prevPoint.longitude,
    gap.nextPoint.latitude, gap.nextPoint.longitude,
    pace,
  ) / 2;
  const gapDuration = (gap.endHour - gap.startHour) * 60;
  const fillSlots   = Math.max(0, Math.floor(gapDuration / (avgDuration + avgTravel)));

  console.log(`fillGap: gapDuration=${gapDuration.toFixed(0)}min fillSlots=${fillSlots}`);

  if (fillSlots === 0) return [];

  // Seed initial route with nearest venues to the gap midpoint
  const midLat = (gap.prevPoint.latitude  + gap.nextPoint.latitude)  / 2;
  const midLng = (gap.prevPoint.longitude + gap.nextPoint.longitude) / 2;
  const sorted = [...candidates].sort((a, b) =>
    haversineDistance(midLat, midLng, a.latitude, a.longitude) -
    haversineDistance(midLat, midLng, b.latitude, b.longitude)
  );

  // Single slot — nearest neighbor is optimal, no annealing needed
  if (fillSlots === 1) return sorted.slice(0, 1);
  let current = sorted.slice(0, fillSlots);

  // Convert gap start hour to time string for computeScheduleArrays
  const gapStartTime = (() => {
    const totalMins = Math.round(gap.startHour * 60);
    const hh = Math.floor(totalMins / 60);
    const mm = (totalMins % 60).toString().padStart(2, "0");
    const ampm = hh >= 12 ? "PM" : "AM";
    return `${hh % 12 || 12}:${mm} ${ampm}`;
  })();

  // Compute initial schedule and score for the seeded route
  let { arrivalHours, departureHours, gapMinutes, viable } = computeScheduleArrays(
    current, gap.prevPoint, gapStartTime, pace, travelDay,
  );
  let currentScore = routeScore(
    current, gap.prevPoint, arrivalHours, departureHours, gapMinutes, viable,
    pace, venuePreferences, travelDay, neutralFraction,
  );
  let best = [...current];
  let bestScore = currentScore;

  // Annealing loop — exits when temperature cools, iterations cap, or no improvement
  let temperature = INITIAL_TEMPERATURE;
  let totalIterations = 0;
  const MAX_ITERATIONS = 50;
  let noImprovementCount = 0;
  const MAX_NO_IMPROVEMENT = 10;

  while (temperature > MIN_TEMPERATURE && totalIterations < MAX_ITERATIONS && noImprovementCount < MAX_NO_IMPROVEMENT) {
    totalIterations++;

    for (let i = 0; i < ITERATIONS_PER_TEMP; i++) {

      // Select perturbation — swap/move on existing route, insert from bench, or remove worst
      const rand = Math.random();
      let candidate: Venue[];

      if (rand < 0.35) {
        candidate = perturbSwap(current);
      } else if (rand < 0.65) {
        candidate = perturbMove(current);
      } else if (rand < 0.99 && current.length < fillSlots) {
        candidate = perturbInsert(current, candidates);
      } else {
        candidate = perturbRemove(
          current, fillSlots, gap.prevPoint, pace, venuePreferences,
          travelDay, arrivalHours, departureHours, gapMinutes, viable,
          `${Math.floor(gap.endHour % 12 || 12)}:${((gap.endHour % 1) * 60).toFixed(0).padStart(2, "0")} ${gap.endHour >= 12 ? "PM" : "AM"}`,
        );
      }

      // Score the candidate and accept if better or with probability based on temperature
      const { arrivalHours: newHours, departureHours: newDeps, gapMinutes: newGaps, viable: newViable } =
        computeScheduleArrays(candidate, gap.prevPoint, gapStartTime, pace, travelDay);
      const candidateScore = routeScore(
        candidate, gap.prevPoint, newHours, newDeps, newGaps, newViable,
        pace, venuePreferences, travelDay, neutralFraction,
      );

      const delta = candidateScore - currentScore;
      if (delta > 0 || Math.random() < Math.exp(delta / temperature)) {
        current = candidate;
        currentScore = candidateScore;
        arrivalHours = newHours;
        departureHours = newDeps;
        gapMinutes = newGaps;
        viable = newViable;
      }
    }

    // Track improvement at outer loop granularity — resets only on meaningful gain
    if (currentScore > bestScore) {
      best = [...current];
      bestScore = currentScore;
      noImprovementCount = 0;
    } else {
      noImprovementCount++;
    }
    temperature *= COOLING_RATE;
  }

  return best;
};

// #endregion

// #region Annealing Perturbations

const perturbSwap = (venues: Venue[]): Venue[] => {
  if (venues.length < 2) return venues;
  const result = [...venues];
  const i = Math.floor(Math.random() * result.length);
  let j = Math.floor(Math.random() * result.length);
  while (j === i) j = Math.floor(Math.random() * result.length);
  [result[i], result[j]] = [result[j], result[i]];
  return result;
};

const perturbMove = (venues: Venue[]): Venue[] => {
  if (venues.length < 2) return venues;
  const result = [...venues];
  const from = Math.floor(Math.random() * result.length);
  let to = Math.floor(Math.random() * result.length);
  while (to === from) to = Math.floor(Math.random() * result.length);
  const [venue] = result.splice(from, 1);
  result.splice(to, 0, venue);
  return result;
};

const perturbInsert = (
  venues: Venue[],
  candidates: Venue[],
): Venue[] => {
  const bench = candidates.filter(c => !venues.some(v => v.name === c.name));
  if (bench.length === 0) return venues;
  const result = [...venues];
  const newVenue = bench[Math.floor(Math.random() * bench.length)];
  const insertAt = Math.floor(Math.random() * (result.length + 1));
  result.splice(insertAt, 0, newVenue);
  return result;
};

const perturbRemove = (
  venues: Venue[],
  targetCount: number,
  routeOrigin: { latitude: number; longitude: number },
  pace: string,
  venuePreferences: Record<string, "love" | "hate" | "neutral">,
  travelDay: string,
  arrivalHours: number[],
  departureHours: number[],
  gapMinutes: number[],
  viable: boolean[],
  endTime: string,
): Venue[] => {
  if (venues.length <= 1) return venues;
  const endHour = parseTime(endTime).getHours();

  let worstIndex = 0;
  let worstScore = Infinity;
  
  venues.forEach((venue, i) => {
    const score = venueScore(
      venue,
      i === 0 ? null : venues[i - 1],
      i < venues.length - 1 ? venues[i + 1] : null,
      routeOrigin,
      arrivalHours[i],
      departureHours[i],
      gapMinutes[i],
      pace,
      venuePreferences,
      travelDay,
      [],
      1,
      viable[i],
    );
    if (score < worstScore) {
      worstScore = score;
      worstIndex = i;
    }
  });

  // Only remove if the worst venue is genuinely bad
  if (worstScore >= -5) return venues;

  // Also check for any venue arriving after endTime
  const afterEndIndex = arrivalHours.findIndex(h => h > endHour);
  const removeIndex = afterEndIndex >= 0 ? afterEndIndex : worstIndex;
  if (removeIndex === -1) return venues;

  const result = [...venues];
  result.splice(removeIndex, 1);
  return result;
};

// #endregion

// #region optimizeTRAVEL

export const optimizeTRAVEL = (
  candidates: Venue[],
  routeOrigin: { latitude: number; longitude: number },
  pace: string,
  venuePreferences: Record<string, "love" | "hate" | "neutral">,
  travelDay: string,
  startTime: string = DEFAULT_START_TIME,
  endTime: string = DEFAULT_END_TIME,
  depth: string[] = [],
): Venue[] => {

  const neutralFraction = computeNeutralFraction(candidates, venuePreferences);

  // Phase 1 — Anchor Selection
  const anchors = selectAnchors(candidates, depth, pace, venuePreferences, startTime, endTime);
  console.log("anchors selected:", anchors.map(a => `${a.name} (${a.venueType}, REV=${(a.normalizedReviewScore ?? 0).toFixed(2)})`));

  // Phase 2 — Gap Computation
  const gaps = computeGaps(anchors, routeOrigin, pace, startTime, endTime);
  console.log("gaps computed:", gaps.map(g => `${g.startHour.toFixed(2)}-${g.endHour.toFixed(2)}`));

  // Phase 3 — Gap Filling
  const placedNames = new Set(anchors.map(a => a.name));
  const sharedRecentTypes: string[] = anchors.map(a => a.venueType ?? "");
  const fillPool = candidates.filter(v => !placedNames.has(v.name));

  const filledGaps: Venue[][] = [];
  for (let gi = 0; gi < gaps.length; gi++) {
    const gap = gaps[gi];
    const gapFillPool = fillPool.filter(v => !filledGaps.flat().some(p => p.name === v.name));    
    const minGapHours = getVenueDuration("restaurant" as VenueType, "hustle") / 60 + 
      estimatedTravelMinutes(gap.prevPoint.latitude, gap.prevPoint.longitude, gap.nextPoint.latitude, gap.nextPoint.longitude, pace) / 60;
    
    if (gapFillPool.length === 0 || (gap.endHour - gap.startHour) < minGapHours) {
      filledGaps.push([]);
      continue;
    }
    
    const filled = fillGap(
      gap,
      gapFillPool,
      routeOrigin,
      pace,
      venuePreferences,
      travelDay,
      startTime,
      neutralFraction,
      sharedRecentTypes,
    );
    filledGaps.push(filled);
    filled.forEach(v => { if (v.venueType) sharedRecentTypes.push(v.venueType); });
  }

  // Assemble final route: fills_pre + anchor1 + fills_inter + anchor2 + fills_post
  const route: Venue[] = [];
  for (let i = 0; i < anchors.length; i++) {
    route.push(...(filledGaps[i] ?? []));
    route.push(anchors[i]);
  }
  route.push(...(filledGaps[anchors.length] ?? []));

  console.log("final route:", route.map(v => v.name));

  return route;
};

// #endregion