import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

const DEVICE_ID = "default_user"; // We'll replace this with real auth in Phase 5

export const savePreferences = async (
  time: string,
  pace: string,
  budget: string,
  notes: string,
  venuePreferences: Record<string, "love" | "hate" | "neutral">
) => {
  await setDoc(doc(db, "preferences", DEVICE_ID), {
    time, pace, budget, notes, venuePreferences,
    updatedAt: new Date().toISOString(),
  });
};

export const loadPreferences = async () => {
  try {
    const docSnap = await getDoc(doc(db, "preferences", DEVICE_ID));
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  } catch (e) {
    return null;
  }
};