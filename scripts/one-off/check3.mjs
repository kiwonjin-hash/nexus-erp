import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
const app = initializeApp({
  apiKey: "AIzaSyALkqD8wlrIPTAD0wDwffivZn7SMrDrwk4", authDomain: "ygold-erp-5991b.firebaseapp.com",
  projectId: "ygold-erp-5991b", storageBucket: "ygold-erp-5991b.firebasestorage.app",
  messagingSenderId: "482349244297", appId: "1:482349244297:web:0867a69ac6f4479416cb58"
});
const db = getFirestore(app);
async function run() {
  const snap = await getDocs(collection(db, "orders", "202603073180504", "shipments"));
  snap.docs.forEach(s => {
    const d = s.data();
    console.log(`\n[${s.id}]`);
    console.log(`  status: ${d.status}, isCompleted: ${d.isCompleted}`);
    console.log(`  trackingNumbers: ${JSON.stringify(d.trackingNumbers)}`);
    console.log(`  items: ${(d.items||[]).map(i=>i.name+'('+i.qty+')').join(', ')}`);
  });
  process.exit(0);
}
run().catch(e=>{console.error(e);process.exit(1);});
