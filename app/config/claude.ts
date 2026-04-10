// #region Imports

import { PlacesVenue } from "./places";

// #endregion

// #region Types and Constants

export type Venue = {
  name: string;
  latitude: number;
  longitude: number;
  justification: string;
  hours: string;
  address: string;
  types?: string[];
  venueType?: string;
  locked?: boolean;
  pending?: boolean;  // true when added via search, not yet placed in route
};

// #endregion

// #region Generate Itinerary API Call

  export const generateItinerary = async (
    latitude: number,
    longitude: number,
    time: string,
    pace: string,
    budget: string,
    notes: string,
    nearbyPlaces: PlacesVenue[]
  ): Promise<Venue[]> => {

  // #region Build Context

  const currentTime = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const placesList = nearbyPlaces
    .map((p, i) => `${i + 1}. ${p.name} (${p.address}) — Types: ${p.types.slice(0, 3).join(", ")} — Rating: ${p.rating ?? "N/A"} — Open now: ${p.openNow ?? "unknown"}`)
    .join("\n");

  // #endregion

  // #region Build Prompt
  const prompt = 
`You are an expert local travel curator and route optimizer. The user is at coordinates ${latitude}, ${longitude}. The current time is ${currentTime}.

Their preferences:
- Time available: ${time}
- Pace: ${pace}
- Budget: ${budget}
- Special instructions (MUST follow these): ${notes || "None"}

Here are real nearby places from Google Places:
${placesList}

Your job is to select and ORDER several stops for an optimized day itinerary. Follow these rules strictly:

ROUTING RULES:
- Order stops to minimize total travel distance — avoid criss-crossing or backtracking as much as possible
- Strongly lean toward grouping nearby stops together

SEQUENCE RULES:
- Follow a logical progression: daytime activities → dinner → drinks/nightlife
- Never place nightlife before a sit-down meal; late-night food can come after drinks but not before
- Never place live music venues before dinner unless it's a daytime show

TIMING RULES:
- Current time is ${currentTime} — only recommend stops that make sense from now onwards
- Breakfast spots → morning only (before 11am)
- Lunch restaurants → around 11:00am-2:00pm
- Museums, galleries, attractions → daytime (9am-6pm), and cross-check their days and hours of operation
- Bars, cocktail lounges, nightlife → after 5pm
- Parks and outdoor spots → daytime, avoid if near closing
- If a venue is likely closed now, or will be by the time the user reaches it, skip it

DIVERSITY RULES:
- Avoid placing two sit-down food establishments back to back
- Small bites, cafes, and street food are more flexible and can be interspersed anywhere
- Mix venue types where possible — alternate between activity/attraction types to create a dynamic day of experiences
- Consider when the user would be eating, and avoid recommending another food stop immediately after — they might want to walk or do an activity in between

You MUST respond with ONLY a valid JSON array of venue names, no other text. Example format:
[
  {
    "name": "Exact venue name from the list above",
    "justification": "One sentence tailored to their preferences and why NOW is a good time to visit",
    "hours": "Opening hours if known, otherwise Verify before visiting",
    "venueType": "one of: coffee_shop, restaurant, museum, bar, park_viewpoint, live_music, attraction_landmark, art_gallery, market, nightclub, brewery"
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
    const parsed = JSON.parse(clean) as { name: string; justification: string; hours: string; venueType: string }[];
    return parsed.map(item => {
      const match = nearbyPlaces.find(p => p.name === item.name);
      return {
        name: item.name,
        latitude: match?.latitude ?? 0,
        longitude: match?.longitude ?? 0,
        address: match?.address ?? "",
        justification: item.justification,
        hours: item.hours,
        types: match?.types ?? [],
        venueType: item.venueType,
      };
    }).filter(v => v.latitude !== 0);
  } catch {
    throw new Error("Failed to parse itinerary. Please try again.");
  }

  // #endregion

};
// #endregion