import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyALkqD8wlrIPTAD0wDwffivZn7SMrDrwk4",
  authDomain: "ygold-erp-5991b.firebaseapp.com",
  projectId: "ygold-erp-5991b",
  storageBucket: "ygold-erp-5991b.firebasestorage.app",
  messagingSenderId: "482349244297",
  appId: "1:482349244297:web:0867a69ac6f4479416cb58"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// 하네스(scripts/smoke-test.ts)에서만 켜는 플래그 — 실제 앱 빌드/배포에는 영향 없음.
// 브라우저(Vite)와 Node(tsx) 양쪽에서 안전하게 평가되도록 typeof 가드 사용.
const useEmulator =
  (typeof process !== "undefined" && process.env?.USE_FIRESTORE_EMULATOR === "true") ||
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_USE_FIRESTORE_EMULATOR === "true");

if (useEmulator) {
  connectFirestoreEmulator(db, "localhost", 8080);
}