/**
 * 개발용 JWT access token 생성 스크립트
 * 사용법: node scripts/generate-dev-token.js
 * .env의 JWT_SECRET을 사용하며, 토큰은 Git에 커밋하지 마세요.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const jwt = require('jsonwebtoken');

const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('JWT_SECRET이 .env에 설정되어 있지 않습니다.');
  process.exit(1);
}

const payload = {
  userId: 'dev-user-id',
  studentId: '32200000',
  name: '개발테스트',
};

const token = jwt.sign(payload, secret, { expiresIn: '7d' });

console.log('\n개발용 access token (7일 유효):\n');
console.log(token);
console.log('\nFlutter 실행 예시:\n');
console.log(`flutter run -d chrome --dart-define=DEV_ACCESS_TOKEN=${token}\n`);
