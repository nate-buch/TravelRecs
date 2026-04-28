// #region Imports

import { collection, getDocs } from "firebase/firestore";
import { haversineDistance } from "../../shared/utilities";
import { VenueType } from "../../shared/venueTypeMapping";
import { db } from "./firebase";
import { PlaceHours } from "./places";

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

// #endregion