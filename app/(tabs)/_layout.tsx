import { Tabs } from "expo-router";
import { Text } from "react-native";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerStyle: { height: 80 },
      headerTitle: () => (
        <Text style={{ fontSize: 18, fontWeight: "bold", letterSpacing: 2 }}>
          TRAVEL RECS: DAY PLANNER
        </Text>
      ),
      headerTitleAlign: "center",
    }}>
      <Tabs.Screen name="map" options={{}} />
      <Tabs.Screen name="itinerary" options={{}} />
      <Tabs.Screen name="preferences" options={{}} />
    </Tabs>
  );
}