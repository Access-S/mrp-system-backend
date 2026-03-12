// src/routes/product.routes.ts

// ============== BLOCK 1: Imports ==============
import { Router } from 'express';
import Joi from 'joi';
import {
  getAllProducts,
  getProductByCode,
  getBomForProduct,
  createProduct,
  updateProduct,
  deleteProduct
} from '../controllers/product.controller';
import { validateParams, validateRequest } from '../middleware/validation';
import { asyncHandler } from '../utils/asyncHandler';

// ============== BLOCK 2: Validation Schemas ==============
const router = Router();

const productParamsSchema = Joi.object({
  productCode: Joi.string().required()
});

const createProductSchema = Joi.object({
  productCode: Joi.string().required(),
  description: Joi.string().required(),
  unitsPerShipper: Joi.number().min(0).default(0),
  dailyRunRate: Joi.number().min(0).default(0),
  hourlyRunRate: Joi.number().min(0).default(0),
  minsPerShipper: Joi.number().min(0).default(0),
  pricePerShipper: Joi.number().min(0).default(0)
});

const updateProductSchema = Joi.object({
  description: Joi.string().optional(),
  unitsPerShipper: Joi.number().min(0).optional(),
  dailyRunRate: Joi.number().min(0).optional(),
  minsPerShipper: Joi.number().min(0).optional(),
  pricePerShipper: Joi.number().min(0).optional(),
  hourlyRunRate: Joi.number().min(0).optional()
});

// ============== BLOCK 3: Routes ==============
router.get('/', asyncHandler(getAllProducts));
router.post('/', validateRequest(createProductSchema), asyncHandler(createProduct));
router.get('/:productCode', validateParams(productParamsSchema), asyncHandler(getProductByCode));
router.patch('/:productCode', validateParams(productParamsSchema), validateRequest(updateProductSchema), asyncHandler(updateProduct));
router.delete('/:productCode', validateParams(productParamsSchema), asyncHandler(deleteProduct));
router.get('/:productCode/bom', validateParams(productParamsSchema), asyncHandler(getBomForProduct));

export default router;