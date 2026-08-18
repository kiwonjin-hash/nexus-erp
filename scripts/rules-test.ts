/**
 * scripts/rules-test.ts
 *
 * firestore.rules를 Firestore 에뮬레이터 위에서 직접 검증한다.
 * Auth 도입처럼 rules를 바꾸는 작업은 배포 즉시 실사용 중인 앱에 영향을 주므로,
 * 배포 전에 여기서 먼저 통과시키는 것이 유일한 안전장치다.
 *
 * 2026-08-18: Auth 도입으로 rules가 request.auth != null 기준으로 강화됨에 따라
 * 이 테스트도 함께 갱신했다 — 미인증 요청은 이제 전부 거부되고, 로그인한 사용자는
 * 여전히 전체 접근 가능해야 한다 (역할 구분 없음).
 *
 * 참고: 웹훅 서버(재고관리 웹훅/)는 Firebase Admin SDK로 붙어서 이 rules 자체를 우회한다 —
 * 여기서 검증하는 대상이 아니다 (Admin SDK는 애초에 rules 평가를 받지 않음).
 *
 * 실행법:
 *   firebase emulators:start --only firestore
 *   npm run test:rules
 */

import { readFileSync } from "fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from "firebase/firestore";

type TestResult = { name: string; pass: boolean; detail?: string };
const results: TestResult[] = [];

function record(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${name}`);
}

async function expectSucceeds(name: string, promise: Promise<any>) {
  try {
    await assertSucceeds(promise);
    record(name, true);
  } catch (e) {
    record(name, false, String(e));
  }
}

async function expectFails(name: string, promise: Promise<any>) {
  try {
    await assertFails(promise);
    record(name, true);
  } catch (e) {
    record(name, false, String(e));
  }
}

async function main() {
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: "ygold-erp-rules-test",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "localhost",
      port: 8080
    }
  });

  await testEnv.clearFirestore();
  const anon = testEnv.unauthenticatedContext().firestore();
  const staff = testEnv.authenticatedContext("staff-uid").firestore();

  // --- 미인증: 전부 거부되어야 함 ---
  await expectFails(
    "미인증 상태로 inventory 쓰기 거부됨",
    setDoc(doc(anon, "inventory", "RULES_TEST_SKU"), { name: "test", stock: 1 })
  );
  await expectFails(
    "미인증 상태로 orders 쓰기 거부됨",
    setDoc(doc(anon, "orders", "RULES_TEST_ORDER"), { status: "READY" })
  );
  await expectFails(
    "미인증 상태로 logs 읽기 거부됨",
    getDoc(doc(anon, "logs", "nonexistent"))
  );
  await expectFails(
    "미인증 상태로 stock_logs 생성도 거부됨",
    setDoc(doc(anon, "stock_logs", "RULES_TEST_LOG_ANON"), {
      sku: "RULES_TEST_SKU",
      delta: 1,
      type: "ADJUSTMENT",
      source: "RULES_TEST"
    })
  );

  // --- 로그인 상태: 역할 구분 없이 전체 접근 허용 ---
  await expectSucceeds(
    "로그인 상태로 inventory 쓰기 허용됨",
    setDoc(doc(staff, "inventory", "RULES_TEST_SKU"), { name: "test", stock: 1 })
  );
  await expectSucceeds(
    "로그인 상태로 orders 쓰기 허용됨",
    setDoc(doc(staff, "orders", "RULES_TEST_ORDER"), { status: "READY" })
  );
  await expectSucceeds(
    "로그인 상태로 logs 읽기 허용됨",
    getDoc(doc(staff, "logs", "nonexistent"))
  );

  // --- stock_logs immutability: 로그인해도 update/delete는 항상 거부되는 불변식 ---
  await expectSucceeds(
    "로그인 상태로 stock_logs 생성(create)은 허용됨",
    setDoc(doc(staff, "stock_logs", "RULES_TEST_LOG"), {
      sku: "RULES_TEST_SKU",
      delta: 1,
      type: "ADJUSTMENT",
      source: "RULES_TEST"
    })
  );
  await expectFails(
    "로그인해도 stock_logs 수정(update)은 항상 거부됨 — 원장 불변성",
    updateDoc(doc(staff, "stock_logs", "RULES_TEST_LOG"), { delta: 999 })
  );
  await expectFails(
    "로그인해도 stock_logs 삭제(delete)는 항상 거부됨 — 원장 불변성",
    deleteDoc(doc(staff, "stock_logs", "RULES_TEST_LOG"))
  );

  await testEnv.clearFirestore();
  await testEnv.cleanup();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} 통과`);

  if (failed.length > 0) {
    console.error("\n실패한 항목:");
    failed.forEach((r) => console.error(`  - ${r.name}${r.detail ? ` (${r.detail})` : ""}`));
    process.exit(1);
  }

  console.log("✅ 전체 통과");
  process.exit(0);
}

main();
