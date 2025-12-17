//src/routes/product.routes.ts


import { Router } from 'express';
import Joi from 'joi';
import { getAllProducts, getBomForProduct } from '../controllers/product.controller';
import { validateParams } from '../middleware/validation';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Validation schemas
const productParamsSchema = Joi.object({
  productCode: Joi.string().required()  // ✅ Changed from UUID to string
});

// Routes with async handling
router.get('/', asyncHandler(getAllProducts));
router.get('/:productCode/bom', validateParams(productParamsSchema), asyncHandler(getBomForProduct));  // ✅ Changed param name

export default router;