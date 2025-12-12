// src/controllers/forecast.controller.ts

// BLOCK 1: Imports
import { Request, Response } from 'express';
import xlsx from 'xlsx';
import { supabase } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import logger from '../utils/logger';
import { createError } from '../middleware/errorHandler';


// BLOCK 2: `uploadForecasts` Controller
export const uploadForecasts = asyncHandler(async (req: Request, res: Response) => {
  // DEBUG LOGGING - ADDED AT START
  console.log('=== UPLOAD FORECAST DEBUG START ===');
  console.log('Request received at:', new Date().toISOString());
  console.log('Has file:', !!req.file);
  if (req.file) {
    console.log('File name:', req.file.originalname);
    console.log('File size:', req.file.size);
    console.log('File mimetype:', req.file.mimetype);
    console.log('File buffer length:', req.file.buffer?.length);
  }
  console.log('Body keys:', Object.keys(req.body));
  console.log('Body data exists:', !!req.body.data);
  if (req.body.data) {
    console.log('Body data type:', typeof req.body.data);
    console.log('Body data first 100 chars:', req.body.data.substring(0, 100));
  }
  console.log('Content-Type header:', req.headers['content-type']);
  console.log('=== UPLOAD FORECAST DEBUG END ===');

  // Log what we receive
  logger.info('Upload request received:', {
    hasFile: !!req.file,
    fileInfo: req.file ? {
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    } : null,
    bodyKeys: Object.keys(req.body),
    contentType: req.headers['content-type']
  });

  let jsonData: any[] = [];
  
  // OPTION 1: Process if frontend sent JSON in FormData
  if (req.body.data) {
    try {
      jsonData = JSON.parse(req.body.data);
      logger.info('Received JSON data from frontend, records:', jsonData.length);
      
      // Process JSON data instead of Excel file
      if (jsonData.length > 0) {
        const result = await processJsonForecastData(jsonData);
        return res.status(201).json(result);
      }
    } catch (error) {
      logger.error('Failed to parse JSON data from FormData:', error);
      // Fall through to file processing
    }
  }
  
  // OPTION 2: Process Excel file (original logic)
  if (!req.file) {
    throw createError('No file uploaded.', 400);
  }

  // 1. Read and parse the Excel file
  const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data: any[][] = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

  // DEBUG: Log first few rows to see actual data
  logger.info('Excel raw data first 3 rows:', data.slice(0, 3));

  // Find header row
  let headerRowIndex = -1;
  let maxScore = -1;
  
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    let score = 0;
    
    for (const cell of row) {
      if (typeof cell === 'string') {
        const lower = cell.toLowerCase().trim();
        
        // Score for product column
        if (lower === 'product' || lower.includes('product')) {
          score += 3;
        }
        
        // Score for description column
        if (lower === 'description' || lower.includes('description')) {
          score += 2;
        }
        
        // Score for date columns
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
  
  // Find product column (exact match first, then contains)
  const codeHeader = headers.find(h => 
    h && typeof h === 'string' && h.toLowerCase().trim() === 'product'
  ) || headers.find(h => 
    h && typeof h === 'string' && h.toLowerCase().trim().includes('product')
  );
  
  const descHeader = headers.find(h => 
    h && typeof h === 'string' && h.toLowerCase().trim() === 'description'
  ) || headers.find(h => 
    h && typeof h === 'string' && h.toLowerCase().trim().includes('description')
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
        
        // Date pattern matching
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
      descriptionColumn: descHeader || 'Not found',
      source: 'excel-file'
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
