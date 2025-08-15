// BLOCK 1: Imports
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Import routes
import productRoutes from './routes/product.routes';
import purchaseOrderRoutes from './routes/purchaseOrder.routes';
import sohRoutes from './routes/soh.routes';

// Import middleware
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import logger from './utils/logger';

// Import Supabase to initialize connection
import './config/supabase';

dotenv.config();

// BLOCK 2: App Configuration
const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration - updated for production
const corsOrigins = [
  process.env.CORS_ORIGIN,
  'http://localhost:5173',
  'http://localhost:3000',
  // Add your Gitpod frontend URL as backup
  'https://cuddly-waddle-5g994xrv59w6cvqqw-5173.app.github.dev'
].filter(Boolean) as string[];

app.use(cors({
  origin: corsOrigins,
  credentials: true
}));

app.use(express.json());

// Trust proxy for Railway
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

// BLOCK 5: Error Handling and Server Start
// Error handling (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`🌐 CORS Origin: ${process.env.CORS_ORIGIN}`);
  logger.info(`📍 Environment: ${process.env.NODE_ENV}`);
  logger.info(`🗄️  Database: Supabase`);
});

export default app;