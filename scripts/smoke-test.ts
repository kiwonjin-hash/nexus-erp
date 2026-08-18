/**
 * scripts/smoke-test.ts
 *
 * Firestore 에뮬레이터 위에서 실제 inventoryService 로직(adjustStock, completeOrder,
 * addInbound, linkUnmatchedItem)을 그대로 호출해 핵심 재고 경로를 검증하는 스모크 테스트.
 *
 * ⚠️ 프로덕션 Firestore를 절대 건드리지 않도록 USE_FIRESTORE_EMULATOR=true 가 없으면
 * 즉시 종료한다. firebase.ts가 이 플래그를 보고 에뮬레이터로 연결을 돌린다.
 *
 * 실행법 (다른 터미널에서 에뮬레이터를 먼저 켜둔 상태):
 *   firebase emulators:start --only firestore
 *   npm run test:smoke
 *
 * 또는 한 번에:
 *   npm run test:smoke:ci   (firebase emulators:exec 로 에뮬레이터 기동+실행+종료를 한 번에 처리)
 *
 * 범위 밖: 아임웹 웹훅의 실제 SKU 매칭(_lib/matcher.js, order-sync.js)은 아임웹 API
 * 응답을 목(mock)해야 해서 여기 포함하지 않았다. 이 스크립트는 "웹훅이 orders/shipments를
 * 이미 만들어 놓은 이후"부터 시작하는 ERP 쪽 핵심 경로(실제로 돈이 움직이는 출고/재고 차감
 * 구간)에 집중한다. 아임웹 동기화 자체는 DEPLOY_CHECKLIST.md의 수동 확인 단계에서 커버.
 */

if (process.env.USE_FIRESTORE_EMULATOR !== "true") {
  console.error(
    "❌ USE_FIRESTORE_EMULATOR=true 가 설정되지 않았습니다. " +
      "이 상태로 실행하면 프로덕션 Firestore에 테스트 데이터가 써질 위험이 있어 중단합니다."
  );
  process.exit(1);
}

import {
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs
} from "firebase/firestore";
import { db } from "../firebase";
import { inventoryService } from "../services/inventoryService";

const RUN_ID = Date.now();
const TEST_SKU = `SMOKE_TEST_SKU_${RUN_ID}`;
const TEST_ORDER_ID = `SMOKE_TEST_ORDER_${RUN_ID}`;
const UNMATCHED_ORDER_ID = `SMOKE_TEST_ORDER_UNMATCHED_${RUN_ID}`;
const INITIAL_STOCK = 100;

type TestResult = { name: string; pass: boolean; detail?: string };
const results: TestResult[] = [];

function assert(name: string, condition: boolean, detail?: string) {
  results.push({ name, pass: condition, detail });
  console.log(`${condition ? "✅" : "❌"} ${name}${detail && !condition ? ` — ${detail}` : ""}`);
}

async function getLatestStockLog(sku: string, source: string) {
  const q = query(
    collection(db, "stock_logs"),
    where("sku", "==", sku),
    where("source", "==", source)
  );
  const snap = await getDocs(q);
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() as any }));
  docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  return docs[0] || null;
}

