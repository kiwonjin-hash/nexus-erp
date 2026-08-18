import { initializeApp } from "firebase/app";
import { getFirestore, doc, updateDoc } from "firebase/firestore";

const app = initializeApp({
  apiKey: "AIzaSyALkqD8wlrIPTAD0wDwffivZn7SMrDrwk4",
  authDomain: "ygold-erp-5991b.firebaseapp.com",
  projectId: "ygold-erp-5991b",
  storageBucket: "ygold-erp-5991b.firebasestorage.app",
  messagingSenderId: "482349244297",
  appId: "1:482349244297:web:0867a69ac6f4479416cb58"
});
const db = getFirestore(app);

const fixes = [
  {
    path: "orders/202602216021081/shipments/202602216021081_6097532500315",
    trackingNumbers: ["6097532500315"],
    tracking: "6097532500315",
    items: [
      { name: "(4월 초 배송)31.1g 은화 중국 실버 판다 랜덤 연도 BU .999", qty: 2, sku: "" },
      { name: "(4월 초 배송) 30g 은화 중국 실버 판다 BU 랜덤 연도 999", qty: 2, sku: "" }
    ]
  },
  {
    path: "orders/202602234410169/shipments/202602234410169_6097532500566",
    trackingNumbers: ["6097532500566"],
    tracking: "6097532500566",
    items: [
      { name: "(4월 초 배송)31.1g 은화 중국 실버 판다 랜덤 연도 BU .999", qty: 1, sku: "" },
      { name: "(4월 초 배송) 30g 은화 중국 실버 판다 BU 랜덤 연도 999", qty: 1, sku: "" }
    ]
  },
  {
    path: "orders/202603061667308/shipments/202603061667308_6097532500908",
    trackingNumbers: ["6097532500908"],
    tracking: "6097532500908",
    items: [
      { name: "(4월 초 배송)31.1g 은화 중국 실버 판다 랜덤 연도 BU .999", qty: 1, sku: "" }
    ]
  },
  {
    path: "orders/202603073180504/shipments/202603073180504_6097532500999",
    trackingNumbers: ["6097532500999"],
    tracking: "6097532500999",
    items: [
      { name: "(4월 초 배송)31.1g 은화 중국 실버 판다 랜덤 연도 BU .999", qty: 1, sku: "" }
    ]
  },
  {
    path: "orders/202603120191593/shipments/202603120191593_6097532501058",
    trackingNumbers: ["6097532501058"],
    tracking: "6097532501058",
    items: [
      { name: "(4월 초 배송)31.1g 은화 중국 실버 판다 랜덤 연도 BU .999", qty: 1, sku: "" }
    ]
  },
];

async function run() {
  for (const fix of fixes) {
    const parts = fix.path.split("/");
    const ref = doc(db, parts[0], parts[1], parts[2], parts[3]);
    await updateDoc(ref, {
      trackingNumbers: fix.trackingNumbers,
      tracking: fix.tracking,
      items: fix.items
    });
    console.log(`✓ ${fix.path}`);
    console.log(`  trackingNumbers: ${JSON.stringify(fix.trackingNumbers)}`);
    console.log(`  items: ${fix.items.map(i => `${i.name}(${i.qty})`).join(", ")}`);
  }
  console.log("\n완료. PICKUP shipment(202603120191593_PICKUP)는 별도 확인 필요.");
  process.exit(0);
}
run().catch(err => { console.error(err); process.exit(1); });
