//src/controllers/product.controller.ts

// BLOCK 1: Imports and Dependencies
import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import logger from '../utils/logger';
import { createError } from '../middleware/errorHandler';

// BLOCK 2: Get All Products with Nested BOM Components
/**
 * Fetches all products and enriches each with its BOM components.
 * This is the primary endpoint used by the MRP engine (InventoryPage).
 */
export const getAllProducts = async (req: Request, res: Response) => {
  try {
    logger.info('Fetching all products with BOM');

    // STEP 1: Fetch all products (only necessary fields for performance)
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select(`
        id,
        product_code,
        description,
        units_per_shipper,
        daily_run_rate,
        hourly_run_rate,
        mins_per_shipper,
        price_per_shipper,
        created_at,
        updated_at
      `)
      .order('product_code', { ascending: true });

    if (productsError) {
      logger.error('Supabase error fetching products', { error: productsError });
      throw createError('Failed to fetch products from database', 500);
    }

    // STEP 2: Fetch all BOM components in a single query
    const { data: allBom, error: bomError } = await supabase
      .from('bom_components')
      .select(`
        product_id,
        part_code,
        part_description,
        part_type,
        per_shipper
      `);

    if (bomError) {
      // Log warning but don't fail — BOM table might be empty initially
      logger.warn('Supabase error fetching BOM components (continuing without BOM)', { error: bomError });
    }

    // STEP 3: Map BOM components to their parent products
    const productMap = new Map<string, any>();
    
    // Initialize each product with an empty components array
    products.forEach(product => {
      productMap.set(product.id, {
        ...product,
        components: []
      });
    });

    // Attach BOM components to their respective products
    (allBom || []).forEach(bomItem => {
      const product = productMap.get(bomItem.product_id);
      if (product) {
        product.components.push({
          partCode: bomItem.part_code,
          partDescription: bomItem.part_description,
          partType: bomItem.part_type,
          perShipper: bomItem.per_shipper
        });
      }
    });

    const enrichedProducts = Array.from(productMap.values());

    logger.info(`Successfully fetched ${enrichedProducts.length} products with BOM`);

    // Return enriched data in standard API format
    res.status(200).json({
      success: true,
      data: enrichedProducts,
      count: enrichedProducts.length
    });

  } catch (error: any) {
    logger.error('Error in getAllProducts', { error: error.message });
    res.status(error.statusCode || 500).json({ 
      success: false,
      message: error.message || "Failed to fetch products with BOM"
    });
  }
};

// BLOCK 3: Get BOM for a Single Product (Legacy/Backward Compatibility)
/**
 * Fetches BOM for a specific product by product_code.
 * Kept for API completeness, but not used by MRP engine.
 */
export const getBomForProduct = async (req: Request, res: Response) => {
  try {
    const { productCode } = req.params;

    logger.info('Fetching BOM for product', { productCode });

    // Get product UUID from product_code
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id')
      .eq('product_code', productCode)
      .single();

    if (productError || !product) {
      logger.error('Product not found', { productCode, error: productError });
      throw createError(`Product with code ${productCode} not found`, 404);
    }

    // Fetch BOM components by product UUID
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
      productCode
    });

  } catch (error: any) {
    logger.error('Error in getBomForProduct', { error: error.message, productCode: req.params.productCode });
    res.status(error.statusCode || 500).json({ 
      success: false,
      message: error.message || "Failed to fetch BOM components"
    });
  }
};