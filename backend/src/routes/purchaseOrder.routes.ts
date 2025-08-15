import { Router } from 'express';
import Joi from 'joi';
import { 
  getPurchaseOrders, 
  getPurchaseOrderById, 
  createPurchaseOrder, 
  updatePurchaseOrder, 
  updatePoStatus, 
  deletePurchaseOrder 
} from '../controllers/purchaseOrder.controller';
import { validateRequest, validateParams, validateQuery } from '../middleware/validation';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Validation schemas
const poParamsSchema = Joi.object({
  poId: Joi.string().uuid().required()
});

const createPoSchema = Joi.object({
  poNumber: Joi.string().required(),
  productCode: Joi.string().required(),
  customerName: Joi.string().required(),
  poCreatedDate: Joi.date().iso().required(),
  poReceivedDate: Joi.date().iso().required(),
  orderedQtyPieces: Joi.number().positive().required(),
  customerAmount: Joi.number().positive().required()
});

const updatePoSchema = Joi.object({
  poNumber: Joi.string().optional(),
  customerName: Joi.string().optional(),
  poCreatedDate: Joi.date().iso().optional(),
  poReceivedDate: Joi.date().iso().optional(),
  orderedQtyPieces: Joi.number().positive().optional(),
  customerAmount: Joi.number().positive().optional()
});

const statusUpdateSchema = Joi.object({
  status: Joi.string().valid('Open', 'In Progress', 'Completed', 'Cancelled').required()
});

const querySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  search: Joi.string().allow('').optional(),
  status: Joi.string().allow('').optional(),
  sort_direction: Joi.string().valid('asc', 'desc').optional()
});

// Routes with async handling
router.get('/', validateQuery(querySchema), asyncHandler(getPurchaseOrders));
router.post('/', validateRequest(createPoSchema), asyncHandler(createPurchaseOrder));
router.get('/:poId', validateParams(poParamsSchema), asyncHandler(getPurchaseOrderById));
router.patch('/:poId', validateParams(poParamsSchema), validateRequest(updatePoSchema), asyncHandler(updatePurchaseOrder));
router.patch('/:poId/status', validateParams(poParamsSchema), validateRequest(statusUpdateSchema), asyncHandler(updatePoStatus));
router.delete('/:poId', validateParams(poParamsSchema), asyncHandler(deletePurchaseOrder));

export default router;