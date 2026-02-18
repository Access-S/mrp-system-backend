// src/routes/import.routes.ts

import { Router } from 'express';
import {
  validateImportData,
  bulkImportPurchaseOrders,
  getImportTemplate
} from '../controllers/import.controller';

const router = Router();

// Get import template/instructions
router.get('/template', getImportTemplate);

// Validate data before import (preview)
router.post('/validate', validateImportData);

// Bulk import purchase orders
router.post('/purchase-orders', bulkImportPurchaseOrders);

export default router;