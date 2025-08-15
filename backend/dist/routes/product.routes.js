"use strict";
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
    productId: joi_1.default.string().uuid().required()
});
// Routes with async handling
router.get('/', (0, asyncHandler_1.asyncHandler)(product_controller_1.getAllProducts));
router.get('/:productId/bom', (0, validation_1.validateParams)(productParamsSchema), (0, asyncHandler_1.asyncHandler)(product_controller_1.getBomForProduct));
exports.default = router;
