export type Venue = {
  name: string;
  latitude: number;
  longitude: number;
  justification: string;
  hours: string;
};

export const generateItinerary = async (
  latitude: number,
  longitude: number,
  time: string,
  pace: string,
  budget: string,
  notes: string
): Promise<Venue[]> => {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `You are a local expert travel curator. The user is at coordinates ${latitude}, ${longitude}.

Their preferences:
- Time available: ${time}
- Pace: ${pace}
- Budget: ${budget}
- Notes: ${notes || "None"}

Return a curated list of 5 nearby places worth visiting for this specific traveler.

You MUST respond with ONLY a valid JSON array, no other text. Example format:
[
  {
    "name": "Place Name",
    "latitude": 12.3456,
    "longitude": 12.3456,
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
    return JSON.parse(clean) as Venue[];
    } catch {
    throw new Error("Failed to parse itinerary. Please try again.");
    }
};