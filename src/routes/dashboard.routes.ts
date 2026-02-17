// src/routes/dashboard.routes.ts

import { Router } from 'express';
import { getDashboardData, getQuickStats } from '../controllers/dashboard.controller';

const router = Router();

// Full dashboard data (all metrics, charts, etc.)
router.get('/', getDashboardData);

// Quick stats only (lightweight, for header/sidebar)
router.get('/quick-stats', getQuickStats);

export default router;