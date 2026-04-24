// #region Imports

import { collection, getDocs } from "firebase/firestore";
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

import { haversineDistance } from "./places";

const SCORE_WEIGHT_RATING    = 0.4;
const SCORE_WEIGHT_PROXIMITY = 0.3;
const SCORE_WEIGHT_LOVED     = 0.3;

export const filterCityVenues = (
  venues: CachedVenue[],
  venuePreferences: Record<string, "love" | "hate" | "neutral">,
  userLat: number,
  userLng: number,
): CachedVenue[] => {
  // Apply preference filtering
  const filtered = venues.filter(v => {
    if (!v.venueType) return false;
    if (venuePreferences[v.venueType] === "hate") return false;
    return true;
  });
  console.log("venuePreferences:", venuePreferences);
  console.log("art_gallery pref:", venuePreferences["art_gallery"]);

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