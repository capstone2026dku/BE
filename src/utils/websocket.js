const { WebSocketServer } = require('ws');
const url = require('url');

// 연결 레지스트리
// kitchenClients: { restaurantId: Set<WebSocket> }
// orderClients:   { orderId: Set<WebSocket> }
const kitchenClients = new Map();
const orderClients = new Map();

function initWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const { pathname } = url.parse(req.url);

    // /ws/kitchen/:restaurantId
    const kitchenMatch = pathname.match(/^\/ws\/kitchen\/([^/]+)$/);
    if (kitchenMatch) {
      const restaurantId = kitchenMatch[1];
      if (!kitchenClients.has(restaurantId)) kitchenClients.set(restaurantId, new Set());
      kitchenClients.get(restaurantId).add(ws);

      ws.on('close', () => kitchenClients.get(restaurantId)?.delete(ws));
      ws.send(JSON.stringify({ type: 'CONNECTED', channel: 'kitchen', restaurantId }));
      return;
    }

    // /ws/orders/:orderId
    const orderMatch = pathname.match(/^\/ws\/orders\/([^/]+)$/);
    if (orderMatch) {
      const orderId = orderMatch[1];
      if (!orderClients.has(orderId)) orderClients.set(orderId, new Set());
      orderClients.get(orderId).add(ws);

      ws.on('close', () => orderClients.get(orderId)?.delete(ws));
      ws.send(JSON.stringify({ type: 'CONNECTED', channel: 'order', orderId }));
      return;
    }

    ws.close(1008, 'Unknown channel');
  });

  console.log('🔌 WebSocket 서버 초기화 완료');
  return wss;
}

// 식당에 새 주문 전송
function broadcastToKitchen(restaurantId, data) {
  const clients = kitchenClients.get(restaurantId);
  if (!clients) return;
  const msg = JSON.stringify(data);
  clients.forEach((ws) => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

// 특정 주문에 상태 업데이트 전송
function broadcastToOrder(orderId, data) {
  const clients = orderClients.get(orderId);
  if (!clients) return;
  const msg = JSON.stringify(data);
  clients.forEach((ws) => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

module.exports = { initWebSocket, broadcastToKitchen, broadcastToOrder };
