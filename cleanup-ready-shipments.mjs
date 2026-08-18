/**
 * cleanup-ready-shipments.mjs
 *
 * logs에 출고 완료 기록이 있는 READY shipment를 COMPLETED로 변경
 * 실행: node cleanup-ready-shipments.mjs
 */

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collectionGroup,
  collection,
  getDocs,
  updateDoc,
} from "firebase/firestore";

const app = initializeApp({
  apiKey: "AIzaSyALkqD8wlrIPTAD0wDwffivZn7SMrDrwk4",
  authDomain: "ygold-erp-5991b.firebaseapp.com",
  projectId: "ygold-erp-5991b",
  storageBucket: "ygold-erp-5991b.firebasestorage.app",
  messagingSenderId: "482349244297",
  appId: "1:482349244297:web:0867a69ac6f4479416cb58",
});

const db = getFirestore(app);

async function main() {
  // 1. logs에서 완료된 orderId 목록 수집
  console.log("logs에서 완료 기록 수집 중...");
  const logsSnap = await getDocs(collection(db, "logs"));
  const completedOrderIds = new Set();
  logsSnap.forEach((d) => {
    const data = d.data();
    const orderId = String(data.orderId || "").trim();
    if (orderId) completedOrderIds.add(orderId);
    // mergedOrderIds도 포함
    if (Array.isArray(data.mergedOrderIds)) {
      data.mergedOrderIds.forEach((id) => {
        const s = String(id || "").trim();
        if (s) completedOrderIds.add(s);
      });
    }
  });
  console.log(`완료 orderId ${completedOrderIds.size}개 확인`);

  // 2. READY 상태 shipment 전체 조회
  console.log("READY shipment 조회 중...");
  const allSnap = await getDocs(collectionGroup(db, "shipments"));
  const shipmentsSnap = { docs: allSnap.docs.filter(d => d.data().status === "READY") };
  console.log(`READY shipment ${shipmentsSnap.docs.length}개 발견`);

  let updated = 0;
  let kept = 0;

  for (const docSnap of shipmentsSnap.docs) {
    const orderRef = docSnap.ref.parent.parent;
    if (!orderRef) continue;
    const orderId = orderRef.id;

    if (completedOrderIds.has(orderId)) {
      console.log(`  → COMPLETED 처리: ${orderId} (shipment: ${docSnap.id})`);
      await updateDoc(docSnap.ref, {
        status: "COMPLETED",
        isCompleted: true,
        memo: "[자동정리] 출고 로그 확인됨 — 2026-06-02 일괄 처리",
      });
      updated++;
    } else {
      console.log(`  → 유지 (미완료): ${orderId}`);
      kept++;
    }
  }

  console.log(`\n완료: COMPLETED 처리 ${updated}개, 유지 ${kept}개`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
