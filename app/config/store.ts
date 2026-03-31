import { create } from "zustand";
import { Venue } from "./claude";

type AppStore = {
  time: string;
  pace: string;
  budget: string;
  notes: string;
  venues: Venue[];
  setPreferences: (time: string, pace: string, budget: string, notes: string) => void;
  setVenues: (venues: Venue[]) => void;
};

export const useAppStore = create<AppStore>((set) => ({
  time: "",
  pace: "",
  budget: "",
  notes: "",
  venues: [],
  setPreferences: (time, pace, budget, notes) => set({ time, pace, budget, notes }),
  setVenues: (venues) => set({ venues }),
}));