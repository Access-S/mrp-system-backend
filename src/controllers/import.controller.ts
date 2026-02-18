// src/controllers/import.controller.ts

import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import logger from '../utils/logger';
import { createError } from '../middleware/errorHandler';

// ============================================================================
// BLOCK 1: Interfaces
// ============================================================================
interface POImportRow {
  po_number: string;
  product_code: string;
  customer_name: string;
  ordered_qty_pieces: number;
  customer_amount: number;
  po_created_date: string;
  po_received_date: string;
  delivery_date?: string;
  delivery_number?: string;
  status?: string;
}

// ============================================================================
// BLOCK 2: Validate Import Data (Preview before import)
// ============================================================================
export const validateImportData = async (req: Request, res: Response) => {
  try {
    const { data: importData } = req.body;

    if (!importData || !Array.isArray(importData) || importData.length === 0) {
      throw createError('No data provided for validation', 400);
    }

    logger.info(`📋 Validating ${importData.length} rows for import`);

    // Fetch all products for validation
    const { data: products, error: productError } = await supabase
      .from('products')
      .select('product_code');

    if (productError) {
      throw createError('Failed to fetch products for validation', 500);
    }

    const productCodes = new Set((products || []).map(p => p.product_code));
    
    const validation = {
      totalRows: importData.length,
      validRows: 0,
      invalidRows: 0,
      missingProducts: [] as string[],
      duplicatePOs: [] as string[],
      errors: [] as { row: number; po_number: string; errors: string[] }[]
    };

    const seenPoNumbers = new Set<string>();

    // Check for existing PO numbers in database
    const poNumbers = importData.map((row: any) => row.po_number?.toString().trim()).filter(Boolean);
    const { data: existingPOs } = await supabase
      .from('purchase_orders')
      .select('po_number')
      .in('po_number', poNumbers);
    
    const existingPoNumbers = new Set((existingPOs || []).map(po => po.po_number));

    importData.forEach((row: any, index: number) => {
      const rowErrors: string[] = [];
      const rowNum = index + 2; // +2 for header row and 0-index
      const poNumber = row.po_number?.toString().trim() || '';

      // Required field validation
      if (!poNumber) rowErrors.push('Missing po_number');
      if (!row.product_code) rowErrors.push('Missing product_code');
      if (!row.customer_name) rowErrors.push('Missing customer_name');
      if (!row.ordered_qty_pieces && row.ordered_qty_pieces !== 0) rowErrors.push('Missing ordered_qty_pieces');
      if (!row.customer_amount && row.customer_amount !== 0) rowErrors.push('Missing customer_amount');
      if (!row.po_created_date) rowErrors.push('Missing po_created_date');
      if (!row.po_received_date) rowErrors.push('Missing po_received_date');

      // Check if product exists
      if (row.product_code && !productCodes.has(row.product_code.toString())) {
        rowErrors.push(`Product "${row.product_code}" not found`);
        if (!validation.missingProducts.includes(row.product_code.toString())) {
          validation.missingProducts.push(row.product_code.toString());
        }
      }

      // Check for duplicate PO numbers in import file
      if (poNumber) {
        if (seenPoNumbers.has(poNumber)) {
          rowErrors.push(`Duplicate PO number in file`);
          if (!validation.duplicatePOs.includes(poNumber)) {
            validation.duplicatePOs.push(poNumber);
          }
        }
        seenPoNumbers.add(poNumber);

        // Check if PO already exists in database
        if (existingPoNumbers.has(poNumber)) {
          rowErrors.push(`PO already exists in database`);
        }
      }

      if (rowErrors.length > 0) {
        validation.invalidRows++;
        validation.errors.push({ row: rowNum, po_number: poNumber, errors: rowErrors });
      } else {
        validation.validRows++;
      }
    });

    logger.info(`✅ Validation complete: ${validation.validRows} valid, ${validation.invalidRows} invalid`);

    res.status(200).json({
      success: true,
      data: validation
    });

  } catch (error: any) {
    logger.error('❌ Error validating import data', { error: error.message });
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to validate import data'
    });
  }
};

