// #region Imports

import { filterCityVenues, getCityVenues } from "./cityVenues";
import { PlaceHours, resolveDay } from "./places";
import { DEFAULT_END_TIME, DEFAULT_START_TIME } from "./travel";

// #endregion

// #region Types and Constants

export type Venue = {
  name: string;
  latitude: number;
  longitude: number;
  justification: string;
  hours: string[];
  placeId?: string;
  placeHours?: PlaceHours;
  address: string;
  types?: string[];
  venueType?: string
  priceLevel?: number | null;
  normalizedReviewScore?: number;
  venueGravity?: number;
  locked?: boolean;
  pending?: boolean;
};

// #endregion

// #region Generate Itinerary API Call

  export const generateItinerary = async (
    latitude: number,
    longitude: number,
    depth: string[],
    pace: string,
    budget: string,
    notes: string,
    venuePreferences: Record<string, "love" | "hate" | "neutral">,
    travelDay: string,
  ): Promise<Venue[]> => {

  // #region Build Context

  const isToday = travelDay === "today";
  const currentTime = isToday
    ? new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : DEFAULT_START_TIME;

  const dayContext = isToday
    ? `today (${new Date().toLocaleDateString("en-US", { weekday: "long" })})`
    : `this ${travelDay.charAt(0) + travelDay.slice(1).toLowerCase()}`;

  const allVenues = await getCityVenues("countries/usa/texas/austin");
  const filtered = filterCityVenues(allVenues, venuePreferences, latitude, longitude, budget, depth);
  
console.log("venuePreferences at filter time:", JSON.stringify(venuePreferences));
console.log("filtered count:", filtered.length);
console.log("sample types:", filtered.slice(0, 10).map(v => `${v.name}: ${v.venueType}`));
  
  const placesList = filtered
    .map((p, i) => {
      const dayName = resolveDay(travelDay);
      const todayHours = p.placeHours?.weekdayText?.find(h => h.startsWith(dayName)) ?? "Hours unknown";
      const hoursDisplay = todayHours.includes(": ") ? todayHours.split(": ").slice(1).join(": ") : todayHours;
      return `${i + 1}. ${p.name} (${p.address}) — VenueType: ${p.venueType} — Rating: ${p.rating ?? "N/A"} — Score: ${p.normalizedReviewScore?.toFixed(2) ?? "N/A"} — ${dayContext} hours: ${hoursDisplay}`;
    })
    .join("\n");

  // #endregion

  // #region Build Prompt

  const VENUE_TIME_WINDOWS: Record<string, string> = {
    coffee_shop:         "anytime in the morning, midday, or early afternoon",
    restaurant:          "anytime midday, or broadly in the late afternoon through late evening",
    bar:                 "anytime from late afternoon onward",
    street_food:         "anytime the venue is open",
    brewery:             "anytime the venue is open",
    cultural_heritage:   "anytime the venue is open",
    attraction_landmark: "anytime the venue is open",
    museum:              "anytime the venue is open",
    art_gallery:         "anytime the venue is open",
    performing_arts:     "anytime the venue is open",
    live_music:          "anytime the venue is open",
    nightclub:           "anytime in the evening onward",
    market:              "anytime the venue is open",
    park_viewpoint:      "anytime before local sundown",
  };

  const prompt = 
`You are an expert local travel curator and route optimizer. The user is at coordinates ${latitude}, ${longitude}. The user is planning their itinerary for ${dayContext}, starting at ${currentTime}.

Their preferences:
- Exploration depth: ${depth.length > 0 ? depth.join(", ") : "no preference"}
- Pace: ${pace}
- Budget: ${budget}
- Special instructions (MUST follow these): ${notes || "None"}

Here are real nearby places from Google Places:
${placesList}

Your job is to select a candidate pool of venues for an optimized day itinerary. Return MORE than the final number of stops — these candidates will be further optimized for geography and timing. Aim for the following candidate pool sizes based on the user's pace:
- easy: 10-12 candidates
- typical: 12-16 candidates
- hustle: 16-20 candidates

Only return fewer candidates if there genuinely aren't enough suitable venues available or if hours of operation make it impossible. Do NOT order the candidates — return them in any order.
Follow these rules strictly:

ROUTING RULES:
- Order stops to minimize total travel distance — avoid criss-crossing or backtracking as much as possible
- Strongly lean toward grouping nearby stops together

ROUTE COHERENCE GUIDELINES:
- Follow a logical progression through the day — daytime activities, then food, then evening drinks or nightlife
- Avoid placing two sit-down food establishments back to back
- Small bites, cafes, and street food are more flexible and can be interspersed anywhere
- Mix venue types where possible — alternate between activity and food/drink stops to create a dynamic day
- Consider when the user would be eating, and avoid recommending another food stop immediately after

TIMING RULES:
- The user's travel window is ${currentTime} to ${DEFAULT_END_TIME}. Only recommend venues that are open during
some part of this window. If a venue is already closed or closes before the user could reasonably reach it as a 
first stop, exclude it entirely.

DEPTH DISTRIBUTION RULES:
- Depth tiers map to normalizedReviewScore ranges: sightsee=0.8-1.0, explore=0.5-0.8, go_local=0.2-0.5
- The user has selected these depth tiers: ${depth.length > 0 ? depth.join(", ") : "sightsee, explore, go_local"}
- Aim to distribute candidates roughly equally across the selected depth tiers
- If a tier has insufficient venues, do your best with what is available — do not pad or repeat venues

You MUST respond with ONLY a valid JSON array of venue names, no other text. Example format:
[
  {
    "name": "Exact venue name from the list above",
    "justification": "One sentence tailored to their preferences and why NOW is a good time to visit",
    "venueType": "one of: coffee_shop, restaurant, street_food, museum, bar, park_viewpoint, live_music, performing_arts, attraction_landmark, art_gallery, market, nightclub, brewery, cultural_heritage"
  }
]`
  ;
  // #endregion

  // #region Fetch Response

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  // #endregion

  // #region Parse Response

  const data = await response.json();
  if (data.type === "error") {
    throw new Error(data.error.message);
  }
  const text = data.content[0].text;
  const clean = text.replace(/```json|```/g, "").trim();

  // #endregion

  // #region Match Venues to Places Data

  try {
    const parsed = JSON.parse(clean) as { name: string; justification: string; venueType: string }[];
    
    const venues = await Promise.all(parsed.map(async item => {
      const match = filtered.find(p => p.name === item.name);

      return {
        name: item.name,
        latitude: match?.latitude ?? 0,
        longitude: match?.longitude ?? 0,
        address: match?.address ?? "",
        justification: item.justification,
        hours: match?.placeHours?.weekdayText ?? [],
        placeId: match?.placeId,
        placeHours: match?.placeHours ?? undefined,
        types: match?.types ?? [],
        venueType: item.venueType,
        priceLevel: match?.priceLevel ?? null,
        normalizedReviewScore: match?.normalizedReviewScore ?? undefined,
        venueGravity: match?.venueGravity ?? undefined,
        pending: false,
      };
    }));

    return venues.filter(v => v.latitude !== 0);
  } catch {
    throw new Error("Failed to parse itinerary. Please try again.");
  }

  // #endregion

};
// #endregion

