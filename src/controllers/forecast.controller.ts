// src/controllers/forecast.controller.ts

// BLOCK 1: Imports
import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import logger from '../utils/logger';
import { createError } from '../middleware/errorHandler';

// ============== BLOCK 2: Helper Functions ==============

/**
 * Flexible date parser: Supports multiple Excel header formats
 * Formats supported:
 * - DD.MM.YYYY (e.g., "02.03.2026")
 * - MMM-YY / MMM-YYYY (e.g., "Jul-25", "Jul-2025")
 * - MMM YYYY (e.g., "Jul 2025")
 * - YYYY-MM (e.g., "2026-03")
 * 
 * @param header - The column header string from Excel
 * @returns ISO date string (YYYY-MM-DD) for first day of month, or null if unparseable
 */
const parseFlexibleDateHeader = (header: string): string | null => {
  if (typeof header !== 'string') return null;
  
  const cleanHeader = header.trim();
  
  // Pattern 1: DD.MM.YYYY (e.g., "02.03.2026")
  const ddMmYyyyMatch = cleanHeader.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ddMmYyyyMatch) {
    const [, day, month, year] = ddMmYyyyMatch;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) {
      // Return first day of that month for consistency
      return new Date(parseInt(year), parseInt(month) - 1, 1).toISOString().split('T')[0];
    }
  }
  
  // Pattern 2: MMM-YY / MMM-YYYY / MMM YYYY (e.g., "Jul-25", "Jul 2025")
  const monthNameMatch = cleanHeader.match(/^([a-z]{3})\s*[-\s/]*\s*(\d{2,4})$/i);
  if (monthNameMatch) {
    const [, monthStr, yearStr] = monthNameMatch;
    const monthMap: { [key: string]: number } = {
      'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
      'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };
    const month = monthMap[monthStr.toLowerCase()];
    if (month !== undefined) {
      let year = parseInt(yearStr);
      if (yearStr.length === 2) {
        year = 2000 + year;
      }
      const date = new Date(year, month, 1);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }
  }
  
  // Pattern 3: YYYY-MM (e.g., "2026-03")
  const yyyyMmMatch = cleanHeader.match(/^(\d{4})-(\d{2})$/);
  if (yyyyMmMatch) {
    const [, year, month] = yyyyMmMatch;
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  
  // If no pattern matches, return null (will be flagged for review)
  return null;
};

/**
 * Checks if a product code exists in the products table
 * @param productCode - The product code to validate
 * @returns Promise<boolean> - true if product exists
 */
const validateProductExists = async (productCode: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('product_code')
      .eq('product_code', productCode)
      .maybeSingle();
    
    if (error) {
      logger.warn('Error checking product existence', { productCode, error: error.message });
      // Fail open: assume product exists if we can't verify (avoids blocking imports)
      return true;
    }
    
    return data !== null;
  } catch (err) {
    logger.error('Exception in validateProductExists', { productCode, err });
    return true; // Fail open for safety
  }
};

// ============== BLOCK 3: Core Processing Function ==============

