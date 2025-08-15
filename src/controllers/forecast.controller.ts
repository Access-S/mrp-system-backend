// BLOCK 1: Imports
import { Request, Response } from 'express';
import xlsx from 'xlsx';
import { supabase } from '../config/supabase'; // Assuming you export your client from here
import { asyncHandler } from '../utils/asyncHandler'; // Assuming you have this utility

// BLOCK 2: `uploadForecasts` Controller Function
export const uploadForecasts = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded.' });
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
    
    // A header row should be dense and have many date-like columns
    const score = (density * 2) + datePatternMatch; 

    if (score > maxScore) {
      maxScore = score;
      headerRowIndex = i;
    }
  }

  if (headerRowIndex === -1) {
    return res.status(400).json({ message: 'Could not determine header row in the file.' });
  }

  const headers = data[headerRowIndex];
  const dataRows = data.slice(headerRowIndex + 1);

  // 3. Clear existing data from the `forecasts` table
  console.log('Deleting existing forecast records...');
  const { error: deleteError } = await supabase.from('forecasts').delete().neq('id', 0);
  if (deleteError) throw deleteError;
  
  // 4. Prepare product data for upsert
  const productsToUpsert: { product_code: string; description?: string }[] = [];
  const codeToRowMap = new Map<string, any[]>();

  const codeHeader = headers.find(h => h && h.toLowerCase().includes('product'));
  const descHeader = headers.find(h => h && h.toLowerCase().includes('description'));
  
  if (!codeHeader) {
    return res.status(400).json({ message: "A column with 'Product' in the name is required." });
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

  console.log(`Upserting ${productsToUpsert.length} products...`);
  const { data: upsertedProducts, error: productError } = await supabase
    .from('products')
    .upsert(productsToUpsert, { onConflict: 'product_code' })
    .select('id, product_code');

  if (productError) throw productError;

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
  
  console.log(`Inserting ${forecastsToInsert.length} forecast records...`);
  if (forecastsToInsert.length > 0) {
    const { error: forecastError } = await supabase.from('forecasts').insert(forecastsToInsert);
    if (forecastError) throw forecastError;
  }

  res.status(201).json({ 
    message: `Forecast data imported successfully. ${upsertedProducts.length} products processed, ${forecastsToInsert.length} forecast entries created.` 
  });
});

// BLOCK 3: `getForecasts` Controller Function
export const getForecasts = asyncHandler(async (req: Request, res: Response) => {
  const { months, search } = req.query;

  // 1. Build the base query
  let query = supabase
    .from('forecasts')
    .select(`
      quantity,
      forecast_date,
      products ( id, product_code, description )
    `)
    .order('forecast_date', { ascending: true });

  // 2. Apply date filtering
  if (months && months !== 'all') {
    const numMonths = parseInt(months as string, 10);
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const endDate = new Date(today.getFullYear(), today.getMonth() + numMonths, 0).toISOString().split('T')[0];
    
    query = query.gte('forecast_date', startDate);
    query = query.lte('forecast_date', endDate);
  }

  // 3. Apply search filtering on the related product's description
  if (search) {
    query = query.ilike('products.description', `%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  // 4. Pivot the "long" data from the DB into "wide" format for the UI
  const productData: { [key: string]: any } = {};
  data.forEach(item => {
    if (!item.products) return; 

    const { product_code, description } = item.products;
    const dateKey = item.forecast_date.substring(0, 7); // "YYYY-MM" format

    if (!productData[product_code]) {
      productData[product_code] = { product_code, description };
    }
    productData[product_code][dateKey] = item.quantity;
  });

  const rows = Object.values(productData);
  
  // 5. Generate dynamic headers for the UI table
  const dateHeaders = [...new Set(data.map(item => item.forecast_date.substring(0, 7)))].sort();

  const staticHeaders = [
    { key: 'product_code', label: 'Product Code' },
    { key: 'description', label: 'Description' },
  ];
  const dynamicHeaders = dateHeaders.map(dateKey => {
    const [year, month] = dateKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    const label = date.toLocaleString('default', { month: 'short' }) + '-' + year.substring(2);
    return { key: dateKey, label: label };
  });
  const headers = [...staticHeaders, ...dynamicHeaders];

  // 6. Calculate summary statistics
  const totalQuantity = data.reduce((sum, item) => sum + item.quantity, 0);
  const summary = {
    totalProducts: rows.length,
    totalMonths: dateHeaders.length, // Months in the current view
    avgForecast: data.length > 0 ? totalQuantity / data.length : 0,
    topProduct: "N/A" // Placeholder - requires a more complex query
  };

  // 7. Send the final, structured response
  res.status(200).json({
    summary,
    tableData: {
      headers,
      rows
    }
  });
});