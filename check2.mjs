import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const app = initializeApp({
  apiKey: "AIzaSyALkqD8wlrIPTAD0wDwffivZn7SMrDrwk4",
  authDomain: "ygold-erp-5991b.firebaseapp.com",
  projectId: "ygold-erp-5991b",
  storageBucket: "ygold-erp-5991b.firebasestorage.app",
  messagingSenderId: "482349244297",
  appId: "1:482349244297:web:0867a69ac6f4479416cb58"
});
const db = getFirestore(app);

const orderId = "202602216021081"; // 6097532500315 의 order

async function run() {
  const shipmentsSnap = await getDocs(collection(db, "orders", orderId, "shipments"));
  console.log(`shipments(${shipmentsSnap.size}):`);
  shipmentsSnap.docs.forEach(s => {
    const sd = s.data();
    console.log(`\n  [${s.id}]`);
    console.log(`  status: ${sd.status}, isCompleted: ${sd.isCompleted}`);
    console.log(`  tracking: ${sd.tracking}`);
    console.log(`  trackingNumbers: ${JSON.stringify(sd.trackingNumbers)}`);
    console.log(`  items(${sd.items?.length ?? 0}):`);
    (sd.items || []).forEach((item, i) => console.log(`    [${i}] ${item.name} qty:${item.qty ?? item.quantity}`));
  });
  process.exit(0);
}
run().catch(err => { console.error(err); process.exit(1); });
