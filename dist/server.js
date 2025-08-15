"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// BLOCK 1: Imports
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
// Import routes
const product_routes_1 = __importDefault(require("./routes/product.routes"));
const purchaseOrder_routes_1 = __importDefault(require("./routes/purchaseOrder.routes"));
const soh_routes_1 = __importDefault(require("./routes/soh.routes"));
const forecast_routes_1 = __importDefault(require("./routes/forecast.routes"));
// Import middleware
const errorHandler_1 = require("./middleware/errorHandler");
const logger_1 = __importDefault(require("./utils/logger"));
// Import Supabase to initialize connection
require("./config/supabase");
dotenv_1.default.config();
// BLOCK 2: App Configuration
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// CORS configuration - production ready
const corsOrigins = [
    process.env.CORS_ORIGIN,
    'http://localhost:5173',
    'http://localhost:3000',
    'https://localhost:5173', // For HTTPS local development
].filter(Boolean);
app.use((0, cors_1.default)({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express_1.default.json());
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
app.use('/api/products', product_routes_1.default);
app.use('/api/purchase-orders', purchaseOrder_routes_1.default);
app.use('/api/soh', soh_routes_1.default);
app.use('/api/forecasts', forecast_routes_1.default);
// BLOCK 5: Error Handling and Server Start
// Error handling (must be last)
app.use(errorHandler_1.notFoundHandler);
app.use(errorHandler_1.errorHandler);
app.listen(PORT, () => {
    logger_1.default.info(`🚀 Server running on port ${PORT}`);
    logger_1.default.info(`🌐 CORS Origins: ${corsOrigins.join(', ')}`);
    logger_1.default.info(`📍 Environment: ${process.env.NODE_ENV}`);
    logger_1.default.info(`🗄️  Database: Supabase`);
});
exports.default = app;
