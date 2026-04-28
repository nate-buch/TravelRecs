// #region Imports

import { VenueType } from "../shared/venueTypeMapping";

// #endregion

// #region Types

export type CityConfig = {
  cityPath: string;           // Firestore path
  zipCodes: string[];
  restaurantKeywords: string[];
  excludedPlaceIds: Set<string>;  // manually excluded venues
  includedPlaceIds: Set<string>;  // force-included venues that might fail filters
  venueTypeOverrides: Record<string, VenueType>; // manually override wrong types
  venueNameOverrides: Record<string, string>;
};

// #endregion

// #region City Configs

export const CITY_CONFIGS: Record<string, CityConfig> = {

"austin-tx": {
  cityPath: "countries/usa/texas/austin",
  zipCodes: ["78701", "78702", "78704"],
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
  venueTypeOverrides: {},
  venueNameOverrides: {
    "ChIJNZ29lk20RIYRLLDwJHtZExY": "Festival Beach Park", 
    "ChIJh31x-NK1RIYRIyeTCHwKFoc": "Everest Momo & Food Truck",
    "ChIJwYlSqae1RIYRyqQConsdnyc": "Iron Cactus",
    "ChIJq-GPb--1RIYRWZzC76jq704": "Santa Catarina",
    "ChIJk-YOCri1RIYRiu30qDjUFQ4": "Figure 8 Coffee",
    "ChIJsXlPfo-1RIYRjhLlOWNbgT4": "WEIRD FOOD Chicken & Halal",
    "ChIJ6xuoSw-1RIYRl2bhcYygHEk": "ACL Live",
    "ChIJSfh_QgW1RIYRMGJ2BEpGG1c": "Auditorium Shores",
    "ChIJH4KXLiO1RIYRKGe7mhund5g": "Congress Ave Bat Bridge",
    "ChIJcfPlAQC1RIYRjitW4SDog1M": "Eggman ATX",
    "ChIJ0xmkOpJKW4YRsrJkHS-iZLw": "Westlake Performing Arts Center",
    "ChIJu2YX6yi0RIYRrBTvYTY-yCM": "Guerrero Colorado River Park",  
  },
},

};

// #endregion