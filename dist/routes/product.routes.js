"use strict";
//src/routes/product.routes.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const product_controller_1 = require("../controllers/product.controller");
const validation_1 = require("../middleware/validation");
const asyncHandler_1 = require("../utils/asyncHandler");
const router = (0, express_1.Router)();
// Validation schemas
const productParamsSchema = joi_1.default.object({
    productCode: joi_1.default.string().required()
});
const createProductSchema = joi_1.default.object({
    productCode: joi_1.default.string().required(),
    description: joi_1.default.string().required(),
    unitsPerShipper: joi_1.default.number().min(0).default(0),
    dailyRunRate: joi_1.default.number().min(0).default(0),
    hourlyRunRate: joi_1.default.number().min(0).default(0),
    minsPerShipper: joi_1.default.number().min(0).default(0),
    pricePerShipper: joi_1.default.number().min(0).default(0)
});
const updateProductSchema = joi_1.default.object({
    description: joi_1.default.string().optional(),
    unitsPerShipper: joi_1.default.number().min(0).optional(),
    dailyRunRate: joi_1.default.number().min(0).optional(),
    hourlyRunRate: joi_1.default.number().min(0).optional(),
    minsPerShipper: joi_1.default.number().min(0).optional(),
    pricePerShipper: joi_1.default.number().min(0).optional()
});
// Routes with async handling
router.get('/', (0, asyncHandler_1.asyncHandler)(product_controller_1.getAllProducts));
router.post('/', (0, validation_1.validateRequest)(createProductSchema), (0, asyncHandler_1.asyncHandler)(product_controller_1.createProduct));
router.patch('/:productCode', (0, validation_1.validateParams)(productParamsSchema), (0, validation_1.validateRequest)(updateProductSchema), (0, asyncHandler_1.asyncHandler)(product_controller_1.updateProduct));
router.delete('/:productCode', (0, validation_1.validateParams)(productParamsSchema), (0, asyncHandler_1.asyncHandler)(product_controller_1.deleteProduct)); // ✅ Add this
router.get('/:productCode/bom', (0, validation_1.validateParams)(productParamsSchema), (0, asyncHandler_1.asyncHandler)(product_controller_1.getBomForProduct));
exports.default = router;
