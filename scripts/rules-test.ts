/**
 * scripts/rules-test.ts
 *
 * firestore.rules를 Firestore 에뮬레이터 위에서 직접 검증한다.
 * Auth 도입처럼 rules를 바꾸는 작업은 배포 즉시 실사용 중인 앱에 영향을 주므로,
 * 배포 전에 여기서 먼저 통과시키는 것이 유일한 안전장치다.
 *
 * ⚠️ 지금 이 파일은 "현재 rules"(=인증 없이 전체 허용, stock_logs만 immutable)의
 * 동작을 그대로 문서화한 것이다. Auth를 붙이고 firestore.rules를 강화하면
 * 아래 "인증 없이 허용됨" 계열 assertSucceeds들은 의도적으로 실패해야 정상이다 —
 * 그때 이 파일도 함께 업데이트할 것 (DEPLOY_CHECKLIST.md 1항 참고).
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

  // --- 현재 상태: 인증 없이도 inventory/orders/logs/products 전부 허용 ---
  await expectSucceeds(
    "[현재 정책] 인증 없이 inventory 쓰기 허용됨",
    setDoc(doc(anon, "inventory", "RULES_TEST_SKU"), { name: "test", stock: 1 })
  );
  await expectSucceeds(
    "[현재 정책] 인증 없이 orders 쓰기 허용됨",
    setDoc(doc(anon, "orders", "RULES_TEST_ORDER"), { status: "READY" })
  );
  await expectSucceeds(
    "[현재 정책] 인증 없이 logs 읽기 허용됨",
    getDoc(doc(anon, "logs", "nonexistent"))
  );

  // --- stock_logs immutability: Auth 유무와 무관하게 항상 지켜져야 하는 불변식 ---
  await expectSucceeds(
    "stock_logs 생성(create)은 허용됨",
    setDoc(doc(anon, "stock_logs", "RULES_TEST_LOG"), {
      sku: "RULES_TEST_SKU",
      delta: 1,
      type: "ADJUSTMENT",
      source: "RULES_TEST"
    })
  );
  await expectFails(
    "stock_logs 수정(update)은 항상 거부됨 — 원장 불변성",
    updateDoc(doc(anon, "stock_logs", "RULES_TEST_LOG"), { delta: 999 })
  );
  await expectFails(
    "stock_logs 삭제(delete)는 항상 거부됨 — 원장 불변성",
    deleteDoc(doc(anon, "stock_logs", "RULES_TEST_LOG"))
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
