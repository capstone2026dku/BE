const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAdmin } = require('../middlewares/auth');
const { scrapeMenus, getScrapeStatus } = require('../utils/scraper');
const { getCookTimeByName } = require('../utils/portalAuth');

const router = express.Router();
const prisma = new PrismaClient();

// POST /admin/scrape — 수동 크롤링
router.post('/scrape', requireAdmin, async (req, res, next) => {
  try {
    const result = await scrapeMenus();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /admin/restaurants
router.get('/restaurants', requireAdmin, async (req, res, next) => {
  try {
    const restaurants = await prisma.restaurant.findMany({
      include: { _count: { select: { menus: true } } },
      orderBy: { name: 'asc' },
    });
    const status = getScrapeStatus();
    res.json({ restaurants, scrapeStatus: status });
  } catch (err) {
    next(err);
  }
});

// POST /admin/restaurants
router.post('/restaurants', requireAdmin, async (req, res, next) => {
  try {
    const { name, code, openTime, closeTime } = req.body;
    const restaurant = await prisma.restaurant.create({
      data: { name, code, openTime, closeTime },
    });
    res.status(201).json(restaurant);
  } catch (err) {
    next(err);
  }
});

// POST /admin/menus/bulk — 메뉴 일괄 입력
router.post('/menus/bulk', requireAdmin, async (req, res, next) => {
  try {
    const { restaurantId, menus } = req.body;
    // menus: [{ name, price, cookTimeSec? }]
    if (!restaurantId || !menus?.length) {
      return res.status(400).json({ code: 'MISSING_FIELDS', message: 'restaurantId, menus 필요' });
    }

    const created = [];
    for (const m of menus) {
      const menu = await prisma.menu.create({
        data: {
          restaurantId,
          name: m.name,
          price: m.price,
          cookTimeSec: m.cookTimeSec || getCookTimeByName(m.name),
        },
      });
      created.push(menu);
    }

    res.status(201).json({ count: created.length, menus: created });
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/menus/:id
router.patch('/menus/:id', requireAdmin, async (req, res, next) => {
  try {
    const { name, price, cookTimeSec, isSoldout, isActive } = req.body;
    const menu = await prisma.menu.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(price !== undefined && { price }),
        ...(cookTimeSec !== undefined && { cookTimeSec }),
        ...(isSoldout !== undefined && { isSoldout }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json(menu);
  } catch (err) {
    next(err);
  }
});

// GET /admin/orders/stats
router.get('/orders/stats', requireAdmin, async (req, res, next) => {
  try {
    const [totalOrders, todayOrders] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({
        where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
    ]);

    const revenueToday = await prisma.order.aggregate({
      _sum: { totalPrice: true },
      where: {
        status: { in: ['PAID', 'PARTIALLY_COMPLETED', 'COMPLETED'] },
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    });

    res.json({
      totalOrders,
      todayOrders,
      todayRevenue: revenueToday._sum.totalPrice || 0,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
