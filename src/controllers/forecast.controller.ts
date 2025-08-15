import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import multer from 'multer';
import * as XLSX from 'xlsx';

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Helper function to parse month header
const parseMonthHeader = (header: string): string | null => {
  if (typeof header !== "string") return null;
  const parts = header.trim().split("-");
  if (parts.length !== 2) return null;

  const monthMap: { [key: string]: string } = {
    jan: "01", feb: "02", mar: "03", apr: "04",
    may: "05", jun: "06", jul: "07", aug: "08",
    sep: "09", oct: "10", nov: "11", dec: "12",
  };

  const month = monthMap[parts[0].toLowerCase()];
  const yearPart = parts[1];
  const year = yearPart.length === 2 ? `20${yearPart}` : yearPart;

  if (!month || isNaN(parseInt(year))) return null;
  return `${year}-${month}`;
};

// Get all forecasts
export const getAllForecasts = asyncHandler(async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('forecasts')
    .select('*')
    .order('product_code', { ascending: true });

  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Failed to fetch forecasts',
      error: error.message
    });
  }

  res.json({
    success: true,
    data: data || []
  });
});

// Get forecast by product code
export const getForecastByProductCode = asyncHandler(async (req: Request, res: Response) => {
  const { productCode } = req.params;

  if (!productCode) {
    return res.status(400).json({
      success: false,
      message: 'Product code is required'
    });
  }

  const { data, error } = await supabase
    .from('forecasts')
    .select('*')
    .eq('product_code', productCode)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return res.status(404).json({
        success: false,
        message: 'Forecast not found'
      });
    }
    return res.status(400).json({
      success: false,
      message: 'Failed to fetch forecast',
      error: error.message
    });
  }

  res.json({
    success: true,
    data
  });
});

// Get forecast by month
export const getForecastByMonth = asyncHandler(async (req: Request, res: Response) => {
  const { month } = req.params;

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({
      success: false,
      message: 'Month must be in YYYY-MM format'
    });
  }

  const { data, error } = await supabase
    .from('forecasts')
    .select('product_code, description, monthly_forecast')
    .not('monthly_forecast', 'is', null);

  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Failed to fetch forecasts',
      error: error.message
    });
  }

  const monthlyData = (data || [])
    .map(item => ({
      productCode: item.product_code,
      description: item.description || 'N/A',
      forecast: item.monthly_forecast?.[month] || 0
    }))
    .filter(item => item.forecast > 0)
    .sort((a, b) => b.forecast - a.forecast);

  res.json({
    success: true,
    data: monthlyData
  });
});

// Update forecast
export const updateForecast = asyncHandler(async (req: Request, res: Response) => {
  const { productCode } = req.params;
  const { month, forecast } = req.body;

  if (!productCode || !month || forecast < 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid parameters for forecast update'
    });
  }

  // Get existing forecast
  const { data: existing, error: fetchError } = await supabase
    .from('forecasts')
    .select('monthly_forecast')
    .eq('product_code', productCode)
    .single();

  let monthlyForecast = existing?.monthly_forecast || {};
  monthlyForecast[month] = forecast;

  const { data, error } = await supabase
    .from('forecasts')
    .upsert({
      product_code: productCode,
      monthly_forecast: monthlyForecast,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'product_code'
    })
    .select()
    .single();

  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Failed to update forecast',
      error: error.message
    });
  }

  res.json({
    success: true,
    data
  });
});

