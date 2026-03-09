// src/controllers/forecast.controller.ts

// ============== BLOCK 1: Imports ==============
import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import logger from '../utils/logger';
import { createError } from '../middleware/errorHandler';

// ============== BLOCK 2: Helper Functions ==============

/**
 * Parses DD.MM.YYYY format to YYYY-MM-DD (ISO date string)
 * This is the ONLY supported format for weekly forecasts
 * 
 * @param header - The column header string from Excel (e.g., "02.03.2026")
 * @returns ISO date string (YYYY-MM-DD), or null if unparseable
 */
const parseWeeklyDateHeader = (header: string): string | null => {
  if (typeof header !== 'string') return null;
  
  const cleanHeader = header.trim();
  
  // Pattern: DD.MM.YYYY (e.g., "02.03.2026")
  const ddMmYyyyMatch = cleanHeader.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ddMmYyyyMatch) {
    const [, day, month, year] = ddMmYyyyMatch;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]; // Returns YYYY-MM-DD
    }
  }
  
  // Also support YYYY-MM-DD format (in case data is already formatted)
  const yyyyMmDdMatch = cleanHeader.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyyMmDdMatch) {
    const [, year, month, day] = yyyyMmDdMatch;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  
  return null;
};

/**
 * Batch validates product codes - returns Set of existing product codes
 * @param productCodes - Array of product codes to validate
 * @returns Promise<Set<string>> - Set of existing product codes
 */
const batchValidateProducts = async (productCodes: string[]): Promise<Set<string>> => {
  try {
    const uniqueCodes = [...new Set(productCodes)];
    
    if (uniqueCodes.length === 0) {
      return new Set();
    }
    
    const { data, error } = await supabase
      .from('products')
      .select('product_code')
      .in('product_code', uniqueCodes);
    
    if (error) {
      logger.warn('Error batch validating products', { error: error.message });
      // Fail open: return all codes as existing to avoid blocking imports
      return new Set(uniqueCodes);
    }
    
    return new Set((data || []).map(p => p.product_code));
  } catch (err) {
    logger.error('Exception in batchValidateProducts', { err });
    return new Set(productCodes); // Fail open
  }
};

// ============== BLOCK 3: Core Processing Function ==============

