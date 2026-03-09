// src/routes/soh.routes.ts

// ============== BLOCK 1: Imports ==============
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import Joi from 'joi';
import { getSoh, uploadSoh } from '../controllers/soh.controller';
import { validateQuery } from '../middleware/validation';
import { asyncHandler } from '../utils/asyncHandler';
import { createError } from '../middleware/errorHandler';

// ============== BLOCK 2: Multer Configuration ==============
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ============== BLOCK 3: Validation Schemas ==============
const sohQuerySchema = Joi.object({
  search: Joi.string().allow('').optional(),
  include_inactive: Joi.string().valid('true', 'false').optional()
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

// ============== BLOCK 5: Router Definition ==============
const router = Router();

// GET /api/soh - Fetch all active SOH records
router.get('/',
  validateQuery(sohQuerySchema),
  asyncHandler(getSoh)
);

// POST /api/soh/upload - Import SOH data from Excel
router.post('/upload',
  upload.single('sohFile'),
  validateExcelFile,
  asyncHandler(uploadSoh)
);

// ============== BLOCK 6: Export ==============
export default router;