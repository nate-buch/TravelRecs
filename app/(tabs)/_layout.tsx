import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: {
        height: 60 + insets.bottom,
        paddingBottom: insets.bottom,
        paddingTop: 0,
        backgroundColor: "#fff",
        borderTopWidth: 0,
        borderTopColor: "#111",
        elevation: 0,
      },
      tabBarItemStyle: {
        borderWidth: 0,
        overflow: "visible",
      },
      tabBarActiveTintColor: "#111",
      tabBarInactiveTintColor: "#999",
      tabBarActiveBackgroundColor: "#f0f0f0",
      tabBarInactiveBackgroundColor: "#fff",
      tabBarLabelStyle: { 
        fontSize: 15,
        fontWeight: "800",
      },
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