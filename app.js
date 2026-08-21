require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { redisClient, connectRedis } = require('./config/redis');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
const paymentsRoutes = require('./routes/paymentsRoutes');
const errorHandler = require('./utils/errorHandler');
const passport = require('./config/passport');
const cron = require('node-cron');
const promotionService = require('./services/promotionServices');
const orderNotificationService = require('./services/orderNotificationService');
const { cleanupExpiredRefreshTokens } = require('./cleanupRefreshTokens');
const rateLimit = require('express-rate-limit');
const aiChatRoutes = require('./routes/aiChatRoutes');
const { authMiddleware } = require('./middleware/authMiddleware');

const cookieParser = require('cookie-parser');

const app = express();

app.use(cookieParser());
// chỉ dùng express.json once, giới hạn body size
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

//connect redis
connectRedis().catch((err) => {
    console.error('[Redis] Failed to connect at startup:', err.message);
    console.warn('[Redis] App will continue without caching');
});

// CORS - Hỗ trợ cả localhost và DevTunnels
const allowedOrigins = [
  process.env.FE_URL,
  'http://localhost:5000',
  'http://localhost:3000',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:3000',
  'https://pkw69kmb-5000.asse.devtunnels.ms',
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.devtunnels.ms')) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
}));

app.use(passport.initialize());

// normalize client ip safely (handles ::ffff: and %zone)
function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf && typeof xf === 'string') {
    const first = xf.split(',')[0].trim();
    if (first) return first;
  }
  return req.ip || (req.connection && req.connection.remoteAddress) || '';
}

function normalizeIp(ip) {
  if (!ip) return '';
  const pct = ip.indexOf('%');
  if (pct !== -1) ip = ip.substring(0, pct);
  if (ip.startsWith('::ffff:')) ip = ip.substring(7);
  return ip;
}

// set trust proxy based on env (safe default: false)
// If you are behind a trusted reverse proxy (nginx, LB), set TRUST_PROXY='true' or a specific value in .env
const trustProxyEnabled = process.env.TRUST_PROXY === 'true' || false;
app.set('trust proxy', trustProxyEnabled);

// single /user limiter (uses user id when available, else normalize ip safely)
const userLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => {
    if (req.user && req.user.id) return `user:${req.user.id}`;
    // use existing helpers to get and normalize client IP (handles ::ffff: and %zone)
    return normalizeIp(getClientIp(req));
  },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/user', userLimiter);

// mount permissive auth middleware so req.user is set when token present
app.use(authMiddleware());

// Routes
app.use('/api', authRoutes);
app.use('/admin', adminRoutes);
app.use('/user', userRoutes);
app.use('/public', require('./routes/publicRoutes'));
app.use('/api', aiChatRoutes);
app.use('/api', require('./routes/comboRoutes'));
app.use('/public', require('./routes/comboRoutes'));
app.use('/public', require('./routes/collectionRoutes'));
app.use('/api', require('./routes/collectionRoutes'));

// global rate limiter
const globalLimiter = rateLimit({
  windowMs: 60*1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Quá nhiều yêu cầu từ địa chỉ IP này, vui lòng thử lại sau một phút.'
});
app.use(globalLimiter);

// Error handling (last)
app.use(errorHandler);

// Cron jobs
cron.schedule('0 0 * * *', () => {
  (async () => {
    try {
      const n = await cleanupExpiredRefreshTokens();
      if (typeof n === 'number') console.log(`Cleaned up ${n} expired refresh tokens`);
    } catch (err) {
      console.error('cron cleanupExpiredRefreshTokens error:', err && err.stack ? err.stack : err);
    }
  })();
});

cron.schedule('*/5 * * * *', async () => {
  try {
    const n = await promotionService.expirePromotions();
    if (n > 0) console.log(`Expired ${n} promotions`);
  } catch (err) {
    console.error('cron expirePromotions error:', err && err.stack ? err.stack : err);
  }
});

cron.schedule('0 */1 * * *', async () => {
  try { await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_revenue_by_week'); }
  catch (e) { console.error('refresh mv_revenue_by_week failed', e); }
});

cron.schedule('*/5 * * * *', async () => {
  try {
    console.log('[cron] checkAndSendForDeliveredOrders start');
    await orderNotificationService.checkAndSendForDeliveredOrders(100);
    console.log('[cron] checkAndSendForDeliveredOrders done');
  } catch (e) {
    console.error('[cron] checkAndSendForDeliveredOrders error', e && e.stack ? e.stack : e);
  }
});

// Flash Sale Lifecycle Sync Cronjob (mỗi 1 phút)
const flashSaleService = require('./services/flashSaleService');
const notificationService = require('./services/notificationService');
cron.schedule('* * * * *', async () => {
  try {
    await flashSaleService.syncFlashSaleStatusCron();
    await notificationService.autoConfirmPendingOrders();
  } catch (e) {
    console.error('[cron] syncFlashSaleStatusCron / autoConfirmPendingOrders error', e);
  }
});

async function cleanupOldAiData() {
  const client = await pool.connect();
  try {
    // retention config: sessions/messages older than 90 days; recommendations older than 365 days
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM ai_chat_messages
       WHERE created_at < NOW() - INTERVAL '90 days'`
    );
    await client.query(
      `DELETE FROM ai_chat_sessions
       WHERE last_message_at < NOW() - INTERVAL '90 days'`
    );
    await client.query(
      `DELETE FROM ai_recommendations
       WHERE created_at < NOW() - INTERVAL '365 days'`
    );
    await client.query('COMMIT');
    console.log('[cleanupOldAiData] completed');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[cleanupOldAiData] error', err && err.stack ? err.stack : err);
  } finally {
    client.release();
  }
}

// Example: run daily at 03:30
cron.schedule('30 3 * * *', () => {
  cleanupOldAiData().catch(err => console.error('cleanup job failed', err));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