// #region Generate Justification API Call

export const generateJustifications = async (
  venues: Venue[],
  timeBlocks: { arrivalTime: string; departureTime: string }[],
  pace: string,
  budget: string,
  depth: string[],
  notes: string,
  travelDay: string,
): Promise<string[]> => {
  const venueList = venues.map((v, i) => `
${i + 1}. ${v.name} (${v.address})
   Type: ${v.venueType}
   Arriving: ${timeBlocks[i]?.arrivalTime ?? "unknown"}
   Departing: ${timeBlocks[i]?.departureTime ?? "unknown"}`
  ).join("\n");

  const prompt = `You are a knowledgeable local travel advisor. A traveler has the following itinerary:

${venueList}

Their travel preferences:
- Pace: ${pace || "well-paced"}
- Budget: ${budget || "flexible"}
- Exploration style: ${depth.length > 0 ? depth.join(", ") : "no preference"}
- Notes: ${notes || "None"}
- Travel day: ${travelDay}

For EACH venue, write exactly ONE enthusiastic sentence (max 20 words) explaining why it's a great choice given the time of day they'll be visiting and their preferences. Be specific to the venue and reference the actual visit time where relevant. No generic phrases.

You MUST respond with ONLY a valid JSON array of strings, one per venue, in the same order. Example:
["Justification for venue 1", "Justification for venue 2"]`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    if (data.type === "error") return venues.map(() => "");
    const text = data.content[0].text.trim();
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as string[];
    return parsed;
  } catch {
    return venues.map(() => "");
  }
};

// #endregion