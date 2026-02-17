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
const bom_routes_1 = __importDefault(require("./routes/bom.routes"));
// Import middleware
const errorHandler_1 = require("./middleware/errorHandler");
const logger_1 = __importDefault(require("./utils/logger"));
// Import Supabase to initialize connection
require("./config/supabase");
dotenv_1.default.config();
const app = (0, express_1.default)();
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
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            console.log('CORS blocked origin:', origin);
            callback(new Error('This origin is not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
// STEP 2: Place the pre-flight handler immediately after CORS.
app.options('*', (0, cors_1.default)());
// STEP 3: Now, set up other middleware.
app.use(express_1.default.json());
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
app.use('/api/products', product_routes_1.default);
app.use('/api/products', bom_routes_1.default);
app.use('/api/purchase-orders', purchaseOrder_routes_1.default);
app.use('/api/soh', soh_routes_1.default);
app.use('/api/forecasts', forecast_routes_1.default);
// BLOCK 5: Error Handling and Server Start
app.use(errorHandler_1.notFoundHandler);
app.use(errorHandler_1.errorHandler);
app.listen(PORT, () => {
    logger_1.default.info(`🚀 Server running on port ${PORT}`);
    logger_1.default.info(`🌐 CORS Allowed Origins: ${allowedOrigins.join(', ')}`);
    logger_1.default.info(`📍 Environment: ${process.env.NODE_ENV}`);
    logger_1.default.info(`🗄️  Database: Supabase`);
});
exports.default = app;
