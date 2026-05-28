# 단국 학식 프리오더 API 명세

**Base URL:** `http://localhost:3000`  
**인증:** `Authorization: Bearer <accessToken>` (🔐 표시 엔드포인트)  
**어드민:** 🔑 표시 (JWT + isAdmin 플래그 필요)

---

## 공통

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/health` | 서버 상태 확인 |

---

## Auth `/auth`

| Method | Endpoint | 인증 | 설명 |
|--------|----------|------|------|
| `POST` | `/auth/google` | — | Google idToken 검증 → JWT 발급 |
| `POST` | `/auth/refresh` | — | refreshToken → 새 accessToken 발급 |
| `POST` | `/auth/logout` | 🔐 | 로그아웃 (FCM 토큰 삭제) |
| `PATCH` | `/auth/fcm-token` | 🔐 | FCM 푸시 토큰 등록/갱신 |

**POST /auth/google**
```json
Request:  { "idToken": "구글_아이디_토큰" }
Response: { "accessToken", "refreshToken", "user": { "id", "studentId", "name" } }
```

**POST /auth/refresh**
```json
Request:  { "refreshToken": "..." }
Response: { "accessToken", "refreshToken" }
```

---

## Restaurants `/restaurants`

| Method | Endpoint | 인증 | 설명 |
|--------|----------|------|------|
| `GET` | `/restaurants` | 🔐 | 전체 식당 목록 (영업시간 + AI 부하 포함) |
| `GET` | `/restaurants/:id/menus` | 🔐 | 식당별 활성 메뉴 목록 |
| `PATCH` | `/restaurants/:id/lock` | 🔑 | 식당 수동 잠금/해제 |

**GET /restaurants 응답 예시**
```json
[{
  "id", "name", "code", "openTime", "closeTime",
  "isOpen": true,
  "isLocked": false,
  "lockedUntil": null,
  "estimatedWaitMin": 8,
  "loadScore": 320,
  "isWarning": false
}]
```

**PATCH /restaurants/:id/lock**
```json
Request:  { "locked": true, "durationMin": 10 }
Response: { "id", "isLocked", "lockedUntil" }
```

---

## Menus `/menus`

| Method | Endpoint | 인증 | 설명 |
|--------|----------|------|------|
| `PATCH` | `/menus/:id/soldout` | 🔑 | 품절 토글 |

```json
Request:  { "isSoldout": true }
Response: { "id", "isSoldout" }
```

---

## Orders `/orders`

| Method | Endpoint | 인증 | 설명 |
|--------|----------|------|------|
| `POST` | `/orders/validate` | 🔐 | 결제 전 장바구니 검증 + idempotencyKey 발급 |
| `POST` | `/orders` | 🔐 | 결제 완료 후 주문 생성 |
| `GET` | `/orders/me` | 🔐 | 내 주문 목록 (최근 10건) |
| `GET` | `/orders/:id` | 🔐 | 주문 상세 조회 |
| `POST` | `/orders/:id/cancel` | 🔐 | 주문 취소 + 자동 환불 |

**POST /orders/validate**
```json
Request:  { "items": [{ "menuId": "...", "quantity": 2 }] }
Response: { "idempotencyKey": "uuid", "totalPrice": 9000, "warnings": [] }
// 오류 예시
422: { "code": "VALIDATION_FAILED", "errors": [{ "menuId", "reason": "SOLDOUT" }] }
423: { "code": "RESTAURANT_LOCKED", "lockedUntil": "..." }
```

**POST /orders**
```json
Request:  { "idempotencyKey": "uuid", "items": [...], "totalPrice": 9000 }
Response: 201, 주문 전체 객체 (orderItems, user 포함)
```

---

## Payments `/payments`

| Method | Endpoint | 인증 | 설명 |
|--------|----------|------|------|
| `POST` | `/payments/confirm` | 🔐 | 토스페이먼츠 결제 승인 |
| `POST` | `/payments/webhook` | — | 토스 webhook 수신 (서명 검증) |
| `POST` | `/payments/:id/refund` | — | 결제 환불 요청 |

**POST /payments/confirm**
```json
Request:  { "paymentKey", "orderId", "amount", "idempotencyKey" }
// Mock 결제 (개발환경): { ..., "mock": true }
Response: { "paymentId", "status": "PAID", "tossData": { ... } }
```

---

## Kitchen `/kitchen` 🔑

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/kitchen/:restaurantId/orders` | 접수된 주문 목록 (PENDING/COOKING) |
| `PATCH` | `/kitchen/items/:id/complete` | 조리 완료 처리 → FCM 푸시 + WebSocket |

