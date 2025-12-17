//src/controllers/product.controller.ts

// BLOCK 1: Imports and Dependencies
import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import logger from '../utils/logger';
import { createError } from '../middleware/errorHandler';

// BLOCK 2: Get All Products with Nested BOM Components
export const getAllProducts = async (req: Request, res: Response) => {
  try {
    logger.info('Fetching all products with BOM');

    // STEP 1: Fetch all products
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
      logger.warn('Supabase error fetching BOM components (continuing without BOM)', { error: bomError });
    }

    // STEP 3: Map BOM components to their parent products
    const productMap = new Map<string, any>();
    
    // 🔥 UPDATED: Map to camelCase and initialize with empty components array
    products.forEach(product => {
      productMap.set(product.id, {
        id: product.id,
        productCode: product.product_code,                    // ← snake to camel
        description: product.description,
        unitsPerShipper: product.units_per_shipper || 0,      // ← snake to camel
        dailyRunRate: product.daily_run_rate || 0,            // ← snake to camel
        hourlyRunRate: product.hourly_run_rate || 0,          // ← snake to camel
        minsPerShipper: product.mins_per_shipper || 0,        // ← snake to camel
        pricePerShipper: product.price_per_shipper || 0,      // ← snake to camel
        createdAt: product.created_at,                        // ← snake to camel
        updatedAt: product.updated_at,                        // ← snake to camel
        components: []
      });
    });

    // 🔥 UPDATED: Map BOM components to camelCase
    (allBom || []).forEach(bomItem => {
      const product = productMap.get(bomItem.product_id);
      if (product) {
        product.components.push({
          partCode: bomItem.part_code,              // ← snake to camel
          partDescription: bomItem.part_description, // ← snake to camel
          partType: bomItem.part_type,              // ← snake to camel
          perShipper: bomItem.per_shipper || 0      // ← snake to camel
        });
      }
    });

    const enrichedProducts = Array.from(productMap.values());

    logger.info(`Successfully fetched ${enrichedProducts.length} products with BOM`);
    
    // 🔍 ADD DEBUG LOG
    logger.info(`First product sample:`, {
      productCode: enrichedProducts[0]?.productCode,
      componentsCount: enrichedProducts[0]?.components?.length
    });

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