// src/controllers/soh.controller.ts

// ============== BLOCK 1: Imports ==============
import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import logger from '../utils/logger';
import { createError } from '../middleware/errorHandler';
import * as XLSX from 'xlsx';

// ============== BLOCK 2: Types & Interfaces ==============
interface ColumnMapping {
  partCode: number | null;
  description: number | null;
  stockOnHand: number | null;
}

interface SohRecord {
  part_code: string;
  description: string;
  stock_on_hand: number;
  import_batch_id: string;
  import_source: string;
  is_active: boolean;
}

// ============== BLOCK 3: Auto-Detect Column Mapping ==============
const autoDetectColumns = (headers: string[]): ColumnMapping => {
  const mapping: ColumnMapping = {
    partCode: null,
    description: null,
    stockOnHand: null
  };

  headers.forEach((header, index) => {
    const normalizedHeader = header.toLowerCase().trim();

    // Part Code detection
    if (
      normalizedHeader.includes('product') ||
      normalizedHeader.includes('sku') ||
      normalizedHeader.includes('item') ||
      normalizedHeader === 'id' ||
      normalizedHeader === 'code'
    ) {
      if (mapping.partCode === null) {
        mapping.partCode = index;
      }
    }

    // Description detection
    if (
      normalizedHeader.includes('description') ||
      normalizedHeader.includes('desc') ||
      normalizedHeader.includes('name')
    ) {
      if (mapping.description === null) {
        mapping.description = index;
      }
    }

    // Stock on Hand detection
    if (
      normalizedHeader.includes('stock') ||
      normalizedHeader.includes('soh') ||
      normalizedHeader.includes('qty') ||
      normalizedHeader.includes('quantity') ||
      normalizedHeader.includes('on hand') ||
      normalizedHeader.includes('onhand') ||
      normalizedHeader.includes('available')
    ) {
      if (mapping.stockOnHand === null) {
        mapping.stockOnHand = index;
      }
    }
  });

  return mapping;
};

// ============== BLOCK 4: Process SOH Data ==============
const processSohData = async (
  jsonData: any[][],
  headers: string[],
  mapping: ColumnMapping,
  importBatchId: string,
  filename: string
): Promise<{
  success: boolean;
  message: string;
  imported: number;
  skipped: number;
  archived: number;
}> => {
  const startTime = Date.now();
  logger.info('Processing SOH data', { recordCount: jsonData.length, importBatchId });

  // Validate required columns detected
  if (mapping.partCode === null) {
    throw createError('Could not detect Part Code column. Expected headers containing: product, sku, item, id, code', 400);
  }

  if (mapping.stockOnHand === null) {
    throw createError('Could not detect Stock on Hand column. Expected headers containing: stock, soh, qty, quantity, on hand, available', 400);
  }

  logger.info('Column mapping detected', {
    partCode: headers[mapping.partCode],
    description: mapping.description !== null ? headers[mapping.description] : 'Not found',
    stockOnHand: headers[mapping.stockOnHand!]
  });

  // Step 1: Archive all existing active records
  const { data: archivedData, error: archiveError } = await supabase
    .from('soh')
    .update({
      is_active: false,
      archived_at: new Date().toISOString()
    })
    .eq('is_active', true)
    .select('id');

  if (archiveError) {
    logger.warn('Error archiving existing SOH records (non-fatal)', { error: archiveError.message });
  }

  const archivedCount = archivedData?.length || 0;
  logger.info(`Archived ${archivedCount} existing SOH records`);

  // Step 2: Prepare new records
  const recordsToInsert: SohRecord[] = [];
  let skippedCount = 0;

  for (let i = 0; i < jsonData.length; i++) {
    const row = jsonData[i];

    // Get part code
    const partCode = row[mapping.partCode!]?.toString().trim();

    // Skip empty rows
    if (!partCode || partCode === '') {
      skippedCount++;
      continue;
    }

    // Get description (optional)
    const description = mapping.description !== null
      ? row[mapping.description]?.toString().trim() || ''
      : '';

    // Get stock on hand
    const stockValue = row[mapping.stockOnHand!];
    const stockOnHand = parseFloat(stockValue) || 0;

    recordsToInsert.push({
      part_code: partCode,
      description: description,
      stock_on_hand: stockOnHand,
      import_batch_id: importBatchId,
      import_source: filename,
      is_active: true
    });
  }

  logger.info('Records prepared for insertion', {
    total: recordsToInsert.length,
    skipped: skippedCount
  });

  // Step 3: Insert in chunks
  const CHUNK_SIZE = 500;
  let insertedCount = 0;

  for (let i = 0; i < recordsToInsert.length; i += CHUNK_SIZE) {
    const chunk = recordsToInsert.slice(i, i + CHUNK_SIZE);

    const { error: insertError } = await supabase
      .from('soh')
      .insert(chunk);

    if (insertError) {
      logger.error('Error inserting SOH chunk', {
        chunkIndex: Math.floor(i / CHUNK_SIZE),
        error: insertError.message
      });
      throw createError(`Failed to insert SOH data: ${insertError.message}`, 500);
    }

    insertedCount += chunk.length;
  }

  const duration = Date.now() - startTime;
  logger.info('SOH import complete', {
    insertedRecords: insertedCount,
    skippedRecords: skippedCount,
    archivedRecords: archivedCount,
    durationMs: duration
  });

  return {
    success: true,
    message: `Imported ${insertedCount} SOH records. Archived ${archivedCount} previous records.`,
    imported: insertedCount,
    skipped: skippedCount,
    archived: archivedCount
  };
};

