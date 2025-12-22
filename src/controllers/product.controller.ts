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

// ============================================================================
// BLOCK 4: Create New Product
// ============================================================================
/**
 * Creates a new product in the database.
 * Returns the created product in camelCase format.
 */
export const createProduct = async (req: Request, res: Response) => {
  try {
    const {
      productCode,
      description,
      unitsPerShipper,
      dailyRunRate,
      hourlyRunRate,
      minsPerShipper,
      pricePerShipper
    } = req.body;

    logger.info('Creating new product', { productCode });

    // Validation
    if (!productCode || !description) {
      throw createError('Product code and description are required', 400);
    }

    // Check if product code already exists
    const { data: existingProduct } = await supabase
      .from('products')
      .select('id')
      .eq('product_code', productCode)
      .single();

    if (existingProduct) {
      throw createError(`Product with code ${productCode} already exists`, 409);
    }

    // Insert new product
    const { data: newProduct, error: insertError } = await supabase
      .from('products')
      .insert([{
        product_code: productCode,
        description: description,
        units_per_shipper: unitsPerShipper || 0,
        daily_run_rate: dailyRunRate || 0,
        hourly_run_rate: hourlyRunRate || 0,
        mins_per_shipper: minsPerShipper || 0,
        price_per_shipper: pricePerShipper || 0
      }])
      .select()
      .single();

    if (insertError) {
      logger.error('Supabase error creating product', { error: insertError });
      throw createError('Failed to create product', 500);
    }

    logger.info('Product created successfully', { productId: newProduct.id });

    // Return in camelCase format
    res.status(201).json({
      success: true,
      data: {
        id: newProduct.id,
        productCode: newProduct.product_code,
        description: newProduct.description,
        unitsPerShipper: newProduct.units_per_shipper,
        dailyRunRate: newProduct.daily_run_rate,
        hourlyRunRate: newProduct.hourly_run_rate,
        minsPerShipper: newProduct.mins_per_shipper,
        pricePerShipper: newProduct.price_per_shipper,
        createdAt: newProduct.created_at,
        updatedAt: newProduct.updated_at,
        components: []
      },
      message: 'Product created successfully'
    });

  } catch (error: any) {
    logger.error('Error in createProduct', { error: error.message });
    res.status(error.statusCode || 500).json({ 
      success: false,
      message: error.message || "Failed to create product"
    });
  }
};

// ============================================================================
// BLOCK 5: Update Existing Product
// ============================================================================
/**
 * Updates an existing product by product code.
 * Returns the updated product in camelCase format.
 */
export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { productCode } = req.params;
    const {
      description,
      unitsPerShipper,
      dailyRunRate,
      hourlyRunRate,
      minsPerShipper,
      pricePerShipper
    } = req.body;

    logger.info('Updating product', { productCode });

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

    // Update product
    const updateData: any = { updated_at: new Date().toISOString() };
    
    if (description !== undefined) updateData.description = description;
    if (unitsPerShipper !== undefined) updateData.units_per_shipper = unitsPerShipper;
    if (dailyRunRate !== undefined) updateData.daily_run_rate = dailyRunRate;
    if (hourlyRunRate !== undefined) updateData.hourly_run_rate = hourlyRunRate;
    if (minsPerShipper !== undefined) updateData.mins_per_shipper = minsPerShipper;
    if (pricePerShipper !== undefined) updateData.price_per_shipper = pricePerShipper;

    const { data: updatedProduct, error: updateError } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', product.id)
      .select()
      .single();

    if (updateError) {
      logger.error('Supabase error updating product', { error: updateError });
      throw createError('Failed to update product', 500);
    }

    logger.info('Product updated successfully', { productCode });

    // Return in camelCase format
    res.status(200).json({
      success: true,
      data: {
        id: updatedProduct.id,
        productCode: updatedProduct.product_code,
        description: updatedProduct.description,
        unitsPerShipper: updatedProduct.units_per_shipper,
        dailyRunRate: updatedProduct.daily_run_rate,
        hourlyRunRate: updatedProduct.hourly_run_rate,
        minsPerShipper: updatedProduct.mins_per_shipper,
        pricePerShipper: updatedProduct.price_per_shipper,
        createdAt: updatedProduct.created_at,
        updatedAt: updatedProduct.updated_at
      },
      message: 'Product updated successfully'
    });

  } catch (error: any) {
    logger.error('Error in updateProduct', { error: error.message });
    res.status(error.statusCode || 500).json({ 
      success: false,
      message: error.message || "Failed to update product"
    });
  }
};