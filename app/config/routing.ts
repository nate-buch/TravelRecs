// #region Imports

import { Venue } from "./claude";
import { haversineDistance } from "../../shared/utilities";

// #endregion

// #region Math Utilities

const firstLeg = (
  userLat: number, userLng: number,
  venues: Venue[]
): number => {
  return haversineDistance(userLat, userLng, venues[0].latitude, venues[0].longitude);
};

const internalDistance = (venues: Venue[]): number => {
  let dist = 0;
  for (let i = 0; i < venues.length - 1; i++) {
    dist += haversineDistance(
      venues[i].latitude, venues[i].longitude,
      venues[i + 1].latitude, venues[i + 1].longitude
    );
  }
  return dist;
};

const totalDistance = (
  userLat: number, userLng: number,
  venues: Venue[]
): number => {
  return firstLeg(userLat, userLng, venues) + internalDistance(venues);
};

// #endregion

// #region Route Optimization Algorithms

const nearestNeighbor = (
  userLat: number, userLng: number,
  venues: Venue[]
): Venue[] => {
  const unvisited = [...venues];
  const ordered: Venue[] = [];
  let curLat = userLat;
  let curLng = userLng;

  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    unvisited.forEach((v, i) => {
      const d = haversineDistance(curLat, curLng, v.latitude, v.longitude);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    });
    const nearest = unvisited.splice(nearestIdx, 1)[0];
    ordered.push(nearest);
    curLat = nearest.latitude;
    curLng = nearest.longitude;
  }
  return ordered;
};

const twoOpt = (
  userLat: number, userLng: number,
  venues: Venue[]
): Venue[] => {
  let best = [...venues];
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const newRoute = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ];
        if (internalDistance(newRoute) < internalDistance(best)) {
          best = newRoute;
          improved = true;
        }
      }
    }
  }
  return best;
};

// #endregion

// #region Venue Categorization

const NIGHTLIFE_KEYWORDS = ["bar", "lounge", "club", "tavern", "pub", "brewery"];
const FOOD_KEYWORDS = ["grill", "restaurant", "kitchen", "diner", "cafe", "bistro", "eatery"];

const getVenueCategory = (venue: Venue): "food" | "nightlife" | "activity" => {
  const types = venue.types ?? [];
  if (types.includes("bar") || types.includes("night_club")) return "nightlife";
  if (types.includes("restaurant") || types.includes("cafe") || 
      types.includes("meal_takeaway") || types.includes("bakery")) return "food";
  
  // Fall back to name-based detection
  const name = venue.name.toLowerCase();
  if (NIGHTLIFE_KEYWORDS.some(k => name.includes(k))) return "nightlife";
  if (FOOD_KEYWORDS.some(k => name.includes(k))) return "food";
  return "activity";
};

// #endregion

// #region Sanity Check

const sanityCheck = (venues: Venue[]): Venue[] => {
  const result = [...venues];

  for (let i = 0; i < result.length - 1; i++) {
    const curr = getVenueCategory(result[i]);
    const next = getVenueCategory(result[i + 1]);
    if (curr === "nightlife" && next === "food") {
      [result[i], result[i + 1]] = [result[i + 1], result[i]];
    }
  }

  for (let i = 0; i < result.length - 1; i++) {
    const curr = getVenueCategory(result[i]);
    const next = getVenueCategory(result[i + 1]);
    if (curr === next && curr !== "activity" && i + 2 < result.length) {
      [result[i + 1], result[i + 2]] = [result[i + 2], result[i + 1]];
    }
  }

  return result;
};

// #endregion

// #region Main Route Optimization API


// Optimizes for AI-generated routes, keeping the first venue fixed and 
// optimizing the rest for flow and distance. 

export const optimizeRoute = (
  userLat: number,
  userLng: number,
  venues: Venue[]
): Venue[] => {
  if (venues.length <= 2) return venues;
  const first = venues[0];
  const rest = venues.slice(1);

  const nn = nearestNeighbor(first.latitude, first.longitude, rest);
  const optimized = twoOpt(first.latitude, first.longitude, nn);
  const checked = sanityCheck(optimized);
  return [first, ...checked];

};

// Optimizes for purely user-generated routes, 
// allowing the first venue to shift for better flow.

export const optimizeRouteFromUser = (
  userLat: number,
  userLng: number,
  venues: Venue[]
): Venue[] => {
  if (venues.length === 0) return venues;
  if (venues.length <= 2) {
    // Still run nearest neighbor for 1-2 venues to get correct order from user location
    return nearestNeighbor(userLat, userLng, venues);
  }

  const nn = nearestNeighbor(userLat, userLng, venues);
  const optimized = twoOpt(userLat, userLng, nn);
  const checked = sanityCheck(optimized);

  return checked;
};

// #endregion