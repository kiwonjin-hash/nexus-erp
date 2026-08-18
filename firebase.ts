import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";

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
export const auth = getAuth(app);

/**
 * 재고 원장(stock_logs)·출고 로그의 담당자 필드에 쓰는 "지금 로그인한 사람" 라벨.
 * 예전엔 헤더의 자유입력(localStorage "operatorName")을 썼는데, 아무 이름이나 칠 수 있어
 * 감사 추적 신뢰성이 없었다 — 로그인 계정 기반으로 통일.
 */
export function getCurrentOperator(): string {
  return auth.currentUser?.email || auth.currentUser?.displayName || "";
}

// 하네스(scripts/smoke-test.ts)에서만 켜는 플래그 — 실제 앱 빌드/배포에는 영향 없음.
// 브라우저(Vite)와 Node(tsx) 양쪽에서 안전하게 평가되도록 typeof 가드 사용.
const useEmulator =
  (typeof process !== "undefined" && process.env?.USE_FIRESTORE_EMULATOR === "true") ||
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_USE_FIRESTORE_EMULATOR === "true");

if (useEmulator) {
  connectFirestoreEmulator(db, "localhost", 8080);
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
}