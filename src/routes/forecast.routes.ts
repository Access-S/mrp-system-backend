// BLOCK 1: Imports and Dependencies
import { Router } from 'express';
import multer from 'multer';
import Joi from 'joi'; // <-- ADD Joi
import { getForecasts, uploadForecasts } from '../controllers/forecast.controller';
import { validateQuery } from '../middleware/validation'; // <-- ADD validateQuery
import { asyncHandler } from '../utils/asyncHandler';

// BLOCK 2: Multer Configuration for File Upload
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// BLOCK 3: Validation Schemas (NEW)
const forecastQuerySchema = Joi.object({
  months: Joi.string().valid('4', '6', '9', 'all').optional().default('4'),
  search: Joi.string().allow('').optional()
});

// BLOCK 4: Router Definition and Routes (MODIFIED)
const router = Router();

// MODIFIED: Added validateQuery middleware
router.get('/', 
  // validateQuery(forecastQuerySchema), 
  asyncHandler(getForecasts)
);

// This route remains the same
router.post('/upload', 
  upload.single('forecastFile'), 
  asyncHandler(uploadForecasts)
);

// BLOCK 5: Export Router
export default router;