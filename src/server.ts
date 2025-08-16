// BLOCK 1: Imports
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Import routes
import productRoutes from './routes/product.routes';
import purchaseOrderRoutes from './routes/purchaseOrder.routes';
import sohRoutes from './routes/soh.routes';
import forecastRoutes from './routes/forecast.routes';

// Import middleware
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import logger from './utils/logger';

// Import Supabase to initialize connection
import './config/supabase';

dotenv.config();

// BLOCK 2: App Configuration (REVISED FOR ROBUST CORS)
const app = express();
const PORT = process.env.PORT || 3001;

// Define a clear list of allowed origins for CORS
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://localhost:5173',
  'https://animated-space-lamp-r4xxrp67wq4r3pq6-5173.app.github.dev'
];

// If a production frontend URL is provided in environment variables, add it to the list
if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(process.env.CORS_ORIGIN);
}

// Use a more robust CORS configuration with a function-based origin check
app.use(cors({
  origin: '*', // Allow any origin
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// CRITICAL: Handle pre-flight OPTIONS requests. This must come after the main cors middleware.
// The browser sends an OPTIONS request first to check permissions before sending the actual request (e.g., GET/POST).
// This handler ensures those permission checks succeed.
app.options('*', cors());

// Standard middleware
app.use(express.json());

// Trust proxy headers from Railway
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

// BLOCK 4: API Routes
app.use('/api/products', productRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/soh', sohRoutes);
app.use('/api/forecasts', forecastRoutes);

// BLOCK 5: Error Handling and Server Start
// Error handling (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  // Log the final, effective list of allowed origins
  logger.info(`🌐 CORS Allowed Origins: ${allowedOrigins.join(', ')}`);
  logger.info(`📍 Environment: ${process.env.NODE_ENV}`);
  logger.info(`🗄️  Database: Supabase`);
});

export default app;