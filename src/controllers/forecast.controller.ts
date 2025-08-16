// BLOCK 1: Imports
import { Request, Response } from 'express';
import xlsx from 'xlsx';
import { supabase } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import logger from '../utils/logger';
import { createError } from '../middleware/errorHandler';

// BLOCK 2: `uploadForecasts` Controller Function
export const uploadForecasts = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw createError('No file uploaded.', 400);
  }

  // 1. Read the Excel file from buffer
  const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data: any[][] = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

  // 2. Intelligently find the header row
  let headerRowIndex = -1;
  let maxScore = -1;

  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (!Array.isArray(row) || row.length === 0) continue;
    const density = row.filter(cell => cell != null && cell !== '').length / row.length;
    const datePatternMatch = row.filter(
      cell => typeof cell === 'string' && /^[A-Za-z]{3}-\d{2}$/.test(cell)
    ).length;
    const score = (density * 2) + datePatternMatch;
    if (score > maxScore) {
      maxScore = score;
      headerRowIndex = i;
    }
  }

  if (headerRowIndex === -1) {
    throw createError('Could not determine header row in the file.', 400);
  }

  const headers = data[headerRowIndex];
  const dataRows = data.slice(headerRowIndex + 1);

  // 3. Clear existing data from the `forecasts` table
  logger.info('Deleting existing forecast records...');
  const { error: deleteError } = await supabase.from('forecasts').delete().neq('id', 0);
  if (deleteError) {
      logger.error('Supabase error deleting old forecasts', { error: deleteError });
      throw createError('Failed to clear old forecast data.', 500);
  }
  
  // 4. Prepare product data for upsert
  const productsToUpsert: { product_code: string; description?: string }[] = [];
  const codeToRowMap = new Map<string, any[]>();

  const codeHeader = headers.find(h => h && h.toLowerCase().includes('product'));
  const descHeader = headers.find(h => h && h.toLowerCase().includes('description'));
  
  if (!codeHeader) {
    throw createError("A column with 'Product' in the name is required.", 400);
  }

  dataRows.forEach(row => {
    const rowData: { [key: string]: any } = {};
    headers.forEach((header, i) => { rowData[header] = row[i]; });
    const codeValue = rowData[codeHeader];
    if (codeValue && codeValue.toString().trim() !== '') {
      productsToUpsert.push({
        product_code: codeValue.toString(),
        description: rowData[descHeader],
      });
      codeToRowMap.set(codeValue.toString(), row);
    }
  });

  logger.info(`Upserting ${productsToUpsert.length} products...`);
  const { data: upsertedProducts, error: productError } = await supabase
    .from('products')
    .upsert(productsToUpsert, { onConflict: 'product_code' })
    .select('id, product_code');

  if (productError) {
      logger.error('Supabase error upserting products', { error: productError });
      throw createError('Failed to upsert product data.', 500);
  }

  // 5. Prepare and insert forecast data
  const forecastsToInsert: { product_id: string; forecast_date: string; quantity: number }[] = [];
  const productIdMap = new Map<string, string>(upsertedProducts.map(p => [p.product_code, p.id]));

  for (const product of upsertedProducts) {
    const originalRow = codeToRowMap.get(product.product_code);
    if (!originalRow) continue;
    const rowData: { [key: string]: any } = {};
    headers.forEach((header, i) => { rowData[header] = originalRow[i]; });
    headers.forEach(header => {
      if (header && /^[A-Za-z]{3}-\d{2}$/.test(header)) {
        const quantity = parseInt(rowData[header], 10);
        if (!isNaN(quantity)) {
          const [monthStr, yearStr] = header.split('-');
          const month = new Date(Date.parse(monthStr +" 1, 2012")).getMonth();
          const year = 2000 + parseInt(yearStr);
          const forecastDate = new Date(year, month, 1).toISOString().split('T')[0];
          forecastsToInsert.push({
            product_id: productIdMap.get(product.product_code)!,
            forecast_date: forecastDate,
            quantity: quantity
          });
        }
      }
    });
  }
  
  logger.info(`Inserting ${forecastsToInsert.length} forecast records...`);
  if (forecastsToInsert.length > 0) {
    const { error: forecastError } = await supabase.from('forecasts').insert(forecastsToInsert);
    if (forecastError) {
        logger.error('Supabase error inserting forecasts', { error: forecastError });
        throw createError('Failed to insert new forecast data.', 500);
    }
  }

  res.status(201).json({ 
    success: true,
    message: `Forecast data imported successfully. ${upsertedProducts.length} products processed, ${forecastsToInsert.length} forecast entries created.` 
  });
});

// BLOCK 3: `getForecasts` Controller Function (FINAL, REVISED VERSION)
export const getForecasts = async (req: Request, res: Response) => {
  try {
    // The validation middleware has already cleaned and provided default values.
    const { months, search } = req.query;
    logger.info(`Fetching forecasts with filters: months=${months}, search=${search}`);

    // 1. Build the base query
    let query = supabase
      .from('forecasts')
      .select('quantity, forecast_date, products ( id, product_code, description )')
      .order('forecast_date', { ascending: true });

    // 2. Apply date filtering (now safe to use `months`)
    if (months && months !== 'all') {
      const numMonths = parseInt(months as string, 10);
      const today = new Date();
      const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      const endDate = new Date(today.getFullYear(), today.getMonth() + numMonths, 0).toISOString().split('T')[0];
      
      query = query.gte('forecast_date', startDate).lte('forecast_date', endDate);
    }

    // 3. Apply search filtering
    if (search) {
      query = query.ilike('products.description', `%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
      logger.error('Supabase error fetching forecasts', { error });
      throw createError('Failed to fetch forecast records from database', 500);
    }

    // 4. Pivot the data
    const productData: { [key: string]: any } = {};
    data.forEach(item => {
      const productInfo = item.products;
      if (!productInfo) return;
      const product = Array.isArray(productInfo) ? productInfo[0] : productInfo;
      if (!product) return;
      const { product_code, description } = product;
      const dateKey = item.forecast_date.substring(0, 7);
      if (!productData[product_code]) {
        productData[product_code] = { product_code, description };
      }
      productData[product_code][dateKey] = item.quantity;
    });
    const rows = Object.values(productData);
    
    // 5. Generate headers
    const dateHeaders = [...new Set(data.map(item => item.forecast_date.substring(0, 7)))].sort();
    const staticHeaders = [{ key: 'product_code', label: 'Product Code' }, { key: 'description', label: 'Description' }];
    const dynamicHeaders = dateHeaders.map(dateKey => {
      const [year, month] = dateKey.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      const label = date.toLocaleString('default', { month: 'short' }) + '-' + year.substring(2);
      return { key: dateKey, label: label };
    });
    const headers = [...staticHeaders, ...dynamicHeaders];

    // 6. Calculate summary
    const totalQuantity = data.reduce((sum, item) => sum + item.quantity, 0);
    const summary = {
      totalProducts: rows.length,
      totalMonths: dateHeaders.length,
      avgForecast: data.length > 0 ? totalQuantity / data.length : 0,
      topProduct: "N/A"
    };

    logger.info(`Successfully fetched and processed ${rows.length} forecast products.`);
    
    // 7. Send final response
    res.status(200).json({
      success: true, // Matching your SOH response format
      summary,
      tableData: { headers, rows }
    });

  } catch (error: any) {
    logger.error('Error in getForecasts', { error: error.message });
    res.status(error.statusCode || 500).json({ 
      success: false,
      message: error.message || "Failed to fetch forecast records"
    });
  }
};