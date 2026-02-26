import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

function isMissing(value: string | undefined): boolean {
  return !value || value.trim() === "" || value.includes("replace-me");
}

const missingKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => isMissing(value))
  .map(([key]) => key);

export const firebaseConfigError =
  missingKeys.length > 0
    ? `Missing Firebase config: ${missingKeys.join(", ")}. Create .env from .env.example with real Firebase web app values.`
    : null;

export const firebaseApp = firebaseConfigError
  ? null
  : getApps().length
    ? getApp()
    : initializeApp(firebaseConfig);

export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const db = firebaseApp ? getFirestore(firebaseApp) : null;
export const functions = firebaseApp ? getFunctions(firebaseApp) : null;

export async function ensureAnonymousAuth(): Promise<void> {
  if (!auth) {
    throw new Error(firebaseConfigError ?? "Firebase Auth is not initialized");
  }
  if (auth.currentUser) return;
  await signInAnonymously(auth);
}