async function processWeeklyForecastData(jsonData: any[], importBatchId: string): Promise<{
  success: boolean;
  message: string;
  imported: number;
  skipped: number;
  pending_review: number;
  review_items: Array<{
    row_number: number;
    product_code: string;
    description: string;
    forecast_values: Record<string, number>;
    reason: 'unknown_product' | 'invalid_date';
  }>;
  debug?: any;
}> {
  const startTime = Date.now();
  logger.info('Processing weekly forecast data', { recordCount: jsonData.length, importBatchId });

  if (!jsonData || jsonData.length === 0) {
    throw createError('No data found in JSON.', 400);
  }

  const firstRow = jsonData[0];
  const headers = Object.keys(firstRow);
  logger.info('Headers detected', { headerCount: headers.length });

  // Find required columns
  const productCodeHeader = headers.find(h => h.toLowerCase().trim() === 'product');
  const descriptionHeader = headers.find(h => h.toLowerCase().trim() === 'description');

  if (!productCodeHeader) {
    throw createError("Could not find a 'Product' column in the data.", 400);
  }

  // Parse all date headers upfront
  const dateHeaderMap: Map<string, string> = new Map(); // Excel header -> ISO date
  for (const header of headers) {
    if (header === productCodeHeader || header === descriptionHeader) continue;
    const parsedDate = parseWeeklyDateHeader(header);
    if (parsedDate) {
      dateHeaderMap.set(header, parsedDate);
    }
  }

  logger.info('Date columns parsed', { 
    totalHeaders: headers.length, 
    dateColumns: dateHeaderMap.size,
    sampleDates: Array.from(dateHeaderMap.values()).slice(0, 5)
  });

  if (dateHeaderMap.size === 0) {
    throw createError('No valid date columns found. Expected format: DD.MM.YYYY (e.g., 02.03.2026)', 400);
  }

  // Extract all product codes for batch validation
  const allProductCodes = jsonData
    .map(row => row[productCodeHeader]?.toString().trim())
    .filter(code => code && code !== '');

  // Batch validate all products in ONE query
  logger.info('Batch validating products', { count: allProductCodes.length });
  const existingProducts = await batchValidateProducts(allProductCodes);
  logger.info('Product validation complete', { 
    total: allProductCodes.length, 
    existing: existingProducts.size 
  });

  // Process rows
  const forecastsToInsert: Array<{
    product_code: string;
    description: string;
    forecast_date: string;
    quantity: number;
    import_batch_id: string;
    is_active: boolean;
  }> = [];
  
  const reviewItems: Array<{
    row_number: number;
    product_code: string;
    description: string;
    forecast_values: Record<string, number>;
    reason: 'unknown_product' | 'invalid_date';
  }> = [];

  let skippedRows = 0;

  for (let rowIndex = 0; rowIndex < jsonData.length; rowIndex++) {
    const row = jsonData[rowIndex];
    const productCode = row[productCodeHeader]?.toString().trim();
    const description = descriptionHeader ? (row[descriptionHeader]?.toString().trim() || '') : '';

    // Skip empty rows
    if (!productCode || productCode === '') {
      skippedRows++;
      continue;
    }

    // Check if product exists
    if (!existingProducts.has(productCode)) {
      const rowForecasts: Record<string, number> = {};
      for (const [excelHeader, isoDate] of dateHeaderMap) {
        const quantity = parseInt(row[excelHeader], 10);
        if (!isNaN(quantity) && quantity >= 0) {
          rowForecasts[isoDate] = quantity;
        }
      }
      
      reviewItems.push({
        row_number: rowIndex + 2, // +2 for header row and 0-indexing
        product_code: productCode,
        description: description,
        forecast_values: rowForecasts,
        reason: 'unknown_product'
      });
      continue;
    }

    // Extract forecast values for each date column
    for (const [excelHeader, isoDate] of dateHeaderMap) {
      const rawValue = row[excelHeader];
      const quantity = parseInt(rawValue, 10);
      
      // Only insert non-zero, valid quantities
      if (!isNaN(quantity) && quantity >= 0) {
        forecastsToInsert.push({
          product_code: productCode,
          description: description,
          forecast_date: isoDate,
          quantity: quantity,
          import_batch_id: importBatchId,
          is_active: true
        });
      }
    }
  }

  logger.info('Data processing complete', { 
    recordsToInsert: forecastsToInsert.length,
    reviewItems: reviewItems.length,
    skippedRows
  });

  // Archive old forecasts in ONE batch query
  if (forecastsToInsert.length > 0) {
    const productCodesToArchive = [...new Set(forecastsToInsert.map(f => f.product_code))];
    const datesToArchive = [...new Set(forecastsToInsert.map(f => f.forecast_date))];
    
    logger.info('Archiving old forecasts', { 
      products: productCodesToArchive.length, 
      dates: datesToArchive.length 
    });

    const { error: archiveError } = await supabase
      .from('forecasts')
      .update({ 
        is_active: false, 
        archived_at: new Date().toISOString() 
      })
      .in('product_code', productCodesToArchive)
      .in('forecast_date', datesToArchive)
      .eq('is_active', true)
      .neq('import_batch_id', importBatchId);

    if (archiveError) {
      logger.warn('Error archiving old forecasts (non-fatal)', { error: archiveError.message });
    }
  }

  // Insert new forecasts in chunks to avoid payload limits
  const CHUNK_SIZE = 500;
  let insertedCount = 0;

  for (let i = 0; i < forecastsToInsert.length; i += CHUNK_SIZE) {
    const chunk = forecastsToInsert.slice(i, i + CHUNK_SIZE);
    
    const { error: insertError } = await supabase
      .from('forecasts')
      .insert(chunk);
    
    if (insertError) {
      logger.error('Error inserting forecast chunk', { 
        chunkIndex: Math.floor(i / CHUNK_SIZE),
        error: insertError.message 
      });
      throw createError(`Failed to insert forecast data: ${insertError.message}`, 500);
    }
    
    insertedCount += chunk.length;
  }

  const duration = Date.now() - startTime;
  logger.info('Forecast import complete', { 
    insertedRecords: insertedCount,
    reviewItems: reviewItems.length,
    durationMs: duration
  });

  // Calculate unique products imported
  const uniqueProductsImported = new Set(forecastsToInsert.map(f => f.product_code)).size;

  return {
    success: true,
    message: `Imported ${insertedCount} weekly forecast records for ${uniqueProductsImported} products.`,
    imported: uniqueProductsImported,
    skipped: skippedRows,
    pending_review: reviewItems.length,
    review_items: reviewItems,
    debug: {
      import_batch_id: importBatchId,
      total_records: insertedCount,
      unique_products: uniqueProductsImported,
      date_columns: dateHeaderMap.size,
      duration_ms: duration
    }
  };
}

