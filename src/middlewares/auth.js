const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: '인증이 필요합니다.' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 'TOKEN_EXPIRED', message: '토큰이 만료되었습니다.' });
    }
    return res.status(401).json({ code: 'INVALID_TOKEN', message: '유효하지 않은 토큰입니다.' });
  }
}

function requireAdmin(req, res, next) {
  authenticate(req, res, () => {
    if (!req.user.isAdmin) {
      return res.status(403).json({ code: 'FORBIDDEN', message: '관리자 권한이 필요합니다.' });
    }
    next();
  });
}

module.exports = { authenticate, requireAdmin };
