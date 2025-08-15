import { Router } from 'express';
import Joi from 'joi';
import { getAllProducts, getBomForProduct } from '../controllers/product.controller';
import { validateParams } from '../middleware/validation';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Validation schemas
const productParamsSchema = Joi.object({
  productId: Joi.string().uuid().required()
});

// Routes with async handling
router.get('/', asyncHandler(getAllProducts));
router.get('/:productId/bom', validateParams(productParamsSchema), asyncHandler(getBomForProduct));

export default router;