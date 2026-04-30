// #region Imports

import { collection, getDocs } from "firebase/firestore";
import { haversineDistance } from "../shared/utilities";
import { VenueType } from "../shared/venueTypeMapping";
import { db } from "./firebase";
import { PlaceHours, resolveDay } from "./places";

// #endregion

// #region Types

export type CachedVenue = {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  types: string[];
  venueType: VenueType | null;
  queryType: string;
  rating: number;
  userRatingsTotal: number;
  priceLevel: number | null;
  businessStatus: string;
  placeHours: PlaceHours | null;
  zipCode: string;
  cachedAt: string;
  hoursRefreshedAt: string;
  normalizedReviewScore: number | null;
  venueGravity: number | null;
};

// #endregion

// #region Query

export const getCityVenues = async (
  cityPath: string
): Promise<CachedVenue[]> => {
  try {
    const snapshot = await getDocs(collection(db, `${cityPath}/venues`));
    return snapshot.docs.map(doc => doc.data() as CachedVenue);
  } catch (e) {
    console.error("Failed to fetch city venues:", e);
    return [];
  }
};

// #endregion

// #region Filtering and Scoring

const SCORE_WEIGHT_RATING    = 0.4;
const SCORE_WEIGHT_PROXIMITY = 0.3;
const SCORE_WEIGHT_LOVED     = 0.3;

const DEPTH_RANGES: Record<string, { min: number; max: number }> = {
  sightsee: { min: 0.8, max: 1.0 },
  explore:  { min: 0.5, max: 0.8 },
  go_local: { min: 0.2, max: 0.5 },
};

export const filterCityVenues = (
  venues: CachedVenue[],
  venuePreferences: Record<string, "love" | "hate" | "neutral">,
  userLat: number,
  userLng: number,
  budget: string,
  depth: string[],
): CachedVenue[] => {
  const isLoved = (venueType: string) => venuePreferences[venueType] === "love";

  const filtered = venues.filter(v => {
    if (!v.venueType) return false;
    if (venuePreferences[v.venueType] === "hate") return false;

    // Budget filter
    const p = v.priceLevel;
    if (p !== null && p !== undefined) {
      if (budget === "inexpensive" && p > 2) return false;
      if (budget === "mid-range" && p === 3 && venuePreferences[v.venueType!] === "hate") return false;
      if (budget === "mid-range" && p === 4 && !isLoved(v.venueType)) return false;
      if (budget === "YOLO vacay" && p < 2 && !isLoved(v.venueType)) return false;
    }

    // Depth filter
    // NOTE: venues with null normalizedReviewScore are filtered out entirely.
    // This should never happen if scoreAndCleanVenues runs correctly after every
    // population or refresh. If venues are being unexpectedly excluded, check
    // whether the scoring pipeline completed successfully.
    // TODO: add a runtime warning/alert when null scores are encountered at query time.
    const score = v.normalizedReviewScore;
    if (score === null || score === undefined) return false;
    if (depth.length > 0 && !depth.some(d => {
      const range = DEPTH_RANGES[d];
      return range && score >= range.min && score < range.max;
    })) return false;

    return true;
  });

  // Score and sort
  const distances = filtered.map(v => haversineDistance(userLat, userLng, v.latitude, v.longitude));
  const maxDist = Math.max(...distances, 1);

  return filtered
    .map((v, i) => {
      const normalizedDist = distances[i] / maxDist;
      const lovedBonus = venuePreferences[v.venueType!] === "love" ? 1 : 0;
      const score =
        (v.rating / 5.0) * SCORE_WEIGHT_RATING +
        (1 - normalizedDist) * SCORE_WEIGHT_PROXIMITY +
        lovedBonus * SCORE_WEIGHT_LOVED;
      return { ...v, score };
    })
    .sort((a, b) => (b as any).score - (a as any).score);
};

export const filterVenuesForGap = (
  venues: CachedVenue[],
  gapStartHour: number,
  gapEndHour: number,
  prevPoint: { latitude: number; longitude: number },
  nextPoint: { latitude: number; longitude: number },
  travelDay: string,
  placedNames: Set<string>,
): CachedVenue[] => {
  const RADIUS_MILES = 3;

  const DAY_NAME_TO_INDEX: Record<string, number> = {
    "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
    "Thursday": 4, "Friday": 5, "Saturday": 6,
  };

  const dayName = resolveDay(travelDay);
  const dayIndex = DAY_NAME_TO_INDEX[dayName];

  return venues.filter(v => {
    // Filter 1 — not already placed
    if (placedNames.has(v.name)) return false;

    // Filter 2 — within 3mi of either gap endpoint
    const distPrev = haversineDistance(v.latitude, v.longitude, prevPoint.latitude, prevPoint.longitude);
    const distNext = haversineDistance(v.latitude, v.longitude, nextPoint.latitude, nextPoint.longitude);
    if (distPrev > RADIUS_MILES && distNext > RADIUS_MILES) return false;

    // Filter 3 — open at some point during the gap window
    if (!v.placeHours) return true; // no hours data, include by default
    const dayPeriods = v.placeHours.periods.filter(p => p.day === dayIndex);
    if (dayPeriods.length === 0) return true; // no periods for this day, include by default

    return dayPeriods.some(p => {
      const openHour  = parseInt(p.openTime.slice(0, 2))  + parseInt(p.openTime.slice(2, 4))  / 60;
      const closeRaw  = parseInt(p.closeTime.slice(0, 2)) + parseInt(p.closeTime.slice(2, 4)) / 60;
      const closeHour = closeRaw < 6 ? closeRaw + 24 : closeRaw;
      return closeHour > gapStartHour && openHour < gapEndHour;
    });
  });
};

// #endregion