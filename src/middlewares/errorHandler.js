function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message || err);

  // Prisma 에러
  if (err.code === 'P2002') {
    return res.status(409).json({ code: 'DUPLICATE', message: '이미 존재하는 데이터입니다.' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ code: 'NOT_FOUND', message: '데이터를 찾을 수 없습니다.' });
  }

  // 커스텀 에러
  if (err.statusCode) {
    return res.status(err.statusCode).json({ code: err.code || 'ERROR', message: err.message });
  }

  // 기본 500
  res.status(500).json({ code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' });
}

function createError(statusCode, code, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

module.exports = errorHandler;
module.exports.createError = createError;
