const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const WARN_THRESHOLD = parseInt(process.env.LOAD_WARN_THRESHOLD) || 400;
const LOCK_THRESHOLD = parseInt(process.env.LOAD_LOCK_THRESHOLD) || 600;
const LOCK_DURATION_MIN = parseInt(process.env.LOCK_DURATION_MIN) || 10;
const PEAK_WEIGHT = parseFloat(process.env.PEAK_HOUR_WEIGHT) || 1.3;

function getPeakWeight() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const totalMin = hours * 60 + minutes;
  // 11:30 ~ 13:30
  if (totalMin >= 690 && totalMin <= 810) return PEAK_WEIGHT;
  return 1.0;
}

// 현재 처리 중인 주문들의 잔여 조리시간 합산
async function getActiveLoadScore(restaurantId) {
  const now = new Date();
  const cookingItems = await prisma.orderItem.findMany({
    where: {
      restaurantId,
      status: { in: ['PENDING', 'COOKING'] },
      order: { status: { in: ['PAID', 'PARTIALLY_COMPLETED'] } },
    },
    include: { menu: true, order: true },
  });

  let totalRemainingScore = 0;
  for (const item of cookingItems) {
    const elapsedSec = (now - new Date(item.order.paidAt || item.order.createdAt)) / 1000;
    const remaining = Math.max(0, item.menu.cookTimeSec - elapsedSec);
    totalRemainingScore += remaining * item.quantity;
  }

  return totalRemainingScore;
}

// 장바구니 아이템 기반 추가 부하 점수
function getNewOrderScore(items) {
  return items.reduce((sum, item) => sum + item.cookTimeSec * item.quantity, 0);
}

// 식당별 부하 점수 계산 + 잠금 여부 판단
async function checkLoad(restaurantId, newItems = []) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant) throw new Error(`Restaurant not found: ${restaurantId}`);

  // 이미 잠금 상태이면 즉시 반환
  if (restaurant.isLocked) {
    const lockedUntil = restaurant.lockedUntil;
    const remainMin = lockedUntil
      ? Math.ceil((new Date(lockedUntil) - new Date()) / 60000)
      : LOCK_DURATION_MIN;
    return {
      restaurantId,
      loadScore: LOCK_THRESHOLD,
      estimatedWaitSec: remainMin * 60,
      isLocked: true,
      isWarning: true,
      lockedUntil,
    };
  }

  const activeScore = await getActiveLoadScore(restaurantId);
  const newScore = getNewOrderScore(newItems);
  const rawScore = activeScore + newScore;
  const weight = getPeakWeight();
  const loadScore = Math.round(rawScore * weight);
  const estimatedWaitSec = Math.round(rawScore / Math.max(1, /* 병렬도 */ 2));

  const isWarning = loadScore >= WARN_THRESHOLD;
  const shouldLock = loadScore >= LOCK_THRESHOLD;

  if (shouldLock) {
    const lockedUntil = new Date(Date.now() + LOCK_DURATION_MIN * 60 * 1000);
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { isLocked: true, lockedUntil },
    });

    // 부하 로그 기록
    await prisma.loadLog.create({
      data: { restaurantId, loadScore, estimatedWaitSec },
    });

    return { restaurantId, loadScore, estimatedWaitSec, isLocked: true, isWarning: true, lockedUntil };
  }

  return { restaurantId, loadScore, estimatedWaitSec, isLocked: false, isWarning, lockedUntil: null };
}

// 주문 취소 시 즉시 부하 재계산 + 잠금 해제 검토
async function recalculateAfterCancel(restaurantId) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant || !restaurant.isLocked) return;

  const activeScore = await getActiveLoadScore(restaurantId);
  const weight = getPeakWeight();
  const loadScore = Math.round(activeScore * weight);

  if (loadScore < LOCK_THRESHOLD) {
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { isLocked: false, lockedUntil: null },
    });
    console.log(`🔓 취소로 인한 잠금 해제: ${restaurantId} (점수: ${loadScore})`);
  }
}

// 예상 대기시간 계산 (사용자 노출용)
async function getWaitTime(restaurantId) {
  const result = await checkLoad(restaurantId);
  const waitMin = Math.ceil(result.estimatedWaitSec / 60);
  return {
    restaurantId,
    estimatedWaitSec: result.estimatedWaitSec,
    estimatedWaitMin: waitMin,
    loadScore: result.loadScore,
    isWarning: result.isWarning,
    isLocked: result.isLocked,
  };
}

module.exports = { checkLoad, getWaitTime, recalculateAfterCancel, WARN_THRESHOLD, LOCK_THRESHOLD };
