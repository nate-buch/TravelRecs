import { PlacesVenue } from "./places";

export type Venue = {
  name: string;
  latitude: number;
  longitude: number;
  justification: string;
  hours: string;
  address: string;
};

export const generateItinerary = async (
  latitude: number,
  longitude: number,
  time: string,
  pace: string,
  budget: string,
  notes: string,
  nearbyPlaces: PlacesVenue[]
): Promise<Venue[]> => {
  const currentTime = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const placesList = nearbyPlaces
    .map((p, i) => `${i + 1}. ${p.name} (${p.address}) — Types: ${p.types.slice(0, 3).join(", ")} — Rating: ${p.rating ?? "N/A"} — Open now: ${p.openNow ?? "unknown"}`)
    .join("\n");

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
      messages: [
        {
          role: "user",
          content: `You are a local expert travel curator. The user is at coordinates ${latitude}, ${longitude}. The current time is ${currentTime}.

Their preferences:
- Time available: ${time}
- Pace: ${pace}
- Budget: ${budget}
- Notes: ${notes || "None"}

Here are real nearby places from Google Places:
${placesList}

From this list, select the 5-8 best stops for this specific traveler. Consider:
- Current time and opening hours
- Logical geographic order to minimize travel
- The user's pace and budget preferences
- A good mix of experiences

You MUST respond with ONLY a valid JSON array of venue names, no other text. Example format:
[
  {
    "name": "Exact venue name from the list above",
    "justification": "One sentence tailored to their preferences",
    "hours": "Mon-Sat: 9am-5pm"
  }
]`,
        },
      ],
    }),
  });

  const data = await response.json();
  if (data.type === "error") {
    throw new Error(data.error.message);
  }
  const text = data.content[0].text;
  const clean = text.replace(/```json|```/g, "").trim();
    try {
    const parsed = JSON.parse(clean) as { name: string; justification: string; hours: string }[];
    return parsed.map(item => {
        const match = nearbyPlaces.find(p => p.name === item.name);
        return {
        name: item.name,
        latitude: match?.latitude ?? 0,
        longitude: match?.longitude ?? 0,
        address: match?.address ?? "",
        justification: item.justification,
        hours: item.hours,
        };
    }).filter(v => v.latitude !== 0);
    } catch {
    throw new Error("Failed to parse itinerary. Please try again.");
    }
};