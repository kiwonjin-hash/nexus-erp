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

const orderIds = [
  "202602149133935",
  "202602146402629",
  "202602190612364",
  "202602200908654",
  "202602216021081",
  "202602220438075",
  "202602234410169",
  "202603061667308",
  "202603073180504",
  "202603120191593",
];

async function run() {
  for (const orderId of orderIds) {
    const shipmentsSnap = await getDocs(collection(db, "orders", orderId, "shipments"));
    const all = shipmentsSnap.docs.map(s => ({ id: s.id, ...s.data() }));
    const ready = all.filter(s => String(s.status || "").toUpperCase() === "READY");
    const completed = all.filter(s => String(s.status || "").toUpperCase() === "COMPLETED");

    const completedTrackings = new Set(
      completed.flatMap(s => [
        ...(s.trackingNumbers || []),
        ...(s.tracking ? [s.tracking] : [])
      ])
    );

    const completedItemNames = new Set(
      completed.flatMap(s => (s.items || []).map(i => i.name))
    );

    for (const rs of ready) {
      const extraTrackings = (rs.trackingNumbers || []).filter(t => completedTrackings.has(t));
      const extraItems = (rs.items || []).filter(i => completedItemNames.has(i.name));

      if (extraTrackings.length > 0 || extraItems.length > 0) {
        console.log(`\n[${orderId}] READY shipment: ${rs.id}`);
        if (extraTrackings.length > 0)
          console.log(`  잘못된 trackingNumbers: ${JSON.stringify(extraTrackings)}`);
        if (extraItems.length > 0)
          console.log(`  잘못된 items: ${extraItems.map(i => i.name).join(", ")}`);
        console.log(`  정상 trackingNumbers: ${JSON.stringify((rs.trackingNumbers || []).filter(t => !completedTrackings.has(t)))}`);
        console.log(`  정상 items: ${(rs.items || []).filter(i => !completedItemNames.has(i.name)).map(i => i.name).join(", ")}`);
      } else {
        console.log(`[${orderId}] OK`);
      }
    }
  }
  process.exit(0);
}
run().catch(err => { console.error(err); process.exit(1); });
