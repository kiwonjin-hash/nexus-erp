import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, collection, getDocs } from "firebase/firestore";

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
  for (const s of shipments) {
    const docId = `${s.orderId}_${s.tracking}`;
    const shipRef = doc(db, "orders", s.orderId, "shipments", docId);
    const orderRef = doc(db, "orders", s.orderId);

    const [shipSnap, orderSnap] = await Promise.all([getDoc(shipRef), getDoc(orderRef)]);

    const ship = shipSnap.exists() ? shipSnap.data() : null;
    const order = orderSnap.exists() ? orderSnap.data() : null;

    // 차단 조건 점검
    const shipStatus = String(ship?.status || "").trim().toUpperCase();
    const orderStatus = String(order?.status || "").trim().toUpperCase();
    const isShipmentReady = shipStatus === "READY";

    const blocked =
      shipStatus === "COMPLETED" ||
      shipStatus === "MERGED" ||
      (!isShipmentReady && orderStatus === "COMPLETED") ||
      (!isShipmentReady && orderStatus === "MERGED") ||
      ship?.isCompleted === true ||
      (!isShipmentReady && order?.isCompleted === true) ||
      Boolean(order?.mergedInto);

    const reasons = [];
    if (shipStatus === "COMPLETED") reasons.push(`shipStatus=COMPLETED`);
    if (shipStatus === "MERGED") reasons.push(`shipStatus=MERGED`);
    if (!isShipmentReady && orderStatus === "COMPLETED") reasons.push(`!isShipmentReady && orderStatus=COMPLETED`);
    if (!isShipmentReady && orderStatus === "MERGED") reasons.push(`!isShipmentReady && orderStatus=MERGED`);
    if (ship?.isCompleted === true) reasons.push(`ship.isCompleted=true`);
    if (!isShipmentReady && order?.isCompleted === true) reasons.push(`!isShipmentReady && order.isCompleted=true`);
    if (Boolean(order?.mergedInto)) reasons.push(`order.mergedInto="${order?.mergedInto}"`);

    console.log(`\n[${s.orderId}]`);
    console.log(`  shipment: status=${shipStatus}, isCompleted=${ship?.isCompleted}, pickupReady=${ship?.pickupReady}`);
    console.log(`  order:    status=${orderStatus}, isCompleted=${order?.isCompleted}, mergedInto=${order?.mergedInto}`);
    console.log(`  차단됨: ${blocked ? "YES ← " + reasons.join(", ") : "NO (통과)"}`);
  }

  process.exit(0);
}

run().catch(err => {
  console.error("오류:", err);
  process.exit(1);
});
