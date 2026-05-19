const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAdmin } = require('../middlewares/auth');
const { broadcastToOrder } = require('../utils/websocket');
const { sendOrderReady } = require('../utils/fcm');

const router = express.Router();
const prisma = new PrismaClient();

// GET /kitchen/:restaurantId/orders
router.get('/:restaurantId/orders', requireAdmin, async (req, res, next) => {
  try {
    const orderItems = await prisma.orderItem.findMany({
      where: {
        restaurantId: req.params.restaurantId,
        status: { in: ['PENDING', 'COOKING'] },
      },
      include: {
        menu: true,
        order: { include: { user: true } },
      },
      orderBy: { order: { createdAt: 'asc' } },
    });
    res.json(orderItems);
  } catch (err) {
    next(err);
  }
});

// PATCH /kitchen/items/:id/complete — 조리 완료
router.patch('/items/:id/complete', requireAdmin, async (req, res, next) => {
  try {
    const item = await prisma.orderItem.update({
      where: { id: req.params.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
      include: { order: { include: { user: true, orderItems: true } }, menu: true, restaurant: true },
    });

    // 실제 조리시간 기록
    if (item.order.paidAt) {
      const actualSec = Math.round((new Date() - new Date(item.order.paidAt)) / 1000);
      await prisma.loadLog.create({
        data: {
          restaurantId: item.restaurantId,
          loadScore: 0,
          estimatedWaitSec: item.menu.cookTimeSec,
          actualWaitSec: actualSec,
        },
      });
    }

    // 주문의 모든 아이템 완료 여부 확인
    const allItems = await prisma.orderItem.findMany({ where: { orderId: item.orderId } });
    const allDone = allItems.every((i) => i.status === 'COMPLETED' || i.status === 'CANCELLED');
    const someDone = allItems.some((i) => i.status === 'COMPLETED');

    if (allDone) {
      await prisma.order.update({ where: { id: item.orderId }, data: { status: 'COMPLETED' } });
    } else if (someDone) {
      await prisma.order.update({ where: { id: item.orderId }, data: { status: 'PARTIALLY_COMPLETED' } });
    }

    // WebSocket으로 사용자에게 상태 업데이트
    broadcastToOrder(item.orderId, {
      type: 'ITEM_COMPLETED',
      orderItemId: item.id,
      orderNumber: item.orderNumber,
      restaurantName: item.restaurant.name,
      menuName: item.menu.name,
      status: 'COMPLETED',
      allCompleted: allDone,
    });

    // FCM 푸시 발송
    const fcmToken = item.order.user?.fcmToken;
    if (fcmToken) {
      await sendOrderReady(fcmToken, item.orderNumber, item.restaurant.name);
    }

    res.json({ id: item.id, status: item.status, allCompleted: allDone });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
