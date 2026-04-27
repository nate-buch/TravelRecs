// #region Imports

import { haversineDistance, parseTime } from "../../shared/utilities";
import { VenueType } from "../../shared/venueTypeMapping";
import { Venue } from "./claude";
import { getVenueDuration } from "./durations";
import { resolveDay } from "./places";

// #endregion

// #region Constants

// Annealing parameters
const INITIAL_TEMPERATURE = 1000;
const COOLING_RATE        = 0.995;
const MIN_TEMPERATURE     = 1;
const ITERATIONS_PER_TEMP = 10;

// Travel estimation
const HAVERSINE_CORRECTION = 1.5;  // crow-flies to practical distance
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

// #region Scoring

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

const venueScore = (
  venue: Venue,
  previousVenue: Venue | null,
  routeOrigin: { latitude: number; longitude: number },
  arrivalHour: number,
  departureHour: number,
  gapMinutes: number,
  pace: string,
  venuePreferences: Record<string, "love" | "hate" | "neutral">,
  travelDay: string,
): number => {
  const closedPenalty = isVenueOpenAtHour(venue, arrivalHour, travelDay, departureHour) ? 0 : -50;

  return (
    getTimeWindowBonus(venue.venueType ?? "", arrivalHour) +
    getLovedBonus(venue.venueType ?? "", venuePreferences) +
    getMomentumBonus(venue, previousVenue, routeOrigin, pace) -
    computeGapPenalty(previousVenue ?? routeOrigin, venue, gapMinutes, pace) +
    closedPenalty
  );
};

const routeScore = (
  venues: Venue[],
  routeOrigin: { latitude: number; longitude: number },
  arrivalHours: number[],
  departureHours: number[],
  gapMinutes: number[],
  pace: string,
  venuePreferences: Record<string, "love" | "hate" | "neutral">,
  travelDay: string,
): number => {
  return venues.reduce((total, venue, i) => {
    return total + venueScore(
      venue,
      i === 0 ? null : venues[i - 1],
      routeOrigin,
      arrivalHours[i],
      departureHours[i],
      gapMinutes[i],
      pace,
      venuePreferences,
      travelDay,
    );
  }, 0);
};

const computeScheduleArrays = (
  venues: Venue[],
  routeOrigin: { latitude: number; longitude: number },
  startTime: string,
  pace: string,
): { arrivalHours: number[]; departureHours: number[]; gapMinutes: number[] } => {
  const start = parseTime(startTime);
  let cursor = new Date(start);
  const arrivalHours: number[] = [];
  const departureHours: number[] = [];
  const gapMinutes: number[] = [];

  for (let i = 0; i < venues.length; i++) {
    const prevLat = i === 0 ? routeOrigin.latitude : venues[i - 1].latitude;
    const prevLng = i === 0 ? routeOrigin.longitude : venues[i - 1].longitude;
    const travelMins = estimatedTravelMinutes(prevLat, prevLng, venues[i].latitude, venues[i].longitude, pace);
    const duration = getVenueDuration(venues[i].venueType as VenueType, pace);

    const arrivalTime = new Date(cursor.getTime() + travelMins * 60 * 1000);
    arrivalHours.push(arrivalTime.getHours());

    const nextCursor = new Date(arrivalTime.getTime() + duration * 60 * 1000);
    departureHours.push(nextCursor.getHours());
    const gapMins = i === 0 
      ? (arrivalTime.getTime() - start.getTime()) / 60000
      : (arrivalTime.getTime() - cursor.getTime()) / 60000;
    gapMinutes.push(gapMins);

    cursor = nextCursor;
  }

  return { arrivalHours, departureHours, gapMinutes };
};

// #endregion

// #region Annealing

const perturbSwap = (venues: Venue[]): Venue[] => {
  const result = [...venues];
  const i = Math.floor(Math.random() * result.length);
  let j = Math.floor(Math.random() * result.length);
  while (j === i) j = Math.floor(Math.random() * result.length);
  [result[i], result[j]] = [result[j], result[i]];
  return result;
};

const perturbMove = (venues: Venue[]): Venue[] => {
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
      routeOrigin,
      arrivalHours[i],
      departureHours[i],
      gapMinutes[i],
      pace,
      venuePreferences,
      travelDay,
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
  const removeIndex = afterEndIndex >= 0 ? afterEndIndex : (worstScore < -5 ? worstIndex : -1);
  if (removeIndex === -1) return venues;

  const result = [...venues];
  result.splice(worstIndex, 1);
  return result;
};

