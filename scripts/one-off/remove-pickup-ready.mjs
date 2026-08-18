import { initializeApp } from "firebase/app";
import { getFirestore, doc, updateDoc, deleteField } from "firebase/firestore";

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

const shipments = [
  { orderId: "202602149133935", tracking: "6097532499647" },
  { orderId: "202602146402629", tracking: "6097532499828" },
  { orderId: "202602190612364", tracking: "6097532499916" },
  { orderId: "202602200908654", tracking: "6097532500118" },
  { orderId: "202602216021081", tracking: "6097532500315" },
  { orderId: "202602220438075", tracking: "6097532500378" },
  { orderId: "202602234410169", tracking: "6097532500566" },
  { orderId: "202603061667308", tracking: "6097532500908" },
  { orderId: "202603073180504", tracking: "6097532500999" },
  { orderId: "202603120191593", tracking: "6097532501058" },
];

async function run() {
  let updated = 0;
  let failed = 0;

  for (const s of shipments) {
    const docId = `${s.orderId}_${s.tracking}`;
    const ref = doc(db, "orders", s.orderId, "shipments", docId);

    try {
      await updateDoc(ref, { pickupReady: deleteField() });
      console.log(`UPDATED  orders/${s.orderId}/shipments/${docId}`);
      updated++;
    } catch (err) {
      console.error(`FAILED   orders/${s.orderId}/shipments/${docId} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n완료: ${updated}개 업데이트, ${failed}개 실패`);
  process.exit(0);
}

run().catch(err => {
  console.error("오류:", err);
  process.exit(1);
});
