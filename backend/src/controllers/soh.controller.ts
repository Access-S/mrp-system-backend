// BLOCK 1: Imports and Dependencies
import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import logger from '../utils/logger';
import { createError } from '../middleware/errorHandler';
import * as XLSX from 'xlsx';

// BLOCK 2: Get All SOH Records Controller
export const getAllSoh = async (req: Request, res: Response) => {
  try {
    logger.info('Fetching all SOH records');
    
    const { data, error } = await supabase
      .from('soh')
      .select('*')
      .order('product_id', { ascending: true });

    if (error) {
      logger.error('Supabase error fetching SOH', { error });
      throw createError('Failed to fetch SOH records from database', 500);
    }
    
    logger.info(`Successfully fetched ${data?.length || 0} SOH records`);
    
    res.status(200).json({
      success: true,
      data,
      count: data?.length || 0
    });
  } catch (error: any) {
    logger.error('Error in getAllSoh', { error: error.message });
    res.status(error.statusCode || 500).json({ 
      success: false,
      message: error.message || "Failed to fetch SOH records"
    });
  }
};

// BLOCK 3: Analyze Excel Headers Controller
export const analyzeExcelHeaders = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      throw createError('No file uploaded', 400);
    }

    logger.info('Analyzing Excel file headers', { filename: req.file.originalname });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Get the range and extract headers from first row
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    const headers: string[] = [];
    
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      const cell = worksheet[cellAddress];
      if (cell && cell.v) {
        headers.push(String(cell.v).trim());
      }
    }

    // Get sample data from first few rows
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1,
      range: 0,
      defval: null
    });

    const sampleData = jsonData.slice(1, 6); // Get first 5 data rows

    logger.info(`Excel analysis complete: ${headers.length} headers found`);

    res.status(200).json({
      success: true,
      data: {
        headers,
        sampleData,
        totalRows: jsonData.length - 1, // Exclude header row
        filename: req.file.originalname
      }
    });

  } catch (error: any) {
    logger.error('Error analyzing Excel headers', { error: error.message });
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to analyze Excel file'
    });
  }
};

