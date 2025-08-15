// BLOCK 1: Imports and Dependencies
import { Router } from 'express';
import multer from 'multer';
import Joi from 'joi';
import { 
  getAllSoh, 
  analyzeExcelHeaders, 
  importSohData, 
  getSohSummary,
  deleteAllSoh
} from '../controllers/soh.controller';
import { validateRequest, validateQuery } from '../middleware/validation';
import { asyncHandler } from '../utils/asyncHandler';

// BLOCK 2: Multer Configuration for File Upload
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept Excel files only
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv' // .csv
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) and CSV files are allowed'));
    }
  }
});

// BLOCK 3: Validation Schemas
const querySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(1000).optional(),
  search: Joi.string().allow('').optional(),
  product_id: Joi.string().allow('').optional()
});

const importSchema = Joi.object({
  selectedColumns: Joi.array().items(Joi.string()).min(1).required(),
  replaceExisting: Joi.boolean().optional().default(false)
});

// BLOCK 4: Router Definition and Routes
const router = Router();

// Get all SOH records with optional filtering
router.get('/', 
  validateQuery(querySchema), 
  asyncHandler(getAllSoh)
);

// Get SOH summary statistics
router.get('/summary', 
  asyncHandler(getSohSummary)
);

// Analyze Excel file headers (step 1 of import process)
router.post('/analyze', 
  upload.single('file'),
  asyncHandler(analyzeExcelHeaders)
);

// Import SOH data from Excel (step 2 of import process)
router.post('/import', 
  upload.single('file'),
  validateRequest(importSchema),
  asyncHandler(importSohData)
);

// Delete all SOH data
router.delete('/', 
  asyncHandler(deleteAllSoh)
);

// BLOCK 5: Export Router
export default router;