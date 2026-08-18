import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, getDoc, collectionGroup } from "firebase/firestore";

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

const tracking = "6097532391960";

async function run() {
  // orders 컬렉션에서 검색
  const [byArr, byLeg] = await Promise.all([
    getDocs(query(collection(db, "orders"), where("trackingNumbers", "array-contains", tracking))),
    getDocs(query(collection(db, "orders"), where("tracking", "==", tracking)))
  ]);

  const seen = new Set();
  const orderDocs = [...byArr.docs, ...byLeg.docs].filter(d => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });

  if (orderDocs.length === 0) {
    console.log("orders에서도 못 찾음. 송장번호를 다시 확인해주세요.");
    process.exit(0);
  }

  for (const orderDoc of orderDocs) {
    const order = orderDoc.data();
    console.log(`\n[order] id: ${orderDoc.id}`);
    console.log(`  status: ${order.status}, isCompleted: ${order.isCompleted}, mergedInto: ${order.mergedInto}`);
    console.log(`  order items(${order.items?.length ?? 0}):`);
    (order.items || []).forEach((item, i) => console.log(`    [${i}] ${item.name} qty:${item.qty ?? item.quantity}`));

    // shipments 서브컬렉션 확인
    const shipmentsSnap = await getDocs(collection(db, "orders", orderDoc.id, "shipments"));
    console.log(`\n  shipments(${shipmentsSnap.size}):`);
    shipmentsSnap.docs.forEach(s => {
      const sd = s.data();
      console.log(`    [${s.id}]`);
      console.log(`      status: ${sd.status}, isCompleted: ${sd.isCompleted}`);
      console.log(`      tracking: ${sd.tracking}, trackingNumbers: ${JSON.stringify(sd.trackingNumbers)}`);
      console.log(`      items(${sd.items?.length ?? 0}):`);
      (sd.items || []).forEach((item, i) => console.log(`        [${i}] ${item.name} qty:${item.qty ?? item.quantity}`));
    });
  }

  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
