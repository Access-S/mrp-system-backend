"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// BLOCK 1: Imports and Dependencies
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const joi_1 = __importDefault(require("joi"));
const forecast_controller_1 = require("../controllers/forecast.controller");
const validation_1 = require("../middleware/validation");
const asyncHandler_1 = require("../utils/asyncHandler");
const errorHandler_1 = require("../middleware/errorHandler");
// BLOCK 2: Multer Configuration for File Upload
const storage = multer_1.default.memoryStorage();
const upload = (0, multer_1.default)({ storage: storage });
// BLOCK 3: Validation Schemas
const forecastQuerySchema = joi_1.default.object({
    months: joi_1.default.string().valid('4', '6', '9', 'all').optional().default('4'),
    search: joi_1.default.string().allow('').optional()
});
// BLOCK 1.5: File Validation Middleware
const validateExcelFile = (req, res, next) => {
    if (!req.file) {
        return next((0, errorHandler_1.createError)('No file uploaded. Please select an Excel file.', 400));
    }
    const fileExt = req.file.originalname.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls'].includes(fileExt || '')) {
        return next((0, errorHandler_1.createError)('Only Excel files (.xlsx, .xls) are allowed.', 400));
    }
    if (req.file.size > 10 * 1024 * 1024) { // 10MB limit
        return next((0, errorHandler_1.createError)('File size must be less than 10MB.', 400));
    }
    next();
};
// BLOCK 4: Router Definition and Routes
const router = (0, express_1.Router)();
router.get('/', (0, validation_1.validateQuery)(forecastQuerySchema), (0, asyncHandler_1.asyncHandler)(forecast_controller_1.getForecasts));
router.post('/upload', upload.single('forecastFile'), validateExcelFile, (0, asyncHandler_1.asyncHandler)(forecast_controller_1.uploadForecasts));
// BLOCK 5: Export Router
exports.default = router;
