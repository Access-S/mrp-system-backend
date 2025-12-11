import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import logger from '../utils/logger';
import { createError } from '../middleware/errorHandler';

export const getAllProducts = async (req: Request, res: Response) => {
  try {
    logger.info('Fetching all products');
    
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('product_code', { ascending: true });

    if (error) {
      logger.error('Supabase error fetching products', { error });
      throw createError('Failed to fetch products from database', 500);
    }
    
    logger.info(`Successfully fetched ${data?.length || 0} products`);
    
    res.status(200).json({
      success: true,
      data,
      count: data?.length || 0
    });
  } catch (error: any) {
    logger.error('Error in getAllProducts', { error: error.message });
    res.status(error.statusCode || 500).json({ 
      success: false,
      message: error.message || "Failed to fetch products"
    });
  }
};

export const getBomForProduct = async (req: Request, res: Response) => {
  try {
    const { productCode } = req.params;  // ✅ Changed from productId to productCode
    
    logger.info('Fetching BOM for product', { productCode });

    // ✅ STEP 1: Get product by product_code to get its UUID
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id')
      .eq('product_code', productCode)
      .single();

    if (productError || !product) {
      logger.error('Product not found', { productCode, error: productError });
      throw createError(`Product with code ${productCode} not found`, 404);
    }

    // ✅ STEP 2: Get BOM components using the product UUID
    const { data: bomComponents, error: bomError } = await supabase
      .from('bom_components')
      .select('*')
      .eq('product_id', product.id);

    if (bomError) {
      logger.error('Supabase error fetching BOM', { error: bomError, productId: product.id });
      throw createError('Failed to fetch BOM components from database', 500);
    }
    
    logger.info(`Successfully fetched ${bomComponents?.length || 0} BOM components for product ${productCode}`);
    
    res.status(200).json({
      success: true,
      data: bomComponents || [],
      count: bomComponents?.length || 0,
      productCode  // ✅ Return productCode instead of productId for clarity
    });
  } catch (error: any) {
    logger.error('Error in getBomForProduct', { error: error.message, productCode: req.params.productCode });
    res.status(error.statusCode || 500).json({ 
      success: false,
      message: error.message || "Failed to fetch BOM components"
    });
  }
};