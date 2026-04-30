// #region Imports

import { haversineDistance } from "../shared/utilities";
import { VenueType, getVenueTypeForPlace } from "../shared/venueTypeMapping";

// #endregion

// #region Google Places API Data Pull

export type PlacesVenue = {
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  types: string[];
  rating?: number;
  userRatingsTotal?: number;
  openNow?: boolean;
  placeId?: string;
};

export const getNearbyPlaces = async (
  latitude: number,
  longitude: number,
): Promise<PlacesVenue[]> => {
  const fetchPage = async (pagetoken?: string): Promise<{ results: PlacesVenue[], nextToken?: string }> => {
    const tokenParam = pagetoken ? `&pagetoken=${pagetoken}` : "";
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&rankby=distance${tokenParam}&key=${process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      throw new Error(`Places API error: ${data.status}`);
    }
    return {
      results: data.results.map((place: any) => ({
        name: place.name,
        latitude: place.geometry.location.lat,
        longitude: place.geometry.location.lng,
        address: place.vicinity,
        types: place.types,
        rating: place.rating,
        userRatingsTotal: place.user_ratings_total,
        openNow: place.opening_hours?.open_now,
        placeId: place.place_id,
      })),
      nextToken: data.next_page_token,
    };
  };

  const page1 = await fetchPage();
  let allResults = page1.results;

  if (page1.nextToken) {
    await new Promise(res => setTimeout(res, 2000));
    const page2 = await fetchPage(page1.nextToken);
    allResults = [...allResults, ...page2.results];
  }

  return allResults;
};

export type PlaceHours = {
  weekdayText: string[];  // e.g. ["Monday: 9:00 AM – 5:00 PM", ...]
  periods: {
    day: number;          // 0=Sunday, 1=Monday, etc.
    openTime: string;     // "0900"
    closeTime: string;    // "1700"
  }[];
};

export const getPlaceDetails = async (placeId: string): Promise<PlaceHours | null> => {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=opening_hours&key=${process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status !== "OK" || !data.result?.opening_hours) return null;
    
    const hours = data.result.opening_hours;
    return {
      weekdayText: hours.weekday_text ?? [],
      periods: (hours.periods ?? []).map((p: any) => ({
        day: p.open.day,
        openTime: p.open.time,
        closeTime: p.close?.time ?? "2359",
      })),
    };
  } catch {
    return null;
  }
};

// #endregion

// #region Venue Type Mapping and Filtering

// Hybrid scoring weights — must sum to 1.0
const SCORE_WEIGHT_RATING    = 0.4;  // venue quality (Google rating / 5.0)
const SCORE_WEIGHT_PROXIMITY = 0.3;  // distance from user (normalized 0–1, inverted)
const SCORE_WEIGHT_LOVED     = 0.3;  // bonus for user-loved venue types

// Minimum review counts by venue type — lower for fast-turnover food/drink venues
// to allow discovery of new spots; higher for established destinations
const MIN_REVIEWS: Partial<Record<VenueType, number>> = {
  coffee_shop:         10,
  restaurant:          10,
  street_food:         10,
  bar:                 10,
  brewery:             10,
  nightclub:           10,
  live_music:          10,
  museum:              100,
  park_viewpoint:      100,
  attraction_landmark: 100,
  art_gallery:         100,
  market:              100,
  cultural_heritage:   100,
  performing_arts:     100,
};