// Get forecast summary
export const getForecastSummary = asyncHandler(async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('forecasts')
    .select('product_code, monthly_forecast');

  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Failed to fetch forecast summary',
      error: error.message
    });
  }

  let totalForecast = 0;
  let totalEntries = 0;
  const productTotals: { [key: string]: number } = {};
  const monthsSet = new Set<string>();

  (data || []).forEach(item => {
    const monthlyForecast = item.monthly_forecast || {};
    let productTotal = 0;

    Object.entries(monthlyForecast).forEach(([month, value]) => {
      const forecastValue = Number(value) || 0;
      totalForecast += forecastValue;
      productTotal += forecastValue;
      totalEntries++;
      monthsSet.add(month);
    });

    if (productTotal > 0) {
      productTotals[item.product_code] = productTotal;
    }
  });

  const topProducts = Object.entries(productTotals)
    .map(([productCode, totalForecast]) => ({ productCode, totalForecast }))
    .sort((a, b) => b.totalForecast - a.totalForecast)
    .slice(0, 10);

  const summary = {
    totalProducts: Object.keys(productTotals).length,
    totalMonths: monthsSet.size,
    avgForecast: totalEntries > 0 ? Math.round((totalForecast / totalEntries) * 100) / 100 : 0,
    topProducts
  };

  res.json({
    success: true,
    data: summary
  });
});

// Search forecasts
export const searchForecasts = asyncHandler(async (req: Request, res: Response) => {
  const { q: searchTerm, limit = 50 } = req.query;

  if (!searchTerm || typeof searchTerm !== 'string' || searchTerm.trim().length < 2) {
    return res.status(400).json({
      success: false,
      message: 'Search term must be at least 2 characters'
    });
  }

  const { data, error } = await supabase
    .from('forecasts')
    .select('*')
    .or(`product_code.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
    .order('product_code', { ascending: true })
    .limit(Number(limit));

  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Failed to search forecasts',
      error: error.message
    });
  }

  res.json({
    success: true,
    data: data || []
  });
});

// Import forecast data from Excel
export const importForecastData = [
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    try {
      const workbook = XLSX.read(req.file.buffer, { cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];

      const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
      range.s.r = 1; // Start from second row

      const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,
        dateNF: "mmm-yy",
        range: range,
      });

      if (!jsonData || jsonData.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No data found in the Excel file after the header row."
        });
      }

      const headers = Object.keys(jsonData[0]);
      const productCodeHeader = headers.find(h => h.toLowerCase().trim() === "product");
      const descriptionHeader = headers.find(h => h.toLowerCase().trim() === "description");

      if (!productCodeHeader) {
        return res.status(400).json({
          success: false,
          message: "Could not find a 'Product' column in the file."
        });
      }

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];
      const batchSize = 50;

      for (let i = 0; i < jsonData.length; i += batchSize) {
        const batch = jsonData.slice(i, i + batchSize);
        const validRecords: any[] = [];

        batch.forEach((row, index) => {
          try {
            const productCode = row[productCodeHeader];
            if (!productCode || String(productCode).trim() === "") {
              errorCount++;
              errors.push(`Row ${i + index + 2}: Missing product code`);
              return;
            }

            const description = descriptionHeader ? row[descriptionHeader] : "N/A";
            const monthlyForecast: { [key: string]: number } = {};

            for (const key in row) {
              const formattedMonth = parseMonthHeader(key);
              if (formattedMonth) {
                const value = Number(row[key]) || 0;
                monthlyForecast[formattedMonth] = value;
              }
            }

            validRecords.push({
              product_code: String(productCode).trim(),
              description: String(description),
              monthly_forecast: monthlyForecast,
              updated_at: new Date().toISOString()
            });

          } catch (error) {
            errorCount++;
            errors.push(`Row ${i + index + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        });

        if (validRecords.length > 0) {
          const { error } = await supabase
            .from('forecasts')
            .upsert(validRecords, { 
              onConflict: 'product_code',
              ignoreDuplicates: false 
            });

          if (error) {
            errorCount += validRecords.length;
            errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
          } else {
            successCount += validRecords.length;
          }
        }
      }

      res.json({
        success: true,
        data: {
          successCount,
          errorCount,
          errors: errors.slice(0, 10)
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to process Excel file',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  })
];

// Delete all forecasts
export const deleteAllForecasts = asyncHandler(async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('forecasts')
    .delete()
    .neq('id', 0); // This deletes all records

  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Failed to delete forecasts',
      error: error.message
    });
  }

  res.json({
    success: true,
    message: 'All forecast data deleted successfully',
    deletedCount: data?.length || 0
  });
});