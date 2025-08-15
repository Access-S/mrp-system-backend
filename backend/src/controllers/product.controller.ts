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
    const { productId } = req.params;
    
    logger.info('Fetching BOM for product', { productId });

    const { data, error } = await supabase
      .from('bom_components')
      .select('*')
      .eq('product_id', productId);

    if (error) {
      logger.error('Supabase error fetching BOM', { error, productId });
      throw createError('Failed to fetch BOM components from database', 500);
    }
    
    logger.info(`Successfully fetched ${data?.length || 0} BOM components for product ${productId}`);
    
    res.status(200).json({
      success: true,
      data,
      count: data?.length || 0,
      productId
    });
  } catch (error: any) {
    logger.error('Error in getBomForProduct', { error: error.message, productId: req.params.productId });
    res.status(error.statusCode || 500).json({ 
      success: false,
      message: error.message || "Failed to fetch BOM components"
    });
  }
};