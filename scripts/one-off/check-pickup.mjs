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

async function run() {
  const snap = await getDocs(collection(db, "orders", "202603120191593", "shipments"));
  snap.docs.forEach(s => {
    const d = s.data();
    console.log(`\n[${s.id}]`);
    console.log(`status: ${d.status}, deliveryType: ${d.deliveryType}`);
    console.log(`tracking: ${d.tracking}`);
    console.log(`trackingNumbers: ${JSON.stringify(d.trackingNumbers)}`);
    console.log(`items(${d.items?.length ?? 0}):`);
    (d.items || []).forEach((item, i) =>
      console.log(`  [${i}] ${item.name} qty:${item.qty ?? item.quantity}`)
    );
  });
  process.exit(0);
}
run().catch(err => { console.error(err); process.exit(1); });