// Filters raw Google Places results to our venue types, applies quality thresholds,
// respects user venue preferences, then scores and sorts by a hybrid of
// rating, proximity, and loved venue type bonus.
export const filterAndMapPlaces = (
  places: PlacesVenue[],
  venuePreferences: Record<string, "love" | "hate" | "neutral">,
  userLat: number,
  userLng: number,
): (PlacesVenue & { venueType: VenueType })[] => {
  const results: (PlacesVenue & { venueType: VenueType })[] = [];

  console.log("total incoming:", places.length);
  let failedType = 0, failedHate = 0, failedRating = 0, failedReviews = 0;

  for (const place of places) {
    const venueType = getVenueTypeForPlace(place.types);
    console.log(place.name, "→", place.types, "→", venueType ?? "FILTERED");

    if (!venueType) { failedType++; continue; }
    if (venuePreferences[venueType] === "hate") { failedHate++; continue; }
    if (!place.rating || place.rating < 4.0) { failedRating++; continue; }
    const minReviews = MIN_REVIEWS[venueType] ?? 10;
    if (!place.userRatingsTotal || place.userRatingsTotal < minReviews) { failedReviews++; continue; }
    results.push({ ...place, venueType });
  }

  console.log(`filtered out — type:${failedType} hate:${failedHate} rating:${failedRating} reviews:${failedReviews} | passed:${results.length}`);

  // Normalize distances against the furthest result so proximity score is always 0–1
  const distances = results.map(p => haversineDistance(userLat, userLng, p.latitude, p.longitude));
  const maxDist = Math.max(...distances, 1);

  // Hybrid score: rating quality + proximity + loved venue type bonus
  return results
    .map((p, i) => {
      const normalizedDist = distances[i] / maxDist;
      const lovedBonus = venuePreferences[p.venueType] === "love" ? 1 : 0;
      const score =
        (p.rating! / 5.0) * SCORE_WEIGHT_RATING +
        (1 - normalizedDist) * SCORE_WEIGHT_PROXIMITY +
        lovedBonus * SCORE_WEIGHT_LOVED;
      return { ...p, score };
    })
    .sort((a, b) => b.score - a.score);
};

// #endregion

// #region Days and Hours Presentation

// Day bar entry — one per day of the week (Mo–Su) for the open/closed indicator strip
export type DayBar = {
  day: string;      // "Mo", "Tu" etc
  isOpen: boolean;
};

// Maps TravelDay store values to full day names for string matching
const DAY_MAP: Record<string, string> = {
  "today": "",  // resolved at call time
  "MON": "Monday",
  "TUE": "Tuesday",
  "WED": "Wednesday",
  "THU": "Thursday",
  "FRI": "Friday",
  "SAT": "Saturday",
  "SUN": "Sunday",
};

const TODAY_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Resolves "today" to the current day name, or maps abbreviation to full name
export const resolveDay = (travelDay: string): string => {
  if (travelDay === "today") return TODAY_DAY_NAMES[new Date().getDay()];
  return DAY_MAP[travelDay] ?? "";
};

// Hours display type — isOpen flag plus one entry per open period for the travel day
export type HoursDisplay = {
  isOpen: boolean;
  periods: {
    openTime: string;   // formatted, e.g. "5 PM"
    closeTime: string;  // formatted, e.g. "10 PM"
  }[];
};

// Converts "HHMM" 24-hour string to display format — omits ":00" when on the hour
const formatHoursMins = (hhmm: string): string => {
  const h = parseInt(hhmm.slice(0, 2));
  const m = parseInt(hhmm.slice(2, 4));
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  const mins = m > 0 ? `:${m.toString().padStart(2, "0")}` : "";
  return `${hour}${mins} ${ampm}`;
};

// Returns open periods for the travel day, formatted for display.
// Uses weekdayText to detect Closed, periods array for actual open/close times.
export const getHoursForDay = (
  placeHours: PlaceHours | null,
  travelDay: string
): HoursDisplay => {
  if (!placeHours) return { isOpen: true, periods: [] };

  const dayName = resolveDay(travelDay);
  const DAY_NAME_TO_INDEX: Record<string, number> = {
    "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
    "Thursday": 4, "Friday": 5, "Saturday": 6,
  };
  const dayIndex = DAY_NAME_TO_INDEX[dayName];

  // weekdayText is the most reliable source for "Closed" status
  const entry = placeHours.weekdayText.find(h => h.startsWith(dayName));
  if (entry) {
    const hoursStr = entry.split(": ").slice(1).join(": ");
    if (hoursStr === "Closed") return { isOpen: false, periods: [] };
  }

  // Filter periods to travel day — multiple entries indicate split hours
  const dayPeriods = placeHours.periods.filter(p => p.day === dayIndex);
  if (dayPeriods.length === 0) return { isOpen: true, periods: [] };

  return {
    isOpen: true,
    periods: dayPeriods.map(p => ({
      openTime: formatHoursMins(p.openTime),
      closeTime: formatHoursMins(p.closeTime),
    })),
  };
};

