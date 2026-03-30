import { create } from "zustand";

type PreferencesStore = {
  time: string;
  pace: string;
  budget: string;
  notes: string;
  setPreferences: (time: string, pace: string, budget: string, notes: string) => void;
};

export const usePreferencesStore = create<PreferencesStore>((set) => ({
  time: "",
  pace: "",
  budget: "",
  notes: "",
  setPreferences: (time, pace, budget, notes) => set({ time, pace, budget, notes }),
}));