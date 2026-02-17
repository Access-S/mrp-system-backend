"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const purchaseOrder_controller_1 = require("../controllers/purchaseOrder.controller");
const validation_1 = require("../middleware/validation");
const asyncHandler_1 = require("../utils/asyncHandler");
const router = (0, express_1.Router)();
// Validation schemas
const poParamsSchema = joi_1.default.object({
    poId: joi_1.default.string().uuid().required()
});
const createPoSchema = joi_1.default.object({
    poNumber: joi_1.default.string().required(),
    productCode: joi_1.default.string().required(),
    customerName: joi_1.default.string().required(),
    poCreatedDate: joi_1.default.date().iso().required(),
    poReceivedDate: joi_1.default.date().iso().required(),
    orderedQtyPieces: joi_1.default.number().positive().required(),
    customerAmount: joi_1.default.number().positive().required()
});
const updatePoSchema = joi_1.default.object({
    poNumber: joi_1.default.string().optional(),
    customerName: joi_1.default.string().optional(),
    poCreatedDate: joi_1.default.date().iso().optional(),
    poReceivedDate: joi_1.default.date().iso().optional(),
    orderedQtyPieces: joi_1.default.number().positive().optional(),
    customerAmount: joi_1.default.number().positive().optional()
});
const statusUpdateSchema = joi_1.default.object({
    status: joi_1.default.string().valid('Open', 'In Progress', 'Completed', 'Cancelled').required()
});
const querySchema = joi_1.default.object({
    page: joi_1.default.number().integer().min(1).optional(),
    limit: joi_1.default.number().integer().min(1).max(100).optional(),
    search: joi_1.default.string().allow('').optional(),
    status: joi_1.default.string().allow('').optional(),
    sort_direction: joi_1.default.string().valid('asc', 'desc').optional()
});
// Routes with async handling
router.get('/', (0, validation_1.validateQuery)(querySchema), (0, asyncHandler_1.asyncHandler)(purchaseOrder_controller_1.getPurchaseOrders));
router.post('/', (0, validation_1.validateRequest)(createPoSchema), (0, asyncHandler_1.asyncHandler)(purchaseOrder_controller_1.createPurchaseOrder));
router.get('/:poId', (0, validation_1.validateParams)(poParamsSchema), (0, asyncHandler_1.asyncHandler)(purchaseOrder_controller_1.getPurchaseOrderById));
router.patch('/:poId', (0, validation_1.validateParams)(poParamsSchema), (0, validation_1.validateRequest)(updatePoSchema), (0, asyncHandler_1.asyncHandler)(purchaseOrder_controller_1.updatePurchaseOrder));
router.patch('/:poId/status', (0, validation_1.validateParams)(poParamsSchema), (0, validation_1.validateRequest)(statusUpdateSchema), (0, asyncHandler_1.asyncHandler)(purchaseOrder_controller_1.updatePoStatus));
router.delete('/:poId', (0, validation_1.validateParams)(poParamsSchema), (0, asyncHandler_1.asyncHandler)(purchaseOrder_controller_1.deletePurchaseOrder));
exports.default = router;