async function seed() {
  await setDoc(doc(db, "inventory", TEST_SKU), {
    name: `스모크테스트 상품 ${RUN_ID}`,
    category: "TEST",
    stock: INITIAL_STOCK,
    lowStockThreshold: 5,
    link: "",
    lastUpdated: new Date()
  });

  // 웹훅이 이미 만들어 놓았을 orders/shipments를 흉내낸다 (매칭된 케이스)
  await setDoc(doc(db, "orders", TEST_ORDER_ID), {
    status: "READY",
    deliveryType: "POST",
    tracking: "TESTTRACK123",
    createdAt: new Date()
  });
  await setDoc(doc(db, "orders", TEST_ORDER_ID, "shipments", "shipment-1"), {
    status: "READY",
    deliveryType: "POST",
    tracking: "TESTTRACK123",
    trackingNumbers: ["TESTTRACK123"],
    items: [{ sku: TEST_SKU, name: `스모크테스트 상품 ${RUN_ID}`, quantity: 3 }]
  });

  // 미매칭 케이스용 주문 (SKU가 inventory에 없음)
  await setDoc(doc(db, "orders", UNMATCHED_ORDER_ID), {
    status: "READY",
    deliveryType: "POST",
    tracking: "TESTTRACK999",
    createdAt: new Date()
  });
  await setDoc(doc(db, "orders", UNMATCHED_ORDER_ID, "shipments", "shipment-1"), {
    status: "READY",
    deliveryType: "POST",
    tracking: "TESTTRACK999",
    trackingNumbers: ["TESTTRACK999"],
    items: [{ sku: "SMOKE_TEST_NONEXISTENT_SKU", name: "존재하지 않는 상품", quantity: 2 }]
  });
}

async function testCompleteOrder_matched() {
  const ok = await inventoryService.completeOrder(
    TEST_ORDER_ID,
    [{ sku: TEST_SKU, qty: 3, name: `스모크테스트 상품 ${RUN_ID}` }],
    "smoke-test",
    { deliveryType: "POST", tracking: "TESTTRACK123", trackingNumbers: ["TESTTRACK123"] }
  );
  assert("completeOrder(매칭)가 성공 반환", ok === true);

  const invSnap = await getDoc(doc(db, "inventory", TEST_SKU));
  const stockAfter = Number(invSnap.data()?.stock ?? -1);
  assert(
    "출고완료 후 재고가 정확히 3만큼 차감됨",
    stockAfter === INITIAL_STOCK - 3,
    `기대값 ${INITIAL_STOCK - 3}, 실제값 ${stockAfter}`
  );

  const log = await getLatestStockLog(TEST_SKU, "ORDER_COMPLETE");
  assert(
    "stock_logs에 OUTBOUND/ORDER_COMPLETE 원장 기록됨",
    !!log && log.delta === -3 && log.type === "OUTBOUND" && log.orderId === TEST_ORDER_ID,
    JSON.stringify(log)
  );

  const orderSnap = await getDoc(doc(db, "orders", TEST_ORDER_ID));
  assert("주문 status가 COMPLETED로 변경됨", orderSnap.data()?.status === "COMPLETED");

  const shipmentSnap = await getDoc(doc(db, "orders", TEST_ORDER_ID, "shipments", "shipment-1"));
  assert("shipment status가 COMPLETED로 변경됨", shipmentSnap.data()?.status === "COMPLETED");
}

async function testCompleteOrder_unmatched(): Promise<string | null> {
  const ok = await inventoryService.completeOrder(
    UNMATCHED_ORDER_ID,
    [{ sku: "SMOKE_TEST_NONEXISTENT_SKU", qty: 2, name: "존재하지 않는 상품" }],
    "smoke-test",
    { deliveryType: "POST", tracking: "TESTTRACK999", trackingNumbers: ["TESTTRACK999"] }
  );
  assert("completeOrder(미매칭)가 성공 반환 (재고 없어도 에러 아님)", ok === true);

  const q = query(collection(db, "logs"), where("orderId", "==", UNMATCHED_ORDER_ID));
  const snap = await getDocs(q);
  const logDoc = snap.docs[0];
  const logData: any = logDoc?.data();

  assert(
    "미매칭 항목이 needsReview=true로 기록됨",
    logData?.needsReview === true && Array.isArray(logData?.unmatchedItems) && logData.unmatchedItems.length === 1,
    JSON.stringify(logData?.unmatchedItems)
  );

  const staleLog = await getLatestStockLog("SMOKE_TEST_NONEXISTENT_SKU", "ORDER_COMPLETE");
  assert("미매칭 SKU는 재고 원장에 기록되지 않음 (재고 미차감)", staleLog === null);

  return logDoc?.id || null;
}

