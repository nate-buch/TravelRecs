// #region Imports

import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAppStore } from "../config/store";

// #endregion

// #region Types and Constants

type TravelDay = "today" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

const DAY_NAMES: TravelDay[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const buildReel = (): TravelDay[] => {
  const todayIndex = new Date().getDay(); // 0=Sun, 1=Mon, etc.
  // Insert TODAY between yesterday and today's day type
  const reel: TravelDay[] = [...DAY_NAMES];
  reel.splice(todayIndex, 0, "today");
  return reel;
};

const REEL = buildReel();

// #endregion

// #region Component

export function DaySelector() {
  const { travelDay, setTravelDay } = useAppStore();

  const currentIndex = REEL.indexOf(travelDay);

  const goBack = () => {
    const newIndex = (currentIndex - 1 + REEL.length) % REEL.length;
    setTravelDay(REEL[newIndex]);
  };

  const goForward = () => {
    const newIndex = (currentIndex + 1) % REEL.length;
    setTravelDay(REEL[newIndex]);
  };

  const displayLabel = travelDay === "today" ? "TODAY" : travelDay;

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={goBack}>
        <Text style={styles.chevron}>◀</Text>
      </TouchableOpacity>
      <View style={styles.labelContainer}>
        <Text style={styles.label}>{displayLabel}</Text>
      </View>
      <TouchableOpacity onPress={goForward}>
        <Text style={styles.chevron}>▶</Text>
      </TouchableOpacity>
    </View>
  );
}

// #endregion

// #region Styles

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 0,
  },
  chevron: {
    fontSize: 18,
    fontWeight: "900",
    color: "#444",
    paddingHorizontal: 0,
  },
  labelContainer: {
    width: 56,
    alignItems: "center",
  },
  label: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
    letterSpacing: 1,
  },
});

// #endregion