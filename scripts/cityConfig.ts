// #region Types

export type CityConfig = {
  cityPath: string;           // Firestore path
  zipCodes: string[];
  restaurantKeywords: string[];
  excludedPlaceIds: Set<string>;  // manually excluded venues
  includedPlaceIds: Set<string>;  // force-included venues that might fail filters
};

// #endregion

// #region City Configs

export const CITY_CONFIGS: Record<string, CityConfig> = {

"austin-tx": {
  cityPath: "countries/usa/texas/austin",
  zipCodes: ["78702"],
  restaurantKeywords: ["bbq", "tacos", "tex-mex", "breakfast", "food truck"],
  excludedPlaceIds: new Set([
    "ChIJJ5YY6YzLRIYRwehkJIJIhOg",  // K1 Speed Austin
    "ChIJMzqXQzG1RIYRBXa63Rh8aO0",  // MED 420 ATX
    "ChIJizb87hu1RIYRBAj41G3cmV8",  // Gyu-Kaku Japanese BBQ
    "ChIJoZsHcQi1RIYRfyBnp0UxNMI",  // Cooper's Old Time Pit Bar-B-Que
    "ChIJ0-ulpES1RIYRLNAsBVFpLoU",  // Snooze, an A.M. Eatery
  ]),
  includedPlaceIds: new Set([
    "ChIJh30H8Ei0RIYRaBy-_5Y7Mow",  // Peace Point at Lady Bird Lake
    "ChIJsydngTO0RIYRZD6iXMFulUE",  // Holly Shores at Town Lake
  ]),
},

};

// #endregion