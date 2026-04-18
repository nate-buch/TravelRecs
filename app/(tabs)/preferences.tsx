// #region Imports

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { loadPreferences, savePreferences } from "../config/preferences";
import { useAppStore } from "../config/store";

// #endregion

// #region Types and Constants

const TIME_OPTIONS = [
  { id: "day",     label: "Just 1 Day",  desc: "Quick Trip"       },
  { id: "weekend", label: "2-3 Days",    desc: "Staying Around"   },
  { id: "week",    label: "5+ Days",     desc: "Exploring"        },
];

const PACE_OPTIONS = [
  { id: "easy",    label: "Easy",      desc: "Here to relax"          },
  { id: "typical", label: "Balanced",  desc: "Mix of speeds" },
  { id: "hustle",  label: "Hustle",    desc: "Go go go!"              },
];

const BUDGET_OPTIONS = [
  { id: "inexpensive", label: "Budget",   desc: "Keep it cheap"     },
  { id: "mid-range",   label: "Flexible", desc: "Worth-it splurges" },
  { id: "YOLO vacay",  label: "YOLO",     desc: "No regrets"        },
];

type HorizontalOptionProps = {
  options: { id: string; label: string; desc: string }[];
  selected: string;
  onSelect: (id: string) => void;
};

const VENUE_TYPES: { id: string; label: string }[] = [
  { id: "coffee_shop",         label: "Coffee & Cafes"     },
  { id: "restaurant",          label: "Restaurants"        },
  { id: "street_food",         label: "Street Food"        },
  { id: "museum",              label: "Museums"            },
  { id: "bar",                 label: "Bars"               },
  { id: "park_viewpoint",      label: "Parks & Viewpoints" },
  { id: "live_music",          label: "Live Music"         },
  { id: "attraction_landmark", label: "Landmarks"          },
  { id: "art_gallery",         label: "Art Galleries"      },
  { id: "market",              label: "Markets"            },
  { id: "nightclub",           label: "Nightlife"          },
  { id: "brewery",             label: "Breweries"          },
  { id: "cultural_heritage",   label: "Cultural Sites"     },
];

// #endregion

// #region Horizontal Option Row

