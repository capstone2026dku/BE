const express = require('express');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { PrismaClient } = require('@prisma/client');
const { authenticate: authMiddleware } = require('../middlewares/auth');

const router = express.Router();
const prisma = new PrismaClient();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function signTokens(payload) {
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',
  });
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  });
  return { accessToken, refreshToken };
}

// POST /auth/google
// Flutter google_sign_in이 넘겨준 idToken을 검증하고 JWT를 발급한다.
// hd 검증은 Google이 힌트로만 사용하므로 서버에서 반드시 재확인한다.
router.post('/google', async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ code: 'MISSING_TOKEN', message: 'idToken이 필요합니다.' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (payload.hd !== 'dankook.ac.kr') {
      return res.status(403).json({
        code: 'NOT_DANKOOK_ACCOUNT',
        message: '단국대학교(@dankook.ac.kr) 계정으로만 로그인할 수 있습니다.',
      });
    }

    const googleSub = payload.sub;
    const email = payload.email;
    const name = payload.name;
    const studentId = email.split('@')[0];

    const user = await prisma.user.upsert({
      where: { googleSub },
      update: { name },
      create: { studentId, name, email, googleSub },
    });

    const tokenPayload = { userId: user.id, studentId: user.studentId, name: user.name };
    const tokens = signTokens(tokenPayload);

    res.json({ ...tokens, user: { id: user.id, studentId: user.studentId, name: user.name } });
  } catch (err) {
    if (err.message?.includes('Token used too late') || err.message?.includes('Invalid token')) {
      return res.status(401).json({ code: 'INVALID_TOKEN', message: '유효하지 않은 Google 토큰입니다.' });
    }
    next(err);
  }
});

// POST /auth/refresh
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ code: 'MISSING_TOKEN', message: 'refreshToken 필요' });

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const { userId, studentId, name, isAdmin } = payload;
    const tokens = signTokens({ userId, studentId, name, isAdmin });
    res.json(tokens);
  } catch {
    res.status(401).json({ code: 'INVALID_TOKEN', message: '유효하지 않은 리프레시 토큰입니다.' });
  }
});

// POST /auth/logout
router.post('/logout', authMiddleware, async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { fcmToken: null },
    });
    res.json({ message: '로그아웃 완료' });
  } catch (err) {
    next(err);
  }
});

// PATCH /auth/fcm-token
router.patch('/fcm-token', authMiddleware, async (req, res, next) => {
  try {
    const { fcmToken } = req.body;
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { fcmToken },
    });
    res.json({ message: 'FCM 토큰 업데이트 완료' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
