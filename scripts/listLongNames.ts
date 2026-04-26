// #region Initialization

import * as dotenv from "dotenv";
dotenv.config();

import { initializeApp } from "firebase/app";
import { collection, getDocs, getFirestore } from "firebase/firestore";
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

const MAX_NAME_LENGTH = 40;
const CITY_PATH = CITY_CONFIGS["austin-tx"].cityPath;

// #endregion

// #region Main

const main = async () => {
  console.log(`\n🔍 Venues with names longer than ${MAX_NAME_LENGTH} characters\n`);
  console.log(`   City: ${CITY_PATH}\n`);

  const snapshot = await getDocs(collection(db, `${CITY_PATH}/venues`));
  const longNames = snapshot.docs
    .map(d => d.data())
    .filter(v => v.name?.length > MAX_NAME_LENGTH)
    .sort((a, b) => b.name.length - a.name.length);

  if (longNames.length === 0) {
    console.log(`   ✓ No venues with names longer than ${MAX_NAME_LENGTH} characters!\n`);
  } else {
    console.log(`   ${longNames.length} venues found:\n`);
    for (const v of longNames) {
      console.log(`   "${v.name}"`);
      console.log(`    placeId:   ${v.placeId}`);
      console.log(`    venueType: ${v.venueType}\n`);
    }
  }

  process.exit(0);
};

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});

// #endregion