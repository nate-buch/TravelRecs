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

export type Pace = "fast" | "medium" | "slow";

const DURATIONS: Record<VenueType, Record<Pace, number>> = {
  coffee_shop:         { fast: 15,  medium: 15,  slow: 30  },
  restaurant:          { fast: 45,  medium: 60,  slow: 90  },
  museum:              { fast: 60,  medium: 90,  slow: 120 },
  bar:                 { fast: 30,  medium: 45,  slow: 60  },
  park_viewpoint:      { fast: 15,  medium: 30,  slow: 45  },
  live_music:          { fast: 90,  medium: 120, slow: 150 },
  performing_arts:     { fast: 60,  medium: 90,  slow: 120 },
  attraction_landmark: { fast: 15,  medium: 15,  slow: 30  },
  art_gallery:         { fast: 30,  medium: 45,  slow: 60  },
  market:              { fast: 30,  medium: 30,  slow: 45  },
  nightclub:           { fast: 60,  medium: 90,  slow: 120 },
  brewery:             { fast: 30,  medium: 45,  slow: 60  },
  street_food:         { fast: 15,  medium: 15,  slow: 15  },
  cultural_heritage:   { fast: 15,  medium: 30,  slow: 45  },
};

export const getPace = (pace: string): Pace => {
  if (pace.toLowerCase().includes("hustle")) return "fast";
  if (pace.toLowerCase().includes("easy")) return "slow";
  return "medium";
};

export const getVenueDuration = (venueType: VenueType, pace: string): number => {
  const p = getPace(pace);
  return DURATIONS[venueType]?.[p] ?? 30;
};

export const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes}min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}hr ${mins}min` : `${hrs}hr`;
};

export const roundToQuarter = (minutes: number): number => {
  return Math.round(minutes / 15) * 15;
};

export const formatTime = (date: Date): string => {
  const hours = date.getHours();
  const mins = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  const m = mins.toString().padStart(2, "0");
  return `${h}:${m} ${ampm}`;
};