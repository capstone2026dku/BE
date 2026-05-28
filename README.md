> Last updated: 2026-05-19

# dankook-preorder-backend

단국대학교 학식 선주문 서비스의 백엔드 서버입니다.  
Node.js / Express 기반으로 REST API, WebSocket 실시간 통신, 결제 연동을 제공합니다.

---

## 기술 스택

| 항목 | 내용 |
|------|------|
| 런타임 | Node.js 18+ |
| 프레임워크 | Express 4.18.3 |
| ORM | Prisma 5.10.0 |
| DB | SQLite (개발 / `DATABASE_URL` 변경으로 PostgreSQL 전환 가능) |
| 인증 | Google OAuth 2.0 (google-auth-library) + JWT (액세스 2h / 리프레시 30d) |
| 실시간 | WebSocket (`ws` 8.16.0) |
| 스케줄링 | node-cron 3.0.3 |
| 결제 | Toss Payments API |
| 푸시 알림 | Firebase Admin SDK 12.0.0 (FCM) |
| 스크래핑 | Puppeteer 22.3.0 |

---

## 프로젝트 구조

```
src/
├── index.js                # 서버 진입점 (Express + HTTP + WebSocket + Cron 초기화)
├── routes/
│   ├── auth.js             # 인증 (Google OAuth 로그인, 토큰 갱신, 로그아웃)
│   ├── restaurants.js      # 식당 목록 / 잠금 관리
│   ├── menus.js            # 메뉴 조회
│   ├── orders.js           # 주문 생성 / 조회 / 취소
│   ├── payments.js         # Toss 결제 확인 / 웹훅
│   ├── kitchen.js          # 주방 디스플레이 (조리 현황 조회 / 완료 처리)
│   └── admin.js            # 관리자 전용 (식당 CRUD, 메뉴·주문 통계)
├── middlewares/
│   ├── auth.js             # JWT 검증 미들웨어 (authenticate, requireAdmin)
│   └── errorHandler.js     # 전역 오류 처리
├── utils/
│   ├── websocket.js        # WebSocket 채널 초기화 및 브로드캐스트
│   ├── cron.js             # 크론 작업 (메뉴 동기화 등)
│   ├── fcm.js              # FCM 푸시 알림 발송
│   ├── portalAuth.js       # 단국대 포털 인증 (조리 시간 조회용)
│   └── scraper.js          # 단국대 홈페이지 메뉴 스크래핑

prisma/
├── schema.prisma           # DB 스키마 정의
├── seed.js                 # 초기 데이터 (식당 10개 + 메뉴 60개+)
└── migrations/             # DB 마이그레이션 이력
```

---

## 빠른 시작

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

```bash
cp .env.example .env
# .env 파일을 열어 각 항목을 채워넣습니다
```

### 3. DB 마이그레이션 및 초기 데이터 입력

```bash
npx prisma migrate dev
npm run db:seed
```

### 4. 서버 실행

```bash
# 개발 (nodemon 자동 재시작)
npm run dev

# 프로덕션
npm start
```

서버 주소: `http://localhost:3000`  
헬스체크: `GET /health` → `{ "status": "ok", "timestamp": "..." }`

---

## 스크립트

```bash
npm start          # 프로덕션 서버 실행
npm run dev        # 개발 서버 (nodemon)
npm run db:migrate # 새 마이그레이션 생성
npm run db:seed    # 초기 데이터 입력 (식당·메뉴)
npm run db:studio  # Prisma Studio GUI 실행
```

---

## 환경 변수

`.env.example` 기반:

