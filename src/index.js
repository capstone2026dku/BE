require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');

const { initWebSocket } = require('./utils/websocket');
const { initCron } = require('./utils/cron');
const errorHandler = require('./middlewares/errorHandler');

const authRouter = require('./routes/auth');
const restaurantsRouter = require('./routes/restaurants');
const menusRouter = require('./routes/menus');
const ordersRouter = require('./routes/orders');
const paymentsRouter = require('./routes/payments');
const kitchenRouter = require('./routes/kitchen');
const adminRouter = require('./routes/admin');

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(express.json());

// 헬스체크
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// 라우트
app.use('/auth', authRouter);
app.use('/restaurants', restaurantsRouter);
app.use('/menus', menusRouter);
app.use('/orders', ordersRouter);
app.use('/payments', paymentsRouter);
app.use('/kitchen', kitchenRouter);
app.use('/admin', adminRouter);

// 에러 핸들러 (마지막에 등록)
app.use(errorHandler);

// WebSocket 초기화
initWebSocket(server);

// 크론 초기화
initCron();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 서버 실행 중: http://localhost:${PORT}`);
  console.log(`🌿 환경: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, server };
