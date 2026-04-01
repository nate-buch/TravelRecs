import { create } from "zustand";
import { Venue } from "./claude";
import { RouteLeg } from "./directions";

type AppStore = {
  time: string;
  pace: string;
  budget: string;
  notes: string;
  venues: Venue[];
  routeLegs: RouteLeg[];
  location: { latitude: number; longitude: number } | null;
  setPreferences: (time: string, pace: string, budget: string, notes: string) => void;
  setVenues: (venues: Venue[]) => void;
  setRouteLegs: (legs: RouteLeg[]) => void;
  setLocation: (location: { latitude: number; longitude: number } | null) => void;
};

export const useAppStore = create<AppStore>((set) => ({
  time: "",
  pace: "",
  budget: "",
  notes: "",
  venues: [],
  routeLegs: [],
  location: null,
  setPreferences: (time, pace, budget, notes) => set({ time, pace, budget, notes }),
  setVenues: (venues) => set({ venues }),
  setRouteLegs: (legs) => set({ routeLegs: legs }),
  setLocation: (location) => set({ location }),
}));