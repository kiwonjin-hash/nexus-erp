import { initializeApp } from "firebase/app";
import { getFirestore, doc, updateDoc, serverTimestamp } from "firebase/firestore";

const app = initializeApp({
  apiKey: "AIzaSyALkqD8wlrIPTAD0wDwffivZn7SMrDrwk4",
  authDomain: "ygold-erp-5991b.firebaseapp.com",
  projectId: "ygold-erp-5991b",
  storageBucket: "ygold-erp-5991b.firebasestorage.app",
  messagingSenderId: "482349244297",
  appId: "1:482349244297:web:0867a69ac6f4479416cb58"
});
const db = getFirestore(app);

async function run() {
  const ref = doc(db, "orders", "202603120191593", "shipments", "202603120191593_PICKUP");
  await updateDoc(ref, {
    status: "COMPLETED",
    isCompleted: true,
    updatedAt: serverTimestamp()
  });
  console.log("완료: 202603120191593_PICKUP → COMPLETED");
  process.exit(0);
}
run().catch(err => { console.error(err); process.exit(1); });
