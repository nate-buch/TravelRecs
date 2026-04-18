import { create } from "zustand";
import { Venue } from "./claude";
import { RouteLeg } from "./directions";
import { TimeBlock } from "./schedule";

// #region Types

type AppStore = {

  // ─── User Preferences ────────────────────────────────────────────────────
  // Set on the Preferences tab, persisted to Firestore, and passed to Claude
  // when generating or re-generating an itinerary.

  time: string;       // Trip length (e.g. "full day", "weekend")
  pace: string;       // Travel pace (e.g. "typical", "hustle", "easy")
  budget: string;     // Budget level (e.g. "mid-range", "inexpensive", "YOLO vacay")
  notes: string;      // Freeform instructions passed verbatim to Claude

  // ─── Venue Preferences ───────────────────────────────────────────────────
  // Three-state toggles set on the Preferences tab. Keyed by venueType,
  // values are "love", "hate", or "neutral". Passed to Claude on generation.

  venuePreferences: Record<string, "love" | "hate" | "neutral">;
  setVenuePreferences: (prefs: Record<string, "love" | "hate" | "neutral">) => void;

  // ─── Device Location ─────────────────────────────────────────────────────
  // The user's GPS coordinates, obtained on app load. Used as the starting
  // point for route optimization and itinerary generation.

  location: { latitude: number; longitude: number } | null;

  // ─── Active Itinerary ─────────────────────────────────────────────────────
  // The currently displayed itinerary. All four arrays are parallel:
  // index N in each array refers to the same stop.
  // routeLegs[0] = leg from user location → venues[0], etc.

  venues: Venue[];                        // Ordered list of itinerary stops
  routeLegs: RouteLeg[];                  // Mapbox-fetched legs between stops
  timeBlocks: TimeBlock[];                // Arrival/departure schedule per stop
  legModes: ("walking" | "driving")[];    // Selected travel mode per leg

  // ─── Venue Additions and Removals ────────────────────────────────────────
  // removedVenueNames: explicitly removed venues, passed to Claude on
  //   Re-Generate so they are not suggested again. Cleared on "Generate New".
  // Venues added via search are inserted directly into the venues array
  //   with pending: true and become full draggable participants immediately.

  removedVenueNames: string[];

  // ─── Actions ─────────────────────────────────────────────────────────────

  // Itinerary metadata
  setPreferences: (time: string, pace: string, budget: string, notes: string) => void;
  setLocation: (location: { latitude: number; longitude: number } | null) => void;

  // Active itinerary
  setVenues: (venues: Venue[]) => void;
  setRouteLegs: (legs: RouteLeg[]) => void;
  setTimeBlocks: (blocks: TimeBlock[]) => void;
  setLegModes: (modes: ("walking" | "driving")[]) => void;
  setItinerary: (venues: Venue[], legs: RouteLeg[], modes: ("walking" | "driving")[], blocks: TimeBlock[]) => void;

  // Removal tracking — addRemovedVenueName silently ignores already-tracked names
  addRemovedVenueName: (name: string) => void;
  clearRemovedVenueNames: () => void;
  
};

// #endregion

// #region Store

export const useAppStore = create<AppStore>((set, get) => ({

  // ─── User Preferences ────────────────────────────────────────────────────
  time: "",
  pace: "",
  budget: "",
  notes: "",

  // ─── Venue Preferences ───────────────────────────────────────────────────
  venuePreferences: {},
  setVenuePreferences: (prefs) => set({ venuePreferences: prefs }),

  // ─── Device Location ─────────────────────────────────────────────────────
  location: null,

  // ─── Active Itinerary ────────────────────────────────────────────────────
  venues: [],
  routeLegs: [],
  timeBlocks: [],
  legModes: [],

  // ─── Venue Additions and Removals ────────────────────────────────────────
  removedVenueNames: [],

  // ─── Actions ─────────────────────────────────────────────────────────────

  // Itinerary metadata
  setPreferences: (time, pace, budget, notes) => set({ time, pace, budget, notes }),
  setLocation: (location) => set({ location }),

  // Active itinerary
  setVenues: (venues) => set({ venues }),
  setRouteLegs: (legs) => set({ routeLegs: legs }),
  setTimeBlocks: (blocks) => set({ timeBlocks: blocks }),
  setLegModes: (modes) => set({ legModes: modes }),
  setItinerary: (venues, legs, modes, blocks) => set({ venues, routeLegs: legs, legModes: modes, timeBlocks: blocks }),


  // Removal tracking
  addRemovedVenueName: (name) => {
    if (!get().removedVenueNames.includes(name)) {
      set({ removedVenueNames: [...get().removedVenueNames, name] });
    }
  },
  clearRemovedVenueNames: () => set({ removedVenueNames: [] }),

}));

// #endregion