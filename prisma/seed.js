const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 단국대학교 죽전캠퍼스 푸드코트 실제 데이터
// 출처: https://www.dankook.ac.kr/web/kor/1947_commons
const RESTAURANTS = [
  { name: '51장국밥',  code: 'JGB', openTime: '10:30', closeTime: '19:00' },
  { name: '값찌개',   code: 'GJG', openTime: '10:30', closeTime: '19:00' },
  { name: '경성카츠', code: 'GKC', openTime: '10:30', closeTime: '19:00' },
  { name: '광뚝',    code: 'GDK', openTime: '10:30', closeTime: '19:00' },
  { name: '바비든든', code: 'BBD', openTime: '10:30', closeTime: '19:00' },
  { name: '비비고고', code: 'BBG', openTime: '10:30', closeTime: '19:00' },
  { name: '뽀까뽀까', code: 'BKB', openTime: '10:30', closeTime: '19:00' },
  { name: '중식대장', code: 'JSD', openTime: '10:30', closeTime: '19:00' },
  { name: '포포420',  code: 'PP4', openTime: '10:30', closeTime: '19:00' },
  { name: '폭풍분식', code: 'PBN', openTime: '10:00', closeTime: '19:00' },
];

const MENUS = {
  JGB: [
    { name: '고기만국밥',     price: 7500, cookTimeSec: 420 },
    { name: '공기밥',         price: 1000, cookTimeSec: 60  },
    { name: '닭곰탕',         price: 5900, cookTimeSec: 420 },
    { name: '닭칼국수',       price: 5900, cookTimeSec: 360 },
    { name: '떡갈비',         price: 2300, cookTimeSec: 240 },
    { name: '순대국',         price: 7500, cookTimeSec: 420 },
    { name: '얼큰고기만국밥', price: 8500, cookTimeSec: 420 },
    { name: '얼큰순대국',     price: 8500, cookTimeSec: 420 },
    { name: '육개장',         price: 8500, cookTimeSec: 420 },
    { name: '육칼국수',       price: 8500, cookTimeSec: 360 },
    { name: '편육',           price: 2500, cookTimeSec: 180 },
    { name: '함흥물냉면',     price: 6900, cookTimeSec: 300 },
    { name: '함흥비빔냉면',   price: 6900, cookTimeSec: 300 },
  ],
  GJG: [
    { name: '공기밥',                   price: 1000, cookTimeSec: 60  },
    { name: '김치찌개(공기밥포함)',     price: 6000, cookTimeSec: 480 },
    { name: '돼지김치찌개(공기밥포함)', price: 6500, cookTimeSec: 480 },
    { name: '된장찌개(공기밥포함)',     price: 6000, cookTimeSec: 480 },
    { name: '바지락된장찌개(공기밥포함)', price: 6200, cookTimeSec: 480 },
    { name: '바지락순두부(공기밥포함)', price: 6200, cookTimeSec: 480 },
    { name: '순두부찌개(공기밥포함)',   price: 6000, cookTimeSec: 480 },
    { name: '스팸김치찌개(공기밥포함)', price: 6500, cookTimeSec: 480 },
    { name: '스팸순두부(공기밥포함)',   price: 6900, cookTimeSec: 480 },
    { name: '우삼겹된장찌개(공기밥포함)', price: 6500, cookTimeSec: 480 },
    { name: '우삼겹순두부(공기밥포함)', price: 6900, cookTimeSec: 480 },
    { name: '참치김치찌개(공기밥포함)', price: 6500, cookTimeSec: 480 },
  ],
  GKC: [
    { name: '고구마치즈돈카츠', price: 8300, cookTimeSec: 480 },
    { name: '김치냄비우동',     price: 5900, cookTimeSec: 360 },
    { name: '등심돈카츠',       price: 7500, cookTimeSec: 480 },
    { name: '새우튀김 우동',    price: 6900, cookTimeSec: 360 },
    { name: '우동',             price: 4900, cookTimeSec: 300 },
    { name: '특 등심왕돈카츠',  price: 8900, cookTimeSec: 540 },
  ],
  GDK: [
    { name: '간장 불고기',     price: 7900, cookTimeSec: 420 },
    { name: '고추장 불고기',   price: 7900, cookTimeSec: 420 },
    { name: '공기밥',          price: 1000, cookTimeSec: 60  },
    { name: '광뚝사골칼국수',  price: 5900, cookTimeSec: 360 },
    { name: '뚝배기알밥',      price: 5900, cookTimeSec: 360 },
    { name: '물만두',          price: 1900, cookTimeSec: 180 },
    { name: '부산물밀면',      price: 6900, cookTimeSec: 300 },
    { name: '부산비빔밀면',    price: 6900, cookTimeSec: 300 },
    { name: '전주식콩나물해장국', price: 5900, cookTimeSec: 360 },
    { name: '콩나물불백',      price: 6500, cookTimeSec: 360 },
  ],
  BBD: [
    { name: '고기든든',           price: 3900, cookTimeSec: 300 },
    { name: '고기든든(킹)',       price: 5900, cookTimeSec: 360 },
    { name: '스팸마요덮밥(라지)', price: 4900, cookTimeSec: 300 },
    { name: '제육덮밥',           price: 3900, cookTimeSec: 300 },
    { name: '제육덮밥(킹)',       price: 5900, cookTimeSec: 360 },
    { name: '참치마요덮밥(라지)', price: 4900, cookTimeSec: 300 },
    { name: '춘천닭갈비덮밥(킹)', price: 5900, cookTimeSec: 420 },
    { name: '치킨마요덮밥(라지)', price: 4900, cookTimeSec: 300 },
  ],
  BBG: [
    { name: '기본카레',   price: 4900, cookTimeSec: 300 },
    { name: '불고기비빔밥', price: 7500, cookTimeSec: 360 },
    { name: '불고기카레', price: 6900, cookTimeSec: 360 },
    { name: '새우카레',   price: 6900, cookTimeSec: 360 },
    { name: '오색비빔밥', price: 6500, cookTimeSec: 300 },
    { name: '육회비빔밥', price: 7900, cookTimeSec: 300 },
    { name: '치킨카레',   price: 6900, cookTimeSec: 360 },
  ],
  BKB: [
    { name: '계란쫑볶음밥',     price: 3900, cookTimeSec: 300 },
    { name: '김치볶음밥',       price: 3900, cookTimeSec: 300 },
    { name: '달콤치즈감자튀김', price: 1500, cookTimeSec: 180 },
    { name: '오므라이스',       price: 4900, cookTimeSec: 360 },
    { name: '음료',             price: 0,    cookTimeSec: 30  },
    { name: '제육볶음밥',       price: 4900, cookTimeSec: 360 },
    { name: '참치김치볶음밥',   price: 4900, cookTimeSec: 300 },
    { name: '카오팟무',         price: 6500, cookTimeSec: 420 },
    { name: '콘치즈',           price: 2000, cookTimeSec: 120 },
  ],
  JSD: [
    { name: '계란볶음밥',      price: 6500, cookTimeSec: 360 },
    { name: '공기밥',          price: 1000, cookTimeSec: 60  },
    { name: '마파덮밥',        price: 6500, cookTimeSec: 360 },
    { name: '미니탕수육',      price: 5900, cookTimeSec: 420 },
    { name: '소고기 해물 짬뽕', price: 7900, cookTimeSec: 420 },
    { name: '짜장면',          price: 5900, cookTimeSec: 300 },
    { name: '짬뽕밥',          price: 8500, cookTimeSec: 420 },
    { name: '크림짬뽕',        price: 7900, cookTimeSec: 420 },
  ],
  PP4: [
    { name: '마라쌀국수(고기없음)', price: 6300, cookTimeSec: 300 },
    { name: '마라우삼겹쌀국수',     price: 6500, cookTimeSec: 360 },
    { name: '반꿔이',              price: 1800, cookTimeSec: 180 },
    { name: '분짜',                price: 6900, cookTimeSec: 360 },
    { name: '비빔쌀국수',          price: 5500, cookTimeSec: 300 },
    { name: '새우빠스(2p)',        price: 2500, cookTimeSec: 180 },
    { name: '야채춘권(3p)',        price: 1000, cookTimeSec: 180 },
    { name: '얼큰해산물쌀국수',    price: 7500, cookTimeSec: 360 },
    { name: '오징어링튀김',        price: 1900, cookTimeSec: 180 },
    { name: '우삼겹쌀국수',        price: 5900, cookTimeSec: 360 },
    { name: '포포쌀국수(고기없음)', price: 4900, cookTimeSec: 300 },
  ],
  PBN: [
    { name: '닭가슴살포케',    price: 5900, cookTimeSec: 180 },
    { name: '떡라면',          price: 4000, cookTimeSec: 360 },
    { name: '라죽',            price: 4000, cookTimeSec: 300 },
    { name: '만두라면',        price: 4500, cookTimeSec: 360 },
    { name: '매콤치즈돌돌김밥', price: 2800, cookTimeSec: 240 },
    { name: '치즈김밥',        price: 3800, cookTimeSec: 240 },
    { name: '치즈라면',        price: 4000, cookTimeSec: 360 },
    { name: '폭풍김밥',        price: 3500, cookTimeSec: 240 },
    { name: '폭풍라면',        price: 3500, cookTimeSec: 360 },
    { name: '훈제연어포케',    price: 5900, cookTimeSec: 180 },
    { name: '훈제오리포케',    price: 5900, cookTimeSec: 180 },
  ],
};

async function main() {
  console.log('🌱 시드 데이터 삽입 시작...');

  for (const r of RESTAURANTS) {
    const restaurant = await prisma.restaurant.upsert({
      where: { code: r.code },
      update: {},
      create: {
        name: r.name,
        code: r.code,
        openTime: r.openTime,
        closeTime: r.closeTime,
      },
    });

    const menus = MENUS[r.code] || [];
    for (const m of menus) {
      await prisma.menu.upsert({
        where: {
          id: `${r.code}-${m.name}`.toLowerCase().replace(/\s+/g, '-').slice(0, 36),
        },
        update: { price: m.price, cookTimeSec: m.cookTimeSec },
        create: {
          id: `${r.code}-${m.name}`.toLowerCase().replace(/\s+/g, '-').slice(0, 36),
          restaurantId: restaurant.id,
          name: m.name,
          price: m.price,
          cookTimeSec: m.cookTimeSec,
        },
      });
    }

    console.log(`  ✅ ${r.name} (${r.code}) + 메뉴 ${menus.length}개`);
  }

  console.log('✅ 시드 완료');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