// ============== BLOCK 5: Upload Controller ==============
export const uploadSoh = asyncHandler(async (req: Request, res: Response) => {
  logger.info('SOH upload request received', {
    hasFile: !!req.file,
    filename: req.file?.originalname
  });

  if (!req.file) {
    throw createError('No file uploaded.', 400);
  }

  // Parse Excel file
  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convert to JSON (array of arrays)
  const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: true,
    defval: null
  });

  if (rawData.length < 2) {
    throw createError('Excel file must contain at least a header row and one data row.', 400);
  }

  // Extract headers and data
  const headers = rawData[0].map((h: any) => String(h || '').trim());
  const dataRows = rawData.slice(1).filter(row =>
    row.some(cell => cell !== null && cell !== '')
  );

  logger.info('Excel file parsed', {
    filename: req.file.originalname,
    headers: headers,
    totalRows: dataRows.length
  });

  // Auto-detect column mapping
  const mapping = autoDetectColumns(headers);

  // Generate batch ID
  const importBatchId = crypto.randomUUID();

  // Process and import data
  const result = await processSohData(
    dataRows,
    headers,
    mapping,
    importBatchId,
    req.file.originalname
  );

  return res.status(201).json({
    success: true,
    message: result.message,
    data: {
      imported: result.imported,
      skipped: result.skipped,
      archived: result.archived,
      import_batch_id: importBatchId,
      detected_columns: {
        part_code: mapping.partCode !== null ? headers[mapping.partCode] : null,
        description: mapping.description !== null ? headers[mapping.description] : null,
        stock_on_hand: mapping.stockOnHand !== null ? headers[mapping.stockOnHand] : null
      }
    }
  });
});

// ============== BLOCK 6: Get SOH Controller ==============
export const getSoh = asyncHandler(async (req: Request, res: Response) => {
  const { search, include_inactive } = req.query;
  const includeInactive = include_inactive === 'true';

  logger.info('Fetching SOH records', { search, include_inactive: includeInactive });

  let query = supabase
    .from('soh')
    .select('id, part_code, description, stock_on_hand, import_batch_id, import_source, created_at, is_active')
    .order('part_code', { ascending: true });

  // Filter by active status
  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  // Search filter
  if (search && typeof search === 'string' && search.trim()) {
    query = query.or(`part_code.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%`);
  }

  const { data: sohData, error } = await query;

  if (error) {
    logger.error('Supabase error fetching SOH', { error });
    throw createError('Failed to fetch SOH records', 500);
  }

  // Fetch parts data for stock value calculation
  const partCodes = sohData?.map(item => item.part_code).filter(code => code) || [];
  let partsMap = new Map<string, { unit_cost: number }>();

  if (partCodes.length > 0) {
    const { data: partsData } = await supabase
      .from('parts')
      .select('part_code, unit_cost')
      .in('part_code', partCodes);

    if (partsData) {
      partsData.forEach(part => {
        partsMap.set(part.part_code, { unit_cost: part.unit_cost || 0 });
      });
    }
  }

  // Add stock_value to each record
  const enrichedRecords = sohData?.map(record => {
    const part = partsMap.get(record.part_code);
    const unitCost = part?.unit_cost || 0;
    const stockValue = record.stock_on_hand * unitCost;

    return {
      ...record,
      stock_value: stockValue
    };
  }) || [];

  // Calculate summary
  const totalRecords = enrichedRecords.length;
  const totalStock = enrichedRecords.reduce((sum, item) => sum + (item.stock_on_hand || 0), 0);
  const totalStockValue = enrichedRecords.reduce((sum, item) => sum + (item.stock_value || 0), 0);
  const zeroStockCount = enrichedRecords.filter(item => item.stock_on_hand === 0).length;

  logger.info('Successfully fetched SOH records', { count: totalRecords });

  return res.status(200).json({
    success: true,
    summary: {
      totalRecords,
      totalStock,
      totalStockValue,
      zeroStockCount
    },
    data: enrichedRecords
  });
});