export const testClaude = async () => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Say hello from TravelRecs!' }],
      }),
    });
    const data = await response.json();
    console.log('Claude response:', JSON.stringify(data));
  } catch (error) {
    console.log('Claude error:', error);
  }
};