const anneal = (
  initial: Venue[],
  candidates: Venue[],
  routeOrigin: { latitude: number; longitude: number },
  pace: string,
  venuePreferences: Record<string, "love" | "hate" | "neutral">,
  travelDay: string,
  startTime: string,
  endTime: string,
): Venue[] => {
  const paceBucket = getPaceBucket(pace);
  const targetCount = TARGET_STOPS[paceBucket];

  let current = [...initial];
  
  let { arrivalHours, departureHours, gapMinutes } = computeScheduleArrays(current, routeOrigin, startTime, pace);
  let currentScore = routeScore(current, routeOrigin, arrivalHours, departureHours, gapMinutes, pace, venuePreferences, travelDay);
  let best = [...current];
  let bestScore = currentScore;
  let temperature = INITIAL_TEMPERATURE;

  while (temperature > MIN_TEMPERATURE) {
    for (let i = 0; i < ITERATIONS_PER_TEMP; i++) {

      // Choose perturbation — weighted by pace and current route size
      const rand = Math.random();
      let candidate: Venue[];
      if (rand < 0.3) {
        candidate = perturbSwap(current);
      } else if (rand < 0.6) {
        candidate = perturbMove(current);
      } else if (rand < 0.99 && current.length < targetCount * 1.5) {
        candidate = perturbInsert(current, candidates);
      } else {
        candidate = perturbRemove(current, targetCount, routeOrigin, pace, venuePreferences, travelDay, arrivalHours, departureHours, gapMinutes, endTime);
      }

      const { arrivalHours: newHours, departureHours: newDepartures, gapMinutes: newGaps } = computeScheduleArrays(candidate, routeOrigin, startTime, pace);
      const candidateScore = routeScore(candidate, routeOrigin, newHours, newDepartures, newGaps, pace, venuePreferences, travelDay);
      
      const delta = candidateScore - currentScore;
      // Accept if better, or with probability based on temperature
      if (delta > 0 || Math.random() < Math.exp(delta / temperature)) {
        current = candidate;
        currentScore = candidateScore;
        arrivalHours = newHours;
        departureHours = newDepartures;
        gapMinutes = newGaps;

        if (currentScore > bestScore) {
          best = [...current];
          bestScore = currentScore;
        }
      }
    }

    temperature *= COOLING_RATE;
  }

  // Score breakdown for final route
  const { arrivalHours: finalHours, departureHours: finalDepartures, gapMinutes: finalGaps } = 
    computeScheduleArrays(best, routeOrigin, startTime, pace);
  
  console.log("\n=== TRAVEL Score Breakdown ===");
  best.forEach((venue, i) => {
    const twb = getTimeWindowBonus(venue.venueType ?? "", finalHours[i]);
    const lb  = getLovedBonus(venue.venueType ?? "", venuePreferences);
    const mb  = getMomentumBonus(venue, i === 0 ? null : best[i-1], routeOrigin, pace);
    const gp  = computeGapPenalty(i === 0 ? routeOrigin : best[i-1], venue, finalGaps[i], pace);
    const cp  = isVenueOpenAtHour(venue, finalHours[i], travelDay, finalDepartures[i]) ? 0 : -50;
    const total = twb + lb + mb - gp + cp;
    console.log(`${venue.name} @ ${finalHours[i]}-${finalDepartures[i]}: TWB=${twb} LB=${lb} MB=${mb} GP=${gp} CP=${cp} = ${total}`);
  });
  console.log("==============================\n");

  return best;
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
): Venue[] => {

  console.log("optimizeTRAVEL params:", { travelDay, startTime, endTime: DEFAULT_END_TIME });

  const paceBucket = getPaceBucket(pace);
  const targetCount = TARGET_STOPS[paceBucket];

  // Seed the initial route with nearest neighbor from the candidate pool,
  // capped at target count — gives annealing a reasonable starting point
  const seeded = candidates.slice(0, targetCount);

  return anneal(
    seeded,
    candidates,
    routeOrigin,
    pace,
    venuePreferences,
    travelDay,
    startTime,
    endTime,
  );
};

// #endregion