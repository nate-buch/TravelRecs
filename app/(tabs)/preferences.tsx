import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { loadPreferences, savePreferences } from "../config/preferences";
import { useAppStore } from "../config/store";

const TIME_OPTIONS = [
  { id: "a few hours", label: "A few hours", desc: "Must-sees and quick local bites" },
  { id: "full day", label: "A full day", desc: "Balanced mix, some exploring" },
  { id: "weekend", label: "A weekend", desc: "Relaxed pace, hidden gems" },
  { id: "week plus", label: "A week+", desc: "Off-the-beaten-path points of interest" },
];

const PACE_OPTIONS = [
  { id: "hustle", label: "I'm ready to hustle!", desc: "Move fast, more stops, quick bites" },
  { id: "typical", label: "Well-paced day of adventure", desc: "Typical time at spots, some walking" },
  { id: "easy", label: "Nice and easy, please!", desc: "Fewer stops, linger longer, sit-down meals" },
];

const BUDGET_OPTIONS = [
  { id: "inexpensive", label: "Keep it cheap!", desc: "Parks, street food, free entry. Splurge only for once-in-a-lifetime must-dos." },
  { id: "mid-range", label: "Flexible for the right things!", desc: "Mid-range meals, paid attractions, faster transit if needed." },
  { id: "YOLO vacay", label: "I'm on vacay — make the most of it!", desc: "Tours, great dining, VIP entry — no regrets." },
];

type OptionProps = {
  label: string;
  desc: string;
  selected: boolean;
  onPress: () => void;
};

function OptionCard({ label, desc, selected, onPress }: OptionProps) {
  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
    >
      <Text style={[styles.cardLabel, selected && styles.cardLabelSelected]}>{label}</Text>
      <Text style={[styles.cardDesc, selected && styles.cardDescSelected]}>{desc}</Text>
    </TouchableOpacity>
  );
}

export default function PreferencesScreen() {
  const [time, setTime] = useState("");
  const [pace, setPace] = useState("");
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");
  const setPreferences = useAppStore(state => state.setPreferences);

  useEffect(() => {
    (async () => {
      const saved = await loadPreferences();
      if (saved) {
        setTime(saved.time);
        setPace(saved.pace);
        setBudget(saved.budget);
        setNotes(saved.notes);
      }
    })();
  }, []);

  const canSave = time && pace && budget;

  return (
    <ScrollView contentContainerStyle={styles.container}>

      <Text style={styles.heading}>PLAN YOUR DAY</Text>
      <View style={styles.headingDivider} />

      <Text style={styles.sectionTitle}>How much time do you have?</Text>
      <View style={styles.optionsGroup}>
        {TIME_OPTIONS.map(o => (
          <OptionCard key={o.id} label={o.label} desc={o.desc} selected={time === o.id} onPress={() => setTime(o.id)} />
        ))}
      </View>
      <View style={styles.sectionDivider} />

      <Text style={styles.sectionTitle}>How fast do you want to move?</Text>
      <View style={styles.optionsGroup}>
        {PACE_OPTIONS.map(o => (
          <OptionCard key={o.id} label={o.label} desc={o.desc} selected={pace === o.id} onPress={() => setPace(o.id)} />
        ))}
      </View>
      <View style={styles.sectionDivider} />

      <Text style={styles.sectionTitle}>How flexible is your budget?</Text>
      <View style={styles.optionsGroup}>
        {BUDGET_OPTIONS.map(o => (
          <OptionCard key={o.id} label={o.label} desc={o.desc} selected={budget === o.id} onPress={() => setBudget(o.id)} />
        ))}
      </View>
      <View style={styles.sectionDivider} />

      <Text style={styles.sectionTitle}>Anything else to know? <Text style={styles.optional}>(optional)</Text></Text>
      <View style={styles.optionsGroup}>
        <TextInput
          style={styles.textInput}
          placeholder="e.g. vegetarian, no museums, need good coffee..."
          placeholderTextColor="#aaa"
          value={notes}
          onChangeText={setNotes}
          multiline
        />
      </View>

      <TouchableOpacity
        style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
        disabled={!canSave}
        onPress={async () => {
          await savePreferences(time, pace, budget, notes);
          setPreferences(time, pace, budget, notes);
          router.push("/(tabs)/map");
        }}
      >
        <Text style={styles.saveButtonText}>Save preferences</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingBottom: 48,
  },
  heading: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    letterSpacing: 2,
    marginBottom: 12,
  },
  headingDivider: {
    height: 1,
    backgroundColor: "#ddd",
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 12,
    color: "#111",
  },
  optionsGroup: {
    paddingLeft: 10,
    marginBottom: 16,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: "#e8e8e8",
    marginBottom: 24,
    marginTop: 4,
  },
  optional: {
    fontWeight: "400",
    color: "#999",
    fontSize: 15,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#ebebeb",
    borderWidth: 1.5,
    borderColor: "#d8d8d8",
    marginBottom: 10,
  },
  cardSelected: {
    backgroundColor: "#000",
    borderColor: "#000",
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111",
    marginBottom: 4,
  },
  cardLabelSelected: {
    color: "#fff",
  },
  cardDesc: {
    fontSize: 13,
    color: "#666",
  },
  cardDescSelected: {
    color: "#ccc",
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: "#111",
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: 8,
  },
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
});