"use strict";
//src/routes/bom.routes.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const bom_controller_1 = require("../controllers/bom.controller");
const validation_1 = require("../middleware/validation");
const asyncHandler_1 = require("../utils/asyncHandler");
const router = (0, express_1.Router)();
// Validation schemas
const productParamsSchema = joi_1.default.object({
    productCode: joi_1.default.string().required()
});
const bomParamsSchema = joi_1.default.object({
    productCode: joi_1.default.string().required(),
    partCode: joi_1.default.string().required()
});
const addBomComponentSchema = joi_1.default.object({
    partCode: joi_1.default.string().required(),
    partDescription: joi_1.default.string().required(),
    partType: joi_1.default.string().valid('RAW_MATERIAL', 'COMPONENT', 'PACKAGING', 'CONSUMABLE').required(),
    perShipper: joi_1.default.number().min(0).required()
});
const updateBomComponentSchema = joi_1.default.object({
    partDescription: joi_1.default.string().optional(),
    partType: joi_1.default.string().valid('RAW_MATERIAL', 'COMPONENT', 'PACKAGING', 'CONSUMABLE').optional(),
    perShipper: joi_1.default.number().min(0).optional()
});
// Routes
router.post('/:productCode/bom', (0, validation_1.validateParams)(productParamsSchema), (0, validation_1.validateRequest)(addBomComponentSchema), (0, asyncHandler_1.asyncHandler)(bom_controller_1.addBomComponent));
router.patch('/:productCode/bom/:partCode', (0, validation_1.validateParams)(bomParamsSchema), (0, validation_1.validateRequest)(updateBomComponentSchema), (0, asyncHandler_1.asyncHandler)(bom_controller_1.updateBomComponent));
router.delete('/:productCode/bom/:partCode', (0, validation_1.validateParams)(bomParamsSchema), (0, asyncHandler_1.asyncHandler)(bom_controller_1.deleteBomComponent));
exports.default = router;
