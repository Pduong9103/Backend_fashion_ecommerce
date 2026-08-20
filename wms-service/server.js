const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const apiRoutes = require('./routes');
const prisma = require('./config/prisma');

const app = express();
const PORT = process.env.PORT || 5001;

// CORS - Hỗ trợ credentials và multi origins
const allowedOrigins = [
  'http://localhost:5000',
  'http://localhost:3000',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:3000',
  'https://pkw69kmb-5000.asse.devtunnels.ms',
  'https://pkw69kmb-3000.asse.devtunnels.ms',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.devtunnels.ms') || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
}));

app.use(express.json());
app.use(morgan('dev'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'WMS Inventory Microservice',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/v1', apiRoutes);

// 404 Handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Không tìm thấy endpoint: ${req.method} ${req.originalUrl}`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[WMS Error]', err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: err.message || 'Lỗi xử lý nội bộ WMS Server',
    code: err.code || undefined,
  });
});

// Start Server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 WMS Microservice is running on http://0.0.0.0:${PORT}`);
});

// Graceful Shutdown
process.on('SIGTERM', async () => {
  console.info('SIGTERM signal received. Closing WMS server...');
  server.close(async () => {
    await prisma.$disconnect();
    console.info('WMS Server and Prisma disconnected.');
  });
});