// ============================================================================
// BLOCK 3: Bulk Import Purchase Orders
// ============================================================================
export const bulkImportPurchaseOrders = async (req: Request, res: Response) => {
  try {
    const { data: importData, skipInvalid = true } = req.body;

    if (!importData || !Array.isArray(importData) || importData.length === 0) {
      throw createError('No data provided for import', 400);
    }

    logger.info(`📦 Starting bulk import of ${importData.length} purchase orders`);

    // Fetch all products for mapping
    const { data: products, error: productError } = await supabase
      .from('products')
      .select('id, product_code, units_per_shipper, price_per_shipper, description, hourly_run_rate, mins_per_shipper');

    if (productError) {
      throw createError('Failed to fetch products', 500);
    }

    // Create product lookup map
    const productMap = new Map<string, any>();
    (products || []).forEach(p => {
      productMap.set(p.product_code, p);
    });

    logger.info(`📋 Loaded ${productMap.size} products for mapping`);

    // Results tracking
    const result = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [] as { row: number; po_number: string; error: string }[]
    };

    // Process each row and build insert array
    const recordsToInsert: any[] = [];
    let currentSequence = 0;

    // Sort by po_received_date to assign sequence correctly
    const sortedData = [...importData].sort((a, b) => {
      const dateA = new Date(a.po_received_date || '1970-01-01');
      const dateB = new Date(b.po_received_date || '1970-01-01');
      return dateA.getTime() - dateB.getTime();
    });

    for (let i = 0; i < sortedData.length; i++) {
      const row = sortedData[i];
      const rowNum = i + 2;

      try {
        const poNumber = row.po_number?.toString().trim();
        const productCode = row.product_code?.toString().trim();

        // Skip if missing required fields
        if (!poNumber || !productCode || !row.customer_name) {
          if (skipInvalid) {
            result.skipped++;
            continue;
          } else {
            throw new Error('Missing required fields');
          }
        }

        // Look up product
        const product = productMap.get(productCode);
        if (!product) {
          if (skipInvalid) {
            result.skipped++;
            result.errors.push({ row: rowNum, po_number: poNumber, error: `Product "${productCode}" not found` });
            continue;
          } else {
            throw new Error(`Product "${productCode}" not found`);
          }
        }

        // Calculate derived values
        const orderedQtyPieces = Number(row.ordered_qty_pieces) || 0;
        const unitsPerShipper = product.units_per_shipper || 1;
        const orderedQtyShippers = Math.ceil(orderedQtyPieces / unitsPerShipper);
        const systemAmount = Math.round(orderedQtyShippers * (product.price_per_shipper || 0) * 100) / 100;
        const customerAmount = Number(row.customer_amount) || 0;

        // Determine status
        let currentStatus = row.status?.trim() || 'Open';
        
        // Normalize status
        if (currentStatus.toLowerCase().includes('complete') || currentStatus.toLowerCase().includes('despatch')) {
          currentStatus = 'Completed';
        } else if (currentStatus.toLowerCase().includes('cancel')) {
          currentStatus = 'PO Cancelled';
        } else if (currentStatus.toLowerCase().includes('wip')) {
          currentStatus = 'WIP Called';
        } else if (currentStatus.toLowerCase() === 'open') {
          currentStatus = 'Open';
        }

        // Check for PO Check status (amount mismatch > $5)
        if (currentStatus === 'Open' && Math.abs(customerAmount - systemAmount) > 5) {
          currentStatus = 'PO Check';
        }

        currentSequence++;

        // Build record
        const record = {
          po_number: poNumber,
          product_id: product.id,
          customer_name: row.customer_name.trim(),
          po_created_date: row.po_created_date || null,
          po_received_date: row.po_received_date || null,
          requested_delivery_date: null,
          ordered_qty_pieces: orderedQtyPieces,
          ordered_qty_shippers: orderedQtyShippers,
          customer_amount: customerAmount,
          system_amount: systemAmount,
          current_status: currentStatus,
          delivery_date: row.delivery_date || null,
          delivery_docket_number: row.delivery_number?.toString() || null,
          sequence: currentSequence,
          description: product.description,
          hourly_run_rate: product.hourly_run_rate,
          mins_per_shipper: product.mins_per_shipper
        };

        recordsToInsert.push({ record, status: currentStatus, rowNum, poNumber });

      } catch (err: any) {
        result.failed++;
        result.errors.push({
          row: rowNum,
          po_number: row.po_number || 'Unknown',
          error: err.message
        });
      }
    }

    // Bulk insert in batches
    const batchSize = 50;
    for (let i = 0; i < recordsToInsert.length; i += batchSize) {
      const batch = recordsToInsert.slice(i, i + batchSize);
      const records = batch.map(b => b.record);

      const { data: insertedPOs, error: insertError } = await supabase
        .from('purchase_orders')
        .insert(records)
        .select('id, po_number, current_status');

      if (insertError) {
        logger.error('Batch insert error', { error: insertError, batchStart: i });
        batch.forEach(b => {
          result.failed++;
          result.errors.push({ row: b.rowNum, po_number: b.poNumber, error: insertError.message });
        });
      } else {
        result.success += batch.length;

        // Insert status history for each PO
        if (insertedPOs && insertedPOs.length > 0) {
          const statusRecords = insertedPOs.map(po => ({
            po_id: po.id,
            status: po.current_status || 'Open'
          }));

          const { error: statusError } = await supabase
            .from('po_status_history')
            .insert(statusRecords);

          if (statusError) {
            logger.warn('Status history insert error (non-critical)', { error: statusError });
          }
        }
      }
    }

    logger.info(`✅ Import completed: ${result.success} success, ${result.failed} failed, ${result.skipped} skipped`);

    res.status(200).json({
      success: true,
      data: result,
      message: `Import completed: ${result.success} imported, ${result.failed} failed, ${result.skipped} skipped`
    });

  } catch (error: any) {
    logger.error('❌ Error in bulk import', { error: error.message });
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to import purchase orders'
    });
  }
};

// ============================================================================
// BLOCK 4: Get Import Template
// ============================================================================
export const getImportTemplate = async (req: Request, res: Response) => {
  const template = {
    headers: [
      'po_number',
      'product_code',
      'customer_name',
      'ordered_qty_pieces',
      'customer_amount',
      'po_created_date',
      'po_received_date',
      'delivery_date',
      'delivery_number',
      'status'
    ],
    sampleRow: {
      po_number: '3001962377',
      product_code: '43606072',
      customer_name: 'Kenvue',
      ordered_qty_pieces: 7776,
      customer_amount: 3393.45,
      po_created_date: '2025-08-18',
      po_received_date: '2025-08-19',
      delivery_date: '2025-09-02',
      delivery_number: '16368',
      status: 'Completed'
    },
    statusOptions: ['Open', 'Completed', 'PO Cancelled', 'WIP Called', 'PO Check'],
    notes: [
      'Dates must be in YYYY-MM-DD format',
      'customer_amount should be a number without currency symbols',
      'product_code must exist in the products table',
      'Empty delivery_date and delivery_number are allowed'
    ]
  };

  res.status(200).json({
    success: true,
    data: template
  });
};