**PATCH /kitchen/items/:id/complete 응답**
```json
{ "id", "status": "COMPLETED", "allCompleted": true }
```
전체 완료 시 주문 status가 `COMPLETED`로 변경됨

---

## AI `/ai` 🔐

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/ai/wait-time/:restaurantId` | 특정 식당 현재 부하/대기시간 |
| `POST` | `/ai/load-check` | 장바구니 기준 부하 점수 계산 |
| `POST` | `/ai/load-log` | 실제 조리시간 기록 (내부용) |

**GET /ai/wait-time/:restaurantId 응답**
```json
{
  "estimatedWaitMin": 8,
  "loadScore": 320,
  "isWarning": false,   // loadScore >= 400
  "isLocked": false     // loadScore >= 600
}
```

---

## Admin `/admin` 🔑

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/admin/scrape` | 수동 메뉴 크롤링 |
| `GET` | `/admin/restaurants` | 식당 목록 + 스크래핑 상태 |
| `POST` | `/admin/restaurants` | 식당 생성 |
| `POST` | `/admin/menus/bulk` | 메뉴 일괄 등록 |
| `PATCH` | `/admin/menus/:id` | 메뉴 수정 |
| `GET` | `/admin/orders/stats` | 주문 통계 |

**POST /admin/restaurants**
```json
Request: { "name", "code", "openTime": "11:00", "closeTime": "14:00", "maxLoadScore": 600 }
```

**POST /admin/menus/bulk**
```json
Request:  { "restaurantId": "...", "menus": [{ "name", "price", "cookTimeSec"? }] }
Response: { "count": 5, "menus": [...] }
```

**GET /admin/orders/stats 응답**
```json
{
  "totalOrders": 142,
  "todayOrders": 23,
  "todayRevenue": 207000,
  "aiAccuracy": { "loadScore", "estimatedWaitSec", "actualWaitSec" }
}
```

---

## WebSocket

| 채널 | URL | 설명 |
|------|-----|------|
| 주방 | `ws://.../ws/kitchen/:restaurantId` | 새 주문 수신 |
| 사용자 | `ws://.../ws/orders/:orderId` | 조리 완료 알림 |

**주방 이벤트 (수신)**
```json
{ "type": "NEW_ORDER", "order": { ...주문_전체 } }
```

**사용자 이벤트 (수신)**
```json
{
  "type": "ITEM_COMPLETED",
  "orderItemId", "orderNumber", "restaurantName", "menuName",
  "status": "COMPLETED",
  "allCompleted": true
}
```

---

## 주문 흐름

```
1. POST /orders/validate      → idempotencyKey 발급
2. POST /payments/confirm     → 토스 결제 승인
3. POST /orders               → 주문 생성 (WebSocket → 주방)
4. PATCH /kitchen/items/:id/complete → 조리완료 (FCM + WebSocket → 고객)
```

---

## 에러 코드

| 코드 | 상황 |
|------|------|
| `MISSING_TOKEN` | 토큰 미전달 |
| `INVALID_TOKEN` | 만료/위조 토큰 |
| `NOT_DANKOOK_ACCOUNT` | 단국대 이메일 아님 |
| `VALIDATION_FAILED` | 메뉴 품절/비활성/미발견 |
| `RESTAURANT_LOCKED` | 식당 잠금 상태 (HTTP 423) |
| `PAYMENT_REQUIRED` | 결제 미완료 상태에서 주문 생성 시도 |
| `SOLDOUT_AFTER_PAYMENT` | 결제 후 품절 (자동 환불 처리됨) |
| `CANNOT_CANCEL` | 취소 불가 상태 (조리 완료 등) |
