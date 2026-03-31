export type PlacesVenue = {
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  types: string[];
  rating?: number;
  openNow?: boolean;
};

export const getNearbyPlaces = async (
  latitude: number,
  longitude: number,
  radius: number = 1500
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
  }));
};