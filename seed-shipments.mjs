import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

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
  {
    orderId: "202602149133935",
    tracking: "6097532499647",
    trackingNumbers: ["6097532499647"],
    name: "박남욱",
    receiver: "박남욱",
    phone: "010-3663-4411",
    address: "서울 송파구 잠실로 88 (잠실동, 레이크팰리스) 114동 204호",
    order_no: "202602149133935",
    items: [
      { name: "(3월 말 배송)31.1g 은화 중국 실버 판다 랜덤 연도 BU .999", qty: 2, sku: "" }
    ]
  },
  {
    orderId: "202602146402629",
    tracking: "6097532499828",
    trackingNumbers: ["6097532499828"],
    name: "유은정",
    receiver: "유은정",
    phone: "010-4057-0655",
    address: "충남 천안시 서북구 불당24로 38 (불당동, 지웰푸르지오) 102동104호",
    order_no: "202602146402629",
    items: [
      { name: "(3월 말 배송)31.1g 은화 중국 실버 판다 랜덤 연도 BU .999", qty: 7, sku: "" }
    ]
  },
  {
    orderId: "202602190612364",
    tracking: "6097532499916",
    trackingNumbers: ["6097532499916"],
    name: "홍미애",
    receiver: "홍미애",
    phone: "010-9934-5030",
    address: "서울 중랑구 용마산로72길 36-14 (면목동) 2층 과학정보부",
    order_no: "202602190612364",
    items: [
      { name: "(4월 초 배송)31.1g 은화 중국 실버 판다 랜덤 연도 BU .999", qty: 1, sku: "" }
    ]
  },
  {
    orderId: "202602200908654",
    tracking: "6097532500118",
    trackingNumbers: ["6097532500118"],
    name: "이연이",
    receiver: "이연이",
    phone: "010-3453-3822",
    address: "경기 수원시 권선구 세화로168번길 15 (서둔동, 센트라우스) 114동 905호",
    order_no: "202602200908654",
    items: [
      { name: "(4월 초 배송)31.1g 은화 중국 실버 판다 랜덤 연도 BU .999", qty: 1, sku: "" }
    ]
  },
  {
    orderId: "202602216021081",
    tracking: "6097532500315",
    trackingNumbers: ["6097532500315"],
    name: "방상희",
    receiver: "방상희",
    phone: "010-2664-7456",
    address: "광주 서구 화정로 107 (쌍촌동, 늘푸른소아과) 2층 규리한의원",
    order_no: "202602216021081",
    items: [
      { name: "(4월 초 배송)31.1g 은화 중국 실버 판다 랜덤 연도 BU .999", qty: 2, sku: "" },
      { name: "(4월 초 배송) 30g 은화 중국 실버 판다 BU 랜덤 연도 999", qty: 2, sku: "" }
    ]
  },
  {
    orderId: "202602220438075",
    tracking: "6097532500378",
    trackingNumbers: ["6097532500378"],
    name: "박미란",
    receiver: "박미란",
    phone: "010-3938-6109",
    address: "서울 마포구 삼개로 20 (도화동, 근신빌딩) 별관 1층 한국마포금거래소",
    order_no: "202602220438075",
    items: [
      { name: "(4월 초 배송)31.1g 은화 중국 실버 판다 랜덤 연도 BU .999", qty: 2, sku: "" }
    ]
  },
  {
    orderId: "202602234410169",
    tracking: "6097532500566",
    trackingNumbers: ["6097532500566"],
    name: "임창수",
    receiver: "임창수",
    phone: "010-5247-3025",
    address: "경기 의왕시 안양판교로 100 (포일동, 인덕원 푸르지오 엘센트로) 102동2501호",
    order_no: "202602234410169",
    items: [
      { name: "(4월 초 배송)31.1g 은화 중국 실버 판다 랜덤 연도 BU .999", qty: 1, sku: "" },
      { name: "(4월 초 배송) 30g 은화 중국 실버 판다 BU 랜덤 연도 999", qty: 1, sku: "" }
    ]
  },
  {
    orderId: "202603061667308",
    tracking: "6097532500908",
    trackingNumbers: ["6097532500908"],
    name: "이홍수",
    receiver: "이홍수",
    phone: "010-6357-7765",
    address: "서울 중구 을지로5길 26 (수하동, 미래에셋 센터원) 동관 25층",
    order_no: "202603061667308",
    items: [
      { name: "(4월 초 배송)31.1g 은화 중국 실버 판다 랜덤 연도 BU .999", qty: 1, sku: "" }
    ]
  },
  {
    orderId: "202603073180504",
    tracking: "6097532500999",
    trackingNumbers: ["6097532500999"],
    name: "김동기",
    receiver: "김동기",
    phone: "010-3103-8364",
    address: "강원특별자치도 강릉시 공항길29번길 7 (병산동) 감자적 1번지",
    order_no: "202603073180504",
    items: [
      { name: "(4월 초 배송)31.1g 은화 중국 실버 판다 랜덤 연도 BU .999", qty: 1, sku: "" }
    ]
  },
  {
    orderId: "202603120191593",
    tracking: "6097532501058",
    trackingNumbers: ["6097532501058"],
    name: "최향란",
    receiver: "최향란",
    phone: "010-3118-7631",
    address: "대구 동구 동호로 88 (신서동, 영조 아름다운나날) 212동 403호",
    order_no: "202603120191593",
    items: [
      { name: "(4월 초 배송)31.1g 은화 중국 실버 판다 랜덤 연도 BU .999", qty: 1, sku: "" }
    ]
  }
];

async function run() {
  let created = 0;
  let skipped = 0;

  for (const s of shipments) {
    const docId = `${s.orderId}_${s.tracking}`;
    const ref = doc(db, "orders", s.orderId, "shipments", docId);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      console.log(`SKIP  orders/${s.orderId}/shipments/${docId} (already exists)`);
      skipped++;
      continue;
    }

    await setDoc(ref, {
      status: "READY",
      deliveryType: "POST",
      pickupReady: false,
      isCompleted: false,
      tracking: s.tracking,
      trackingNumbers: s.trackingNumbers,
      name: s.name,
      receiver: s.receiver,
      phone: s.phone,
      address: s.address,
      order_no: s.order_no,
      items: s.items,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    console.log(`CREATED orders/${s.orderId}/shipments/${docId}`);
    created++;
  }

  console.log(`\n완료: ${created}개 생성, ${skipped}개 스킵`);
  process.exit(0);
}

run().catch(err => {
  console.error("오류:", err);
  process.exit(1);
});
