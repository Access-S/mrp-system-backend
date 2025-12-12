// src/controllers/forecast.controller.ts

// BLOCK 1: Imports
import { Request, Response } from 'express';
import xlsx from 'xlsx';
import { supabase } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import logger from '../utils/logger';
import { createError } from '../middleware/errorHandler';


// BLOCK 2: `uploadForecasts` Controller (FIXED HEADER DETECTION)
export const uploadForecasts = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw createError('No file uploaded.', 400);
  }

  // 1. Read and parse the Excel file
  const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Use header: 1 to get raw array, not JSON
  const data: any[][] = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

  // DEBUG: Log first few rows to see actual data
  logger.info('Excel raw data first 3 rows:', data.slice(0, 3));

  // Find header row (more flexible search)
  let headerRowIndex = -1;
  let maxScore = -1;
  
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    let score = 0;
    
    for (const cell of row) {
      if (typeof cell === 'string') {
        const lower = cell.toLowerCase().trim();
        
        // Score for product column (case insensitive, allows spaces)
        if (lower.includes('product') || lower.includes('item') || lower.includes('code')) {
          score += 3;
        }
        
        // Score for description column
        if (lower.includes('description') || lower.includes('desc') || lower.includes('name')) {
          score += 2;
        }
        
        // Score for date columns (month abbreviations)
        if (/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*[-/]\s*\d{2,4}/i.test(lower)) {
          score += 1;
        }
      }
    }
    
    if (score > maxScore) {
      maxScore = score;
      headerRowIndex = i;
    }
  }
  
  if (headerRowIndex === -1 || maxScore < 2) {
    logger.error('Could not identify header row', { 
      headerRowIndex, 
      maxScore,
      firstRows: data.slice(0, 3) 
    });
    throw createError('Could not identify header row in Excel file. Please ensure the file has "Product" and date columns.', 400);
  }
  
  const headers = data[headerRowIndex];
  const dataRows = data.slice(headerRowIndex + 1);
  
  // DEBUG: Log headers found
  logger.info('Detected headers:', headers);

  // 2. Clear existing data from the `forecasts` table
  logger.info('Deleting existing forecast records...');
  const { error: deleteError } = await supabase.from('forecasts').delete().neq('id', 0);
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
  
  // FIXED: More flexible product column detection
  const codeHeader = headers.find(h => 
    h && typeof h === 'string' && 
    h.toLowerCase().trim().includes('product')
  );
  
  const descHeader = headers.find(h => 
    h && typeof h === 'string' && 
    (h.toLowerCase().trim().includes('description') || h.toLowerCase().trim().includes('desc'))
  );
  
  if (!codeHeader) {
    logger.error('No product column found in headers:', headers);
    throw createError("Could not find a 'Product' column in the file. Please ensure the header row is correct.", 400);
  }

  // Process each data row
  for (const row of dataRows) {
    const rowData: { [key: string]: any } = {};
    headers.forEach((header, i) => { 
      rowData[header] = row[i]; 
    });
    
    const productCode = rowData[codeHeader]?.toString().trim();
    const description = descHeader ? (rowData[descHeader]?.toString().trim() || '') : '';
    
    // Skip empty rows
    if (!productCode || productCode === '' || productCode.toLowerCase() === 'total') {
      continue;
    }
    
    // Process each date column
    headers.forEach(header => {
      if (header && typeof header === 'string') {
        const headerStr = header.toString().trim();
        
        // FIXED: More flexible date pattern matching
        const dateMatch = headerStr.match(/^([a-z]{3})[a-z]*\s*[-\s/]\s*(\d{2,4})$/i);
        
        if (dateMatch) {
          const monthStr = dateMatch[1].toLowerCase();
          const yearStr = dateMatch[2];
          
          // Month mapping
          const monthMap: { [key: string]: number } = {
            'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
            'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
          };
          
          const month = monthMap[monthStr];
          if (month === undefined) return;
          
          // Parse year
          let year = parseInt(yearStr);
          if (yearStr.length === 2) {
            year = 2000 + year;
          }
          
          const quantity = parseInt(rowData[header], 10);
          if (!isNaN(quantity)) {
            const forecastDate = new Date(year, month, 1).toISOString().split('T')[0];
            
            forecastsToInsert.push({
              product_code: productCode,
              description: description,
              forecast_date: forecastDate,
              quantity: quantity
            });
          }
        }
      }
    });
  }
  
  // 4. Insert all new forecast data
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
    message: `Forecast data imported successfully. ${forecastsToInsert.length} forecast entries created.`,
    debug: {
      headersFound: headers,
      productColumn: codeHeader,
      descriptionColumn: descHeader || 'Not found'
    }
  });
});

// BLOCK 3: `getForecasts` Controller (FIXED TYPE ERRORS)
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
    data.forEach((item: any) => {
      const { product_code, description } = item;
      const dateKey = item.forecast_date.substring(0, 7);
      if (!productData[product_code]) {
        productData[product_code] = { product_code, description };
      }
      productData[product_code][dateKey] = item.quantity;
    });
    const rows = Object.values(productData);
    
    // (The rest of the function for generating headers and summary remains the same)
    const dateHeaders = [...new Set(data.map((item: any) => item.forecast_date.substring(0, 7)))].sort();
    const staticHeaders = [{ key: 'product_code', label: 'Product Code' }, { key: 'description', label: 'Description' }];
    const dynamicHeaders = dateHeaders.map(dateKey => {
      const [year, month] = dateKey.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      const label = date.toLocaleString('default', { month: 'short' }) + '-' + year.substring(2);
      return { key: dateKey, label: label };
    });
    const headers = [...staticHeaders, ...dynamicHeaders];
    const totalQuantity = data.reduce((sum: number, item: any) => sum + item.quantity, 0);
    const summary = {
      totalProducts: rows.length,
      totalQuantity: totalQuantity,
      dateRange: dateHeaders.length > 0 ? `${dateHeaders[0]} to ${dateHeaders[dateHeaders.length - 1]}` : 'No data'
    };

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
