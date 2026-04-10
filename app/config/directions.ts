export type RouteLeg = {
  fromIndex: number;
  toIndex: number;
  walkingDuration: number; // minutes
  walkingDistance: number; // miles
  drivingDuration: number | null; // minutes, null if walking <= 10 min
  walkingCoordinates: [number, number][];
  drivingCoordinates: [number, number][] | null;
};

export const getDefaultMode = (leg: RouteLeg, pace: string): "walking" | "driving" => {
  if (!leg.drivingDuration) return "walking";
  if (pace.toLowerCase().includes("hustle")) return "driving";
  if (pace.toLowerCase().includes("easy")) return "walking";
  return leg.walkingDuration <= 15 ? "walking" : "driving";
};

const getRoute = async (
  from: [number, number],
  to: [number, number],
  mode: "walking" | "driving"
): Promise<{ duration: number; distance: number; coordinates: [number, number][] }> => {
  const url = `https://api.mapbox.com/directions/v5/mapbox/${mode}/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&access_token=${process.env.EXPO_PUBLIC_MAPBOX_TOKEN}`;
  const response = await fetch(url);
  const data = await response.json();
  if (!data.routes || data.routes.length === 0) {
    throw new Error("No route found");
  }
  const route = data.routes[0];
  return {
    duration: Math.round(route.duration / 60),
    distance: Math.round(route.distance * 0.000621371 * 10) / 10,
    coordinates: route.geometry.coordinates,
  };
};

export const getRouteLegs = async (
  userLocation: [number, number],
  venues: { latitude: number; longitude: number }[]
): Promise<RouteLeg[]> => {
  const points: [number, number][] = [
    userLocation,
    ...venues.map(v => [v.longitude, v.latitude] as [number, number]),
  ];

  const legs: RouteLeg[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];

    const walking = await getRoute(from, to, "walking");
    const needsDriving = walking.duration > 10;
    const driving = needsDriving ? await getRoute(from, to, "driving") : null;

    legs.push({
      fromIndex: i,
      toIndex: i + 1,
      walkingDuration: walking.duration,
      walkingDistance: walking.distance,
      drivingDuration: driving?.duration ?? null,
      walkingCoordinates: walking.coordinates,
      drivingCoordinates: driving?.coordinates ?? null,
    });
  }

  return legs;
};