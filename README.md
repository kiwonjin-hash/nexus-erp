# nexus-erp — 여금 재고관리 ERP 프론트엔드

여의도 금거래소(여금)의 귀금속 상품 재고를 관리하는 ERP. 아임웹 쇼핑몰과 연동해
주문 → 재고 차감 → 출고 흐름을 다룬다. React + Vite + TypeScript + Firebase(Firestore, Hosting).

전체 시스템 구조(웹훅 서버와의 관계, Firestore 컬렉션 구조, 데이터 흐름)는
`../../SYSTEM_OVERVIEW.md`를 먼저 읽을 것.

## 로컬 실행

```bash
npm install
npm run dev          # http://localhost:5173
```

## 배포

```bash
npm run deploy:staging   # Firebase Hosting 임시 채널 (30일 만료)
npm run deploy:prod      # 프로덕션 (https://ygold-erp-5991b.web.app)
```

배포 전 확인 절차는 `../../DEPLOY_CHECKLIST.md`, 문제 생겼을 때 되돌리는 방법은
`../../ROLLBACK.md` 참고 — 실사용 중인 시스템이라 반드시 먼저 읽고 배포할 것.

## 테스트 (하네스)

Firestore 에뮬레이터가 필요하다 (Java 런타임 필요 — 없으면 `brew install openjdk` 등으로 설치).

```bash
npm run test:smoke:ci   # 핵심 재고 경로(출고완료/재고차감/원장기록/미매칭처리) 검증
npm run test:rules:ci   # firestore.rules 검증 (특히 stock_logs immutable 여부)
npm run test:all        # 위 둘 다
```

에뮬레이터를 직접 띄워두고 반복 실행하고 싶으면:
```bash
npm run emulators       # 별도 터미널에서
npm run test:smoke      # 이 터미널에서
```

## 주요 디렉터리

| 경로 | 역할 |
|---|---|
| `pages/` | 화면 단위 (Dashboard, Inbound, outbound, Inventory, Logs) |
| `services/inventoryService.ts` | 모든 Firestore 읽기/쓰기가 모이는 곳. 재고 변경은 반드시 `adjustStock()`을 거친다 |
| `scripts/smoke-test.ts`, `scripts/rules-test.ts` | 배포 전 검증 하네스 |
| `scripts/one-off/` | 과거 1회성 데이터 수정 스크립트 (재실행 금지, `scripts/one-off/README.md` 참고) |
| `firebase.ts` | Firestore 클라이언트 초기화 |
| `firestore.rules` | 접근 권한 규칙 — 현재 인증 미구현으로 임시 전체 허용 상태 (남은 작업, SYSTEM_OVERVIEW.md 참고) |

## 환경변수 (`.env.local`)

```
VITE_WEBHOOK_SERVER_URL=https://imweb-webhook-chi.vercel.app
VITE_TEST_SECRET=...
VITE_PICKUP_SHEET_WEBHOOK_URL=...
```
