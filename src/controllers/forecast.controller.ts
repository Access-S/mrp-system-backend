// src/controllers/forecast.controller.ts

// BLOCK 1: Imports
import { Request, Response } from 'express';
import xlsx from 'xlsx';
import { supabase } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import logger from '../utils/logger';
import { createError } from '../middleware/errorHandler';

// BLOCK 2: `uploadForecasts` Controller (SIMPLIFIED LOGIC)
export const uploadForecasts = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw createError('No file uploaded.', 400);
  }

  // 1. Read and parse the Excel file
  const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data: any[][] = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

  // (Intelligent header finding logic remains the same)
  let headerRowIndex = -1;
  let maxScore = -1;
  for (let i = 0; i < Math.min(10, data.length); i++) { /* ... your header logic ... */ }
  if (headerRowIndex === -1) { /* ... your error handling ... */ }
  const headers = data[headerRowIndex];
  const dataRows = data.slice(headerRowIndex + 1);

  // 2. Clear existing data from the `forecasts` table
  logger.info('Deleting existing forecast records...');
  const { error: deleteError } = await supabase.from('forecasts').delete().neq('id', 0); // Using a non-null field
  if (deleteError) {
    logger.error('Supabase error deleting old forecasts', { error: deleteError });
    throw createError('Failed to clear old forecast data.', 500);
  }
  
  // 3. Prepare forecast data for direct insertion
  const forecastsToInsert: { 
    product_code: string; 
    description: string; 
    forecast_date: string; 
    quantity: number 
  }[] = [];
  
  const codeHeader = headers.find(h => h && h.toLowerCase().includes('product'));
  const descHeader = headers.find(h => h && h.toLowerCase().includes('description'));
  if (!codeHeader) throw createError("A column with 'Product' in the name is required.", 400);

  dataRows.forEach(row => {
    const rowData: { [key: string]: any } = {};
    headers.forEach((header, i) => { rowData[header] = row[i]; });
    
    const productCode = rowData[codeHeader]?.toString();
    const description = rowData[descHeader]?.toString() || '';
    
    if (productCode) {
      headers.forEach(header => {
        if (header && /^[A-Za-z]{3}-\d{2}$/.test(header)) {
          const quantity = parseInt(rowData[header], 10);
          if (!isNaN(quantity)) {
            const [monthStr, yearStr] = header.split('-');
            const month = new Date(Date.parse(monthStr +" 1, 2012")).getMonth();
            const year = 2000 + parseInt(yearStr);
            const forecastDate = new Date(year, month, 1).toISOString().split('T')[0];
            
            forecastsToInsert.push({
              product_code: productCode,
              description: description,
              forecast_date: forecastDate,
              quantity: quantity
            });
          }
        }
      });
    }
  });
  
  // 4. Insert all new forecast data in one go
  logger.info(`Inserting ${forecastsToInsert.length} new forecast records...`);
  if (forecastsToInsert.length > 0) {
    const { error: forecastError } = await supabase.from('forecasts').insert(forecastsToInsert);
    if (forecastError) {
      logger.error('Supabase error inserting new forecasts', { error: forecastError });
      throw createError('Failed to insert new forecast data.', 500);
    }
  }

  res.status(201).json({ 
    success: true,
    message: `Forecast data imported successfully. ${forecastsToInsert.length} forecast entries created.` 
  });
});

// BLOCK 3: `getForecasts` Controller (SIMPLIFIED LOGIC)
export const getForecasts = async (req: Request, res: Response) => {
  try {
    const { months, search } = req.query;
    logger.info(`Fetching forecasts with filters: months=${months}, search=${search}`);

    // 1. Build a much simpler base query (no joins!)
    let query = supabase
      .from('forecasts')
      .select('product_code, description, quantity, forecast_date')
      .order('forecast_date', { ascending: true });

    // 2. Apply date filtering (no change here)
    if (months && months !== 'all') {
      const numMonths = parseInt(months as string, 10);
      const today = new Date();
      const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      const endDate = new Date(today.getFullYear(), today.getMonth() + numMonths, 0).toISOString().split('T')[0];
      query = query.gte('forecast_date', startDate).lte('forecast_date', endDate);
    }

    // 3. Apply a simpler search filter (no joins!)
    if (search) {
      query = query.ilike('description', `%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
      logger.error('Supabase error fetching forecasts', { error });
      throw createError('Failed to fetch forecast records from database', 500);
    }

    // 4. Pivot the data (no change in logic here, it just works on the simpler data)
    const productData: { [key: string]: any } = {};
    data.forEach(item => {
      const { product_code, description } = item;
      const dateKey = item.forecast_date.substring(0, 7);
      if (!productData[product_code]) {
        productData[product_code] = { product_code, description };
      }
      productData[product_code][dateKey] = item.quantity;
    });
    const rows = Object.values(productData);
    
    // (The rest of the function for generating headers and summary remains the same)
    const dateHeaders = [...new Set(data.map(item => item.forecast_date.substring(0, 7)))].sort();
    const staticHeaders = [{ key: 'product_code', label: 'Product Code' }, { key: 'description', label: 'Description' }];
    const dynamicHeaders = dateHeaders.map(dateKey => {
      const [year, month] = dateKey.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      const label = date.toLocaleString('default', { month: 'short' }) + '-' + year.substring(2);
      return { key: dateKey, label: label };
    });
    const headers = [...staticHeaders, ...dynamicHeaders];
    const totalQuantity = data.reduce((sum, item) => sum + item.quantity, 0);
    const summary = { /* ... */ };

    logger.info(`Successfully fetched and processed ${rows.length} forecast products.`);
    
    res.status(200).json({
      success: true,
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