// ============== BLOCK 4: Upload Controller ==============

/**
 * POST /api/forecasts/upload
 * Handles weekly forecast import with batch processing for performance
 */
export const uploadForecasts = asyncHandler(async (req: Request, res: Response) => {
  logger.info('Forecast upload request received', {
    hasData: !!req.body.data,
    hasFile: !!req.file
  });

  if (!req.body.data) {
    throw createError('No forecast data provided. Expected JSON string in "data" field.', 400);
  }

  let jsonData: any[];
  try {
    jsonData = JSON.parse(req.body.data);
    if (!Array.isArray(jsonData) || jsonData.length === 0) {
      throw createError('Invalid or empty forecast data array.', 400);
    }
  } catch (parseError: any) {
    logger.error('JSON parse error', { error: parseError.message });
    throw createError(`Invalid JSON format: ${parseError.message}`, 400);
  }

  const importBatchId = crypto.randomUUID();
  logger.info('Starting import batch', { importBatchId, rowCount: jsonData.length });

  const result = await processWeeklyForecastData(jsonData, importBatchId);

  const statusCode = result.pending_review > 0 ? 202 : 201;
  return res.status(statusCode).json(result);
});

// ============== BLOCK 5: Review Finalization Controller ==============

/**
 * POST /api/forecasts/review
 * Finalizes forecast imports after user review/approval of unknown products
 */
