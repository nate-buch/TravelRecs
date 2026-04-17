import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs screenOptions={{
      headerShown: false,
      headerTitleAlign: "center",
      tabBarStyle: {
        height: 60 + insets.bottom,
        paddingBottom: insets.bottom,
        paddingTop: 5,
      },
      tabBarLabelStyle: { fontSize: 14 },
      headerTitle: () => (
        <Text style={{ fontSize: 20, fontWeight: "bold", letterSpacing: 2 }}>
          TRAVEL RECS: DAY PLANNER
        </Text>
      ),
    }}>
      <Tabs.Screen
        name="map"
        options={{
          title: "Map",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="itinerary"
        options={{
          title: "Itinerary",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="preferences"
        options={{
          title: "Preferences",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="options-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}