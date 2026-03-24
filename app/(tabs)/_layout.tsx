import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="map" options={{ title: "Map" }} />
      <Tabs.Screen name="itinerary" options={{ title: "Itinerary" }} />
      <Tabs.Screen name="preferences" options={{ title: "Preferences" }} />
    </Tabs>
  );
}