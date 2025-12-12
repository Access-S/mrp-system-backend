// src/controllers/forecast.controller.ts

// BLOCK 1: Imports
import { Request, Response } from 'express';
import xlsx from 'xlsx';
import { supabase } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import logger from '../utils/logger';
import { createError } from '../middleware/errorHandler';


// BLOCK 2: `uploadForecasts` Controller
// ADD HELPER FUNCTION FIRST
async function processJsonForecastData(jsonData: any[]): Promise<any> {
  logger.info('Processing JSON forecast data:', { recordCount: jsonData.length });
  
  if (!jsonData || jsonData.length === 0) {
    throw createError('No data found in JSON.', 400);
  }

  const firstRow = jsonData[0];
  const headers = Object.keys(firstRow);
  
  logger.info('JSON headers:', headers);
  
  const productCodeHeader = headers.find(h => h.toLowerCase().trim() === 'product');
  const descriptionHeader = headers.find(h => h.toLowerCase().trim() === 'description');
  
  if (!productCodeHeader) {
    throw createError("Could not find a 'Product' column in the data.", 400);
  }
  
  // Clear existing data
  logger.info('Deleting existing forecast records...');
  const { error: deleteError } = await supabase.from('forecasts').delete().neq('id', 0);
  if (deleteError) {
    logger.error('Supabase error deleting old forecasts', { error: deleteError });
    throw createError('Failed to clear old forecast data.', 500);
  }
  
  const forecastsToInsert: { 
    product_code: string; 
    description: string; 
    forecast_date: string; 
    quantity: number 
  }[] = [];
  
  // Process each JSON row
  for (const row of jsonData) {
    const productCode = row[productCodeHeader]?.toString().trim();
    const description = descriptionHeader ? (row[descriptionHeader]?.toString().trim() || '') : '';
    
    if (!productCode || productCode === '') continue;
    
    // Process each header that looks like a date
    headers.forEach(header => {
      if (header !== productCodeHeader && header !== descriptionHeader) {
        const headerStr = header.trim();
        const dateMatch = headerStr.match(/^([a-z]{3})[a-z]*\s*[-\s/]\s*(\d{2,4})$/i);
        
        if (dateMatch) {
          const monthStr = dateMatch[1].toLowerCase();
          const yearStr = dateMatch[2];
          
          const monthMap: { [key: string]: number } = {
            'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
            'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
          };
          
          const month = monthMap[monthStr];
          if (month === undefined) return;
          
          let year = parseInt(yearStr);
          if (yearStr.length === 2) {
            year = 2000 + year;
          }
          
          const quantity = parseInt(row[header], 10);
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
  
  // Insert data
  logger.info(`Inserting ${forecastsToInsert.length} new forecast records from JSON...`);
  if (forecastsToInsert.length > 0) {
    const { error: forecastError } = await supabase.from('forecasts').insert(forecastsToInsert);
    if (forecastError) {
      logger.error('Supabase error inserting new forecasts', { error: forecastError });
      throw createError('Failed to insert new forecast data.', 500);
    }
  }
  
  return {
    success: true,
    message: `Forecast data imported successfully. ${forecastsToInsert.length} forecast entries created.`,
    debug: {
      source: 'json-data',
      productColumn: productCodeHeader,
      descriptionColumn: descriptionHeader || 'Not found'
    }
  };
}

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
