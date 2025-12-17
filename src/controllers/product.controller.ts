//src/controllers/product.controller.ts

// ============================================================================
// BLOCK 1: Imports and Dependencies
// ============================================================================
import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import logger from '../utils/logger';
import { createError } from '../middleware/errorHandler';

// ============================================================================
// BLOCK 2: Get All Products with Nested BOM Components
// ============================================================================
/**
 * Fetches all products and enriches each with its BOM components.
 * Returns data in camelCase format for frontend consumption.
 * This is the primary endpoint used by the MRP engine.
 */
export const getAllProducts = async (req: Request, res: Response) => {
  try {
    logger.info('Fetching all products with BOM');

    // STEP 1: Fetch all products from database
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

    // STEP 2: Fetch all BOM components in a single query for performance
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
      logger.warn('Supabase error fetching BOM components (continuing without BOM)', { error: bomError });
    }

    // STEP 3: Build product map and convert to camelCase
    const productMap = new Map<string, any>();
    
    products.forEach(product => {
      productMap.set(product.id, {
        id: product.id,
        productCode: product.product_code,
        description: product.description,
        unitsPerShipper: product.units_per_shipper || 0,
        dailyRunRate: product.daily_run_rate || 0,
        hourlyRunRate: product.hourly_run_rate || 0,
        minsPerShipper: product.mins_per_shipper || 0,
        pricePerShipper: product.price_per_shipper || 0,
        createdAt: product.created_at,
        updatedAt: product.updated_at,
        components: []
      });
    });

    // STEP 4: Attach BOM components to their respective products
    (allBom || []).forEach(bomItem => {
      const product = productMap.get(bomItem.product_id);
      if (product) {
        product.components.push({
          partCode: bomItem.part_code,
          partDescription: bomItem.part_description,
          partType: bomItem.part_type,
          perShipper: bomItem.per_shipper || 0
        });
      }
    });

    const enrichedProducts = Array.from(productMap.values());

    logger.info(`Successfully fetched ${enrichedProducts.length} products with BOM components`);

    // STEP 5: Return enriched data in standard API format
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

// ============================================================================
// BLOCK 3: Get BOM for a Single Product
// ============================================================================
/**
 * Fetches BOM components for a specific product by product code.
 * Returns data in camelCase format for frontend consumption.
 */
export const getBomForProduct = async (req: Request, res: Response) => {
  try {
    const { productCode } = req.params;

    logger.info('Fetching BOM for product', { productCode });

    // STEP 1: Get product UUID from product_code
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id')
      .eq('product_code', productCode)
      .single();

    if (productError || !product) {
      logger.error('Product not found', { productCode, error: productError });
      throw createError(`Product with code ${productCode} not found`, 404);
    }

    // STEP 2: Fetch BOM components by product UUID
    const { data: bomComponents, error: bomError } = await supabase
      .from('bom_components')
      .select('*')
      .eq('product_id', product.id);

    if (bomError) {
      logger.error('Supabase error fetching BOM', { error: bomError, productId: product.id });
      throw createError('Failed to fetch BOM components from database', 500);
    }

    // STEP 3: Convert to camelCase format
    const formattedBom = (bomComponents || []).map(bom => ({
      partCode: bom.part_code,
      partDescription: bom.part_description,
      partType: bom.part_type,
      perShipper: bom.per_shipper || 0
    }));
    
    logger.info(`Successfully fetched ${formattedBom.length} BOM components for product ${productCode}`);
    
    // STEP 4: Return formatted data
    res.status(200).json({
      success: true,
      data: formattedBom,
      count: formattedBom.length,
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