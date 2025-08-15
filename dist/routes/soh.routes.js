"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// BLOCK 1: Imports and Dependencies
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const joi_1 = __importDefault(require("joi"));
const soh_controller_1 = require("../controllers/soh.controller");
const validation_1 = require("../middleware/validation");
const asyncHandler_1 = require("../utils/asyncHandler");
// BLOCK 2: Multer Configuration for File Upload
const storage = multer_1.default.memoryStorage();
const upload = (0, multer_1.default)({
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
        }
        else {
            cb(new Error('Only Excel (.xlsx, .xls) and CSV files are allowed'));
        }
    }
});
// BLOCK 3: Validation Schemas
const querySchema = joi_1.default.object({
    page: joi_1.default.number().integer().min(1).optional(),
    limit: joi_1.default.number().integer().min(1).max(1000).optional(),
    search: joi_1.default.string().allow('').optional(),
    product_id: joi_1.default.string().allow('').optional()
});
const importSchema = joi_1.default.object({
    selectedColumns: joi_1.default.array().items(joi_1.default.string()).min(1).required(),
    replaceExisting: joi_1.default.boolean().optional().default(false)
});
// BLOCK 4: Router Definition and Routes
const router = (0, express_1.Router)();
// Get all SOH records with optional filtering
router.get('/', (0, validation_1.validateQuery)(querySchema), (0, asyncHandler_1.asyncHandler)(soh_controller_1.getAllSoh));
// Get SOH summary statistics
router.get('/summary', (0, asyncHandler_1.asyncHandler)(soh_controller_1.getSohSummary));
// Analyze Excel file headers (step 1 of import process)
router.post('/analyze', upload.single('file'), (0, asyncHandler_1.asyncHandler)(soh_controller_1.analyzeExcelHeaders));
// Import SOH data from Excel (step 2 of import process)
router.post('/import', upload.single('file'), (0, validation_1.validateRequest)(importSchema), (0, asyncHandler_1.asyncHandler)(soh_controller_1.importSohData));
// Delete all SOH data
router.delete('/', (0, asyncHandler_1.asyncHandler)(soh_controller_1.deleteAllSoh));
// BLOCK 5: Export Router
exports.default = router;