// BLOCK 4: Import SOH Data Controller (Simplified)
export const importSohData = async (req: Request, res: Response) => {
  try {
    const { selectedColumns, replaceExisting = false } = req.body;
    
    if (!req.file) {
      throw createError('No file uploaded', 400);
    }

    if (!selectedColumns || !Array.isArray(selectedColumns) || selectedColumns.length === 0) {
      throw createError('No columns selected for import', 400);
    }

    logger.info('Starting SOH import', { 
      filename: req.file.originalname,
      selectedColumns,
      replaceExisting 
    });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1,
      defval: null
    });

    if (jsonData.length < 2) {
      throw createError('Excel file must contain at least a header row and one data row', 400);
    }

    const headers = jsonData[0] as string[];
    const dataRows = jsonData.slice(1);

    logger.info('Excel data parsed', {
      totalHeaders: headers.length,
      totalDataRows: dataRows.length,
      excelHeaders: headers
    });

    // Map selected columns to their indices
    const columnMapping: { [key: string]: number } = {};
    selectedColumns.forEach((colName: string) => {
      const index = headers.findIndex(h => h === colName);
      if (index !== -1) {
        columnMapping[colName] = index;
      }
    });

    logger.info('Column mapping created', { columnMapping });

    // Clean column names for database (remove spaces, special chars)
    const cleanColumnNames: { [key: string]: string } = {};
    selectedColumns.forEach((colName: string) => {
      cleanColumnNames[colName] = colName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
    });

    logger.info('Clean column names generated', { cleanColumnNames });

    // Predefined columns that should exist
    const predefinedColumns = [
      'product_id', 'description', 'stock_on_hand', 
      'default_uom', 'locations', 'ean', 'weight_kg', 'volume_m3'
    ];

    // Check if all selected columns are supported
    const unsupportedColumns = Object.values(cleanColumnNames).filter(
      cleanCol => !predefinedColumns.includes(cleanCol)
    );

    if (unsupportedColumns.length > 0) {
      logger.warn('Unsupported columns detected', { unsupportedColumns });
      throw createError(
        `Unsupported columns: ${unsupportedColumns.join(', ')}. Supported columns are: ${predefinedColumns.join(', ')}`,
        400
      );
    }

    logger.info('All columns are supported', { 
      selectedColumns: Object.values(cleanColumnNames),
      supportedColumns: predefinedColumns
    });

    // Clear existing data if replace mode
    if (replaceExisting) {
      const { error: deleteError } = await supabase
        .from('soh')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (deleteError) {
        logger.warn('Could not clear existing data', { error: deleteError });
      } else {
        logger.info('Existing data cleared successfully');
      }
    }

    // Import data
    const batchId = crypto.randomUUID();
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    logger.info('Starting data insertion', { batchId, totalRows: dataRows.length });

    // Process in batches
    const batchSize = 100;
    for (let i = 0; i < dataRows.length; i += batchSize) {
      const batch = dataRows.slice(i, i + batchSize);
      const insertData: any[] = [];

      batch.forEach((row, index) => {
        try {
          const record: any = {
            import_batch_id: batchId,
            import_source: req.file!.originalname
          };

          // Map selected columns to clean column names
          selectedColumns.forEach((originalCol: string) => {
            const cleanCol = cleanColumnNames[originalCol];
            const colIndex = columnMapping[originalCol];
            let value = (row as any[])[colIndex]; // <-- Fix: cast row to any[]

            // Handle empty/null values
            if (value === null || value === undefined || value === '') {
              // Set default values based on column type
              if (cleanCol.includes('stock') || cleanCol.includes('weight') || cleanCol.includes('volume')) {
                value = 0;
              } else {
                value = null;
              }
            }

            // Convert to appropriate type
            if (cleanCol.includes('stock') || cleanCol.includes('weight') || cleanCol.includes('volume')) {
              value = value === null ? 0 : Number(value) || 0;
            } else {
              value = value === null ? null : String(value);
            }

            // Special handling for product_id
            if (cleanCol === 'product_id' || originalCol.toLowerCase().includes('product')) {
              record.product_id = String(value || '');
            }

            record[cleanCol] = value;
          });

          insertData.push(record);
          
          // Log first record of first batch for debugging
          if (i === 0 && index === 0) {
            logger.info('Sample record', { 
              sampleRecord: record,
              recordKeys: Object.keys(record)
            });
          }
        } catch (error) {
          errorCount++;
          errors.push(`Row ${i + index + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      });

      // Insert batch
      if (insertData.length > 0) {
        logger.info(`Inserting batch ${Math.floor(i / batchSize) + 1}`, { 
          batchSize: insertData.length,
          startRow: i + 2
        });

        const { error: insertError } = await supabase
          .from('soh')
          .insert(insertData);

        if (insertError) {
          logger.error('Batch insert error', { 
            error: insertError, 
            batchStart: i,
            batchNumber: Math.floor(i / batchSize) + 1
          });
          errorCount += insertData.length;
          errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${insertError.message}`);
        } else {
          successCount += insertData.length;
          logger.info(`Batch ${Math.floor(i / batchSize) + 1} inserted successfully`);
        }
      }
    }

    logger.info(`SOH import completed`, { 
      successCount, 
      errorCount, 
      batchId,
      filename: req.file.originalname 
    });

    res.status(200).json({
      success: true,
      data: {
        successCount,
        errorCount,
        totalRows: dataRows.length,
        batchId,
        errors: errors.slice(0, 10),
        columnsImported: Object.keys(cleanColumnNames)
      },
      message: `Import completed: ${successCount} records imported, ${errorCount} errors. Imported columns: ${Object.keys(cleanColumnNames).join(', ')}`
    });

  } catch (error: any) {
    logger.error('Error in importSohData', { error: error.message });
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to import SOH data'
    });
  }
};
// BLOCK 5: Delete All SOH Data Controller
export const deleteAllSoh = async (req: Request, res: Response) => {
  try {
    logger.info('Deleting all SOH data');

    const { error } = await supabase
      .from('soh')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records

    if (error) {
      logger.error('Error deleting SOH data', { error });
      throw createError('Failed to delete SOH data', 500);
    }

    logger.info('All SOH data deleted successfully');

    res.status(200).json({
      success: true,
      message: 'All SOH data deleted successfully'
    });
  } catch (error: any) {
    logger.error('Error in deleteAllSoh', { error: error.message });
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to delete SOH data'
    });
  }
};

export const getSohSummary = async (req: Request, res: Response) => {
  try {
    logger.info('Fetching SOH summary');

    const { count, error } = await supabase
      .from('soh')
      .select('*', { count: 'exact', head: true });

    if (error) {
      throw createError('Failed to get SOH count', 500);
    }

    // Get latest import info
    const { data: latestImport, error: importError } = await supabase
      .from('soh')
      .select('import_batch_id, import_source, created_at')
      .order('created_at', { ascending: false })
      .limit(1);

    res.status(200).json({
      success: true,
      data: {
        totalRecords: count || 0,
        latestImport: latestImport?.[0] || null
      }
    });

  } catch (error: any) {
    logger.error('Error in getSohSummary', { error: error.message });
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to get SOH summary'
    });
  }
};