function HorizontalOptions({ options, selected, onSelect }: HorizontalOptionProps) {
  return (
    <View style={styles.horizontalRow}>
      {options.map((o, i) => (
        <TouchableOpacity
          key={o.id}
          style={[
            styles.horizontalCard,
            selected === o.id && styles.horizontalCardSelected,
            i === 0 && styles.horizontalCardFirst,
            i === options.length - 1 && styles.horizontalCardLast,
          ]}
          onPress={() => onSelect(o.id)}
        >
          <Text style={[styles.horizontalCardLabel, selected === o.id && styles.horizontalCardLabelSelected]}>
            {o.label}
          </Text>
          <Text style={[styles.horizontalCardDesc, selected === o.id && styles.horizontalCardDescSelected]}>
            {o.desc}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// #endregion

// #region Main Component

export default function PreferencesScreen() {

  // #region Store

  const { setPreferences, setVenuePreferences } = useAppStore();

  // #endregion

  // #region Local States

  const [time, setTime] = useState("");
  const [pace, setPace] = useState("");
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const canSave = time && pace && budget;
  const [venuePreferences, setVenuePreferencesLocal] = useState<Record<string, "love" | "hate" | "neutral">>({});

  // #endregion

  // #region Load Saved Preferences

  useEffect(() => {
    (async () => {
      const saved = await loadPreferences();
      if (saved) {
        setTime(saved.time);
        setPace(saved.pace);
        setBudget(saved.budget);
        setNotes(saved.notes);
        if (saved.venuePreferences) setVenuePreferencesLocal(saved.venuePreferences);
      }
    })();
  }, []);

  // #endregion

  // #region Toggle Handler

  const cycleVenuePreference = (id: string) => {
    const current = venuePreferences[id] ?? "neutral";
    const next = current === "neutral" ? "love" : current === "love" ? "hate" : "neutral";
    setVenuePreferencesLocal({ ...venuePreferences, [id]: next });
  };

  // #endregion

  // #region Render

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.container}
        >

          <Text style={styles.heading}>TRAVEL PREFERENCES</Text>
          <View style={styles.headingDivider} />

          <Text style={styles.sectionTitle}>How long is your visit?</Text>
          <HorizontalOptions options={TIME_OPTIONS} selected={time} onSelect={setTime} />
          <View style={styles.sectionDivider} />

          <Text style={styles.sectionTitle}>How fast do you want to move?</Text>
          <HorizontalOptions options={PACE_OPTIONS} selected={pace} onSelect={setPace} />
          <View style={styles.sectionDivider} />

          <Text style={styles.sectionTitle}>How flexible is your budget?</Text>
          <HorizontalOptions options={BUDGET_OPTIONS} selected={budget} onSelect={setBudget} />
          <View style={styles.sectionDivider} />

          <Text style={styles.sectionTitle}>
            Anything you{" "}
            <Text style={styles.loveText}>LOVE </Text>
            <Ionicons name="heart" size={17} color="#2d9e5f" />
            {" or "}
            <Text style={styles.hateText}>HATE </Text>
            <Ionicons name="remove-circle" size={18} color="#c0392b" />
            {"?"}
          </Text>

          <View style={styles.venueTypeGrid}>
            {VENUE_TYPES.map((vt) => {
              const state = venuePreferences[vt.id] ?? "neutral";
              return (
                <TouchableOpacity
                  key={vt.id}
                  style={styles.venueTypeRow}
                  onPress={() => cycleVenuePreference(vt.id)}
                >
                  <View style={[
                    styles.venueTypeCircle,
                    state === "love" && styles.venueTypeCircleLove,
                    state === "hate" && styles.venueTypeCircleHate,
                  ]}>
                    {state === "love" && <Ionicons name="heart" size={16} color="#fff" />}
                    {state === "hate" && <Ionicons name="remove-circle" size={18} color="#fff" />}
                  </View>
                  <Text style={styles.venueTypeLabel}>{vt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>
            Anything else to know?{" "}
            <Text style={styles.optional}>(optional)</Text>
          </Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. vegetarian, no museums, need good coffee..."
            placeholderTextColor="#aaa"
            value={notes}
            onChangeText={setNotes}
            multiline
            onFocus={() => {
              setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
              }, 300);
            }}
          />

          <TouchableOpacity
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled, saved && styles.saveButtonSaved]}
            disabled={!canSave}
            onPress={async () => {
              await savePreferences(time, pace, budget, notes, venuePreferences);
              setPreferences(time, pace, budget, notes);
              setVenuePreferences(venuePreferences);
              setSaved(true);
              setTimeout(() => {
                setSaved(false);
                router.push("/(tabs)/map");
              }, 1200);
            }}
          >
            <Text style={styles.saveButtonText}>
              {saved ? "Preferences saved!  ✓" : "Save preferences"}
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  // #endregion

}

// #endregion

// #region Styles

const styles = StyleSheet.create({

  // #region General Layout

  container: {
    padding: 12,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    letterSpacing: 2,
    marginBottom: 6,
  },
  headingDivider: {
    height: 1,
    backgroundColor: "#ddd",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 6,
    color: "#111",
  },
  sectionDivider: {
    height: 1,
    backgroundColor: "#e8e8e8",
    marginBottom: 16,
    marginTop: 2,
  },

  // #endregion

  // #region Horizontal Option Cards

  horizontalRow: {
    flexDirection: "row",
    marginBottom: 10,
    gap: 8,
  },
  horizontalCard: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: "#ebebeb",
    borderWidth: 2,
    borderColor: "#d8d8d8",
    alignItems: "center",
    justifyContent: "center",
  },
  horizontalCardFirst: {
    // reserved for any first-card specific styling
  },
  horizontalCardLast: {
    // reserved for any last-card specific styling
  },
  horizontalCardSelected: {
    backgroundColor: "#444444",
    borderColor: "#000",
  },
  horizontalCardLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#222",
    textAlign: "center",
    marginBottom: 4,
  },
  horizontalCardLabelSelected: {
    color: "#fff",
  },
  horizontalCardDesc: {
    fontSize: 11,
    color: "#666",
    textAlign: "center",
  },
  horizontalCardDescSelected: {
    color: "#ccc",
  },

  // #endregion

  // #region Venue Type Selectors

  venueTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12,
    paddingHorizontal: 8,
    paddingLeft: 20,
  },
  venueTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "50%",
    paddingVertical: 5,
    gap: 6,
  },
  venueTypeCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#b0bdb0",
    alignItems: "center",
    justifyContent: "center",
  },
  venueTypeCircleLove: {
    backgroundColor: "#2d9e5f",
  },
  venueTypeCircleHate: {
    backgroundColor: "#c0392b",
  },
  venueTypeLabel: {
    fontSize: 15,
    color: "#333",
    fontWeight: "500",
  },
  loveText: {
    color: "#2d9e5f",
    fontWeight: "800",
  },
  hateText: {
    color: "#c0392b",
    fontWeight: "800",
  },

  // #endregion

  // #region Notes Input

  textInput: {
    borderWidth: 1.5,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    padding: 10,
    fontSize: 15,
    color: "#111",
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: 8,
  },
  optional: {
    fontWeight: "400",
    color: "#999",
    fontSize: 15,
  },

  // #endregion

  // #region Save Button

  saveButton: {
    backgroundColor: "#000",
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 16,
  },
  saveButtonDisabled: {
    backgroundColor: "#ccc",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  saveButtonSaved: {
    backgroundColor: "#2d9e5f",
  },

  // #endregion

});

// #endregion