// Builds the Mo–Su day bar from weekdayText — open = not explicitly "Closed"
export const getDayBar = (hours: string[]): DayBar[] => {
  const days = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const fullNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  
  return days.map((day, i) => {
    const entry = hours.find(h => h.startsWith(fullNames[i]));
    const isOpen = entry ? !entry.includes("Closed") : false;
    return { day, isOpen };
  });
};

// #endregion

// #region Conflict Detection

// Conflict result type — one entry per open period for the travel day
export type ScheduleConflict = {
  hoursConflict: boolean;
  periods: {
    openConflict: boolean;
    closeConflict: boolean;
  }[];
};

export const getScheduleConflict = (
  arrivalTime: string,
  departureTime: string,
  placeHours: PlaceHours | null,
  travelDay: string
): ScheduleConflict => {
  const none = { hoursConflict: false, periods: [] };

  if (!placeHours || !placeHours.periods || placeHours.periods.length === 0) return none;

  // Resolve travel day string to Google day index (0=Sunday)
  const dayName = resolveDay(travelDay);
  const DAY_NAME_TO_INDEX: Record<string, number> = {
    "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
    "Thursday": 4, "Friday": 5, "Saturday": 6,
  };
  const dayIndex = DAY_NAME_TO_INDEX[dayName];
  if (dayIndex === undefined) return none;

  // Filter periods to only those matching the travel day (handles split hours)
  const dayPeriods = placeHours.periods.filter(p => p.day === dayIndex);
  if (dayPeriods.length === 0) return none;

  // Parse "HHMM" 24-hour string into a Date (Jan 1 2000 reference, day bumped for post-midnight)
  const parsePeriodsTime = (hhmm: string): Date => {
    const h = parseInt(hhmm.slice(0, 2));
    const m = parseInt(hhmm.slice(2, 4));
    const date = new Date(2000, 0, 1);
    if (h < 4) date.setDate(2);
    date.setHours(h, m, 0, 0);
    return date;
  };

  // Parse "h:mm AM/PM" schedule time string into a Date (same reference date)
  const parseScheduleTime = (timeStr: string): Date => {
    const [time, ampm] = timeStr.split(" ");
    const [hours, minutes] = time.split(":").map(Number);
    const date = new Date(2000, 0, 1);
    let h = hours;
    if (ampm === "AM" && hours === 12) h = 0;
    else if (ampm === "PM" && hours !== 12) h = hours + 12;
    if (h < 4) date.setDate(2);
    date.setHours(h, minutes, 0, 0);
    return date;
  };

  // Convert schedule and period times to comparable Date objects
  const arrival = parseScheduleTime(arrivalTime);
  const departure = parseScheduleTime(departureTime);
  const parsedPeriods = dayPeriods.map(period => ({
    openTime: parsePeriodsTime(period.openTime),
    closeTime: parsePeriodsTime(period.closeTime),
  }));

  // Check if the visit overlaps with any open period at all
  const hasAnyOverlap = parsedPeriods.some(p => arrival < p.closeTime && departure > p.openTime);

  // For each period, determine which boundaries (open/close) are conflicting
  const periodConflicts = parsedPeriods.map((p, i) => {
    const visitOverlaps = arrival < p.closeTime && departure > p.openTime;

    if (visitOverlaps) {
      // Visit overlaps this period — flag whichever boundary is violated
      return {
        openConflict: arrival < p.openTime,
        closeConflict: departure > p.closeTime,
      };
    }

    if (!hasAnyOverlap) {
      // Visit falls entirely outside all periods (before first open, after last close,
      // or in a gap between periods) — flag the nearest relevant boundaries
      const isBeforeFirst = i === 0 && departure <= p.openTime;
      const isAfterLast = i === parsedPeriods.length - 1 && arrival >= p.closeTime;
      const isAfterPrev = i > 0 && arrival >= parsedPeriods[i - 1].closeTime && departure <= p.openTime;
      const isInGapAfter = i < parsedPeriods.length - 1 && arrival >= p.closeTime && departure <= parsedPeriods[i + 1].openTime;

      return {
        openConflict: isBeforeFirst || isAfterPrev,
        closeConflict: isAfterLast || isInGapAfter,
      };
    }

    return { openConflict: false, closeConflict: false };
  });

  // Hoist conflict flag for quick checks elsewhere
  const hoursConflict = periodConflicts.some(p => p.openConflict || p.closeConflict);

  return { hoursConflict, periods: periodConflicts };
};

// #endregion