"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// BLOCK 1: Imports and Dependencies
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const joi_1 = __importDefault(require("joi")); // <-- ADD Joi
const forecast_controller_1 = require("../controllers/forecast.controller");
const asyncHandler_1 = require("../utils/asyncHandler");
// BLOCK 2: Multer Configuration for File Upload
const storage = multer_1.default.memoryStorage();
const upload = (0, multer_1.default)({ storage: storage });
// BLOCK 3: Validation Schemas (NEW)
const forecastQuerySchema = joi_1.default.object({
    months: joi_1.default.string().valid('4', '6', '9', 'all').optional().default('4'),
    search: joi_1.default.string().allow('').optional()
});
// BLOCK 4: Router Definition and Routes (MODIFIED)
const router = (0, express_1.Router)();
// MODIFIED: Added validateQuery middleware
router.get('/', 
// validateQuery(forecastQuerySchema), 
(0, asyncHandler_1.asyncHandler)(forecast_controller_1.getForecasts));
// This route remains the same
router.post('/upload', upload.single('forecastFile'), (0, asyncHandler_1.asyncHandler)(forecast_controller_1.uploadForecasts));
// BLOCK 5: Export Router
exports.default = router;
