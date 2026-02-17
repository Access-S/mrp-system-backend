"use strict";
//src/controllers/bom.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteBomComponent = exports.updateBomComponent = exports.addBomComponent = void 0;
const supabase_1 = require("../config/supabase");
const logger_1 = __importDefault(require("../utils/logger"));
const errorHandler_1 = require("../middleware/errorHandler");
// ============================================================================
// BLOCK 2: Add BOM Component to Product
// ============================================================================
/**
 * Adds a new BOM component to a product
 * POST /api/products/:productCode/bom
 */
const addBomComponent = async (req, res) => {
    try {
        const { productCode } = req.params;
        const { partCode, partDescription, partType, perShipper } = req.body;
        logger_1.default.info('Adding BOM component', { productCode, partCode });
        // STEP 1: Get product UUID from product_code
        const { data: product, error: productError } = await supabase_1.supabase
            .from('products')
            .select('id')
            .eq('product_code', productCode)
            .single();
        if (productError || !product) {
            logger_1.default.error('Product not found', { productCode, error: productError });
            throw (0, errorHandler_1.createError)(`Product with code ${productCode} not found`, 404);
        }
        // STEP 2: Check if component already exists for this product
        const { data: existing } = await supabase_1.supabase
            .from('bom_components')
            .select('part_code')
            .eq('product_id', product.id)
            .eq('part_code', partCode)
            .single();
        if (existing) {
            throw (0, errorHandler_1.createError)(`Component ${partCode} already exists in BOM for this product`, 409);
        }
        // STEP 3: Insert new BOM component
        const { data: newComponent, error: insertError } = await supabase_1.supabase
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
            logger_1.default.error('Supabase error inserting BOM component', { error: insertError });
            throw (0, errorHandler_1.createError)('Failed to add BOM component', 500);
        }
        logger_1.default.info('BOM component added successfully', { productCode, partCode });
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
    }
    catch (error) {
        logger_1.default.error('Error in addBomComponent', { error: error.message });
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to add BOM component"
        });
    }
};
exports.addBomComponent = addBomComponent;
// ============================================================================
// BLOCK 3: Update BOM Component
// ============================================================================
/**
 * Updates an existing BOM component
 * PATCH /api/products/:productCode/bom/:partCode
 */
const updateBomComponent = async (req, res) => {
    try {
        const { productCode, partCode } = req.params;
        const { partDescription, partType, perShipper } = req.body;
        logger_1.default.info('Updating BOM component', { productCode, partCode });
        // STEP 1: Get product UUID
        const { data: product, error: productError } = await supabase_1.supabase
            .from('products')
            .select('id')
            .eq('product_code', productCode)
            .single();
        if (productError || !product) {
            throw (0, errorHandler_1.createError)(`Product with code ${productCode} not found`, 404);
        }
        // STEP 2: Update the component
        const updateData = {};
        if (partDescription !== undefined)
            updateData.part_description = partDescription;
        if (partType !== undefined)
            updateData.part_type = partType;
        if (perShipper !== undefined)
            updateData.per_shipper = perShipper;
        const { data: updatedComponent, error: updateError } = await supabase_1.supabase
            .from('bom_components')
            .update(updateData)
            .eq('product_id', product.id)
            .eq('part_code', partCode)
            .select()
            .single();
        if (updateError) {
            if (updateError.code === 'PGRST116') {
                throw (0, errorHandler_1.createError)(`Component ${partCode} not found in BOM`, 404);
            }
            logger_1.default.error('Supabase error updating BOM component', { error: updateError });
            throw (0, errorHandler_1.createError)('Failed to update BOM component', 500);
        }
        logger_1.default.info('BOM component updated successfully', { productCode, partCode });
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
    }
    catch (error) {
        logger_1.default.error('Error in updateBomComponent', { error: error.message });
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to update BOM component"
        });
    }
};
exports.updateBomComponent = updateBomComponent;
// ============================================================================
// BLOCK 4: Delete BOM Component
// ============================================================================
/**
 * Deletes a BOM component from a product
 * DELETE /api/products/:productCode/bom/:partCode
 */
const deleteBomComponent = async (req, res) => {
    try {
        const { productCode, partCode } = req.params;
        logger_1.default.info('Deleting BOM component', { productCode, partCode });
        // STEP 1: Get product UUID
        const { data: product, error: productError } = await supabase_1.supabase
            .from('products')
            .select('id')
            .eq('product_code', productCode)
            .single();
        if (productError || !product) {
            throw (0, errorHandler_1.createError)(`Product with code ${productCode} not found`, 404);
        }
        // STEP 2: Delete the component
        const { error: deleteError } = await supabase_1.supabase
            .from('bom_components')
            .delete()
            .eq('product_id', product.id)
            .eq('part_code', partCode);
        if (deleteError) {
            logger_1.default.error('Supabase error deleting BOM component', { error: deleteError });
            throw (0, errorHandler_1.createError)('Failed to delete BOM component', 500);
        }
        logger_1.default.info('BOM component deleted successfully', { productCode, partCode });
        res.status(200).json({
            success: true,
            message: `Component ${partCode} deleted successfully`
        });
    }
    catch (error) {
        logger_1.default.error('Error in deleteBomComponent', { error: error.message });
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to delete BOM component"
        });
    }
};
exports.deleteBomComponent = deleteBomComponent;
