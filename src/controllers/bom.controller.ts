//src/controllers/bom.controller.ts

// ============================================================================
// BLOCK 1: Imports and Dependencies
// ============================================================================
import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import logger from '../utils/logger';
import { createError } from '../middleware/errorHandler';

// ============================================================================
// BLOCK 2: Add BOM Component to Product
// ============================================================================
/**
 * Adds a new BOM component to a product
 * POST /api/products/:productCode/bom
 */
export const addBomComponent = async (req: Request, res: Response) => {
  try {
    const { productCode } = req.params;
    const { partCode, partDescription, partType, perShipper } = req.body;

    logger.info('Adding BOM component', { productCode, partCode });

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

    // STEP 2: Check if component already exists for this product
    const { data: existing } = await supabase
      .from('bom_components')
      .select('part_code')
      .eq('product_id', product.id)
      .eq('part_code', partCode)
      .single();

    if (existing) {
      throw createError(`Component ${partCode} already exists in BOM for this product`, 409);
    }

    // STEP 3: Insert new BOM component
    const { data: newComponent, error: insertError } = await supabase
      .from('bom_components')
      .insert([{
        product_id: product.id,
        part_code: partCode,
        part_description: partDescription,
        part_type: partType,
        per_shipper: perShipper
      }])
      .select()
      .single();

    if (insertError) {
      logger.error('Supabase error inserting BOM component', { error: insertError });
      throw createError('Failed to add BOM component', 500);
    }

    logger.info('BOM component added successfully', { productCode, partCode });

    // STEP 4: Return in camelCase format
    res.status(201).json({
      success: true,
      data: {
        partCode: newComponent.part_code,
        partDescription: newComponent.part_description,
        partType: newComponent.part_type,
        perShipper: newComponent.per_shipper
      },
      message: 'BOM component added successfully'
    });

  } catch (error: any) {
    logger.error('Error in addBomComponent', { error: error.message });
    res.status(error.statusCode || 500).json({ 
      success: false,
      message: error.message || "Failed to add BOM component"
    });
  }
};

// ============================================================================
// BLOCK 3: Update BOM Component
// ============================================================================
/**
 * Updates an existing BOM component
 * PATCH /api/products/:productCode/bom/:partCode
 */
export const updateBomComponent = async (req: Request, res: Response) => {
  try {
    const { productCode, partCode } = req.params;
    const { partDescription, partType, perShipper } = req.body;

    logger.info('Updating BOM component', { productCode, partCode });

    // STEP 1: Get product UUID
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id')
      .eq('product_code', productCode)
      .single();

    if (productError || !product) {
      throw createError(`Product with code ${productCode} not found`, 404);
    }

    // STEP 2: Update the component
    const updateData: any = {};
    if (partDescription !== undefined) updateData.part_description = partDescription;
    if (partType !== undefined) updateData.part_type = partType;
    if (perShipper !== undefined) updateData.per_shipper = perShipper;

    const { data: updatedComponent, error: updateError } = await supabase
      .from('bom_components')
      .update(updateData)
      .eq('product_id', product.id)
      .eq('part_code', partCode)
      .select()
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        throw createError(`Component ${partCode} not found in BOM`, 404);
      }
      logger.error('Supabase error updating BOM component', { error: updateError });
      throw createError('Failed to update BOM component', 500);
    }

    logger.info('BOM component updated successfully', { productCode, partCode });

    res.status(200).json({
      success: true,
      data: {
        partCode: updatedComponent.part_code,
        partDescription: updatedComponent.part_description,
        partType: updatedComponent.part_type,
        perShipper: updatedComponent.per_shipper
      },
      message: 'BOM component updated successfully'
    });

  } catch (error: any) {
    logger.error('Error in updateBomComponent', { error: error.message });
    res.status(error.statusCode || 500).json({ 
      success: false,
      message: error.message || "Failed to update BOM component"
    });
  }
};

// ============================================================================
// BLOCK 4: Delete BOM Component
// ============================================================================
/**
 * Deletes a BOM component from a product
 * DELETE /api/products/:productCode/bom/:partCode
 */
export const deleteBomComponent = async (req: Request, res: Response) => {
  try {
    const { productCode, partCode } = req.params;

    logger.info('Deleting BOM component', { productCode, partCode });

    // STEP 1: Get product UUID
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id')
      .eq('product_code', productCode)
      .single();

    if (productError || !product) {
      throw createError(`Product with code ${productCode} not found`, 404);
    }

    // STEP 2: Delete the component
    const { error: deleteError } = await supabase
      .from('bom_components')
      .delete()
      .eq('product_id', product.id)
      .eq('part_code', partCode);

    if (deleteError) {
      logger.error('Supabase error deleting BOM component', { error: deleteError });
      throw createError('Failed to delete BOM component', 500);
    }

    logger.info('BOM component deleted successfully', { productCode, partCode });

    res.status(200).json({
      success: true,
      message: `Component ${partCode} deleted successfully`
    });

  } catch (error: any) {
    logger.error('Error in deleteBomComponent', { error: error.message });
    res.status(error.statusCode || 500).json({ 
      success: false,
      message: error.message || "Failed to delete BOM component"
    });
  }
};