// BLOCK 1: Imports
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Import routes
import productRoutes from './routes/product.routes';
import purchaseOrderRoutes from './routes/purchaseOrder.routes';
import sohRoutes from './routes/soh.routes';
import forecastRoutes from './routes/forecast.routes';
import bomRoutes from './routes/bom.routes';
import dashboardRoutes from './routes/dashboard.routes';
import importRoutes from './routes/import.routes';

// Import middleware
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import logger from './utils/logger';

// Import Supabase to initialize connection
import './config/supabase';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
console.log('✅ SUPABASE_URL set:', !!process.env.SUPABASE_URL);
console.log('✅ SUPABASE_SERVICE_KEY set:', !!process.env.SUPABASE_SERVICE_KEY);

// BLOCK 2: App Configuration (RE-ORDERED)

// STEP 1: Configure CORS as the VERY FIRST middleware. This is critical.
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://localhost:5173',
  'https://animated-space-lamp-r4xxrp67wq4r3pq6-5173.app.github.dev',
  'https://mrp-frontend.onrender.com',
  'https://mrp-frontend-gceq.onrender.com',
  'https://*.onrender.com',
  'https://bug-free-sniffle-69ppr45vwq5jf5wr.github.dev/'
];
if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(process.env.CORS_ORIGIN);
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('This origin is not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// STEP 2: Place the pre-flight handler immediately after CORS.
app.options('*', cors());

// STEP 3: Now, set up other middleware.
app.use(express.json());
app.set('trust proxy', 1);

// BLOCK 3: Health Check Routes
app.get('/', (req, res) => {
  res.json({
    message: 'MRP System API - Powered by Supabase',
    version: '1.0.0',
    status: 'running',
    database: 'Supabase',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    database: 'Supabase'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'MRP Backend API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// BLOCK 4: API Routes
app.use('/api/products', productRoutes);
app.use('/api/products', bomRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/soh', sohRoutes);
app.use('/api/forecasts', forecastRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/import', importRoutes);

// BLOCK 5: Error Handling and Server Start
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`🌐 CORS Allowed Origins: ${allowedOrigins.join(', ')}`);
  logger.info(`📍 Environment: ${process.env.NODE_ENV}`);
  logger.info(`🗄️  Database: Supabase`);
});

export default app;