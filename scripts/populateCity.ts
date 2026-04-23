// Load env vars from .env before anything else
import * as dotenv from "dotenv";
dotenv.config();

import { initializeApp } from "firebase/app";
import { doc, getFirestore, setDoc } from "firebase/firestore";

// #region Firebase Init

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY!,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID!,
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// #endregion

// #region Config

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY!;

import { CITY_CONFIGS } from "./cityConfig";
const CITY = CITY_CONFIGS["austin-tx"];
const CITY_PATH = CITY.cityPath;
const ZIP_CODES = CITY.zipCodes;

// Google Place types to query, with per-type page caps (1 page = 20 results)
const TYPE_QUERIES: { type: string; keyword?: string }[] = [
  { type: "tourist_attraction" },
  { type: "museum" },
  { type: "art_gallery" },
  { type: "performing_arts_theater" },
  { type: "park" },
  { type: "night_club" },
  { type: "bar" },
  ...CITY.restaurantKeywords.map(keyword => ({ type: "restaurant", keyword })),
  { type: "cafe" },
];

const MIN_RATING             = 4.0;
const MIN_REVIEWS_FLOOR      = 10;
const REVIEW_CAP             = 5000;
const RELATIVE_REVIEW_CUTOFF_BY_TYPE: Partial<Record<string, number>> = {
  park: 0.2,  // higher threshold — filters neighborhood parks
};
const RELATIVE_REVIEW_CUTOFF_DEFAULT = 0.02;

// #endregion

// #region Google Places Fetch

type RawPlace = {
  place_id:        string;
  name:            string;
  vicinity?:       string;
  formatted_address?: string;
  geometry:        { location: { lat: number; lng: number } };
  types:           string[];
  rating?:         number;
  user_ratings_total?: number;
  opening_hours?:  { open_now: boolean };
  business_status?: string;
};

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

const fetchPage = async (
  zipCode: string,
  type: string,
  keyword?: string,
): Promise<{ results: RawPlace[]; nextToken?: string }> => {
  const base = keyword
      ? `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(keyword)}+in+${zipCode}+Austin+TX&key=${GOOGLE_KEY}`
      : `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${type}+in+${zipCode}+Austin+TX&type=${type}&key=${GOOGLE_KEY}`;

  const res  = await fetch(base);
  const data = await res.json() as { status: string; results: RawPlace[]; next_page_token?: string };

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.warn(`  Places API warning: ${data.status}`);
    return { results: [] };
  }

  return { results: data.results ?? [], nextToken: data.next_page_token };
};

const fetchVenueType = async (
  zipCode: string,
  type: string,
  keyword?: string,
): Promise<RawPlace[]> => {
  const { results } = await fetchPage(zipCode, type, keyword);
  return results;
};

// #endregion

// #region Hours Fetch

type PlaceHours = {
  weekdayText: string[];
  periods: { day: number; openTime: string; closeTime: string }[];
};