```env
# 데이터베이스
DATABASE_URL="file:./dev.db"

# JWT
JWT_SECRET="32자 이상의 시크릿 키"
JWT_EXPIRES_IN="2h"
JWT_REFRESH_SECRET="32자 이상의 리프레시 시크릿"
JWT_REFRESH_EXPIRES_IN="30d"

# Google OAuth
# Google Cloud Console > API 및 서비스 > 사용자 인증 정보 > OAuth 2.0 클라이언트 ID
# 웹 애플리케이션 타입으로 생성한 클라이언트 ID (Flutter serverClientId로도 사용)
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com

# Toss Payments
TOSS_CLIENT_KEY="test_ck_..."
TOSS_SECRET_KEY="test_sk_..."
TOSS_WEBHOOK_SECRET="웹훅 시크릿"

# Firebase (FCM)
FIREBASE_PROJECT_ID="프로젝트 ID"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk@project.iam.gserviceaccount.com"

# 서버
PORT=3000
NODE_ENV=development

# 메뉴 자동 동기화
DANKOOK_MENU_URL="https://www.dankook.ac.kr/web/kor/1947_commons"
SCRAPE_CRON="0 7 * * 1-5"          # 평일 오전 7시

```

---

## API 엔드포인트

### 인증 `/auth`

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/auth/google` | Google ID 토큰 검증 후 JWT 발급 (최초 로그인 시 자동 가입) |
| POST | `/auth/refresh` | 리프레시 토큰으로 액세스 토큰 갱신 |
| POST | `/auth/logout` | 로그아웃 (FCM 토큰 초기화) |
| PATCH | `/auth/fcm-token` | FCM 디바이스 토큰 업데이트 |

**로그인 요청 예시:**
```json
// POST /auth/google
{ "idToken": "eyJhbGci..." }

// 응답
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "id": "uuid", "studentId": "32000001", "name": "홍길동" }
}
```

**제약 조건:**
- `@dankook.ac.kr` 계정 외 접근 시 `403 NOT_DANKOOK_ACCOUNT`
- Flutter 앱은 `google_sign_in` 패키지로 idToken을 획득하여 전달
- 회원가입 절차 없음 — 첫 로그인 시 자동으로 계정이 생성됨

---

### 식당 `/restaurants`

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| GET | `/restaurants` | - | 전체 식당 목록 (영업·잠금 상태 포함) |
| GET | `/restaurants/:id/menus` | - | 특정 식당 메뉴 조회 |
| PATCH | `/restaurants/:id/lock` | 관리자 | 식당 수동 잠금 / 해제 |

---

### 주문 `/orders`

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| POST | `/orders/validate` | 필요 | 결제 전 장바구니 검증 + `idempotencyKey` 발급 |
| POST | `/orders` | 필요 | 결제 완료 후 주문 생성 |
| GET | `/orders/me` | 필요 | 내 주문 목록 (최근 10건) |
| GET | `/orders/:id` | 필요 | 주문 상세 조회 |
| POST | `/orders/:id/cancel` | 필요 | 주문 취소 (결제 환불 포함) |

**주문 흐름:**
```
1. POST /orders/validate  → idempotencyKey 수령
2. POST /payments/confirm → Toss 결제 확인
3. POST /orders           → 주문 생성 (WebSocket으로 주방에 알림)
```

**주문 상태:**
```
PENDING → PAID → PARTIALLY_COMPLETED → COMPLETED
                                      ↘ CANCELLED
```

**주문 번호 형식:** `식당코드-순번` (예: `KOR-042`, 001~999 순환)

---

### 결제 `/payments`

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/payments/confirm` | Toss 결제 승인 요청 |
| POST | `/payments/webhook` | Toss 웹훅 수신 (서명 검증 포함) |

**결제 상태:** `PENDING → PAID → REFUNDED / FAILED`

---

### 주방 `/kitchen`

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| GET | `/kitchen/:restaurantId/orders` | 필요 | 대기·조리 중 주문 조회 |
| PATCH | `/kitchen/items/:id/complete` | 필요 | 아이템 완료 처리 (전체 완료 시 FCM 발송) |

**아이템 상태:** `PENDING → COOKING → COMPLETED`

---