async function processJsonForecastData(jsonData: any[], importBatchId: string): Promise<{
  success: boolean;
  message: string;
  imported: number;
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
  logger.info('Processing JSON forecast data', { recordCount: jsonData.length, importBatchId });

  if (!jsonData || jsonData.length === 0) {
    throw createError('No data found in JSON.', 400);
  }

  const firstRow = jsonData[0];
  const headers = Object.keys(firstRow);
  logger.info('JSON headers detected', { headers });

  const productCodeHeader = headers.find(h => h.toLowerCase().trim() === 'product');
  const descriptionHeader = headers.find(h => h.toLowerCase().trim() === 'description');

  if (!productCodeHeader) {
    throw createError("Could not find a 'Product' column in the data.", 400);
  }

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

  // Track total date columns for response calculation
  let totalDateColumns = 0;
  let rowsWithDates = 0;

  for (let rowIndex = 0; rowIndex < jsonData.length; rowIndex++) {
    const row = jsonData[rowIndex];
    const productCode = row[productCodeHeader]?.toString().trim();
    const description = descriptionHeader ? (row[descriptionHeader]?.toString().trim() || '') : '';

    if (!productCode || productCode === '') continue;

    const rowForecasts: Record<string, number> = {};
    let hasValidDates = false;
    let hasInvalidDates = false;
    let dateColumnCount = 0;

    for (const header of headers) {
      if (header === productCodeHeader || header === descriptionHeader) continue;
      
      const headerStr = header.trim();
      const parsedDate = parseFlexibleDateHeader(headerStr);
      
      if (parsedDate) {
        const quantity = parseInt(row[header], 10);
        if (!isNaN(quantity) && quantity >= 0) {
          rowForecasts[parsedDate] = quantity;
          hasValidDates = true;
          dateColumnCount++;
        }
      } else {
        hasInvalidDates = true;
        logger.debug('Unparseable date header', { header: headerStr, row: rowIndex + 2 });
      }
    }

    const productExists = await validateProductExists(productCode);
    
    if (!productExists) {
      reviewItems.push({
        row_number: rowIndex + 2,
        product_code: productCode,
        description: description || '',
        forecast_values: rowForecasts,
        reason: 'unknown_product'
      });
      logger.info('Unknown product code flagged for review', { productCode, row: rowIndex + 2 });
      continue;
    }
    
    if (!hasValidDates && hasInvalidDates) {
      reviewItems.push({
        row_number: rowIndex + 2,
        product_code: productCode,
        description: description || '',
        forecast_values: rowForecasts,
        reason: 'invalid_date'
      });
      logger.info('Row with unparseable dates flagged for review', { productCode, row: rowIndex + 2 });
      continue;
    }

    for (const [forecastDate, quantity] of Object.entries(rowForecasts)) {
      forecastsToInsert.push({
        product_code: productCode,
        description: description,
        forecast_date: forecastDate,
        quantity: quantity,
        import_batch_id: importBatchId,
        is_active: true
      });
    }

    if (dateColumnCount > 0) {
      totalDateColumns += dateColumnCount;
      rowsWithDates++;
    }
  }

  if (forecastsToInsert.length > 0) {
    logger.info('Archiving previous active forecasts for updated product+date combinations');
    
    const uniqueCombinations = [...new Set(
      forecastsToInsert.map(f => `${f.product_code}|${f.forecast_date}`)
    )];
    
    for (const combo of uniqueCombinations) {
      const [productCode, forecastDate] = combo.split('|');
      
      const { error: archiveError } = await supabase.rpc('archive_forecasts_for_import', {
        p_product_code: productCode,
        p_forecast_date: forecastDate,
        p_new_batch_id: importBatchId
      });
      
      if (archiveError) {
        logger.error('Error archiving old forecasts', { productCode, forecastDate, error: archiveError });
      }
    }
  }

  logger.info(`Inserting ${forecastsToInsert.length} new forecast records`);
  if (forecastsToInsert.length > 0) {
    const { error: insertError } = await supabase.from('forecasts').insert(forecastsToInsert);
    
    if (insertError) {
      logger.error('Supabase error inserting forecasts', { error: insertError });
      throw createError('Failed to insert new forecast data.', 500);
    }
  }

  // Calculate imported row count (total records / avg columns per row)
  const avgColumnsPerRow = rowsWithDates > 0 ? totalDateColumns / rowsWithDates : 1;
  const importedRowCount = Math.round(forecastsToInsert.length / Math.max(1, avgColumnsPerRow));

  const response: any = {
    success: true,
    message: `Processed ${jsonData.length} rows. ${importedRowCount} forecasts imported.`,
    imported: importedRowCount,
    pending_review: reviewItems.length,
    review_items: reviewItems,
    debug: {
      source: 'json-data',
      import_batch_id: importBatchId,
      productColumn: productCodeHeader,
      descriptionColumn: descriptionHeader || 'Not found',
      dateFormatsSupported: ['DD.MM.YYYY', 'MMM-YY', 'MMM YYYY', 'YYYY-MM']
    }
  };

  if (reviewItems.length > 0) {
    response.message += ` ${reviewItems.length} items pending review.`;
    response.requires_review = true;
  }

  return response;
}

// ============== BLOCK 4: Upload Controller ==============

/**
 * POST /api/forecasts/upload
 * Handles forecast import with flexible date parsing and review flow
 */
export const uploadForecasts = asyncHandler(async (req: Request, res: Response) => {
  logger.info('Forecast upload request received', {
    bodyKeys: Object.keys(req.body),
    hasFile: !!req.file,
    contentType: req.headers['content-type']
  });

  // Validate request has data
  if (!req.body.data) {
    throw createError('No forecast data provided. Expected JSON string in "data" field.', 400);
  }

  // Parse JSON data
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

  // Generate unique batch ID for this import session
  const importBatchId = crypto.randomUUID();
  logger.info('Processing import batch', { importBatchId, recordCount: jsonData.length });

  // Process the data with review flow
  const result = await processJsonForecastData(jsonData, importBatchId);

  // Determine HTTP status code
  const statusCode = result.pending_review > 0 ? 202 : 201; // 202 = Accepted (needs review)
  
  return res.status(statusCode).json(result);
});

// ============== BLOCK 5: Review Finalization Controller ==============

