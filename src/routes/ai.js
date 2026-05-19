const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middlewares/auth');
const { getWaitTime, checkLoad } = require('../ai/loadEngine');

const router = express.Router();
const prisma = new PrismaClient();

// GET /ai/wait-time/:restaurantId
router.get('/wait-time/:restaurantId', authenticate, async (req, res, next) => {
  try {
    const result = await getWaitTime(req.params.restaurantId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /ai/load-check — 장바구니 기반 부하 점수
router.post('/load-check', authenticate, async (req, res, next) => {
  try {
    const { items } = req.body;
    // items: [{ menuId, quantity }]
    if (!items || items.length === 0) {
      return res.status(400).json({ code: 'EMPTY_ITEMS', message: 'items 필요' });
    }

    // 메뉴 조회
    const menuIds = items.map((i) => i.menuId);
    const menus = await prisma.menu.findMany({ where: { id: { in: menuIds } } });
    const menuMap = new Map(menus.map((m) => [m.id, m]));

    // 식당별 그룹화
    const restaurantGroups = new Map();
    for (const item of items) {
      const menu = menuMap.get(item.menuId);
      if (!menu) continue;
      if (!restaurantGroups.has(menu.restaurantId)) restaurantGroups.set(menu.restaurantId, []);
      restaurantGroups.get(menu.restaurantId).push({ cookTimeSec: menu.cookTimeSec, quantity: item.quantity });
    }

    const results = [];
    for (const [restaurantId, newItems] of restaurantGroups) {
      const load = await checkLoad(restaurantId, newItems);
      results.push(load);
    }

    res.json(results);
  } catch (err) {
    next(err);
  }
});

// POST /ai/load-log — 실제 조리시간 기록
router.post('/load-log', async (req, res, next) => {
  try {
    const { restaurantId, loadScore, estimatedWaitSec, actualWaitSec } = req.body;
    const log = await prisma.loadLog.create({
      data: { restaurantId, loadScore, estimatedWaitSec, actualWaitSec },
    });
    res.json(log);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
