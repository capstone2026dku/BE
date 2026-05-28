const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /restaurants
router.get('/', authenticate, async (req, res, next) => {
  try {
    const restaurants = await prisma.restaurant.findMany({
      orderBy: { name: 'asc' },
    });

    const now = new Date();
    const results = restaurants.map((r) => {
      const [openH, openM] = r.openTime.split(':').map(Number);
      const [closeH, closeM] = r.closeTime.split(':').map(Number);
      const totalMin = now.getHours() * 60 + now.getMinutes();
      const openMin = openH * 60 + openM;
      const closeMin = closeH * 60 + closeM;
      const isOpen = totalMin >= openMin && totalMin < closeMin;

      return {
        id: r.id,
        name: r.name,
        code: r.code,
        openTime: r.openTime,
        closeTime: r.closeTime,
        isOpen,
        isLocked: r.isLocked,
        lockedUntil: r.lockedUntil,
      };
    });

    res.json(results);
  } catch (err) {
    next(err);
  }
});

// GET /restaurants/:id/menus
router.get('/:id/menus', authenticate, async (req, res, next) => {
  try {
    const menus = await prisma.menu.findMany({
      where: { restaurantId: req.params.id, isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json(menus);
  } catch (err) {
    next(err);
  }
});

// PATCH /restaurants/:id/lock
router.patch('/:id/lock', requireAdmin, async (req, res, next) => {
  try {
    const { locked, durationMin } = req.body;
    const lockedUntil = locked
      ? new Date(Date.now() + (durationMin || 10) * 60 * 1000)
      : null;

    const restaurant = await prisma.restaurant.update({
      where: { id: req.params.id },
      data: { isLocked: !!locked, lockedUntil },
    });
    res.json({ id: restaurant.id, isLocked: restaurant.isLocked, lockedUntil: restaurant.lockedUntil });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
