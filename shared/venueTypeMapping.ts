// #region Venue Type

export type VenueType =
  | "coffee_shop"
  | "restaurant"
  | "museum"
  | "bar"
  | "park_viewpoint"
  | "live_music"
  | "performing_arts"
  | "attraction_landmark"
  | "art_gallery"
  | "market"
  | "nightclub"
  | "brewery"
  | "street_food"
  | "cultural_heritage";

// #endregion

// #region Google Type Mapping

// Maps Google Places types to our internal venue type buckets.
// Order matters — first match wins when a place has multiple types.
const GOOGLE_TYPE_TO_VENUE_TYPE: Partial<Record<string, VenueType>> = {
  // Coffee & Cafes
  "cafe":                    "coffee_shop",
  "bakery":                  "coffee_shop",

  // Restaurants
  "restaurant":              "restaurant",
  "meal_takeaway":           "street_food",

  // Museums
  "museum":                  "museum",

  // Bars
  "bar":                     "bar",

  // Parks & Viewpoints
  "park":                    "park_viewpoint",
  "natural_feature":         "park_viewpoint",

  // Performing Arts
  "performing_arts_theater": "performing_arts",

  // Attractions & Landmarks
  "tourist_attraction":      "attraction_landmark",
  "amusement_park":          "attraction_landmark",
  "stadium":                 "attraction_landmark",

  // Art Galleries
  "art_gallery":             "art_gallery",

  // Nightlife
  "night_club":              "nightclub",

  // Cultural Heritage — religious types require tourist_attraction co-tag
  "church":                  "cultural_heritage",
  "hindu_temple":            "cultural_heritage",
  "mosque":                  "cultural_heritage",
  "synagogue":               "cultural_heritage",
  "cemetery":                "cultural_heritage",
  "library":                 "cultural_heritage",
};

// Religious types that require a tourist_attraction co-tag to pass
const RELIGIOUS_TYPES = new Set([
  "church", "hindu_temple", "mosque", "synagogue", "cemetery"
]);

// #endregion

// #region Exported Function

// Maps a Google place's types array to our internal venue type.
// Returns null if no match or if a religious place lacks a tourist co-tag.
export const getVenueTypeForPlace = (types: string[]): VenueType | null => {
  const typeSet = new Set(types);

  const hasReligiousType = types.some(t => RELIGIOUS_TYPES.has(t));
  if (hasReligiousType) {
    if (!typeSet.has("tourist_attraction") && !typeSet.has("point_of_interest")) return null;
    return "cultural_heritage";
  }

  for (const type of types) {
    const venueType = GOOGLE_TYPE_TO_VENUE_TYPE[type];
    if (venueType) return venueType;
  }

  return null;
};

// #endregion