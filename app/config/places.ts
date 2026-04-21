export type PlacesVenue = {
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  types: string[];
  rating?: number;
  openNow?: boolean;
  placeId?: string;
};

export const getNearbyPlaces = async (
  latitude: number,
  longitude: number,
  radius: number = 3000
): Promise<PlacesVenue[]> => {
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=${radius}&key=${process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Places API error: ${data.status}`);
  }

  return data.results.map((place: any) => ({
    name: place.name,
    latitude: place.geometry.location.lat,
    longitude: place.geometry.location.lng,
    address: place.vicinity,
    types: place.types,
    rating: place.rating,
    openNow: place.opening_hours?.open_now,
    placeId: place.place_id,
  }));
};

export type PlaceHours = {
  weekdayText: string[];  // e.g. ["Monday: 9:00 AM – 5:00 PM", ...]
  periods: {
    day: number;          // 0=Sunday, 1=Monday, etc.
    openTime: string;     // "0900"
    closeTime: string;    // "1700"
  }[];
};

export const getPlaceDetails = async (placeId: string): Promise<PlaceHours | null> => {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=opening_hours&key=${process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status !== "OK" || !data.result?.opening_hours) return null;
    
    const hours = data.result.opening_hours;
    return {
      weekdayText: hours.weekday_text ?? [],
      periods: (hours.periods ?? []).map((p: any) => ({
        day: p.open.day,
        openTime: p.open.time,
        closeTime: p.close?.time ?? "2359",
      })),
    };
  } catch {
    return null;
  }
};

// #region Days and Hours Extraction

export type DayBar = {
  day: string;      // "Mo", "Tu" etc
  isOpen: boolean;
};

const DAY_MAP: Record<string, string> = {
  "today": "",  // resolved at call time
  "MON": "Monday",
  "TUE": "Tuesday",
  "WED": "Wednesday",
  "THU": "Thursday",
  "FRI": "Friday",
  "SAT": "Saturday",
  "SUN": "Sunday",
};

const TODAY_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const resolveDay = (travelDay: string): string => {
  if (travelDay === "today") return TODAY_DAY_NAMES[new Date().getDay()];
  return DAY_MAP[travelDay] ?? "";
};

export type HoursDisplay = {
  text: string;
  isOpen: boolean;
};

export const getHoursForDay = (
  hours: string[],
  travelDay: string
): HoursDisplay => {
  if (!hours || !Array.isArray(hours) || hours.length === 0)
    return { text: "Verify before visiting", isOpen: true };

  const dayName = resolveDay(travelDay);
  const entry = hours.find(h => h.startsWith(dayName));

  if (!entry) return { text: "Verify before visiting", isOpen: true };

  const hoursStr = entry.split(": ").slice(1).join(": ");

  if (!hoursStr || hoursStr === "Closed")
    return { text: "Closed", isOpen: false };

  return { text: hoursStr, isOpen: true };
};

export const getDayBar = (hours: string[]): DayBar[] => {
  const days = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const fullNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  
  return days.map((day, i) => {
    const entry = hours.find(h => h.startsWith(fullNames[i]));
    const isOpen = entry ? !entry.includes("Closed") : false;
    return { day, isOpen };
  });
};

// #endregion

// #region Conflict Detection

export type ScheduleConflict = {
  arrivalConflict: boolean;
  departureConflict: boolean;
  hoursConflict: boolean;
};

export const getScheduleConflict = (

  arrivalTime: string,
  departureTime: string,
  hours: string[],
  travelDay: string
): ScheduleConflict => {
  const none = { arrivalConflict: false, departureConflict: false, hoursConflict: false };
  
  if (!hours || !Array.isArray(hours) || hours.length === 0) return none;
  
  const dayName = resolveDay(travelDay);

  const entry = hours.find(h => h.startsWith(dayName));
  if (!entry) return none;
  
  const hoursStr = entry.split(": ").slice(1).join(": ");
  if (!hoursStr || hoursStr === "Closed") return none;

  const parts = hoursStr.split(/\s[\u2013\u2014\-]\s/);
  if (parts.length < 2) return none;
  const [openStr, closeStr] = parts;

  if (!openStr || !closeStr) return none;

  const parseHoursTime = (timeStr: string): Date => {
    const [time, ampm] = timeStr.trim().split(/\s+/);
    const [hours, minutes] = time.split(":").map(Number);
    const date = new Date(2000, 0, 1);
    let h = hours;
    if (ampm === "AM" && hours === 12) h = 0;
    else if (ampm === "PM" && hours !== 12) h = hours + 12;
    if (h < 4) date.setDate(2);
    date.setHours(h, minutes, 0, 0);
    return date;
  };

  const parseScheduleTime = (timeStr: string): Date => {
    const [time, ampm] = timeStr.split(" ");
    const [hours, minutes] = time.split(":").map(Number);
    const date = new Date(2000, 0, 1);
    let h = hours;
    if (ampm === "AM" && hours === 12) h = 0;
    else if (ampm === "PM" && hours !== 12) h = hours + 12;
    if (h < 4) date.setDate(2);
    date.setHours(h, minutes, 0, 0);
    return date;
  };
  
  const openTime = parseHoursTime(openStr);
  const closeTime = parseHoursTime(closeStr);
  const arrival = parseScheduleTime(arrivalTime);
  const departure = parseScheduleTime(departureTime);

  const arrivalConflict = arrival < openTime || arrival >= closeTime;
  const departureConflict = departure > closeTime || departure <= openTime;
  const hoursConflict = arrivalConflict || departureConflict;

  return { arrivalConflict, departureConflict, hoursConflict };

};

// #endregion