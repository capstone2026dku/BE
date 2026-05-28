const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middlewares/auth');
const { broadcastToKitchen, broadcastToOrder } = require('../utils/websocket');

const router = express.Router();
const prisma = new PrismaClient();

// 식당별 주문번호 채번 (KOR-042 형식)
async function issueOrderNumber(restaurantCode) {
  const prefix = `${restaurantCode}-`;
  const last = await prisma.orderItem.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: 'desc' },
  });
  let seq = 1;
  if (last) {
    const num = parseInt(last.orderNumber.split('-')[1]);
    seq = (isNaN(num) ? 0 : num) + 1;
    if (seq > 999) seq = 1; // 순환
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

// POST /orders/validate — 결제 전 검증 + idempotencyKey 발급
router.post('/validate', authenticate, async (req, res, next) => {
  try {
    const { items } = req.body;
    // items: [{ menuId, quantity }]
    if (!items || items.length === 0) {
      return res.status(400).json({ code: 'EMPTY_CART', message: '장바구니가 비어있습니다.' });
    }

    const errors = [];
    let totalPrice = 0;

    // 메뉴/식당 정보 조회
    const menuIds = items.map((i) => i.menuId);
    const menus = await prisma.menu.findMany({
      where: { id: { in: menuIds } },
      include: { restaurant: true },
    });

    const menuMap = new Map(menus.map((m) => [m.id, m]));

    for (const item of items) {
      const menu = menuMap.get(item.menuId);
      if (!menu) { errors.push({ menuId: item.menuId, reason: 'MENU_NOT_FOUND' }); continue; }
      if (!menu.isActive) { errors.push({ menuId: item.menuId, name: menu.name, reason: 'MENU_INACTIVE' }); continue; }
      if (menu.isSoldout) { errors.push({ menuId: item.menuId, name: menu.name, reason: 'SOLDOUT' }); continue; }
      if (menu.restaurant.isLocked) { errors.push({ menuId: item.menuId, name: menu.name, restaurantName: menu.restaurant.name, reason: 'RESTAURANT_LOCKED' }); continue; }

      totalPrice += menu.price * item.quantity;
    }

    if (errors.length > 0) {
      return res.status(422).json({ code: 'VALIDATION_FAILED', errors });
    }

    const idempotencyKey = uuidv4();
    res.json({ idempotencyKey, totalPrice });
  } catch (err) {
    next(err);
  }
});

// POST /orders — 결제 완료 후 주문 생성
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { idempotencyKey, items, totalPrice } = req.body;
    if (!idempotencyKey) return res.status(400).json({ code: 'MISSING_KEY', message: 'idempotencyKey 필요' });

    // 중복 주문 방지
    const existing = await prisma.order.findUnique({ where: { idempotencyKey } });
    if (existing) return res.json(existing);

    // 결제 확인 (payment가 PAID 상태인지)
    const payment = await prisma.payment.findFirst({
      where: { order: { idempotencyKey }, status: 'PAID' },
    });
    if (!payment) {
      return res.status(402).json({ code: 'PAYMENT_REQUIRED', message: '결제가 완료되지 않았습니다.' });
    }

    // 메뉴 정보 재조회 (품절 재확인)
    const menuIds = items.map((i) => i.menuId);
    const menus = await prisma.menu.findMany({
      where: { id: { in: menuIds } },
      include: { restaurant: true },
    });
    const menuMap = new Map(menus.map((m) => [m.id, m]));

    for (const item of items) {
      const menu = menuMap.get(item.menuId);
      if (menu?.isSoldout) {
        // 결제 완료 후 품절 발생 → 환불 트리거
        await triggerRefund(payment.id);
        return res.status(422).json({ code: 'SOLDOUT_AFTER_PAYMENT', message: '결제 후 품절된 메뉴가 있습니다. 자동 환불 처리됩니다.' });
      }
    }

    // 트랜잭션으로 Order + OrderItems 생성
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          userId: req.user.userId,
          totalPrice,
          idempotencyKey,
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      // Payment 연결
      await tx.payment.update({
        where: { id: payment.id },
        data: { orderId: newOrder.id },
      });

      // OrderItems 생성 (식당별 주문번호 채번)
      const orderNumberCache = new Map();
      for (const item of items) {
        const menu = menuMap.get(item.menuId);
        if (!menu) continue;

        let orderNumber = orderNumberCache.get(menu.restaurantId);
        if (!orderNumber) {
          orderNumber = await issueOrderNumber(menu.restaurant.code);
          orderNumberCache.set(menu.restaurantId, orderNumber);
        }

        await tx.orderItem.create({
          data: {
            orderId: newOrder.id,
            menuId: menu.id,
            restaurantId: menu.restaurantId,
            orderNumber,
            quantity: item.quantity,
            unitPrice: menu.price,
          },
        });
      }

      return newOrder;
    });

    // 주문 상세 조회 (WebSocket 전송용)
    const fullOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: { orderItems: { include: { menu: true, restaurant: true } }, user: true },
    });

    // 식당별 WebSocket 전송
    const restaurantItems = new Map();
    for (const item of fullOrder.orderItems) {
      if (!restaurantItems.has(item.restaurantId)) restaurantItems.set(item.restaurantId, []);
      restaurantItems.get(item.restaurantId).push(item);
    }
    for (const [restaurantId, items] of restaurantItems) {
      broadcastToKitchen(restaurantId, { type: 'NEW_ORDER', order: { ...fullOrder, orderItems: items } });
    }

    res.status(201).json(fullOrder);
  } catch (err) {
    next(err);
  }
});

// GET /orders/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.userId },
      include: { orderItems: { include: { menu: true, restaurant: true } }, payment: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

// GET /orders/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.userId },
      include: { orderItems: { include: { menu: true, restaurant: true } }, payment: true },
    });
    if (!order) return res.status(404).json({ code: 'NOT_FOUND', message: '주문을 찾을 수 없습니다.' });
    res.json(order);
  } catch (err) {
    next(err);
  }
});

// POST /orders/:id/cancel
router.post('/:id/cancel', authenticate, async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.userId },
      include: { payment: true, orderItems: true },
    });
    if (!order) return res.status(404).json({ code: 'NOT_FOUND', message: '주문을 찾을 수 없습니다.' });
    if (!['PENDING', 'PAID'].includes(order.status)) {
      return res.status(400).json({ code: 'CANNOT_CANCEL', message: '취소할 수 없는 주문 상태입니다.' });
    }

    // 취소 처리
    await prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });

    // 환불 트리거
    if (order.payment?.status === 'PAID') {
      await triggerRefund(order.payment.id);
    }

    res.json({ message: '주문이 취소되었습니다.' });
  } catch (err) {
    next(err);
  }
});

async function triggerRefund(paymentId) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status !== 'PAID' || !payment.providerTxId) return;

  const axios = require('axios');
  try {
    await axios.post(
      `https://api.tosspayments.com/v1/payments/${payment.providerTxId}/cancel`,
      { cancelReason: '주문 취소' },
      {
        auth: { username: process.env.TOSS_SECRET_KEY, password: '' },
        timeout: 10000,
      }
    );
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'REFUNDED', refundedAt: new Date() },
    });
  } catch (err) {
    console.error('환불 실패:', err.message);
  }
}

module.exports = router;
