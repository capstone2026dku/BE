const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function initCron() {
  // 1분마다: 만료된 식당 잠금 자동 해제
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const result = await prisma.restaurant.updateMany({
        where: { isLocked: true, lockedUntil: { lte: now } },
        data: { isLocked: false, lockedUntil: null },
      });
      if (result.count > 0) {
        console.log(`🔓 잠금 해제: ${result.count}개 식당`);
      }
    } catch (err) {
      console.error('잠금 해제 크론 오류:', err.message);
    }
  });

  // 평일 운영시간(10:00~19:30) 중 5분마다 품절 상태 동기화
  const scrapeCron = process.env.SCRAPE_CRON || '*/5 10-19 * * 1-5';
  cron.schedule(scrapeCron, async () => {
    try {
      const { scrapeMenus } = require('./scraper');
      await scrapeMenus();
    } catch (err) {
      console.error('품절 동기화 크론 오류:', err.message);
    }
  });

  console.log('⏰ 크론 스케줄러 초기화 완료');
}

module.exports = { initCron };