/**
 * POST /api/forecasts/review
 * Finalizes forecast imports after user review/approval of unknown products
 * 
 * Request body:
 * {
 *   import_batch_id: string,
 *   approvals: Array<{
 *     product_code: string,
 *     action: 'create_placeholder' | 'map_to_existing' | 'skip',
 *     mapped_product_code?: string // if action is 'map_to_existing'
 *   }>
 * }
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
      // Create minimal placeholder product record
      const { error: productError } = await supabase
        .from('products')
        .insert({
          product_code: product_code,
          description: 'Imported Placeholder - Requires Review',
          active: false, // Mark as inactive until user fully configures
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
      // Update forecast records to use the mapped product code
      const { error: updateError } = await supabase
        .from('forecasts')
        .update({ product_code: mapped_product_code })
        .eq('product_code', product_code)
        .eq('import_batch_id', import_batch_id);

      if (updateError) {
        logger.error('Failed to map forecasts to existing product', { 
          from: product_code, 
          to: mapped_product_code, 
          error: updateError 
        });
        results.errors.push(`Failed to map ${product_code} to ${mapped_product_code}`);
        continue;
      }

      results.mapped_products++;
      logger.info('Mapped forecasts to existing product', { from: product_code, to: mapped_product_code });

    } else if (action === 'skip') {
      // Soft-delete the pending forecast records for this product
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

  // Return summary of actions taken
  return res.status(200).json({
    success: true,
    message: `Review finalized. Created: ${results.created_placeholders}, Mapped: ${results.mapped_products}, Skipped: ${results.skipped_rows}`,
    results,
    import_batch_id
  });
});

// ============== BLOCK 6: Fetch Controller ==============

/**
 * GET /api/forecasts
 * Fetches active forecast records with optional filtering
 * Only returns records where is_active = true by default
 */
export const getForecasts = async (req: Request, res: Response) => {
  try {
    const { months, search, include_inactive } = req.query;
    const includeInactive = include_inactive === 'true'; // Optional: allow fetching archived for audit
    
    logger.info('Fetching forecasts', { 
      months, 
      search, 
      include_inactive: includeInactive 
    });

    let query = supabase
      .from('forecasts')
      .select('product_code, description, quantity, forecast_date, import_batch_id, is_active')
      .order('forecast_date', { ascending: true });

    // Filter by active status by default (can be overridden for audit views)
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    // Date range filter
    if (months && months !== 'all') {
      const numMonths = parseInt(months as string, 10);
      if (!isNaN(numMonths)) {
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        const endDate = new Date(today.getFullYear(), today.getMonth() + numMonths, 0).toISOString().split('T')[0];
        query = query.gte('forecast_date', startDate).lte('forecast_date', endDate);
      }
    }

    // Search filter
    if (search && typeof search === 'string' && search.trim()) {
      query = query.ilike('description', `%${search.trim()}%`);
    }

    const { data, error } = await query;
    
    if (error) {
      logger.error('Supabase error fetching forecasts', { error });
      throw createError('Failed to fetch forecast records from database', 500);
    }

    // Transform flat records into pivoted table format
    const productData: { [key: string]: any } = {};
    
    for (const item of data || []) {
      const { product_code, description, forecast_date, quantity } = item;
      const dateKey = forecast_date.substring(0, 7); // YYYY-MM
      
      if (!productData[product_code]) {
        productData[product_code] = { 
          product_code, 
          description,
          // Include metadata for audit/history views if needed
          _metadata: {
            import_batch_id: item.import_batch_id,
            is_active: item.is_active
          }
        };
      }
      
      // Aggregate quantities if multiple records exist for same product+month
      const existing = productData[product_code][dateKey] || 0;
      productData[product_code][dateKey] = existing + quantity;
    }
    
    const rows = Object.values(productData);

    // Build dynamic headers from date columns
    const dateHeaders = [...new Set(
      (data || []).map((item: any) => item.forecast_date.substring(0, 7))
    )].sort();
    
    const staticHeaders = [
      { key: 'product_code', label: 'Product Code' },
      { key: 'description', label: 'Description' }
    ];
    
    const dynamicHeaders = dateHeaders.map(dateKey => {
      const [year, month] = dateKey.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      const label = date.toLocaleString('default', { month: 'short' }) + '-' + year.substring(2);
      return { key: dateKey, label: label };
    });
    
    const headers = [...staticHeaders, ...dynamicHeaders];
    
    // Calculate summary stats (only for active records)
    const activeData = (data || []).filter((item: any) => item.is_active);
    const totalQuantity = activeData.reduce((sum: number, item: any) => sum + item.quantity, 0);
    
    const summary = {
      totalProducts: rows.length,
      totalQuantity: totalQuantity,
      activeRecords: activeData.length,
      dateRange: dateHeaders.length > 0 
        ? `${dateHeaders[0]} to ${dateHeaders[dateHeaders.length - 1]}` 
        : 'No data'
    };

    logger.info('Successfully fetched forecasts', { 
      rowCount: rows.length, 
      activeRecords: activeData.length 
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