async function testAddInbound() {
  const before = (await getDoc(doc(db, "inventory", TEST_SKU))).data()?.stock;
  const ok = await inventoryService.addInbound(TEST_SKU, 10, "smoke-test-operator");
  assert("addInbound가 성공 반환", ok === true);

  const after = (await getDoc(doc(db, "inventory", TEST_SKU))).data()?.stock;
  assert("입고 후 재고가 정확히 10만큼 증가함", after === before + 10, `${before} → ${after}`);

  const log = await getLatestStockLog(TEST_SKU, "INBOUND_PAGE");
  assert(
    "stock_logs에 INBOUND/INBOUND_PAGE 원장 기록됨",
    !!log && log.delta === 10 && log.type === "INBOUND"
  );
}

async function testLinkUnmatchedItem(logId: string | null) {
  if (!logId) {
    assert("linkUnmatchedItem 테스트용 로그 확보", false, "미매칭 로그 id를 찾지 못함");
    return;
  }

  const before = (await getDoc(doc(db, "inventory", TEST_SKU))).data()?.stock;
  const ok = await inventoryService.linkUnmatchedItem(logId, 0, TEST_SKU);
  assert("linkUnmatchedItem이 성공 반환", ok === true);

  const after = (await getDoc(doc(db, "inventory", TEST_SKU))).data()?.stock;
  assert("수동 연결 후 재고가 정확히 2만큼 차감됨", after === before - 2, `${before} → ${after}`);

  const log = await getLatestStockLog(TEST_SKU, "LINK_MATCH");
  assert(
    "stock_logs에 OUTBOUND/LINK_MATCH 원장 기록됨",
    !!log && log.delta === -2 && log.type === "OUTBOUND"
  );

  const logSnap = await getDoc(doc(db, "logs", logId));
  assert("연결 후 needsReview가 false로 바뀜", logSnap.data()?.needsReview === false);
}

async function cleanup() {
  await deleteDoc(doc(db, "inventory", TEST_SKU)).catch(() => {});
  await deleteDoc(doc(db, "orders", TEST_ORDER_ID, "shipments", "shipment-1")).catch(() => {});
  await deleteDoc(doc(db, "orders", TEST_ORDER_ID)).catch(() => {});
  await deleteDoc(doc(db, "orders", UNMATCHED_ORDER_ID, "shipments", "shipment-1")).catch(() => {});
  await deleteDoc(doc(db, "orders", UNMATCHED_ORDER_ID)).catch(() => {});

  for (const orderId of [TEST_ORDER_ID, UNMATCHED_ORDER_ID]) {
    const snap = await getDocs(query(collection(db, "logs"), where("orderId", "==", orderId)));
    for (const d of snap.docs) await deleteDoc(d.ref).catch(() => {});
  }

  // stock_logs는 firestore.rules에서 delete를 항상 거부한다 (원장 불변성) — 의도된 동작이라
  // 지우려 시도하지 않는다. 에뮬레이터는 실행마다 초기화되므로 테스트 stock_logs가 남아도 무해하다.
}

async function main() {
  console.log(`🧪 스모크 테스트 시작 (RUN_ID=${RUN_ID}, 에뮬레이터 대상)\n`);

  try {
    await seed();
    await testCompleteOrder_matched();
    const unmatchedLogId = await testCompleteOrder_unmatched();
    await testAddInbound();
    await testLinkUnmatchedItem(unmatchedLogId);
  } catch (error) {
    console.error("❌ 테스트 실행 중 예외 발생:", error);
    results.push({ name: "예외 없이 실행 완료", pass: false, detail: String(error) });
  } finally {
    await cleanup();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} 통과`);

  if (failed.length > 0) {
    console.error("\n실패한 항목:");
    failed.forEach((r) => console.error(`  - ${r.name}${r.detail ? ` (${r.detail})` : ""}`));
    process.exit(1);
  }

  console.log("✅ 전체 통과 — 배포 진행 가능");
  process.exit(0);
}

main();
