# 1회성 유지보수 스크립트 모음

⚠️ **전부 프로덕션 Firestore(`ygold-erp-5991b`)에 Firebase 설정을 하드코딩해서 직접 연결한다.**
`node <파일명>` 실행 즉시 실거래 데이터를 읽거나(조회 스크립트) 고친다(수정 스크립트). 재실행 금지 —
대부분 특정 주문번호 하나를 대상으로 그 시점에만 유효했던 1회성 수정이라, 지금 다시 돌리면
이미 정상인 데이터를 건드리거나 존재하지 않는 문서를 대상으로 에러가 날 수 있다.

새로운 유지보수 스크립트가 필요하면 여기 추가하지 말고, 대상 주문번호/조건을 인자로 받게
일반화하거나 `scripts/smoke-test.ts`처럼 에뮬레이터에서 먼저 검증 가능한 형태로 새로 작성할 것.

## 조회 전용 (읽기만 함, 안전)

| 파일 | 용도 |
|---|---|
| `audit-all-shipments.mjs` | 특정 주문 목록의 READY shipment에 완료된 항목/송장이 잘못 섞여 있는지 점검 |
| `check-pickup.mjs` | 주문 `202603120191593`의 방문수령 shipment 상태 조회 |
| `check-tracking.mjs` | 송장번호로 order/shipment를 역으로 검색해 상태 출력 |
| `check2.mjs` | 주문 `202602216021081`의 shipments 상태 조회 |
| `check3.mjs` | 주문 `202603073180504`의 shipments 상태 조회 |
| `diagnose-shipments.mjs` | 출고 처리가 막히는 원인(상태 불일치 등) 진단 |

## 데이터 수정 (쓰기 — 재실행 절대 금지)

| 파일 | 용도 |
|---|---|
| `cleanup-ready-shipments.mjs` | logs에 출고완료 기록이 있는데 shipment는 아직 READY인 것들을 일괄 COMPLETED로 정정 |
| `close-pickup.mjs` | 주문 `202603120191593`의 PICKUP shipment를 강제로 완료 처리 |
| `fix-all-shipments.mjs` | 여러 shipment의 `trackingNumbers`/`items`를 하드코딩된 값으로 직접 수정 |
| `fix-shipment-data.mjs` | shipment `202602200908654_6097532500118`의 데이터를 특정 값으로 수정 |
| `remove-pickup-ready.mjs` | 여러 shipment에서 `pickupReady` 필드를 일괄 삭제 |
| `seed-shipments.mjs` | 누락된 shipment 문서를 조건에 맞춰 일괄 생성 |

## 인수인계 메모

2026-08-18 정리: 원래 프로젝트 루트에 흩어져 있던 것을 이 폴더로 이동하고 목록을 문서화했다.
전부 2026년 2~3월경 실제 배송/출고 데이터 이슈를 그때그때 고치던 스크립트라, 지금 시점에는
"과거에 이런 문제가 있었고 이렇게 고쳤다"는 기록으로서의 가치만 있다. 삭제하지 않은 이유는
비슷한 데이터 이슈가 다시 생겼을 때 패턴 참고용으로 쓸 수 있어서다.