### 관리자 `/admin`

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/admin/restaurants` | 식당 생성 |
| PATCH | `/admin/restaurants/:id` | 식당 정보 수정 |
| DELETE | `/admin/restaurants/:id` | 식당 삭제 |
| POST | `/admin/users` | 관리자 계정 생성 |

> 모든 `/admin` 엔드포인트는 `requireAdmin` 미들웨어로 보호됩니다.

---

## WebSocket 채널

서버 시작 시 `initWebSocket(server)`로 초기화됩니다.

| 채널 | 경로 | 용도 |
|------|------|------|
| 주방 디스플레이 | `ws://HOST/ws/kitchen/:restaurantId` | 새 주문 수신, 주문 상태 업데이트 |
| 주문 추적 | `ws://HOST/ws/orders/:orderId` | 사용자 앱 실시간 조리 현황 |

**이벤트 타입:**
```
NEW_ORDER          주방 → 새 주문 접수
ORDER_STATUS       사용자 → 주문 상태 변경
ITEM_COMPLETED     사용자 → 아이템 완료
```

---

## 데이터베이스 스키마

```
users               학생 계정 (UUID PK, student_id unique, email unique, google_sub unique, fcm_token)
restaurants         식당 (code unique, is_locked, locked_until, open/close_time)
menus               메뉴 (price, cook_time_sec, is_soldout, is_active)
orders              주문 (idempotency_key unique, status, paid_at)
order_items         주문 상세 항목 (order_number, status, completed_at)
payments            결제 (provider_tx_id unique, status, refunded_at)
```

### 관계도

```
users ──< orders ──< order_items >── menus >── restaurants
orders ──── payments
order_items >── restaurants
```

---

## 자동 메뉴 동기화

`src/utils/scraper.js` + `src/utils/cron.js`

- 단국대학교 공식 홈페이지(`DANKOOK_MENU_URL`)를 Puppeteer로 파싱
- `SCRAPE_CRON` 스케줄(기본: 평일 오전 7시)에 자동 실행
- 신규 메뉴 추가 / 기존 메뉴 비활성화 / 가격·품절 상태 업데이트

---

## 보안

- **Google OAuth**: Flutter `google_sign_in`이 발급한 ID 토큰을 서버에서 `google-auth-library`로 직접 검증
- **단국대 계정 제한**: Google `hd` 클레임을 서버에서 재확인 (`hd !== 'dankook.ac.kr'` 시 `403` 반환)
- **JWT**: 액세스 토큰 2시간, 리프레시 토큰 30일 만료
- **멱등성 키**: `idempotency_key` unique 제약으로 중복 주문 방지
- **Toss 웹훅**: 서명(HMAC) 검증으로 위조 요청 차단
- **관리자 미들웨어**: `requireAdmin`으로 `/admin` 엔드포인트 접근 제한
- **결제 후 품절 처리**: 결제 완료 후 품절 발생 시 자동 환불 트리거

---

## Google OAuth 설정 가이드

### 1. Google Cloud Console

1. [console.cloud.google.com](https://console.cloud.google.com) 접속
2. **API 및 서비스 → 사용자 인증 정보 → OAuth 2.0 클라이언트 ID 만들기**
3. 유형: **웹 애플리케이션** 선택 → 생성
4. 발급된 클라이언트 ID를 `.env`의 `GOOGLE_CLIENT_ID`에 입력

### 2. Android 설정

1. 동일 GCP 프로젝트에서 Android 클라이언트 ID도 생성
2. 앱의 SHA-1 지문 등록: `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey`
3. `google-services.json`을 `android/app/` 에 배치

### 3. Flutter 빌드

```bash
# --dart-define으로 웹 클라이언트 ID 전달 (Android에서 idToken 수신에 필수)
flutter run --dart-define=GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

---

## 초기 데이터 (seed)

`npm run db:seed` 실행 시 아래 식당과 메뉴가 생성됩니다:

| 식당 코드 | 식당명 |
|-----------|--------|
| KOR | 51장국밥 |
| JJI | 값찌개 |
| KAT | 경성카츠 |
| GWA | 광뚝 |
| BAR | 바비든든 |
| BIB | 비비고고 |
| PPO | 뽀까뽀까 |
| CHI | 중식대장 |
| POP | 포포420 |
| POK | 폭풍분식 |

각 식당당 4~8개 메뉴, 가격 및 조리 시간 포함.
