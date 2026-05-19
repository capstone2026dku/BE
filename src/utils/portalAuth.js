const axios = require('axios');

// 메뉴명 기반 조리시간 fallback 테이블
const COOK_TIME_TABLE = [
  { keywords: ['돈까스', '돈가스'], sec: 480 },
  { keywords: ['라면', '우동', '국수', '라멘'], sec: 360 },
  { keywords: ['볶음', '덮밥', '비빔'], sec: 420 },
  { keywords: ['찌개', '탕', '국'], sec: 480 },
  { keywords: ['김밥', '초밥'], sec: 240 },
  { keywords: ['피자', '파스타'], sec: 600 },
  { keywords: ['버거', '샌드위치'], sec: 300 },
  { keywords: ['음료', '커피', '아메리카노', '라떼', '에이드', '우유'], sec: 60 },
  { keywords: ['샐러드', '빵', '크로플', '요거트'], sec: 90 },
];

function getCookTimeByName(menuName) {
  for (const entry of COOK_TIME_TABLE) {
    for (const kw of entry.keywords) {
      if (menuName.includes(kw)) return entry.sec;
    }
  }
  return 300;
}

// 전략 3: 개발 Mock 인증
function parseMockAccounts() {
  const raw = process.env.TEST_ACCOUNTS || '';
  const accounts = {};
  raw.split(',').forEach((entry) => {
    const [studentId, password, name] = entry.trim().split(':');
    if (studentId) accounts[studentId] = { password, name };
  });
  return accounts;
}

async function mockAuth(studentId, password) {
  const accounts = parseMockAccounts();
  const account = accounts[studentId];
  if (!account) throw { code: 'INVALID_CREDENTIALS', message: '학번 또는 비밀번호가 올바르지 않습니다.' };
  if (account.password !== password) throw { code: 'INVALID_CREDENTIALS', message: '학번 또는 비밀번호가 올바르지 않습니다.' };
  return { studentId, name: account.name, isEnrolled: true };
}

// 전략 1: 학교 API
async function apiAuth(studentId, password) {
  const apiUrl = process.env.PORTAL_API_URL;
  const apiKey = process.env.PORTAL_API_KEY;
  const response = await axios.post(
    apiUrl,
    { studentId, password },
    { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 10000 }
  );
  const { data } = response;
  if (!data.isEnrolled) throw { code: 'NOT_ENROLLED', message: '재학생만 이용 가능합니다.' };
  return { studentId, name: data.name, isEnrolled: true };
}

// 전략 2: 세션 크롤링
async function crawlAuth(studentId, password) {
  const LOGIN_ERROR_PATTERNS = [
    '사용자 정보가 없습니다',
    '인증을 실패하였습니다',
    '오류가 발생하였습니다',
    '아이디를 입력해주세요',
    '비밀번호를 입력해주세요',
  ];

  try {
    const loginRes = await axios.post(
      'https://portal.dankook.ac.kr/proc/Login.eps',
      new URLSearchParams({ user_id: studentId, user_password: password, auto_login: 'N' }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        maxRedirects: 0,
        timeout: 15000,
        validateStatus: (s) => s < 500,
      }
    );

    const body = typeof loginRes.data === 'string' ? loginRes.data : '';
    if (LOGIN_ERROR_PATTERNS.some((p) => body.includes(p))) {
      throw { code: 'INVALID_CREDENTIALS', message: '학번 또는 비밀번호가 올바르지 않습니다.' };
    }

    const cookies = loginRes.headers['set-cookie'] || [];
    const sessionCookie = cookies.find((c) => c.includes('PTL_JSESSIONID'));
    if (!sessionCookie) throw { code: 'INVALID_CREDENTIALS', message: '학번 또는 비밀번호가 올바르지 않습니다.' };

    return { studentId, name: studentId, isEnrolled: true };
  } catch (err) {
    if (err.code) throw err;
    throw { code: 'PORTAL_UNAVAILABLE', message: '포털 서버에 연결할 수 없습니다.' };
  }
}

async function authenticate(studentId, password) {
  // 학번 형식 검증
  if (!/^\d{8}$/.test(studentId)) {
    throw { code: 'INVALID_FORMAT', message: '학번은 8자리 숫자여야 합니다.' };
  }

  // 전략 3: Mock (개발 환경)
  if (process.env.NODE_ENV === 'development' && process.env.PORTAL_MOCK === 'true') {
    return await mockAuth(studentId, password);
  }

  // 전략 1: 공식 API
  if (process.env.PORTAL_API_URL) {
    try {
      return await apiAuth(studentId, password);
    } catch (err) {
      if (err.code === 'NOT_ENROLLED' || err.code === 'INVALID_CREDENTIALS') throw err;
      // API 장애 시 크롤링으로 fallback
    }
  }

  // 전략 2: 세션 크롤링
  return await crawlAuth(studentId, password);
}

module.exports = { authenticate, getCookTimeByName };
