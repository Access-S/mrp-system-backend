//src/routes/bom.routes.ts

import { Router } from 'express';
import Joi from 'joi';
import { 
  addBomComponent,
  updateBomComponent,
  deleteBomComponent
} from '../controllers/bom.controller';
import { validateParams, validateRequest } from '../middleware/validation';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Validation schemas
const productParamsSchema = Joi.object({
  productCode: Joi.string().required()
});

const bomParamsSchema = Joi.object({
  productCode: Joi.string().required(),
  partCode: Joi.string().required()
});

const addBomComponentSchema = Joi.object({
  partCode: Joi.string().required(),
  partDescription: Joi.string().required(),
  partType: Joi.string().valid('RAW_MATERIAL', 'COMPONENT', 'PACKAGING', 'CONSUMABLE').required(),
  perShipper: Joi.number().min(0).required()
});

const updateBomComponentSchema = Joi.object({
  partDescription: Joi.string().optional(),
  partType: Joi.string().valid('RAW_MATERIAL', 'COMPONENT', 'PACKAGING', 'CONSUMABLE').optional(),
  perShipper: Joi.number().min(0).optional()
});

// Routes
router.post(
  '/:productCode/bom',
  validateParams(productParamsSchema),
  validateRequest(addBomComponentSchema),
  asyncHandler(addBomComponent)
);

router.patch(
  '/:productCode/bom/:partCode',
  validateParams(bomParamsSchema),
  validateRequest(updateBomComponentSchema),
  asyncHandler(updateBomComponent)
);

router.delete(
  '/:productCode/bom/:partCode',
  validateParams(bomParamsSchema),
  asyncHandler(deleteBomComponent)
);

export default router;