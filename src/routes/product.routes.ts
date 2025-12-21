//src/routes/product.routes.ts

import { Router } from 'express';
import Joi from 'joi';
import { 
  getAllProducts, 
  getBomForProduct,
  createProduct 
} from '../controllers/product.controller';
import { validateParams, validateRequest } from '../middleware/validation';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Validation schemas
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

// Routes with async handling
router.get('/', asyncHandler(getAllProducts));
router.post('/', validateRequest(createProductSchema), asyncHandler(createProduct));
router.get('/:productCode/bom', validateParams(productParamsSchema), asyncHandler(getBomForProduct));

export default router;