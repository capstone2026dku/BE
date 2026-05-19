let messaging = null;

function getMessaging() {
  if (messaging) return messaging;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (!projectId || !privateKey || !clientEmail) {
    console.warn('⚠️  Firebase 환경변수 미설정 — FCM 푸시 비활성화');
    return null;
  }

  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          privateKey: privateKey.replace(/\\n/g, '\n'),
          clientEmail,
        }),
      });
    }
    messaging = admin.messaging();
    console.log('🔥 Firebase 초기화 완료');
    return messaging;
  } catch (err) {
    console.error('Firebase 초기화 실패:', err.message);
    return null;
  }
}

async function sendPush(fcmToken, title, body, data = {}) {
  if (!fcmToken) return;
  const msg = getMessaging();
  if (!msg) return;

  try {
    await msg.send({
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });
  } catch (err) {
    console.warn('FCM 전송 실패:', err.message);
  }
}

async function sendOrderReady(fcmToken, orderNumber, restaurantName) {
  await sendPush(
    fcmToken,
    '주문 완료!',
    `${restaurantName} - 번호 ${orderNumber} 수령 가능합니다.`,
    { type: 'ORDER_READY', orderNumber }
  );
}

module.exports = { sendPush, sendOrderReady };