const fetchHours = async (placeId: string): Promise<PlaceHours | null> => {
  const url  = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=opening_hours,business_status&key=${GOOGLE_KEY}`;
  const res  = await fetch(url);
  const data = await res.json() as any;

  if (data.status !== "OK" || !data.result?.opening_hours) return null;

  const h = data.result.opening_hours;
  return {
    weekdayText: h.weekday_text ?? [],
    periods: (h.periods ?? []).map((p: any) => ({
      day:       p.open.day,
      openTime:  p.open.time,
      closeTime: p.close?.time ?? "2359",
    })),
  };
};

// #endregion

// #region Quality Filter

const EXCLUDED_TYPES = new Set([
  "health", "spa", "beauty_salon", "hair_care", "gym",
  "clothing_store", "shoe_store", "department_store",
  "furniture_store", "electronics_store", "home_goods_store",
  "drugstore", "pharmacy", "bank", "atm", "finance",
  "liquor_store", "car_wash", "car_repair", "car_dealer",
  "real_estate_agency", "insurance_agency", "lawyer", 
  "cannabis_store", "dispensary", "amusement_park"
]);

const passesFilter = (place: RawPlace): boolean => {
  if (!place.rating || place.rating < MIN_RATING)
    { console.log(`    ✗ ${place.name} — rating ${place.rating}`); return false; }
  if (!place.user_ratings_total || place.user_ratings_total < MIN_REVIEWS_FLOOR)
    { console.log(`    ✗ ${place.name} — reviews ${place.user_ratings_total}`); return false; }
  if (place.business_status === "PERMANENTLY_CLOSED")
    { console.log(`    ✗ ${place.name} — permanently closed`); return false; }
  if (place.business_status === "TEMPORARILY_CLOSED")
    { console.log(`    ✗ ${place.name} — temporarily closed`); return false; }
  if (place.types.some(t => EXCLUDED_TYPES.has(t)))
    { console.log(`    ✗ ${place.name} — excluded type: ${place.types.find(t => EXCLUDED_TYPES.has(t))}`); return false; }
  return true;
};

const applyRelativeCutoff = (places: RawPlace[], cutoff: number = RELATIVE_REVIEW_CUTOFF_DEFAULT): RawPlace[] => {
  if (places.length === 0) return [];
  const maxCount = Math.max(...places.map(p => p.user_ratings_total ?? 0), 1);
  return places.filter(p => {
    const normalized = (p.user_ratings_total ?? 0) / maxCount;
    const passes = normalized >= cutoff;
    if (!passes) console.log(`    ✗ ${p.name} — relative reviews too low (${p.user_ratings_total}/${maxCount} = ${normalized.toFixed(2)})`);
    return passes;
  });
};

// #endregion

// #region Main

const main = async () => {
  console.log(`\n🗺  TravelRecs city population script`);
  console.log(`   City: Austin, TX`);
  console.log(`   Zip codes: ${ZIP_CODES.join(", ")}\n`);

  const seen    = new Set<string>();
  let   written = 0;

  for (const zipCode of ZIP_CODES) {

    const restaurantQueries = TYPE_QUERIES.filter(q => q.type === "restaurant");
    const otherQueries      = TYPE_QUERIES.filter(q => q.type !== "restaurant");

    // ── Non-restaurant queries ──────────────────────────────────────────────
    for (const query of otherQueries) {
      const { type } = query;
      console.log(`   Querying: ${type}${query.keyword ? ` [${query.keyword}]` : ""}`);
      const raw = await fetchVenueType(zipCode, type, query.keyword);
      console.log(`   Raw results: ${raw.length}`);

      // Pass 1 — deduplicate and apply absolute filters
      const candidates = raw.filter(place => {
        if (seen.has(place.place_id)) return false;
        seen.add(place.place_id);
        if (CITY.excludedPlaceIds.has(place.place_id)) {
          console.log(`    ✗ ${place.name} — manually excluded`);
          return false;
        }
        if (CITY.includedPlaceIds.has(place.place_id)) return true;
        return passesFilter(place);
      });

      // Cap review counts to prevent outliers dominating normalization
      const capped = candidates.map(p => ({
        ...p,
        user_ratings_total: Math.min(p.user_ratings_total ?? 0, REVIEW_CAP),
      }));

      // Pass 2 — relative review cutoff within this type
      const cutoff = RELATIVE_REVIEW_CUTOFF_BY_TYPE[type] ?? RELATIVE_REVIEW_CUTOFF_DEFAULT;
      const passing = applyRelativeCutoff(capped, cutoff);
      const typeSkipped = raw.length - passing.length;
      let typeWritten = 0;

      for (const place of passing) {
        const hours = await fetchHours(place.place_id);
        await sleep(100);

        const venueDoc = {
          placeId:          place.place_id,
          name:             place.name,
          address:          place.formatted_address ?? place.vicinity ?? "",
          latitude:         place.geometry.location.lat,
          longitude:        place.geometry.location.lng,
          types:            place.types,
          queryType:        type,
          rating:           place.rating,
          userRatingsTotal: place.user_ratings_total,
          businessStatus:   place.business_status ?? "OPERATIONAL",
          placeHours:       hours,
          zipCode,
          cachedAt:         new Date().toISOString(),
          hoursRefreshedAt: new Date().toISOString(),
        };

        const ref = doc(db, `${CITY_PATH}/venues/${place.place_id}`);
        await setDoc(ref, venueDoc);

        console.log(`   ✓ ${place.name} (${place.rating}★, ${place.user_ratings_total} reviews)`);
        typeWritten++;
        written++;
      }

      console.log(`   → ${typeWritten} written, ${typeSkipped} skipped\n`);
    }

    // ── Restaurant queries — collect all, normalize combined ────────────────
    if (restaurantQueries.length > 0) {
      console.log(`   Querying: restaurants (${restaurantQueries.map(q => q.keyword).join(", ")})`);
      const allRestaurantRaw: RawPlace[] = [];

      for (const query of restaurantQueries) {
        const raw = await fetchVenueType(zipCode, query.type, query.keyword);
        allRestaurantRaw.push(...raw);
      }

      console.log(`   Raw results (combined): ${allRestaurantRaw.length}`);

      // Pass 1 — deduplicate and apply absolute filters
      const candidates = allRestaurantRaw.filter(place => {
        if (seen.has(place.place_id)) return false;
        seen.add(place.place_id);
        if (CITY.excludedPlaceIds.has(place.place_id)) {
          console.log(`    ✗ ${place.name} — manually excluded`);
          return false;
        }
        if (CITY.includedPlaceIds.has(place.place_id)) return true;
        return passesFilter(place);
      });
      // Cap review counts to prevent outliers dominating normalization
      const capped = candidates.map(p => ({
        ...p,
        user_ratings_total: Math.min(p.user_ratings_total ?? 0, REVIEW_CAP),
      }));

      // Pass 2 — relative review cutoff across combined pool
      const passing = applyRelativeCutoff(capped);
      const typeSkipped = allRestaurantRaw.length - passing.length;
      let typeWritten = 0;

      for (const place of passing) {
        const hours = await fetchHours(place.place_id);
        await sleep(100);

        const venueDoc = {
          placeId:          place.place_id,
          name:             place.name,
          address:          place.formatted_address ?? place.vicinity ?? "",
          latitude:         place.geometry.location.lat,
          longitude:        place.geometry.location.lng,
          types:            place.types,
          queryType:        "restaurant",
          rating:           place.rating,
          userRatingsTotal: place.user_ratings_total,
          businessStatus:   place.business_status ?? "OPERATIONAL",
          placeHours:       hours,
          zipCode,
          cachedAt:         new Date().toISOString(),
          hoursRefreshedAt: new Date().toISOString(),
        };

        const ref = doc(db, `${CITY_PATH}/venues/${place.place_id}`);
        await setDoc(ref, venueDoc);

        console.log(`   ✓ ${place.name} (${place.rating}★, ${place.user_ratings_total} reviews)`);
        typeWritten++;
        written++;
      }

      console.log(`   → ${typeWritten} written, ${typeSkipped} skipped\n`);
    }

  } // end zipCode loop

  console.log(`\n✅ Done! ${written} venues written total.`);
  process.exit(0);
};

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});

// #endregion