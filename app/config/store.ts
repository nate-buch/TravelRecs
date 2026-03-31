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
  setPreferences: (time: string, pace: string, budget: string, notes: string) => void;
  setVenues: (venues: Venue[]) => void;
  setRouteLegs: (legs: RouteLeg[]) => void;
};

export const useAppStore = create<AppStore>((set) => ({
  time: "",
  pace: "",
  budget: "",
  notes: "",
  venues: [],
  routeLegs: [],
  setPreferences: (time, pace, budget, notes) => set({ time, pace, budget, notes }),
  setVenues: (venues) => set({ venues }),
  setRouteLegs: (legs) => set({ routeLegs: legs }),
}));