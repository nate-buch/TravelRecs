import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export interface SearchResult {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  types: string[];
  placeId: string;
}

interface VenueSearchBarProps {
  cameraCenter: [number, number] | null;
  onSelect: (result: SearchResult) => void;
  placeholder?: string;
}

export function VenueSearchBar({ cameraCenter, onSelect, placeholder }: VenueSearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const search = async (text: string) => {
    setQuery(text);
    if (text.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const bias = cameraCenter
        ? `&location=${cameraCenter[1]},${cameraCenter[0]}&radius=5000`
        : "";
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(text)}${bias}&key=${process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === "OK") {
        setResults(data.results.slice(0, 5).map((p: any) => ({
          name: p.name,
          address: p.formatted_address,
          latitude: p.geometry.location.lat,
          longitude: p.geometry.location.lng,
          types: p.types ?? [],
          placeId: p.place_id,
        })));
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelect = (result: SearchResult) => {
    setQuery("");
    setResults([]);
    Keyboard.dismiss();
    onSelect(result);
  };

  return (
    <View style={styles.searchBarContainer}>
      <View style={styles.searchInputRow}>
        <Ionicons name="search" size={18} color="#888" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={placeholder ?? "Search for a venue to add..."}
          placeholderTextColor="#aaa"
          value={query}
          onChangeText={search}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {searching && (
          <ActivityIndicator size="small" color="#888" style={{ marginRight: 8 }} />
        )}
      </View>
      {results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={item => item.placeId}
          style={styles.searchResults}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.searchResultItem}
              onPress={() => handleSelect(item)}
            >
              <Text style={styles.searchResultName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.searchResultAddress} numberOfLines={1}>
                {item.address}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBarContainer: {
    borderRadius: 12,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  searchInputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: "#111" },
  searchResults: {
    borderTopWidth: 1,
    borderTopColor: "#eee",
    maxHeight: 220,
  },
  searchResultItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  searchResultName: { fontSize: 14, fontWeight: "600", color: "#111" },
  searchResultAddress: { fontSize: 12, color: "#888", marginTop: 2 },
});