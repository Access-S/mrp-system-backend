// src/routes/snapshot.routes.ts

import { Router } from 'express';
import { saveSnapshot, getSnapshots, autoSnapshot } from '../controllers/snapshot.controller';

const router = Router();

// Manual snapshot - POST /api/snapshots/save?type=weekly|monthly|manual
router.post('/save', saveSnapshot);

// Get snapshots - GET /api/snapshots?type=weekly&startDate=2025-01-01&endDate=2025-02-20
router.get('/', getSnapshots);

// Auto snapshot (called by CRON) - POST /api/snapshots/auto
router.post('/auto', autoSnapshot);

export default router;