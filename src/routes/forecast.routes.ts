// BLOCK 1: Imports and Dependencies
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import Joi from 'joi';
import { getForecasts, uploadForecasts } from '../controllers/forecast.controller';
import { validateQuery } from '../middleware/validation';
import { asyncHandler } from '../utils/asyncHandler';
import { createError } from '../middleware/errorHandler';

// BLOCK 2: Multer Configuration for File Upload
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// BLOCK 3: Validation Schemas
const forecastQuerySchema = Joi.object({
  months: Joi.string().valid('4', '6', '9', 'all').optional().default('4'),
  search: Joi.string().allow('').optional()
});

// BLOCK 1.5: File Validation Middleware
const validateExcelFile = (req: Request, res: Response, next: NextFunction) => {
  if (!req.file) {
    return next(createError('No file uploaded. Please select an Excel file.', 400));
  }
  
  const fileExt = req.file.originalname.split('.').pop()?.toLowerCase();
  if (!['xlsx', 'xls'].includes(fileExt || '')) {
    return next(createError('Only Excel files (.xlsx, .xls) are allowed.', 400));
  }
  
  if (req.file.size > 10 * 1024 * 1024) { // 10MB limit
    return next(createError('File size must be less than 10MB.', 400));
  }
  
  next();
};