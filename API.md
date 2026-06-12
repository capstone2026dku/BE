# 단국대 학식 선주문 API 명세

> **Base URL:** `http://localhost:3000`  
> **Content-Type:** `application/json`  
> **최종 업데이트:** Google 로그인 · Mock 결제 반영

---

## 목차

1. [인증 개요](#인증-개요)
2. [Google 로그인 연동](#google-로그인-연동)
3. [토큰 사용법](#토큰-사용법)
4. [공통 API](#공통-api)
5. [Auth API](#auth-api)
6. [Restaurants API](#restaurants-api)
7. [Menus API](#menus-api)
8. [Orders API](#orders-api)
9. [Payments API](#payments-api)
10. [주문 흐름](#주문-흐름)
11. [에러 코드](#에러-코드)

---

## 인증 개요

| 기호 | 의미 |
|------|------|
| — | 인증 불필요 |
| 🔐 | `Authorization: Bearer {accessToken}` 필요 |
| 🔑 | 관리자 JWT (`isAdmin: true` 포함 accessToken) |

| 토큰 | 용도 | 기본 만료 |
|------|------|-----------|
| Google **idToken** | `POST /auth/google` 1회 교환용 | Google 발급 정책 |
| **accessToken** | 이후 모든 🔐 API | 2시간 (`JWT_EXPIRES_IN`) |
| **refreshToken** | accessToken 갱신 | 30일 (`JWT_REFRESH_EXPIRES_IN`) |

> Google idToken과 백엔드 accessToken은 **서로 다른 토큰**입니다.

---

## Google 로그인 연동

### 백엔드 준비 상태

- Google 로그인 API 구현 완료 (`POST /auth/google`)
- Google Cloud Console에서 **OAuth 2.0 웹 클라이언트 ID** 발급 후 `.env`에 `GOOGLE_CLIENT_ID` 설정 완료
- **단국대 Google Workspace** (`@dankook.ac.kr`, `hd === dankook.ac.kr`) 계정만 로그인 허용

### 프론트 연동 순서

```
1. google_sign_in으로 Google 로그인
2. Google OAuth idToken 획득
3. POST /auth/google 로 idToken 전달
4. accessToken / refreshToken 저장
5. 이후 API는 Authorization: Bearer {accessToken}
```

### Flutter (google_sign_in) 예시

```dart
// serverClientId = 백엔드 .env의 GOOGLE_CLIENT_ID (웹 애플리케이션 클라이언트 ID)
final account = await GoogleSignIn(
  serverClientId: '<GOOGLE_CLIENT_ID>',
  scopes: ['email', 'profile'],
).signIn();

final idToken = account?.authentication.idToken;
if (idToken == null) throw Exception('idToken 없음');

final res = await http.post(
  Uri.parse('http://localhost:3000/auth/google'),
  headers: {'Content-Type': 'application/json'},
  body: jsonEncode({'idToken': idToken}),
);
```

### ⚠️ Firebase Auth 주의

| 방식 | 백엔드 검증 |
|------|-------------|
| `google_sign_in` → **Google OAuth idToken** | ✅ (`audience` = `GOOGLE_CLIENT_ID`) |
| Firebase Auth `getIdToken()`만 사용 | ❌ 실패 가능 (audience가 Firebase 프로젝트) |

**권장:** `google_sign_in`으로 받은 **Google OAuth idToken**을 `/auth/google`에 전달하세요.

### 서버 환경 변수 (민감값은 .env에만 보관)

| 변수 | 설명 |
|------|------|
| `GOOGLE_CLIENT_ID` | 웹 OAuth 클라이언트 ID (프론트 `serverClientId`와 동일) |
| `JWT_SECRET` | accessToken 서명용 |
| `JWT_REFRESH_SECRET` | refreshToken 서명용 |

---

## 토큰 사용법

### 로그인 성공 응답

```http
POST /auth/google
Content-Type: application/json

{
  "idToken": "<Google OAuth idToken>"
}
```

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": "uuid",
    "studentId": "32200000",
    "name": "홍길동"
  }
}
```

- `studentId` = Google 이메일 `@` 앞부분 (예: `32200000@dankook.ac.kr` → `32200000`)
- 최초 로그인 시 DB에 사용자 자동 생성 (별도 회원가입 없음)

### 인증이 필요한 API

```http
GET /restaurants
Authorization: Bearer eyJ...
Content-Type: application/json
```

### accessToken 만료 시

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJ..."
}
```

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

---

## 공통 API

### GET /health

인증 불필요. 서버 상태 확인.

```http
GET /health
```

```json
{
  "status": "ok",
  "timestamp": "2026-05-28T10:00:00.000Z"
}
```

---

## Auth API

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| POST | `/auth/google` | — | Google idToken → JWT 발급 |
| POST | `/auth/refresh` | — | refreshToken으로 토큰 갱신 |
| POST | `/auth/logout` | 🔐 | 로그아웃 (FCM 토큰 초기화) |
| PATCH | `/auth/fcm-token` | 🔐 | FCM 디바이스 토큰 등록 |

### POST /auth/google

**Request**

```json
{
  "idToken": "Google Sign-In 후 받은 idToken"
}
```

**Response 200**

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": {
    "id": "...",
    "studentId": "...",
    "name": "..."
  }
}
```

**Error**

| HTTP | code | 설명 |
|------|------|------|
| 400 | `MISSING_TOKEN` | idToken 없음 |
| 401 | `INVALID_TOKEN` | Google 토큰 무효/만료 |
| 403 | `NOT_DANKOOK_ACCOUNT` | 단국대 계정 아님 |

### POST /auth/refresh

**Request:** `{ "refreshToken": "..." }`  
**Response:** `{ "accessToken", "refreshToken" }` (user 객체 없음)

### POST /auth/logout

**Request:** Header `Authorization: Bearer {accessToken}`  
**Response:** `{ "message": "로그아웃 완료" }`

### PATCH /auth/fcm-token

**Request**

```http
PATCH /auth/fcm-token
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "fcmToken": "디바이스_FCM_토큰"
}
```

**Response:** `{ "message": "FCM 토큰 업데이트 완료" }`

---

## Restaurants API

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | `/restaurants` | 🔐 | 전체 식당 목록 |
| GET | `/restaurants/:id/menus` | 🔐 | 식당별 활성 메뉴 |
| PATCH | `/restaurants/:id/lock` | 🔑 | 식당 수동 잠금/해제 |

### GET /restaurants

```http
GET /restaurants
Authorization: Bearer {accessToken}
```

**Response 200**

```json
[
  {
    "id": "uuid",
    "name": "51장국밥",
    "code": "JGB",
    "openTime": "10:30",
    "closeTime": "19:00",
    "isOpen": true,
    "isLocked": false,
    "lockedUntil": null
  }
]
```

### GET /restaurants/:id/menus

```http
GET /restaurants/{restaurantId}/menus
Authorization: Bearer {accessToken}
```

**Response:** 활성 메뉴 배열 (`isActive: true`)

### PATCH /restaurants/:id/lock

```http
PATCH /restaurants/{restaurantId}/lock
Authorization: Bearer {adminAccessToken}
Content-Type: application/json

{
  "locked": true,
  "durationMin": 10
}
```

**Response**

```json
{
  "id": "uuid",
  "isLocked": true,
  "lockedUntil": "2026-05-28T10:10:00.000Z"
}
```

---

## Menus API

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| PATCH | `/menus/:id/soldout` | 🔑 | 품절 상태 변경 |

```http
PATCH /menus/{menuId}/soldout
Authorization: Bearer {adminAccessToken}
Content-Type: application/json

{
  "isSoldout": true
}
```

**Response**

```json
{
  "id": "uuid",
  "isSoldout": true
}
```

---

## Orders API

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| POST | `/orders/validate` | 🔐 | 장바구니 검증 + idempotencyKey 발급 |
| POST | `/orders` | 🔐 | 결제 완료 후 주문 생성 |
| GET | `/orders/me` | 🔐 | 내 주문 목록 (최근 10건) |
| GET | `/orders/:id` | 🔐 | 주문 상세 |
| POST | `/orders/:id/cancel` | 🔐 | 주문 취소 + 환불 |

### POST /orders/validate

```http
POST /orders/validate
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "items": [
    { "menuId": "menu-uuid", "quantity": 2 }
  ]
}
```

**Response 200**

```json
{
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000",
  "totalPrice": 9000
}
```

**Error 422**

```json
{
  "code": "VALIDATION_FAILED",
  "errors": [
    { "menuId": "...", "name": "고기만국밥", "reason": "SOLDOUT" }
  ]
}
```

`reason`: `MENU_NOT_FOUND` | `MENU_INACTIVE` | `SOLDOUT` | `RESTAURANT_LOCKED`

### POST /orders

결제(`PAID`) 완료 후 호출. `idempotencyKey`는 validate·결제 단계와 **동일 값** 사용.

```http
POST /orders
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000",
  "items": [
    { "menuId": "menu-uuid", "quantity": 2 }
  ],
  "totalPrice": 9000
}
```

**Response 201:** 주문 전체 객체 (`orderItems`, `user`, `payment` 포함)

**Error**

| HTTP | code | 설명 |
|------|------|------|
| 402 | `PAYMENT_REQUIRED` | 해당 idempotencyKey 결제 미완료 |
| 422 | `SOLDOUT_AFTER_PAYMENT` | 결제 후 품절 (자동 환불 시도) |

### GET /orders/me

```http
GET /orders/me
Authorization: Bearer {accessToken}
```

최근 주문 10건 (orderItems, payment 포함)

### GET /orders/:id

```http
GET /orders/{orderId}
Authorization: Bearer {accessToken}
```

본인 주문만 조회 가능.

### POST /orders/:id/cancel

```http
POST /orders/{orderId}/cancel
Authorization: Bearer {accessToken}
```

**Response:** `{ "message": "주문이 취소되었습니다." }`  
취소 가능 상태: `PENDING`, `PAID`

---

## Payments API

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| POST | `/payments/confirm` | 🔐 | 결제 승인 (Toss / Mock) |
| POST | `/payments/webhook` | — | Toss 웹훅 (서버→서버) |
| POST | `/payments/:id/refund` | — | 환불 |

### POST /payments/confirm — Mock 결제 (개발)

**조건:** `NODE_ENV=development` 이고 body에 `"mock": true`

테스트 성공 확인됨. Order + Payment를 함께 생성합니다.

```http
POST /payments/confirm
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "amount": 8500,
  "mock": true
}
```

**Response 200**

```json
{
  "paymentId": "uuid",
  "status": "PAID"
}
```

**선택 필드**

| 필드 | 설명 |
|------|------|
| `idempotencyKey` | 생략 시 서버가 `mock-{uuid}` 자동 생성. 이후 `POST /orders`와 맞추려면 validate에서 받은 키를 동일하게 전달 |

```json
{
  "amount": 8500,
  "mock": true,
  "idempotencyKey": "validate에서_받은_키"
}
```

### POST /payments/confirm — 실제 Toss 결제

```http
POST /payments/confirm
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "paymentKey": "토스_결제키",
  "orderId": "토스_주문ID",
  "amount": 8500,
  "idempotencyKey": "validate에서_받은_키"
}
```

**Response 200**

```json
{
  "paymentId": "uuid",
  "status": "PAID",
  "tossData": { }
}
```

### POST /payments/webhook

Toss 서버 → 백엔드 콜백. 프론트에서 직접 호출하지 않음.  
`toss-signature` 헤더로 서명 검증 (`TOSS_WEBHOOK_SECRET` 설정 시).

**Response:** `{ "received": true }`

### POST /payments/:id/refund

```http
POST /payments/{paymentId}/refund
Content-Type: application/json

{
  "reason": "환불 사유 (선택)"
}
```

Mock 결제(`provider: mock`)는 Toss API 없이 DB 상태만 `REFUNDED`로 변경.

---

## 주문 흐름

### 프로덕션 (Toss)

```
1. POST /auth/google              → accessToken
2. POST /orders/validate          → idempotencyKey, totalPrice
3. [프론트] Toss 결제 UI
4. POST /payments/confirm         → paymentId (Toss 승인)
5. POST /orders                   → 주문 생성
```

### 개발 (Mock 결제)

```
1. POST /auth/google
2. POST /orders/validate          → idempotencyKey (선택, mock에도 동일 키 권장)
3. POST /payments/confirm
   Body: { "amount": 8500, "mock": true, "idempotencyKey": "..." }
   → { "paymentId", "status": "PAID" }
4. POST /orders
   Body: { "idempotencyKey", "items", "totalPrice" }
```

---

## 에러 코드

| code | HTTP | 설명 |
|------|------|------|
| `UNAUTHORIZED` | 401 | Authorization 헤더 없음/형식 오류 |
| `TOKEN_EXPIRED` | 401 | accessToken 만료 |
| `INVALID_TOKEN` | 401 | JWT 또는 Google 토큰 무효 |
| `MISSING_TOKEN` | 400 | idToken / refreshToken 없음 |
| `NOT_DANKOOK_ACCOUNT` | 403 | 단국대 계정 아님 |
| `EMPTY_CART` | 400 | 장바구니 비어 있음 |
| `VALIDATION_FAILED` | 422 | 메뉴 검증 실패 |
| `MISSING_KEY` | 400 | idempotencyKey 없음 |
| `PAYMENT_REQUIRED` | 402 | 결제 미완료 |
| `SOLDOUT_AFTER_PAYMENT` | 422 | 결제 후 품절 |
| `NOT_FOUND` | 404 | 리소스 없음 |
| `CANNOT_CANCEL` | 400 | 취소 불가 상태 |
| `FORBIDDEN` | 403 | 관리자 권한 필요 |

---

## 프론트 체크리스트

- [ ] `google_sign_in` + `serverClientId` = 백엔드 `GOOGLE_CLIENT_ID`
- [ ] `/auth/google`에는 **Google idToken**만 전달 (Firebase `getIdToken()` 단독 사용 X)
- [ ] API 호출 시 `Authorization: Bearer {accessToken}`
- [ ] access 만료 시 `POST /auth/refresh`
- [ ] 개발 결제: `NODE_ENV=development` + `{ "mock": true, "amount": N }`
- [ ] validate → confirm → orders 순서, **idempotencyKey 동일** 유지
