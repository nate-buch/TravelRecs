// #region Imports
 
import * as dotenv from "dotenv";
dotenv.config();

import { initializeApp } from "firebase/app";
import { collection, deleteDoc, getDocs, getFirestore, updateDoc } from "firebase/firestore";
import { haversineDistance } from "../shared/utilities";
import { CITY_CONFIGS } from "./cityConfig";

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

// #region Constants

const REVIEW_CAP           = 5000;
const MIN_NORMALIZED_SCORE = 0.02;

// #endregion

// #region Score and Clean

export const scoreAndCleanVenues = async (cityPath: string): Promise<void> => {

  // #region Fetch

  console.log(`\n🧹 Scoring and cleaning venues for ${cityPath}...`);

  const snapshot = await getDocs(collection(db, `${cityPath}/venues`));
  const docs = snapshot.docs.map(d => ({ ref: d.ref, data: d.data() }));

  console.log(`   ${docs.length} venues fetched`);

  // #endregion

  // #region Hard Floor Validation

  let deletedNullType  = 0;
  let deletedRating    = 0;
  let deletedClosed    = 0;
  let deletedLowScore  = 0;

  const valid = [];
  const toDelete = [];

  for (const d of docs) {
    const { data, ref } = d;

    if (!data.venueType) {
      console.log(`   ✗ ${data.name} — null venueType`);
      toDelete.push(ref);
      deletedNullType++;
      continue;
    }
    if (!data.rating || data.rating < 4.0) {
      console.log(`   ✗ ${data.name} — rating ${data.rating}`);
      toDelete.push(ref);
      deletedRating++;
      continue;
    }
    if (data.businessStatus === "PERMANENTLY_CLOSED" || data.businessStatus === "TEMPORARILY_CLOSED") {
      console.log(`   ✗ ${data.name} — ${data.businessStatus}`);
      toDelete.push(ref);
      deletedClosed++;
      continue;
    }

    valid.push(d);
  }

  // #endregion

  // #region Normalize and Score

  // Group valid venues by venueType
  const byType = new Map<string, typeof valid>();
  for (const d of valid) {
    const t = d.data.venueType;
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(d);
  }

  // Compute per-type max, capped at REVIEW_CAP
  const typeMax = new Map<string, number>();
  for (const [type, group] of byType) {
    const max = Math.max(...group.map(d => Math.min(d.data.userRatingsTotal ?? 0, REVIEW_CAP)));
    typeMax.set(type, max || 1);
  }

  // Score each venue and separate survivors from deletions
  const toUpdate: { ref: any; name: string; score: number; data: any }[] = [];

  for (const d of valid) {
    const t = d.data.venueType;
    const capped = Math.min(d.data.userRatingsTotal ?? 0, REVIEW_CAP);
    const score = capped / typeMax.get(t)!;

    if (score < MIN_NORMALIZED_SCORE) {
      console.log(`   ✗ ${d.data.name} — normalized score too low (${score.toFixed(3)})`);
      toDelete.push(d.ref);
      deletedLowScore++;
    } else {
      toUpdate.push({ ref: d.ref, name: d.data.name, score, data: d.data });
    }
  }

  // #endregion

  // #region Write and Delete

  for (const d of toUpdate) {
    await updateDoc(d.ref, { normalizedReviewScore: d.score });
  }

  // Pass 3 — compute venueGravity for each surviving venue
  // Raw gravity = self.score * SUM(neighbor.normalizedReviewScore / distance) for all neighbors within 0.5mi
  const GRAVITY_RADIUS_MILES = 0.5;
  const gravityRaw = toUpdate.map(d => {
    let raw = 0;
    for (const neighbor of toUpdate) {
      if (neighbor.ref.id === d.ref.id) continue;
      const dist = haversineDistance(
        d.data.latitude, d.data.longitude,
        neighbor.data.latitude, neighbor.data.longitude,
      );
      if (dist > GRAVITY_RADIUS_MILES) continue;
      raw += neighbor.score * (1 - dist / GRAVITY_RADIUS_MILES);
    }
    return { ref: d.ref, name: d.data.name, raw: d.score * raw };
  });

  // Normalize to 0-1 across all venues
  const maxRaw = Math.max(...gravityRaw.map(g => g.raw), 1);
  const gravityScores = gravityRaw.map(g => ({
    ref: g.ref,
    name: g.name,
    venueGravity: Math.cbrt(g.raw / maxRaw),
  }));

  // Write venueGravity back to Firestore
  for (const g of gravityScores) {
    await updateDoc(g.ref, { venueGravity: g.venueGravity });
    console.log(`   ✓ ${g.name} venueGravity: ${g.venueGravity.toFixed(3)}`);
  }

  for (const ref of toDelete) {
    await deleteDoc(ref);
  }

  // Pass 4 — apply name overrides
  const cityConfig = Object.values(CITY_CONFIGS).find(c => c.cityPath === cityPath);
  if (cityConfig) {
    for (const d of docs) {
      const override = cityConfig.venueNameOverrides[d.data.placeId];
      if (override && d.data.name !== override) {
        await updateDoc(d.ref, { name: override });
        console.log(`   ✓ Name override: "${d.data.name}" → "${override}"`);
      }
    }
  }

  const totalDeleted = toDelete.length;
  const totalVenues  = docs.length;
  const pct = (n: number) => `${((n / totalVenues) * 100).toFixed(1)}%`;

  console.log(`\n   📊 Score and Clean Summary`);
  console.log(`   ${"─".repeat(40)}`);
  console.log(`   Total fetched:        ${totalVenues}`);
  console.log(`   Surviving:            ${toUpdate.length} (${pct(toUpdate.length)})`);
  console.log(`   Deleted (total):      ${totalDeleted} (${pct(totalDeleted)})`);
  console.log(`   ${"─".repeat(40)}`);
  console.log(`   ✗ Null venueType:     ${deletedNullType} (${pct(deletedNullType)})`);
  console.log(`   ✗ Low rating:         ${deletedRating} (${pct(deletedRating)})`);
  console.log(`   ✗ Closed:             ${deletedClosed} (${pct(deletedClosed)})`);
  console.log(`   ✗ Low score:          ${deletedLowScore} (${pct(deletedLowScore)})`);
  console.log(`   ${"─".repeat(40)}\n`);

  // #endregion

};

// #endregion

// #region Main

if (require.main === module) {
  const CITY_PATH = CITY_CONFIGS["austin-tx"].cityPath;
  scoreAndCleanVenues(CITY_PATH)
    .catch(err => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}

// #endregion