export const finalizeForecastReview = asyncHandler(async (req: Request, res: Response) => {
  const { import_batch_id, approvals } = req.body;

  if (!import_batch_id || !Array.isArray(approvals)) {
    throw createError('Missing required fields: import_batch_id and approvals array', 400);
  }

  logger.info('Finalizing forecast review', { import_batch_id, approvalCount: approvals.length });

  const results = {
    created_placeholders: 0,
    mapped_products: 0,
    skipped_rows: 0,
    errors: [] as string[]
  };

  for (const approval of approvals) {
    const { product_code, action, mapped_product_code } = approval;

    if (action === 'create_placeholder') {
      const { error: productError } = await supabase
        .from('products')
        .insert({
          product_code: product_code,
          description: 'Imported Placeholder - Requires Review',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (productError) {
        logger.error('Failed to create placeholder product', { product_code, error: productError });
        results.errors.push(`Failed to create placeholder for ${product_code}`);
        continue;
      }

      results.created_placeholders++;
      logger.info('Created placeholder product', { product_code });

    } else if (action === 'map_to_existing' && mapped_product_code) {
      const { error: updateError } = await supabase
        .from('forecasts')
        .update({ product_code: mapped_product_code })
        .eq('product_code', product_code)
        .eq('import_batch_id', import_batch_id);

      if (updateError) {
        logger.error('Failed to map forecasts', { from: product_code, to: mapped_product_code, error: updateError });
        results.errors.push(`Failed to map ${product_code} to ${mapped_product_code}`);
        continue;
      }

      results.mapped_products++;
      logger.info('Mapped forecasts', { from: product_code, to: mapped_product_code });

    } else if (action === 'skip') {
      const { error: deleteError } = await supabase
        .from('forecasts')
        .update({ is_active: false, archived_at: new Date().toISOString() })
        .eq('product_code', product_code)
        .eq('import_batch_id', import_batch_id);

      if (deleteError) {
        logger.error('Failed to skip forecast records', { product_code, error: deleteError });
        results.errors.push(`Failed to skip records for ${product_code}`);
        continue;
      }

      results.skipped_rows++;
      logger.info('Skipped forecast records', { product_code });
    }
  }

  return res.status(200).json({
    success: true,
    message: `Review finalized. Created: ${results.created_placeholders}, Mapped: ${results.mapped_products}, Skipped: ${results.skipped_rows}`,
    results,
    import_batch_id
  });
});

// ============== BLOCK 6: Fetch Controller (Weekly Data) ==============

/**
 * GET /api/forecasts
 * Fetches active weekly forecast records
 * Returns data in a pivoted format with actual weekly dates as columns
 */
export const getForecasts = async (req: Request, res: Response) => {
  try {
    const { weeks, search, include_inactive } = req.query;
    const includeInactive = include_inactive === 'true';
    const weekCount = parseInt(weeks as string, 10) || 52; // Default to 52 weeks
    
    logger.info('Fetching weekly forecasts', { weeks: weekCount, search, include_inactive: includeInactive });

    let query = supabase
      .from('forecasts')
      .select('product_code, description, quantity, forecast_date, import_batch_id, is_active')
      .order('forecast_date', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    // Search filter
    if (search && typeof search === 'string' && search.trim()) {
      query = query.or(`product_code.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%`);
    }

    const { data, error } = await query;
    
    if (error) {
      logger.error('Supabase error fetching forecasts', { error });
      throw createError('Failed to fetch forecast records', 500);
    }

    // Get unique dates and sort them
    const allDates = [...new Set((data || []).map((item: any) => item.forecast_date))].sort();
    
    // Transform flat records into pivoted table format (product rows with date columns)
    const productData: { [key: string]: any } = {};
    
    for (const item of data || []) {
      const { product_code, description, forecast_date, quantity } = item;
      
      if (!productData[product_code]) {
        productData[product_code] = { 
          product_code, 
          description
        };
      }
      
      // Use the actual date as the key (YYYY-MM-DD format)
      productData[product_code][forecast_date] = quantity;
    }
    
    const rows = Object.values(productData);

    // Build headers with actual weekly dates
    const staticHeaders = [
      { key: 'product_code', label: 'Product Code' },
      { key: 'description', label: 'Description' }
    ];
    
    // Format date headers for display (e.g., "02 Mar")
    const dateHeaders = allDates.map(dateStr => {
      const date = new Date(dateStr + 'T00:00:00');
      const day = date.getDate().toString().padStart(2, '0');
      const month = date.toLocaleString('en-US', { month: 'short' });
      const year = date.getFullYear();
      return { 
        key: dateStr, 
        label: `${day} ${month} ${year}`
      };
    });
    
    const headers = [...staticHeaders, ...dateHeaders];
    
    // Calculate summary
    const activeData = (data || []).filter((item: any) => item.is_active);
    const totalQuantity = activeData.reduce((sum: number, item: any) => sum + item.quantity, 0);
    
    const summary = {
      totalProducts: rows.length,
      totalQuantity: totalQuantity,
      totalWeeks: allDates.length,
      dateRange: allDates.length > 0 
        ? `${allDates[0]} to ${allDates[allDates.length - 1]}` 
        : 'No data'
    };

    logger.info('Successfully fetched weekly forecasts', { 
      products: rows.length, 
      weeks: allDates.length,
      records: activeData.length
    });

    return res.status(200).json({
      success: true,
      summary,
      tableData: { headers, rows }
    });

  } catch (error: any) {
    logger.error('Error in getForecasts', { error: error.message });
    
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch forecast records",
      code: error.code || 'INTERNAL_ERROR'
    });
  }
};