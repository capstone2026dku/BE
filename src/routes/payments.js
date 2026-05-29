const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middlewares/auth');

const router = express.Router();
const prisma = new PrismaClient();

// POST /payments/confirm — 토스페이먼츠 결제 승인
router.post('/confirm', authenticate, async (req, res, next) => {
  try {
    const { paymentKey, orderId, amount, idempotencyKey } = req.body;

    // 개발 환경 Mock 결제
    if (process.env.NODE_ENV === 'development' && req.body.mock) {
      const { randomUUID } = require('crypto');

      const user = await prisma.user.upsert({
        where: { id: req.user.userId },
        update: {},
        create: {
          id: req.user.userId,
          studentId: req.user.studentId || '32200000',
          name: req.user.name || '테스트유저',
          email: `${req.user.studentId || '32200000'}@dankook.ac.kr`,
          googleSub: `mock-${req.user.userId}`,
        },
      });

      const order = await prisma.order.create({
        data: {
          userId: user.id,
          totalPrice: amount,
          idempotencyKey: idempotencyKey || `mock-${randomUUID()}`,
          status: 'PAID',
          paidAt: new Date(),
          payment: {
            create: {
              provider: 'mock',
              providerTxId: `mock-${Date.now()}`,
              status: 'PAID',
              amount,
              paidAt: new Date(),
            },
          },
        },
        include: { payment: true },
      });

      return res.json({ paymentId: order.payment.id, status: 'PAID' });
    }

    // 실제 토스 결제 승인
    const tossRes = await axios.post(
      'https://api.tosspayments.com/v1/payments/confirm',
      { paymentKey, orderId, amount },
      {
        auth: { username: process.env.TOSS_SECRET_KEY, password: '' },
        timeout: 15000,
      }
    );

    const tossData = tossRes.data;
    const payment = await prisma.payment.create({
      data: {
        provider: 'toss',
        providerTxId: tossData.paymentKey,
        status: 'PAID',
        amount: tossData.totalAmount,
        paidAt: new Date(tossData.approvedAt),
      },
    });

    res.json({ paymentId: payment.id, status: 'PAID', tossData });
  } catch (err) {
    if (err.response?.data) {
      return res.status(400).json({ code: err.response.data.code, message: err.response.data.message });
    }
    next(err);
  }
});

// POST /payments/webhook — 토스 webhook 수신
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
  try {
    // webhook 서명 검증
    const signature = req.headers['toss-signature'];
    const secret = process.env.TOSS_WEBHOOK_SECRET;
    if (secret && signature) {
      const hmac = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
      if (hmac !== signature) {
        return res.status(401).json({ message: '서명 불일치' });
      }
    }

    const event = JSON.parse(req.body.toString());
    const { eventType, data } = event;

    if (eventType === 'PAYMENT_STATUS_CHANGED') {
      const { paymentKey, status } = data;
      const statusMap = { DONE: 'PAID', CANCELED: 'REFUNDED', ABORTED: 'FAILED' };
      const mapped = statusMap[status];
      if (mapped) {
        await prisma.payment.updateMany({
          where: { providerTxId: paymentKey },
          data: { status: mapped, ...(mapped === 'PAID' ? { paidAt: new Date() } : {}) },
        });
      }
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
});

// POST /payments/:id/refund
router.post('/:id/refund', async (req, res, next) => {
  try {
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!payment) return res.status(404).json({ code: 'NOT_FOUND', message: '결제를 찾을 수 없습니다.' });
    if (payment.status !== 'PAID') return res.status(400).json({ code: 'NOT_PAID', message: '환불할 수 없는 상태입니다.' });
    if (!payment.providerTxId || payment.provider === 'mock') {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED', refundedAt: new Date() } });
      return res.json({ message: 'Mock 환불 완료' });
    }

    await axios.post(
      `https://api.tosspayments.com/v1/payments/${payment.providerTxId}/cancel`,
      { cancelReason: req.body.reason || '환불 요청' },
      { auth: { username: process.env.TOSS_SECRET_KEY, password: '' }, timeout: 10000 }
    );

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'REFUNDED', refundedAt: new Date() },
    });

    res.json({ message: '환불 완료' });
  } catch (err) {
    if (err.response?.data) {
      return res.status(400).json({ code: err.response.data.code, message: err.response.data.message });
    }
    next(err);
  }
});

module.exports = router;
