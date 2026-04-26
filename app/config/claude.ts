// #region Imports

import { filterCityVenues, getCityVenues } from "./cityVenues";
import { PlaceHours } from "./places";

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
    : "7:00 AM";

  const dayContext = isToday
    ? `today (${new Date().toLocaleDateString("en-US", { weekday: "long" })})`
    : `this ${travelDay.charAt(0) + travelDay.slice(1).toLowerCase()}`;

  const allVenues = await getCityVenues("countries/usa/texas/austin");
  const filtered = filterCityVenues(allVenues, venuePreferences, latitude, longitude, budget, depth);
  const placesList = filtered
    .map((p, i) => {
      const hours = p.placeHours?.weekdayText?.join(", ") ?? "Hours unknown";
      return `${i + 1}. ${p.name} (${p.address}) — VenueType: ${p.venueType} — Rating: ${p.rating ?? "N/A"} — Hours: ${hours}`;
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

Your job is to select and ORDER stops for an optimized day itinerary. Aim for the following number of stops based on the user's pace:
- easy: 4-5 stops
- typical: 5-7 stops
- hustle: 7-9 stops

Only deviate from these targets if there genuinely aren't enough suitable venues available, or if hours of operation make it impossible to fit more stops into the day. 
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
- The user is planning for ${dayContext}, starting at ${currentTime} — only recommend stops that make sense from this point onwards
- Cross-check each venue's hours of operation for ${dayContext} before recommending it — skip any venue that will be closed or closing soon by the time the user would reasonably arrive
- Each venue type has a natural time window — respect these when sequencing stops:
${Object.entries(VENUE_TIME_WINDOWS).map(([type, window]) => `  • ${type}: ${window}`).join("\n")}
- Use common sense — if a venue closes at 2:30 PM and the user could arrive by 2:00 PM, it's a valid stop even if it's near closing
- Parks and outdoor venues should be visited before local sundown

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
  console.log("Claude raw response:", clean);

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

export const generateJustification = async (
  name: string,
  address: string,
  types: string[],
  time: string,
  pace: string,
  budget: string,
  notes: string,
): Promise<string> => {
  const prompt = `You are a knowledgeable local travel advisor. A traveler has chosen to visit this venue:

Name: ${name}
Address: ${address}
Type: ${types.slice(0, 3).join(", ")}

Their travel preferences:
- Trip length: ${time || "a full day"}
- Pace: ${pace || "well-paced"}
- Budget: ${budget || "flexible"}
- Notes: ${notes || "None"}

Write exactly ONE enthusiastic sentence (max 20 words) explaining why this is a great choice given their preferences. Be specific to the venue. No generic phrases.`;

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
        max_tokens: 100,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    if (data.type === "error") return "";
    return data.content[0].text.trim();
  } catch {
    return "";
  }
};

// #endregion