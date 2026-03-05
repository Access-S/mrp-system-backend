// src/routes/forecast.routes.ts

// ============== BLOCK 1: Imports and Dependencies ==============
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import Joi from 'joi';
import { getForecasts, uploadForecasts, finalizeForecastReview } from '../controllers/forecast.controller';
import { validateQuery } from '../middleware/validation';
import { asyncHandler } from '../utils/asyncHandler';
import { createError } from '../middleware/errorHandler';

// ============== BLOCK 2: Multer Configuration for File Upload ==============
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ============== BLOCK 3: Validation Schemas ==============
const forecastQuerySchema = Joi.object({
  months: Joi.string().valid('4', '6', '9', 'all').optional().default('4'),
  search: Joi.string().allow('').optional(),
  include_inactive: Joi.string().valid('true', 'false').optional()
});

const reviewSchema = Joi.object({
  import_batch_id: Joi.string().uuid().required(),
  approvals: Joi.array().items(
    Joi.object({
      product_code: Joi.string().required(),
      action: Joi.string().valid('create_placeholder', 'map_to_existing', 'skip').required(),
      mapped_product_code: Joi.string().when('action', {
        is: 'map_to_existing',
        then: Joi.required(),
        otherwise: Joi.forbidden()
      })
    })
  ).required()
});

// ============== BLOCK 4: File Validation Middleware ==============
const validateExcelFile = (req: Request, res: Response, next: NextFunction) => {
  if (!req.file) {
    return next(createError('No file uploaded. Please select an Excel file.', 400));
  }
  
  const fileExt = req.file.originalname.split('.').pop()?.toLowerCase();
  if (!['xlsx', 'xls', 'csv'].includes(fileExt || '')) {
    return next(createError('Only Excel files (.xlsx, .xls) or CSV are allowed.', 400));
  }
  
  if (req.file.size > 10 * 1024 * 1024) {
    return next(createError('File size must be less than 10MB.', 400));
  }
  
  next();
};

// ============== BLOCK 5: Router Definition and Routes ==============
const router = Router();

router.get('/', 
  validateQuery(forecastQuerySchema),
  asyncHandler(getForecasts)
);

router.post('/upload', 
  upload.single('forecastFile'),
  validateExcelFile,
  asyncHandler(uploadForecasts)
);

router.post('/review', 
  validateQuery(reviewSchema),
  asyncHandler(finalizeForecastReview)
);

export default router;