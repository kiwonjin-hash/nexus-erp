import { initializeApp } from "firebase/app";
import { getFirestore, doc, updateDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyALkqD8wlrIPTAD0wDwffivZn7SMrDrwk4",
  authDomain: "ygold-erp-5991b.firebaseapp.com",
  projectId: "ygold-erp-5991b",
  storageBucket: "ygold-erp-5991b.firebasestorage.app",
  messagingSenderId: "482349244297",
  appId: "1:482349244297:web:0867a69ac6f4479416cb58"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const ref = doc(db, "orders", "202602200908654", "shipments", "202602200908654_6097532500118");

  await updateDoc(ref, {
    // 이미 완료된 6097532391960 제거, 본 shipment 송장만 유지
    trackingNumbers: ["6097532500118"],
    tracking: "6097532500118",
    // 이미 출고된 오스트리아 필하모닉 제거, 판다 코인만 유지
    items: [
      { name: "(4월 초 배송)31.1g 은화 중국 실버 판다 랜덤 연도 BU .999", qty: 1, sku: "" }
    ]
  });

  console.log("수정 완료: 202602200908654_6097532500118");
  console.log("  trackingNumbers: ['6097532500118']");
  console.log("  items: 판다 코인 1개만");
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
