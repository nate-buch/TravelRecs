export const generateItinerary = async (
  latitude: number,
  longitude: number,
  time: string,
  pace: string,
  budget: string,
  notes: string
) => {
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

Return a curated list of 5 nearby places worth visiting for this specific traveler. For each place include:
1. Name
2. One sentence justification tailored to their preferences
3. Typical hours

Format as a simple numbered list.`,
        },
      ],
    }),
  });

  const data = await response.json();
  return data.content[0].text;
};